<?php

namespace App\Services\Campaign;

use App\Models\League;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

/** Outbound review links only. Never creates previews or authorizes settlement. */
class SlackReview
{
    public function configured(): bool
    {
        return config('campaign.enabled') && config('campaign.processing_enabled') && config('campaign_slack.enabled')
            && filled(config('campaign_slack.token'))
            && preg_match('/^T[A-Z0-9]+$/', config('campaign_slack.team_id') ?? '')
            && preg_match('/^[CG][A-Z0-9]+$/', config('campaign_slack.channel_id') ?? '')
            && filled(config('campaign_slack.league_id'))
            && parse_url(config('app.url'), PHP_URL_SCHEME) === 'https';
    }

    /** Read-only remote verification; no message is posted. */
    public function verifyWorkspace(): bool
    {
        try {
            $response = Http::withToken(config('campaign_slack.token'))->connectTimeout(5)->timeout(10)
                ->post('https://slack.com/api/auth.test');

            return $response->successful() && $response->json('ok') === true
                && $response->json('team_id') === config('campaign_slack.team_id')
                && filled($response->json('bot_id'));
        } catch (\Throwable) {
            return false;
        }
    }

    public function tick(): string
    {
        if (! $this->configured()) {
            return 'disabled_or_unconfigured';
        }

        return Cache::lock('campaign-slack-review', 120)->get(function () {
            $league = League::find(config('campaign_slack.league_id'));
            if (! $league) {
                return 'league_missing';
            }
            $destination = config('campaign_slack.team_id').':'.config('campaign_slack.channel_id');
            if (DB::table('campaign_slack_notices')->where('destination', $destination)->where('error_code', 'rate_limited')->where('available_at', '>', now())->exists()) {
                return 'rate_limited';
            }
            $subjects = [];
            $remember = function (string $subject, array $identity, array $payload) use ($destination, &$subjects) {
                $subjects[] = $subject;
                $fingerprint = hash('sha256', json_encode($identity));
                $existing = DB::table('campaign_slack_notices')->where(compact('destination', 'subject'))->first();
                if ($existing && $existing->fingerprint === $fingerprint && $existing->status !== 'obsolete') {
                    return;
                }
                DB::table('campaign_slack_notices')->updateOrInsert(compact('destination', 'subject'), [
                    'fingerprint' => $fingerprint, 'payload' => json_encode($payload), 'status' => 'pending',
                    'error_code' => null, 'slack_ts' => null, 'available_at' => now(), 'created_at' => now(), 'updated_at' => now(),
                ]);
            };
            foreach (DB::table('campaign_sources')->where('league_id', $league->id)->whereIn('kind', ['x', 'news'])->get() as $source) {
                $run = DB::table('campaign_monitor_runs')->where('source_id', $source->id)->latest('id')->first();
                $state = ! $run ? 'never_collected' : ($run->status !== 'ok' ? 'failed' : (now()->subMinutes(15)->gt($run->finished_at) ? 'stale' : 'ok'));
                $subject = 'source:'.$source->id;
                // A healthy source is silent until it recovers from a recorded incident.
                if ($state === 'ok' && ! DB::table('campaign_slack_notices')->where(compact('destination', 'subject'))->exists()) {
                    continue;
                }
                $remember($subject, [$state], $this->message($league, 'Source '.$state.': '.$source->name,
                    'Collection status only. A recovery does not repair earlier coverage gaps.', [$source->url]));
            }
            foreach (DB::table('campaign_markets')->where('league_id', $league->id)->where('season', config('campaign.season'))->whereNull('archived_at')->whereNull('action')->whereNotIn('state', ['resolved', 'void'])->get() as $market) {
                $contract = json_decode($market->contract, true);
                if (($contract['monitor']['mode'] ?? '') === 'x_count') {
                    continue; // Retained hidden launch drafts are not public review tasks.
                }
                if (isset($contract['monitor'])) {
                    $packet = app(Monitoring::class)->packet($league, $market);
                    if ($packet['status'] === 'waiting') {
                        continue;
                    }
                    $items = collect($packet['items'])->map(fn ($item) => [$item['id'], $item['hash'], $item['dismissed'], $item['url'], $item['metadata']])->all();
                    // An incomplete window should not send another notice for every new post.
                    $identity = [$packet['status'], $packet['status'] === 'incomplete' ? $packet['coverage'] : $items, $packet['observed'] ?? null];
                    $detail = $packet['message']."\nEvidence status: ".$packet['status'].'.';
                    if (isset($packet['observed'])) {
                        $detail .= ' Proposed observation: '.$packet['observed'].'.';
                    }
                    $links = [$packet['source_url'], ...array_column($packet['items'], 'url')];
                } else {
                    if (now()->lt($market->window_ends_at)) {
                        continue;
                    }
                    $identity = ['manual_review'];
                    $detail = 'Observation window ended. An operator must verify the evidence and outcome.';
                    $links = [$contract['source_url']];
                }
                $remember('market:'.$market->id, $identity, $this->message($league, $market->title, $detail, $links, $market->id));
            }
            // Discard unsent notices for markets already settled/archived or no longer actionable.
            DB::table('campaign_slack_notices')->where('destination', $destination)->whereNotIn('subject', $subjects)->where('status', 'pending')->update(['status' => 'obsolete', 'updated_at' => now()]);
            $notice = DB::table('campaign_slack_notices')->where('destination', $destination)->where('status', 'pending')->where('available_at', '<=', now())->orderBy('id')->first();
            if (! $notice) {
                return 'idle';
            }
            if (! $this->verifyWorkspace()) {
                return 'workspace_verification_failed';
            }

            return $this->deliver($notice);
        }) ?: 'locked';
    }

    private function message(League $league, string $title, string $detail, array $links, ?string $market = null): array
    {
        $url = rtrim(config('app.url'), '/').'/?'.http_build_query(['tab' => 'campaign', 'league' => $league->id, 'review' => $market ?? 'monitoring']);
        $text = 'Eisenmarkt · '.$title."\n".$detail."\nReview in Eisenmarkt. Payout/refund preview and approval require the authorized administrator. Slack cannot approve or settle bets.";
        $buttons = [['type' => 'button', 'text' => ['type' => 'plain_text', 'text' => 'Review in Eisenmarkt'], 'url' => $url, 'action_id' => 'open_review']];
        foreach (array_slice(array_values(array_unique($links)), 0, 3) as $i => $link) {
            if (is_string($link) && filter_var($link, FILTER_VALIDATE_URL) && parse_url($link, PHP_URL_SCHEME) === 'https' && strlen($link) <= 2000) {
                $buttons[] = ['type' => 'button', 'text' => ['type' => 'plain_text', 'text' => 'Source '.($i + 1)], 'url' => $link, 'action_id' => 'source_'.$i];
            }
        }

        return ['text' => mb_substr($text, 0, 2800), 'mrkdwn' => false, 'parse' => 'none', 'unfurl_links' => false, 'unfurl_media' => false,
            'blocks' => [['type' => 'section', 'text' => ['type' => 'plain_text', 'text' => mb_substr($text, 0, 2800)]], ['type' => 'actions', 'elements' => $buttons]]];
    }

    private function deliver(object $notice): string
    {
        $row = DB::table('campaign_slack_notices')->where('id', $notice->id)->where('status', 'pending');
        // Durable claim BEFORE IO. A process crash or ambiguous response must never blindly repost.
        if (! $row->update(['status' => 'sending', 'updated_at' => now()])) {
            return 'claimed';
        }
        $result = ['status' => 'uncertain', 'error_code' => 'delivery_unknown'];
        try {
            $response = Http::withToken(config('campaign_slack.token'))->connectTimeout(5)->timeout(10)
                ->post('https://slack.com/api/chat.postMessage', [...json_decode($notice->payload, true), 'channel' => config('campaign_slack.channel_id')]);
            if ($response->status() === 429) {
                $result = ['status' => 'pending', 'error_code' => 'rate_limited', 'available_at' => now()->addSeconds(max(60, (int) $response->header('Retry-After')))];
            } elseif ($response->successful() && $response->json('ok') === true && filled($response->json('ts')) && $response->json('channel') === config('campaign_slack.channel_id')) {
                $result = ['status' => 'sent', 'slack_ts' => $response->json('ts'), 'error_code' => null];
            } elseif ($response->successful() && $response->json('ok') === false) {
                // Do not persist arbitrary API response text, credentials or user content in diagnostics.
                $code = $response->json('error');
                if (in_array($code, ['not_in_channel', 'channel_not_found', 'invalid_auth', 'token_revoked', 'missing_scope', 'is_archived'])) {
                    $result = ['status' => 'blocked', 'error_code' => $code];
                }
            }
        } catch (\Throwable) {
            // Timeouts/5xx can occur after Slack accepted the message. Reconcile manually.
        }
        DB::table('campaign_slack_notices')->where('id', $notice->id)->update([...$result, 'updated_at' => now()]);

        return $result['status'];
    }
}

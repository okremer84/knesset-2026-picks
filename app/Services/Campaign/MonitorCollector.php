<?php

namespace App\Services\Campaign;

use App\Jobs\RepriceCampaign;
use App\Models\League;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class MonitorCollector
{
    public function __construct(private MonitorFeeds $feeds) {}

    public function collect(object $source): void
    {
        $lock = Cache::lock('campaign-monitor:'.$source->id, 300);
        if (! $lock->get()) {
            return;
        }
        $started = now();
        try {
            $result = $source->kind === 'x' ? $this->x($source) : $this->news($source);
            DB::transaction(function () use ($source, $result, $started) {
                League::whereKey($source->league_id)->lockForUpdate()->firstOrFail();
                $current = DB::table('campaign_sources')->find($source->id);
                if (! $current || $current->kind !== $source->kind || $current->external_id !== $source->external_id || $current->url !== $source->url) {
                    return;
                }
                $changed = false;
                foreach ($result['items'] as $item) {
                    $key = hash('sha256', $item['key']);
                    $old = DB::table('campaign_observations')->where('source_id', $source->id)->where('item_key', $key)->first();
                    $metadata = $item['metadata'];
                    $text = $item['text'];
                    if ($old) {
                        $prior = json_decode($old->metadata, true);
                        if ($source->kind === 'x') {
                            // Retain the first captured original text, even after an edit or deletion.
                            $text = $old->text;
                            $item['published_at'] = $old->published_at;
                            $item['url'] = $old->url;
                            $item['title'] = $old->title;
                            $metadata = [...$prior, 'latest_seen_version' => $metadata['version_id'] ?? null];
                        } elseif ($old->content_hash !== hash('sha256', $text)) {
                            $versions = $prior['versions'] ?? [];
                            $versions[] = ['text' => $old->text, 'captured_at' => $old->last_seen_at];
                            $metadata['versions'] = array_slice($versions, -20);
                            $metadata['changed'] = true;
                        } else {
                            $metadata = [...$prior, ...$metadata];
                        }
                    }
                    $row = ['url' => $item['url'], 'title' => mb_substr($item['title'], 0, 500), 'text' => $text, 'content_hash' => hash('sha256', $text), 'published_at' => CarbonImmutable::parse($item['published_at'])->utc(), 'last_seen_at' => now(), 'metadata' => json_encode($metadata, JSON_UNESCAPED_UNICODE)];
                    if ($old) {
                        $changed = $changed || $old->content_hash !== $row['content_hash'];
                        DB::table('campaign_observations')->where('id', $old->id)->update($row);
                    } else {
                        $changed = true;
                        DB::table('campaign_observations')->insert([...$row, 'source_id' => $source->id, 'item_key' => $key, 'first_seen_at' => now()]);
                    }
                }
                $payload = json_decode($current->payload, true);
                DB::table('campaign_sources')->where('id', $source->id)->update(['payload' => json_encode([...$payload, ...($result['identity'] ?? []), 'checked_at' => now()->toIso8601String(), 'last_error' => null]), 'updated_at' => now()]);
                DB::table('campaign_monitor_runs')->insert(['source_id' => $source->id, 'started_at' => $started, 'finished_at' => now(), 'status' => 'ok', 'items' => count($result['items']), 'message' => null]);
                if ($changed) {
                    RepriceCampaign::dispatch($source->league_id)->afterCommit();
                }
            }, 3);
        } catch (\Throwable $e) {
            // Never persist response bodies, request headers or bearer tokens in operator-visible errors.
            $message = get_class($e) === \RuntimeException::class ? mb_substr($e->getMessage(), 0, 250) : 'האיסוף נכשל; הראיות הקודמות נשמרו';
            DB::transaction(function () use ($source, $started, $message) {
                League::whereKey($source->league_id)->lockForUpdate()->firstOrFail();
                $current = DB::table('campaign_sources')->find($source->id);
                if (! $current) {
                    return;
                }
                $payload = json_decode($current->payload, true);
                DB::table('campaign_sources')->where('id', $source->id)->update(['payload' => json_encode([...$payload, 'last_error' => $message]), 'updated_at' => now()]);
                DB::table('campaign_monitor_runs')->insert(['source_id' => $source->id, 'started_at' => $started, 'finished_at' => now(), 'status' => 'failed', 'items' => 0, 'message' => $message]);
            });
        } finally {
            $lock->release();
        }
    }

    private function x(object $source): array
    {
        $token = config('campaign.x_bearer_token');
        if (! $token) {
            throw new \RuntimeException('חסר CAMPAIGN_X_BEARER_TOKEN — נדרשת גישת X API');
        }
        if (! preg_match('/^[A-Za-z0-9_]{1,15}$/D', $source->external_id)) {
            throw new \RuntimeException('שם חשבון X אינו תקין');
        }
        $get = function (string $path, array $query = []) use ($token): array {
            $response = Http::withToken($token)->acceptJson()->timeout(15)->connectTimeout(5)->withoutRedirecting()->get('https://api.x.com/2/'.$path, $query);
            if (! $response->successful()) {
                throw new \RuntimeException('X החזיר HTTP '.$response->status().' — בדקו גישה ומכסה');
            }
            $body = $response->json();
            if (! is_array($body) || ! empty($body['errors'])) {
                throw new \RuntimeException('X החזיר תשובה חלקית או שגויה');
            }

            return $body;
        };
        $payload = json_decode($source->payload, true);
        $userId = $payload['x_user_id'] ?? null;
        if (! $userId) {
            $userId = $get('users/by/username/'.rawurlencode($source->external_id))['data']['id'] ?? null;
        }
        if (! is_string($userId) || ! preg_match('/^[0-9]+$/D', $userId)) {
            throw new \RuntimeException('לא התקבל מזהה קבוע לחשבון X');
        }
        $items = [];
        $next = null;
        $start = now()->subDays(empty($payload['history_collected_at']) ? 90 : 2)->utc()->format('Y-m-d\TH:i:s\Z');
        $end = now()->subSeconds(15)->utc()->format('Y-m-d\TH:i:s\Z');
        for ($page = 0; $page < 10; $page++) {
            $query = ['max_results' => 100, 'start_time' => $start, 'end_time' => $end, 'tweet.fields' => 'created_at,author_id,referenced_tweets,edit_history_tweet_ids,note_tweet'];
            if ($next) {
                $query['pagination_token'] = $next;
            }
            $body = $get('users/'.$userId.'/tweets', $query);
            if (! isset($body['meta']['result_count']) || ! is_array($body['data'] ?? [])) {
                throw new \RuntimeException('פורמט תשובת X אינו מוכר');
            }
            foreach ($body['data'] ?? [] as $post) {
                if (array_intersect(array_column($post['referenced_tweets'] ?? [], 'type'), ['retweeted', 'replied_to'])) {
                    continue;
                }
                if (($post['author_id'] ?? null) !== $userId || empty($post['created_at']) || empty($post['id']) || ! isset($post['text'])) {
                    throw new \RuntimeException('חסרים שדות אימות בפוסט X');
                }
                $history = $post['edit_history_tweet_ids'] ?? [];
                if (! is_array($history) || ! count($history) || ! collect($history)->every(fn ($id) => is_string($id) && preg_match('/^[0-9]+$/D', $id)) || ! in_array($post['id'], $history, true)) {
                    throw new \RuntimeException('חסרה היסטוריית עריכות מאומתת בפוסט X');
                }
                $original = $history[0];
                $text = $post['note_tweet']['text'] ?? $post['text'];
                if (! is_string($text) || CarbonImmutable::parse($post['created_at'])->gt(now())) {
                    throw new \RuntimeException('תוכן או מועד פוסט X אינם תקינים');
                }
                $items[] = ['key' => $original, 'url' => 'https://x.com/i/web/status/'.$post['id'], 'title' => mb_substr($text, 0, 200), 'text' => $text, 'published_at' => $post['created_at'], 'metadata' => ['external_id' => $original, 'version_id' => $post['id'], 'original_captured' => $original === $post['id'], 'author_id' => $userId, 'kind' => 'post']];
            }
            $next = $body['meta']['next_token'] ?? null;
            // Initial backfill needs 30 original posts plus the complete two-day live overlap,
            // not every historical page. A page beyond that overlap cannot hide live-window posts.
            $historyEnough = empty($payload['history_collected_at'])
                && collect($items)->where('metadata.original_captured', true)->count() >= 30
                && collect($body['data'] ?? [])->contains(fn ($post) => ! empty($post['created_at']) && CarbonImmutable::parse($post['created_at'])->lt(now()->subDays(2)));
            if (! $next || $historyEnough) {
                return ['items' => $items, 'identity' => ['x_user_id' => $userId, 'history_collected_at' => $payload['history_collected_at'] ?? now()->toIso8601String()]];
            }
        }
        throw new \RuntimeException('יותר מדי עמודי X; האיסוף אינו מלא');
    }

    private function news(object $source): array
    {
        $feed = MonitorFeeds::catalog()[$source->external_id] ?? null;
        if (! $feed || $source->url !== $feed['url']) {
            throw new \RuntimeException('יש לבחור הזנת חדשות מאושרת');
        }
        $xml = $this->feeds->xml($this->feeds->fetch($feed['url'], $feed['hosts']));
        $items = [];
        $articleBudget = 8;
        $entries = iterator_to_array($xml->channel->item, false);
        $seen = DB::table('campaign_observations')->where('source_id', $source->id)->pluck('last_seen_at', 'url');
        usort($entries, fn ($a, $b) => strcmp($seen->get(trim((string) $a->link), ''), $seen->get(trim((string) $b->link), '')));
        foreach ($entries as $entry) {
            $url = trim((string) $entry->link);
            if (! in_array(strtolower(parse_url($url, PHP_URL_HOST) ?? ''), $feed['hosts'], true) || parse_url($url, PHP_URL_SCHEME) !== 'https') {
                continue;
            }
            $title = $this->feeds->plain((string) $entry->title);
            $summary = $this->feeds->plain((string) $entry->description);
            // The published monitored-feed contract explicitly uses this discovery rule.
            if (! str_contains($title.' '.$summary, 'אוריך')) {
                continue;
            }
            $date = (string) $entry->pubDate;
            if (! $date) {
                throw new \RuntimeException('כתבת אוריך ללא מועד פרסום בהזנה');
            }
            $text = $summary;
            $readable = false;
            $error = null;
            if ($articleBudget-- > 0) {
                try {
                    $text = $this->feeds->article($url, $feed['hosts']);
                    $readable = true;
                } catch (\Throwable) {
                    $error = 'גוף הכתבה אינו נגיש; התקציר לבדו אינו מספיק להכרעה';
                }
            } else {
                if ($seen->has($url)) {
                    continue;
                }
                $error = 'ממתין לאיסוף גוף הכתבה';
            }
            $items[] = ['key' => $url, 'url' => $url, 'title' => $title, 'text' => $text, 'published_at' => $date, 'metadata' => ['kind' => 'article', 'summary' => $summary, 'readable' => $readable, 'error' => $error]];
        }
        if (count($xml->channel->item) === 0) {
            throw new \RuntimeException('הזנת החדשות ריקה; אין להסיק שלא פורסם דבר');
        }

        return ['items' => $items];
    }
}

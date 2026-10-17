<?php

namespace App\Services\Campaign;

use App\Models\League;
use App\Models\Survey;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class Evidence
{
    public function snapshot(League $league, ?string $type = null, array $contract = []): array
    {
        $polls = [];
        if (! $type || in_array($type, ['poll_value', 'poll_movement'])) {
            $polls = Survey::where('active', true)->where('kind', 'opinion_poll')->orderBy('id')->get()->pluck('payload')->filter(fn ($p) => (empty($contract['pollster']) || $p['institute'] === $contract['pollster']) &&
                (empty($contract['publisher']) || $p['channelOrMedia'] === $contract['publisher'])
            )->sortByDesc('date')->take(60)->map(function ($p) {
                unset($p['syncedAt']);

                return $p;
            })->values()->all();
        }
        $sources = DB::table('campaign_sources')->where('league_id', $league->id)->orderBy('id')->get()->filter(fn ($s) => ! $type || $s->url === ($contract['source_url'] ?? null) || (int) ($contract['source_id'] ?? 0) === $s->id || in_array($s->id, $contract['monitor']['source_ids'] ?? [], true)
        )->map(function ($s) {
            $payload = json_decode($s->payload, true);
            unset($payload['checked_at'], $payload['last_error']);

            return ['id' => $s->id, 'kind' => $s->kind, 'name' => $s->name, 'url' => $s->url, 'payload' => $payload];
        })->values()->all();

        $observations = ! empty($contract['monitor']['source_ids']) ? DB::table('campaign_observations')->whereIn('source_id', collect($sources)->pluck('id'))->where('published_at', '<', now())->orderByDesc('published_at')->limit(30)->get(['url', 'title', 'text', 'published_at'])->map(fn ($r) => (array) $r)->all() : [];

        return ['polls' => $polls, 'sources' => $sources, ...($observations ? ['observations' => $observations] : []),
            ...(($contract['monitor']['mode'] ?? '') === 'x_next_mention' && collect($sources)->contains('id', $contract['source_id'] ?? null) ? ['keyword_sample' => PostTopics::sample($contract['source_id'])] : [])];
    }

    public function input(League $league, object $market): array
    {
        $contract = json_decode($market->contract, true);

        return ['id' => $market->id, 'type' => $market->type, 'contract' => $contract, 'evidence' => $this->snapshot($league, $market->type, $contract)];
    }

    public function hash(array $input): string
    {
        $canonical = function ($value) use (&$canonical) {
            if (! is_array($value)) {
                return $value;
            }
            if (! array_is_list($value)) {
                ksort($value);
            }

            return array_map($canonical, $value);
        };

        return hash('sha256', json_encode($canonical($input), JSON_THROW_ON_ERROR));
    }

    public function urls(array $snapshot): array
    {
        $urls = [];
        array_walk_recursive($snapshot, function ($value, $key) use (&$urls) {
            if (in_array($key, ['url', 'sourceUrl', 'source_url']) && is_string($value) && str_starts_with($value, 'https://')) {
                $urls[] = $value;
            }
        });

        return array_values(array_unique($urls));
    }

    public function prefill(League $league, object $market): array
    {
        $c = json_decode($market->contract, true);
        $snapshot = $this->snapshot($league, $market->type, $c);
        if (isset($c['monitor'])) {
            return app(Monitoring::class)->packet($league, $market);
        }
        $out = ['source_url' => $c['source_url'], 'note' => 'יש לבדוק את המקור ולהזין את הערך וחותמת הזמן. שדה ריק אינו אפס.'];
        if (in_array($market->type, ['poll_value', 'poll_movement'])) {
            if (empty($c['subject']) || empty($c['pollster']) || empty($c['publisher'])) {
                return $out;
            }
            // The poll store has publication dates, not verified release times. Never invent an intraday timestamp.
            $start = CarbonImmutable::parse($c['window_starts_at'])->setTimezone('Asia/Jerusalem')->toDateString();
            $end = CarbonImmutable::parse($market->window_ends_at, 'UTC')->setTimezone('Asia/Jerusalem')->toDateString();
            $poll = collect($snapshot['polls'])->filter(fn ($p) => $p['date'] >= $start && $p['date'] <= $end)->sortBy('date')->first();
            if (($c['subject'] ?? '') === 'bloc:opposition') {
                $c['parties'] = ['yashar', 'beyachad', 'democrats', 'israel_beitenu', 'kachol_lavan'];
            }
            if ($poll && ! empty($c['parties'])) {
                $missing = collect($c['parties'])->filter(fn ($id) => ! array_key_exists($id, $poll['seats']) || in_array($id, $poll['notReportedPartyIds'] ?? [], true));
                if ($missing->isNotEmpty()) {
                    return [...$out, 'note' => 'חסרים ערכים מאומתים לרשימות: '.$missing->implode(', ').'. אין לפרש חסר כאפס.'];
                }
                $components = collect($c['parties'])->mapWithKeys(fn ($id) => [$id => $poll['seats'][$id]])->all();

                return ['observed' => array_sum($components), 'components' => $components, 'source_url' => $poll['originalSourceUrls'][0] ?? $poll['sourceUrl'], 'note' => 'סכום הרשימות הקבועות: '.collect($components)->map(fn ($value, $id) => ($c['party_labels'][$id] ?? $id).': '.$value)->implode(', ').'. סקר '.$poll['date'].'. יש לאמת בפרסום המקורי את השעה, התרחיש ושזהו הסקר החדש הראשון בחלון.'];
            }
            if ($poll && array_key_exists($c['subject'], $poll['seats'])) {
                $value = $poll['seats'][$c['subject']];
                if ($market->type === 'poll_movement') {
                    if (! isset($c['baseline'])) {
                        return [...$out, 'note' => 'ערך הבסיס לא הוגדר בחוזה. יש לבדוק את הסקר הקודם.'];
                    }
                    $value -= $c['baseline'];
                }

                return ['observed' => $value, 'source_url' => $poll['sourceUrl'], 'note' => 'סקר '.$poll['institute'].' / '.$poll['channelOrMedia'].' מתאריך '.$poll['date'].'. יש לאמת את שעת הפרסום.'];
            }
        }
        if (in_array($market->type, ['channel_activity', 'mention_count'])) {
            $source = collect($snapshot['sources'])->firstWhere('id', $c['source_id'] ?? null);
            $item = collect($source['payload']['items'] ?? [])->filter(fn ($i) => CarbonImmutable::parse($i['published_at'])->betweenIncluded(CarbonImmutable::parse($c['window_starts_at']), CarbonImmutable::parse($market->window_ends_at, 'UTC')))->sortBy('published_at')->first();
            if ($item) {
                return [...($market->type === 'channel_activity' ? ['observed' => 1] : []), 'source_url' => $item['url'], 'observed_at' => $item['published_at'], 'note' => $item['title'].' · יש לאמת שזה הפרסום המתאים לחוזה'.($market->type === 'mention_count' ? ' ולצרף ספירה עם חותמות זמן' : '')];
            }
            $out['note'] = 'לא נמצא פרסום בחלון שנאסף. היעדר פריט אינו הוכחה: יש לבדוק את הערוץ לפני הכרעת לא.';
        }

        return $out;
    }
}

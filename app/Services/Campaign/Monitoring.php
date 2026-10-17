<?php

namespace App\Services\Campaign;

use App\Models\League;
use Carbon\CarbonImmutable as Time;
use Illuminate\Support\Facades\DB;

class Monitoring
{
    public function validate(League $league, array $data): void
    {
        $c = $data['contract'];
        $m = $c['monitor'] ?? null;
        if (! array_key_exists('monitor', $c)) {
            return;
        }
        abort_unless(is_array($m) && in_array($m['mode'] ?? '', ['x_count', 'x_next_mention', 'news_reporting']), 422, 'סוג מעקב לא תקין');
        abort_if(! empty($data['group_key']), 422, 'שאלות מעקב מוכרעות בנפרד');
        abort_if(Time::parse($data['closes_at'])->gt(Time::parse($c['window_starts_at'])), 422, 'ההימורים חייבים להיסגר לפני תחילת המעקב');
        abort_if(Time::parse($c['window_starts_at'])->gte(Time::parse($data['window_ends_at'])), 422, 'נדרש חלון מעקב חיובי');
        $news = $m['mode'] === 'news_reporting';
        $ids = $m['source_ids'] ?? [];
        abort_unless(is_array($ids) && count($ids) >= 1 && count($ids) <= 7 && count(array_unique($ids)) === count($ids) && collect($ids)->every(fn ($id) => is_int($id) && $id > 0), 422, 'יש לבחור מקורות למעקב');
        $sources = DB::table('campaign_sources')->where('league_id', $league->id)->whereIn('id', $ids)->where('kind', $news ? 'news' : 'x')->get();
        abort_unless($sources->count() === count($ids), 422, 'מקור אינו מתאים או אינו שייך לליגה');
        abort_unless(in_array($c['source_id'] ?? null, $ids, true), 422, 'יש לחבר מקור ראשי מתוך מקורות המעקב');
        abort_unless($c['source_url'] === $sources->firstWhere('id', $c['source_id'])->url, 422, 'קישור המקור חייב להתאים למקור המעקב');
        if ($news) {
            abort_unless($data['type'] === 'deadline_event' && $c['comparison'] === 'event' && ($m['scope'] ?? '') === 'rss_urich_headlines', 422, 'חוזה חדשות חייב להגדיר במפורש הזנות RSS וכותרות אוריך');
            abort_unless(is_string($m['person'] ?? null) && mb_strlen($m['person']) >= 3 && mb_strlen($m['person']) <= 100, 422, 'חסר שם האדם');
        } else {
            abort_unless(count($ids) === 1 && $data['type'] === 'mention_count' && $c['comparison'] === 'gte' && $c['threshold'] >= 1 && floor($c['threshold']) == $c['threshold'], 422, 'מעקב X דורש מקור אחד וסף שלם חיובי');
            abort_unless(config('campaign.x_bearer_token'), 422, 'אין עדיין גישת X API; שמרו כטיוטה');
            if ($m['mode'] === 'x_next_mention') {
                abort_unless(array_key_exists($m['topic'] ?? '', PostTopics::catalog()) && $c['threshold'] == 1, 422, 'יש לבחור נושא מוכר וסף 1');
            }
        }
        // Publishing requires a real successful collection, never just a configured URL.
        foreach ($sources as $source) {
            $run = DB::table('campaign_monitor_runs')->where('source_id', $source->id)->latest('id')->first();
            abort_unless($run && $run->status === 'ok' && Time::parse($run->finished_at, 'UTC')->gte(now()->subMinutes(15)), 422, 'יש להשלים איסוף תקין ועדכני מכל המקורות לפני הפרסום');
        }
    }

    public function packet(League $league, object $market): array
    {
        $c = json_decode($market->contract, true);
        $m = $c['monitor'] ?? null;
        abort_unless($m, 422, 'השוק אינו מחובר למעקב');
        $start = Time::parse($c['window_starts_at'])->utc();
        $end = Time::parse($market->window_ends_at, 'UTC');
        $sources = DB::table('campaign_sources')->where('league_id', $league->id)->whereIn('id', $m['source_ids'])->get();
        $records = DB::table('campaign_observations')->whereIn('source_id', $sources->pluck('id'))->orderBy('published_at')->orderBy('id')->get();
        $reviews = DB::table('campaign_evidence_reviews')->where('market_id', $market->id)->get()->keyBy('observation_id');
        $coverage = $sources->map(fn ($s) => ['id' => $s->id, 'name' => $s->name, ...$this->coverage($s->id, $start, $end->min(now()), now()->gte($end))])->all();
        $complete = $sources->count() === count($m['source_ids']) && collect($coverage)->every('complete', true);
        $news = $m['mode'] === 'news_reporting';
        $all = $records->map(function ($r) use ($reviews, $sources) {
            $meta = json_decode($r->metadata, true);
            $review = $reviews->get($r->id);

            return ['id' => $r->id, 'source' => $sources->firstWhere('id', $r->source_id)->name, 'url' => $r->url, 'title' => $r->title, 'text' => $r->text, 'hash' => $r->content_hash, 'published_at' => Time::parse($r->published_at, 'UTC')->toIso8601String(), 'first_seen_at' => Time::parse($r->first_seen_at, 'UTC')->toIso8601String(), 'metadata' => $meta, 'dismissed' => $review && $review->content_hash === $r->content_hash, 'dismissal' => $review?->reason];
        });
        $window = $all->filter(fn ($r) => Time::parse($r['published_at'])->gte($start) && Time::parse($r['published_at'])->lt($end) && Time::parse($r['published_at'])->lte(now()))->values();
        $baseline = $news ? $all->filter(fn ($r) => Time::parse($r['published_at'])->lt($start) && (str_contains($r['text'], $m['person']) || str_contains($r['title'], $m['person'])))->values() : collect();
        $packet = ['market_id' => $market->id, 'mode' => $m['mode'], 'status' => 'waiting', 'message' => 'ממתינים לסיום חלון התצפית', 'coverage' => $coverage, 'items' => [], 'baseline' => $baseline->take(-30)->values()->all(), 'source_url' => $c['source_url'], 'observed_at' => $end->toIso8601String()];
        if ($news) {
            // Unreadable articles remain visible even if the person's name is not in their teaser.
            $candidates = $window->map(function ($r) use ($baseline) {
                $r['duplicate_of'] = $baseline->firstWhere('hash', $r['hash'])['url'] ?? null;

                return $r;
            })->values();
            $packet['items'] = $candidates->all();
            $pending = $candidates->where('dismissed', false);
            if ($pending->isNotEmpty()) {
                $packet['status'] = 'review';
                $packet['message'] = 'בדקו את הקטע מול הפרסומים הקודמים: התכתבות ישירה ותוכן חדש, לא רק אזכור של השם';
            } elseif (now()->gte($end) && $complete) {
                $packet = [...$packet, 'status' => 'ready', 'observed' => 0, 'message' => 'לא נמצאה כתבה מתאימה בהזנות המוגדרות בחוזה; האיסוף רציף וכל המועמדים נבדקו'];
            }
        } else {
            $window = $window->sort(function ($a, $b) {
                $date = strcmp($a['published_at'], $b['published_at']);
                $ai = $a['metadata']['external_id'];
                $bi = $b['metadata']['external_id'];

                return $date ?: (strlen($ai) <=> strlen($bi)) ?: strcmp($ai, $bi);
            })->values();
            $packet['items'] = $window->all();
            if ($window->contains(fn ($r) => ! ($r['metadata']['original_captured'] ?? false))) {
                $complete = false;
            }
            if ($m['mode'] === 'x_count' && now()->gte($end) && $complete) {
                $packet = [...$packet, 'status' => 'ready', 'observed' => $window->count(), 'message' => 'מספר הפוסטים המקוריים שנאספו בחלון; תגובות ושיתופים ללא תוספת לא נספרו'];
            } elseif ($m['mode'] === 'x_next_mention' && $complete && $window->isNotEmpty()) {
                $first = $window->first();
                $matches = PostTopics::matches($first['text'], $m['topic']);
                $packet['items'] = [[...$first, 'matches' => $matches]];
                if ($first['metadata']['original_captured'] ?? false) {
                    $packet = [...$packet, 'status' => 'ready', 'observed' => $matches ? 1 : 0, 'source_url' => $first['url'], 'observed_at' => $first['published_at'], 'message' => 'נבחר הפוסט המקורי הראשון. נבדק הטקסט של החשבון בלבד, ללא תוכן מצורף'];
                } else {
                    $packet['status'] = 'incomplete';
                    $packet['message'] = 'הגרסה המקורית לא נתפסה לפני העריכה; אין להכריע לפי גרסה מאוחרת';
                }
            } elseif ($m['mode'] === 'x_next_mention' && now()->gte($end) && $complete) {
                $packet['status'] = 'void';
                $packet['message'] = 'לא פורסם פוסט מקורי בחלון — מומלץ לבטל ולהחזיר את הכסף';
            }
        }
        if (! $complete && $packet['status'] !== 'review') {
            $packet['status'] = now()->lt($start) ? 'waiting' : 'incomplete';
            $packet['message'] = 'אין רצף איסוף מספק. אין להסיק תוצאת לא מהיעדר פרסומים';
            unset($packet['observed']);
        }
        // No timestamps that change on every healthy poll: only meaningful evidence/status changes invalidate approval.
        $packet['version'] = app(Evidence::class)->hash([$m, $packet['status'], $packet['observed'] ?? null, $coverage, $all->map(fn ($r) => [$r['id'], $r['hash'], $r['title'], $r['url'], $r['published_at'], $r['metadata'], $r['dismissed']])->all()]);

        return $packet;
    }

    private function coverage(int $id, Time $start, Time $until, bool $ended): array
    {
        if (now()->lt($start)) {
            return ['complete' => false, 'message' => 'החלון טרם התחיל'];
        }
        $runs = DB::table('campaign_monitor_runs')->where('source_id', $id)->where('started_at', '>=', $start->subMinutes(15))->orderBy('started_at')->get();
        $prior = $runs->filter(fn ($r) => $r->status === 'ok' && Time::parse($r->started_at, 'UTC')->lte($start))->last();
        if (! $prior) {
            return ['complete' => false, 'message' => 'האיסוף לא היה פעיל לפני תחילת החלון'];
        }
        $cursor = Time::parse($prior->started_at, 'UTC');
        foreach ($runs->filter(fn ($r) => Time::parse($r->started_at, 'UTC')->gt($cursor)) as $run) {
            $time = Time::parse($run->started_at, 'UTC');
            if ($time->gt($until->addMinutes(15))) {
                break;
            }
            if ($run->status !== 'ok' || $time->gt($cursor->addMinutes(15))) {
                return ['complete' => false, 'message' => 'נרשמה תקלה או הפסקה באיסוף בתוך החלון'];
            }
            $cursor = $time;
        }
        // For a completed window require a post-window run; for an ongoing window allow the polling interval.
        $complete = $ended ? $cursor->gte($until->addSeconds(15)) : $cursor->gte($until->subMinutes(10));

        return ['complete' => $complete, 'message' => $complete ? 'רצף בדיקות תקין במקור המוגדר; אינו מבטיח לכידת פרסום שנמחק בין בדיקות' : 'ממתינים לבדיקה משלימה אחרי סוף החלון'];
    }

    public function data(League $league, object $market, array $request): array
    {
        $packet = $this->packet($league, $market);
        abort_unless(hash_equals($packet['version'], $request['version']), 409, 'הראיות השתנו. רעננו ובדקו שוב');
        $item = null;
        if ($packet['mode'] === 'news_reporting' && isset($request['observation_id'])) {
            $item = collect($packet['items'])->firstWhere('id', $request['observation_id']);
            abort_unless($item && ! $item['dismissed'] && ($item['metadata']['readable'] ?? false) && ! $item['duplicate_of'] && ($request['direct_and_new'] ?? false), 422, 'יש לאשר כתבה נגישה, התכתבות ישירה ותוכן חדש');
            $observed = 1;
        } else {
            abort_unless($packet['status'] === 'ready', 422, 'אין עדיין ראיות מספיקות להכרעה');
            $observed = $packet['observed'];
        }
        $data = ['observed' => $observed, 'observed_at' => $item['published_at'] ?? $packet['observed_at'], 'source_url' => $item['url'] ?? $packet['source_url'], 'note' => mb_substr($packet['message'].($item ? "\n".$item['title']."\n".$item['text'] : "\n".implode("\n", array_column($packet['items'], 'url'))), 0, 4000), 'monitor' => ['version' => $packet['version'], 'observation_id' => $item['id'] ?? null, 'direct_and_new' => (bool) $item]];
        if (Time::parse($data['observed_at'])->lt(app(Game::class)->cutoff($market))) {
            $data['early_at'] = $data['observed_at'];
        }

        return $data;
    }

    public function verify(League $league, object $market, array $data): void
    {
        if (isset(json_decode($market->contract, true)['monitor'])) {
            abort_unless(isset($data['monitor']), 422, 'שוק מנוטר דורש אישור מכרטיס הראיות');
            $current = $this->data($league, $market, $data['monitor']);
            abort_unless($current['observed'] === $data['observed'] && $current['source_url'] === $data['source_url'], 409, 'ההכרעה אינה תואמת לראיות');
        }
    }
}

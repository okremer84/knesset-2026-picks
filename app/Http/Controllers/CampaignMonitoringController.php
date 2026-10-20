<?php

namespace App\Http\Controllers;

use App\Jobs\CollectCampaignMonitor;
use App\Models\League;
use App\Services\Campaign\Game;
use App\Services\Campaign\MonitorFeeds;
use App\Services\Campaign\Monitoring;
use App\Services\Campaign\PostTopics;
use App\Services\Campaign\QuestionSlate;
use App\Services\Campaign\Settlement;
use Carbon\CarbonImmutable as Time;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CampaignMonitoringController extends Controller
{
    private function access(League $league, Request $request): void
    {
        app(Game::class)->member($league, $request->user());
        abort_unless(app(Game::class)->operator($request->user()), 403);
        abort_unless(config('campaign.processing_enabled'), 409, 'איסוף, בדיקת הימורים והכרעות מושהים');
    }

    public function index(League $league, Request $request, Monitoring $monitoring)
    {
        $this->access($league, $request);
        $sources = DB::table('campaign_sources')->where('league_id', $league->id)->whereIn('kind', ['x', 'news'])->get()->map(function ($s) {
            return ['id' => $s->id, 'kind' => $s->kind, 'name' => $s->name, 'url' => $s->url, 'external_id' => $s->external_id, 'last_run' => DB::table('campaign_monitor_runs')->where('source_id', $s->id)->latest('id')->first(), 'items' => DB::table('campaign_observations')->where('source_id', $s->id)->count(), 'sample' => $s->kind === 'x' ? PostTopics::sample($s->id) : null];
        });
        $markets = DB::table('campaign_markets')->where('league_id', $league->id)->whereNotIn('state', ['resolved', 'void'])->whereNull('action')->get()->filter(fn ($m) => isset(json_decode($m->contract, true)['monitor']));

        return ['x_configured' => (bool) config('campaign.x_bearer_token'), 'sources' => $sources, 'packets' => $markets->map(fn ($m) => ['title' => $m->title, ...$monitoring->packet($league, $m)])->values()];
    }

    public function setup(League $league, Request $request)
    {
        $this->access($league, $request);
        $ids = DB::transaction(function () use ($league) {
            League::whereKey($league->id)->lockForUpdate()->firstOrFail();
            $definitions = collect(MonitorFeeds::catalog())->map(fn ($v, $id) => ['kind' => 'news', 'name' => $v['name'], 'url' => $v['url'], 'external_id' => $id])->values()->all();
            foreach (['netanyahu' => 'בנימין נתניהו', 'yairlapid' => 'יאיר לפיד', 'naftalibennett' => 'נפתלי בנט', 'AvigdorLiberman' => 'אביגדור ליברמן', 'YairGolan1' => 'יאיר גולן', 'gantzbe' => 'בני גנץ'] as $handle => $name) {
                $definitions[] = ['kind' => 'x', 'name' => $name.' · X', 'url' => 'https://x.com/'.$handle, 'external_id' => $handle];
            }
            $ids = [];
            foreach ($definitions as $row) {
                $existing = DB::table('campaign_sources')->where('league_id', $league->id)->where('kind', $row['kind'])->where('external_id', $row['external_id'])->first();
                $ids[] = $existing?->id ?? DB::table('campaign_sources')->insertGetId([...$row, 'league_id' => $league->id, 'payload' => '{}', 'created_at' => now(), 'updated_at' => now()]);
            }

            return $ids;
        });
        foreach ($ids as $id) {
            CollectCampaignMonitor::dispatch($id);
        }

        return ['queued' => true];
    }

    public function collect(League $league, int $source, Request $request)
    {
        $this->access($league, $request);
        abort_unless(DB::table('campaign_sources')->where('league_id', $league->id)->where('id', $source)->whereIn('kind', ['x', 'news'])->exists(), 404);
        CollectCampaignMonitor::dispatch($source);

        return ['queued' => true];
    }

    public function preview(League $league, string $market, Request $request, Monitoring $monitoring, Game $game, Settlement $settlement)
    {
        $this->access($league, $request);
        $d = $request->validate(['version' => 'required|string|size:64', 'observation_id' => 'nullable|integer', 'direct_and_new' => 'sometimes|boolean']);

        return DB::transaction(function () use ($league, $market, $monitoring, $game, $settlement, $d) {
            League::whereKey($league->id)->lockForUpdate()->firstOrFail();
            $m = $game->market($market, $league, true);

            return $settlement->preview($league, $market, $monitoring->data($league, $m, $d));
        });
    }

    public function dismiss(League $league, string $market, Request $request, Monitoring $monitoring, Game $game)
    {
        $this->access($league, $request);
        $d = $request->validate(['version' => 'required|string|size:64', 'observation_id' => 'required|integer', 'reason' => 'required|string|max:300']);
        DB::transaction(function () use ($league, $market, $request, $monitoring, $game, $d) {
            League::whereKey($league->id)->lockForUpdate()->firstOrFail();
            $m = $game->market($market, $league, true);
            abort_if($m->action || in_array($m->state, ['resolved', 'void']), 409);
            $p = $monitoring->packet($league, $m);
            abort_unless($p['mode'] === 'news_reporting' && hash_equals($p['version'], $d['version']), 409, 'הראיות השתנו; רעננו שוב');
            $item = collect($p['items'])->firstWhere('id', $d['observation_id']);
            abort_unless($item && ($item['metadata']['readable'] ?? false), 422, 'אי אפשר לפסול כתבה שלא ניתן לקרוא');
            DB::table('campaign_evidence_reviews')->updateOrInsert(['market_id' => $market, 'observation_id' => $item['id']], ['content_hash' => $item['hash'], 'reason' => $d['reason'], 'actor_id' => $request->user()->id, 'created_at' => now()]);
            $game->event($market, $request->user()->id, 'evidence_dismissed', $d);
        });

        return ['ok' => true];
    }

    public function drafts(League $league, Request $request)
    {
        $this->access($league, $request);
        $d = $request->validate(['kind' => 'required|in:x,news,polls,prime_minister,interview', 'starts_at' => 'required|date|after:now', 'ends_at' => 'required|date|after:starts_at']);
        $sources = DB::table('campaign_sources')->where('league_id', $league->id)->where('kind', $d['kind'])->get();
        abort_if(in_array($d['kind'], ['x', 'news']) && $sources->isEmpty(), 422, 'הוסיפו קודם את מקורות המעקב');
        $rows = [];
        $common = ['closes_at' => Time::parse($d['starts_at'])->toIso8601String(), 'window_ends_at' => Time::parse($d['ends_at'])->toIso8601String(), 'tag' => 'no_basis', 'probability' => 5000, 'rationale' => 'אין עדיין מדגם פעילות מלא; 50/50', 'contract' => ['window_starts_at' => Time::parse($d['starts_at'])->toIso8601String(), 'comparison' => 'gte', 'threshold' => 1, 'yes_rule' => 'האירוע התקיים לפי הראיות שנאספו', 'no_rule' => 'האירוע לא התקיים ורצף האיסוף תקין', 'void_rule' => 'חוסר כיסוי, ראיה לא נגישה או חוסר יכולת להכריע']];
        if ($d['kind'] === 'x') {
            foreach ($sources as $s) {
                $base = [...$common, 'type' => 'mention_count', 'contract' => [...$common['contract'], 'source_id' => $s->id, 'source_url' => $s->url, 'monitor' => ['source_ids' => [$s->id]], 'count_rules' => 'רק פוסטים שנאספו ב־X; תגובות ושיתופים ללא תוספת לא נספרים. חלון כולל התחלה ולא כולל סוף. עריכות אינן פוסט חדש; מחיקה אחרי לכידה אינה מבטלת את הפוסט.']];
                $rows[] = [...$base, 'title' => 'האם '.$s->name.' יפרסם לפחות 5 פוסטים מקוריים בחלון?', 'contract' => [...$base['contract'], 'threshold' => 5, 'monitor' => [...$base['contract']['monitor'], 'mode' => 'x_count']]];
                $sample = PostTopics::sample($s->id);
                foreach (PostTopics::catalog() as $topic => $definition) {
                    $stats = $sample['topics'][$topic];
                    $enough = $sample['size'] >= 20;
                    $rows[] = [...$base, 'title' => 'האם הפוסט הבא של '.$s->name.' יזכיר '.$definition['label'].'?',
                        'probability' => $stats['probability'], 'tag' => $enough ? 'evidence_based' : 'no_basis',
                        'rationale' => $enough ? $stats['hits'].' מתוך '.$sample['size'].' פוסטים שנאספו כללו את המילים. אומדן פתיחה מוחלק (k+1)/(n+2), מוגבל ל־5%–95%; תדירות עבר אינה תחזית ודאית.' : 'נאספו '.$sample['size'].' פוסטים מקוריים; נדרשים לפחות 20 לאומדן. בינתיים 50/50 ללא בסיס.',
                        'evidence' => array_slice($sample['urls'], 0, 20),
                        'contract' => [...$base['contract'], 'count_rules' => $base['contract']['count_rules'].' '.PostTopics::rules($topic).' הפוסט הראשון לפי מועד ו־ID; בלי פוסט או בלי גרסה מקורית — ביטול.',
                            'yes_rule' => 'הטקסט המקורי של הפוסט הראשון בחלון כולל לפחות מילת מפתח אחת לפי כללי הספירה.',
                            'no_rule' => 'נלכד הפוסט המקורי הראשון, האיסוף רציף, ואין בטקסט מילת מפתח מתאימה.',
                            'void_rule' => 'אין פוסט מקורי בחלון, חסרה הגרסה המקורית או יש חוסר ברצף האיסוף.',
                            'monitor' => [...$base['contract']['monitor'], 'mode' => 'x_next_mention', 'topic' => $topic]]];
                }
            }
        } elseif ($d['kind'] === 'news') {
            foreach (['עמית סגל' => 3000, 'טופז לוק' => 2500, 'יעקב ברדוגו' => 2500, 'נבו כץ' => 2000, 'בנימין נתניהו' => 1000] as $person => $probability) {
                $rows[] = [...$common, 'type' => 'deadline_event', 'title' => 'האם תופיע בהזנות המעקב כתבה על התכתבות נוספת בין אוריך ל'.$person.'?', 'probability' => $probability, 'tag' => 'operator_edited', 'rationale' => 'הערכת פתיחה סובייקטיבית מהמחקר; יש לבדוק מחדש לפי חלון המקורות המצומצם', 'contract' => [...$common['contract'], 'comparison' => 'event', 'source_id' => $sources->first()->id, 'source_url' => $sources->first()->url, 'monitor' => ['mode' => 'news_reporting', 'source_ids' => $sources->pluck('id')->all(), 'person' => $person, 'scope' => 'rss_urich_headlines'], 'yes_rule' => 'כתבה חדשה שפורסמה בחלון ונאספה בהזנות המוגדרות, עם אוריך בכותרת או בתקציר RSS, מציגה תוכן חדש מתוך התכתבות ישירה המיוחסת לשני האנשים בעניין ציבורי. המפעיל מאשר ישירות וחידוש מול הארכיון.', 'no_rule' => 'החלון הסתיים, האיסוף רציף, וכל הכתבות המועמדות נבדקו ונפסלו. הכלל חל על ההזנות בלבד, לא על כלל הפרסומים באתר.', 'count_rules' => 'מקורות קבועים: '.$sources->pluck('name')->implode(', ').'. חלון כולל התחלה ולא כולל סוף. אזכור אדם, הכחשה או מחזור הודעות אינם נחשבים. לא קובעים אותנטיות או אשמה. כתבה לא נגישה או ספק בחדשנות — ללא הכרעה.']];
            }
        }
        if (in_array($d['kind'], ['polls', 'prime_minister', 'interview'])) {
            $rows = app(QuestionSlate::class)->drafts($d['kind'], $common['closes_at'], $common['window_ends_at']);
            abort_if(! $rows, 422, 'אין סקרים שמורים מתאימים; יש לסנכרן סקרים קודם');
        }
        DB::transaction(function () use ($league, $rows) {
            League::whereKey($league->id)->lockForUpdate()->firstOrFail();
            foreach ($rows as $row) {
                $key = 'monitor:'.$league->id.':'.hash('sha256', json_encode($row));
                DB::table('campaign_proposals')->insertOrIgnore(['id' => (string) Str::uuid(), 'league_id' => $league->id, 'origin' => 'monitor', 'external_key' => $key, 'payload' => json_encode($row, JSON_UNESCAPED_UNICODE), 'status' => 'pending', 'created_at' => now(), 'updated_at' => now()]);
            }
        });

        return ['created' => count($rows)];
    }
}

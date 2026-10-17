<?php

namespace App\Services\Campaign;

use App\Http\Controllers\LeagueController;
use App\Models\League;
use App\Models\User;
use Carbon\CarbonImmutable as Time;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class OpeningSlate
{
    public const LEAGUE_ID = '5e26d951-61ae-4ae3-aeb9-002026000001';

    public function pilot(User $user): League
    {
        abort_unless(app(Game::class)->allowed($user), 403);

        return DB::transaction(function () use ($user) {
            // A fixed ID plus insertOrIgnore makes simultaneous first logins converge.
            DB::table('leagues')->insertOrIgnore(['id' => self::LEAGUE_ID, 'name' => 'אייזנמארקט', 'owner_id' => $user->id, 'invite_code' => Str::random(40), 'locks_at' => LeagueController::deadlineLimit(), 'created_at' => now(), 'updated_at' => now()]);
            $league = League::whereKey(self::LEAGUE_ID)->lockForUpdate()->firstOrFail();
            if (app(Game::class)->operator($user) && $league->owner_id !== $user->id) {
                $league->update(['owner_id' => $user->id]);
            }
            DB::table('campaign_members')->insertOrIgnore(['league_id' => $league->id, 'user_id' => $user->id, 'created_at' => now(), 'updated_at' => now()]);

            return $league;
        }, 3);
    }

    public function load(League $league): array
    {
        if (! config('campaign.pilot_only') || $league->id !== self::LEAGUE_ID) {
            return [];
        }

        return DB::transaction(function () use ($league) {
            League::whereKey($league->id)->lockForUpdate()->firstOrFail();
            $admin = User::whereRaw('LOWER(email) = ?', ['okremer84@gmail.com'])->first();
            if ($admin && (! app(Game::class)->allowed($admin) || ! app(Game::class)->operator($admin))) {
                $admin = null;
            }
            $pm = collect(config('campaign_slate.questions'))->where('kind', 'pm');
            abort_unless($pm->count() === 4 && $pm->sum('probability') === 10000, 422, 'סיכויי ראש הממשלה חייבים להסתכם ב־100%');
            $out = [];
            foreach (config('campaign_slate.questions') as $q) {
                $external = 'opening:'.$league->id.':'.config('campaign.season').':'.config('campaign_slate.version').':'.$q['key'];
                $existing = DB::table('campaign_proposals')->where('external_key', $external)->first();
                $data = $this->contract($league, $q);
                $reason = $data['hold'] ?? null;
                unset($data['hold']);
                $expired = now()->gte(Time::parse($data['closes_at'])->min(Time::parse(LeagueController::deadlineLimit())));
                if (! $existing && ! $expired && ! $reason && $admin) {
                    $pid = (string) Str::uuid();
                    DB::table('campaign_proposals')->insert(['id' => $pid, 'league_id' => $league->id, 'origin' => 'opening', 'external_key' => $external, 'payload' => json_encode($data), 'status' => 'pending', 'created_at' => now(), 'updated_at' => now()]);
                    app(Game::class)->publish($league, $admin, [...$data, 'proposal_id' => $pid]);
                    $existing = DB::table('campaign_proposals')->where('id', $pid)->first();
                }
                $market = $existing?->market_id ? DB::table('campaign_markets')->find($existing->market_id) : null;
                $quote = $market ? DB::table('campaign_quotes')->find($market->quote_id) : null;
                $probability = $quote ? (int) $quote->probability : $q['probability'];
                $out[] = ['key' => $q['key'], 'title' => $q['title'], 'kind' => $q['kind'], 'probability' => $probability, 'answers' => [['id' => 'yes', 'label' => 'כן', 'probability' => $probability], ['id' => 'no', 'label' => 'לא', 'probability' => 10000 - $probability]], 'status' => $market ? app(Game::class)->present($market)['state'] : ($expired ? 'expired' : 'pending'), 'reason' => $market ? null : ($expired ? 'חלון ההצטרפות הסתיים; השאלה לא נפתחת בדיעבד' : ($reason ?? 'ממתינים לכניסה הראשונה של מנהל המשחק')), 'market_id' => $market?->id, 'closes_at' => $data['closes_at'], 'window_ends_at' => $data['window_ends_at'], 'contract' => $data['contract']];
            }

            return $out;
        }, 3);
    }

    private function contract(League $league, array $q): array
    {
        $start = config('campaign_slate.starts_at');
        $end = config('campaign_slate.ends_at');
        $c = ['slate_key' => $q['key'], 'source_url' => 'https://www.mako.co.il/news-israel-elections', 'window_starts_at' => $start, 'comparison' => 'gte', 'threshold' => count($q['parties'] ?? []) > 1 ? 61 : 4, 'yes_rule' => 'מספר המנדטים המדווח בסקר עומד בסף או גבוה ממנו.', 'no_rule' => 'מספר המנדטים המדווח נמוך מהסף. היעדר מפלגה אינו אפס.', 'void_rule' => 'אין סקר מתאים בחלון, חסרים נתונים, הרשימות השתנו או שאין הכרעה חד־משמעית: החזר מלא.', 'count_rules' => 'הסקר הארצי החדש הראשון של חדשות 12 ומדגם בחלון, בתרחיש הרשימות הנוכחי. תיקון סקר ישן אינו סקר חדש. יש לאמת שעת פרסום ומקור לפני אישור.'];
        $d = ['type' => 'poll_value', 'title' => $q['title'], 'closes_at' => $start, 'window_ends_at' => $end, 'probability' => $q['probability'], 'tag' => 'operator_edited', 'evidence' => $q['evidence'] ?? [], 'rationale' => $q['rationale'] ?? 'הערכת פתיחה סובייקטיבית שנבדקה לצורך הפיילוט; אינה תחזית מכוילת. הכללים והמקור קובעים את ההכרעה.', 'contract' => &$c];
        if ($q['kind'] === 'poll') {
            $c += ['subject' => count($q['parties']) === 1 ? $q['parties'][0] : 'frozen_bloc', 'parties' => $q['parties'], 'pollster' => 'Midgam R&C', 'publisher' => 'HaHadashot 12'];
            $labels = ['hendel' => 'המילואימניקים והכלכלית', 'amcha' => 'עמך ישראל', 'yashar' => 'ישר', 'beyachad' => 'ביחד', 'democrats' => 'הדמוקרטים', 'israel_beitenu' => 'ישראל ביתנו', 'raam' => 'רע״ם', 'joint_list' => 'המשותפת', 'likud' => 'הליכוד', 'shas' => 'ש״ס', 'utj' => 'יהדות התורה', 'otzma_yehudit' => 'עוצמה יהודית', 'religious_zionism' => 'הציונות הדתית–זהות'];
            $c['party_labels'] = array_intersect_key($labels, array_flip($q['parties']));
            $c['count_rules'] .= ' הרשימות הקבועות: '.implode(', ', $c['party_labels']).'.';
        } elseif (in_array($q['kind'], ['final', 'pm'])) {
            $d['type'] = 'deadline_event';
            $d['closes_at'] = LeagueController::deadlineLimit();
            $d['window_ends_at'] = '2027-01-31T23:59:00+02:00';
            $c['window_starts_at'] = $d['closes_at'];
            $c['source_url'] = 'https://www.gov.il/he/departments/units/central_elections_committee';
            $c['official_final'] = true;
            $c['comparison'] = 'event';
            $c['threshold'] = 1;
            $c['yes_rule'] = 'הרשימה המקורית עברה את אחוז החסימה לפי התוצאות הסופיות הרשמיות של ועדת הבחירות (3.25% מהקולות הכשרים).';
            $c['no_rule'] = 'התוצאות הסופיות הרשמיות קובעות שהרשימה לא עברה. פרישה נחשבת לא רק אם הבחירות התקיימו.';
            $c['void_rule'] = 'ביטול הבחירות, בחירות חלופיות, מיזוג לרשימה שונה או היעדר תוצאות רשמיות עד סוף ינואר: החזר.';
            $c['count_rules'] = 'אישור מנהל מול פרסום רשמי; אין להכריע לפי מדגם או ספירה חלקית.';
            if ($q['kind'] === 'pm') {
                $c['source_url'] = 'https://main.knesset.gov.il';
                unset($c['official_final']);
                $c['exclusive_key'] = 'next-pm-2026';
                $c['comparison'] = 'eq';
                $c['threshold'] = (int) substr($q['key'], 1);
                $c['exclusive_options'] = [1 => 'גדי איזנקוט', 2 => 'בנימין נתניהו', 3 => 'נפתלי בנט', 4 => 'אדם אחר'];
                $c['yes_rule'] = 'האדם הנקוב עומד בראש הממשלה החדשה הראשונה שהושבעה לאחר הבחירות. ברוטציה נחשב הראשון בלבד.';
                $c['no_rule'] = 'אדם אחר הושבע לראש אותה ממשלה; ארבע האפשרויות מוכרעות יחד.';
                if ($q['key'] === 'M4') {
                    $c['yes_rule'] = 'כל אדם פרט לגדי איזנקוט, בנימין נתניהו ונפתלי בנט הושבע לראש הממשלה החדשה הראשונה לאחר הבחירות.';
                    $c['no_rule'] = 'גדי איזנקוט, בנימין נתניהו או נפתלי בנט הושבע לראש הממשלה החדשה הראשונה לאחר הבחירות.';
                }
                $c['void_rule'] = 'אין ממשלה חדשה עד סוף ינואר, או שהוכרזו בחירות נוספות קודם לכן: החזר לכל ארבע האפשרויות.';
                $c['count_rules'] = 'ממשלת מעבר, המלצה לנשיא והסכם קואליציוני אינם השבעה. אחר כולל כל אדם פרט לאיזנקוט, נתניהו ובנט.';
            }
        } else {
            $news = $q['kind'] === 'news';
            $sources = DB::table('campaign_sources')->where('league_id', $league->id)->where('kind', $news ? 'news' : 'x')->when(! $news, fn ($query) => $query->where('external_id', $q['handle']))->get();
            if ($news) {
                $sources = $sources->filter(fn ($s) => isset(MonitorFeeds::catalog()[$s->external_id]));
            }
            $ready = $sources->count() === ($news ? 3 : 1) && ($news || config('campaign.x_bearer_token'));
            foreach ($sources as $source) {
                $run = DB::table('campaign_monitor_runs')->where('source_id', $source->id)->latest('id')->first();
                $ready = $ready && $run && $run->status === 'ok' && Time::parse($run->finished_at, 'UTC')->gte(now()->subMinutes(15));
            }
            // News odds must be approved for the narrower RSS scope and baseline before opening.
            $ready = $ready && config($news ? 'campaign.news_slate_approved' : 'campaign.x_slate_approved', false);
            if (! $ready) {
                $d['hold'] = $news ? 'ממתינים לאיסוף תקין, בסיס להשוואת פרסומים ואישור תמחור להיקף RSS המצומצם' : 'ממתינים לחיבור X, בדיקת האיסוף ואישור סיכויי הפתיחה';
            }
            $d['type'] = $news ? 'deadline_event' : 'mention_count';
            $c['source_url'] = $sources->first()?->url ?? ($news ? 'https://www.ynet.co.il' : 'https://x.com/'.$q['handle']);
            $c['source_id'] = $sources->first()?->id;
            $c['monitor'] = ['mode' => $news ? 'news_reporting' : $q['mode'], 'source_ids' => $sources->pluck('id')->values()->all()];
            $c['comparison'] = $news ? 'event' : 'gte';
            $c['threshold'] = ! $news && $q['mode'] === 'x_count' ? 5 : 1;
            if ($news) {
                $c['monitor'] += ['person' => $q['person'], 'scope' => 'rss_urich_headlines'];
                $c['yes_rule'] = 'כתבה בהזנות ynet, N12 או גלובס, שבה אוריך בכותרת או בתקציר, המציגה תוכן חדש מהתכתבות ישירה עם האדם הנקוב בענייני ציבור.';
                $c['no_rule'] = 'בחלון איסוף רציף לא נמצאה כתבה מתאימה וכל המועמדים נבדקו.';
                $c['void_rule'] = 'פערי איסוף, תוכן חסום, חדשנות לא מוכרעת או ייחוס שחזרו ממנו לפני אישור: החזר.';
                $c['count_rules'] = 'שלוש הזנות RSS בלבד, לא כל כתבות האתרים. אזכור שם, הכחשה או חזרה על מסר שכבר פורסם אינם נחשבים. אישור מנהל מול בסיס הפרסומים שנאסף.';
            } else {
                $d['window_ends_at'] = $q['mode'] === 'x_count' ? '2026-10-19T00:00:00+03:00' : '2026-10-19T09:00:00+03:00';
                if ($q['mode'] === 'x_next_mention') {
                    $c['monitor']['topic'] = $q['topic'];
                }
                $c['yes_rule'] = $q['mode'] === 'x_count' ? 'נאספו לפחות 5 פוסטים מקוריים בחלון.' : 'הפוסט המקורי הראשון בחלון מכיל מילת איראן או קטאר מהכלל המפורש.';
                $c['no_rule'] = $q['mode'] === 'x_count' ? 'נאספו עד 4 פוסטים ובדיקת הרציפות הושלמה.' : 'הגרסה המקורית של הפוסט הראשון נאספה ואינה מכילה מילה מתאימה.';
                $c['void_rule'] = 'חסר איסוף רציף או גרסה מקורית; בשאלת הפוסט הבא גם אין פוסט מתאים בחלון: החזר.';
                $c['count_rules'] = 'פוסטים מקוריים וטקסט עצמי של ציטוט בלבד; תגובות ושיתופים ללא תוספת אינם נספרים. תחילת החלון כלולה וסופו אינו כלול. טקסט בלבד, ללא מדיה וקישורים. מילת קטר לבדה אינה נחשבת בגלל עמימות. עריכות אינן מגדילות ספירה.';
                if ($q['probability'] === 5000 && empty($q['evidence'])) {
                    $d['tag'] = 'no_basis';
                }
            }
        }
        unset($d['contract']);
        $d['contract'] = $c;

        return $d;
    }
}

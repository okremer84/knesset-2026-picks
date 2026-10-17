<?php

namespace App\Services\Campaign;

use App\Models\Survey;

class QuestionSlate
{
    public function drafts(string $kind, string $start, string $end): array
    {
        $base = ['type' => 'deadline_event', 'closes_at' => $start, 'window_ends_at' => $end,
            'probability' => 5000, 'tag' => 'no_basis', 'rationale' => 'אין בסיס מספק; 50/50',
            'contract' => ['window_starts_at' => $start, 'comparison' => 'event', 'threshold' => 1,
                'void_rule' => 'אין אירוע מתאים בחלון או שאין ראיות חד־משמעיות — ביטול והחזר.']];
        if ($kind === 'prime_minister') {
            $rows = [];
            foreach ([['likud', 'בנימין נתניהו', 4000], ['yashar', 'גדי איזנקוט', 3500], ['beyachad', 'נפתלי בנט', 1500], ['israel_beitenu', 'אביגדור ליברמן', 500], [null, 'מועמד אחר', 500]] as [$portrait, $name, $p]) {
                $other = $portrait === null;
                $rows[] = [...$base, 'title' => $other ? 'האם מועמד אחר יהיה ראש הממשלה הבא?' : 'האם '.$name.' יהיה ראש הממשלה הבא?',
                    'probability' => $p, 'tag' => 'operator_edited', 'rationale' => 'הקצאת פתיחה סובייקטיבית למשחק: נתניהו 40%, איזנקוט 35%, בנט 15%, ליברמן 5%, אחר 5%. אינה סקר או תחזית מחקרית; יש לבדוק לפני הפרסום.',
                    'contract' => [...$base['contract'], 'source_url' => 'https://main.knesset.gov.il/',
                        'presentation' => ['family' => 'prime_minister', 'key' => 'pm:'.$start.':'.$end, 'label' => $name, 'portrait' => $portrait],
                        'yes_rule' => 'הממשלה הראשונה שמושבעת אחרי הבחירות לכנסת ה־26 ובתוך החלון מקבלת אמון בכנסת, ובראשה '.($other ? 'אדם שאינו נתניהו, איזנקוט, בנט או ליברמן.' : $name.'.'),
                        'no_rule' => 'ממשלה מתאימה הושבעה בחלון ובראשה '.($other ? 'אחד מארבעת המועמדים הנקובים.' : 'אדם אחר. הצבעת אמון היא הקובעת, לא הטלת המנדט.'),
                        'count_rules' => 'מקור: פרוטוקול הצבעת האמון והודעת הכנסת. כהונת מעבר או מילוי מקום אינם נחשבים. ברוטציה נחשב הראשון שמושבע, לא ראש הממשלה החלופי. אם לא הושבעה ממשלה מתאימה עד סוף החלון, כל שאלות המשפחה מבוטלות.']];
            }

            return $rows;
        }
        if ($kind === 'interview') {
            $rows = [];
            foreach (['חדשות 14' => 3000, 'כאן 11' => 1500, 'חדשות 12' => 1000, 'חדשות 13' => 1000, 'i24NEWS' => 1000, 'רדיו' => 1500, 'גוף אחר' => 1000] as $venue => $p) {
                $rows[] = [...$base, 'title' => 'האם הריאיון הבא של נתניהו יהיה ב'.$venue.'?', 'probability' => $p, 'tag' => 'operator_edited',
                    'rationale' => 'הערכת פתיחה סובייקטיבית, לא תדירות מדודה או הזמנה מאומתת. ראיונות 13–14 באוקטובר בערוץ 14 ובגלי ישראל הם הקשר בלבד; יש לבדוק מחדש לפני פרסום.',
                    'evidence' => ['https://www.c14.co.il/article/1737177', 'https://www.gly.co.il/item?id=73391'],
                    'contract' => [...$base['contract'], 'source_url' => 'https://www.gov.il/he/departments/prime_ministers_office',
                        'presentation' => ['family' => 'interview', 'key' => 'interview:'.$start.':'.$end, 'label' => $venue, 'portrait' => null],
                        'yes_rule' => 'הריאיון המלא הראשון החדש של נתניהו שמתפרסם בחלון בכלי תקשורת ישראלי משודר במקור ב'.$venue.'.',
                        'no_rule' => 'קיים ריאיון מתאים ראשון בחלון והוא משודר במקור באחת האפשרויות האחרות.',
                        'count_rules' => 'ריאיון הוא שאלות ותשובות עם מראיין, לפחות 5 דקות. לא נאום, מסיבת עיתונאים, קליפ קידום או שידור חוזר. קובע זמן הפרסום הראשון, לא ההקלטה. רדיו כולל כל תחנות הרדיו; גוף אחר כולל גוף ישראלי שאינו 11/12/13/14/i24 או רדיו. שידור סימולטני ללא מקור יחיד, או בלי הקלטה מלאה ומועד מאומת — ביטול. יש לשמור קישור ישיר להקלטה הרשמית; אין ריאיון בחלון — כל האפשרויות מבוטלות.']];
            }

            return $rows;
        }
        $rows = [];
        foreach (['Kan 11' => 'כאן 11', 'HaHadashot 12' => 'חדשות 12', 'Channel 13' => 'חדשות 13', 'Channel 14' => 'חדשות 14'] as $publisher => $label) {
            $poll = Survey::where('active', true)->where('kind', 'opinion_poll')->get()->pluck('payload')->filter(fn ($p) => ($p['channelOrMedia'] ?? '') === $publisher && ($p['date'] ?? '') <= now()->toDateString())->sortByDesc('date')->first();
            if (! $poll) {
                continue;
            }
            foreach (['likud' => 'הליכוד', 'bloc:opposition' => 'גוש האופוזיציה (ללא המפלגות הערביות)'] as $subject => $name) {
                $members = ['yashar', 'beyachad', 'democrats', 'israel_beitenu', 'kachol_lavan'];
                $value = $subject === 'likud' ? ($poll['seats']['likud'] ?? null) : (array_diff($members, array_keys($poll['seats'])) ? null : array_sum(array_intersect_key($poll['seats'], array_flip($members))));
                if (! is_numeric($value)) {
                    continue;
                }
                $rows[] = [...$base, 'type' => 'poll_value', 'title' => 'האם '.$name.' יקבל יותר מ־'.$value.' מנדטים בסקר הבא של '.$label.'?',
                    'rationale' => 'סף לפי הסקר האחרון השמור של '.$label.' מ־'.$poll['date'].': '.$value.' מנדטים. אין אומדן הסתברות מחושב; 50/50. יש לאמת מול המקור לפני פרסום.',
                    'evidence' => [$poll['sourceUrl']],
                    'contract' => [...$base['contract'], 'source_url' => $poll['sourceUrl'], 'subject' => $subject, 'pollster' => $poll['institute'], 'publisher' => $publisher, 'comparison' => 'gt', 'threshold' => $value,
                        'yes_rule' => 'בסקר הארצי החדש הראשון של '.$label.' ומכון '.$poll['institute'].' בחלון, '.$name.' מקבל יותר מ־'.$value.' מנדטים.',
                        'no_rule' => 'פורסם סקר מתאים ובו המספר הוא '.$value.' או פחות.',
                        'count_rules' => 'תרחיש רשימות רגיל בלבד, ללא איחודים היפותטיים. אין סקר, מפלגה חסרה או תרחיש עמום — ביטול. '.($subject === 'likud' ? 'מנדטים של הליכוד בלבד.' : 'סכום קבוע של ישר!, ביחד, הדמוקרטים, ישראל ביתנו וכחול לבן. לא כולל מפלגות ערביות או עצמאיות. מספר חסר אינו אפס; שינוי הרכב או מיזוג — ביטול.').' יש לאמת את מועד הפרסום הראשון וקישור הסקר המקורי.']];
            }
        }

        return $rows;
    }
}

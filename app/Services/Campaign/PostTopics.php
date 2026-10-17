<?php

namespace App\Services\Campaign;

use Illuminate\Support\Facades\DB;

class PostTopics
{
    public static function catalog(): array
    {
        return [
            'iran' => ['label' => 'איראן', 'he' => 'איראן|איראני|איראנית|איראנים|איראניות', 'en' => 'Iran|Iranian'],
            'qatar' => ['label' => 'קטאר או קטארגייט', 'he' => 'קטאר|קטארי|קטארית|קטארים|קטאריות|קטארגייט|קטרגייט', 'en' => 'Qatar|Qatari|Qatargate'],
            'war' => ['label' => 'מלחמה', 'he' => 'מלחמה|מלחמת|מלחמות', 'en' => 'war|wars'],
            'conscription' => ['label' => 'גיוס או השתמטות', 'he' => 'גיוס|להתגייס|מתגייסים|השתמטות|משתמטים|משתמט', 'en' => 'conscription|enlistment|draft'],
            'hostages' => ['label' => 'חטופים', 'he' => 'חטוף|חטופה|חטופים|חטופות', 'en' => 'hostage|hostages'],
            'elections' => ['label' => 'בחירות', 'he' => 'בחירות|קלפי|קלפיות', 'en' => 'election|elections|ballot'],
        ];
    }

    public static function matches(string $text, string $topic): array
    {
        $definition = self::catalog()[$topic] ?? null;
        if (! $definition) {
            return [];
        }
        $text = preg_replace('~https?://\S+~u', '', $text);
        preg_match_all('/(?<![\p{L}\p{N}])(?:[ובכלמשה]{0,3}(?:'.$definition['he'].')|'.$definition['en'].')(?![\p{L}\p{N}])/iu', $text, $matches);

        return array_values(array_unique($matches[0]));
    }

    public static function rules(string $topic): string
    {
        $d = self::catalog()[$topic];

        return 'מילות מפתח בלבד, לא סיווג נושא: '.str_replace('|', ', ', $d['he'].'|'.$d['en']).'. בעברית מתקבלות עד שלוש אותיות תחילית מתוך ובכלמשה. באנגלית אין הבחנה באותיות גדולות. קישורים, שמע, תמונות וטקסט מצוטט מצורף אינם נספרים. אותה מילה יכולה להופיע בהקשר אחר ועדיין להיספר.';
    }

    public static function sample(int $sourceId, ?string $before = null): array
    {
        // Preserve the same qualification and original-version rules as settlement.
        $posts = DB::table('campaign_observations')->where('source_id', $sourceId)
            ->where('published_at', '<', $before ?? now())->orderByDesc('published_at')->orderByDesc('id')->get()
            ->filter(fn ($r) => (json_decode($r->metadata, true)['original_captured'] ?? false))->take(30);
        $n = $posts->count();
        $topics = [];
        foreach (self::catalog() as $key => $d) {
            $hits = $posts->filter(fn ($r) => count(self::matches($r->text, $key)) > 0)->count();
            // Beta(1,1) smoothing avoids treating a small sample as certainty.
            $topics[$key] = ['label' => $d['label'], 'hits' => $hits, 'sample_size' => $n,
                'frequency' => $n ? round($hits / $n * 100, 1) : null,
                'probability' => $n >= 20 ? max(500, min(9500, (int) round(($hits + 1) / ($n + 2) * 10000))) : 5000];
        }

        return ['size' => $n, 'topics' => $topics, 'urls' => $posts->pluck('url')->all(), 'from' => $posts->last()?->published_at, 'to' => $posts->first()?->published_at];
    }
}

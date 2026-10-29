<?php

namespace App\Services;

use Carbon\CarbonImmutable;
use DOMDocument;
use DOMXPath;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class YnetResults
{
    public function fetch(?string $sourceUrl = null): array
    {
        $url = $this->blogUrl($sourceUrl ?? config('election.results_source_url'))
            ?? throw new RuntimeException('Invalid Ynet results source URL');
        $visited = [];
        // Bound both the continuation chain and its total request time below the import lock.
        for ($page = 0; $page < 3; $page++) {
            if (isset($visited[$url])) {
                throw new RuntimeException('Ynet blog continuation forms a loop');
            }
            $visited[$url] = true;
            $response = Http::withUserAgent(config('election.user_agent'))->accept('text/html')
                ->connectTimeout(5)->timeout(20)->withoutRedirecting()->get($url)->throw();
            if (! $response->successful()) {
                throw new RuntimeException('Unexpected Ynet response status: '.$response->status());
            }
            $html = $response->body();
            $next = $this->continuationUrl($this->document($html));
            if ($next !== null) {
                $url = $next;

                continue;
            }

            return $this->parse($html, $url);
        }
        throw new RuntimeException('Too many Ynet blog continuations');
    }

    public function parse(string $html, ?string $sourceUrl = null): array
    {
        $xpath = $this->document($html);
        if ($this->continuationUrl($xpath) !== null) {
            throw new RuntimeException('Ynet blog has ended; use its continuation for current results');
        }
        $candidates = [];
        $progressUpdates = [];
        foreach ($xpath->query('//*[@data-post-id]') as $post) {
            $heading = $xpath->evaluate('string(.//h3)', $post);
            $body = $xpath->evaluate('string(.//*[contains(@class,"blogs-auto-feed-item__body")])', $post);
            // Ignore exit polls, city percentages, speeches and bloc-only updates.
            if (str_contains($heading, 'מדג') || ! preg_match('/נספרו|ספיר[הת]/u', $heading.' '.$body)) {
                continue;
            }
            $breakdowns = [];
            foreach ($xpath->query('.//*[contains(concat(" ",normalize-space(@class)," ")," text_editor_paragraph ")]', $post) as $paragraph) {
                $text = preg_replace('/\([^)]*\)/u', '', $paragraph->textContent);
                if (str_contains($text, 'מדג') || ! str_contains($text.' '.$heading, 'מנדטים') || ! str_contains($text, 'ליכוד')) {
                    continue;
                }
                $seats = $this->seats($text);
                if (count($seats) >= 5) {
                    $breakdowns[] = $seats;
                }
            }
            $unchanged = ! $breakdowns && $this->isUnchangedNationalProgress($heading, $body);
            if (! $breakdowns && ! $unchanged) {
                continue;
            }
            $time = $xpath->evaluate('string(.//time/@datetime)', $post);
            if (! preg_match('/^\d{4}-\d{2}-\d{2}T/', $time)) {
                throw new RuntimeException('Result update has no publication timestamp');
            }
            $update = ['text' => $heading.' '.$body, 'publishedAt' => CarbonImmutable::parse($time)->toIso8601String()];
            foreach ($breakdowns as $seats) {
                $candidates[] = ['seats' => $seats, ...$update];
            }
            if ($unchanged) {
                $progressUpdates[] = $update;
            }
        }
        usort($candidates, fn ($a, $b) => strcmp($b['publishedAt'], $a['publishedAt']));
        $latest = $candidates[0] ?? throw new RuntimeException('No national seat-count update found');
        if (array_sum($latest['seats']) !== 120) {
            throw new RuntimeException('Latest national breakdown does not total 120 seats');
        }
        $counted = $this->countedPercentage($latest['text']);
        $seatsPublishedAt = $latest['publishedAt'];
        usort($progressUpdates, fn ($a, $b) => strcmp($b['publishedAt'], $a['publishedAt']));
        $progress = $progressUpdates[0] ?? null;
        if ($progress && strcmp($progress['publishedAt'], $latest['publishedAt']) > 0) {
            // Only an explicit confirmation of unchanged party mandates may reuse a breakdown.
            $counted = $this->countedPercentage($progress['text']);
            $latest['publishedAt'] = $progress['publishedAt'];
        }

        return [
            'id' => 'actual-2026-ynet', 'kind' => 'actual_results',
            'title' => 'תוצאות אמת · ספירת הקולות', 'date' => config('election.date'),
            'institute' => 'ספירת הקולות כפי שדווחה ב־ynet', 'channelOrMedia' => 'ynet',
            'sourceUrl' => $sourceUrl ?? config('election.results_source_url'),
            'publishedAt' => $latest['publishedAt'], 'countedPercentage' => $counted,
            ...($seatsPublishedAt !== $latest['publishedAt'] ? ['seatsPublishedAt' => $seatsPublishedAt] : []),
            // A complete 120-seat allocation implies zero for the unallocated parties.
            'seats' => array_replace(array_fill_keys(array_keys(config('election.parties')), 0), $latest['seats']),
            'notes' => 'חלוקת המנדטים לפי הספירה שדווחה ב־ynet. התוצאות עשויות להשתנות עד לאישורן הסופי.',
        ];
    }

    private function countedPercentage(string $text): float
    {
        if (! preg_match('/(\d+(?:\.\d+)?)%\s*(?:מ(?:כלל)?\s*)?ה?קולות/u', $text, $counted)
            || (float) $counted[1] <= 0 || (float) $counted[1] > 100) {
            throw new RuntimeException('Latest national breakdown has no valid counted-vote percentage');
        }

        return (float) $counted[1];
    }

    private function isUnchangedNationalProgress(string $heading, string $body): bool
    {
        return preg_match('/^\s*(?:כ[-־]?)?\d+(?:\.\d+)?%\s+מהקולות\s+נספרו\s*(?:[-–—:|]|$)/u', $heading)
            && str_contains($body, 'ועדת הבחירות המרכזית')
            && ! str_contains($body, 'מדג')
            && preg_match('/אין שינוי[^.!?]{0,100}(?:במספר המנדטים|בתמונת המנדטים|במנדטים)/u', $body)
            && $this->seats($body) === [];
    }

    private function document(string $html): DOMXPath
    {
        $dom = new DOMDocument;
        $previous = libxml_use_internal_errors(true);
        try {
            $dom->loadHTML('<?xml encoding="UTF-8">'.$html, LIBXML_NONET);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }

        return new DOMXPath($dom);
    }

    private function continuationUrl(DOMXPath $xpath): ?string
    {
        foreach ($xpath->query('//*[@data-post-id]') as $post) {
            $heading = $xpath->evaluate('string(.//h3)', $post);
            $paragraphs = $xpath->query('.//*[contains(concat(" ",normalize-space(@class)," ")," text_editor_paragraph ")]', $post);
            $announcement = $heading.' '.($paragraphs->item(0)?->textContent ?? '');
            if (! preg_match('/העדכונים.{0,80}הסתיימו|הבלוג.{0,80}(?:הסתיים|נסגר)/u', $announcement)) {
                continue;
            }
            $urls = [];
            foreach ($paragraphs as $paragraph) {
                if (! preg_match('/(?:עדכונים|בלוג).{0,80}חדש/u', $paragraph->textContent)) {
                    continue;
                }
                foreach ($xpath->query('.//a[@href]', $paragraph) as $link) {
                    $url = $this->blogUrl($link->getAttribute('href'));
                    if ($url !== null) {
                        $urls[$url] = true;
                    }
                }
            }
            if (count($urls) !== 1) {
                throw new RuntimeException('Ynet blog has ended without one valid continuation link');
            }

            return array_key_first($urls);
        }

        return null;
    }

    private function blogUrl(string $url): ?string
    {
        $url = trim($url);
        if (str_starts_with($url, '//')) {
            $url = 'https:'.$url;
        } elseif (str_starts_with($url, '/')) {
            $url = 'https://www.ynet.co.il'.$url;
        }
        $parts = parse_url($url);
        if (! $parts || ($parts['scheme'] ?? '') !== 'https'
            || ! in_array(strtolower($parts['host'] ?? ''), ['www.ynet.co.il', 'ynet.co.il'], true)
            || isset($parts['port']) || isset($parts['user']) || isset($parts['pass'])
            || ! preg_match('~^/news/blogs/article/[a-z0-9]+$~i', $parts['path'] ?? '')) {
            return null;
        }

        return 'https://www.ynet.co.il'.$parts['path'];
    }

    private function seats(string $text): array
    {
        $aliases = [
            'likud' => 'הליכוד|ליכוד', 'yashar' => 'ישר!?', 'beyachad' => 'ביחד',
            'joint_list' => 'הרשימה המשותפת|המשותפת', 'utj' => 'יהדות התורה',
            'israel_beitenu' => 'ישראל ביתנו', 'democrats' => 'הדמוקרטים',
            'otzma_yehudit' => 'עוצמה יהודית', 'shas' => 'ש["״]ס',
            'religious_zionism' => 'הציונות הדתית(?:\s*(?:[-–—־+]\s*|ו\s*)זהות)?', 'raam' => 'רע["״][מם]',
            'amcha' => 'עמך ישראל', 'hendel' => 'המילואימניקים(?: והכלכלית)?',
            'kachol_lavan' => 'כחול לבן', 'balad' => 'בל["״]ד',
        ];
        $seats = [];
        foreach ($aliases as $id => $name) {
            $pattern = '/(?:^|[\s,;])ו?(?:'.$name.')(?:\s+(?:מוביל[הת]?|עם|מקבל[ת]?|קיבל[ה]?|עומד[ת]?|על|זוכה|ל))*(?:\s*[-–—:־]\s*|\s+)(\d{1,3})(?!\d|[.,]\d|%)/u';
            if (preg_match_all($pattern, $text, $matches)) {
                if (count($matches[1]) !== 1) {
                    throw new RuntimeException('Ambiguous seat count for '.$id);
                }
                $seats[$id] = (int) $matches[1][0];
            }
        }

        return $seats;
    }
}

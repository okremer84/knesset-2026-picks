<?php

namespace App\Services;

use Carbon\CarbonImmutable;
use DOMDocument;
use DOMXPath;
use RuntimeException;

class YnetResults
{
    public function parse(string $html): array
    {
        $dom = new DOMDocument;
        $previous = libxml_use_internal_errors(true);
        try {
            $dom->loadHTML('<?xml encoding="UTF-8">'.$html, LIBXML_NONET);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
        $xpath = new DOMXPath($dom);
        $candidates = [];
        foreach ($xpath->query('//*[@data-post-id]') as $post) {
            $heading = $xpath->evaluate('string(.//h3)', $post);
            $body = $xpath->evaluate('string(.//*[contains(@class,"blogs-auto-feed-item__body")])', $post);
            // Ignore exit polls, city percentages, speeches and bloc-only updates.
            if (str_contains($heading, 'מדג') || ! preg_match('/נספרו|ספיר[הת]/u', $heading.' '.$body)) {
                continue;
            }
            foreach ($xpath->query('.//*[contains(concat(" ",normalize-space(@class)," ")," text_editor_paragraph ")]', $post) as $paragraph) {
                $text = preg_replace('/\([^)]*\)/u', '', $paragraph->textContent);
                if (str_contains($text, 'מדג') || ! str_contains($text.' '.$heading, 'מנדטים') || ! str_contains($text, 'ליכוד')) {
                    continue;
                }
                $seats = $this->seats($text);
                if (count($seats) < 5) {
                    continue;
                }
                $time = $xpath->evaluate('string(.//time/@datetime)', $post);
                if (! preg_match('/^\d{4}-\d{2}-\d{2}T/', $time)) {
                    throw new RuntimeException('Result update has no publication timestamp');
                }
                $candidates[] = ['seats' => $seats, 'text' => $heading.' '.$body,
                    'publishedAt' => CarbonImmutable::parse($time)->toIso8601String()];
            }
        }
        usort($candidates, fn ($a, $b) => strcmp($b['publishedAt'], $a['publishedAt']));
        $latest = $candidates[0] ?? throw new RuntimeException('No national seat-count update found');
        if (array_sum($latest['seats']) !== 120) {
            throw new RuntimeException('Latest national breakdown does not total 120 seats');
        }
        if (! preg_match('/(\d+(?:\.\d+)?)%\s*(?:מ(?:כלל)?\s*)?ה?קולות/u', $latest['text'], $counted)
            || (float) $counted[1] <= 0 || (float) $counted[1] > 100) {
            throw new RuntimeException('Latest national breakdown has no valid counted-vote percentage');
        }

        return [
            'id' => 'actual-2026-ynet', 'kind' => 'actual_results',
            'title' => 'תוצאות אמת · ספירת הקולות', 'date' => config('election.date'),
            'institute' => 'ספירת הקולות כפי שדווחה ב־ynet', 'channelOrMedia' => 'ynet',
            'sourceUrl' => config('election.results_source_url'),
            'publishedAt' => $latest['publishedAt'], 'countedPercentage' => (float) $counted[1],
            // A complete 120-seat allocation implies zero for the unallocated parties.
            'seats' => array_replace(array_fill_keys(array_keys(config('election.parties')), 0), $latest['seats']),
            'notes' => 'חלוקת המנדטים לפי הספירה שדווחה ב־ynet. התוצאות עשויות להשתנות עד לאישורן הסופי.',
        ];
    }

    private function seats(string $text): array
    {
        $aliases = [
            'likud' => 'הליכוד|ליכוד', 'yashar' => 'ישר!?', 'beyachad' => 'ביחד',
            'joint_list' => 'הרשימה המשותפת|המשותפת', 'utj' => 'יהדות התורה',
            'israel_beitenu' => 'ישראל ביתנו', 'democrats' => 'הדמוקרטים',
            'otzma_yehudit' => 'עוצמה יהודית', 'shas' => 'ש["״]ס',
            'religious_zionism' => 'הציונות הדתית(?:\s*[-–־+]\s*זהות)?', 'raam' => 'רע["״][מם]',
            'amcha' => 'עמך ישראל', 'hendel' => 'המילואימניקים(?: והכלכלית)?',
            'kachol_lavan' => 'כחול לבן', 'balad' => 'בל["״]ד',
        ];
        $seats = [];
        foreach ($aliases as $id => $name) {
            $pattern = '/(?:^|[\s,])(?:'.$name.')(?:\s+(?:מוביל[הת]?|עם|מקבל[ת]?|קיבל[ה]?|עומד[ת]?|על|זוכה|ל))*\s*[-–—:־]?\s+(\d{1,3})(?!\d|[.,]\d|%)/u';
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

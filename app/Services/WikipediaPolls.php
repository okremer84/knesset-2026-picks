<?php

namespace App\Services;

use DOMDocument;
use DOMElement;
use DOMXPath;
use RuntimeException;

class WikipediaPolls
{
    private function clean(DOMElement $cell): string
    {
        $doc = new DOMDocument;
        $copy = $doc->importNode($cell, true);
        $doc->appendChild($copy);
        $xp = new DOMXPath($doc);
        foreach ($xp->query('//sup | //*[contains(concat(" ",normalize-space(@class)," ")," sortkey ")]') as $node) {
            $node->parentNode->removeChild($node);
        }
        // textContent joins adjacent elements; inserting spaces matches rendered table labels.
        foreach ($xp->query('//*') as $node) {
            $node->appendChild($doc->createTextNode(' '));
        }

        return trim(preg_replace('/\s+/u', ' ', $copy->textContent));
    }

    private function grid(DOMElement $table): iterable
    {
        $pending = [];
        foreach ($table->getElementsByTagName('tr') as $tr) {
            $row = [];
            $next = [];
            foreach ($pending as $col => [$cell, $left]) {
                $row[$col] = $cell;
                if ($left > 1) {
                    $next[$col] = [$cell, $left - 1];
                }
            }
            $pending = $next;
            $col = 0;
            foreach ($tr->childNodes as $cell) {
                if (! $cell instanceof DOMElement || ! in_array($cell->tagName, ['th', 'td'])) {
                    continue;
                }
                while (isset($row[$col])) {
                    $col++;
                }
                $width = max(1, (int) $cell->getAttribute('colspan'));
                $height = max(1, (int) $cell->getAttribute('rowspan'));
                if ($width > 100 || $height > 1000) {
                    throw new RuntimeException('Unexpected table span');
                }
                for ($i = 0; $i < $width; $i++) {
                    $row[$col + $i] = $cell;
                    if ($height > 1) {
                        $pending[$col + $i] = [$cell, $height - 1];
                    }
                }
                $col += $width;
            }
            ksort($row);
            yield $row;
        }
    }

    public function parse(string $html): array
    {
        $previous = libxml_use_internal_errors(true);
        try {
            $doc = new DOMDocument;
            $doc->loadHTML('<?xml encoding="UTF-8">'.$html, LIBXML_NONET);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
        $xp = new DOMXPath($doc);
        $section = $subsection = '';
        $polls = [];
        foreach ($xp->query('//h2 | //h3 | //table') as $node) {
            if ($node->tagName === 'h2') {
                $section = $this->clean($node);
                $subsection = '';

                continue;
            }
            if ($node->tagName === 'h3') {
                $subsection = $this->clean($node);

                continue;
            }
            if ($section !== 'Seat projections' || $subsection !== '2026' || ! str_contains(' '.$node->getAttribute('class').' ', ' wikitable ')) {
                continue;
            }
            $headers = [];
            foreach ($this->grid($node) as $row) {
                if (! isset($row[0])) {
                    continue;
                }
                $date = $row[0]->getAttribute('data-sort-value');
                $unique = count(array_unique(array_map('spl_object_id', $row)));
                if (! preg_match('/^2026-\d{2}-\d{2}$/', $date)) {
                    $isHeader = false;
                    foreach ($row as $i => $cell) {
                        if ($cell->tagName === 'th') {
                            $isHeader = true;
                            if ($value = $this->clean($cell)) {
                                $headers[$i] = $value;
                            }
                        }
                    }
                    if (! $isHeader && $unique > 5 && trim($this->clean($row[0])) !== '' && ! preg_match('/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug)\b/', $this->clean($row[0]))) {
                        throw new RuntimeException('Unrecognized poll date; review required: '.$date.' / '.$this->clean($row[0]));
                    }

                    continue;
                }
                if ($unique < 5 || $date < config('election.mapping_from')) {
                    continue;
                }
                $parsed = \DateTimeImmutable::createFromFormat('!Y-m-d', $date);
                if (! $parsed || $parsed->format('Y-m-d') !== $date) {
                    throw new RuntimeException('Invalid fieldwork date');
                }
                $meta = [];
                foreach ($row as $i => $cell) {
                    $meta[$headers[$i] ?? ''] = $cell;
                }
                foreach (['Polling firm', 'Publisher', 'Sample size'] as $label) {
                    if (! isset($meta[$label])) {
                        throw new RuntimeException('Metadata columns changed');
                    }
                }
                $firm = $this->clean($meta['Polling firm']);
                $publisher = $this->clean($meta['Publisher']);
                $sources = [];
                foreach (['Polling firm', 'Publisher'] as $label) {
                    foreach ($xp->query('.//sup//a[@href]', $meta[$label]) as $ref) {
                        $fragment = parse_url($ref->getAttribute('href'), PHP_URL_FRAGMENT);
                        if (! $fragment || ! preg_match('/^[a-zA-Z0-9_.:-]+$/', $fragment)) {
                            continue;
                        }
                        foreach ($xp->query('//*[@id="'.$fragment.'"]//a[contains(concat(" ",@class," ")," external ")][@href]') as $link) {
                            $url = $link->getAttribute('href');
                            if (str_starts_with($url, 'https://')) {
                                $sources[] = $url;
                            }
                        }
                    }
                }
                $sources = array_values(array_unique($sources));
                sort($sources);
                if (! $sources) {
                    throw new RuntimeException('No original source link resolved');
                }
                $seen = [];
                $seats = [];
                $percent = [];
                foreach ($row as $i => $cell) {
                    $label = $headers[$i] ?? '';
                    if (in_array($label, ['Fieldwork date', 'Polling firm', 'Publisher', 'Sample size', 'Gov.', 'Others', 'Other'])) {
                        continue;
                    }
                    $identity = spl_object_id($cell);
                    if (isset($seen[$identity])) {
                        continue;
                    }
                    $seen[$identity] = true;
                    $labels = [];
                    foreach ($row as $j => $same) {
                        if ($same === $cell) {
                            $labels[] = $headers[$j] ?? '';
                        }
                    }
                    $label = implode(' / ', array_unique($labels));
                    $id = config('election.aliases')[$label] ?? null;
                    if (! $id || isset($seats[$id])) {
                        throw new RuntimeException('Unmapped or duplicate party: '.$label);
                    }
                    $raw = $this->clean($cell);
                    if (preg_match('/^\d+$/', $raw)) {
                        $seats[$id] = (int) $raw;
                    } elseif (preg_match('/^\(?([0-9]+(?:\.[0-9]+)?)%\)?$/', $raw, $m) && (float) $m[1] < 3.25) {
                        $seats[$id] = 0;
                        $percent[$id] = (float) $m[1];
                    } else {
                        throw new RuntimeException('Unknown seat value for '.$label.': '.$raw);
                    }
                }
                $missing = array_values(array_diff(array_keys(config('election.parties')), array_keys($seats)));
                if (array_sum($seats) !== 120 || array_diff($missing, ['balad'])) {
                    throw new RuntimeException('Incomplete poll or invalid seat total');
                }
                // Match the Python importer's stable identity (JSON separators include spaces).
                $identity = '['.implode(', ', array_map(fn ($s) => json_encode($s, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), [$date, mb_strtolower($firm), mb_strtolower($publisher)])).']';
                $id = 'wiki-'.hash('sha256', $identity);
                if (isset($polls[$id])) {
                    throw new RuntimeException('Duplicate poll identity requires review');
                }
                $blocs = ['coalition' => 0, 'opposition' => 0, 'arab' => 0, 'other' => 0];
                foreach (config('election.parties') as $party => $info) {
                    $blocs[$info['bloc']] += $seats[$party] ?? 0;
                }
                $sample = str_replace(',', '', $this->clean($meta['Sample size']));
                $polls[$id] = ['id' => $id, 'kind' => 'opinion_poll', 'title' => $publisher.' · '.$date, 'institute' => $firm, 'channelOrMedia' => $publisher, 'date' => $date,
                    'seats' => $seats, 'blocs' => $blocs, 'source' => 'wikipedia', 'sourceUrl' => config('election.source_url'), 'originalSourceUrls' => $sources,
                    'syncedAt' => now()->toIso8601String(), 'votePercentages' => $percent ?: new \stdClass, 'notReportedPartyIds' => $missing,
                    'notes' => 'תאריכי הסקר במקור: '.$this->clean($row[0]).'. נתוני הסקר נאספו מוויקיפדיה; חלוקת הגושים מחושבת לפי הגדרות המשחק.'];
                if (ctype_digit($sample)) {
                    $polls[$id]['sampleSize'] = (int) $sample;
                }
            }
        }
        if (! $polls) {
            throw new RuntimeException('No current mapped polls; source layout may have changed');
        }
        uasort($polls, fn ($a, $b) => strcmp($b['date'], $a['date']) ?: strcmp($a['id'], $b['id']));

        return array_values($polls);
    }
}

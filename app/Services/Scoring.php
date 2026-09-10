<?php

namespace App\Services;

class Scoring
{
    public function score(array $predicted, array $actual): array
    {
        $error = 0;
        $exact = 0;
        // Only reported benchmark parties are scored; unknown is not zero.
        foreach ($actual as $id => $seats) {
            $diff = abs(($predicted[$id] ?? 0) - $seats);
            $error += $diff;
            if ($diff === 0 && $seats > 0) {
                $exact++;
            }
        }

        return ['error' => $error, 'exactHits' => $exact];
    }
}

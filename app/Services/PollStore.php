<?php

namespace App\Services;

use App\Models\Survey;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class PollStore
{
    public function store(array $poll): Survey
    {
        Validator::make($poll, [
            'id' => 'required|string|max:80', 'kind' => ['required', Rule::in(['opinion_poll', 'exit_poll', 'official_results'])],
            'title' => 'required|string|max:300', 'date' => 'required|date_format:Y-m-d',
            'institute' => 'required|string', 'channelOrMedia' => 'required|string',
            'sourceUrl' => 'required|url:https',
            'seats' => ['required', 'array:'.implode(',', array_keys(config('election.parties')))],
            'seats.*' => 'required|integer|min:0|max:120',
        ])->validate();
        foreach ($poll['seats'] as $value) {
            if (! is_int($value)) {
                throw new \InvalidArgumentException('Seats must be JSON integers');
            }
        }
        if (array_sum($poll['seats']) !== 120) {
            throw new \InvalidArgumentException('Poll seats must sum to 120');
        }
        $missing = array_values(array_diff(array_keys(config('election.parties')), array_keys($poll['seats'])));
        if ($poll['kind'] !== 'opinion_poll' && $missing) {
            throw new \InvalidArgumentException('Election results must report every party explicitly');
        }
        $poll['notReportedPartyIds'] = $missing;
        $stable = $poll;
        unset($stable['syncedAt']);
        $canonical = function (array $a) use (&$canonical): array {
            if (! array_is_list($a)) {
                ksort($a);
            }

            return array_map(fn ($v) => is_array($v) ? $canonical($v) : $v, $a);
        };
        $hash = hash('sha256', json_encode($canonical($stable), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));

        return DB::transaction(function () use ($poll, $hash) {
            DB::table('survey_revisions')->insertOrIgnore(['survey_id' => $poll['id'], 'content_hash' => $hash, 'payload' => json_encode($poll, JSON_THROW_ON_ERROR), 'created_at' => now()]);

            return Survey::updateOrCreate(['id' => $poll['id']], ['kind' => $poll['kind'], 'payload' => $poll, 'content_hash' => $hash, 'active' => true]);
        });
    }
}

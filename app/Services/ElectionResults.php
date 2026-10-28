<?php

namespace App\Services;

use App\Models\Survey;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class ElectionResults
{
    public function current(): ?array
    {
        return Survey::where('active', true)->whereIn('kind', ['actual_results', 'official_results'])->get()
            ->filter(fn ($s) => ($s->payload['date'] ?? '') >= config('election.date')
                && ($s->payload['date'] ?? '') <= now('Asia/Jerusalem')->toDateString())
            ->sort(fn ($a, $b) => ($b->kind === 'official_results') <=> ($a->kind === 'official_results')
                ?: strcmp($b->payload['publishedAt'] ?? $b->payload['date'], $a->payload['publishedAt'] ?? $a->payload['date']))
            ->first()?->payload;
    }

    public function feed(): array
    {
        $result = $this->current();
        $sync = DB::table('election_result_syncs')->where('id', 1)->first();
        $lastSuccess = $sync?->last_success_at ?? $result['syncedAt'] ?? null;

        return ['surveys' => $result ? [$result] : [], 'sync' => [
            'status' => $sync?->status ?? 'pending',
            'checkedAt' => $sync?->checked_at,
            'lastSuccessAt' => $lastSuccess,
            'stale' => ! $lastSuccess || now()->diffInSeconds(CarbonImmutable::parse($lastSuccess), true) > 600,
        ]];
    }
}

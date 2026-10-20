<?php

namespace App\Jobs;

use App\Services\Campaign\Settlement;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class SettleCampaign implements ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    public function __construct(public string $leagueId, public array $ids) {}

    public function backoff(): array
    {
        return [5, 30, 120, 300];
    }

    public function handle(Settlement $settlement): void
    {
        if (! config('campaign.enabled') || ! config('campaign.processing_enabled')) {
            return;
        }
        $settlement->finish($this->leagueId, $this->ids);
    }
}

<?php

namespace App\Jobs;

use App\Models\League;
use App\Services\Campaign\Automation;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class ProposeCampaign implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 180;

    public function __construct(public string $leagueId) {}

    public function handle(Automation $automation): void
    {
        if (config('campaign.enabled') && config('campaign.api_key')) {
            $automation->propose(League::findOrFail($this->leagueId));
        }
    }
}

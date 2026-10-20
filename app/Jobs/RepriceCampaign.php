<?php

namespace App\Jobs;

use App\Models\League;
use App\Services\Campaign\Automation;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class RepriceCampaign implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 300;

    public function __construct(public ?string $leagueId = null, public ?array $types = null) {}

    public function backoff(): array
    {
        return [30, 120, 300];
    }

    public function handle(Automation $automation): void
    {
        if (! config('campaign.enabled') || ! config('campaign.processing_enabled') || ! config('campaign.api_key')) {
            return;
        }
        foreach (League::when($this->leagueId, fn ($q) => $q->whereKey($this->leagueId))->cursor() as $league) {
            $automation->reprice($league, $this->types);
        }
    }
}

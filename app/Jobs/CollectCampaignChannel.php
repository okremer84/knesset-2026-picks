<?php

namespace App\Jobs;

use App\Services\Campaign\Channels;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;

class CollectCampaignChannel implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 90;

    public function __construct(public int $sourceId) {}

    public function handle(Channels $channels): void
    {
        if (! config('campaign.enabled')) {
            return;
        }
        $source = DB::table('campaign_sources')->find($this->sourceId);
        if (! $source || ! in_array($source->kind, ['youtube', 'telegram'])) {
            return;
        }
        $channels->collect($source);
    }
}

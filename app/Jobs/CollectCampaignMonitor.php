<?php

namespace App\Jobs;

use App\Services\Campaign\MonitorCollector;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;

class CollectCampaignMonitor implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public int $timeout = 240;

    public int $uniqueFor = 300;

    public function __construct(public int $sourceId) {}

    public function uniqueId(): string
    {
        return (string) $this->sourceId;
    }

    public function handle(MonitorCollector $collector): void
    {
        if (! config('campaign.enabled') || ! config('campaign.processing_enabled')) {
            return;
        }
        $source = DB::table('campaign_sources')->find($this->sourceId);
        if ($source && in_array($source->kind, ['x', 'news'])) {
            $collector->collect($source);
        }
    }
}

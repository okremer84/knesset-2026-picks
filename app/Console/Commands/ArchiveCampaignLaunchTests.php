<?php

namespace App\Console\Commands;

use App\Models\League;
use App\Services\Campaign\LaunchCleanup;
use App\Services\Campaign\OpeningSlate;
use Illuminate\Console\Command;

class ArchiveCampaignLaunchTests extends Command
{
    protected $signature = 'campaign:archive-launch-tests {--apply : Archive the two named, settled, zero-net QA questions}';

    protected $description = 'Preview or reversibly archive launch QA without changing real bets or wallet balances';

    public function handle(LaunchCleanup $cleanup): int
    {
        $this->line(json_encode($cleanup->archive(League::findOrFail(OpeningSlate::LEAGUE_ID), (bool) $this->option('apply')), JSON_UNESCAPED_UNICODE));

        return self::SUCCESS;
    }
}

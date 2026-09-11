<?php

namespace App\Console\Commands;

use App\Services\PollSnapshots;
use Illuminate\Console\Command;

class PrunePollSnapshots extends Command
{
    protected $signature = 'polls:prune-snapshots';

    protected $description = 'Delete source bodies not observed in 30 days, retaining import audit records';

    public function handle(PollSnapshots $snapshots): int
    {
        $this->info('Pruned '.$snapshots->prune().' expired snapshots');

        return self::SUCCESS;
    }
}

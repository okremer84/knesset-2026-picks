<?php

namespace App\Console\Commands;

use App\Services\Campaign\MonitorFeeds;
use Illuminate\Console\Command;

class CheckCampaignFeeds extends Command
{
    protected $signature = 'campaign:check-feeds';

    protected $description = 'Read public campaign RSS feeds without changing sources, markets or wallets';

    public function handle(MonitorFeeds $feeds): int
    {
        $failed = false;
        foreach (MonitorFeeds::catalog() as $id => $feed) {
            try {
                $xml = $feeds->xml($feeds->fetch($feed['url'], $feed['hosts']));
                $total = count($xml->channel->item);
                if (! $total) {
                    throw new \RuntimeException('Empty feed');
                }
                $matches = 0;
                foreach ($xml->channel->item as $item) {
                    if (str_contains($feeds->plain((string) $item->title.' '.(string) $item->description), 'אוריך')) {
                        $matches++;
                    }
                }
                $this->info($id.': OK — '.$total.' feed entries, '.$matches.' Urich headline/summary matches');
            } catch (\Throwable) {
                $failed = true;
                $this->error($id.': FAILED — unavailable or invalid RSS');
            }
        }
        $this->line('Read-only probe. This does not start continuous monitoring or verify article bodies.');

        return $failed ? self::FAILURE : self::SUCCESS;
    }
}

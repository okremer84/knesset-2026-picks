<?php

namespace App\Console\Commands;

use App\Models\Survey;
use App\Services\ElectionResults;
use App\Services\PollStore;
use App\Services\YnetResults;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class SyncResults extends Command
{
    protected $signature = 'results:sync {--html= : Validate and import a saved Ynet HTML snapshot}';

    protected $description = 'Refresh validated actual election results from Ynet, retaining the last good count on failure';

    public function handle(YnetResults $parser, PollStore $store): int
    {
        $lock = Cache::lock('actual-result-import', 120);
        if (! $lock->get()) {
            $this->info('Result sync already running');

            return self::SUCCESS;
        }
        try {
            $current = app(ElectionResults::class)->current();
            if (($current['kind'] ?? null) === 'official_results') {
                $this->info('Final results already published; automatic partial counts are stopped');

                return self::SUCCESS;
            }
            $result = $this->option('html')
                ? $parser->parse(file_get_contents($this->option('html')))
                : $parser->fetch($current['sourceUrl'] ?? null);
            $previous = Survey::find($result['id'])?->payload;
            if ($previous && strcmp($result['publishedAt'], $previous['publishedAt']) < 0) {
                throw new RuntimeException('Source returned an older count; latest result retained');
            }
            $result['syncedAt'] = now()->toIso8601String();
            DB::transaction(function () use ($store, $result) {
                $store->store($result);
                Survey::whereIn('kind', ['opinion_poll', 'exit_poll'])->update(['active' => false]);
                DB::table('election_result_syncs')->updateOrInsert(['id' => 1], [
                    'status' => 'succeeded', 'checked_at' => now()->toIso8601String(),
                    'last_success_at' => now()->toIso8601String(), 'error' => null,
                ]);
            });
            $this->info('Published actual results: '.$result['countedPercentage'].'% counted');

            return self::SUCCESS;
        } catch (\Throwable $e) {
            DB::table('election_result_syncs')->updateOrInsert(['id' => 1], [
                'status' => 'failed', 'checked_at' => now()->toIso8601String(), 'error' => mb_substr($e->getMessage(), 0, 1000),
            ]);
            Log::warning('Actual result refresh failed; last valid count retained', ['error' => $e->getMessage()]);
            $this->error($e->getMessage());

            return self::FAILURE;
        } finally {
            $lock->release();
        }
    }
}

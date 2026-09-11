<?php

namespace App\Console\Commands;

use App\Models\Survey;
use App\Services\PollSnapshots;
use App\Services\PollStore;
use App\Services\WikipediaPolls;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SyncPolls extends Command
{
    protected $signature = 'polls:sync {--html= : Import a saved Wikipedia HTML snapshot}';

    protected $description = 'Atomically import validated current Wikipedia polls, preserving prior data on failure';

    public function handle(WikipediaPolls $parser, PollStore $store, PollSnapshots $snapshots): int
    {
        $lock = Cache::lock('poll-import', 600);
        if (! $lock->get()) {
            $this->error('A poll sync is already running');

            return self::FAILURE;
        }
        $run = null;
        try {
            $run = DB::table('poll_imports')->insertGetId(['status' => 'running', 'created_at' => now(), 'updated_at' => now()]);
            $html = $this->option('html') ? file_get_contents($this->option('html')) :
                Http::withUserAgent(config('election.user_agent'))->accept('text/html')->timeout(45)->get(config('election.source_url'))->throw()->body();
            if (! $html) {
                throw new \RuntimeException('Empty poll source');
            }
            DB::table('poll_imports')->where('id', $run)->update(['source_hash' => $snapshots->store($html)]);
            $polls = $parser->parse($html);
            DB::transaction(function () use ($polls, $store, $run) {
                foreach ($polls as $poll) {
                    $store->store($poll);
                }
                Survey::where('kind', 'opinion_poll')->where('id', 'like', 'wiki-%')->whereNotIn('id', array_column($polls, 'id'))->update(['active' => false]);
                DB::table('poll_imports')->where('id', $run)->update(['status' => 'succeeded', 'count' => count($polls), 'updated_at' => now()]);
            });
            $this->info('Imported '.count($polls).' polls');

            return self::SUCCESS;
        } catch (\Throwable $e) {
            if ($run) {
                DB::table('poll_imports')->where('id', $run)->update(['status' => 'failed', 'error' => mb_substr($e->getMessage(), 0, 5000), 'updated_at' => now()]);
            }
            Log::error('Poll sync failed; previous surveys retained', ['exception' => $e]);
            $this->error($e->getMessage());

            return self::FAILURE;
        } finally {
            $lock->release();
        }
    }
}

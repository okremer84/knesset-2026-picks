<?php

namespace App\Console\Commands;

use App\Services\PollStore;
use Illuminate\Console\Command;

class PublishSurvey extends Command
{
    protected $signature = 'polls:publish {file : Path to reviewed survey JSON}';

    protected $description = 'Publish an operator-reviewed poll, exit poll or official result';

    public function handle(PollStore $store): int
    {
        try {
            $store->store(json_decode(file_get_contents($this->argument('file')), true, flags: JSON_THROW_ON_ERROR));
            $this->info('Survey published');

            return self::SUCCESS;
        } catch (\Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }
    }
}

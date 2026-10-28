<?php

namespace Database\Seeders;

use App\Models\Survey;
use App\Services\PollStore;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $results = json_decode(file_get_contents(base_path('data/actual-results.json')), true, flags: JSON_THROW_ON_ERROR);
        DB::transaction(function () use ($results) {
            foreach ($results['surveys'] as $result) {
                // Preserve later live updates, operator corrections and withdrawals.
                if (! Survey::whereKey($result['id'])->exists()) {
                    app(PollStore::class)->store($result);
                }
            }
            Survey::whereIn('kind', ['opinion_poll', 'exit_poll'])->update(['active' => false]);
        });
    }
}

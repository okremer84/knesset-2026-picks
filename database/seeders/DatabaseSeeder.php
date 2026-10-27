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
        if (! Survey::exists()) {
            $data = json_decode(file_get_contents(base_path('data/wikipedia-surveys.json')), true, flags: JSON_THROW_ON_ERROR);
            foreach ($data['surveys'] ?? $data as $poll) {
                app(PollStore::class)->store($poll);
            }
        }

        // Publish the reviewed election-night bundle on existing deployments too.
        // Later operator corrections and withdrawals must survive redeployment.
        $results = json_decode(file_get_contents(base_path('data/election-results.json')), true, flags: JSON_THROW_ON_ERROR);
        DB::transaction(function () use ($results) {
            // Channel 16 was removed from the reviewed bundle; retain its history.
            Survey::whereKey('exit-2026-10-27-channel-16')->where('active', true)->update(['active' => false]);
            foreach ($results['surveys'] as $result) {
                if (! Survey::whereKey($result['id'])->exists()) {
                    app(PollStore::class)->store($result);
                }
            }
        });
    }
}

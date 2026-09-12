<?php

namespace Database\Seeders;

use App\Models\Survey;
use App\Services\PollStore;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        if (Survey::exists()) {
            return;
        }
        $data = json_decode(file_get_contents(base_path('data/wikipedia-surveys.json')), true, flags: JSON_THROW_ON_ERROR);
        foreach ($data['surveys'] ?? $data as $poll) {
            app(PollStore::class)->store($poll);
        }
    }
}

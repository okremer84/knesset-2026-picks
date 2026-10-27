<?php

use App\Models\Survey;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        // Existing installations publish the reviewed bundle during their normal
        // migration-only deployment. Fresh databases use the standard seeder.
        if (Survey::exists()) {
            app(DatabaseSeeder::class)->run();
        }
    }

    public function down(): void
    {
        // Retain published results, operator corrections, and revision history.
    }
};

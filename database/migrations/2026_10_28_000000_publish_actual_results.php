<?php

use App\Models\Survey;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('election_result_syncs', function (Blueprint $table) {
            $table->unsignedInteger('id')->primary();
            $table->string('status');
            $table->string('checked_at')->nullable();
            $table->string('last_success_at')->nullable();
            $table->text('error')->nullable();
        });
        if (Survey::exists()) {
            app(DatabaseSeeder::class)->run();
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('election_result_syncs');
        // Published results and their revision history remain available.
    }
};

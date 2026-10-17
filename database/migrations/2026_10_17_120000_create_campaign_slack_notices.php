<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('campaign_slack_notices', function (Blueprint $table) {
            $table->id();
            $table->string('destination', 100);
            $table->string('subject', 100);
            $table->string('fingerprint', 64);
            $table->json('payload');
            $table->string('status', 20)->default('pending');
            $table->string('error_code', 50)->nullable();
            $table->string('slack_ts', 50)->nullable();
            $table->timestamp('available_at');
            $table->timestamps();
            $table->unique(['destination', 'subject']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('campaign_slack_notices');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('campaign_observations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('source_id')->constrained('campaign_sources')->cascadeOnDelete();
            $t->string('item_key', 64);
            $t->text('url');
            $t->string('title', 500);
            $t->longText('text');
            $t->string('content_hash', 64);
            $t->timestamp('published_at');
            $t->timestamp('first_seen_at');
            $t->timestamp('last_seen_at');
            $t->json('metadata');
            $t->unique(['source_id', 'item_key']);
        });
        Schema::create('campaign_monitor_runs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('source_id')->constrained('campaign_sources')->cascadeOnDelete();
            $t->timestamp('started_at');
            $t->timestamp('finished_at');
            $t->string('status', 20);
            $t->integer('items')->default(0);
            $t->text('message')->nullable();
            $t->index(['source_id', 'started_at']);
        });
        Schema::create('campaign_evidence_reviews', function (Blueprint $t) {
            $t->id();
            $t->foreignUuid('market_id')->constrained('campaign_markets')->cascadeOnDelete();
            $t->foreignId('observation_id')->constrained('campaign_observations')->cascadeOnDelete();
            $t->string('content_hash', 64);
            $t->string('reason', 300);
            $t->foreignId('actor_id')->constrained('users');
            $t->timestamp('created_at');
            $t->unique(['market_id', 'observation_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('campaign_evidence_reviews');
        Schema::dropIfExists('campaign_monitor_runs');
        Schema::dropIfExists('campaign_observations');
    }
};

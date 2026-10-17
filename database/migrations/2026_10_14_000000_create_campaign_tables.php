<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('campaign_members', function (Blueprint $t) {
            $t->id();
            $t->foreignUuid('league_id')->constrained('leagues');
            $t->foreignId('user_id')->constrained();
            $t->timestamps();
            $t->unique(['league_id', 'user_id']);
        });
        Schema::create('campaign_wallets', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained();
            $t->string('season', 30);
            $t->bigInteger('available')->default(100000);
            $t->timestamps();
            $t->unique(['user_id', 'season']);
        });
        Schema::create('campaign_entries', function (Blueprint $t) {
            $t->id();
            $t->foreignId('wallet_id')->constrained('campaign_wallets');
            $t->string('operation_key', 160)->unique();
            $t->string('kind', 30);
            $t->bigInteger('amount');
            $t->uuid('bet_id')->nullable();
            $t->timestamp('created_at');
        });
        Schema::create('campaign_markets', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignUuid('league_id')->constrained('leagues');
            $t->string('season', 30);
            $t->string('type', 40);
            $t->string('title', 300);
            $t->json('contract');
            $t->string('group_key', 120)->nullable();
            $t->string('state', 30)->default('open');
            $t->uuid('quote_id')->nullable();
            $t->timestamp('closes_at');
            $t->timestamp('window_ends_at');
            $t->string('action', 20)->nullable();
            $t->uuid('preview_id')->nullable();
            $t->foreignId('created_by')->constrained('users');
            $t->timestamps();
        });
        Schema::create('campaign_quotes', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignUuid('market_id')->constrained('campaign_markets');
            $t->unsignedInteger('version');
            $t->unsignedInteger('probability');
            $t->unsignedInteger('ai_probability')->nullable();
            $t->string('tag', 30);
            $t->string('origin', 30);
            $t->text('rationale');
            $t->json('evidence');
            $t->string('input_hash', 64)->nullable();
            $t->timestamp('created_at');
            $t->unique(['market_id', 'version']);
        });
        Schema::create('campaign_bets', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignUuid('market_id')->constrained('campaign_markets');
            $t->foreignId('user_id')->constrained();
            $t->foreignId('wallet_id')->constrained('campaign_wallets');
            $t->foreignUuid('quote_id')->constrained('campaign_quotes');
            $t->string('side', 3);
            $t->bigInteger('stake');
            $t->bigInteger('promised_return');
            $t->string('request_key', 100);
            $t->string('request_hash', 64);
            $t->string('status', 20)->default('pending');
            $t->bigInteger('paid')->default(0);
            $t->timestamp('created_at');
            $t->unique(['user_id', 'request_key']);
        });
        Schema::create('campaign_resolutions', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignUuid('market_id')->unique()->constrained('campaign_markets');
            $t->json('payload');
            $t->foreignId('actor_id')->constrained('users');
            $t->timestamp('created_at');
        });
        Schema::create('campaign_proposals', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignUuid('league_id')->constrained('leagues');
            $t->foreignId('user_id')->nullable()->constrained();
            $t->string('origin', 30);
            $t->string('external_key', 180)->nullable()->unique();
            $t->json('payload');
            $t->string('status', 20)->default('pending');
            $t->uuid('market_id')->nullable();
            $t->timestamps();
        });
        Schema::create('campaign_sources', function (Blueprint $t) {
            $t->id();
            $t->foreignUuid('league_id')->constrained('leagues');
            $t->string('kind', 30);
            $t->string('name', 200);
            $t->string('external_id', 200)->nullable();
            $t->text('url');
            $t->json('payload');
            $t->timestamps();
        });
        Schema::create('campaign_events', function (Blueprint $t) {
            $t->id();
            $t->uuid('market_id')->nullable();
            $t->foreignId('actor_id')->nullable()->constrained('users');
            $t->string('type', 50);
            $t->json('payload');
            $t->timestamp('created_at');
        });
    }

    public function down(): void
    {
        foreach (['campaign_events', 'campaign_sources', 'campaign_proposals', 'campaign_resolutions', 'campaign_bets', 'campaign_quotes', 'campaign_markets', 'campaign_entries', 'campaign_wallets', 'campaign_members'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};

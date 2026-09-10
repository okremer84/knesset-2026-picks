<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('surveys', function (Blueprint $t) {
            $t->string('id', 80)->primary();
            $t->string('kind')->default('opinion_poll');
            $t->json('payload');
            $t->string('content_hash', 64);
            $t->boolean('active')->default(true);
            $t->timestamps();
        });
        Schema::create('survey_revisions', function (Blueprint $t) {
            $t->id();
            $t->string('survey_id', 80);
            $t->string('content_hash', 64);
            $t->json('payload');
            $t->timestamp('created_at');
            $t->unique(['survey_id', 'content_hash']);
        });
        Schema::create('leagues', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('owner_id')->constrained('users');
            $t->string('name', 100);
            $t->text('description')->nullable();
            $t->string('invite_code', 48)->unique();
            $t->timestamp('locks_at');
            $t->string('stage')->default('voting_open');
            $t->json('benchmark')->nullable();
            $t->decimal('turnout', 4, 1)->nullable();
            $t->string('scoring_version')->default('absolute-error-v1');
            $t->timestamps();
        });
        Schema::create('league_user', function (Blueprint $t) {
            $t->id();
            $t->foreignUuid('league_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->timestamps();
            $t->unique(['league_id', 'user_id']);
        });
        Schema::create('predictions', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignUuid('league_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->constrained();
            $t->json('seats');
            $t->decimal('turnout', 4, 1)->nullable();
            $t->string('note', 500)->nullable();
            $t->timestamps();
            $t->unique(['league_id', 'user_id']);
        });
        Schema::create('prediction_revisions', function (Blueprint $t) {
            $t->id();
            $t->foreignUuid('prediction_id')->constrained()->cascadeOnDelete();
            $t->json('payload');
            $t->timestamp('created_at');
        });
        Schema::create('poll_imports', function (Blueprint $t) {
            $t->id();
            $t->string('status');
            $t->string('source_hash', 64)->nullable();
            $t->longText('source_html')->nullable();
            $t->text('error')->nullable();
            $t->unsignedInteger('count')->default(0);
            $t->timestamps();
        });
        Schema::create('league_events', function (Blueprint $t) {
            $t->id();
            $t->foreignUuid('league_id')->constrained()->cascadeOnDelete();
            $t->foreignId('actor_id')->constrained('users');
            $t->string('type');
            $t->json('payload');
            $t->timestamp('created_at');
        });
    }

    public function down(): void
    {
        foreach (['league_events', 'poll_imports', 'prediction_revisions', 'predictions', 'league_user', 'leagues', 'survey_revisions', 'surveys'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};

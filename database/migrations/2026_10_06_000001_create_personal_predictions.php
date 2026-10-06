<?php

use Carbon\CarbonImmutable;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('personal_predictions', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->unique()->constrained();
            $t->json('seats');
            $t->decimal('turnout', 4, 1)->nullable();
            $t->string('note', 500)->nullable();
            $t->timestamps();
        });
        Schema::create('personal_prediction_revisions', function (Blueprint $t) {
            $t->id();
            $t->foreignUuid('prediction_id')->constrained('personal_predictions')->cascadeOnDelete();
            $t->json('payload');
            $t->timestamp('created_at');
        });
        // Preserve legacy records and their revisions. For already closed leagues,
        // retain the first closed league's pick; otherwise take the latest submission.
        foreach (DB::table('predictions')->distinct()->pluck('user_id') as $userId) {
            $picks = DB::table('predictions')->join('leagues', 'leagues.id', '=', 'predictions.league_id')
                ->where('predictions.user_id', $userId)->orderByDesc('predictions.updated_at')->orderByDesc('predictions.id')
                ->get(['predictions.*', 'leagues.locks_at', 'leagues.stage']);
            $pick = $picks->filter(fn ($p) => CarbonImmutable::parse($p->locks_at)->lte(now()) || $p->stage !== 'voting_open')->sortBy('locks_at')->first() ?? $picks->first();
            DB::table('personal_predictions')->insert(collect((array) $pick)->only(['id', 'user_id', 'seats', 'turnout', 'note', 'created_at', 'updated_at'])->all());
            $revisions = DB::table('prediction_revisions')->where('prediction_id', $pick->id)->get();
            foreach ($revisions as $revision) {
                DB::table('personal_prediction_revisions')->insert(['prediction_id' => $pick->id, 'payload' => $revision->payload, 'created_at' => $revision->created_at]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('personal_prediction_revisions');
        Schema::dropIfExists('personal_predictions');
    }
};

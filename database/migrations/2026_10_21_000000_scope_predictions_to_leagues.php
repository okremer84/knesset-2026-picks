<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('personal_predictions', function (Blueprint $t) {
            $t->string('scope', 36)->default('personal');
            $t->index('user_id', 'personal_predictions_user_index');
        });
        Schema::table('personal_predictions', function (Blueprint $t) {
            $t->dropUnique(['user_id']);
            $t->unique(['user_id', 'scope']);
        });

        // Freeze the currently shared submission into every existing membership,
        // including closed leagues. Keep the original personal pick and its audit trail.
        DB::transaction(function () {
            foreach (DB::table('personal_predictions')->where('scope', 'personal')->get() as $pick) {
                foreach (DB::table('league_user')->where('user_id', $pick->user_id)->pluck('league_id') as $leagueId) {
                    $copy = (array) $pick;
                    $copy['id'] = (string) Str::uuid();
                    $copy['scope'] = $leagueId;
                    DB::table('personal_predictions')->insert($copy);
                    foreach (DB::table('personal_prediction_revisions')->where('prediction_id', $pick->id)->get() as $revision) {
                        DB::table('personal_prediction_revisions')->insert(['prediction_id' => $copy['id'], 'payload' => $revision->payload, 'created_at' => $revision->created_at]);
                    }
                }
            }
        });
    }

    public function down(): void
    {
        // Rolling back would discard independently submitted league picks.
        throw new RuntimeException('Restore a pre-migration backup to roll back league predictions safely.');
    }
};

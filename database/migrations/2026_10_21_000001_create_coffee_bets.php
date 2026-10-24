<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('coffee_bets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('creator_id')->constrained('users');
            $table->foreignId('opponent_id')->nullable()->constrained('users');
            $table->string('question', 240);
            $table->text('terms');
            $table->boolean('creator_side');
            $table->string('status')->default('waiting')->index();
            $table->foreignId('proposer_id')->nullable()->constrained('users');
            $table->boolean('proposed_outcome')->nullable();
            $table->boolean('outcome')->nullable();
            $table->timestamp('voting_ends_at')->nullable();
            $table->timestamp('settled_at')->nullable();
            $table->timestamps();
        });
        Schema::create('coffee_votes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bet_id')->constrained('coffee_bets')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users');
            $table->boolean('outcome');
            $table->unique(['bet_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('coffee_votes');
        Schema::dropIfExists('coffee_bets');
    }
};

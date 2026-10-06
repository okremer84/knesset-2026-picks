<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('google_avatar_url')->nullable();
            // Bounded thumbnails live in SQL, not Cloud's ephemeral filesystem.
            $table->mediumText('avatar_data')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn(['google_avatar_url', 'avatar_data']));
    }
};

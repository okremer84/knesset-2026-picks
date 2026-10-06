<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('personal_predictions', fn (Blueprint $table) => $table->string('pick_name', 100)->nullable());
    }

    public function down(): void
    {
        Schema::table('personal_predictions', fn (Blueprint $table) => $table->dropColumn('pick_name'));
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('poll_snapshots', function (Blueprint $t) {
            $t->string('source_hash', 64)->primary();
            $t->longText('compressed_html');
            $t->timestamp('created_at');
            $t->timestamp('last_seen_at')->index();
        });
        // Preserve already imported documents, then release their duplicate copies.
        DB::table('poll_imports')->whereNotNull('source_html')->orderBy('id')->chunkById(25, function ($rows) {
            foreach ($rows as $row) {
                DB::transaction(function () use ($row) {
                    $hash = hash('sha256', $row->source_html);
                    DB::table('poll_snapshots')->upsert([[
                        'source_hash' => $hash, 'compressed_html' => base64_encode(gzencode($row->source_html, 9)),
                        'created_at' => $row->created_at, 'last_seen_at' => $row->updated_at,
                    ]], ['source_hash'], ['last_seen_at']);
                    DB::table('poll_imports')->where('id', $row->id)->update(['source_hash' => $hash, 'source_html' => null]);
                });
            }
        });
        DB::table('poll_snapshots')->where('last_seen_at', '<', now()->subDays(30))->delete();
    }

    public function down(): void
    {
        // Restore retained snapshots for the earlier importer; expired content stays pruned.
        DB::table('poll_snapshots')->orderBy('source_hash')->chunk(25, function ($rows) {
            foreach ($rows as $row) {
                DB::table('poll_imports')->where('source_hash', $row->source_hash)
                    ->update(['source_html' => gzdecode(base64_decode($row->compressed_html))]);
            }
        });
        Schema::dropIfExists('poll_snapshots');
    }
};

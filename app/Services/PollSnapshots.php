<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class PollSnapshots
{
    public function store(string $html): string
    {
        $hash = hash('sha256', $html);
        DB::table('poll_snapshots')->upsert([[
            'source_hash' => $hash, 'compressed_html' => base64_encode(gzencode($html, 9)),
            'created_at' => now(), 'last_seen_at' => now(),
        ]], ['source_hash'], ['last_seen_at']);

        return $hash;
    }

    public function prune(): int
    {
        return DB::table('poll_snapshots')->where('last_seen_at', '<', now()->subDays(30))->delete();
    }
}

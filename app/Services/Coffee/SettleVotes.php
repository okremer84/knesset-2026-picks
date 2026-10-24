<?php

namespace App\Services\Coffee;

use Illuminate\Support\Facades\DB;

class SettleVotes
{
    // Call under the bet row lock, shared by voting and the scheduled finalizer.
    public function settle(object $bet): void
    {
        if ($bet->status !== 'disputed' || now()->lt($bet->voting_ends_at)) {
            return;
        }
        $yes = DB::table('coffee_votes')->where('bet_id', $bet->id)->where('outcome', true)->count();
        $no = DB::table('coffee_votes')->where('bet_id', $bet->id)->where('outcome', false)->count();
        if ($yes !== $no) {
            DB::table('coffee_bets')->where('id', $bet->id)->update([
                'status' => 'settled', 'outcome' => $yes > $no, 'settled_at' => now(), 'updated_at' => now(),
            ]);
        }
    }

    public function due(): void
    {
        foreach (DB::table('coffee_bets')->where('status', 'disputed')->where('voting_ends_at', '<=', now())->pluck('id') as $id) {
            DB::transaction(function () use ($id) {
                $this->settle(DB::table('coffee_bets')->where('id', $id)->lockForUpdate()->first());
            }, 3);
        }
    }
}

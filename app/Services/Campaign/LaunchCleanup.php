<?php

namespace App\Services\Campaign;

use App\Models\League;
use Illuminate\Support\Facades\DB;

class LaunchCleanup
{
    public const TITLES = ['QA בלבד · בדיקת זכייה והפסד 17.10', 'QA בלבד · בדיקת ביטול והחזר 17.10'];

    public function archive(League $league, bool $apply = false): array
    {
        return DB::transaction(function () use ($league, $apply) {
            League::whereKey($league->id)->lockForUpdate()->firstOrFail();
            $markets = DB::table('campaign_markets')->where('league_id', $league->id)->where('season', '2026')->whereIn('title', self::TITLES)->whereNull('archived_at')->lockForUpdate()->get();
            $bets = DB::table('campaign_bets')->whereIn('market_id', $markets->pluck('id'))->lockForUpdate()->get();
            abort_if($markets->contains(fn ($m) => ! in_array($m->state, ['resolved', 'void'])), 422, 'QA markets must be terminal before archiving');
            abort_if($bets->contains('status', 'pending'), 422, 'QA bets must be settled before archiving');
            foreach ($bets->groupBy('user_id') as $tickets) {
                abort_unless($tickets->sum('paid') === $tickets->sum('stake'), 422, 'QA activity must have zero net wallet impact per user');
            }
            if ($apply) {
                foreach ($markets as $market) {
                    DB::table('campaign_markets')->where('id', $market->id)->update(['archived_at' => now()]);
                    app(Game::class)->event($market->id, $market->created_by, 'qa_archived', ['reason' => 'Launch cleanup: remove synthetic QA from public picks and rankings; retain ledger']);
                }
            }

            return ['applied' => $apply, 'markets' => $markets->count(), 'bets' => $bets->count(), 'wallets_changed' => 0];
        });
    }
}

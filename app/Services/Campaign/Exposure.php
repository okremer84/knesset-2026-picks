<?php

namespace App\Services\Campaign;

use Illuminate\Support\Collection;

class Exposure
{
    /** Sum best returns per question; mutually exclusive PM outcomes share one scenario. */
    public function potential(Collection $markets, int $userId): int
    {
        $groups = $markets->groupBy(fn ($m) => isset($m['contract']['exclusive_key']) ? 'exclusive:'.$m['contract']['exclusive_key'] : 'market:'.$m['id']);

        return (int) $groups->sum(function ($group) use ($userId) {
            $first = $group->first();
            $exclusive = isset($first['contract']['exclusive_key']);
            $outcomes = $exclusive ? array_keys($first['contract']['exclusive_options']) : ['yes', 'no'];

            return collect($outcomes)->map(fn ($outcome) => $group->sum(function ($m) use ($outcome, $userId, $exclusive) {
                $side = $exclusive ? ((int) $m['contract']['threshold'] === (int) $outcome ? 'yes' : 'no') : $outcome;

                return collect($m['bets'])->where('user_id', $userId)->where('status', 'pending')->where('side', $side)->sum('promised_return');
            }))->max() ?? 0;
        });
    }
}

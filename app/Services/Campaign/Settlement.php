<?php

namespace App\Services\Campaign;

use App\Jobs\SettleCampaign;
use App\Models\League;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class Settlement
{
    public function __construct(private Game $game) {}

    public function preview(League $league, string $id, array $data): array
    {
        return DB::transaction(function () use ($league, $id, $data) {
            League::whereKey($league->id)->lockForUpdate()->firstOrFail();
            $market = $this->game->market($id, $league, true);
            abort_if($market->action || in_array($market->state, ['resolved', 'void']), 409, 'השוק כבר בטיפול');
            app(Monitoring::class)->verify($league, $market, $data);
            $markets = $this->group($league, $market);
            $exclusive = json_decode($market->contract, true)['exclusive_key'] ?? null;
            if ($exclusive) {
                abort_unless($markets->count() === 4 && in_array((float) $data['observed'], [1.0, 2.0, 3.0, 4.0], true), 422, 'יש לבחור ראש ממשלה אחד מתוך ארבע האפשרויות');
                abort_unless(parse_url($data['source_url'], PHP_URL_SCHEME) === 'https' && in_array(strtolower(parse_url($data['source_url'], PHP_URL_HOST) ?? ''), ['main.knesset.gov.il', 'www.knesset.gov.il', 'knesset.gov.il']), 422, 'נדרש קישור לפרסום רשמי של הכנסת');
                abort_if(CarbonImmutable::parse($data['observed_at'])->gt(now()), 422, 'מועד ההשבעה אינו יכול להיות בעתיד');
            }
            $results = [];
            $payout = 0;
            $refund = 0;
            $previewId = (string) Str::uuid();
            foreach ($markets as $m) {
                $c = json_decode($m->contract, true);
                abort_if($m->action, 409, 'קבוצה כבר בטיפול');
                $officialFinal = ! empty($c['official_final']);
                if ($officialFinal) {
                    abort_unless(($data['official_final_confirmed'] ?? false) && in_array(strtolower(parse_url($data['source_url'], PHP_URL_HOST) ?? ''), ['gov.il', 'www.gov.il', 'votes26.bechirot.gov.il', 'bechirot.gov.il', 'www.bechirot.gov.il']), 422, 'יש לאשר תוצאות סופיות ולקשר לפרסום הרשמי');
                    abort_if(CarbonImmutable::parse($data['observed_at'])->gt(now()), 422, 'מועד התוצאה חייב להיות בעבר');
                }
                $late = $data['early_at'] ?? null;
                abort_if(now()->lt($this->game->cutoff($m)) && ! $late, 422, 'יש לסגור את השוק או לציין מועד פרסום מוקדם');
                abort_if($late && CarbonImmutable::parse($late)->gt(now()), 422, 'מועד האירוע חייב להיות בעבר');
                abort_if(CarbonImmutable::parse($data['observed_at'])->lt($c['window_starts_at']), 422, 'האירוע מחוץ לחלון התצפית');
                if (! $exclusive && in_array($m->type, ['channel_activity', 'statement', 'deadline_event'])) {
                    abort_unless(in_array((float) $data['observed'], [0.0, 1.0], true), 422, 'יש להזין כן או לא');
                    abort_if(! $officialFinal && (float) $data['observed'] === 0.0 && now()->lt($m->window_ends_at), 422, 'עדיין מוקדם לקבוע שהאירוע לא קרה');
                }
                if ($exclusive || $officialFinal || ! in_array($m->type, ['channel_activity', 'statement', 'deadline_event']) || (float) $data['observed'] === 1.0) {
                    abort_if(CarbonImmutable::parse($data['observed_at'])->gt(CarbonImmutable::parse($m->window_ends_at, 'UTC')), 422, 'האירוע מחוץ לחלון התצפית');
                }
                if (in_array($m->type, ['mention_count', 'channel_activity', 'poll_value'])) {
                    abort_if($data['observed'] < 0 || floor($data['observed']) != $data['observed'], 422, 'נדרש מספר שלם לא שלילי');
                }
                if ($m->type === 'poll_movement') {
                    abort_if(floor($data['observed']) != $data['observed'], 422, 'שינוי מנדטים חייב להיות שלם');
                }
                $outcome = match ($c['comparison']) {
                    'gt' => $data['observed'] > $c['threshold'], 'gte' => $data['observed'] >= $c['threshold'],
                    'lt' => $data['observed'] < $c['threshold'], 'lte' => $data['observed'] <= $c['threshold'],
                    'eq' => $data['observed'] == $c['threshold'], 'event' => (bool) $data['observed'],
                } ? 'yes' : 'no';
                $effective = $late ? CarbonImmutable::parse($late)->min($this->game->cutoff($m)) : $this->game->cutoff($m);
                $bets = DB::table('campaign_bets')->where('market_id', $m->id)->get();
                $lateBets = $bets->filter(fn ($b) => CarbonImmutable::parse($b->created_at, 'UTC')->gte($effective));
                $valid = $bets->reject(fn ($b) => $lateBets->contains('id', $b->id));
                $pay = $valid->where('side', $outcome)->sum('promised_return');
                $ref = $lateBets->sum('stake');
                $results[] = ['id' => $m->id, 'outcome' => $outcome, 'effective_cutoff' => $effective->toIso8601String(), 'payout' => $pay, 'refund' => $ref, 'winners' => $valid->where('side', $outcome)->count(), 'losers' => $valid->where('side', '!=', $outcome)->count()];
                $payout += $pay;
                $refund += $ref;
                DB::table('campaign_markets')->where('id', $m->id)->update(['state' => 'closed', 'preview_id' => $previewId, 'updated_at' => now()]);
            }
            $payload = ['preview_id' => $previewId, 'league_id' => $league->id, 'market_id' => $id, 'data' => $data, 'results' => $results, 'expires_at' => now()->addHour()->timestamp];

            return ['token' => Crypt::encryptString(json_encode($payload)), 'outcome' => collect($results)->firstWhere('id', $id)['outcome'], 'winner_label' => $exclusive ? json_decode($market->contract, true)['exclusive_options'][(int) $data['observed']] : null, 'payout' => $payout, 'refund' => $refund, 'results' => $results];
        }, 3);
    }

    private function group(League $league, object $market)
    {
        $exclusive = json_decode($market->contract, true)['exclusive_key'] ?? null;

        return DB::table('campaign_markets')->where('league_id', $league->id)->where('season', config('campaign.season'))->when($exclusive, fn ($q) => $q->where('contract->exclusive_key', $exclusive), fn ($q) => $q->when($market->group_key, fn ($q) => $q->where('group_key', $market->group_key), fn ($q) => $q->where('id', $market->id)))->whereNotIn('state', ['resolved', 'void'])->orderBy('id')->lockForUpdate()->get();
    }

    public function confirm(League $league, string $id, User $user, string $token): void
    {
        try {
            $p = json_decode(Crypt::decryptString($token), true, flags: JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            abort(422, 'תצוגת התשלום אינה תקינה. יש ליצור תצוגה חדשה');
        }
        abort_unless($p['league_id'] === $league->id && $p['market_id'] === $id, 422);
        $this->reserve($league, $id, $user, ['action' => 'settle', 'preview' => $p]);
    }

    public function void(League $league, string $id, User $user, string $reason): void
    {
        $this->reserve($league, $id, $user, ['action' => 'void', 'reason' => $reason]);
    }

    private function reserve(League $league, string $id, User $user, array $payload): void
    {
        $ids = DB::transaction(function () use ($league, $id, $user, $payload) {
            League::whereKey($league->id)->lockForUpdate()->firstOrFail();
            $market = $this->game->market($id, $league, true);
            if ($market->action) {
                $r = DB::table('campaign_resolutions')->where('market_id', $id)->first();
                abort_unless($r && json_decode($r->payload, true)['action'] === $payload['action'], 409, 'כבר נבחרה פעולת סיום אחרת');
                if ($payload['action'] === 'settle') {
                    abort_unless(json_decode($r->payload, true)['preview']['preview_id'] === $payload['preview']['preview_id'], 409, 'כבר אושרה הכרעה אחרת');
                }

                return $payload['action'] === 'settle' ? array_column(json_decode($r->payload, true)['preview']['results'], 'id') : DB::table('campaign_markets')->where('league_id', $league->id)->when(json_decode($market->contract, true)['exclusive_key'] ?? null, fn ($q, $key) => $q->where('contract->exclusive_key', $key), fn ($q) => $q->when($market->group_key, fn ($q) => $q->where('group_key', $market->group_key), fn ($q) => $q->where('id', $id)))->where('action', 'void')->pluck('id')->all();
            }
            if ($payload['action'] === 'settle') {
                app(Monitoring::class)->verify($league, $market, $payload['preview']['data']);
            }
            abort_if($payload['action'] === 'settle' && $payload['preview']['expires_at'] < now()->timestamp, 422, 'פג תוקף התצוגה. יש לבדוק שוב');
            $markets = $payload['action'] === 'settle' ? DB::table('campaign_markets')->whereIn('id', array_column($payload['preview']['results'], 'id'))->where('league_id', $league->id)->orderBy('id')->lockForUpdate()->get() : $this->group($league, $market);
            foreach ($markets as $m) {
                abort_if($m->action || in_array($m->state, ['resolved', 'void']), 409, 'קבוצה כבר בטיפול');
                if ($payload['action'] === 'settle') {
                    abort_unless($m->preview_id === $payload['preview']['preview_id'], 409, 'הנתונים השתנו. יש לאשר את התצוגה האחרונה');
                }
                $data = $payload;
                if ($payload['action'] === 'settle') {
                    $data['result'] = collect($payload['preview']['results'])->firstWhere('id', $m->id);
                }
                DB::table('campaign_resolutions')->insert(['id' => (string) Str::uuid(), 'market_id' => $m->id, 'payload' => json_encode($data), 'actor_id' => $user->id, 'created_at' => now()]);
                DB::table('campaign_markets')->where('id', $m->id)->update(['action' => $payload['action'], 'state' => 'closed', 'updated_at' => now()]);
                $this->game->event($m->id, $user->id, $payload['action'].'_confirmed', $data);
            }

            return $markets->pluck('id')->all();
        }, 3);
        SettleCampaign::dispatch($league->id, $ids)->afterCommit();
    }

    public function finish(string $leagueId, array $ids): void
    {
        DB::transaction(function () use ($leagueId, $ids) {
            League::whereKey($leagueId)->lockForUpdate()->firstOrFail();
            $markets = DB::table('campaign_markets')->whereIn('id', $ids)->where('league_id', $leagueId)->orderBy('id')->lockForUpdate()->get();
            $bets = DB::table('campaign_bets')->whereIn('market_id', $ids)->orderBy('id')->get();
            DB::table('campaign_wallets')->whereIn('id', $bets->pluck('wallet_id')->unique())->orderBy('id')->lockForUpdate()->get();
            foreach ($markets as $market) {
                if (in_array($market->state, ['resolved', 'void'])) {
                    continue;
                }
                $r = DB::table('campaign_resolutions')->where('market_id', $market->id)->first();
                if (! $r) {
                    continue;
                }
                $p = json_decode($r->payload, true);
                foreach ($bets->where('market_id', $market->id) as $b) {
                    if ($b->status !== 'pending') {
                        continue;
                    }
                    $refund = $p['action'] === 'void' || CarbonImmutable::parse($b->created_at, 'UTC')->gte(CarbonImmutable::parse($p['result']['effective_cutoff']));
                    $won = ! $refund && $b->side === $p['result']['outcome'];
                    $paid = $refund ? $b->stake : ($won ? $b->promised_return : 0);
                    if ($paid) {
                        $this->game->credit($b->wallet_id, $paid, $refund ? 'refund' : 'payout', 'terminal:'.$b->id, $b->id);
                    }
                    DB::table('campaign_bets')->where('id', $b->id)->update(['status' => $refund ? 'refunded' : ($won ? 'won' : 'lost'), 'paid' => $paid]);
                }
                DB::table('campaign_markets')->where('id', $market->id)->update(['state' => $p['action'] === 'void' ? 'void' : 'resolved', 'updated_at' => now()]);
            }
        }, 3);
    }
}

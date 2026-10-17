<?php

namespace App\Services\Campaign;

use App\Http\Controllers\LeagueController;
use App\Models\League;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class Game
{
    public function member(League $league, User $user): void
    {
        abort_unless(config('campaign.enabled'), 404);
        abort_unless($this->allowed($user), 403, 'אייזנמארקט פתוח כרגע לשני חשבונות הפיילוט בלבד');
        abort_unless($league->users()->whereKey($user->id)->exists() || DB::table('campaign_members')->where('league_id', $league->id)->where('user_id', $user->id)->exists(), 403);
    }

    public function allowed(User $user): bool
    {
        return ! config('campaign.pilot_only') || ($user->google_id && $user->email_verified_at && isset(config('campaign.pilot_accounts')[strtolower(trim($user->email))]));
    }

    public function operator(User $user): bool
    {
        if (config('campaign.pilot_only')) {
            return $this->allowed($user) && config('campaign.pilot_accounts')[strtolower(trim($user->email))] === 'admin';
        }

        return in_array($user->id, config('campaign.operator_ids'), true);
    }

    public function wallet(User $user): object
    {
        abort_unless($this->allowed($user), 403);

        return DB::transaction(function () use ($user) {
            User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $wallet = DB::table('campaign_wallets')->where('user_id', $user->id)->where('season', config('campaign.season'))->first();
            if (! $wallet) {
                $id = DB::table('campaign_wallets')->insertGetId(['user_id' => $user->id, 'season' => config('campaign.season'), 'available' => 1000000, 'created_at' => now(), 'updated_at' => now()]);
                DB::table('campaign_entries')->insert(['wallet_id' => $id, 'operation_key' => 'grant:'.$id, 'kind' => 'grant', 'amount' => 1000000, 'created_at' => now()]);
                $wallet = DB::table('campaign_wallets')->find($id);
            }

            return $wallet;
        }, 3);
    }

    public function market(string $id, League $league, bool $lock = false): object
    {
        $query = DB::table('campaign_markets')->where('id', $id)->where('league_id', $league->id)->where('season', config('campaign.season'));
        $row = ($lock ? $query->lockForUpdate() : $query)->first();
        abort_unless($row, 404);

        return $row;
    }

    public function publish(League $league, User $user, array $data): array
    {
        return DB::transaction(function () use ($league, $user, $data) {
            League::whereKey($league->id)->lockForUpdate()->firstOrFail();
            app(Monitoring::class)->validate($league, $data);
            if (! empty($data['proposal_id'])) {
                $proposal = DB::table('campaign_proposals')->where('id', $data['proposal_id'])->where('league_id', $league->id)->first();
                abort_unless($proposal && $proposal->status === 'pending', 409, 'ההצעה כבר טופלה או אינה קיימת');
                if ($proposal->origin === 'ai') {
                    $original = json_decode($proposal->payload, true);
                    $data['ai_probability'] = $original['probability'];
                    $data['evidence'] = $data['evidence'] ?? $original['evidence'];
                    $data['tag'] = $data['probability'] === $original['probability'] ? $original['tag'] : 'operator_edited';
                }
            }
            $id = (string) Str::uuid();
            $row = ['id' => $id, 'league_id' => $league->id, 'season' => config('campaign.season'), 'type' => $data['type'], 'title' => $data['title'], 'contract' => json_encode($data['contract']), 'group_key' => $data['group_key'] ?? null, 'closes_at' => CarbonImmutable::parse($data['closes_at'])->utc(), 'window_ends_at' => CarbonImmutable::parse($data['window_ends_at'])->utc(), 'created_by' => $user->id, 'state' => 'open', 'created_at' => now(), 'updated_at' => now()];
            $this->consistent($league, (object) $row, $data['probability']);
            DB::table('campaign_markets')->insert($row);
            $this->quote($league, $id, $user, $data, true);
            if (! empty($data['proposal_id'])) {
                DB::table('campaign_proposals')->where('id', $data['proposal_id'])->where('league_id', $league->id)->update(['status' => 'published', 'market_id' => $id, 'updated_at' => now()]);
            }
            $this->event($id, $user->id, 'published', $data);

            return $this->present($this->market($id, $league));
        }, 3);
    }

    public function consistent(League $league, object $market, int $probability, array $pending = []): void
    {
        if (! $market->group_key) {
            return;
        }
        $contract = json_decode($market->contract, true);
        $others = DB::table('campaign_markets')->where('league_id', $league->id)->where('group_key', $market->group_key)->where('season', config('campaign.season'))->where('id', '!=', $market->id)->whereNotIn('state', ['void'])->get();
        foreach ($others as $other) {
            $c = json_decode($other->contract, true);
            abort_if(in_array($other->state, ['closed', 'resolved']) || $other->action, 422, 'קבוצת השוק כבר נסגרה');
            abort_unless($other->type === $market->type && CarbonImmutable::parse($other->closes_at, 'UTC')->equalTo(CarbonImmutable::parse($market->closes_at, 'UTC')) && CarbonImmutable::parse($other->window_ends_at, 'UTC')->equalTo(CarbonImmutable::parse($market->window_ends_at, 'UTC')) && $c['source_url'] === $contract['source_url'] && in_array($c['comparison'], ['gt', 'gte']) === in_array($contract['comparison'], ['gt', 'gte']) && ($c['subject'] ?? '') === ($contract['subject'] ?? '') && CarbonImmutable::parse($c['window_starts_at'])->equalTo(CarbonImmutable::parse($contract['window_starts_at'])) && ($c['source_id'] ?? null) === ($contract['source_id'] ?? null) && ($c['pollster'] ?? '') === ($contract['pollster'] ?? '') && ($c['publisher'] ?? '') === ($contract['publisher'] ?? '') && ($c['count_rules'] ?? '') === ($contract['count_rules'] ?? '') && ($c['baseline'] ?? null) === ($contract['baseline'] ?? null), 422, 'קבוצת תמחור חייבת לתאר את אותו אירוע ואותו מדד');
            $q = DB::table('campaign_quotes')->find($other->quote_id);
            $otherProbability = $pending[$other->id] ?? $q->probability;
            $difficulty = fn ($rule) => match ($rule['comparison']) {
                'gt' => floor($rule['threshold']) + 1, 'gte' => ceil($rule['threshold']),
                'lt' => -(ceil($rule['threshold']) - 1), 'lte' => -floor($rule['threshold']),
            };
            $difference = $difficulty($contract) - $difficulty($c);
            abort_if(($difference > 0 && $probability > $otherProbability) || ($difference < 0 && $probability < $otherProbability) || ($difference == 0 && $probability != $otherProbability), 422, 'ההסתברויות אינן עקביות עם שאר הספים בקבוצה');
        }
    }

    public function quote(League $league, string $id, User $user, array $data, bool $initial = false): array
    {
        return DB::transaction(function () use ($league, $id, $user, $data, $initial) {
            League::whereKey($league->id)->lockForUpdate()->firstOrFail();
            $market = $this->market($id, $league, true);
            abort_if($market->state !== 'open' || $market->action || now()->gte($this->cutoff($market)), 409, 'השוק סגור');
            $this->consistent($league, $market, $data['probability']);
            $previous = $market->quote_id ? DB::table('campaign_quotes')->find($market->quote_id) : null;
            if (! $initial) {
                $data['ai_probability'] = $previous?->ai_probability;
                $data['evidence'] = $previous ? json_decode($previous->evidence, true) : [];
            }
            $version = (int) DB::table('campaign_quotes')->where('market_id', $id)->max('version') + 1;
            $quote = ['id' => (string) Str::uuid(), 'market_id' => $id, 'version' => $version, 'probability' => $data['probability'], 'ai_probability' => $data['ai_probability'] ?? ($initial && ($data['tag'] ?? '') === 'no_basis' ? 5000 : null), 'tag' => $initial ? ($data['tag'] ?? 'operator_edited') : 'operator_edited', 'origin' => $initial && isset($data['ai_probability']) && $data['ai_probability'] === $data['probability'] && $data['tag'] !== 'operator_edited' ? 'ai' : 'operator', 'rationale' => $data['rationale'], 'evidence' => json_encode($data['evidence'] ?? []), 'input_hash' => app(Evidence::class)->hash([app(Evidence::class)->input($league, $market)]), 'created_at' => now()];
            if ($quote['ai_probability'] !== null && $quote['ai_probability'] != $quote['probability']) {
                $quote['tag'] = 'operator_edited';
            }
            DB::table('campaign_quotes')->insert($quote);
            DB::table('campaign_markets')->where('id', $id)->update(['quote_id' => $quote['id'], 'updated_at' => now()]);
            $this->event($id, $user->id, 'quote', ['quote_id' => $quote['id'], 'probability' => $quote['probability']]);

            return $this->present($this->market($id, $league));
        }, 3);
    }

    public function bet(League $league, string $id, User $user, array $data): array
    {
        $this->wallet($user);
        $hash = hash('sha256', json_encode([$id, $data['side'], $data['stake'], $data['quote_id']]));

        return DB::transaction(function () use ($league, $id, $user, $data, $hash) {
            League::whereKey($league->id)->lockForUpdate()->firstOrFail();
            $market = $this->market($id, $league, true);
            $wallet = DB::table('campaign_wallets')->where('user_id', $user->id)->where('season', config('campaign.season'))->lockForUpdate()->first();
            $existing = DB::table('campaign_bets')->where('user_id', $user->id)->where('request_key', $data['request_key'])->first();
            if ($existing) {
                abort_unless(hash_equals($existing->request_hash, $hash), 409, 'מזהה הבקשה כבר שימש להימור אחר');

                return ['bet' => $this->ticket($existing), 'replayed' => true];
            }
            abort_if($market->state !== 'open' || $market->action || now()->gte($this->cutoff($market)), 409, 'ההימור נסגר');
            if ($market->quote_id !== $data['quote_id']) {
                throw new HttpResponseException(response()->json(['message' => 'המחיר השתנה. יש לבדוק ולאשר שוב', 'quote' => $this->present($market)['quote']], 409));
            }
            abort_if($wallet->available < $data['stake'], 422, 'אין מספיק כסף פנוי');
            $quote = DB::table('campaign_quotes')->find($market->quote_id);
            $p = $data['side'] === 'yes' ? $quote->probability : 10000 - $quote->probability;
            $bet = ['id' => (string) Str::uuid(), 'market_id' => $id, 'user_id' => $user->id, 'wallet_id' => $wallet->id, 'quote_id' => $quote->id, 'side' => $data['side'], 'stake' => $data['stake'], 'promised_return' => intdiv($data['stake'] * 10000, $p), 'request_key' => $data['request_key'], 'request_hash' => $hash, 'status' => 'pending', 'paid' => 0, 'created_at' => now()];
            DB::table('campaign_bets')->insert($bet);
            $this->credit($wallet->id, -$data['stake'], 'stake', 'stake:'.$bet['id'], $bet['id']);

            return ['bet' => $this->ticket((object) $bet), 'replayed' => false];
        }, 3);
    }

    public function credit(int $walletId, int $amount, string $kind, string $key, ?string $betId): void
    {
        if (DB::table('campaign_entries')->where('operation_key', $key)->exists()) {
            return;
        }
        DB::table('campaign_entries')->insert(['wallet_id' => $walletId, 'operation_key' => $key, 'kind' => $kind, 'amount' => $amount, 'bet_id' => $betId, 'created_at' => now()]);
        DB::table('campaign_wallets')->where('id', $walletId)->increment('available', $amount, ['updated_at' => now()]);
    }

    public function event(?string $marketId, ?int $actor, string $type, array $payload): void
    {
        DB::table('campaign_events')->insert(['market_id' => $marketId, 'actor_id' => $actor, 'type' => $type, 'payload' => json_encode($payload), 'created_at' => now()]);
    }

    private function ticket(object $bet): array
    {
        $q = DB::table('campaign_quotes')->find($bet->quote_id);
        $u = User::find($bet->user_id);

        return [...array_diff_key((array) $bet, array_flip(['request_key', 'request_hash', 'wallet_id'])), 'name' => $u?->name ?? 'משתתף', 'avatar' => $u?->avatar_url, 'probability' => (int) $q->probability, 'stake' => (int) $bet->stake, 'promised_return' => (int) $bet->promised_return, 'paid' => (int) $bet->paid];
    }

    public function cutoff(object $market): CarbonImmutable
    {
        return CarbonImmutable::parse($market->closes_at, 'UTC')->min(CarbonImmutable::parse(LeagueController::deadlineLimit()));
    }

    public function present(object $market): array
    {
        $quotes = DB::table('campaign_quotes')->where('market_id', $market->id)->orderBy('version')->get()->map(fn ($q) => [...(array) $q, 'probability' => (int) $q->probability, 'evidence' => json_decode($q->evidence, true)]);
        $resolution = DB::table('campaign_resolutions')->where('market_id', $market->id)->first();

        return [...(array) $market, 'contract' => json_decode($market->contract, true), 'state' => $market->state === 'open' && now()->gte($this->cutoff($market)) ? 'closed' : $market->state, 'closes_at' => $this->cutoff($market)->toIso8601String(), 'window_ends_at' => CarbonImmutable::parse($market->window_ends_at, 'UTC')->toIso8601String(), 'quote' => $quotes->last(), 'quotes' => $quotes, 'bets' => DB::table('campaign_bets')->where('market_id', $market->id)->orderByDesc('created_at')->get()->map(fn ($b) => $this->ticket($b)), 'resolution' => $resolution ? json_decode($resolution->payload, true) : null];
    }

    public function feed(League $league, User $user): array
    {
        $this->member($league, $user);
        $wallet = $this->wallet($user);
        $markets = DB::table('campaign_markets')->where('league_id', $league->id)->where('season', config('campaign.season'))->orderByDesc('created_at')->get()->map(fn ($m) => $this->present($m));
        $bets = $markets->flatMap(fn ($m) => $m['bets']);
        $mine = $bets->where('user_id', $user->id);
        $members = $league->users->merge(User::whereIn('id', DB::table('campaign_members')->where('league_id', $league->id)->pluck('user_id'))->get())->unique('id')->filter(fn ($member) => $this->allowed($member));
        $ranks = $members->map(function ($member) use ($bets) {
            $all = $bets->where('user_id', $member->id);
            $settled = $all->whereIn('status', ['won', 'lost']);
            $stake = $settled->sum('stake');
            $profit = $settled->sum('paid') - $stake;
            $count = $settled->pluck('market_id')->unique()->count();

            return ['user_id' => $member->id, 'name' => $member->name, 'avatar' => $member->avatar_url, 'profit' => $profit, 'roi' => $count >= 3 && $stake ? $profit / $stake : null, 'markets' => $count, 'outstanding' => $all->where('status', 'pending')->sum('stake')];
        })->sortByDesc('profit')->values();
        $proposals = DB::table('campaign_proposals')->where('league_id', $league->id)->when(! $this->operator($user), fn ($q) => $q->where(fn ($own) => $own->where('user_id', $user->id)->orWhereJsonContains('payload->submitter_ids', $user->id)))->orderByDesc('created_at')->get()->map(fn ($p) => [...(array) $p, 'payload' => json_decode($p->payload, true)]);

        return ['enabled' => true, 'operator' => $this->operator($user), 'wallet' => [...(array) $wallet, 'available' => (int) $wallet->available, 'outstanding' => $mine->where('status', 'pending')->sum('stake'), 'profit' => $mine->whereIn('status', ['won', 'lost'])->sum('paid') - $mine->whereIn('status', ['won', 'lost'])->sum('stake'), 'entries' => DB::table('campaign_entries')->where('wallet_id', $wallet->id)->orderByDesc('id')->limit(100)->get()], 'markets' => $markets, 'leaderboard' => $ranks, 'proposals' => $proposals];
    }
}

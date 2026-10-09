<?php

namespace App\Http\Controllers;

use App\Models\League;
use App\Models\Prediction;
use App\Models\Survey;
use App\Models\User;
use App\Services\Scoring;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class LeagueController extends Controller
{
    private function member(League $l, Request $r): void
    {
        abort_unless($l->users()->whereKey($r->user()->id)->exists(), 403);
    }

    public static function deadlineLimit(): ?string
    {
        $date = config('election.date');

        return $date ? CarbonImmutable::parse($date.' 20:00', 'Asia/Jerusalem')->utc()->toIso8601String() : null;
    }

    private function deadlineRules(): array
    {
        $limit = self::deadlineLimit();
        abort_unless($limit, 503, 'מועד הבחירות טרם הוגדר');

        return ['bail', 'required', 'date', 'after:now', 'before_or_equal:'.$limit,
            function ($attribute, $value, $fail) {
                if (CarbonImmutable::parse($value)->setTimezone('Asia/Jerusalem')->format('H:i:s.u') !== '20:00:00.000000') {
                    $fail('ההגשה מסתיימת תמיד בשעה 20:00 בשעון ישראל.');
                }
            },
        ];
    }

    public function index(Request $r)
    {
        return ['leagues' => League::whereHas('users', fn ($q) => $q->where('users.id', $r->user()->id))->orderBy('created_at')->orderBy('id')->get(['id', 'name'])];
    }

    private function personalPickPayload(User $user): array
    {
        $leagues = League::whereHas('users', fn ($q) => $q->where('users.id', $user->id))->get();
        $deadline = CarbonImmutable::parse(self::deadlineLimit());
        foreach ($leagues as $league) {
            $deadline = $deadline->min($league->effectiveDeadline());
        }
        $prediction = Prediction::where('user_id', $user->id)->first();
        $pick = $prediction ? ['id' => $prediction->id, 'userId' => $user->id, 'memberName' => $user->name, 'pickName' => $prediction->pick_name,
            'seats' => $prediction->seats, 'turnoutPercentage' => $prediction->turnout,
            'note' => $prediction->note, 'submittedAt' => $prediction->updated_at->toIso8601String()] : null;

        return ['pick' => $pick, 'picks' => $pick ? [$pick] : [], 'locksAt' => $deadline->toIso8601String(),
            'isLocked' => now()->gte($deadline) || $leagues->contains(fn ($l) => $l->isLocked())];
    }

    public function myPicks(Request $r)
    {
        return $this->personalPickPayload($r->user());
    }

    public function show(League $league, Request $r)
    {
        $this->member($league, $r);

        return ['league' => $this->payload($league, $r)];
    }

    public function create(Request $r)
    {
        $data = $r->validate(['name' => 'required|string|max:100', 'description' => 'nullable|string|max:1000', 'locksAt' => $this->deadlineRules()]);
        $l = DB::transaction(function () use ($data, $r) {
            User::whereKey($r->user()->id)->lockForUpdate()->firstOrFail();
            $l = League::create(['name' => $data['name'], 'description' => $data['description'] ?? null, 'owner_id' => $r->user()->id, 'invite_code' => Str::random(40),
                'locks_at' => CarbonImmutable::parse($data['locksAt'])->utc(), 'benchmark' => null]);
            $l->users()->attach($r->user()->id);

            return $l;
        });

        // Hydrate database defaults (including stage) before computing visibility and locks.
        return response()->json(['league' => $this->payload($l->fresh(), $r)], 201);
    }

    public function join(Request $r)
    {
        $data = $r->validate(['code' => 'bail|required|string|size:40'], [
            'code.required' => 'יש להזין קוד הזמנה תקין באורך 40 תווים.',
            'code.string' => 'יש להזין קוד הזמנה תקין באורך 40 תווים.',
            'code.size' => 'יש להזין קוד הזמנה תקין באורך 40 תווים.',
        ]);
        $l = DB::transaction(function () use ($data, $r) {
            User::whereKey($r->user()->id)->lockForUpdate()->firstOrFail();
            $l = League::where('invite_code', $data['code'])->lockForUpdate()->first();
            abort_unless($l, 404, 'קוד ההזמנה לא נמצא. בדקו את הקישור או בקשו הזמנה חדשה.');
            if (! $l->users()->whereKey($r->user()->id)->exists()) {
                abort_if($l->isLocked(), 409, 'הליגה נעולה להצטרפות');
                $l->users()->attach($r->user()->id);
            }

            return $l;
        });

        return ['league' => $this->payload($l, $r)];
    }

    public function predict(League $league, Request $r)
    {
        $this->member($league, $r);
        $this->savePersonalPick($r);

        return ['success' => true, 'league' => $this->payload($league->fresh(), $r), ...$this->personalPickPayload($r->user())];
    }

    public function savePick(Request $r)
    {
        $this->savePersonalPick($r);

        return ['success' => true, ...$this->personalPickPayload($r->user())];
    }

    private function savePersonalPick(Request $r): void
    {
        $ids = array_keys(config('election.parties'));
        $data = $r->validate(['seats' => ['required', 'array:'.implode(',', $ids)], 'seats.*' => ['required', 'integer', 'min:0', 'max:120', 'not_in:1,2,3'],
            'pickName' => 'sometimes|nullable|string|max:100', 'note' => 'nullable|string|max:500', 'turnoutPercentage' => 'required|numeric|between:0,100|decimal:0,1'],
            ['seats.*.not_in' => 'כל מפלגה יכולה לקבל 0 מנדטים או לפחות 4 מנדטים']);
        abort_unless(array_sum($data['seats']) === 120, 422, 'סך המנדטים חייב להיות 120');
        $seats = array_replace(array_fill_keys($ids, 0), array_map('intval', $data['seats']));
        DB::transaction(function () use ($r, $data, $seats) {
            // Membership changes take the same user lock; check deadlines after acquiring it.
            User::whereKey($r->user()->id)->lockForUpdate()->firstOrFail();
            $leagues = League::whereHas('users', fn ($q) => $q->where('users.id', $r->user()->id))->orderBy('id')->lockForUpdate()->get();
            abort_if(now()->gte(CarbonImmutable::parse(self::deadlineLimit())) || $leagues->contains(fn ($l) => $l->isLocked()), 409, 'מועד ההגשה הסתיים');
            $previousSeats = Prediction::where('user_id', $r->user()->id)->first()?->seats ?? [];
            foreach (config('election.parties') as $id => $party) {
                if (($party['selectable'] ?? true) === false) {
                    abort_if($seats[$id] > ($previousSeats[$id] ?? 0), 422, $party['name'].' אינה מתמודדת בנפרד. ניתן לשמור הקצאה קיימת או להפחית אותה.');
                }
            }
            $p = Prediction::updateOrCreate(['user_id' => $r->user()->id], ['seats' => $seats, 'turnout' => $data['turnoutPercentage'], 'note' => $data['note'] ?? null, ...(array_key_exists('pickName', $data) ? ['pick_name' => $data['pickName']] : [])]);
            DB::table('personal_prediction_revisions')->insert(['prediction_id' => $p->id, 'payload' => json_encode(['seats' => $seats, 'turnout' => $p->turnout, 'note' => $p->note, 'pickName' => $p->pick_name]), 'created_at' => now()]);
        }, 3);
    }

    private function publishedResult(): ?array
    {
        // Only explicitly published election-night/result records can score a league.
        // Opinion poll imports never participate in this selection.
        return Survey::where('active', true)->whereIn('kind', ['exit_poll', 'official_results'])->get()
            ->filter(fn ($s) => ($s->payload['date'] ?? '') >= config('election.date')
                && ($s->payload['date'] ?? '') <= now('Asia/Jerusalem')->toDateString())
            ->sort(function ($a, $b) {
                return ($b->kind === 'official_results') <=> ($a->kind === 'official_results')
                    ?: strcmp($b->payload['date'], $a->payload['date'])
                    ?: $b->updated_at <=> $a->updated_at ?: strcmp($b->id, $a->id);
            })->first()?->payload;
    }

    private function payload(League $l, Request $r): array
    {
        $l->load(['owner', 'users']);
        $predictions = Prediction::with('user')->whereIn('user_id', $l->users->modelKeys())->get();
        $locked = $l->isLocked();
        $benchmark = $this->publishedResult();
        $turnout = ($benchmark['kind'] ?? null) === 'official_results' ? ($benchmark['turnoutPercentage'] ?? null) : null;
        $visible = $predictions->filter(fn ($p) => $locked || $p->user_id === $r->user()->id);
        $members = $visible->map(fn ($p) => ['id' => $p->id, 'userId' => $p->user_id, 'memberName' => $p->user->name, 'pickName' => $p->pick_name, 'seats' => $p->seats,
            'turnoutPercentage' => $p->turnout, 'submittedAt' => $p->updated_at->toIso8601String(), 'note' => $p->note])->values();
        $rankings = $members->map(function ($p) use ($benchmark, $turnout) {
            $score = (new Scoring)->score($p['seats'], $benchmark['seats'] ?? []);

            return ['predictionId' => $p['id'], ...$score, 'turnoutDiff' => $turnout === null ? null : round(abs($p['turnoutPercentage'] - $turnout), 1)];
        })->sort(fn ($a, $b) => $a['error'] <=> $b['error'] ?: ($a['turnoutDiff'] ?? 0) <=> ($b['turnoutDiff'] ?? 0))->values();

        return ['id' => $l->id, 'name' => $l->name, 'description' => $l->description, 'creatorName' => $l->owner->name, 'createdAt' => $l->created_at->toIso8601String(),
            'isCommissioner' => $l->owner_id === $r->user()->id, 'isLocked' => $locked, 'locksAt' => $l->effectiveDeadline()->toIso8601String(),
            'inviteCode' => $l->invite_code, 'electionStage' => match ($benchmark['kind'] ?? null) {
                'official_results' => 'final_results', 'exit_poll' => 'exit_poll', default => 'voting_open'
            }, 'targetSurveyId' => $benchmark['id'] ?? null, 'benchmarkSurvey' => $benchmark,
            'benchmarkTurnoutPercentage' => $turnout, 'members' => $members, 'rankings' => $locked && $benchmark ? $rankings : [],
            'unsubmittedPlayers' => $l->users->filter(fn ($u) => ! $predictions->contains('user_id', $u->id))->map(fn ($u) => ['id' => (string) $u->id, 'name' => $u->name, 'joinedAt' => $u->pivot->created_at->toIso8601String()])->values(),
            'deadlineLimit' => self::deadlineLimit(),
            'myPickLocked' => $this->personalPickPayload($r->user())['isLocked'],
            'participants' => $l->users->map(fn ($u) => ['userId' => $u->id, 'name' => $u->name, 'submitted' => $predictions->contains('user_id', $u->id)])->values(),
            'submittedCount' => $predictions->count(), 'totalPlayersCount' => $l->users->count(), 'predictionsHidden' => ! $locked, 'scoringVersion' => $l->scoring_version];
    }
}

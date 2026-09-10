<?php

namespace App\Http\Controllers;

use App\Models\League;
use App\Models\Prediction;
use App\Models\Survey;
use App\Services\Scoring;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class LeagueController extends Controller
{
    private function member(League $l, Request $r): void
    {
        abort_unless($l->users()->whereKey($r->user()->id)->exists(), 403);
    }

    private function owner(League $l, Request $r): void
    {
        abort_unless($l->owner_id === $r->user()->id, 403);
    }

    public function index(Request $r)
    {
        return ['leagues' => League::whereHas('users', fn ($q) => $q->where('users.id', $r->user()->id))->get()->map(fn ($l) => $this->payload($l, $r))];
    }

    public function show(League $league, Request $r)
    {
        $this->member($league, $r);

        return ['league' => $this->payload($league, $r)];
    }

    public function create(Request $r)
    {
        $data = $r->validate(['name' => 'required|string|max:100', 'description' => 'nullable|string|max:1000', 'locksAt' => 'required|date|after:now', 'targetSurveyId' => ['nullable', 'string', Rule::exists('surveys', 'id')->where('active', true)]]);
        $l = DB::transaction(function () use ($data, $r) {
            $survey = isset($data['targetSurveyId']) ? Survey::where('active', true)->findOrFail($data['targetSurveyId']) : Survey::where('active', true)->where('kind', 'opinion_poll')->get()->sortByDesc(fn ($s) => $s->payload['date'])->first();
            abort_unless($survey && $survey->kind === 'opinion_poll', 422, 'יש לבחור סקר תקין');
            $l = League::create(['name' => $data['name'], 'description' => $data['description'] ?? null, 'owner_id' => $r->user()->id, 'invite_code' => Str::random(40),
                'locks_at' => $data['locksAt'], 'benchmark' => $survey?->payload]);
            $l->users()->attach($r->user()->id);

            return $l;
        });

        return response()->json(['league' => $this->payload($l, $r)], 201);
    }

    public function join(Request $r)
    {
        $data = $r->validate(['code' => 'required|string|size:40']);
        $l = DB::transaction(function () use ($data, $r) {
            $l = League::where('invite_code', $data['code'])->lockForUpdate()->firstOrFail();
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
        $ids = array_keys(config('election.parties'));
        $data = $r->validate(['seats' => ['required', 'array:'.implode(',', $ids)], 'seats.*' => ['required', 'integer', 'min:0', 'max:120'],
            'note' => 'nullable|string|max:500', 'turnoutPercentage' => 'required|numeric|between:0,100|decimal:0,1']);
        abort_unless(array_sum($data['seats']) === 120, 422, 'סך המנדטים חייב להיות 120');
        $seats = array_replace(array_fill_keys($ids, 0), array_map('intval', $data['seats']));
        DB::transaction(function () use ($league, $r, $data, $seats) {
            $l = League::whereKey($league->id)->lockForUpdate()->firstOrFail();
            abort_if($l->isLocked(), 409, 'מועד ההגשה הסתיים');
            $p = Prediction::updateOrCreate(['league_id' => $l->id, 'user_id' => $r->user()->id], ['seats' => $seats, 'turnout' => $data['turnoutPercentage'], 'note' => $data['note'] ?? null]);
            DB::table('prediction_revisions')->insert(['prediction_id' => $p->id, 'payload' => json_encode(['seats' => $seats, 'turnout' => $p->turnout, 'note' => $p->note]), 'created_at' => now()]);
        });

        return ['success' => true, 'league' => $this->payload($league->fresh(), $r)];
    }

    public function stage(League $league, Request $r)
    {
        $this->owner($league, $r);
        $data = $r->validate(['stage' => ['required', Rule::in(['voting_open', 'exit_poll', 'final_results'])],
            'targetSurveyId' => ['required', 'string', Rule::exists('surveys', 'id')->where('active', true)], 'benchmarkTurnoutPercentage' => 'nullable|numeric|between:0,100|decimal:0,1']);
        DB::transaction(function () use ($league, $data, $r) {
            $l = League::whereKey($league->id)->lockForUpdate()->firstOrFail();
            $order = ['voting_open' => 0, 'exit_poll' => 1, 'final_results' => 2];
            abort_if($order[$data['stage']] < $order[$l->stage] || $l->stage === 'final_results', 409, 'לא ניתן לשנות שלב סופי או לפתוח מחדש');
            abort_if($data['stage'] !== 'voting_open' && now()->lt($l->locks_at), 409, 'יש להמתין למועד נעילת התחזיות');
            $survey = Survey::where('active', true)->findOrFail($data['targetSurveyId']);
            $kind = ['voting_open' => 'opinion_poll', 'exit_poll' => 'exit_poll', 'final_results' => 'official_results'][$data['stage']];
            abort_unless($survey->kind === $kind, 422, 'סוג נתונים לא מתאים לשלב');
            if ($kind === 'official_results') {
                abort_unless(isset($data['benchmarkTurnoutPercentage']), 422, 'יש להזין שיעור הצבעה רשמי');
            }
            $l->update(['stage' => $data['stage'], 'benchmark' => $survey->payload, 'turnout' => $kind === 'official_results' ? $data['benchmarkTurnoutPercentage'] : null]);
            DB::table('league_events')->insert(['league_id' => $l->id, 'actor_id' => $r->user()->id, 'type' => 'benchmark_changed', 'payload' => json_encode($data), 'created_at' => now()]);
        });

        return ['success' => true, 'league' => $this->payload($league->fresh(), $r)];
    }

    private function payload(League $l, Request $r): array
    {
        $l->load(['owner', 'users', 'predictions.user']);
        $locked = $l->isLocked();
        $visible = $l->predictions->filter(fn ($p) => $locked || $p->user_id === $r->user()->id);
        $members = $visible->map(fn ($p) => ['id' => $p->id, 'userId' => $p->user_id, 'memberName' => $p->user->name, 'seats' => $p->seats,
            'turnoutPercentage' => $p->turnout, 'submittedAt' => $p->updated_at->toIso8601String(), 'note' => $p->note])->values();
        $rankings = $members->map(function ($p) use ($l) {
            $score = (new Scoring)->score($p['seats'], $l->benchmark['seats'] ?? []);

            return ['predictionId' => $p['id'], ...$score, 'turnoutDiff' => $l->turnout === null ? null : round(abs($p['turnoutPercentage'] - $l->turnout), 1)];
        })->sort(fn ($a, $b) => $a['error'] <=> $b['error'] ?: $b['exactHits'] <=> $a['exactHits'] ?: ($a['turnoutDiff'] ?? 0) <=> ($b['turnoutDiff'] ?? 0))->values();

        return ['id' => $l->id, 'name' => $l->name, 'description' => $l->description, 'creatorName' => $l->owner->name, 'createdAt' => $l->created_at->toIso8601String(),
            'isCommissioner' => $l->owner_id === $r->user()->id, 'isLocked' => $locked, 'locksAt' => $l->locks_at->toIso8601String(),
            'inviteCode' => $l->invite_code, 'electionStage' => $l->stage, 'targetSurveyId' => $l->benchmark['id'] ?? null, 'benchmarkSurvey' => $l->benchmark,
            'benchmarkTurnoutPercentage' => $l->turnout, 'members' => $members, 'rankings' => $l->benchmark ? $rankings : [],
            'unsubmittedPlayers' => $l->users->filter(fn ($u) => ! $l->predictions->contains('user_id', $u->id))->map(fn ($u) => ['id' => (string) $u->id, 'name' => $u->name, 'joinedAt' => $u->pivot->created_at->toIso8601String()])->values(),
            'submittedCount' => $l->predictions->count(), 'totalPlayersCount' => $l->users->count(), 'predictionsHidden' => ! $locked, 'scoringVersion' => $l->scoring_version];
    }
}

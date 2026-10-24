<?php

namespace App\Http\Controllers;

use App\Services\Coffee\SettleVotes;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class CoffeeController extends Controller
{
    public function index(Request $request, SettleVotes $settler)
    {
        $settler->due();
        $bets = DB::table('coffee_bets')->orderByDesc('id')->get();
        $ids = $bets->pluck('creator_id')->merge($bets->pluck('opponent_id'))->filter()->unique();
        $people = DB::table('users')->whereIn('id', $ids)->get(['id', 'name'])->keyBy('id');
        $votes = DB::table('coffee_votes')->selectRaw('bet_id, outcome, COUNT(*) AS total')->groupBy('bet_id', 'outcome')->get()->groupBy('bet_id');
        $mine = DB::table('coffee_votes')->where('user_id', $request->user()->id)->pluck('outcome', 'bet_id');
        $rows = $bets->map(function ($bet) use ($people, $votes, $mine) {
            $counts = $votes->get($bet->id, collect())->keyBy('outcome');

            return [
                'id' => $bet->id, 'question' => $bet->question, 'terms' => $bet->terms,
                'creator' => $people[$bet->creator_id], 'opponent' => $bet->opponent_id ? $people[$bet->opponent_id] : null,
                'creatorSide' => (bool) $bet->creator_side, 'status' => $bet->status,
                'proposerId' => $bet->proposer_id, 'proposedOutcome' => $bet->proposed_outcome === null ? null : (bool) $bet->proposed_outcome,
                'outcome' => $bet->outcome === null ? null : (bool) $bet->outcome,
                'votingEndsAt' => $bet->voting_ends_at ? Carbon::parse($bet->voting_ends_at)->toIso8601String() : null,
                'yesVotes' => (int) ($counts->get(1)->total ?? 0), 'noVotes' => (int) ($counts->get(0)->total ?? 0),
                'myVote' => $mine->has($bet->id) ? (bool) $mine[$bet->id] : null,
            ];
        });

        return ['bets' => $rows];
    }

    public function create(Request $request)
    {
        $data = $request->validate(['question' => ['required', 'string', 'max:240'], 'terms' => ['nullable', 'string', 'max:2000'], 'side' => ['required', 'boolean']]);
        $id = DB::table('coffee_bets')->insertGetId([
            'creator_id' => $request->user()->id, 'question' => $data['question'], 'terms' => $data['terms'] ?? '',
            'creator_side' => $data['side'], 'status' => 'waiting', 'created_at' => now(), 'updated_at' => now(),
        ]);

        return response()->json(['id' => $id], 201);
    }

    public function act(Request $request, int $bet, SettleVotes $settler)
    {
        $data = $request->validate(['action' => ['required', Rule::in(['join', 'cancel', 'propose', 'agree', 'dispute', 'vote'])], 'outcome' => ['required_if:action,propose,vote', 'boolean']]);
        DB::transaction(function () use ($request, $bet, $data, $settler) {
            $row = DB::table('coffee_bets')->where('id', $bet)->lockForUpdate()->first();
            abort_unless($row, 404);
            $user = $request->user()->id;
            $participant = $user === (int) $row->creator_id || $user === (int) $row->opponent_id;
            $update = [];
            switch ($data['action']) {
                case 'join':
                    abort_if($participant, 403, 'אי אפשר להצטרף להתערבות של עצמך');
                    abort_unless($row->status === 'waiting', 409, 'ההתערבות כבר נתפסה');
                    $update = ['opponent_id' => $user, 'status' => 'active'];
                    break;
                case 'cancel':
                    abort_unless($user === (int) $row->creator_id, 403);
                    abort_unless($row->status === 'waiting', 409);
                    $update = ['status' => 'cancelled'];
                    break;
                case 'propose':
                    abort_unless($participant, 403);
                    abort_unless($row->status === 'active', 409);
                    $update = ['status' => 'pending', 'proposer_id' => $user, 'proposed_outcome' => $data['outcome']];
                    break;
                case 'agree':
                case 'dispute':
                    abort_unless($participant && $user !== (int) $row->proposer_id, 403);
                    abort_unless($row->status === 'pending', 409);
                    $update = $data['action'] === 'agree'
                        ? ['status' => 'settled', 'outcome' => $row->proposed_outcome, 'settled_at' => now()]
                        : ['status' => 'disputed', 'voting_ends_at' => now()->addHours(48)];
                    break;
                case 'vote':
                    abort_if($participant, 403, 'המשתתפים לא מצביעים בהתערבות שלהם');
                    abort_unless($row->status === 'disputed', 409);
                    abort_if(DB::table('coffee_votes')->where('bet_id', $bet)->where('user_id', $user)->exists(), 409, 'כבר הצבעת');
                    if (now()->gte($row->voting_ends_at)) {
                        $yes = DB::table('coffee_votes')->where('bet_id', $bet)->where('outcome', true)->count();
                        $no = DB::table('coffee_votes')->where('bet_id', $bet)->where('outcome', false)->count();
                        abort_unless($yes === $no, 409, 'ההצבעה הסתיימה');
                    }
                    DB::table('coffee_votes')->insert(['bet_id' => $bet, 'user_id' => $user, 'outcome' => $data['outcome']]);
                    $settler->settle($row);
                    break;
            }
            if ($update) {
                DB::table('coffee_bets')->where('id', $bet)->update($update + ['updated_at' => now()]);
            }
        }, 3);

        return ['ok' => true];
    }
}

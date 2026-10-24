<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Coffee\SettleVotes;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CoffeeTest extends TestCase
{
    use RefreshDatabase;

    private function bet(User $creator): int
    {
        return $this->actingAs($creator)->postJson('/api/coffee', ['question' => 'Will it happen?', 'terms' => 'At the next inauguration', 'side' => true])->assertCreated()->json('id');
    }

    public function test_matching_agreement_and_identity_guards(): void
    {
        $this->getJson('/api/coffee')->assertUnauthorized();
        [$a, $b, $c] = User::factory()->count(3)->create()->all();
        $id = $this->bet($a);
        $this->postJson("/api/coffee/$id", ['action' => 'join'])->assertForbidden();
        $this->actingAs($b)->postJson("/api/coffee/$id", ['action' => 'join', 'opponent_id' => $c->id])->assertOk();
        $this->actingAs($c)->postJson("/api/coffee/$id", ['action' => 'join'])->assertConflict();
        $this->postJson("/api/coffee/$id", ['action' => 'propose', 'outcome' => true])->assertForbidden();
        $this->actingAs($a)->postJson("/api/coffee/$id", ['action' => 'cancel'])->assertConflict();
        $this->postJson("/api/coffee/$id", ['action' => 'propose', 'outcome' => false])->assertOk();
        $this->postJson("/api/coffee/$id", ['action' => 'agree'])->assertForbidden();
        $this->actingAs($c)->postJson("/api/coffee/$id", ['action' => 'agree'])->assertForbidden();
        $this->actingAs($b)->postJson("/api/coffee/$id", ['action' => 'agree'])->assertOk();
        $this->postJson("/api/coffee/$id", ['action' => 'agree'])->assertConflict();
        $this->getJson('/api/coffee')->assertOk()->assertJsonPath('bets.0.status', 'settled')->assertJsonPath('bets.0.outcome', false)->assertJsonPath('bets.0.opponent.id', $b->id)->assertJsonMissingPath('bets.0.creator.email');
    }

    public function test_dispute_votes_lock_at_deadline_and_settle_once(): void
    {
        [$a, $b, $c, $d] = User::factory()->count(4)->create()->all();
        $id = $this->bet($a);
        $this->actingAs($b)->postJson("/api/coffee/$id", ['action' => 'join'])->assertOk();
        $this->postJson("/api/coffee/$id", ['action' => 'propose', 'outcome' => true])->assertOk();
        $this->actingAs($a)->postJson("/api/coffee/$id", ['action' => 'dispute'])->assertOk();
        $this->postJson("/api/coffee/$id", ['action' => 'vote', 'outcome' => true])->assertForbidden();
        $this->actingAs($c)->postJson("/api/coffee/$id", ['action' => 'vote', 'outcome' => false])->assertOk();
        $this->postJson("/api/coffee/$id", ['action' => 'vote', 'outcome' => true])->assertConflict();
        $this->getJson('/api/coffee')->assertJsonPath('bets.0.myVote', false)->assertJsonPath('bets.0.noVotes', 1)->assertJsonPath('bets.0.status', 'disputed');
        $this->travel(48)->hours();
        $this->actingAs($d)->postJson("/api/coffee/$id", ['action' => 'vote', 'outcome' => true])->assertConflict();
        app(SettleVotes::class)->due();
        app(SettleVotes::class)->due();
        $this->getJson('/api/coffee')->assertJsonPath('bets.0.status', 'settled')->assertJsonPath('bets.0.outcome', false);
    }

    public function test_tie_and_zero_votes_remain_open_until_new_voter_breaks_tie(): void
    {
        [$a, $b, $c, $d, $e] = User::factory()->count(5)->create()->all();
        $id = $this->bet($a);
        $this->actingAs($b)->postJson("/api/coffee/$id", ['action' => 'join'])->assertOk();
        $this->postJson("/api/coffee/$id", ['action' => 'propose', 'outcome' => false])->assertOk();
        $this->actingAs($a)->postJson("/api/coffee/$id", ['action' => 'dispute'])->assertOk();
        $this->actingAs($c)->postJson("/api/coffee/$id", ['action' => 'vote', 'outcome' => true])->assertOk();
        $this->actingAs($d)->postJson("/api/coffee/$id", ['action' => 'vote', 'outcome' => false])->assertOk();
        $this->travel(48)->hours();
        $this->getJson('/api/coffee')->assertJsonPath('bets.0.status', 'disputed');
        $this->actingAs($e)->postJson("/api/coffee/$id", ['action' => 'vote', 'outcome' => true])->assertOk();
        $this->getJson('/api/coffee')->assertJsonPath('bets.0.status', 'settled')->assertJsonPath('bets.0.outcome', true);
        $empty = $this->bet($a);
        DB::table('coffee_bets')->where('id', $empty)->update(['opponent_id' => $b->id, 'status' => 'disputed', 'voting_ends_at' => now()->subMinute()]);
        app(SettleVotes::class)->due();
        $this->assertDatabaseHas('coffee_bets', ['id' => $empty, 'status' => 'disputed']);
    }

    public function test_rules_are_optional_but_validated_when_provided(): void
    {
        $this->actingAs(User::factory()->create());
        foreach ([[], ['terms' => ''], ['terms' => null]] as $rules) {
            $id = $this->postJson('/api/coffee', $rules + ['question' => 'Will it happen?', 'side' => true])->assertCreated()->json('id');
            $this->assertDatabaseHas('coffee_bets', ['id' => $id, 'terms' => '']);
        }
        $this->postJson('/api/coffee', ['question' => 'Will it happen?', 'side' => true, 'terms' => str_repeat('a', 2001)])->assertUnprocessable();
    }

    public function test_validation_and_cancellation(): void
    {
        [$a, $b] = User::factory()->count(2)->create()->all();
        $this->actingAs($a)->postJson('/api/coffee', ['question' => ' ', 'terms' => '', 'side' => true])->assertUnprocessable();
        $id = $this->bet($a);
        $this->postJson("/api/coffee/$id", ['action' => 'propose'])->assertUnprocessable();
        $this->actingAs($b)->postJson("/api/coffee/$id", ['action' => 'cancel'])->assertForbidden();
        $this->actingAs($a)->postJson("/api/coffee/$id", ['action' => 'cancel'])->assertOk();
        $this->actingAs($b)->postJson("/api/coffee/$id", ['action' => 'join'])->assertConflict();
    }
}

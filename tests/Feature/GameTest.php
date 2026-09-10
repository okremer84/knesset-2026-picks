<?php

namespace Tests\Feature;

use App\Models\League;
use App\Models\Survey;
use App\Models\User;
use App\Services\PollStore;
use App\Services\Scoring;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Tests\TestCase;

class GameTest extends TestCase
{
    use RefreshDatabase;

    private function poll(array $overrides = []): Survey
    {
        return app(PollStore::class)->store(array_replace([
            'id' => 'test-poll', 'kind' => 'opinion_poll', 'title' => 'Test poll', 'date' => '2026-09-09',
            'institute' => 'Test institute', 'channelOrMedia' => 'Test publisher', 'sourceUrl' => 'https://example.org/poll',
            'seats' => ['likud' => 60, 'beyachad' => 60],
        ], $overrides));
    }

    private function league(User $owner): League
    {
        $this->poll();
        $id = $this->actingAs($owner)->postJson('/api/leagues', ['name' => 'Our league', 'locksAt' => now()->addDay()->toIso8601String(), 'targetSurveyId' => 'test-poll'])
            ->assertCreated()->json('league.id');

        return League::findOrFail($id);
    }

    private function picks(array $seats = ['likud' => 60, 'beyachad' => 60]): array
    {
        return ['seats' => $seats, 'turnoutPercentage' => 70.5, 'memberName' => 'Cannot impersonate another user'];
    }

    public function test_accounts_require_passwords_and_sessions(): void
    {
        $this->getJson('/api/leagues')->assertUnauthorized();
        $this->postJson('/api/auth/register', ['name' => 'Maya', 'email' => 'MAYA@example.org', 'password' => 'short', 'password_confirmation' => 'short'])->assertUnprocessable();
        $this->postJson('/api/auth/register', ['name' => 'Maya', 'email' => 'MAYA@example.org', 'password' => 'test-password-123', 'password_confirmation' => 'test-password-123'])
            ->assertCreated()->assertJsonPath('user.email', 'maya@example.org')->assertJsonMissingPath('user.password');
        $this->assertAuthenticated();
        $this->getJson('/api/auth/user')->assertOk()->assertJsonPath('user.name', 'Maya');
        $this->postJson('/api/auth/logout')->assertNoContent();
        $this->assertGuest();
        $this->postJson('/api/auth/login', ['email' => 'maya@example.org', 'password' => 'wrong'])->assertUnprocessable();
        $this->postJson('/api/auth/login', ['email' => 'maya@example.org', 'password' => 'test-password-123'])->assertOk();
    }

    public function test_password_reset_revokes_sessions_and_changes_password(): void
    {
        Notification::fake();
        $u = User::factory()->create(['email' => 'reset@example.org']);
        $this->postJson('/api/auth/forgot-password', ['email' => $u->email])->assertOk();
        Notification::assertSentTo($u, ResetPassword::class);
        $token = Password::createToken($u);
        DB::table('sessions')->insert(['id' => 'old-session', 'user_id' => $u->id, 'payload' => '', 'last_activity' => time()]);
        $this->postJson('/api/auth/reset-password', ['email' => $u->email, 'token' => $token, 'password' => 'new-password-123', 'password_confirmation' => 'new-password-123'])->assertOk();
        $this->assertTrue(Hash::check('new-password-123', $u->fresh()->password));
        $this->assertDatabaseMissing('sessions', ['id' => 'old-session']);
        $this->postJson('/api/auth/reset-password', ['email' => $u->email, 'token' => $token, 'password' => 'another-password', 'password_confirmation' => 'another-password'])->assertUnprocessable();
    }

    public function test_membership_and_owner_permissions(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $league = $this->league($owner);
        $this->actingAs($other)->getJson('/api/leagues/'.$league->id)->assertForbidden();
        $this->postJson('/api/leagues/'.$league->id.'/predict', $this->picks())->assertForbidden();
        $this->postJson('/api/leagues/join', ['code' => $league->invite_code])->assertOk();
        $this->postJson('/api/leagues/join', ['code' => $league->invite_code])->assertOk();
        $this->assertSame(2, $league->users()->count());
        $this->postJson('/api/leagues/'.$league->id.'/stage', ['stage' => 'voting_open', 'targetSurveyId' => 'test-poll'])->assertForbidden();
        $this->getJson('/api/leagues')->assertJsonCount(1, 'leagues');
    }

    public function test_identity_cannot_be_spoofed_and_predictions_are_private_until_deadline(): void
    {
        $owner = User::factory()->create(['name' => 'Same name']);
        $other = User::factory()->create(['name' => 'Same name']);
        $league = $this->league($owner);
        $this->postJson('/api/leagues/'.$league->id.'/predict', $this->picks())->assertOk()->assertJsonPath('league.members.0.userId', $owner->id);
        $this->actingAs($other)->postJson('/api/leagues/join', ['code' => $league->invite_code])->assertOk()->assertJsonCount(0, 'league.members');
        $this->postJson('/api/leagues/'.$league->id.'/predict', $this->picks(['likud' => 59, 'beyachad' => 61]))->assertOk()->assertJsonCount(1, 'league.members');
        $this->assertDatabaseCount('predictions', 2);
        $this->actingAs($owner)->getJson('/api/leagues/'.$league->id)->assertJsonCount(1, 'league.members')->assertJsonPath('league.members.0.seats.likud', 60);
        $this->postJson('/api/leagues/'.$league->id.'/predict', $this->picks(['likud' => 58, 'beyachad' => 62]))->assertOk();
        $this->assertDatabaseCount('predictions', 2);
        $this->assertDatabaseCount('prediction_revisions', 3);
        $this->travelTo($league->locks_at);
        $this->getJson('/api/leagues/'.$league->id)->assertJsonPath('league.isLocked', true)->assertJsonCount(2, 'league.members')
            ->assertJsonPath('league.rankings.0.error', 2)->assertJsonPath('league.rankings.1.error', 4);
        $this->postJson('/api/leagues/'.$league->id.'/predict', $this->picks())->assertConflict();
        $this->actingAs(User::factory()->create())->postJson('/api/leagues/join', ['code' => $league->invite_code])->assertConflict();
    }

    public function test_invalid_predictions_cannot_be_saved(): void
    {
        $league = $this->league(User::factory()->create());
        foreach ([['likud' => 119], ['likud' => 121, 'beyachad' => -1], ['likud' => 59.5, 'beyachad' => 60.5], ['fake' => 120]] as $seats) {
            $this->postJson('/api/leagues/'.$league->id.'/predict', $this->picks($seats))->assertUnprocessable();
        }
        $this->postJson('/api/leagues/'.$league->id.'/predict', ['seats' => ['likud' => 120], 'turnoutPercentage' => 101])->assertUnprocessable();
        $this->assertDatabaseCount('predictions', 0);
    }

    public function test_benchmark_is_frozen_and_stages_cannot_be_reopened(): void
    {
        $league = $this->league(User::factory()->create());
        $this->poll(['seats' => ['likud' => 59, 'beyachad' => 61]]);
        $this->getJson('/api/leagues/'.$league->id)->assertJsonPath('league.benchmarkSurvey.seats.likud', 60);
        $this->postJson('/api/leagues/'.$league->id.'/stage', ['stage' => 'exit_poll', 'targetSurveyId' => 'test-poll'])->assertConflict();
        $seats = array_fill_keys(array_keys(config('election.parties')), 0);
        $seats['likud'] = 120;
        $this->poll(['id' => 'official', 'kind' => 'official_results', 'seats' => $seats]);
        $this->travelTo($league->locks_at);
        $this->postJson('/api/leagues/'.$league->id.'/stage', ['stage' => 'final_results', 'targetSurveyId' => 'test-poll', 'benchmarkTurnoutPercentage' => 70])->assertUnprocessable();
        $this->postJson('/api/leagues/'.$league->id.'/stage', ['stage' => 'final_results', 'targetSurveyId' => 'official'])->assertUnprocessable();
        $this->postJson('/api/leagues/'.$league->id.'/stage', ['stage' => 'final_results', 'targetSurveyId' => 'official', 'benchmarkTurnoutPercentage' => 70])->assertOk()->assertJsonPath('league.electionStage', 'final_results');
        $this->postJson('/api/leagues/'.$league->id.'/stage', ['stage' => 'voting_open', 'targetSurveyId' => 'test-poll'])->assertConflict();
        $this->assertDatabaseCount('league_events', 1);
    }

    public function test_scoring_distinguishes_perfect_from_near_perfect_and_ignores_unreported_parties(): void
    {
        $scoring = new Scoring;
        $this->assertSame(['error' => 0, 'exactHits' => 2], $scoring->score(['likud' => 60, 'beyachad' => 60], ['likud' => 60, 'beyachad' => 60]));
        $this->assertSame(['error' => 2, 'exactHits' => 0], $scoring->score(['likud' => 59, 'beyachad' => 61], ['likud' => 60, 'beyachad' => 60]));
        $this->assertSame(['error' => 0, 'exactHits' => 1], $scoring->score(['likud' => 60, 'balad' => 3], ['likud' => 60]));
    }

    public function test_turnout_breaks_an_equal_score_only_after_official_results(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $league = $this->league($owner);
        $this->postJson('/api/leagues/'.$league->id.'/predict', [...$this->picks(), 'turnoutPercentage' => 80])->assertOk();
        $this->actingAs($other)->postJson('/api/leagues/join', ['code' => $league->invite_code])->assertOk();
        $this->postJson('/api/leagues/'.$league->id.'/predict', [...$this->picks(), 'turnoutPercentage' => 70])->assertOk();
        $this->travelTo($league->locks_at);
        $this->getJson('/api/leagues/'.$league->id)->assertJsonPath('league.rankings.0.turnoutDiff', null);
        $seats = array_replace(array_fill_keys(array_keys(config('election.parties')), 0), ['likud' => 60, 'beyachad' => 60]);
        $this->poll(['id' => 'official', 'kind' => 'official_results', 'seats' => $seats]);
        $result = $this->actingAs($owner)->postJson('/api/leagues/'.$league->id.'/stage', ['stage' => 'final_results', 'targetSurveyId' => 'official', 'benchmarkTurnoutPercentage' => 72])->assertOk();
        $ranks = $result->json('league.rankings');
        $this->assertEquals(2, $ranks[0]['turnoutDiff']);
        $this->assertEquals(8, $ranks[1]['turnoutDiff']);
        $this->assertSame(0, $ranks[0]['error']);
    }
}

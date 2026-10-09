<?php

namespace Tests\Feature;

use App\Models\League;
use App\Models\Prediction;
use App\Models\Survey;
use App\Models\User;
use App\Services\PollStore;
use App\Services\Scoring;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class GameTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-10-06T12:00:00Z'));
        config(['election.date' => '2026-10-27']);
    }

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
        $id = $this->actingAs($owner)->postJson('/api/leagues', ['name' => 'Our league', 'locksAt' => now('Asia/Jerusalem')->addDay()->setTime(20, 0)->toIso8601String(), 'targetSurveyId' => 'test-poll'])
            ->assertCreated()->json('league.id');

        return League::findOrFail($id);
    }

    private function picks(array $seats = ['likud' => 60, 'beyachad' => 60]): array
    {
        return ['seats' => $seats, 'turnoutPercentage' => 70.5, 'memberName' => 'Cannot impersonate another user'];
    }

    public function test_pick_name_is_saved_separately_from_account_name(): void
    {
        $user = User::factory()->create(['name' => 'Omer']);
        $this->actingAs($user)->postJson('/api/my-pick', [
            ...$this->picks(), 'pickName' => 'Best pickssss i ruleeee',
        ])->assertOk()->assertJsonPath('pick.pickName', 'Best pickssss i ruleeee')->assertJsonPath('pick.memberName', 'Omer');
        $this->getJson('/api/my-picks')->assertOk()->assertJsonPath('picks.0.pickName', 'Best pickssss i ruleeee');
        $this->assertSame('Omer', $user->fresh()->name);
        $this->postJson('/api/my-pick', [...$this->picks(), 'pickName' => 'Updated title'])->assertOk()->assertJsonPath('pick.pickName', 'Updated title');
        $this->postJson('/api/my-pick', [...$this->picks(), 'pickName' => str_repeat('x', 101)])->assertUnprocessable();
        $this->getJson('/api/my-picks')->assertJsonPath('pick.pickName', 'Updated title');
    }

    public function test_my_picks_returns_one_personal_submission_independent_of_memberships(): void
    {
        $this->getJson('/api/my-picks')->assertUnauthorized();
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $league = $this->league($owner);
        $this->getJson('/api/my-picks')->assertOk()->assertJsonCount(0, 'picks');
        $this->postJson('/api/leagues/'.$league->id.'/predict', $this->picks())->assertOk();
        $this->getJson('/api/my-picks')->assertOk()->assertJsonCount(1, 'picks')->assertJsonPath('picks.0.seats.likud', 60)->assertJsonPath('pick.userId', $owner->id);
        $this->actingAs($other)->postJson('/api/leagues/join', ['code' => $league->invite_code])->assertOk();
        $this->getJson('/api/my-picks')->assertOk()->assertJsonCount(0, 'picks');
        $league->users()->detach($owner->id);
        $this->actingAs($owner)->getJson('/api/my-picks')->assertOk()->assertJsonCount(1, 'picks');
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
        $this->postJson('/api/leagues/'.$league->id.'/deadline', ['locksAt' => now()->addDays(2)->toIso8601String()])->assertNotFound();
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
        $this->assertDatabaseCount('personal_predictions', 2);
        $this->actingAs($owner)->getJson('/api/leagues/'.$league->id)->assertJsonCount(1, 'league.members')->assertJsonPath('league.members.0.seats.likud', 60);
        $this->postJson('/api/leagues/'.$league->id.'/predict', $this->picks(['likud' => 58, 'beyachad' => 62]))->assertOk();
        $this->assertDatabaseCount('personal_predictions', 2);
        $this->assertDatabaseCount('personal_prediction_revisions', 3);
        $this->travelTo($league->locks_at);
        $this->getJson('/api/leagues/'.$league->id)->assertJsonPath('league.isLocked', true)->assertJsonCount(2, 'league.members')
            ->assertJsonCount(0, 'league.rankings');
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
        $this->assertDatabaseCount('personal_predictions', 0);
    }

    public function test_new_balad_allocations_are_rejected_including_from_stale_clients(): void
    {
        $league = $this->league(User::factory()->create());
        foreach (['/api/my-pick', '/api/leagues/'.$league->id.'/predict'] as $endpoint) {
            $this->postJson($endpoint, $this->picks(['likud' => 112, 'balad' => 8]))->assertUnprocessable();
        }
        $this->assertDatabaseCount('personal_predictions', 0);
        $this->assertDatabaseCount('personal_prediction_revisions', 0);
        $this->postJson('/api/my-pick', $this->picks(['likud' => 112, 'joint_list' => 8, 'balad' => 0]))->assertOk();
    }

    public function test_existing_balad_allocations_are_preserved_but_cannot_be_increased(): void
    {
        $user = User::factory()->create();
        $seats = ['likud' => 104, 'joint_list' => 8, 'balad' => 8];
        $prediction = Prediction::create(['user_id' => $user->id, 'seats' => $seats, 'turnout' => 70.5]);
        $this->actingAs($user)->getJson('/api/my-picks')->assertOk()
            ->assertJsonPath('pick.seats.balad', 8)->assertJsonPath('pick.seats.joint_list', 8);
        $this->assertSame($seats, $prediction->fresh()->seats);
        $this->postJson('/api/my-pick', $this->picks(['likud' => 100, 'joint_list' => 12, 'balad' => 8]))->assertOk()
            ->assertJsonPath('pick.seats.balad', 8)->assertJsonPath('pick.seats.joint_list', 12);
        $this->postJson('/api/my-pick', $this->picks(['likud' => 100, 'joint_list' => 8, 'balad' => 12]))->assertUnprocessable();
        $this->assertSame(8, $prediction->fresh()->seats['balad']);
        $this->assertDatabaseCount('personal_prediction_revisions', 1);
        $this->postJson('/api/my-pick', $this->picks(['likud' => 112, 'joint_list' => 8]))->assertOk()
            ->assertJsonPath('pick.seats.balad', 0)->assertJsonPath('pick.seats.joint_list', 8);
        $this->postJson('/api/my-pick', $this->picks($seats))->assertUnprocessable();
        $this->assertSame(0, $prediction->fresh()->seats['balad']);
        $this->assertDatabaseCount('personal_prediction_revisions', 2);
    }

    public function test_predictions_require_zero_or_at_least_four_seats_per_party(): void
    {
        $league = $this->league(User::factory()->create());
        foreach (['/api/my-pick', '/api/leagues/'.$league->id.'/predict'] as $endpoint) {
            $this->postJson($endpoint, $this->picks(['likud' => 116, 'beyachad' => 4, 'shas' => 0]))->assertOk();
            foreach ([1, 2, 3] as $belowMinimum) {
                $this->postJson($endpoint, $this->picks(['likud' => 120 - $belowMinimum, 'beyachad' => $belowMinimum]))->assertUnprocessable();
            }
            $this->getJson('/api/my-picks')->assertJsonPath('pick.seats.beyachad', 4);
        }
    }

    public function test_leagues_wait_for_published_exit_poll_then_automatically_use_final_results(): void
    {
        $league = $this->league(User::factory()->create());
        $this->postJson('/api/leagues/'.$league->id.'/predict', $this->picks())->assertOk();
        $this->getJson('/api/leagues/'.$league->id)->assertJsonPath('league.benchmarkSurvey', null);
        $this->travelTo($league->locks_at);
        $this->getJson('/api/leagues/'.$league->id)->assertJsonCount(0, 'league.rankings');
        $seats = array_replace(array_fill_keys(array_keys(config('election.parties')), 0), ['likud' => 60, 'beyachad' => 60]);
        $this->poll(['id' => 'exit', 'kind' => 'exit_poll', 'date' => '2026-10-27', 'seats' => $seats]);
        $this->getJson('/api/leagues/'.$league->id)->assertJsonPath('league.benchmarkSurvey', null);
        $this->travelTo(CarbonImmutable::parse('2026-10-27T20:00:00Z'));
        $this->getJson('/api/leagues/'.$league->id)->assertJsonPath('league.electionStage', 'exit_poll')->assertJsonPath('league.rankings.0.error', 0);
        $this->poll(['id' => 'official', 'kind' => 'official_results', 'date' => '2026-10-27', 'seats' => $seats, 'turnoutPercentage' => 72]);
        $this->getJson('/api/leagues/'.$league->id)->assertJsonPath('league.electionStage', 'final_results')->assertJsonPath('league.rankings.0.turnoutDiff', 1.5);
        $this->poll(['id' => 'exit-later', 'kind' => 'exit_poll', 'date' => '2026-10-27', 'seats' => $seats]);
        $this->getJson('/api/leagues/'.$league->id)->assertJsonPath('league.benchmarkSurvey.id', 'official');
        $this->postJson('/api/leagues/'.$league->id.'/stage', ['stage' => 'voting_open'])->assertNotFound();
    }

    public function test_scoring_distinguishes_perfect_from_near_perfect_and_ignores_unreported_parties(): void
    {
        $scoring = new Scoring;
        $this->assertSame(['error' => 0, 'exactHits' => 2], $scoring->score(['likud' => 60, 'beyachad' => 60], ['likud' => 60, 'beyachad' => 60]));
        $this->assertSame(['error' => 2, 'exactHits' => 0], $scoring->score(['likud' => 59, 'beyachad' => 61], ['likud' => 60, 'beyachad' => 60]));
        $this->assertSame(['error' => 0, 'exactHits' => 1], $scoring->score(['likud' => 60, 'balad' => 3], ['likud' => 60]));
    }

    public function test_league_creation_needs_no_poll_and_ignores_legacy_poll_selections(): void
    {
        $response = $this->actingAs(User::factory()->create())->postJson('/api/leagues', [
            'name' => 'No polls', 'locksAt' => now('Asia/Jerusalem')->addDay()->setTime(20, 0)->toIso8601String(), 'targetSurveyId' => 'nonexistent',
        ])->assertCreated();
        $reloaded = $this->getJson('/api/leagues/'.$response->json('league.id'))->assertOk();
        $reloaded->assertJsonPath('league.isLocked', false)->assertJsonPath('league.predictionsHidden', true);
        $response->assertJsonPath('league.benchmarkSurvey', null)
            ->assertJsonPath('league.isLocked', false)
            ->assertJsonPath('league.predictionsHidden', true)
            ->assertJsonPath('league.myPickLocked', false);
        $this->assertSame($reloaded->json('league'), $response->json('league'));
    }

    public function test_invalid_invitation_errors_are_in_hebrew(): void
    {
        $this->actingAs(User::factory()->create());
        foreach ([[], ['code' => ''], ['code' => ['invalid']], ['code' => 'short']] as $payload) {
            $this->postJson('/api/leagues/join', $payload)->assertUnprocessable()
                ->assertJsonPath('errors.code.0', 'יש להזין קוד הזמנה תקין באורך 40 תווים.');
        }
        $this->postJson('/api/leagues/join', ['code' => str_repeat('x', 40)])
            ->assertNotFound()->assertJsonPath('message', 'קוד ההזמנה לא נמצא. בדקו את הקישור או בקשו הזמנה חדשה.');
    }

    public function test_league_index_returns_only_summaries_and_show_loads_details(): void
    {
        $user = User::factory()->create();
        $league = $this->league($user);
        $this->postJson('/api/leagues/'.$league->id.'/predict', $this->picks())->assertOk();
        $this->getJson('/api/leagues')->assertOk()->assertExactJson([
            'leagues' => [['id' => $league->id, 'name' => $league->name]],
        ]);
        $this->getJson('/api/leagues/'.$league->id)->assertOk()->assertJsonCount(1, 'league.members');
    }

    public function test_complete_roster_does_not_expose_other_members_picks_or_notes(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $league = $this->league($owner);
        $this->postJson('/api/leagues/'.$league->id.'/predict', [...$this->picks(), 'note' => 'private note'])->assertOk();
        $response = $this->actingAs($other)->postJson('/api/leagues/join', ['code' => $league->invite_code])->assertOk();
        $response->assertJsonCount(2, 'league.participants')->assertJsonCount(0, 'league.members');
        $people = collect($response->json('league.participants'))->keyBy('userId');
        $this->assertTrue($people[$owner->id]['submitted']);
        $this->assertFalse($people[$other->id]['submitted']);
        $this->assertStringNotContainsString('private note', $response->getContent());
        $this->assertSame(['userId', 'name', 'submitted'], array_keys($people[$owner->id]));
        $this->travelTo($league->locks_at);
        $this->getJson('/api/leagues/'.$league->id)->assertJsonPath('league.members.0.note', 'private note');
    }

    public function test_deadlines_are_fixed_at_creation_and_capped_at_israel_election_evening(): void
    {
        $owner = User::factory()->create();
        $league = $this->league($owner);
        $endpoint = '/api/leagues/'.$league->id.'/deadline';
        $this->getJson('/api/election')->assertJsonPath('deadlineLimit', '2026-10-27T18:00:00+00:00');
        $this->postJson($endpoint, ['locksAt' => '2026-10-27T18:00:00Z'])->assertNotFound();
        $this->assertEquals($league->locks_at, $league->fresh()->locks_at);
        $this->travelTo($league->locks_at);
        $this->postJson($endpoint, ['locksAt' => '2026-10-27T18:00:00Z'])->assertNotFound();
        $this->assertDatabaseCount('league_events', 0);
        foreach (['2026-10-27T18:00:01Z', '2026-10-20T16:00:00Z', now()->subMinute()->toIso8601String()] as $deadline) {
            $this->postJson('/api/leagues', ['name' => 'Invalid deadline', 'locksAt' => $deadline])->assertUnprocessable();
        }
        $this->postJson('/api/leagues', ['name' => 'Election night', 'locksAt' => '2026-10-27T20:00:00+02:00'])
            ->assertCreated()->assertJsonPath('league.locksAt', '2026-10-27T18:00:00+00:00');
    }

    public function test_creation_normalizes_offsets_and_preserves_privacy_until_the_real_cutoff(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        foreach (['2026-10-06T20:00:00+03:00', '2026-10-06T05:00:00-12:00', '2026-10-07T07:00:00+14:00', '2026-10-06T17:00:00Z'] as $deadline) {
            $response = $this->actingAs($owner)->postJson('/api/leagues', ['name' => 'Offset test', 'locksAt' => $deadline])
                ->assertCreated()->assertJsonPath('league.locksAt', '2026-10-06T17:00:00+00:00')
                ->assertJsonPath('league.isLocked', false);
            $id = $response->json('league.id');
            $this->postJson('/api/my-pick', [...$this->picks(), 'note' => 'Private until 20:00'])->assertOk();
            $this->actingAs($other)->postJson('/api/leagues/join', ['code' => $response->json('league.inviteCode')])
                ->assertOk()->assertJsonCount(0, 'league.members');
            $this->travelTo(CarbonImmutable::parse('2026-10-06T16:59:59Z'));
            $this->getJson('/api/leagues/'.$id)->assertJsonPath('league.predictionsHidden', true)->assertJsonCount(0, 'league.members');
            $this->travelTo(CarbonImmutable::parse('2026-10-06T17:00:00Z'));
            $this->getJson('/api/leagues/'.$id)->assertJsonPath('league.members.0.note', 'Private until 20:00');
            $this->actingAs($owner)->postJson('/api/my-pick', $this->picks())->assertConflict();
            $this->travelTo(CarbonImmutable::parse('2026-10-06T12:00:00Z'));
        }
    }

    public function test_turnout_overrides_exact_hit_count_on_equal_points(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $league = $this->league($owner);
        $this->postJson('/api/leagues/'.$league->id.'/predict', [...$this->picks(['likud' => 60, 'beyachad' => 52, 'raam' => 8]), 'turnoutPercentage' => 80])->assertOk();
        $this->actingAs($other)->postJson('/api/leagues/join', ['code' => $league->invite_code])->assertOk();
        $otherPick = $this->postJson('/api/leagues/'.$league->id.'/predict', [...$this->picks(['likud' => 59, 'beyachad' => 52, 'raam' => 9]), 'turnoutPercentage' => 70])->assertOk()->json('league.members.0.id');
        // Both have error 4, but the owner's exact hits must not outrank closer turnout.
        $seats = array_replace(array_fill_keys(array_keys(config('election.parties')), 0), ['likud' => 60, 'beyachad' => 50, 'raam' => 10]);
        $this->poll(['id' => 'official', 'kind' => 'official_results', 'date' => '2026-10-27', 'seats' => $seats, 'turnoutPercentage' => 72]);
        $this->travelTo(CarbonImmutable::parse('2026-10-27T20:00:00Z'));
        $this->getJson('/api/leagues/'.$league->id)->assertJsonPath('league.rankings.0.predictionId', $otherPick)
            ->assertJsonPath('league.rankings.0.error', 4);
    }

    public function test_legacy_deadlines_are_capped_on_election_day(): void
    {
        $league = $this->league(User::factory()->create());
        $league->update(['locks_at' => '2026-12-01T12:00:00Z']);
        $this->getJson('/api/leagues/'.$league->id)->assertJsonPath('league.locksAt', '2026-10-27T18:00:00+00:00');
        $this->travelTo(CarbonImmutable::parse('2026-10-27T18:00:00Z'));
        $this->postJson('/api/leagues/'.$league->id.'/predict', $this->picks())->assertConflict();
    }

    public function test_one_pick_is_shared_by_existing_and_new_leagues_and_locks_at_first_deadline(): void
    {
        $owner = User::factory()->create();
        $first = $this->league($owner);
        $second = $this->league($owner);
        $second->update(['locks_at' => '2026-10-20T17:00:00Z']);
        $this->postJson('/api/my-pick', [...$this->picks(), 'note' => 'One note'])->assertOk();
        $initial = $this->getJson('/api/leagues/'.$first->id)->json('league.members.0');
        $this->getJson('/api/leagues/'.$second->id)->assertJsonPath('league.members.0', $initial);
        $this->postJson('/api/leagues/'.$second->id.'/predict', $this->picks(['likud' => 55, 'beyachad' => 65]))->assertOk();
        $this->getJson('/api/leagues/'.$first->id)->assertJsonPath('league.members.0.seats.likud', 55);
        $this->assertDatabaseCount('personal_predictions', 1);
        $this->getJson('/api/my-picks')->assertJsonCount(1, 'picks')->assertJsonPath('isLocked', false);
        $this->travelTo($first->locks_at);
        $this->getJson('/api/my-picks')->assertJsonPath('isLocked', true);
        $this->postJson('/api/my-pick', $this->picks())->assertConflict();
        $this->postJson('/api/leagues/'.$second->id.'/predict', $this->picks())->assertConflict();
        $this->getJson('/api/leagues/'.$second->id)->assertJsonPath('league.isLocked', false)->assertJsonPath('league.myPickLocked', true);
        $third = $this->league($owner);
        $this->getJson('/api/leagues/'.$third->id)->assertJsonPath('league.members.0.seats.likud', 55);
        $this->postJson('/api/leagues/'.$third->id.'/predict', $this->picks())->assertConflict();
    }

    public function test_personal_pick_can_be_submitted_before_joining_and_stays_private_until_each_leagues_deadline(): void
    {
        $owner = User::factory()->create();
        $early = $this->league($owner);
        $late = $this->league($owner);
        $late->update(['locks_at' => '2026-10-20T17:00:00Z']);
        $other = User::factory()->create();
        $this->actingAs($other)->postJson('/api/my-pick', [...$this->picks(), 'note' => 'Private shared note'])->assertOk();
        foreach ([$early, $late] as $league) {
            $this->postJson('/api/leagues/join', ['code' => $league->invite_code])->assertOk()->assertJsonPath('league.submittedCount', 1);
        }
        $this->travelTo($early->locks_at);
        $this->actingAs($owner)->getJson('/api/leagues/'.$early->id)->assertJsonPath('league.members.0.note', 'Private shared note');
        $this->getJson('/api/leagues/'.$late->id)->assertJsonCount(0, 'league.members')->assertJsonPath('league.submittedCount', 1);
        $this->travelTo($late->locks_at);
        $this->getJson('/api/leagues/'.$late->id)->assertJsonPath('league.members.0.note', 'Private shared note');
    }

    public function test_personal_pick_without_leagues_locks_on_election_day(): void
    {
        $this->actingAs(User::factory()->create());
        $this->postJson('/api/my-pick', $this->picks())->assertOk();
        $this->travelTo(CarbonImmutable::parse('2026-10-27T18:00:00Z'));
        $this->getJson('/api/my-picks')->assertJsonPath('isLocked', true);
        $this->postJson('/api/my-pick', $this->picks())->assertConflict();
    }

    public function test_personal_pick_migration_preserves_legacy_records_and_first_closed_pick(): void
    {
        $owner = User::factory()->create();
        $early = $this->league($owner);
        $late = $this->league($owner);
        $late->update(['locks_at' => '2026-10-20T17:00:00Z']);
        $migration = require database_path('migrations/2026_10_06_000001_create_personal_predictions.php');
        $migration->down();
        foreach ([[$early, 'first', 60], [$late, 'latest', 55]] as [$league, $id, $seats]) {
            DB::table('predictions')->insert(['id' => $id, 'league_id' => $league->id, 'user_id' => $owner->id,
                'seats' => json_encode(['likud' => $seats, 'beyachad' => 120 - $seats]), 'turnout' => 70,
                'created_at' => now(), 'updated_at' => $id === 'latest' ? now()->addMinute() : now()]);
            DB::table('prediction_revisions')->insert(['prediction_id' => $id, 'payload' => '{}', 'created_at' => now()]);
        }
        $this->travelTo($early->locks_at);
        $migration->up();
        $this->getJson('/api/my-picks')->assertJsonPath('pick.seats.likud', 60)->assertJsonPath('isLocked', true);
        $this->assertDatabaseCount('personal_predictions', 1);
        $this->assertDatabaseCount('personal_prediction_revisions', 1);
        $this->assertDatabaseCount('predictions', 2);
        $this->assertDatabaseCount('prediction_revisions', 2);
    }
}

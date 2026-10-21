<?php

namespace Tests\Feature;

use App\Models\League;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PredictionMigrationTest extends TestCase
{
    // MySQL schema changes implicitly commit, so this test cannot use transaction isolation.
    use DatabaseTruncation;

    protected function setUp(): void
    {
        RefreshDatabaseState::$migrated = false;
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-10-06T12:00:00Z'));
        config(['election.date' => '2026-10-27']);
    }

    protected function tearDown(): void
    {
        RefreshDatabaseState::$migrated = false;
        parent::tearDown();
    }

    public function test_personal_pick_migration_preserves_legacy_records_and_first_closed_pick(): void
    {
        $owner = User::factory()->create();
        $early = League::create(['name' => 'Early', 'owner_id' => $owner->id, 'invite_code' => str_repeat('a', 40), 'locks_at' => '2026-10-07T17:00:00Z']);
        $early->users()->attach($owner);
        $late = League::create(['name' => 'Late', 'owner_id' => $owner->id, 'invite_code' => str_repeat('b', 40), 'locks_at' => '2026-10-20T17:00:00Z']);
        $late->users()->attach($owner);
        $this->actingAs($owner);
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
        $this->assertSame(60, json_decode(DB::table('personal_predictions')->first()->seats, true)['likud']);
        $this->assertDatabaseCount('personal_predictions', 1);
        $this->assertDatabaseCount('personal_prediction_revisions', 1);
        $this->assertDatabaseCount('predictions', 2);
        $this->assertDatabaseCount('prediction_revisions', 2);
        (require database_path('migrations/2026_10_06_000002_add_pick_name_to_personal_predictions.php'))->up();
        DB::table('personal_predictions')->update(['pick_name' => 'Existing pick', 'note' => 'Keep me']);
        (require database_path('migrations/2026_10_21_000000_scope_predictions_to_leagues.php'))->up();
        $this->assertDatabaseCount('personal_predictions', 3);
        $this->assertDatabaseCount('personal_prediction_revisions', 3);
        foreach ([$early, $late] as $league) {
            $this->getJson('/api/my-picks?leagueId='.$league->id)->assertJsonPath('pick.seats.likud', 60)
                ->assertJsonPath('pick.pickName', 'Existing pick')->assertJsonPath('pick.note', 'Keep me');
        }
        $this->postJson('/api/leagues/'.$early->id.'/predict', ['seats' => ['likud' => 60, 'beyachad' => 60], 'turnoutPercentage' => 70])->assertConflict();
        $this->postJson('/api/leagues/'.$late->id.'/predict', ['seats' => ['likud' => 50, 'beyachad' => 70], 'turnoutPercentage' => 70])->assertOk();
        $this->getJson('/api/my-picks?leagueId='.$early->id)->assertJsonPath('pick.seats.likud', 60);
    }
}

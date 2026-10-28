<?php

namespace Tests\Feature;

use App\Models\League;
use App\Models\Prediction;
use App\Models\Survey;
use App\Models\User;
use App\Services\PollStore;
use App\Services\YnetResults;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schedule;
use Tests\TestCase;

class ElectionResultsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-10-28T05:00:00Z'));
        Http::preventStrayRequests();
    }

    private function html(): string
    {
        return file_get_contents(base_path('tests/Fixtures/ynet-actual-results.html'));
    }

    public function test_observed_ynet_update_matches_the_reviewed_snapshot(): void
    {
        $actual = app(YnetResults::class)->parse($this->html());
        $seed = json_decode(file_get_contents(base_path('data/actual-results.json')), true)['surveys'][0];
        unset($seed['syncedAt']);
        $this->assertEquals($seed, $actual);
        $this->assertSame(120, array_sum($actual['seats']));
        $this->assertSame('2026-10-28T04:03:10+00:00', $actual['publishedAt']);
        $this->assertArrayNotHasKey('turnoutPercentage', $actual);
    }

    public function test_exit_poll_posts_are_never_published_as_actual_counts(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('No national seat-count update found');
        app(YnetResults::class)->parse(str_replace('<h3>', '<h3>מדגם מעודכן: ', $this->html()));
    }

    public function test_seed_and_upgrade_replace_active_polls_without_deleting_history(): void
    {
        $exit = json_decode(file_get_contents(base_path('data/election-results.json')), true)['surveys'][0];
        app(PollStore::class)->store($exit);
        $poll = json_decode(file_get_contents(base_path('data/wikipedia-surveys.json')), true)['surveys'][0];
        app(PollStore::class)->store($poll);
        // Existing migration-only deployments use the same seeder as a fresh install.
        $migration = require database_path('migrations/2026_10_28_000000_publish_actual_results.php');
        $migration->down();
        $migration->up();
        $this->assertSame(1, Survey::where('active', true)->count());
        $this->assertDatabaseHas('surveys', ['id' => $exit['id'], 'active' => false]);
        $this->assertDatabaseHas('survey_revisions', ['survey_id' => $poll['id']]);
        $this->getJson('/api/results')->assertOk()->assertJsonCount(1, 'surveys')->assertJsonPath('surveys.0.kind', 'actual_results');
        $count = DB::table('survey_revisions')->count();
        $this->seed();
        $this->assertDatabaseCount('survey_revisions', $count);
    }

    public function test_same_count_refresh_updates_check_time_without_creating_a_revision(): void
    {
        Http::fake(['*' => Http::response($this->html())]);
        $this->artisan('results:sync')->assertSuccessful();
        $first = $this->getJson('/api/results')->assertJsonPath('sync.status', 'succeeded')->assertJsonPath('sync.stale', false)->json();
        $this->travel(5)->minutes();
        $this->artisan('results:sync')->assertSuccessful();
        $next = $this->getJson('/api/results')->json();
        $this->assertSame($first['surveys'][0]['publishedAt'], $next['surveys'][0]['publishedAt']);
        $this->assertNotSame($first['sync']['lastSuccessAt'], $next['sync']['lastSuccessAt']);
        $this->assertDatabaseCount('survey_revisions', 1);
        Http::assertSentCount(2);
        Http::assertSent(fn ($request) => $request->url() === config('election.results_source_url'));
    }

    public function test_a_newer_complete_count_replaces_the_snapshot_and_survives_reseeding(): void
    {
        $this->seed();
        $html = str_replace(['04:03:10', 'עם 28 מנדטים', 'ישר עם 21', '37%'], ['05:03:10', 'עם 29 מנדטים', 'ישר עם 20', '42%'], $this->html());
        Http::fake(['*' => Http::response($html)]);
        $this->artisan('results:sync')->assertSuccessful();
        $this->seed();
        $this->getJson('/api/results')->assertJsonPath('surveys.0.seats.likud', 29)->assertJsonPath('surveys.0.countedPercentage', 42);
        Survey::whereKey('actual-2026-ynet')->update(['active' => false]);
        $this->seed();
        $this->getJson('/api/results')->assertJsonCount(0, 'surveys');
    }

    public function test_invalid_latest_count_does_not_fall_back_to_an_older_valid_post(): void
    {
        $this->seed();
        $before = Survey::find('actual-2026-ynet')->payload;
        $newer = str_replace(['04:03:10', 'עם 28 מנדטים'], ['05:03:10', 'עם 30 מנדטים'], $this->html());
        Http::fake(['*' => Http::response($this->html().$newer)]);
        $this->artisan('results:sync')->assertFailed();
        $this->assertSame($before, Survey::find('actual-2026-ynet')->payload);
        $this->getJson('/api/results')->assertJsonPath('sync.status', 'failed');
    }

    public function test_http_failure_old_count_and_changed_source_keep_last_good_result_and_check_time(): void
    {
        Http::fakeSequence()->push($this->html())->push('', 503)->push('<h1>Layout changed</h1>')
            ->push(str_replace('04:03:10', '03:03:10', $this->html()));
        $this->artisan('results:sync')->assertSuccessful();
        $before = $this->getJson('/api/results')->json();
        for ($attempt = 0; $attempt < 3; $attempt++) {
            $this->travel(5)->minutes();
            $this->artisan('results:sync')->assertFailed();
            $current = $this->getJson('/api/results')->assertJsonPath('sync.status', 'failed')->json();
            $this->assertSame($before['surveys'], $current['surveys']);
            $this->assertSame($before['sync']['lastSuccessAt'], $current['sync']['lastSuccessAt']);
        }
        $this->getJson('/api/results')->assertJsonPath('sync.stale', true);
    }

    public function test_partial_results_rank_the_league_and_only_final_results_break_turnout_ties(): void
    {
        $this->seed();
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $league = League::create(['name' => 'Results', 'owner_id' => $owner->id, 'locks_at' => '2026-10-27 18:00:00', 'invite_code' => str_repeat('a', 40), 'scoring_version' => 'v1']);
        $league->users()->attach([$owner->id, $other->id]);
        $result = Survey::find('actual-2026-ynet')->payload;
        foreach ([$owner, $other] as $i => $user) {
            Prediction::create(['user_id' => $user->id, 'scope' => $league->id, 'seats' => $result['seats'], 'turnout' => 70 + $i]);
        }
        $this->actingAs($owner)->getJson('/api/leagues/'.$league->id)->assertJsonPath('league.electionStage', 'counting')
            ->assertJsonPath('league.rankings.0.error', 0)->assertJsonPath('league.rankings.0.turnoutDiff', null)
            ->assertJsonPath('league.rankings.1.turnoutDiff', null);
        app(PollStore::class)->store([...$result, 'id' => 'final', 'kind' => 'official_results', 'turnoutPercentage' => 71]);
        $this->getJson('/api/results')->assertJsonCount(1, 'surveys')->assertJsonPath('surveys.0.id', 'final');
        $this->getJson('/api/leagues/'.$league->id)->assertJsonPath('league.electionStage', 'final_results')
            ->assertJsonPath('league.rankings.0.turnoutDiff', 0)->assertJsonPath('league.rankings.1.turnoutDiff', 1);
        $this->artisan('results:sync')->assertSuccessful();
        Http::assertNothingSent();
    }

    public function test_schedule_runs_actual_results_every_five_minutes_and_no_opinion_poll_import(): void
    {
        $events = collect(Schedule::events());
        $this->assertSame('*/5 * * * *', $events->first(fn ($event) => str_contains($event->command ?? '', 'results:sync'))->expression);
        $this->assertFalse($events->contains(fn ($event) => str_contains($event->command ?? '', 'polls:sync')));
    }
}

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
use PHPUnit\Framework\Attributes\DataProvider;
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

    public function test_sync_follows_the_closed_blog_and_remembers_the_current_source(): void
    {
        $this->seed();
        $nextUrl = 'https://www.ynet.co.il/news/blogs/article/bkiwzbj6mg';
        Http::fake([
            config('election.results_source_url') => Http::response(file_get_contents(base_path('tests/Fixtures/ynet-closed-results.html'))),
            $nextUrl => Http::response(file_get_contents(base_path('tests/Fixtures/ynet-next-results.html'))),
        ]);
        $this->artisan('results:sync')->assertSuccessful();
        $this->getJson('/api/results')->assertJsonPath('surveys.0.countedPercentage', 85.6)
            ->assertJsonPath('surveys.0.seats.likud', 26)->assertJsonPath('surveys.0.seats.raam', 7)
            ->assertJsonPath('surveys.0.sourceUrl', $nextUrl)
            ->assertJsonPath('surveys.0.publishedAt', '2026-10-28T12:38:08+00:00')
            ->assertJsonPath('surveys.0.kind', 'actual_results')->assertJsonPath('sync.status', 'succeeded');
        Http::assertSentCount(2);
        $this->travel(5)->minutes();
        $this->artisan('results:sync')->assertSuccessful();
        Http::assertSentCount(3);
        $this->assertSame($nextUrl, Http::recorded()->last()[0]->url());
    }

    public function test_a_failed_continuation_does_not_refresh_the_closed_blogs_success_time(): void
    {
        $oldUrl = config('election.results_source_url');
        Http::fake([
            $oldUrl => Http::sequence()->push($this->html())->push(file_get_contents(base_path('tests/Fixtures/ynet-closed-results.html'))),
            'https://www.ynet.co.il/news/blogs/article/bkiwzbj6mg' => Http::response('', 503),
        ]);
        $this->artisan('results:sync')->assertSuccessful();
        $before = $this->getJson('/api/results')->json();
        $this->travel(5)->minutes();
        $this->artisan('results:sync')->assertFailed();
        $after = $this->getJson('/api/results')->assertJsonPath('sync.status', 'failed')->json();
        $this->assertSame($before['surveys'], $after['surveys']);
        $this->assertSame($before['sync']['lastSuccessAt'], $after['sync']['lastSuccessAt']);
    }

    public function test_a_closed_saved_snapshot_is_not_published_as_a_fresh_count(): void
    {
        $this->seed();
        $before = Survey::find('actual-2026-ynet')->payload;
        $this->artisan('results:sync', ['--html' => base_path('tests/Fixtures/ynet-closed-results.html')])->assertFailed();
        $this->assertSame($before, Survey::find('actual-2026-ynet')->payload);
        Http::assertNothingSent();
    }

    public static function invalidContinuationLinks(): array
    {
        return [
            'missing link' => [''],
            'different host' => ['https://example.com/news/blogs/article/next'],
            'different Ynet page type' => ['https://www.ynet.co.il/news/article/next'],
            'credentials in URL' => ['https://user@www.ynet.co.il/news/blogs/article/next'],
        ];
    }

    #[DataProvider('invalidContinuationLinks')]
    public function test_closed_blog_without_a_valid_continuation_marks_failure(string $target): void
    {
        $this->seed();
        $before = Survey::find('actual-2026-ynet')->payload;
        $closed = str_replace('https://www.ynet.co.il/news/blogs/article/bkiwzbj6mg', $target,
            file_get_contents(base_path('tests/Fixtures/ynet-closed-results.html')));
        Http::fake([config('election.results_source_url') => Http::response($closed)]);
        $this->artisan('results:sync')->assertFailed();
        $this->assertSame($before, Survey::find('actual-2026-ynet')->payload);
        $this->getJson('/api/results')->assertJsonPath('sync.status', 'failed');
        Http::assertSentCount(1);
    }

    public function test_continuation_loops_are_bounded_and_retain_the_last_valid_result(): void
    {
        $this->seed();
        $before = Survey::find('actual-2026-ynet')->payload;
        $oldUrl = config('election.results_source_url');
        $nextUrl = 'https://www.ynet.co.il/news/blogs/article/bkiwzbj6mg';
        $closed = file_get_contents(base_path('tests/Fixtures/ynet-closed-results.html'));
        Http::fake([
            $oldUrl => Http::response($closed),
            $nextUrl => Http::response(str_replace($nextUrl, $oldUrl, $closed)),
        ]);
        $this->artisan('results:sync')->assertFailed();
        $this->assertSame($before, Survey::find('actual-2026-ynet')->payload);
        Http::assertSentCount(2);
    }

    public function test_relative_continuation_links_are_resolved_without_following_other_article_links(): void
    {
        $nextUrl = 'https://www.ynet.co.il/news/blogs/article/bkiwzbj6mg';
        $closed = str_replace($nextUrl, '/news/blogs/article/bkiwzbj6mg',
            file_get_contents(base_path('tests/Fixtures/ynet-closed-results.html')));
        $current = file_get_contents(base_path('tests/Fixtures/ynet-next-results.html'));
        $current = str_replace('</body>', '<p><a href="'.config('election.results_source_url').'">לעדכונים מהלילה</a></p></body>', $current);
        Http::fake([
            config('election.results_source_url') => Http::response($closed),
            $nextUrl => Http::response($current),
        ]);
        $this->artisan('results:sync')->assertSuccessful();
        $this->getJson('/api/results')->assertJsonPath('surveys.0.countedPercentage', 85.6)->assertJsonPath('surveys.0.sourceUrl', $nextUrl);
        Http::assertSentCount(2);
    }

    public function test_latest_90_percent_post_updates_the_feed_with_the_combined_party_name(): void
    {
        $this->seed();
        Http::fake(['*' => Http::response(file_get_contents(base_path('tests/Fixtures/ynet-results-90.html')))]);
        $this->artisan('results:sync')->assertSuccessful();
        $feed = $this->getJson('/api/results')->assertJsonPath('surveys.0.countedPercentage', 90.4)
            ->assertJsonPath('surveys.0.publishedAt', '2026-10-28T23:34:29+00:00')
            ->assertJsonPath('surveys.0.seats.religious_zionism', 6)->assertJsonPath('sync.status', 'succeeded')->json();
        $this->assertSame(120, array_sum($feed['surveys'][0]['seats']));
    }

    public function test_explicit_national_no_change_updates_advance_counting_progress_only(): void
    {
        $allocation = file_get_contents(base_path('tests/Fixtures/ynet-next-results.html'));
        $progress = file_get_contents(base_path('tests/Fixtures/ynet-results-progress.html'));
        Http::fake(['*' => Http::response($progress.$allocation)]);
        $this->artisan('results:sync')->assertSuccessful();
        $feed = $this->getJson('/api/results')->assertJsonPath('surveys.0.countedPercentage', 90)
            ->assertJsonPath('surveys.0.publishedAt', '2026-10-28T21:59:11+00:00')
            ->assertJsonPath('surveys.0.seatsPublishedAt', '2026-10-28T12:38:08+00:00')->json();
        $this->assertSame(app(YnetResults::class)->parse($allocation)['seats'], $feed['surveys'][0]['seats']);
    }

    public static function allocationWording(): array
    {
        return [
            'Hebrew conjunction' => ['הציונות הדתית וזהות', 'ורע"מ - 7'],
            'combined with dash' => ['הציונות הדתית-זהות', 'רע"מ-7'],
            'combined with plus' => ['הציונות הדתית + זהות', 'רע"מ — 7'],
        ];
    }

    #[DataProvider('allocationWording')]
    public function test_equivalent_party_names_and_separators_keep_the_same_allocation(string $combined, string $raam): void
    {
        $html = file_get_contents(base_path('tests/Fixtures/ynet-results-90.html'));
        $expected = app(YnetResults::class)->parse($html);
        $varied = str_replace(['הציונות הדתית וזהות', 'רע"מ - 7'], [$combined, $raam], $html);
        $this->assertSame($expected, app(YnetResults::class)->parse($varied));
    }

    public static function insufficientProgress(): array
    {
        return [
            'local count' => ['90% מהקולות נספרו בחיפה', 'ועדת הבחירות המרכזית: אין שינוי במספר המנדטים של המפלגות.'],
            'only blocs unchanged' => ['90% מהקולות נספרו - ללא שינוי', 'ועדת הבחירות המרכזית: אין שינוי בגושים.'],
            'exit poll' => ['90% מהקולות נספרו - ללא שינוי', 'ועדת הבחירות המרכזית: מדגם ללא שינוי. אין שינוי במספר המנדטים.'],
            'no committee attribution' => ['90% מהקולות נספרו - ללא שינוי', 'אין שינוי במספר המנדטים של המפלגות.'],
            'polling stations not votes' => ['90% מהקלפיות נספרו - ללא שינוי', 'ועדת הבחירות המרכזית: אין שינוי במספר המנדטים.'],
            'conflicting partial allocation' => ['90% מהקולות נספרו - ללא שינוי', 'ועדת הבחירות המרכזית: אין שינוי במספר המנדטים. הליכוד עם 27 מנדטים.'],
        ];
    }

    #[DataProvider('insufficientProgress')]
    public function test_progress_requires_explicit_unchanged_national_party_mandates(string $heading, string $body): void
    {
        $baseline = file_get_contents(base_path('tests/Fixtures/ynet-next-results.html'));
        $post = '<div data-post-id="progress"><time datetime="2026-10-28T22:00:00Z"></time><h3>'.$heading.'</h3><div class="blogs-auto-feed-item__body">'.$body.'</div></div>';
        $this->assertSame(app(YnetResults::class)->parse($baseline), app(YnetResults::class)->parse($post.$baseline));
    }

    public function test_progress_cannot_publish_without_a_complete_allocation(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('No national seat-count update found');
        app(YnetResults::class)->parse(file_get_contents(base_path('tests/Fixtures/ynet-results-progress.html')));
    }

    public function test_newer_complete_breakdown_supersedes_progress_and_clears_its_provenance(): void
    {
        $progress = file_get_contents(base_path('tests/Fixtures/ynet-results-progress.html'));
        $newest = file_get_contents(base_path('tests/Fixtures/ynet-results-90.html'));
        $this->assertSame(app(YnetResults::class)->parse($newest), app(YnetResults::class)->parse($progress.$newest));
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

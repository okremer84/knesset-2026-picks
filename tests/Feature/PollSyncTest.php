<?php

namespace Tests\Feature;

use App\Models\Survey;
use App\Services\PollStore;
use App\Services\WikipediaPolls;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PollSyncTest extends TestCase
{
    use RefreshDatabase;

    private function html(): string
    {
        return file_get_contents(base_path('tests/Fixtures/wikipedia-current.html'));
    }

    private function metadataHtml(): string
    {
        return file_get_contents(base_path('tests/Fixtures/wikipedia-october-metadata.html'));
    }

    public function test_live_metadata_matches_the_reviewed_bundle(): void
    {
        $expected = collect(json_decode(file_get_contents(base_path('data/wikipedia-surveys.json')), true)['surveys'])->keyBy('id');
        $polls = app(WikipediaPolls::class)->parse($this->metadataHtml());
        $this->assertCount(3, $polls);
        foreach ($polls as $poll) {
            $reviewed = $expected[$poll['id']];
            unset($reviewed['syncedAt'], $poll['syncedAt']);
            $this->assertEquals($reviewed, $poll);
        }
    }

    public function test_sync_corrects_existing_metadata_once_and_preserves_it_on_repeat(): void
    {
        // Simulate production having already imported the two known source errors.
        $corrections = config('election.metadata_corrections');
        config(['election.metadata_corrections' => []]);
        $rawPolls = app(WikipediaPolls::class)->parse($this->metadataHtml());
        config(['election.metadata_corrections' => $corrections]);
        foreach ($rawPolls as $poll) {
            app(PollStore::class)->store($poll);
        }
        Http::fake(['*' => Http::response($this->metadataHtml())]);
        $this->artisan('polls:sync')->assertSuccessful();
        $this->artisan('polls:sync')->assertSuccessful();

        $polls = Survey::all()->mapWithKeys(fn ($survey) => [$survey->payload['channelOrMedia'] => $survey->payload]);
        $this->assertSame(1100, $polls['Channel 14']['sampleSize']);
        $this->assertSame(['https://www.israelhayom.co.il/news/politics/article/21582636'], $polls['Israel Hayom']['originalSourceUrls']);
        $this->assertSame(1013, $polls['Channel 13']['sampleSize']);
        $this->assertDatabaseCount('surveys', 3);
        $this->assertDatabaseCount('survey_revisions', 5);
    }

    public function test_upstream_metadata_fixes_are_accepted_without_extra_revisions(): void
    {
        $fixed = str_replace(['>2175<', 'article/21444759'], ['>1100<', 'article/21582636'], $this->metadataHtml());
        Http::fake(['*' => Http::sequence()->push($this->metadataHtml())->push($fixed)]);
        $this->artisan('polls:sync')->assertSuccessful();
        $this->artisan('polls:sync')->assertSuccessful();
        $this->assertDatabaseCount('surveys', 3);
        $this->assertDatabaseCount('survey_revisions', 3);
    }

    public function test_unexpected_metadata_changes_fail_sync_without_overwriting_reviewed_polls(): void
    {
        $changedSample = str_replace('>2175<', '>1200<', $this->metadataHtml());
        $changedSource = str_replace('article/21444759', 'article/99999999', $this->metadataHtml());
        Http::fake(['*' => Http::sequence()->push($this->metadataHtml())->push($changedSample)->push($changedSource)]);
        $this->artisan('polls:sync')->assertSuccessful();
        $before = Survey::all()->toArray();
        $this->artisan('polls:sync')->assertFailed();
        $this->assertEquals($before, Survey::all()->toArray());
        $this->artisan('polls:sync')->assertFailed();
        $this->assertEquals($before, Survey::all()->toArray());
        $this->assertDatabaseCount('survey_revisions', 3);
        $this->assertDatabaseHas('poll_imports', ['status' => 'failed']);
    }

    public function test_parser_matches_previously_reviewed_feed_and_retains_source_links(): void
    {
        $parsed = app(WikipediaPolls::class)->parse($this->html());
        $expected = json_decode(file_get_contents(base_path('tests/Fixtures/wikipedia-september-surveys.json')), true)['surveys'];
        $this->assertCount(6, $parsed);
        foreach ($expected as $poll) {
            $actual = collect($parsed)->firstWhere('id', $poll['id']);
            $this->assertNotNull($actual);
            $this->assertEquals($poll['seats'], $actual['seats']);
            $this->assertEquals($poll['originalSourceUrls'], $actual['originalSourceUrls']);
            $this->assertSame(['balad'], $actual['notReportedPartyIds']);
            $this->assertArrayNotHasKey('balad', $actual['seats']);
        }
    }

    public function test_october_formats_preserve_missing_results_and_percentage_bounds(): void
    {
        $html = file_get_contents(base_path('tests/Fixtures/wikipedia-october.html'));
        $polls = collect(app(WikipediaPolls::class)->parse($html));
        $latest = $polls->first();
        $this->assertSame('2026-10-05', $latest['date']);
        $this->assertSame(23, $latest['seats']['yashar']);
        $this->assertSame(120, array_sum($latest['seats']));
        $this->assertStringContainsString('Haredi Public: (0.6%)', $latest['notes']);
        // The October 7 correction must not change the October 1 poll's sample.
        $this->assertSame(2175, $polls->firstWhere('channelOrMedia', 'Channel 14')['sampleSize']);
        $missing = $polls->firstWhere('channelOrMedia', 'i24 News');
        $this->assertContains('kachol_lavan', $missing['notReportedPartyIds']);
        $this->assertArrayNotHasKey('kachol_lavan', $missing['seats']);
        $bounded = $polls->firstWhere('date', '2026-09-27');
        $this->assertSame(0, $bounded['seats']['kachol_lavan']);
        $this->assertArrayNotHasKey('kachol_lavan', (array) $bounded['votePercentages']);
        $this->assertStringContainsString('(<3.25%)', $bounded['notes']);
        $this->expectException(\RuntimeException::class);
        app(WikipediaPolls::class)->parse(str_replace('(0.6%)', '4', $html));
    }

    public function test_inline_styles_do_not_turn_missing_poll_results_into_data(): void
    {
        $html = file_get_contents(base_path('tests/Fixtures/wikipedia-october.html'));
        // Wikipedia emits TemplateStyles at the first occurrence of its N/a template.
        $html = str_replace(
            '<span id="mwAXc">(0.6%)</span>',
            '<span>—</span><style>.mw-parser-output .sr-only{position:absolute;width:1px}</style><span class="sr-only">N/a</span>',
            $html,
            $replacements,
        );
        $this->assertSame(1, $replacements);

        $poll = app(WikipediaPolls::class)->parse($html)[0];

        $this->assertSame('2026-10-05', $poll['date']);
        $this->assertSame(120, array_sum($poll['seats']));
        $this->assertStringContainsString('Haredi Public: — N/a.', $poll['notes']);
        $this->assertStringNotContainsString('mw-parser-output', $poll['notes']);
    }

    public function test_sync_is_idempotent_and_failure_preserves_last_good_surveys(): void
    {
        Http::fake(['*' => Http::sequence()->push($this->html())->push($this->html())->push(str_replace('Likud', 'Unknown Alliance', $this->html()))->push('Blocked', 403)]);
        $this->artisan('polls:sync')->assertSuccessful();
        $this->artisan('polls:sync')->assertSuccessful();
        $this->assertDatabaseCount('surveys', 6);
        $this->assertDatabaseCount('survey_revisions', 6);
        $before = Survey::all()->toArray();
        $this->artisan('polls:sync')->assertFailed();
        $this->assertEquals($before, Survey::all()->toArray());
        $this->assertDatabaseHas('poll_imports', ['status' => 'failed']);
        $this->artisan('polls:sync')->assertFailed();
        $this->assertEquals($before, Survey::all()->toArray());
    }

    public function test_corrections_create_revisions_without_duplicate_poll_identity(): void
    {
        $polls = app(WikipediaPolls::class)->parse($this->html());
        $poll = $polls[0];
        $store = app(PollStore::class);
        $store->store($poll);
        $poll['seats']['likud']--;
        $poll['seats']['beyachad']++;
        $store->store($poll);
        $this->assertDatabaseCount('surveys', 1);
        $this->assertDatabaseCount('survey_revisions', 2);
        $this->assertEquals($poll['seats'], Survey::first()->payload['seats']);
    }

    public function test_seed_never_overwrites_existing_data_or_creates_demo_users(): void
    {
        $this->seed();
        $this->assertDatabaseCount('surveys', count(json_decode(file_get_contents(base_path('data/wikipedia-surveys.json')), true)['surveys']));
        $this->assertDatabaseCount('users', 0);
        $id = Survey::first()->id;
        Survey::whereKey($id)->update(['active' => false]);
        $this->seed();
        $this->assertDatabaseHas('surveys', ['id' => $id, 'active' => false]);
    }

    public function test_source_bodies_are_deduplicated_and_expire_without_losing_audit_records(): void
    {
        Http::fake(['*' => Http::response($this->html())]);
        $this->artisan('polls:sync')->assertSuccessful();
        $this->travel(20)->days();
        $this->artisan('polls:sync')->assertSuccessful();
        $hash = hash('sha256', $this->html());
        $this->assertDatabaseCount('poll_snapshots', 1);
        $this->assertDatabaseCount('poll_imports', 2);
        $this->assertDatabaseMissing('poll_imports', ['source_html' => $this->html()]);
        $body = DB::table('poll_snapshots')->where('source_hash', $hash)->value('compressed_html');
        $this->assertSame($this->html(), gzdecode(base64_decode($body)));
        $this->travel(20)->days();
        $this->artisan('polls:prune-snapshots')->assertSuccessful();
        $this->assertDatabaseCount('poll_snapshots', 1); // Latest observation was only 20 days ago.
        $this->travel(11)->days();
        $this->artisan('polls:prune-snapshots')->assertSuccessful();
        $this->assertDatabaseCount('poll_snapshots', 0);
        $this->assertDatabaseCount('poll_imports', 2);
        $this->assertDatabaseHas('poll_imports', ['source_hash' => $hash, 'status' => 'succeeded']);
        $this->assertDatabaseCount('survey_revisions', 6);
        $this->assertDatabaseCount('surveys', 6);
    }
}

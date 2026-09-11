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

    public function test_parser_matches_previously_reviewed_feed_and_retains_source_links(): void
    {
        $parsed = app(WikipediaPolls::class)->parse($this->html());
        $expected = json_decode(file_get_contents(base_path('data/wikipedia-surveys.json')), true)['surveys'];
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
        $this->assertDatabaseCount('surveys', 6);
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

<?php

namespace Tests\Feature;

use App\Models\Survey;
use App\Services\PollStore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ElectionResultsTest extends TestCase
{
    use RefreshDatabase;

    public function test_deployment_adds_all_channel_results_to_an_existing_poll_database(): void
    {
        $poll = json_decode(file_get_contents(base_path('data/wikipedia-surveys.json')), true)['surveys'][0];
        app(PollStore::class)->store($poll);
        $this->seed();
        $results = Survey::where('kind', 'exit_poll')->get();
        $this->assertCount(4, $results);
        $this->assertDatabaseCount('surveys', 5);
        foreach ($results as $result) {
            $this->assertSame(120, array_sum($result->payload['seats']));
            $this->assertEqualsCanonicalizing(array_keys(config('election.parties')), array_keys($result->payload['seats']));
            $this->assertFileExists(public_path($result->payload['sourceImageUrl']));
        }
        $this->getJson('/api/surveys')->assertOk()->assertJsonFragment(['kind' => 'exit_poll', 'channelOrMedia' => 'ערוץ 14']);

        $before = DB::table('survey_revisions')->count();
        $this->seed();
        $this->assertDatabaseCount('survey_revisions', $before);
    }

    public function test_redeployment_preserves_operator_corrections_and_withdrawals(): void
    {
        $this->seed();
        $result = Survey::where('kind', 'exit_poll')->first();
        $correction = $result->payload;
        $correction['seats']['likud']++;
        $correction['seats']['yashar']--;
        app(PollStore::class)->store($correction);
        $result->update(['active' => false]);
        $this->seed();
        $this->assertSame($correction['seats'], $result->fresh()->payload['seats']);
        $this->assertFalse($result->fresh()->active);
        $this->getJson('/api/surveys')->assertJsonMissing(['id' => $result->id]);
    }

    public function test_poll_sync_preserves_published_exit_polls(): void
    {
        $this->seed();
        $before = Survey::where('kind', 'exit_poll')->get()->toArray();
        $this->artisan('polls:sync', ['--html' => base_path('tests/Fixtures/wikipedia-current.html')])->assertSuccessful();
        $this->assertSame($before, Survey::where('kind', 'exit_poll')->get()->toArray());
    }

    public function test_redeployment_withdraws_the_removed_channel_without_deleting_history(): void
    {
        $removed = json_decode(file_get_contents(base_path('data/election-results.json')), true)['surveys'][0];
        $removed['id'] = 'exit-2026-10-27-channel-16';
        $removed['channelOrMedia'] = 'ערוץ 16';
        app(PollStore::class)->store($removed);
        $this->seed();
        $this->assertDatabaseHas('surveys', ['id' => $removed['id'], 'active' => false]);
        $this->assertDatabaseHas('survey_revisions', ['survey_id' => $removed['id']]);
        $this->getJson('/api/surveys')->assertOk()->assertJsonMissing(['id' => $removed['id']]);
    }
}

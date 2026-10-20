<?php

namespace Tests\Feature;

use App\Models\League;
use App\Models\Survey;
use App\Models\User;
use App\Services\Campaign\Evidence;
use App\Services\Campaign\PostTopics;
use App\Services\Campaign\QuestionSlate;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CampaignQuestionSlateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['campaign.processing_enabled' => true]);
        $this->travelTo(CarbonImmutable::parse('2026-10-17T10:00:00Z'));
        config(['campaign.pilot_only' => false, 'election.date' => '2026-10-27']);
    }

    public function test_candidate_drafts_publish_with_portraits_and_keep_editorial_odds(): void
    {
        $user = User::factory()->create();
        config(['campaign.operator_ids' => [$user->id]]);
        $league = League::create(['name' => 'Test', 'owner_id' => $user->id, 'invite_code' => str_repeat('z', 40), 'locks_at' => now()->addDay()]);
        $league->users()->attach($user);
        $this->actingAs($user);
        $base = '/api/leagues/'.$league->id.'/campaign';
        $d = ['kind' => 'prime_minister', 'starts_at' => now()->addDay()->toIso8601String(), 'ends_at' => now()->addMonths(3)->toIso8601String()];
        $this->postJson($base.'/monitoring/drafts', $d)->assertOk();
        $this->postJson($base.'/monitoring/drafts', $d)->assertOk();
        $this->assertDatabaseCount('campaign_proposals', 5);
        $proposals = DB::table('campaign_proposals')->get()->map(fn ($p) => json_decode($p->payload, true));
        $this->assertSame(10000, $proposals->sum('probability'));
        $candidate = $proposals->first(fn ($p) => $p['contract']['presentation']['portrait'] === 'likud');
        $this->postJson($base.'/markets', $candidate)->assertCreated()->assertJsonPath('market.contract.presentation.portrait', 'likud')->assertJsonPath('market.quote.probability', 4000);
        $this->assertCount(7, app(QuestionSlate::class)->drafts('interview', $d['starts_at'], $d['ends_at']));
    }

    public function test_poll_questions_keep_publishers_and_fixed_bloc_members_separate(): void
    {
        foreach (['Kan 11', 'HaHadashot 12', 'Channel 13', 'Channel 14'] as $i => $publisher) {
            Survey::create(['id' => 'poll-'.$i, 'kind' => 'opinion_poll', 'content_hash' => hash('sha256', $publisher), 'active' => true, 'payload' => ['date' => '2026-10-19', 'channelOrMedia' => $publisher, 'institute' => 'Institute '.$i, 'sourceUrl' => 'https://example.com/'.$i, 'seats' => ['likud' => 20 + $i, 'yashar' => 20, 'beyachad' => 10, 'democrats' => 10, 'israel_beitenu' => 5, 'kachol_lavan' => 0], 'blocs' => ['opposition' => 60]]]);
        }
        $this->travelTo(CarbonImmutable::parse('2026-10-20T10:00:00Z'));
        $rows = app(QuestionSlate::class)->drafts('polls', '2026-10-21T10:00:00Z', '2026-10-25T10:00:00Z');
        $this->assertCount(8, $rows);
        $this->assertSame([20, 21, 22, 23], collect($rows)->where('contract.subject', 'likud')->pluck('contract.threshold')->all());
        $this->assertSame([45], collect($rows)->where('contract.subject', 'bloc:opposition')->pluck('contract.threshold')->unique()->values()->all());
        $user = User::factory()->create();
        $league = League::create(['name' => 'Test', 'owner_id' => $user->id, 'invite_code' => str_repeat('y', 40), 'locks_at' => now()->addDay()]);
        $contract = $rows[1]['contract'];
        $contract['window_starts_at'] = '2026-10-18T10:00:00Z';
        $prefill = app(Evidence::class)->prefill($league, (object) ['type' => 'poll_value', 'contract' => json_encode($contract), 'window_ends_at' => '2026-10-20T12:00:00Z']);
        $this->assertSame(45, $prefill['observed']);
    }

    public function test_keyword_matching_uses_boundaries_and_ignores_urls(): void
    {
        $this->assertNotEmpty(PostTopics::matches('המלחמה והגיוס #Iran', 'war'));
        $this->assertNotEmpty(PostTopics::matches('המלחמה והגיוס #Iran', 'conscription'));
        $this->assertNotEmpty(PostTopics::matches('החטופים והבחירות', 'hostages'));
        $this->assertSame([], PostTopics::matches('reward warfare https://example.org/war', 'war'));
        $this->assertSame([], PostTopics::matches('קטר בתחנה', 'qatar'));
    }

    public function test_sample_uses_latest_thirty_original_posts_and_smooths_frequency(): void
    {
        $user = User::factory()->create();
        $league = League::create(['name' => 'Test', 'owner_id' => $user->id, 'invite_code' => str_repeat('w', 40), 'locks_at' => now()->addDay()]);
        $id = DB::table('campaign_sources')->insertGetId(['league_id' => $league->id, 'kind' => 'x', 'name' => 'Test', 'url' => 'https://x.com/test', 'payload' => '{}', 'created_at' => now(), 'updated_at' => now()]);
        for ($i = 0; $i < 35; $i++) {
            DB::table('campaign_observations')->insert(['source_id' => $id, 'item_key' => hash('sha256', (string) $i), 'url' => 'https://x.com/test/status/'.$i, 'title' => 'post', 'text' => $i < 10 ? 'איראן' : 'אחר', 'content_hash' => hash('sha256', (string) $i), 'published_at' => now()->subMinutes($i + 1), 'first_seen_at' => now(), 'last_seen_at' => now(), 'metadata' => json_encode(['original_captured' => true])]);
        }
        $sample = PostTopics::sample($id);
        $this->assertSame(30, $sample['size']);
        $this->assertSame(10, $sample['topics']['iran']['hits']);
        $this->assertSame(3438, $sample['topics']['iran']['probability']);
        $this->assertSame(500, $sample['topics']['war']['probability']);
    }
}

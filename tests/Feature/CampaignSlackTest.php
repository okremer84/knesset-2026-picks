<?php

namespace Tests\Feature;

use App\Models\League;
use App\Models\User;
use App\Services\Campaign\SlackReview;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

class CampaignSlackTest extends TestCase
{
    use RefreshDatabase;

    private League $league;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->startOfMinute());
        $user = User::factory()->create();
        $this->league = League::create(['name' => 'Slack', 'owner_id' => $user->id, 'invite_code' => str_repeat('s', 40), 'locks_at' => now()->addDay()]);
        config(['app.url' => 'https://knesset-picks.com', 'campaign.enabled' => true, 'campaign_slack.enabled' => true,
            'campaign_slack.token' => 'secret', 'campaign_slack.team_id' => 'T123', 'campaign_slack.channel_id' => 'C123', 'campaign_slack.league_id' => $this->league->id]);
        Http::preventStrayRequests();
    }

    private function market(array $overrides = []): string
    {
        $id = (string) Str::uuid();
        DB::table('campaign_markets')->insert([...['id' => $id, 'league_id' => $this->league->id, 'season' => config('campaign.season'), 'type' => 'deadline_event', 'title' => '<!channel> question', 'contract' => json_encode(['source_url' => 'https://example.org/evidence']), 'state' => 'open', 'closes_at' => now()->subDay(), 'window_ends_at' => now()->subHour(), 'created_by' => $this->league->owner_id, 'created_at' => now(), 'updated_at' => now()], ...$overrides]);

        return $id;
    }

    private function fake(string $team = 'T123'): void
    {
        Http::fake(['*/auth.test' => Http::response(['ok' => true, 'team_id' => $team, 'bot_id' => 'B123']), '*/chat.postMessage' => Http::response(['ok' => true, 'channel' => 'C123', 'ts' => '123.456'])]);
    }

    public function test_review_notice_is_deduplicated_and_does_not_mutate_settlement_state(): void
    {
        $id = $this->market();
        $before = DB::table('campaign_markets')->find($id);
        $this->fake();
        $this->assertSame('sent', app(SlackReview::class)->tick());
        $this->assertSame('idle', app(SlackReview::class)->tick());
        Http::assertSentCount(2);
        Http::assertSent(fn ($r) => str_ends_with($r->url(), 'chat.postMessage') && $r['channel'] === 'C123' && $r['mrkdwn'] === false
            && $r['blocks'][0]['text']['type'] === 'plain_text' && str_contains($r['blocks'][1]['elements'][0]['url'], 'review='.$id)
            && str_contains($r['text'], 'Slack cannot approve'));
        $this->assertEquals($before, DB::table('campaign_markets')->find($id));
        $this->assertDatabaseCount('campaign_resolutions', 0);
        $this->assertDatabaseCount('campaign_entries', 0);
    }

    public function test_disabled_missing_destination_and_wrong_workspace_never_post(): void
    {
        $this->market();
        config(['campaign_slack.enabled' => false]);
        $this->assertSame('disabled_or_unconfigured', app(SlackReview::class)->tick());
        config(['campaign_slack.enabled' => true, 'campaign_slack.channel_id' => '']);
        $this->assertSame('disabled_or_unconfigured', app(SlackReview::class)->tick());
        Http::assertNothingSent();
        config(['campaign_slack.channel_id' => 'C123']);
        $this->fake('TOTHER');
        $this->assertSame('workspace_verification_failed', app(SlackReview::class)->tick());
        Http::assertSentCount(1);
        $this->assertDatabaseHas('campaign_slack_notices', ['status' => 'pending']);
    }

    public function test_rate_limit_pauses_the_destination_until_retry_after(): void
    {
        $id = $this->market();
        Http::fake(['*/auth.test' => Http::response(['ok' => true, 'team_id' => 'T123', 'bot_id' => 'B123']), '*/chat.postMessage' => Http::sequence()->push([], 429, ['Retry-After' => 180])->push(['ok' => true, 'channel' => 'C123', 'ts' => '1.2'])]);
        $this->assertSame('pending', app(SlackReview::class)->tick());
        $this->travel(2)->minutes();
        $this->market();
        $this->assertSame('rate_limited', app(SlackReview::class)->tick());
        Http::assertSentCount(2);
        $this->travel(2)->minutes();
        $this->assertSame('sent', app(SlackReview::class)->tick());
        Http::assertSentCount(4);
        $this->market();
        $this->fake();
        DB::table('campaign_markets')->where('id', '!=', $id)->update(['archived_at' => now()]);
        $this->assertSame('idle', app(SlackReview::class)->tick());
    }

    public function test_ambiguous_delivery_and_crashed_claim_are_not_retried(): void
    {
        $this->market();
        Http::fake(['*/auth.test' => Http::response(['ok' => true, 'team_id' => 'T123', 'bot_id' => 'B123']), '*/chat.postMessage' => Http::response('secret response must not be logged', 503)]);
        $this->assertSame('uncertain', app(SlackReview::class)->tick());
        $this->assertSame('idle', app(SlackReview::class)->tick());
        DB::table('campaign_slack_notices')->update(['status' => 'sending']);
        $this->travel(3)->minutes();
        $this->assertSame('idle', app(SlackReview::class)->tick());
        Http::assertSentCount(2);
        $this->assertDatabaseHas('campaign_slack_notices', ['error_code' => 'delivery_unknown']);
    }

    public function test_failed_sources_deduplicate_and_recovery_is_reported(): void
    {
        $source = DB::table('campaign_sources')->insertGetId(['league_id' => $this->league->id, 'kind' => 'news', 'name' => 'Feed', 'url' => 'https://example.org', 'payload' => '{}', 'created_at' => now(), 'updated_at' => now()]);
        $this->fake();
        $this->assertSame('sent', app(SlackReview::class)->tick());
        $this->assertSame('idle', app(SlackReview::class)->tick());
        DB::table('campaign_monitor_runs')->insert(['source_id' => $source, 'started_at' => now(), 'finished_at' => now(), 'status' => 'failed', 'items' => 0]);
        $this->assertSame('sent', app(SlackReview::class)->tick());
        DB::table('campaign_monitor_runs')->insert(['source_id' => $source, 'started_at' => now(), 'finished_at' => now(), 'status' => 'failed', 'items' => 0]);
        $this->assertSame('idle', app(SlackReview::class)->tick());
        DB::table('campaign_monitor_runs')->insert(['source_id' => $source, 'started_at' => now(), 'finished_at' => now(), 'status' => 'ok', 'items' => 0]);
        $this->assertSame('sent', app(SlackReview::class)->tick());
        Http::assertSentCount(6);
    }

    public function test_archived_settled_hidden_and_other_league_markets_do_not_notify(): void
    {
        $this->market(['archived_at' => now()]);
        $this->market(['action' => 'settle']);
        $this->market(['contract' => json_encode(['monitor' => ['mode' => 'x_count']])]);
        $other = League::create(['name' => 'Other', 'owner_id' => $this->league->owner_id, 'invite_code' => str_repeat('o', 40), 'locks_at' => now()->addDay()]);
        $this->market(['league_id' => $other->id]);
        $this->assertSame('idle', app(SlackReview::class)->tick());
        Http::assertNothingSent();
    }

    public function test_local_status_and_workspace_check_do_not_post(): void
    {
        $this->fake();
        $this->artisan('campaign:slack')->assertSuccessful();
        Http::assertNothingSent();
        $this->artisan('campaign:slack --check')->assertSuccessful();
        Http::assertSentCount(1);
    }

    public function test_real_ready_packet_is_read_without_creating_a_preview(): void
    {
        $start = now()->subMinutes(10);
        $end = now()->subMinute();
        $source = DB::table('campaign_sources')->insertGetId(['league_id' => $this->league->id, 'kind' => 'news', 'name' => 'Feed', 'url' => 'https://example.org', 'payload' => '{}', 'created_at' => now(), 'updated_at' => now()]);
        foreach ([$start->copy()->subMinute(), now()] as $time) {
            DB::table('campaign_monitor_runs')->insert(['source_id' => $source, 'started_at' => $time, 'finished_at' => $time, 'status' => 'ok', 'items' => 0]);
        }
        $id = $this->market(['closes_at' => $start, 'window_ends_at' => $end, 'contract' => json_encode(['window_starts_at' => $start->toIso8601String(), 'source_url' => 'https://example.org', 'monitor' => ['mode' => 'news_reporting', 'source_ids' => [$source], 'person' => 'person']])]);
        $this->fake();
        $this->assertSame('sent', app(SlackReview::class)->tick());
        Http::assertSent(fn ($r) => str_ends_with($r->url(), 'chat.postMessage') && str_contains($r['text'], 'Proposed observation: 0'));
        $this->assertDatabaseHas('campaign_markets', ['id' => $id, 'state' => 'open', 'preview_id' => null, 'action' => null]);
        $this->assertSame('idle', app(SlackReview::class)->tick());
    }

    public function test_reconciliation_requires_confirmed_non_delivery_and_does_not_send(): void
    {
        $this->market();
        Http::fake(['*/auth.test' => Http::response(['ok' => true, 'team_id' => 'T123', 'bot_id' => 'B123']), '*/chat.postMessage' => Http::response([], 503)]);
        $this->assertSame('uncertain', app(SlackReview::class)->tick());
        $id = DB::table('campaign_slack_notices')->value('id');
        $this->artisan('campaign:slack', ['--retry' => $id])->assertFailed();
        $this->assertDatabaseHas('campaign_slack_notices', ['status' => 'uncertain']);
        $this->artisan('campaign:slack', ['--retry' => $id, '--confirmed-not-delivered' => true])->assertSuccessful();
        $this->assertDatabaseHas('campaign_slack_notices', ['status' => 'pending']);
        Http::assertSentCount(2);
    }

    public function test_api_rejection_is_blocked_and_obsolete_pending_notice_is_not_delivered(): void
    {
        $id = $this->market();
        Http::fake(['*/auth.test' => Http::response(['ok' => true, 'team_id' => 'T123', 'bot_id' => 'B123']), '*/chat.postMessage' => Http::response(['ok' => false, 'error' => 'not_in_channel'])]);
        $this->assertSame('blocked', app(SlackReview::class)->tick());
        $this->assertSame('idle', app(SlackReview::class)->tick());
        $notice = DB::table('campaign_slack_notices')->value('id');
        $this->artisan('campaign:slack', ['--retry' => $notice])->assertSuccessful();
        DB::table('campaign_markets')->where('id', $id)->update(['action' => 'settle']);
        $this->assertSame('idle', app(SlackReview::class)->tick());
        $this->assertDatabaseHas('campaign_slack_notices', ['status' => 'obsolete']);
        Http::assertSentCount(2);
    }
}

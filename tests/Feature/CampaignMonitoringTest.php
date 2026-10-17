<?php

namespace Tests\Feature;

use App\Models\League;
use App\Models\User;
use App\Services\Campaign\MonitorCollector;
use Carbon\CarbonImmutable as Time;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class CampaignMonitoringTest extends TestCase
{
    use RefreshDatabase;

    private League $league;

    private string $base;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Time::parse('2026-10-15T10:00:00Z'));
        $user = User::factory()->create();
        $this->league = League::create(['name' => 'Monitor', 'owner_id' => $user->id, 'invite_code' => str_repeat('b', 40), 'locks_at' => now()->addDay()]);
        $this->league->users()->attach($user);
        $this->actingAs($user);
        config(['campaign.pilot_only' => false, 'campaign.enabled' => true, 'campaign.operator_ids' => [$user->id], 'campaign.x_bearer_token' => null, 'election.date' => '2026-10-27']);
        $this->base = '/api/leagues/'.$this->league->id.'/campaign';
        Queue::fake();
        Http::preventStrayRequests();
        $this->postJson($this->base.'/monitoring/setup')->assertOk();
    }

    private function source(string $kind): object
    {
        return DB::table('campaign_sources')->where('league_id', $this->league->id)->where('kind', $kind)->first();
    }

    private function runAt(int $id, string $time, string $status = 'ok'): void
    {
        DB::table('campaign_monitor_runs')->insert(['source_id' => $id, 'started_at' => $time, 'finished_at' => $time, 'status' => $status, 'items' => 0]);
    }

    private function draft(string $kind): array
    {
        $this->postJson($this->base.'/monitoring/drafts', ['kind' => $kind, 'starts_at' => '2026-10-15T10:05:00Z', 'ends_at' => '2026-10-15T10:15:00Z'])->assertOk();

        return json_decode(DB::table('campaign_proposals')->where('payload->contract->source_id', $this->source($kind)->id)->when($kind === 'x', fn ($q) => $q->where('payload->contract->monitor->mode', 'x_count'))->first()->payload, true);
    }

    private function publish(string $kind): array
    {
        foreach (DB::table('campaign_sources')->where('kind', $kind)->pluck('id') as $id) {
            $this->runAt($id, '2026-10-15 10:00:00');
        }

        return $this->postJson($this->base.'/markets', $this->draft($kind))->assertCreated()->json('market');
    }

    private function packet(): array
    {
        return $this->getJson($this->base.'/monitoring')->assertOk()->json('packets.0');
    }

    public function test_setup_is_idempotent_and_missing_x_access_is_explicit(): void
    {
        $this->postJson($this->base.'/monitoring/setup')->assertOk();
        $this->assertDatabaseCount('campaign_sources', 9);
        app(MonitorCollector::class)->collect($this->source('x'));
        $this->assertDatabaseHas('campaign_monitor_runs', ['status' => 'failed']);
        $this->getJson($this->base.'/monitoring')->assertOk()->assertJsonPath('x_configured', false);
        $this->postJson($this->base.'/markets', $this->draft('x'))->assertUnprocessable();
        Http::assertNothingSent();
        $outsider = User::factory()->create();
        $this->actingAs($outsider)->getJson($this->base.'/monitoring')->assertForbidden();
    }

    public function test_news_negative_requires_complete_window_and_post_window_run(): void
    {
        $market = $this->publish('news');
        $this->assertSame('news_reporting', $market['contract']['monitor']['mode']);
        $this->travelTo(Time::parse('2026-10-15T10:15:00Z'));
        foreach (DB::table('campaign_sources')->where('kind', 'news')->pluck('id') as $id) {
            $this->runAt($id, '2026-10-15 10:10:00');
        }
        $this->assertSame('incomplete', $this->packet()['status']);
        $path = $this->base.'/markets/'.$market['id'];
        $this->postJson($path.'/preview', ['observed' => 0, 'source_url' => $market['contract']['source_url'], 'observed_at' => now()->toIso8601String(), 'note' => 'manual'])->assertUnprocessable();
        $this->travelTo(Time::parse('2026-10-15T10:20:00Z'));
        foreach (DB::table('campaign_sources')->where('kind', 'news')->pluck('id') as $id) {
            $this->runAt($id, '2026-10-15 10:20:00');
        }
        $packet = $this->packet();
        $this->assertSame('ready', $packet['status']);
        $preview = $this->postJson($path.'/monitor-preview', ['version' => $packet['version']])->assertOk()->assertJsonPath('outcome', 'no')->json('token');
        $this->observation($this->source('news')->id);
        $this->postJson($path.'/settle', ['token' => $preview])->assertConflict();
    }

    public function test_gap_never_produces_negative_result(): void
    {
        $this->publish('news');
        $this->travelTo(Time::parse('2026-10-15T10:20:00Z'));
        foreach (DB::table('campaign_sources')->where('kind', 'news')->pluck('id') as $id) {
            $this->runAt($id, '2026-10-15 10:10:00', 'failed');
            $this->runAt($id, '2026-10-15 10:20:00');
        }
        $this->assertSame('incomplete', $this->packet()['status']);
    }

    private function observation(int $source, bool $readable = true): int
    {
        return DB::table('campaign_observations')->insertGetId(['source_id' => $source, 'item_key' => hash('sha256', 'article'), 'url' => 'https://www.ynet.co.il/news/article/test', 'title' => 'אוריך ועמית סגל', 'text' => 'התכתבות עמית סגל', 'content_hash' => hash('sha256', 'body'), 'published_at' => '2026-10-15 10:06:00', 'first_seen_at' => now(), 'last_seen_at' => now(), 'metadata' => json_encode(['readable' => $readable])]);
    }

    public function test_news_requires_attestation_and_unreadable_article_cannot_be_dismissed(): void
    {
        $market = $this->publish('news');
        $this->travelTo(Time::parse('2026-10-15T10:10:00Z'));
        $id = $this->observation($this->source('news')->id, false);
        $path = $this->base.'/markets/'.$market['id'];
        $packet = $this->packet();
        $this->postJson($path.'/monitor-dismiss', ['version' => $packet['version'], 'observation_id' => $id, 'reason' => 'unreadable'])->assertUnprocessable();
        $this->postJson($path.'/monitor-preview', ['version' => $packet['version'], 'observation_id' => $id, 'direct_and_new' => true])->assertUnprocessable();
        DB::table('campaign_observations')->where('id', $id)->update(['metadata' => json_encode(['readable' => true])]);
        $packet = $this->packet();
        $this->postJson($path.'/monitor-preview', ['version' => $packet['version'], 'observation_id' => $id])->assertUnprocessable();
        $this->postJson($path.'/monitor-preview', ['version' => $packet['version'], 'observation_id' => $id, 'direct_and_new' => true])->assertOk()->assertJsonPath('outcome', 'yes');
    }

    public function test_x_collects_all_pages_excludes_replies_and_preserves_original_after_edit(): void
    {
        config(['campaign.x_bearer_token' => 'test-token']);
        $source = $this->source('x');
        $post = ['id' => '100', 'author_id' => '42', 'created_at' => '2026-10-15T09:00:00Z', 'text' => 'short', 'note_tweet' => ['text' => 'איראן'], 'edit_history_tweet_ids' => ['100']];
        Http::fake(['*users/by/username/*' => Http::response(['data' => ['id' => '42']]), '*users/42/tweets*' => Http::sequence()->push(['data' => [$post], 'meta' => ['result_count' => 1, 'next_token' => 'next']])->push(['data' => [[...$post, 'id' => '101', 'referenced_tweets' => [['type' => 'replied_to', 'id' => '80']]]], 'meta' => ['result_count' => 1]])->push(['data' => [[...$post, 'id' => '102', 'created_at' => '2026-10-15T09:05:00Z', 'text' => 'edited', 'note_tweet' => ['text' => 'different'], 'edit_history_tweet_ids' => ['100', '102']]], 'meta' => ['result_count' => 1]])]);
        app(MonitorCollector::class)->collect($source);
        app(MonitorCollector::class)->collect(DB::table('campaign_sources')->find($source->id));
        $this->assertDatabaseCount('campaign_observations', 1);
        $this->assertDatabaseHas('campaign_observations', ['text' => 'איראן', 'published_at' => '2026-10-15 09:00:00']);
        $this->assertSame(2, DB::table('campaign_monitor_runs')->where('status', 'ok')->count());
    }

    public function test_rss_archives_body_and_redirects_cannot_leave_allowlist(): void
    {
        $source = $this->source('news');
        $body = str_repeat('פרסום ציבורי חדש על אוריך ועמית סגל. ', 10);
        $rss = '<rss><channel><item><title>אוריך</title><link>https://www.ynet.co.il/news/article/test</link><description>פרסום</description><pubDate>Thu, 15 Oct 2026 09:00:00 GMT</pubDate></item></channel></rss>';
        Http::fake([$source->url => Http::response($rss), 'https://www.ynet.co.il/news/article/test' => Http::sequence()->push('<html><script type="application/ld+json">'.json_encode(['articleBody' => $body]).'</script></html>')->push('', 302, ['Location' => 'https://127.0.0.1/private'])]);
        app(MonitorCollector::class)->collect($source);
        $this->assertDatabaseHas('campaign_observations', ['text' => trim($body)]);
        app(MonitorCollector::class)->collect($source);
        $record = DB::table('campaign_observations')->first();
        $this->assertFalse(json_decode($record->metadata, true)['readable']);
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '127.0.0.1'));
    }

    public function test_next_post_uses_original_first_text_and_never_counts_a_url_as_a_mention(): void
    {
        config(['campaign.x_bearer_token' => 'test-token']);
        $source = $this->source('x');
        $this->runAt($source->id, '2026-10-15 10:00:00');
        $draft = $this->draft('x');
        $draft['contract']['threshold'] = 1;
        $draft['contract']['monitor']['mode'] = 'x_next_mention';
        $draft['contract']['monitor']['topic'] = 'iran';
        $market = $this->postJson($this->base.'/markets', $draft)->assertCreated()->json('market');
        $this->travelTo(Time::parse('2026-10-15T10:10:00Z'));
        $this->runAt($source->id, '2026-10-15 10:10:00');
        $id = $this->observation($source->id);
        DB::table('campaign_observations')->where('id', $id)->update(['text' => 'https://example.org/Iran', 'metadata' => json_encode(['external_id' => '100', 'original_captured' => true])]);
        $packet = $this->packet();
        $this->assertSame(0, $packet['observed']);
        DB::table('campaign_observations')->where('id', $id)->update(['text' => 'ובאיראן יתקיים דיון', 'content_hash' => hash('sha256', 'changed')]);
        $packet = $this->packet();
        $this->assertSame(1, $packet['observed']);
        $path = $this->base.'/markets/'.$market['id'];
        $token = $this->postJson($path.'/monitor-preview', ['version' => $packet['version']])->assertOk()->assertJsonPath('outcome', 'yes')->json('token');
        $this->postJson($path.'/settle', ['token' => $token])->assertOk();
        $this->postJson($path.'/settle', ['token' => $token])->assertOk();
        $this->assertSame(1, DB::table('campaign_resolutions')->where('market_id', $market['id'])->count());
    }

    public function test_partial_x_response_preserves_archive_and_does_not_record_success(): void
    {
        config(['campaign.x_bearer_token' => 'secret-not-for-errors']);
        $source = $this->source('x');
        $this->observation($source->id);
        Http::fake(['*users/by/username/*' => Http::response(['data' => ['id' => '42']]), '*users/42/tweets*' => Http::response(['errors' => [['detail' => 'secret-not-for-errors']], 'meta' => ['result_count' => 0]])]);
        app(MonitorCollector::class)->collect($source);
        $this->assertDatabaseCount('campaign_observations', 1);
        $this->assertDatabaseHas('campaign_monitor_runs', ['status' => 'failed']);
        $this->assertStringNotContainsString('secret-not-for-errors', $this->getJson($this->base.'/monitoring')->getContent());
    }
}

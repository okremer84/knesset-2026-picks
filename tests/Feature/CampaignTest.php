<?php

namespace Tests\Feature;

use App\Jobs\CollectCampaignChannel;
use App\Jobs\CollectCampaignMonitor;
use App\Jobs\ProposeCampaign;
use App\Jobs\RepriceCampaign;
use App\Jobs\SettleCampaign;
use App\Models\League;
use App\Models\Survey;
use App\Models\User;
use App\Services\Campaign\Automation;
use App\Services\Campaign\Channels;
use App\Services\Campaign\Game;
use App\Services\Campaign\LaunchCleanup;
use App\Services\Campaign\MonitorCollector;
use App\Services\Campaign\Settlement;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class CampaignTest extends TestCase
{
    use RefreshDatabase;

    private User $operator;

    private League $league;

    private string $base;

    protected function setUp(): void
    {
        parent::setUp();
        config(['campaign.processing_enabled' => true]);
        $this->travelTo(CarbonImmutable::parse('2026-10-14T10:00:00Z'));
        $this->operator = User::factory()->create();
        $this->league = League::create(['name' => 'Friends', 'owner_id' => $this->operator->id, 'invite_code' => str_repeat('a', 40), 'locks_at' => now()->addDay()]);
        $this->league->users()->attach($this->operator);
        config(['campaign.pilot_only' => false, 'campaign.enabled' => true, 'campaign.operator_ids' => [$this->operator->id], 'election.date' => '2026-10-27']);
        $this->base = '/api/leagues/'.$this->league->id.'/campaign';
        $this->actingAs($this->operator);
    }

    public function test_paused_processing_keeps_market_available_but_blocks_checks(): void
    {
        config(['campaign.processing_enabled' => false]);
        Http::preventStrayRequests();
        Queue::fake();

        $this->getJson($this->base)->assertOk()
            ->assertJsonPath('enabled', true)
            ->assertJsonPath('processing_enabled', false);

        foreach (['/proposals/generate', '/import', '/markets/missing/preview', '/markets/missing/settle', '/markets/missing/void', '/monitoring/setup', '/monitoring/sources/1/collect', '/markets/missing/monitor-preview'] as $path) {
            $this->postJson($this->base.$path)->assertStatus(409);
        }
        $this->getJson($this->base.'/monitoring')->assertStatus(409);
        $this->getJson($this->base.'/markets/missing/prefill')->assertStatus(409);
        Queue::assertNothingPushed();
    }

    public function test_paused_processing_ignores_already_queued_work(): void
    {
        config(['campaign.processing_enabled' => false, 'campaign.api_key' => 'test']);
        $channels = $this->mock(Channels::class);
        $channels->shouldNotReceive('collect');
        $collector = $this->mock(MonitorCollector::class);
        $collector->shouldNotReceive('collect');
        $automation = $this->mock(Automation::class);
        $automation->shouldNotReceive('propose');
        $automation->shouldNotReceive('reprice');
        $settlement = $this->mock(Settlement::class);
        $settlement->shouldNotReceive('finish');

        (new CollectCampaignChannel(1))->handle($channels);
        (new CollectCampaignMonitor(1))->handle($collector);
        (new ProposeCampaign($this->league->id))->handle($automation);
        (new RepriceCampaign($this->league->id))->handle($automation);
        (new SettleCampaign($this->league->id, []))->handle($settlement);
    }

    public function test_first_access_grants_one_wallet_and_non_members_cannot_read_positions(): void
    {
        $this->getJson($this->base)->assertOk()->assertJsonPath('wallet.available', 1000000)->assertJsonCount(1, 'wallet.entries');
        $this->getJson($this->base)->assertOk()->assertJsonPath('wallet.available', 1000000)->assertJsonCount(1, 'wallet.entries');
        $this->actingAs(User::factory()->create())->getJson($this->base)->assertForbidden();
    }

    private function market(array $overrides = []): array
    {
        return $this->postJson($this->base.'/markets', array_replace([
            'type' => 'mention_count', 'title' => 'האם איראן תוזכר לפחות שלוש פעמים?',
            'closes_at' => '2026-10-15T10:00:00Z', 'window_ends_at' => '2026-10-16T10:00:00Z',
            'probability' => 4000, 'tag' => 'evidence_based', 'rationale' => 'סרטונים קודמים',
            'contract' => ['source_url' => 'https://example.org/official-video', 'yes_rule' => 'שלוש פעמים ומעלה', 'no_rule' => 'פחות משלוש', 'void_rule' => 'אין סרטון', 'comparison' => 'gte', 'threshold' => 3, 'window_starts_at' => '2026-10-14T10:00:00Z', 'count_rules' => 'שמע בלבד'],
        ], $overrides))->assertCreated()->json('market');
    }

    public function test_operator_publishes_and_a_locked_bet_is_idempotent_after_repricing(): void
    {
        $market = $this->market();
        $bet = ['side' => 'yes', 'stake' => 10000, 'quote_id' => $market['quote']['id'], 'request_key' => 'my-first-bet'];
        $path = $this->base.'/markets/'.$market['id'];
        $this->postJson($path.'/bets', $bet)->assertCreated()->assertJsonPath('bet.promised_return', 25000);
        $this->postJson($path.'/quote', ['probability' => 6000, 'rationale' => 'עדכון מפעיל'])->assertOk();
        $this->postJson($path.'/bets', $bet)->assertOk()->assertJsonPath('bet.promised_return', 25000);
        $this->postJson($path.'/bets', [...$bet, 'request_key' => 'stale'])->assertConflict();
        $this->postJson($path.'/bets', [...$bet, 'stake' => 20000])->assertConflict();
        $this->getJson($this->base)->assertJsonPath('wallet.available', 990000)->assertJsonCount(2, 'wallet.entries')->assertJsonCount(1, 'markets.0.bets');
    }

    public function test_hedges_settle_once_and_voids_refund_once(): void
    {
        $market = $this->market();
        $path = $this->base.'/markets/'.$market['id'];
        $this->postJson($path.'/bets', ['side' => 'yes', 'stake' => 10000, 'quote_id' => $market['quote']['id'], 'request_key' => 'yes'])->assertCreated();
        $quote = $this->postJson($path.'/quote', ['probability' => 6000, 'rationale' => 'עדכון'])->assertOk()->json('market.quote.id');
        $this->postJson($path.'/bets', ['side' => 'no', 'stake' => 10000, 'quote_id' => $quote, 'request_key' => 'no'])->assertCreated();
        $this->travelTo(CarbonImmutable::parse('2026-10-15T11:00:00Z'));
        $preview = $this->postJson($path.'/preview', ['observed' => 3, 'source_url' => 'https://example.org/video', 'observed_at' => now()->toIso8601String(), 'note' => '00:04, 00:08, 00:12'])->assertOk()->assertJsonPath('outcome', 'yes')->assertJsonPath('payout', 25000)->json('token');
        $this->postJson($path.'/settle', ['token' => $preview])->assertOk();
        $this->postJson($path.'/settle', ['token' => $preview])->assertOk();
        $this->getJson($this->base)->assertJsonPath('wallet.available', 1005000)->assertJsonPath('wallet.profit', 5000)->assertJsonPath('markets.0.state', 'resolved')->assertJsonPath('leaderboard.0.picks', 2)->assertJsonPath('leaderboard.0.won', 1)->assertJsonPath('leaderboard.0.lost', 1)->assertJsonPath('leaderboard.0.win_rate', 0.5);
        $this->postJson($path.'/void', ['reason' => 'too late'])->assertConflict();
        $void = $this->market(['closes_at' => '2026-10-16T10:00:00Z']);
        $vpath = $this->base.'/markets/'.$void['id'];
        $this->postJson($vpath.'/bets', ['side' => 'yes', 'stake' => 20000, 'quote_id' => $void['quote']['id'], 'request_key' => 'void-me'])->assertCreated();
        $this->postJson($vpath.'/void', ['reason' => 'לא פורסם סרטון'])->assertOk();
        $this->postJson($vpath.'/void', ['reason' => 'לא פורסם סרטון'])->assertOk();
        $this->getJson($this->base)->assertJsonPath('wallet.available', 1005000)->assertJsonPath('wallet.profit', 5000);
    }

    public function test_launch_cleanup_preserves_real_bets_and_ledger_and_is_reversible(): void
    {
        $qa = $this->market(['title' => LaunchCleanup::TITLES[1]]);
        $path = $this->base.'/markets/'.$qa['id'];
        $this->postJson($path.'/bets', ['side' => 'yes', 'stake' => 1000, 'quote_id' => $qa['quote']['id'], 'request_key' => 'qa'])->assertCreated();
        $cleanup = app(LaunchCleanup::class);
        try {
            $cleanup->archive($this->league, true);
            $this->fail('Pending QA cannot be archived');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
        }
        $this->postJson($path.'/void', ['reason' => 'QA cleanup'])->assertOk();
        $real = $this->market();
        $this->postJson($this->base.'/markets/'.$real['id'].'/bets', ['side' => 'yes', 'stake' => 2500, 'quote_id' => $real['quote']['id'], 'request_key' => 'real'])->assertCreated();
        $wallets = DB::table('campaign_wallets')->get()->toJson();
        $entries = DB::table('campaign_entries')->get()->toJson();
        DB::table('campaign_bets')->where('market_id', $qa['id'])->update(['paid' => 999]);
        try {
            $cleanup->archive($this->league, true);
            $this->fail('Nonzero QA wallet impact cannot be hidden');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
        }
        DB::table('campaign_bets')->where('market_id', $qa['id'])->update(['paid' => 1000]);
        $this->artisan('campaign:launch-audit')->assertSuccessful();
        $this->assertSame(1, $cleanup->archive($this->league)['markets']);
        $this->getJson($this->base)->assertJsonCount(2, 'markets');
        $this->assertSame(1, $cleanup->archive($this->league, true)['markets']);
        $this->assertSame(0, $cleanup->archive($this->league, true)['markets']);
        $this->getJson($this->base)->assertJsonCount(1, 'markets')->assertJsonPath('markets.0.id', $real['id'])->assertJsonPath('leaderboard.0.picks', 1)->assertJsonPath('wallet.outstanding', 2500);
        $this->assertSame($wallets, DB::table('campaign_wallets')->get()->toJson());
        $this->assertSame($entries, DB::table('campaign_entries')->get()->toJson());
        $this->assertDatabaseCount('campaign_bets', 2);
        DB::table('campaign_markets')->where('id', $qa['id'])->update(['archived_at' => null]);
        $this->getJson($this->base)->assertJsonCount(2, 'markets');
    }

    public function test_imports_are_review_proposals_and_resolved_contracts_are_rejected(): void
    {
        Http::fake(['*gamma-api.polymarket.com/markets/123*' => Http::response(['id' => '123', 'slug' => 'withdrawal', 'question' => 'Withdrawal by Friday?', 'description' => 'Official announcement required', 'active' => true, 'closed' => false, 'acceptingOrders' => true, 'outcomes' => '["Yes","No"]', 'outcomePrices' => '["0.4","0.6"]', 'endDate' => '2026-10-20T10:00:00Z'])]);
        $this->postJson($this->base.'/import', ['provider' => 'polymarket', 'id' => '123'])->assertOk();
        $this->postJson($this->base.'/import', ['provider' => 'polymarket', 'id' => '123'])->assertOk();
        $this->getJson($this->base)->assertJsonCount(0, 'markets')->assertJsonCount(1, 'proposals')->assertJsonPath('proposals.0.payload.external_probability', 4000);
        Http::fake(['*gamma-api.polymarket.com/markets/124*' => Http::response(['active' => true, 'closed' => true, 'acceptingOrders' => false])]);
        $this->postJson($this->base.'/import', ['provider' => 'polymarket', 'id' => '124'])->assertUnprocessable();
    }

    public function test_repricing_reuses_identical_inputs_and_validates_no_basis(): void
    {
        $market = $this->market();
        config(['campaign.api_key' => 'test-key']);
        Http::fake(['api.openai.com/*' => Http::response(['output' => [['content' => [['type' => 'output_text', 'text' => json_encode(['quotes' => [['id' => $market['id'], 'probability' => 5000, 'tag' => 'no_basis', 'rationale' => 'אין חומר להשוואה', 'evidence' => []]]])]]]]])]);
        $pricing = app(Automation::class);
        $pricing->reprice($this->league);
        Http::assertNothingSent();
        DB::table('campaign_sources')->insert(['league_id' => $this->league->id, 'kind' => 'evidence', 'name' => 'Context', 'url' => 'https://example.org/official-video', 'payload' => json_encode(['text' => 'New interview announced']), 'created_at' => now(), 'updated_at' => now()]);
        $pricing->reprice($this->league);
        $this->getJson($this->base)->assertJsonPath('markets.0.quote.probability', 5000)->assertJsonPath('markets.0.quote.tag', 'no_basis')->assertJsonCount(2, 'markets.0.quotes');
        $pricing->reprice($this->league);
        Http::assertSentCount(1);
        DB::table('campaign_sources')->update(['payload' => json_encode(['text' => 'Changed again'])]);
        Http::swap(new Factory);
        Http::fake(['api.openai.com/*' => Http::response(['output' => [['content' => [['type' => 'output_text', 'text' => json_encode(['quotes' => [['id' => $market['id'], 'probability' => 7000, 'tag' => 'no_basis', 'rationale' => 'invalid', 'evidence' => []]]])]]]]])]);
        try {
            $pricing->reprice($this->league);
            $this->fail('Invalid no-basis output accepted');
        } catch (ValidationException $e) {
        }
        $this->getJson($this->base)->assertJsonCount(2, 'markets.0.quotes');
    }

    public function test_groups_share_observations_and_old_previews_cannot_settle(): void
    {
        $first = $this->market(['group_key' => 'ad-1']);
        $second = $this->market(['group_key' => 'ad-1', 'probability' => 3000, 'contract' => [...$first['contract'], 'comparison' => 'gt', 'threshold' => 3]]);
        $path = $this->base.'/markets/'.$first['id'];
        $this->travelTo(CarbonImmutable::parse('2026-10-15T11:00:00Z'));
        $body = ['observed' => 3, 'source_url' => 'https://example.org/video', 'observed_at' => now()->toIso8601String(), 'note' => 'counted'];
        $old = $this->postJson($path.'/preview', $body)->assertOk()->json('token');
        $new = $this->postJson($path.'/preview', [...$body, 'observed' => 4])->assertOk()->json('token');
        $this->postJson($path.'/settle', ['token' => $old])->assertConflict();
        $this->postJson($path.'/settle', ['token' => $new])->assertOk();
        $this->assertDatabaseHas('campaign_markets', ['id' => $first['id'], 'state' => 'resolved']);
        $this->assertDatabaseHas('campaign_markets', ['id' => $second['id'], 'state' => 'resolved']);
    }

    public function test_early_results_refund_late_bets_and_blank_never_means_zero(): void
    {
        $market = $this->market();
        $path = $this->base.'/markets/'.$market['id'];
        $bet = ['side' => 'yes', 'stake' => 10000, 'quote_id' => $market['quote']['id'], 'request_key' => 'before'];
        $this->postJson($path.'/bets', $bet)->assertCreated();
        $this->travelTo(CarbonImmutable::parse('2026-10-14T11:00:00Z'));
        $this->postJson($path.'/bets', [...$bet, 'request_key' => 'at-event'])->assertCreated();
        $this->travelTo(CarbonImmutable::parse('2026-10-14T12:00:00Z'));
        $body = ['observed' => '', 'source_url' => 'https://example.org/video', 'observed_at' => '2026-10-14T11:00:00Z', 'early_at' => '2026-10-14T11:00:00Z', 'note' => 'No mentions'];
        $this->postJson($path.'/preview', $body)->assertUnprocessable();
        $token = $this->postJson($path.'/preview', [...$body, 'observed' => 0])->assertOk()->assertJsonPath('refund', 10000)->assertJsonPath('outcome', 'no')->json('token');
        $this->postJson($path.'/settle', ['token' => $token])->assertOk();
        $this->getJson($this->base)->assertJsonPath('wallet.available', 990000)->assertJsonPath('wallet.profit', -10000)->assertJsonPath('leaderboard.0.markets', 1)->assertJsonPath('leaderboard.0.roi', null);
    }

    public function test_late_side_join_and_merged_suggestions_do_not_change_prediction_membership(): void
    {
        $this->league->update(['locks_at' => now()->subDay()]);
        $user = User::factory()->create();
        $this->postJson($this->base.'/suggestions', ['title' => 'Next ad mentions Iran?'])->assertOk();
        $this->actingAs($user)->postJson('/api/campaign/join', ['code' => $this->league->invite_code])->assertOk();
        $this->postJson($this->base.'/suggestions', ['title' => 'Next ad mentions Iran?'])->assertOk();
        $this->assertDatabaseMissing('league_user', ['league_id' => $this->league->id, 'user_id' => $user->id]);
        $this->getJson($this->base)->assertOk()->assertJsonCount(1, 'proposals')->assertJsonCount(2, 'proposals.0.payload.submitters');
        $this->postJson($this->base.'/markets', [])->assertForbidden();
        $this->assertDatabaseCount('campaign_proposals', 1);
    }

    public function test_operator_edit_wins_over_an_in_flight_model_response(): void
    {
        $market = $this->market();
        config(['campaign.api_key' => 'test']);
        DB::table('campaign_sources')->insert(['league_id' => $this->league->id, 'kind' => 'evidence', 'name' => 'Context', 'url' => 'https://example.org/official-video', 'payload' => '{}', 'created_at' => now(), 'updated_at' => now()]);
        Http::fake(function () use ($market) {
            app(Game::class)->quote($this->league, $market['id'], $this->operator, ['probability' => 6500, 'rationale' => 'Operator decision while AI is working']);

            return Http::response(['output' => [['content' => [['type' => 'output_text', 'text' => json_encode(['quotes' => [['id' => $market['id'], 'probability' => 5000, 'tag' => 'no_basis', 'rationale' => 'No evidence', 'evidence' => []]]])]]]]]);
        });
        app(Automation::class)->reprice($this->league);
        $this->getJson($this->base)->assertJsonPath('markets.0.quote.probability', 6500)->assertJsonPath('markets.0.quote.tag', 'operator_edited')->assertJsonCount(2, 'markets.0.quotes');
    }

    public function test_feed_prefill_uses_explicit_zero_and_never_invents_a_poll_release_time(): void
    {
        $c = ['source_url' => 'https://example.org/poll', 'yes_rule' => 'at least 1', 'no_rule' => 'zero', 'void_rule' => 'no poll', 'comparison' => 'gte', 'threshold' => 1, 'window_starts_at' => '2026-10-14T00:00:00Z', 'subject' => 'likud', 'pollster' => 'Y', 'publisher' => '12'];
        $market = $this->market(['type' => 'poll_value', 'contract' => $c]);
        Survey::create(['id' => 'poll-1', 'kind' => 'opinion_poll', 'active' => true, 'content_hash' => str_repeat('a', 64), 'payload' => ['date' => '2026-10-14', 'institute' => 'Y', 'channelOrMedia' => '12', 'seats' => ['likud' => 0], 'sourceUrl' => 'https://example.org/new-poll']]);
        $this->getJson($this->base.'/markets/'.$market['id'].'/prefill')->assertOk()->assertJsonPath('observed', 0)->assertJsonPath('source_url', 'https://example.org/new-poll')->assertJsonMissingPath('observed_at');
    }

    public function test_daily_proposals_require_real_sources_and_keep_ai_original_when_edited(): void
    {
        config(['campaign.api_key' => 'test']);
        DB::table('campaign_sources')->insert(['league_id' => $this->league->id, 'kind' => 'scheduled_event', 'name' => 'Interview', 'url' => 'https://example.org/interview', 'payload' => '{}', 'created_at' => now(), 'updated_at' => now()]);
        $p = ['type' => 'statement', 'title' => 'Will Iran be mentioned?', 'closes_at' => '2026-10-15T10:00:00Z', 'window_ends_at' => '2026-10-15T15:00:00Z', 'probability' => 5000, 'tag' => 'no_basis', 'rationale' => 'No prior record', 'evidence' => [], 'contract' => ['source_url' => 'https://example.org/interview', 'yes_rule' => 'mentioned', 'no_rule' => 'not mentioned', 'void_rule' => 'interview cancelled', 'comparison' => 'event', 'threshold' => 1, 'window_starts_at' => '2026-10-15T11:00:00Z']];
        Http::fake(['api.openai.com/*' => Http::response(['output' => [['content' => [['type' => 'output_text', 'text' => json_encode(['proposals' => [$p]])]]]]])]);
        $automation = app(Automation::class);
        $this->assertSame(1, $automation->propose($this->league));
        $this->assertSame(0, $automation->propose($this->league));
        $id = $this->getJson($this->base)->assertJsonCount(0, 'markets')->json('proposals.0.id');
        $this->postJson($this->base.'/markets', [...$p, 'probability' => 5500, 'tag' => 'operator_edited', 'ai_probability' => 2000, 'proposal_id' => $id])->assertCreated()->assertJsonPath('market.quote.ai_probability', 5000)->assertJsonPath('market.quote.tag', 'operator_edited');
    }

    public function test_channel_collector_keeps_history_and_does_not_infer_no_from_a_missing_item(): void
    {
        Queue::fake();
        $this->postJson($this->base.'/sources', ['kind' => 'telegram', 'name' => 'Channel', 'external_id' => 'public_channel', 'url' => 'https://t.me/public_channel', 'payload' => ['text' => 'Official channel']])->assertOk();
        $source = DB::table('campaign_sources')->first();
        $html = '<div class="tgme_widget_message" data-post="public_channel/42"><div class="tgme_widget_message_text">New campaign video</div><time datetime="2026-10-14T11:00:00Z"></time></div>';
        Http::fake(['t.me/s/public_channel' => Http::response($html)]);
        $collector = app(Channels::class);
        $this->assertTrue($collector->collect($source));
        $this->assertFalse($collector->collect($source));
        $c = ['source_url' => 'https://t.me/public_channel', 'yes_rule' => 'Posted', 'no_rule' => 'No post', 'void_rule' => 'Feed unavailable', 'comparison' => 'event', 'threshold' => 1, 'source_id' => $source->id, 'window_starts_at' => '2026-10-14T10:00:00Z'];
        $m = $this->market(['type' => 'channel_activity', 'contract' => $c]);
        $this->getJson($this->base.'/markets/'.$m['id'].'/prefill')->assertOk()->assertJsonPath('observed', 1)->assertJsonPath('source_url', 'https://t.me/public_channel/42');
        $m2 = $this->market(['type' => 'channel_activity', 'contract' => [...$c, 'window_starts_at' => '2026-10-15T10:00:00Z']]);
        $this->getJson($this->base.'/markets/'.$m2['id'].'/prefill')->assertOk()->assertJsonMissingPath('observed');
        $this->postJson($this->base.'/sources', ['id' => $source->id, 'kind' => 'telegram', 'name' => 'Changed label', 'external_id' => 'public_channel', 'url' => 'https://t.me/public_channel', 'payload' => ['text' => 'Updated context']])->assertOk()->assertJsonPath('sources.0.payload.items.0.id', 'public_channel/42');
    }

    public function test_early_no_is_rejected_and_roi_counts_markets_not_tickets(): void
    {
        $m = $this->market(['type' => 'deadline_event', 'contract' => ['source_url' => 'https://example.org/announcement', 'yes_rule' => 'Happened', 'no_rule' => 'Did not happen', 'void_rule' => 'Unavailable', 'comparison' => 'event', 'threshold' => 1, 'window_starts_at' => now()->toIso8601String()]]);
        $path = $this->base.'/markets/'.$m['id'];
        foreach (range(1, 3) as $i) {
            $this->postJson($path.'/bets', ['side' => 'yes', 'stake' => 100, 'quote_id' => $m['quote']['id'], 'request_key' => 'split-'.$i])->assertCreated();
        }
        $this->travelTo(CarbonImmutable::parse('2026-10-15T11:00:00Z'));
        $body = ['observed' => 0, 'source_url' => 'https://example.org/announcement', 'observed_at' => now()->toIso8601String(), 'note' => 'Checked'];
        $this->postJson($path.'/preview', $body)->assertUnprocessable();
        $token = $this->postJson($path.'/preview', [...$body, 'observed' => 1])->assertOk()->json('token');
        $this->postJson($path.'/settle', ['token' => $token])->assertOk();
        $this->getJson($this->base)->assertJsonPath('leaderboard.0.markets', 1)->assertJsonPath('leaderboard.0.roi', null);
        foreach (range(1, 2) as $i) {
            $m = $this->market(['closes_at' => now()->addHour()->toIso8601String(), 'window_ends_at' => now()->addHours(2)->toIso8601String()]);
            $path = $this->base.'/markets/'.$m['id'];
            $this->postJson($path.'/bets', ['side' => 'yes', 'stake' => 100, 'quote_id' => $m['quote']['id'], 'request_key' => 'distinct-'.$i])->assertCreated();
            $this->travel(1)->hours();
            $token = $this->postJson($path.'/preview', [...$body, 'observed' => 3, 'observed_at' => now()->toIso8601String()])->assertOk()->json('token');
            $this->postJson($path.'/settle', ['token' => $token])->assertOk();
        }
        $this->getJson($this->base)->assertJsonPath('leaderboard.0.markets', 3)->assertJsonPath('leaderboard.0.roi', 1.5);
    }

    public function test_group_repricing_is_atomic_and_normalizes_inclusive_thresholds(): void
    {
        config(['campaign.api_key' => 'test']);
        $a = $this->market(['group_key' => 'atomic-ad']);
        $b = $this->market(['group_key' => 'atomic-ad', 'probability' => 3000, 'contract' => [...$a['contract'], 'comparison' => 'gt', 'threshold' => 3]]);
        Http::fake();
        $automation = app(Automation::class);
        $automation->reprice($this->league);
        Http::assertNothingSent();
        DB::table('campaign_sources')->insert(['league_id' => $this->league->id, 'kind' => 'evidence', 'name' => 'New ad', 'url' => $a['contract']['source_url'], 'payload' => '{"text":"new evidence"}', 'created_at' => now(), 'updated_at' => now()]);
        Http::swap(new Factory);
        $quotes = [['id' => $a['id'], 'probability' => 4000, 'tag' => 'evidence_based', 'rationale' => 'Supplied ad', 'evidence' => [$a['contract']['source_url']]], ['id' => $b['id'], 'probability' => 6000, 'tag' => 'evidence_based', 'rationale' => 'Supplied ad', 'evidence' => [$a['contract']['source_url']]]];
        Http::fake(['api.openai.com/*' => Http::response(['output' => [['content' => [['type' => 'output_text', 'text' => json_encode(['quotes' => $quotes])]]]]])]);
        try {
            $automation->reprice($this->league);
            $this->fail('Inconsistent group accepted');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
        }
        $this->assertDatabaseCount('campaign_quotes', 2);
        $this->travelTo(CarbonImmutable::parse('2026-10-15T11:00:00Z'));
        $preview = $this->postJson($this->base.'/markets/'.$a['id'].'/preview', ['observed' => 3, 'source_url' => $a['contract']['source_url'], 'observed_at' => now()->toIso8601String(), 'note' => '3 mentions'])->assertOk()->json('results');
        $this->assertSame('yes', collect($preview)->firstWhere('id', $a['id'])['outcome']);
        $this->assertSame('no', collect($preview)->firstWhere('id', $b['id'])['outcome']);
    }
}

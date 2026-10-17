<?php

namespace Tests\Feature;

use App\Models\Survey;
use App\Models\User;
use App\Services\Campaign\Exposure;
use App\Services\Campaign\OpeningSlate;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CampaignOpeningSlateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-10-17T12:00:00Z'));
        config(['campaign.enabled' => true, 'campaign.pilot_only' => true, 'campaign.x_bearer_token' => null, 'election.date' => '2026-10-27']);
    }

    private function login(string $email): User
    {
        $user = User::factory()->create(['email' => $email, 'google_id' => 'google-'.$email]);
        $this->actingAs($user);

        return $user;
    }

    public function test_both_accounts_get_one_private_league_and_real_bets_with_one_grant(): void
    {
        $admin = $this->login('okremer84@gmail.com');
        $league = $this->getJson('/api/campaign/config')->assertOk()->json('leagues.0.id');
        $this->assertSame(OpeningSlate::LEAGUE_ID, $league);
        $base = '/api/leagues/'.$league.'/campaign';
        $feed = $this->getJson($base)->assertOk()->assertJsonCount(20, 'opening_slate')->assertJsonCount(11, 'markets')->assertJsonPath('wallet.available', 1000000)->json();
        $p1 = collect($feed['markets'])->firstWhere('contract.slate_key', 'P1');
        $this->assertNotNull($p1);
        $pm = collect($feed['markets'])->firstWhere('contract.slate_key', 'M1');
        $this->assertSame('yashar', $pm['contract']['presentation']['portrait']);
        $this->assertSame('next-pm-2026', $pm['contract']['exclusive_key']);
        $this->assertSame(config('campaign_slate.questions.0.probability'), $p1['quote']['probability']);
        $this->postJson($base.'/markets/'.$p1['id'].'/bets', ['side' => 'yes', 'stake' => 10000, 'quote_id' => $p1['quote']['id'], 'request_key' => 'real-p1'])->assertCreated();
        config(['campaign_slate.questions.0.probability' => 7000]);
        $again = $this->getJson($base)->assertOk()->assertJsonCount(11, 'markets')->assertJsonPath('wallet.available', 990000)->json();
        $this->assertSame($p1['quote']['id'], collect($again['markets'])->firstWhere('id', $p1['id'])['quote']['id']);
        $this->login('omer@trytrackit.com');
        $this->getJson('/api/campaign/config')->assertOk()->assertJsonPath('operator', false)->assertJsonPath('leagues.0.id', $league);
        $this->getJson($base)->assertOk()->assertJsonCount(11, 'markets')->assertJsonPath('wallet.available', 1000000);
        $this->assertDatabaseCount('leagues', 1);
        $this->assertDatabaseCount('campaign_members', 2);
        $this->assertSame(0, DB::table('league_user')->count());
        $this->assertSame($admin->id, DB::table('leagues')->value('owner_id'));
    }

    public function test_secondary_first_login_does_not_impersonate_admin_or_publish_and_late_poll_never_opens(): void
    {
        $this->login('omer@trytrackit.com');
        $league = $this->getJson('/api/campaign/config')->assertOk()->json('leagues.0.id');
        $base = '/api/leagues/'.$league.'/campaign';
        $this->getJson($base)->assertOk()->assertJsonCount(0, 'markets')->assertJsonCount(20, 'opening_slate');
        $this->travelTo(CarbonImmutable::parse('2026-10-18T07:00:00Z'));
        $admin = $this->login('okremer84@gmail.com');
        $this->getJson('/api/campaign/config')->assertOk();
        $feed = $this->getJson($base)->assertOk()->assertJsonCount(6, 'markets')->json();
        $this->assertSame('expired', collect($feed['opening_slate'])->firstWhere('key', 'P1')['status']);
        $this->assertSame($admin->id, DB::table('leagues')->value('owner_id'));
    }

    public function test_real_bloc_prefill_adds_frozen_parties_and_refuses_missing_values(): void
    {
        $this->login('okremer84@gmail.com');
        $league = $this->getJson('/api/campaign/config')->json('leagues.0.id');
        $base = '/api/leagues/'.$league.'/campaign';
        $feed = $this->getJson($base)->assertOk()->json();
        $bloc = collect($feed['markets'])->firstWhere('contract.slate_key', 'B1');
        $payload = ['date' => '2026-10-18', 'kind' => 'opinion_poll', 'institute' => 'Midgam R&C', 'channelOrMedia' => 'HaHadashot 12', 'seats' => ['yashar' => 20, 'beyachad' => 20, 'democrats' => 12, 'israel_beitenu' => 9], 'sourceUrl' => 'https://example.org/aggregate', 'originalSourceUrls' => ['https://www.mako.co.il/original']];
        $survey = Survey::create(['id' => 'test-poll', 'content_hash' => str_repeat('a', 64), 'kind' => 'opinion_poll', 'active' => true, 'payload' => $payload]);
        $path = $base.'/markets/'.$bloc['id'].'/prefill';
        $this->getJson($path)->assertOk()->assertJsonPath('observed', 61)->assertJsonPath('source_url', 'https://www.mako.co.il/original')->assertJsonMissingPath('observed_at');
        $payload['notReportedPartyIds'] = ['democrats'];
        $survey->update(['payload' => $payload]);
        $this->getJson($path)->assertOk()->assertJsonMissingPath('observed');
    }

    public function test_x_questions_activate_only_with_key_and_successful_recent_collection(): void
    {
        $this->login('okremer84@gmail.com');
        $league = $this->getJson('/api/campaign/config')->json('leagues.0.id');
        $base = '/api/leagues/'.$league.'/campaign';
        foreach (['netanyahu', 'yairlapid'] as $handle) {
            $id = DB::table('campaign_sources')->insertGetId(['league_id' => $league, 'kind' => 'x', 'name' => $handle, 'external_id' => $handle, 'url' => 'https://x.com/'.$handle, 'payload' => '{}', 'created_at' => now(), 'updated_at' => now()]);
            DB::table('campaign_monitor_runs')->insert(['source_id' => $id, 'status' => 'ok', 'started_at' => now(), 'finished_at' => now(), 'items' => 0]);
        }
        $feed = $this->getJson($base)->assertOk()->assertJsonCount(11, 'markets')->json();
        $this->assertSame('pending', collect($feed['opening_slate'])->firstWhere('key', 'X1')['status']);
        config(['campaign.x_bearer_token' => 'test-key']);
        $this->getJson($base)->assertOk()->assertJsonCount(11, 'markets');
        config(['campaign.x_slate_approved' => true]);
        $feed = $this->getJson($base)->assertOk()->assertJsonCount(15, 'markets')->json();
        $x = collect($feed['markets'])->firstWhere('contract.slate_key', 'X1');
        $this->assertSame('x_count', $x['contract']['monitor']['mode']);
        $this->assertSame(5000, $x['quote']['probability']);
        $this->assertSame('no_basis', $x['quote']['tag']);
        $this->getJson($base)->assertOk()->assertJsonCount(15, 'markets');
    }

    private function actualSlate(): array
    {
        $this->login('okremer84@gmail.com');
        $league = $this->getJson('/api/campaign/config')->json('leagues.0.id');
        $base = '/api/leagues/'.$league.'/campaign';

        return [$base, collect($this->getJson($base)->assertOk()->json('markets'))->keyBy('contract.slate_key')];
    }

    public function test_actual_pm_questions_resolve_together_with_exactly_one_winner_and_idempotent_payout(): void
    {
        [$base, $markets] = $this->actualSlate();
        $this->postJson($base.'/markets/'.$markets['M1']['id'].'/quote', ['probability' => 6000, 'rationale' => 'Individual repricing must not break the group'])->assertUnprocessable();
        $expected = 1000000;
        foreach (['M1', 'M2', 'M3', 'M4'] as $key) {
            $m = $markets[$key];
            $ticket = $this->postJson($base.'/markets/'.$m['id'].'/bets', ['side' => 'yes', 'stake' => 10000, 'quote_id' => $m['quote']['id'], 'request_key' => $key])->assertCreated()->json('bet');
            $expected -= 10000;
            if ($key === 'M2') {
                $expected += $ticket['promised_return'];
            }
        }
        $this->travelTo(CarbonImmutable::parse('2026-11-02T12:00:00Z'));
        $path = $base.'/markets/'.$markets['M1']['id'];
        $data = ['observed' => 2, 'source_url' => 'https://main.knesset.gov.il/government', 'observed_at' => now()->toIso8601String(), 'note' => 'Official inauguration reviewed'];
        $this->postJson($path.'/preview', [...$data, 'observed' => 5])->assertUnprocessable();
        $this->postJson($path.'/preview', [...$data, 'source_url' => 'https://example.org/news'])->assertUnprocessable();
        $preview = $this->postJson($path.'/preview', $data)->assertOk()->assertJsonCount(4, 'results')->assertJsonPath('outcome', 'no')->assertJsonPath('winner_label', 'בנימין נתניהו')->json();
        $this->assertCount(1, collect($preview['results'])->where('outcome', 'yes'));
        $this->postJson($path.'/settle', ['token' => $preview['token']])->assertOk();
        $this->postJson($path.'/settle', ['token' => $preview['token']])->assertOk();
        $this->getJson($base)->assertOk()->assertJsonPath('wallet.available', $expected);
        $this->assertSame(4, DB::table('campaign_markets')->where('state', 'resolved')->count());
        $this->assertSame(1, DB::table('campaign_bets')->where('status', 'won')->count());
        $this->assertSame(3, DB::table('campaign_bets')->where('status', 'lost')->count());
    }

    public function test_voiding_one_pm_question_refunds_all_four_once(): void
    {
        [$base, $markets] = $this->actualSlate();
        foreach (['M1', 'M2', 'M3', 'M4'] as $key) {
            $m = $markets[$key];
            $this->postJson($base.'/markets/'.$m['id'].'/bets', ['side' => 'no', 'stake' => 10000, 'quote_id' => $m['quote']['id'], 'request_key' => $key])->assertCreated();
        }
        $path = $base.'/markets/'.$markets['M3']['id'].'/void';
        $this->postJson($path, ['reason' => 'Another election was called'])->assertOk();
        $this->postJson($path, ['reason' => 'Retry'])->assertOk();
        $this->getJson($base)->assertOk()->assertJsonPath('wallet.available', 1000000);
        $this->assertSame(4, DB::table('campaign_markets')->where('state', 'void')->count());
        $this->assertSame(4, DB::table('campaign_bets')->where('status', 'refunded')->count());
        $this->assertSame(4, DB::table('campaign_entries')->where('kind', 'refund')->count());
    }

    public function test_official_final_no_can_resolve_before_january_only_with_official_confirmation(): void
    {
        [$base, $markets] = $this->actualSlate();
        $this->travelTo(CarbonImmutable::parse('2026-11-02T12:00:00Z'));
        $path = $base.'/markets/'.$markets['E1']['id'].'/preview';
        $data = ['observed' => 0, 'source_url' => 'https://www.gov.il/he/election-results', 'observed_at' => now()->toIso8601String(), 'note' => 'Final results confirmed'];
        $this->postJson($path, $data)->assertUnprocessable();
        $this->postJson($path, [...$data, 'official_final_confirmed' => true, 'source_url' => 'https://example.org/results'])->assertUnprocessable();
        $this->postJson($path, [...$data, 'official_final_confirmed' => true])->assertOk()->assertJsonPath('outcome', 'no');
    }

    public function test_potential_returns_respect_opposing_tickets_and_exclusive_pm_scenarios(): void
    {
        [$base, $markets] = $this->actualSlate();
        $tickets = [];
        foreach ([['P1', 'yes'], ['P1', 'no'], ['M1', 'yes'], ['M2', 'yes'], ['M1', 'no']] as $i => [$key,$side]) {
            $m = $markets[$key];
            $tickets[$key][$side] = $this->postJson($base.'/markets/'.$m['id'].'/bets', ['side' => $side, 'stake' => 10000, 'quote_id' => $m['quote']['id'], 'request_key' => 'exposure-'.$i])->assertCreated()->json('bet.promised_return');
        }
        $feed = $this->getJson($base)->assertOk()->json();
        $expected = max($tickets['P1']['yes'], $tickets['P1']['no']) + max($tickets['M1']['yes'], $tickets['M1']['no'] + $tickets['M2']['yes']);
        $this->assertSame($expected, app(Exposure::class)->potential(collect($feed['markets']), auth()->id()));
        $this->assertSame(0, app(Exposure::class)->potential(collect($feed['markets']), 99999));
        $this->postJson($base.'/markets/'.$markets['P1']['id'].'/void', ['reason' => 'No qualifying poll'])->assertOk();
        $feed = $this->getJson($base)->assertOk()->json();
        $this->assertSame($expected - max($tickets['P1']['yes'], $tickets['P1']['no']), app(Exposure::class)->potential(collect($feed['markets']), auth()->id()));
    }
}

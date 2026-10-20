<?php

namespace Tests\Feature;

use App\Models\League;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CampaignPilotTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $bettor;

    private League $league;

    private string $base;

    protected function setUp(): void
    {
        parent::setUp();
        config(['campaign.processing_enabled' => true]);
        config(['campaign.public_access' => false]);
        $this->travelTo(CarbonImmutable::parse('2026-10-16T10:00:00Z'));
        $this->admin = User::factory()->create(['email' => 'okremer84@gmail.com', 'google_id' => 'pilot-admin']);
        $this->bettor = User::factory()->create(['email' => 'omer@trytrackit.com', 'google_id' => 'pilot-bettor']);
        $this->league = League::create(['name' => 'Pilot', 'owner_id' => $this->bettor->id, 'invite_code' => str_repeat('p', 40), 'locks_at' => now()->addDay()]);
        $this->league->users()->attach([$this->admin->id, $this->bettor->id]);
        config(['campaign.enabled' => true, 'campaign.operator_ids' => [$this->bettor->id], 'election.date' => '2026-10-27']);
        $this->base = '/api/leagues/'.$this->league->id.'/campaign';
    }

    public function test_both_accounts_receive_exactly_one_ten_thousand_shekel_grant(): void
    {
        foreach ([$this->admin, $this->bettor] as $user) {
            $this->actingAs($user)->getJson($this->base)->assertOk()->assertJsonPath('wallet.available', 1000000)->assertJsonPath('operator', $user->id === $this->admin->id);
            $this->getJson($this->base)->assertOk()->assertJsonCount(1, 'wallet.entries');
        }
        $this->assertDatabaseCount('campaign_wallets', 2);
        $this->assertSame(2000000, (int) DB::table('campaign_entries')->where('kind', 'grant')->sum('amount'));
    }

    private function market(): array
    {
        return $this->actingAs($this->admin)->postJson($this->base.'/markets', [
            'type' => 'mention_count', 'title' => 'שאלת פיילוט', 'probability' => 5000, 'tag' => 'no_basis', 'rationale' => 'אין בסיס',
            'closes_at' => now()->addHour()->toIso8601String(), 'window_ends_at' => now()->addDay()->toIso8601String(),
            'contract' => ['source_url' => 'https://example.org/public', 'yes_rule' => 'אחד ומעלה', 'no_rule' => 'אפס', 'void_rule' => 'אין ראיה', 'comparison' => 'gte', 'threshold' => 1, 'window_starts_at' => now()->toIso8601String()],
        ])->assertCreated()->json('market');
    }

    public function test_secondary_can_bet_but_cannot_administer_even_as_league_owner_and_legacy_operator(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $market = $this->market();
        $path = $this->base.'/markets/'.$market['id'];
        $this->actingAs($this->bettor)->postJson($path.'/bets', ['side' => 'yes', 'stake' => 10000, 'quote_id' => $market['quote']['id'], 'request_key' => 'pilot-bet'])->assertCreated();
        $this->getJson($this->base)->assertJsonPath('wallet.available', 990000)->assertJsonCount(2, 'wallet.entries');
        foreach (['/markets', '/sources', '/monitoring/setup', '/proposals/generate', '/import', '/markets/'.$market['id'].'/quote', '/markets/'.$market['id'].'/preview', '/markets/'.$market['id'].'/settle', '/markets/'.$market['id'].'/void'] as $endpoint) {
            $this->postJson($this->base.$endpoint, [])->assertForbidden();
        }
        $this->getJson($this->base.'/monitoring')->assertForbidden();
    }

    public function test_other_existing_members_cannot_read_join_or_bet_and_never_receive_money(): void
    {
        $market = $this->market();
        $other = User::factory()->create(['google_id' => 'other']);
        $this->league->users()->attach($other);
        config(['campaign.operator_ids' => [$other->id]]);
        $this->actingAs($other)->getJson('/api/campaign/config')->assertOk()->assertJsonPath('enabled', false)->assertJsonPath('operator', false)->assertJsonCount(0, 'leagues');
        $this->getJson($this->base)->assertForbidden();
        $this->postJson('/api/campaign/join', ['code' => $this->league->invite_code])->assertForbidden();
        $this->postJson($this->base.'/markets/'.$market['id'].'/bets', [])->assertForbidden();
        $this->assertDatabaseMissing('campaign_wallets', ['user_id' => $other->id]);
    }

    public function test_pilot_requires_a_verified_google_identity_and_normalizes_case(): void
    {
        $this->admin->forceFill(['email' => 'OKREMER84@GMAIL.COM'])->save();
        $this->actingAs($this->admin)->getJson($this->base)->assertOk()->assertJsonPath('operator', true);
        $this->admin->forceFill(['email_verified_at' => null])->save();
        $this->getJson($this->base)->assertForbidden();
        $this->admin->forceFill(['email_verified_at' => now(), 'google_id' => null])->save();
        $this->getJson($this->base)->assertForbidden();
    }

    public function test_allowed_secondary_can_join_campaign_using_invite_without_prediction_membership(): void
    {
        $this->league->users()->detach($this->bettor);
        $this->actingAs($this->bettor)->postJson('/api/campaign/join', ['code' => $this->league->invite_code])->assertOk();
        $this->getJson($this->base)->assertOk()->assertJsonPath('wallet.available', 1000000)->assertJsonPath('operator', false);
        $this->assertFalse($this->league->users()->whereKey($this->bettor->id)->exists());
    }
}

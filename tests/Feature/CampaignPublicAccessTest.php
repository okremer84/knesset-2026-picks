<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Campaign\OpeningSlate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CampaignPublicAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_verified_users_join_the_same_market_without_operator_privileges(): void
    {
        config(['campaign.enabled' => true, 'campaign.pilot_only' => true, 'campaign.public_access' => true]);
        $user = User::factory()->create(['email' => 'public@example.org', 'google_id' => 'public-google']);
        $this->actingAs($user)->getJson('/api/auth/user')->assertOk()->assertJsonPath('user.campaign_access', true);
        $this->getJson('/api/campaign/config')->assertOk()->assertJsonPath('leagues.0.id', OpeningSlate::LEAGUE_ID)->assertJsonPath('operator', false);
        $base = '/api/leagues/'.OpeningSlate::LEAGUE_ID.'/campaign';
        $this->getJson($base)->assertOk()->assertJsonPath('wallet.available', 1000000);
        $this->postJson($base.'/markets', [])->assertForbidden();
        $this->getJson($base.'/monitoring')->assertForbidden();
        $this->getJson('/api/campaign/config')->assertOk();
        $this->assertDatabaseCount('campaign_wallets', 1);
        $this->assertDatabaseCount('campaign_members', 1);
        $user->forceFill(['email_verified_at' => null])->save();
        $this->actingAs($user->fresh());
        $this->getJson('/api/campaign/config')->assertOk()->assertJsonPath('enabled', false);
        $this->getJson($base)->assertForbidden();
    }
}

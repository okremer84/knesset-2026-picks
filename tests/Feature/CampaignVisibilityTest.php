<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CampaignVisibilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_navigation_capability_requires_verified_google_identity_for_each_pilot_account(): void
    {
        config(['campaign.enabled' => true, 'campaign.pilot_only' => true]);
        foreach (['okremer84@gmail.com', 'omer@trytrackit.com', 'outsider@example.org'] as $email) {
            $user = User::factory()->create(['email' => $email, 'google_id' => 'google-'.$email]);
            $this->actingAs($user)->getJson('/api/auth/user')->assertOk()
                ->assertJsonPath('user.campaign_access', $email !== 'outsider@example.org')
                ->assertJsonMissingPath('user.google_id');
            $user->forceFill(['email_verified_at' => null])->save();
            $this->getJson('/api/auth/user')->assertJsonPath('user.campaign_access', false);
            $user->forceFill(['email_verified_at' => now(), 'google_id' => null])->save();
            $this->getJson('/api/auth/user')->assertJsonPath('user.campaign_access', false);
        }
    }

    public function test_disabling_campaign_hides_capability_and_does_not_create_pilot_resources(): void
    {
        config(['campaign.enabled' => false, 'campaign.pilot_only' => true]);
        $user = User::factory()->create(['email' => 'okremer84@gmail.com', 'google_id' => 'admin']);
        $this->actingAs($user)->getJson('/api/auth/user')->assertOk()->assertJsonPath('user.campaign_access', false);
        $this->getJson('/api/campaign/config')->assertOk()->assertJsonPath('enabled', false)->assertJsonCount(0, 'leagues');
        $this->assertDatabaseCount('campaign_wallets', 0);
        $this->assertDatabaseCount('campaign_members', 0);
        $this->assertDatabaseCount('leagues', 0);
    }
}

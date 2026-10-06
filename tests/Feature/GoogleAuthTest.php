<?php

namespace Tests\Feature;

use App\Models\User;
use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Psr7\Response;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\GoogleProvider;
use Tests\TestCase;

class GoogleAuthTest extends TestCase
{
    use RefreshDatabase;

    private MockHandler $googleHttp;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.google' => [
            'client_id' => 'test-client', 'client_secret' => 'test-secret',
            'redirect' => 'http://localhost/auth/google/callback',
        ]]);
        $this->googleHttp = new MockHandler;
        $http = $this->googleHttp;
        Socialite::extend('google', fn ($app) => (new GoogleProvider(
            $app['request'], 'test-client', 'test-secret', 'http://localhost/auth/google/callback',
        ))->setHttpClient(new Client(['handler' => HandlerStack::create($http)])));
    }

    private function begin(string $query = ''): string
    {
        Socialite::forgetDrivers();
        $response = $this->get('/auth/google'.$query)->assertRedirect();
        parse_str(parse_url($response->headers->get('Location'), PHP_URL_QUERY), $params);
        $this->assertSame('accounts.google.com', parse_url($response->headers->get('Location'), PHP_URL_HOST));
        $this->assertSame('openid profile email', $params['scope']);
        $this->assertNotEmpty($params['state']);

        return $params['state'];
    }

    private function profile(array $overrides = []): void
    {
        $this->googleHttp->append(
            new Response(200, [], json_encode(['access_token' => 'test-token', 'expires_in' => 3600])),
            new Response(200, [], json_encode(array_replace([
                'sub' => 'google-123', 'email' => 'MAYA@example.org',
                'name' => 'Maya', 'email_verified' => true, 'picture' => 'https://example.org/google.jpg',
            ], $overrides))),
        );
    }

    private function completeGoogleSignIn(string $state)
    {
        Socialite::forgetDrivers();

        return $this->get('/auth/google/callback?code=test-code&state='.urlencode($state));
    }

    public function test_google_creates_account_and_preserves_invitation_and_session(): void
    {
        $this->getJson('/api/leagues')->assertUnauthorized();
        $state = $this->begin('?invite=abc&league=my-league&redirect=https://evil.example');
        $oldSession = session()->getId();
        $this->profile();
        $this->completeGoogleSignIn($state)->assertRedirect('/?invite=abc&league=my-league');
        $this->assertNotSame($oldSession, session()->getId());
        $user = User::sole();
        $this->assertSame('google-123', $user->google_id);
        $this->assertSame('maya@example.org', $user->email);
        $this->assertSame('https://example.org/google.jpg', $user->avatar_url);
        $this->assertNotNull($user->email_verified_at);
        $this->assertAuthenticatedAs($user);
        $this->getJson('/api/auth/user')->assertOk()->assertJsonPath('user.name', 'Maya')
            ->assertJsonMissingPath('user.password')->assertJsonMissingPath('user.google_id');
        $this->postJson('/api/auth/logout')->assertNoContent();
        $this->assertGuest();
        $this->getJson('/api/auth/user')->assertUnauthorized();
    }

    public function test_returning_google_subject_uses_same_account_even_if_email_changes(): void
    {
        $user = User::factory()->create(['google_id' => 'google-123', 'email' => 'old@example.org']);
        $state = $this->begin();
        $this->profile();
        $this->completeGoogleSignIn($state)->assertRedirect('/');
        $this->assertAuthenticatedAs($user);
        $this->assertDatabaseCount('users', 1);
    }

    public function test_state_is_required_matched_and_consumed_before_google_requests(): void
    {
        $state = $this->begin();
        $this->completeGoogleSignIn('wrong')->assertRedirect('/?auth_error=failed');
        $this->completeGoogleSignIn($state)->assertRedirect('/?auth_error=failed');
        $this->completeGoogleSignIn('')->assertRedirect('/?auth_error=failed');
        $this->assertGuest();
        $this->assertDatabaseCount('users', 0);
        // Empty HTTP queue would throw if a token exchange bypassed state verification.
    }

    public function test_unverified_google_email_cannot_sign_in(): void
    {
        $state = $this->begin();
        $this->profile(['email_verified' => false]);
        $this->completeGoogleSignIn($state)->assertRedirect('/?auth_error=failed');
        $this->assertGuest();
        $this->assertDatabaseCount('users', 0);
    }

    public function test_matching_email_never_silently_links_an_existing_account(): void
    {
        $user = User::factory()->create(['email' => 'maya@example.org']);
        $state = $this->begin();
        $this->profile();
        $this->completeGoogleSignIn($state)->assertRedirect('/?auth_error=account_exists');
        $this->assertGuest();
        $this->assertNull($user->fresh()->google_id);
        $this->assertDatabaseCount('users', 1);
    }

    public function test_cancellation_and_provider_errors_return_to_sign_in(): void
    {
        $this->begin('?invite=abc');
        $this->get('/auth/google/callback?error=access_denied')->assertRedirect('/?invite=abc&auth_error=failed');
        $state = $this->begin();
        $this->googleHttp->append(new Response(500));
        $this->completeGoogleSignIn($state)->assertRedirect('/?auth_error=failed');
        $this->assertGuest();
    }

    public function test_missing_credentials_are_reported_without_exposing_secrets(): void
    {
        $this->getJson('/api/auth/config')->assertExactJson(['googleEnabled' => true]);
        config(['services.google.client_secret' => '']);
        $this->getJson('/api/auth/config')->assertExactJson(['googleEnabled' => false]);
        $this->get('/auth/google?invite=abc')->assertRedirect('/?invite=abc&auth_error=unavailable');
        $this->get('/auth/google/callback?code=test')->assertRedirect('/?auth_error=unavailable');
        $this->assertGuest();
    }

    public function test_google_photo_refresh_preserves_custom_photo_and_display_name(): void
    {
        $user = User::factory()->create(['google_id' => 'google-123', 'name' => 'Custom name', 'avatar_data' => 'data:image/png;base64,custom']);
        $state = $this->begin();
        $this->profile(['picture' => 'https://example.org/google.jpg']);
        $this->completeGoogleSignIn($state)->assertRedirect('/');
        $this->assertSame('https://example.org/google.jpg', $user->fresh()->google_avatar_url);
        $this->assertSame('data:image/png;base64,custom', $user->fresh()->avatar_url);
        $this->assertSame('Custom name', $user->fresh()->name);
    }

    public function test_password_routes_are_removed(): void
    {
        foreach (['register', 'login', 'forgot-password', 'reset-password'] as $route) {
            $this->postJson('/api/auth/'.$route, [])->assertNotFound();
        }
        $this->get('/reset-password/old-token')->assertNotFound();
    }
}

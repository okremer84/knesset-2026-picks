<?php

namespace Tests\Feature;

use App\Models\League;
use App\Models\User;
use App\Services\Campaign\Game;
use App\Services\Campaign\Settlement;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class CampaignConcurrencyTest extends TestCase
{
    use DatabaseMigrations { runDatabaseMigrations as private migrateMySql; }

    public function runDatabaseMigrations(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }
        $this->migrateMySql();
        RefreshDatabaseState::$migrated = false;
    }

    public function test_mysql_concurrent_grants_bets_and_terminal_actions_reconcile(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            $this->markTestSkipped('Row-lock races require MySQL.');
        }
        $this->travelTo(CarbonImmutable::parse('2026-10-14T10:00:00Z'));
        config(['campaign.pilot_only' => false, 'campaign.enabled' => true, 'campaign.season' => '2026', 'election.date' => '2026-10-27']);
        $user = User::factory()->create();
        $league = League::create(['name' => 'Race tests', 'owner_id' => $user->id, 'invite_code' => str_repeat('r', 40), 'locks_at' => now()->addDay()]);
        $league->users()->attach($user);
        $common = ['user' => $user->id, 'league' => $league->id, 'now' => now()->toIso8601String()];
        $this->assertSame([200, 200], $this->race([[...$common, 'op' => 'wallet'], [...$common, 'op' => 'wallet']]));
        $this->assertDatabaseCount('campaign_wallets', 1);
        $this->assertDatabaseCount('campaign_entries', 1);
        $market = app(Game::class)->publish($league, $user, ['type' => 'mention_count', 'title' => 'Race market', 'closes_at' => '2026-10-15T10:00:00Z', 'window_ends_at' => '2026-10-16T10:00:00Z', 'probability' => 4000, 'tag' => 'operator_edited', 'rationale' => 'Test', 'contract' => ['source_url' => 'https://example.org/video', 'comparison' => 'gte', 'threshold' => 3, 'window_starts_at' => now()->toIso8601String()]]);
        $common['market'] = $market['id'];
        $bet = ['side' => 'yes', 'stake' => 600000, 'quote_id' => $market['quote']['id'], 'request_key' => 'race-one'];
        $this->assertSame([200, 422], $this->race([[...$common, 'op' => 'bet', 'data' => $bet], [...$common, 'op' => 'bet', 'data' => [...$bet, 'request_key' => 'race-two']]]));
        $this->assertDatabaseCount('campaign_bets', 1);
        $this->assertSame(400000, (int) DB::table('campaign_wallets')->value('available'));
        $this->travelTo(CarbonImmutable::parse('2026-10-15T11:00:00Z'));
        $common['now'] = now()->toIso8601String();
        $preview = app(Settlement::class)->preview($league, $market['id'], ['observed' => 3, 'source_url' => 'https://example.org/video', 'observed_at' => now()->toIso8601String(), 'note' => '00:01, 00:02, 00:03']);
        $this->assertSame([200, 409], $this->race([[...$common, 'op' => 'settle', 'token' => $preview['token']], [...$common, 'op' => 'void']]));
        $action = DB::table('campaign_markets')->value('action');
        $retry = [...$common, 'op' => $action, 'token' => $preview['token']];
        $this->assertSame([200, 200], $this->race([$retry, $retry]));
        $balance = (int) DB::table('campaign_wallets')->value('available');
        $this->assertSame($action === 'void' ? 1000000 : 1900000, $balance);
        $this->assertSame($balance, (int) DB::table('campaign_entries')->sum('amount'));
        $this->assertSame(1, DB::table('campaign_entries')->where('operation_key', 'like', 'terminal:%')->count());
        $this->assertDatabaseCount('campaign_resolutions', 1);
    }

    private function race(array $requests): array
    {
        $connection = config('database.connections.mysql');
        $env = ['APP_ENV' => 'testing', 'APP_KEY' => config('app.key'), 'DB_CONNECTION' => 'mysql', 'DB_URL' => '', 'DB_DATABASE' => $connection['database'], 'DB_USERNAME' => $connection['username'], 'DB_PASSWORD' => $connection['password'] ?? '', 'DB_HOST' => $connection['host'], 'DB_PORT' => (string) $connection['port'], 'DB_SOCKET' => $connection['unix_socket'], 'CACHE_STORE' => 'array', 'QUEUE_CONNECTION' => 'sync'];
        $start = microtime(true) + 0.5;
        $processes = array_map(function ($r) use ($start, $env) {
            $p = new Process([PHP_BINARY, base_path('tests/support/campaign-worker.php'), base64_encode(json_encode([...$r, 'start' => $start]))], base_path(), $env);
            $p->setTimeout(20);
            $p->start();

            return $p;
        }, $requests);
        $statuses = array_map(function ($p) {
            $p->wait();
            $this->assertTrue($p->isSuccessful(), $p->getErrorOutput().$p->getOutput());

            return json_decode($p->getOutput(), true)['status'];
        }, $processes);
        sort($statuses);

        return $statuses;
    }
}

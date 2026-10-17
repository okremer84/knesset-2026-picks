<?php

use App\Models\League;
use App\Models\User;
use App\Services\Campaign\Game;
use App\Services\Campaign\Settlement;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
$input = json_decode(base64_decode($argv[1]), true);
config(['campaign.pilot_only' => false, 'campaign.enabled' => true, 'campaign.season' => '2026', 'queue.default' => 'sync']);
CarbonImmutable::setTestNow($input['now']);
Carbon::setTestNow($input['now']);
$user = User::findOrFail($input['user']);
$league = League::findOrFail($input['league']);
while (microtime(true) < $input['start']) {
    usleep(1000);
}
try {
    $game = app(Game::class);
    $settlement = app(Settlement::class);
    match ($input['op']) {
        'wallet' => $game->wallet($user),
        'bet' => $game->bet($league, $input['market'], $user, $input['data']),
        'settle' => $settlement->confirm($league, $input['market'], $user, $input['token']),
        'void' => $settlement->void($league, $input['market'], $user, 'Race test void'),
    };
    echo json_encode(['status' => 200]);
} catch (HttpExceptionInterface $e) {
    echo json_encode(['status' => $e->getStatusCode()]);
} catch (Throwable $e) {
    fwrite(STDERR, get_class($e).': '.$e->getMessage());
    exit(1);
}

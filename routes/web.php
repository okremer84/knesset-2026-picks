<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\CampaignController;
use App\Http\Controllers\CampaignMonitoringController;
use App\Http\Controllers\CoffeeController;
use App\Http\Controllers\LeagueController;
use App\Http\Controllers\ProfileController;
use App\Models\Survey;
use App\Services\ElectionResults;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

Route::prefix('api')->group(function () {
    Route::get('election', fn () => ['deadlineLimit' => LeagueController::deadlineLimit()]);
    Route::get('csrf', fn () => ['token' => csrf_token()]);
    Route::get('results', fn () => app(ElectionResults::class)->feed());
    Route::get('surveys', fn () => ['surveys' => Survey::where('active', true)->get()->pluck('payload')->sortByDesc('date')->values(), 'sync' => DB::table('poll_imports')->latest('id')->first(['status', 'updated_at'])]);
    Route::get('auth/config', [AuthController::class, 'config']);
    Route::middleware('auth')->group(function () {
        Route::get('auth/user', fn (Request $r) => ['user' => $r->user()]);
        Route::post('auth/profile', [ProfileController::class, 'update'])->middleware('throttle:10,1');
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::get('coffee', [CoffeeController::class, 'index']);
        Route::post('coffee', [CoffeeController::class, 'create'])->middleware('throttle:10,1');
        Route::post('coffee/{bet}', [CoffeeController::class, 'act'])->middleware('throttle:30,1');
        Route::get('my-picks', [LeagueController::class, 'myPicks']);
        Route::post('my-pick', [LeagueController::class, 'savePick'])->middleware('throttle:30,1');
        Route::get('leagues', [LeagueController::class, 'index']);
        Route::post('leagues', [LeagueController::class, 'create'])->middleware('throttle:10,1');
        Route::post('leagues/join', [LeagueController::class, 'join'])->middleware('throttle:10,1');
        Route::get('leagues/{league}', [LeagueController::class, 'show']);
        Route::get('leagues/{league}/campaign', [CampaignController::class, 'index']);
        Route::get('campaign/config', [CampaignController::class, 'configuration']);
        Route::post('campaign/join', [CampaignController::class, 'join'])->middleware('throttle:10,1');
        Route::post('leagues/{league}/campaign/suggestions', [CampaignController::class, 'suggest'])->middleware('throttle:10,1');
        Route::post('leagues/{league}/campaign/proposals/{proposal}/decline', [CampaignController::class, 'decline']);
        Route::post('leagues/{league}/campaign/proposals/generate', [CampaignController::class, 'generate'])->middleware('throttle:3,1');
        Route::get('leagues/{league}/campaign/markets/{market}/prefill', [CampaignController::class, 'prefill']);
        Route::post('leagues/{league}/campaign/import', [CampaignController::class, 'import'])->middleware('throttle:10,1');
        Route::match(['get', 'post'], 'leagues/{league}/campaign/sources', [CampaignController::class, 'sources']);
        Route::get('leagues/{league}/campaign/monitoring', [CampaignMonitoringController::class, 'index'])->middleware('throttle:20,1');
        Route::post('leagues/{league}/campaign/monitoring/setup', [CampaignMonitoringController::class, 'setup'])->middleware('throttle:20,1');
        Route::post('leagues/{league}/campaign/monitoring/drafts', [CampaignMonitoringController::class, 'drafts'])->middleware('throttle:20,1');
        Route::post('leagues/{league}/campaign/monitoring/sources/{source}/collect', [CampaignMonitoringController::class, 'collect'])->middleware('throttle:20,1');
        Route::post('leagues/{league}/campaign/markets/{market}/monitor-preview', [CampaignMonitoringController::class, 'preview'])->middleware('throttle:20,1');
        Route::post('leagues/{league}/campaign/markets/{market}/monitor-dismiss', [CampaignMonitoringController::class, 'dismiss'])->middleware('throttle:20,1');
        Route::post('leagues/{league}/campaign/markets/{market}/preview', [CampaignController::class, 'preview']);
        Route::post('leagues/{league}/campaign/markets/{market}/settle', [CampaignController::class, 'settle']);
        Route::post('leagues/{league}/campaign/markets/{market}/void', [CampaignController::class, 'void']);
        Route::post('leagues/{league}/campaign/markets', [CampaignController::class, 'publish'])->middleware('throttle:20,1');
        Route::post('leagues/{league}/campaign/markets/{market}/quote', [CampaignController::class, 'quote'])->middleware('throttle:20,1');
        Route::post('leagues/{league}/campaign/markets/{market}/bets', [CampaignController::class, 'bet'])->middleware('throttle:60,1');
        Route::post('leagues/{league}/predict', [LeagueController::class, 'predict'])->middleware('throttle:30,1');
    });
});
Route::middleware('throttle:10,1')->group(function () {
    Route::get('/auth/google', [AuthController::class, 'redirect'])->name('login');
    Route::get('/auth/google/callback', [AuthController::class, 'callback']);
});
Route::get('/', fn () => view('app'));

<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\LeagueController;
use App\Models\Survey;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

Route::prefix('api')->group(function () {
    Route::get('csrf', fn () => ['token' => csrf_token()]);
    Route::get('surveys', fn () => ['surveys' => Survey::where('active', true)->get()->pluck('payload')->sortByDesc('date')->values(), 'sync' => DB::table('poll_imports')->latest('id')->first(['status', 'updated_at'])]);
    Route::middleware('throttle:10,1')->group(function () {
        Route::post('auth/register', [AuthController::class, 'register']);
        Route::post('auth/login', [AuthController::class, 'login'])->name('login');
        Route::post('auth/forgot-password', [AuthController::class, 'forgot']);
        Route::post('auth/reset-password', [AuthController::class, 'reset']);
    });
    Route::middleware('auth')->group(function () {
        Route::get('auth/user', fn (Request $r) => ['user' => $r->user()]);
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::get('leagues', [LeagueController::class, 'index']);
        Route::post('leagues', [LeagueController::class, 'create'])->middleware('throttle:10,1');
        Route::post('leagues/join', [LeagueController::class, 'join'])->middleware('throttle:10,1');
        Route::get('leagues/{league}', [LeagueController::class, 'show']);
        Route::post('leagues/{league}/predict', [LeagueController::class, 'predict'])->middleware('throttle:30,1');
        Route::post('leagues/{league}/stage', [LeagueController::class, 'stage']);
    });
});
Route::get('/reset-password/{token}', fn () => view('app'))->name('password.reset');
Route::get('/', fn () => view('app'));

<?php

use App\Jobs\CollectCampaignChannel;
use App\Jobs\CollectCampaignMonitor;
use App\Jobs\ProposeCampaign;
use App\Models\League;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;

Schedule::command('polls:sync')->dailyAt('03:17')->timezone('Asia/Jerusalem')->withoutOverlapping(30)->onOneServer();

Schedule::command('polls:prune-snapshots')->dailyAt('03:05')->timezone('Asia/Jerusalem')->withoutOverlapping(30)->onOneServer();

Schedule::call(function () {
    if (! config('campaign.enabled')) {
        return;
    }
    $operators = config('campaign.pilot_only')
        ? User::whereNotNull('google_id')->whereNotNull('email_verified_at')->whereIn('email', array_keys(array_filter(config('campaign.pilot_accounts'), fn ($role) => $role === 'admin')))->pluck('id')->all()
        : config('campaign.operator_ids');
    foreach (League::whereHas('users', fn ($q) => $q->whereIn('users.id', $operators))->cursor() as $league) {
        ProposeCampaign::dispatch($league->id);
    }
})->name('campaign-proposals')->dailyAt('08:00')->timezone('Asia/Jerusalem')->withoutOverlapping()->onOneServer();

Schedule::call(function () {
    if (! config('campaign.enabled')) {
        return;
    }
    foreach (DB::table('campaign_sources')->whereIn('kind', ['youtube', 'telegram'])->pluck('id') as $id) {
        CollectCampaignChannel::dispatch($id);
    }
})->name('campaign-channels')->everyFifteenMinutes()->withoutOverlapping()->onOneServer();

Schedule::call(function () {
    if (! config('campaign.enabled')) {
        return;
    }
    foreach (DB::table('campaign_sources')->whereIn('kind', ['x', 'news'])->pluck('id') as $id) {
        CollectCampaignMonitor::dispatch($id);
    }
})->name('campaign-monitoring')->everyFiveMinutes()->withoutOverlapping()->onOneServer();

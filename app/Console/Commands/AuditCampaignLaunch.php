<?php

namespace App\Console\Commands;

use App\Services\Campaign\OpeningSlate;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class AuditCampaignLaunch extends Command
{
    protected $signature = 'campaign:launch-audit';

    protected $description = 'Read-only monitoring, queue and settlement coverage report without credentials or personal data';

    public function handle(): int
    {
        $sources = DB::table('campaign_sources')->where('league_id', OpeningSlate::LEAGUE_ID)->whereIn('kind', ['x', 'news'])->get()->map(fn ($s) => [
            'name' => $s->name, 'kind' => $s->kind,
            'recent_runs' => DB::table('campaign_monitor_runs')->where('source_id', $s->id)->latest('id')->limit(3)->get(['status', 'started_at', 'finished_at', 'items']),
            'observations' => DB::table('campaign_observations')->where('source_id', $s->id)->count(),
        ]);
        $markets = DB::table('campaign_markets')->where('league_id', OpeningSlate::LEAGUE_ID)->whereNull('archived_at')->whereNotIn('state', ['resolved', 'void'])->get()->map(function ($m) {
            $c = json_decode($m->contract, true);

            return ['title' => $m->title, 'type' => $m->type, 'mode' => $c['monitor']['mode'] ?? 'operator_review', 'publisher' => $c['publisher'] ?? null, 'source_url' => $c['source_url'], 'starts_at' => $c['window_starts_at'], 'ends_at' => $m->window_ends_at];
        });
        $this->line(json_encode([
            'checked_at_utc' => now()->utc()->toIso8601String(),
            'sources' => $sources,
            'coverage_counts' => $markets->countBy('mode'),
            'questions' => $markets,
            'poll_imports' => DB::table('poll_imports')->latest('id')->limit(3)->get(['status', 'count', 'created_at', 'updated_at']),
            'queued_jobs' => DB::table('jobs')->count(),
            'failed_jobs' => DB::table('failed_jobs')->count(),
            'archived_qa' => DB::table('campaign_markets')->where('league_id', OpeningSlate::LEAGUE_ID)->whereNotNull('archived_at')->count(),
            'settlement' => 'Operator approval required; collection does not automatically settle markets',
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

        return self::SUCCESS;
    }
}

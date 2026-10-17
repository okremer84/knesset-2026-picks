<?php

namespace App\Console\Commands;

use App\Services\Campaign\SlackReview;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class CampaignSlack extends Command
{
    protected $signature = 'campaign:slack {--send : Refresh notices and deliver at most one} {--check : Verify the configured bot workspace without posting} {--retry= : Requeue a notice after fixing delivery} {--confirmed-not-delivered : Confirm an uncertain notice was checked in Slack and was not delivered}';

    protected $description = 'Inspect or deliver Slack review links; approvals remain in Eisenmarkt';

    public function handle(SlackReview $slack): int
    {
        $this->line('Slack mode: review links only; interactive approvals are not connected.');
        if (! $slack->configured()) {
            $this->line('Disabled or incomplete configuration. No Slack request sent.');

            return $this->option('check') ? self::FAILURE : self::SUCCESS;
        }
        $destination = config('campaign_slack.team_id').':'.config('campaign_slack.channel_id');
        if ($id = $this->option('retry')) {
            $notice = DB::table('campaign_slack_notices')->where('destination', $destination)->where('id', $id)->first();
            if (! $notice || ! in_array($notice->status, ['blocked', 'uncertain', 'sending']) || ($notice->status !== 'blocked' && ! $this->option('confirmed-not-delivered'))) {
                $this->error('Retry requires a blocked notice, or an uncertain/sending notice with --confirmed-not-delivered after Slack reconciliation.');

                return self::FAILURE;
            }
            if ($notice->status === 'sending' && now()->subMinutes(3)->lt($notice->updated_at)) {
                $this->error('Delivery may still be running. Wait at least three minutes before reconciliation.');

                return self::FAILURE;
            }
            DB::table('campaign_slack_notices')->where('id', $notice->id)->where('status', $notice->status)->update(['status' => 'pending', 'available_at' => now(), 'error_code' => null, 'updated_at' => now()]);
            $this->line('Requeued for the next scheduled delivery; no message posted by this command.');

            return self::SUCCESS;
        }
        if ($this->option('check')) {
            $ok = $slack->verifyWorkspace();
            $this->line($ok ? 'Bot workspace verified. Channel membership/delivery not tested.' : 'Workspace verification failed; no message posted.');

            return $ok ? self::SUCCESS : self::FAILURE;
        }
        if ($this->option('send')) {
            $state = $slack->tick();
            $this->line('Delivery: '.$state);

            return in_array($state, ['workspace_verification_failed', 'league_missing', 'blocked', 'uncertain']) ? self::FAILURE : self::SUCCESS;
        }
        foreach (DB::table('campaign_slack_notices')->where('destination', $destination)->selectRaw('status, count(*) as total')->groupBy('status')->get() as $row) {
            $this->line($row->status.': '.$row->total);
        }
        foreach (DB::table('campaign_slack_notices')->where('destination', $destination)->whereIn('status', ['blocked', 'uncertain', 'sending'])->get(['id', 'subject', 'status', 'error_code']) as $notice) {
            $this->line($notice->id.' '.$notice->subject.' '.$notice->status.' '.$notice->error_code);
        }
        $this->line('Read-only local status. Use --check for workspace verification, --send to deliver.');

        return self::SUCCESS;
    }
}

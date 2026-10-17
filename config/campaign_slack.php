<?php

return [
    'enabled' => (bool) env('CAMPAIGN_SLACK_ENABLED', false),
    'token' => env('CAMPAIGN_SLACK_BOT_TOKEN'),
    'team_id' => env('CAMPAIGN_SLACK_TEAM_ID'),
    'channel_id' => env('CAMPAIGN_SLACK_CHANNEL_ID'),
    'league_id' => env('CAMPAIGN_SLACK_LEAGUE_ID'),
];

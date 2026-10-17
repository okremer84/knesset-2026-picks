<?php

return [
    'enabled' => (bool) env('CAMPAIGN_ENABLED', true),
    // One shared market; only the named administrator may operate it.
    'public_access' => true,
    'pilot_only' => true,
    'pilot_accounts' => ['okremer84@gmail.com' => 'admin', 'omer@trytrackit.com' => 'bettor'],
    'season' => env('CAMPAIGN_SEASON', '2026'),
    'operator_ids' => array_values(array_filter(array_map('intval', explode(',', env('CAMPAIGN_OPERATOR_IDS', ''))))),
    'model' => env('CAMPAIGN_AI_MODEL', 'gpt-4.1-mini'),
    'api_key' => env('CAMPAIGN_AI_API_KEY'),
    'proposal_limit' => 8,
    'youtube_key' => env('CAMPAIGN_YOUTUBE_KEY'),
    'x_slate_approved' => (bool) env('CAMPAIGN_X_SLATE_APPROVED', false),
    'news_slate_approved' => (bool) env('CAMPAIGN_NEWS_SLATE_APPROVED', false),
    'x_bearer_token' => env('CAMPAIGN_X_BEARER_TOKEN'),
];

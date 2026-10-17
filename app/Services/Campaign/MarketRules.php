<?php

namespace App\Services\Campaign;

use App\Http\Controllers\LeagueController;
use Illuminate\Validation\Rule;

class MarketRules
{
    public static function publish(): array
    {
        return [
            'type' => ['required', Rule::in(['poll_value', 'poll_movement', 'channel_activity', 'mention_count', 'statement', 'deadline_event'])],
            'title' => 'required|string|max:300', 'closes_at' => 'required|date|after:now|before_or_equal:'.LeagueController::deadlineLimit(), 'window_ends_at' => 'required|date|after_or_equal:closes_at',
            'probability' => 'required|integer|between:500,9500', 'ai_probability' => 'nullable|integer|between:500,9500', 'tag' => ['required', Rule::in(['evidence_based', 'no_basis', 'operator_edited'])], 'rationale' => 'required|string|max:2000',
            'group_key' => 'nullable|string|max:120', 'proposal_id' => 'nullable|uuid', 'evidence' => 'sometimes|array|max:20',
            'contract.monitor' => 'sometimes|array',
            'contract.monitor.mode' => 'required_with:contract.monitor|in:x_count,x_next_mention,news_reporting',
            'contract.monitor.source_ids' => 'required_with:contract.monitor|array|min:1|max:7',
            'contract.monitor.source_ids.*' => 'required|integer|min:1|distinct',
            'contract.monitor.topic' => ['sometimes', Rule::in(array_keys(PostTopics::catalog()))],
            'contract.monitor.person' => 'sometimes|string|min:3|max:100',
            'contract.monitor.scope' => 'sometimes|in:rss_urich_headlines',
            'contract.presentation' => 'sometimes|array',
            'contract.presentation.family' => 'required_with:contract.presentation|in:prime_minister,interview',
            'contract.presentation.key' => 'required_with:contract.presentation|string|max:120',
            'contract.presentation.label' => 'required_with:contract.presentation|string|max:100',
            'contract.presentation.portrait' => 'nullable|in:likud,yashar,beyachad,israel_beitenu',
            'contract.subject' => 'nullable|string|max:200', 'contract.pollster' => 'nullable|string|max:200', 'contract.publisher' => 'nullable|string|max:200', 'contract.count_rules' => 'nullable|string|max:2000', 'contract.baseline' => 'nullable|integer|between:0,120', 'contract.source_id' => 'nullable|integer|min:1',
            'contract' => 'required|array', 'contract.source_url' => 'required|url:https|max:2000', 'contract.yes_rule' => 'required|string|max:2000', 'contract.no_rule' => 'required|string|max:2000', 'contract.void_rule' => 'required|string|max:2000',
            'contract.comparison' => ['required', Rule::in(['gt', 'gte', 'lt', 'lte', 'eq', 'event'])], 'contract.threshold' => 'required|numeric|between:-100000,100000', 'contract.window_starts_at' => 'required|date|before_or_equal:window_ends_at',
        ];
    }
}

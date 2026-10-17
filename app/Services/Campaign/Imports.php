<?php

namespace App\Services\Campaign;

use App\Models\League;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class Imports
{
    public function import(League $league, string $provider, string $id): array
    {
        abort_unless(preg_match('/^[a-zA-Z0-9_-]{1,150}$/', $id), 422, 'נדרש מזהה שוק תקין');
        $request = Http::acceptJson()->withUserAgent('Mozilla/5.0 CampaignGame/1.0')->connectTimeout(5)->timeout(20)->withoutRedirecting();
        if ($provider === 'polymarket') {
            $r = $request->get('https://gamma-api.polymarket.com/markets/'.rawurlencode($id));
            abort_unless($r->successful(), 502, 'לא ניתן לטעון את השוק החיצוני');
            $m = $r->json();
            abort_unless(($m['active'] ?? false) && ! ($m['closed'] ?? true) && ($m['acceptingOrders'] ?? false), 422, 'השוק החיצוני כבר סגור או אינו פעיל');
            $outcomes = is_string($m['outcomes'] ?? null) ? json_decode($m['outcomes'], true) : ($m['outcomes'] ?? []);
            $prices = is_string($m['outcomePrices'] ?? null) ? json_decode($m['outcomePrices'], true) : ($m['outcomePrices'] ?? []);
            abort_unless(count($outcomes) === 2 && in_array('Yes', $outcomes) && in_array('No', $outcomes), 422, 'נדרש שוק כן/לא');
            $price = $prices[array_search('Yes', $outcomes)] ?? null;
            $title = $m['question'];
            $rules = $m['description'] ?? '';
            $deadline = $m['endDate'] ?? null;
            $url = 'https://polymarket.com/event/'.rawurlencode($m['slug']);
        } else {
            $r = $request->get('https://external-api.kalshi.com/trade-api/v2/markets/'.rawurlencode($id));
            abort_unless($r->successful(), 502, 'לא ניתן לטעון את השוק החיצוני');
            $m = $r->json('market');
            abort_unless(($m['status'] ?? '') === 'active' && empty($m['result']), 422, 'השוק החיצוני כבר סגור או אינו פעיל');
            $title = $m['title'];
            $rules = ($m['rules_primary'] ?? '')."\n".($m['rules_secondary'] ?? '');
            $deadline = $m['close_time'] ?? null;
            $price = $m['last_price_dollars'] ?? null;
            $url = 'https://kalshi.com/markets/'.strtolower($m['event_ticker'] ?? $id);
        }
        abort_if($deadline && CarbonImmutable::parse($deadline)->lte(now()), 422, 'מועד השוק כבר עבר');
        abort_if(preg_match('/(knesset seats|mandate total|vote share|legislative election winner|most seats)/i', $title), 422, 'תחזית תוצאות הבחירות אינה חלק ממשחק הצד');
        $payload = ['title' => $title, 'type' => 'deadline_event', 'source_url' => $url, 'external_provider' => $provider, 'external_id' => $id, 'external_rules' => $rules, 'external_deadline' => $deadline, 'external_probability' => is_numeric($price) ? (int) round($price * 10000) : null, 'external_price_label' => $provider === 'kalshi' ? 'last trade' : 'outcome price', 'observed_at' => now()->toIso8601String(), 'needs_review' => true, 'note' => 'יש לאשר סוג שאלה, מקור הכרעה ומועדים מקומיים. המחיר החיצוני אינו מחיר המשחק.'];
        $key = 'import:'.$league->id.':'.$provider.':'.$id;
        DB::table('campaign_proposals')->insertOrIgnore(['id' => (string) Str::uuid(), 'league_id' => $league->id, 'origin' => $provider, 'external_key' => $key, 'payload' => json_encode($payload), 'status' => 'pending', 'created_at' => now(), 'updated_at' => now()]);

        return ['ok' => true, 'proposal' => DB::table('campaign_proposals')->where('external_key', $key)->first()];
    }
}

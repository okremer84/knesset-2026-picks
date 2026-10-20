<?php

namespace App\Http\Controllers;

use App\Jobs\CollectCampaignChannel;
use App\Jobs\ProposeCampaign;
use App\Jobs\RepriceCampaign;
use App\Models\League;
use App\Services\Campaign\Evidence;
use App\Services\Campaign\Game;
use App\Services\Campaign\Imports;
use App\Services\Campaign\MarketRules;
use App\Services\Campaign\OpeningSlate;
use App\Services\Campaign\Settlement;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class CampaignController extends Controller
{
    public function index(League $league, Request $request, Game $game)
    {
        return $game->feed($league, $request->user());
    }

    private function access(League $league, Request $r, Game $game, bool $operator = false): void
    {
        $game->member($league, $r->user());
        abort_if($operator && ! $game->operator($r->user()), 403);
    }

    public function publish(League $league, Request $r, Game $game)
    {
        $this->access($league, $r, $game, true);
        $d = $r->validate(MarketRules::publish());
        if (! empty($d['contract']['source_id'])) {
            abort_unless(DB::table('campaign_sources')->where('league_id', $league->id)->where('id', $d['contract']['source_id'])->exists(), 422, 'מקור אינו שייך לליגה');
        }
        $event = in_array($d['type'], ['channel_activity', 'statement', 'deadline_event']);
        abort_if($event !== ($d['contract']['comparison'] === 'event'), 422, 'אירוע דורש כלל קרה/לא קרה, ומדד מספרי דורש השוואת סף');
        abort_if(! empty($d['group_key']) && ! in_array($d['contract']['comparison'], ['gt', 'gte', 'lt', 'lte']), 422, 'קבוצת ספים דורשת כלל השוואה סדרתי');
        if (in_array($d['type'], ['poll_value', 'poll_movement'])) {
            abort_if(empty($d['contract']['subject']) || empty($d['contract']['pollster']) || empty($d['contract']['publisher']), 422, 'יש לבחור מפלגה, מכון סקרים וגוף מפרסם');
            abort_if($d['type'] === 'poll_movement' && ! isset($d['contract']['baseline']), 422, 'נדרש ערך בסיס לשינוי בסקר');
        }
        abort_if($d['tag'] === 'no_basis' && $d['probability'] !== 5000 && ! isset($d['ai_probability']), 422, 'ללא בסיס מוצג ב־50% או כעריכת מפעיל');

        return response()->json(['market' => $game->publish($league, $r->user(), $d)], 201);
    }

    public function quote(League $league, string $market, Request $r, Game $game)
    {
        $this->access($league, $r, $game, true);
        $d = $r->validate(['probability' => 'required|integer|between:500,9500', 'rationale' => 'required|string|max:2000']);

        return ['market' => $game->quote($league, $market, $r->user(), $d)];
    }

    public function bet(League $league, string $market, Request $r, Game $game)
    {
        $this->access($league, $r, $game);
        $d = $r->validate(['side' => ['required', Rule::in(['yes', 'no'])], 'stake' => 'required|integer|between:100,100000000000', 'quote_id' => 'required|uuid', 'request_key' => 'required|string|max:100']);
        $result = $game->bet($league, $market, $r->user(), $d);

        return response()->json($result, $result['replayed'] ? 200 : 201);
    }

    public function preview(League $league, string $market, Request $r, Game $game, Settlement $settlement)
    {
        $this->access($league, $r, $game, true);
        abort_unless(config('campaign.processing_enabled'), 409, 'איסוף, בדיקת הימורים והכרעות מושהים');
        $d = $r->validate(['observed' => 'required|numeric|between:-100000,100000', 'source_url' => 'required|url:https|max:2000', 'observed_at' => 'required|date|before_or_equal:now', 'early_at' => 'nullable|date|before_or_equal:now', 'official_final_confirmed' => 'sometimes|boolean', 'note' => 'required|string|max:4000']);

        return $settlement->preview($league, $market, $d);
    }

    public function settle(League $league, string $market, Request $r, Game $game, Settlement $settlement)
    {
        $this->access($league, $r, $game, true);
        abort_unless(config('campaign.processing_enabled'), 409, 'איסוף, בדיקת הימורים והכרעות מושהים');
        $d = $r->validate(['token' => 'required|string|max:40000']);
        $settlement->confirm($league, $market, $r->user(), $d['token']);

        return ['ok' => true];
    }

    public function void(League $league, string $market, Request $r, Game $game, Settlement $settlement)
    {
        $this->access($league, $r, $game, true);
        abort_unless(config('campaign.processing_enabled'), 409, 'איסוף, בדיקת הימורים והכרעות מושהים');
        $d = $r->validate(['reason' => 'required|string|max:2000']);
        $settlement->void($league, $market, $r->user(), $d['reason']);

        return ['ok' => true];
    }

    public function configuration(Request $r, Game $game)
    {
        $enabled = (bool) config('campaign.enabled') && $game->allowed($r->user());
        if ($enabled && config('campaign.pilot_only')) {
            $pilot = app(OpeningSlate::class)->pilot($r->user());

            return ['enabled' => true, 'leagues' => [['id' => $pilot->id, 'name' => $pilot->name]], 'operator' => $game->operator($r->user())];
        }
        $leagues = $enabled ? League::where(function ($q) use ($r) {
            $q->whereHas('users', fn ($users) => $users->where('users.id', $r->user()->id))->orWhereIn('id', DB::table('campaign_members')->where('user_id', $r->user()->id)->pluck('league_id'));
        })->get(['id', 'name']) : [];

        return ['enabled' => $enabled, 'leagues' => $leagues, 'operator' => $game->operator($r->user())];
    }

    public function join(Request $r, Game $game)
    {
        abort_unless(config('campaign.enabled'), 404);
        abort_unless($game->allowed($r->user()), 403, 'יש להתחבר עם חשבון מאומת כדי להשתתף באייזנמארקט');
        $d = $r->validate(['code' => 'required|string|size:40']);
        $league = League::where('invite_code', $d['code'])->first();
        abort_unless($league, 404, 'קוד ההזמנה לא נמצא');
        DB::table('campaign_members')->insertOrIgnore(['league_id' => $league->id, 'user_id' => $r->user()->id, 'created_at' => now(), 'updated_at' => now()]);

        return ['league' => ['id' => $league->id, 'name' => $league->name]];
    }

    public function suggest(League $league, Request $r, Game $game)
    {
        $this->access($league, $r, $game);
        $d = $r->validate(['title' => 'required|string|max:300', 'note' => 'nullable|string|max:3000', 'source_url' => 'nullable|url:https|max:2000', 'deadline' => 'nullable|date', 'type' => ['nullable', Rule::in(['poll_value', 'poll_movement', 'channel_activity', 'mention_count', 'statement', 'deadline_event'])]]);
        $key = 'suggest:'.$league->id.':'.config('campaign.season').':'.hash('sha256', mb_strtolower(preg_replace('/\s+/u', ' ', trim($d['title']))));
        DB::transaction(function () use ($league, $r, $d, $key) {
            League::whereKey($league->id)->lockForUpdate()->firstOrFail();
            $existing = DB::table('campaign_proposals')->where('external_key', $key)->first();
            $payload = $existing ? json_decode($existing->payload, true) : $d;
            $submitters = collect($payload['submitters'] ?? [])->keyBy('id');
            $submitters->put($r->user()->id, ['id' => $r->user()->id, 'name' => $r->user()->name, 'note' => $d['note'] ?? null, 'source_url' => $d['source_url'] ?? null]);
            $payload['submitters'] = $submitters->values()->all();
            $payload['submitter_ids'] = $submitters->keys()->all();
            if ($existing) {
                DB::table('campaign_proposals')->where('id', $existing->id)->update(['payload' => json_encode($payload), 'updated_at' => now()]);
            } else {
                DB::table('campaign_proposals')->insert(['id' => (string) Str::uuid(), 'league_id' => $league->id, 'user_id' => $r->user()->id, 'origin' => 'member', 'external_key' => $key, 'payload' => json_encode($payload), 'status' => 'pending', 'created_at' => now(), 'updated_at' => now()]);
            }
        }, 3);

        return ['ok' => true];
    }

    public function decline(League $league, string $proposal, Request $r, Game $game)
    {
        $this->access($league, $r, $game, true);
        DB::table('campaign_proposals')->where('league_id', $league->id)->where('id', $proposal)->where('status', 'pending')->update(['status' => 'declined', 'updated_at' => now()]);

        return ['ok' => true];
    }

    public function import(League $league, Request $r, Game $game, Imports $imports)
    {
        $this->access($league, $r, $game, true);
        abort_unless(config('campaign.processing_enabled'), 409, 'איסוף, בדיקת הימורים והכרעות מושהים');
        $d = $r->validate(['provider' => ['required', Rule::in(['kalshi', 'polymarket'])], 'id' => 'required|string|max:150']);

        return $imports->import($league, $d['provider'], $d['id']);
    }

    public function generate(League $league, Request $r, Game $game)
    {
        $this->access($league, $r, $game, true);
        abort_unless(config('campaign.processing_enabled'), 409, 'איסוף, בדיקת הימורים והכרעות מושהים');
        abort_unless(config('campaign.api_key'), 503, 'נדרש מפתח AI בהגדרות השרת');
        ProposeCampaign::dispatch($league->id);

        return ['queued' => true];
    }

    public function prefill(League $league, string $market, Request $r, Game $game, Evidence $evidence)
    {
        $this->access($league, $r, $game, true);
        abort_unless(config('campaign.processing_enabled'), 409, 'איסוף, בדיקת הימורים והכרעות מושהים');

        return $evidence->prefill($league, $game->market($market, $league));
    }

    public function sources(League $league, Request $r, Game $game)
    {
        $this->access($league, $r, $game, true);
        if ($r->isMethod('post')) {
            $d = $r->validate(['id' => 'nullable|integer', 'kind' => ['required', Rule::in(['scheduled_event', 'evidence', 'youtube', 'telegram'])], 'name' => 'required|string|max:200', 'url' => 'required|url:https|max:2000', 'external_id' => 'nullable|string|max:200', 'payload' => 'required|array', 'payload.text' => 'nullable|string|max:12000', 'payload.scheduled_at' => 'nullable|date']);
            if ($d['kind'] === 'youtube') {
                abort_unless(preg_match('/^UC[A-Za-z0-9_-]{22}$/D', $d['external_id'] ?? ''), 422, 'נדרש מזהה ערוץ YouTube שמתחיל ב־UC');
            }
            if ($d['kind'] === 'telegram') {
                abort_unless(preg_match('/^[A-Za-z][A-Za-z0-9_]{4,31}$/D', $d['external_id'] ?? ''), 422, 'נדרש שם ערוץ Telegram ציבורי');
            }
            DB::transaction(function () use ($d, $league, $r, $game) {
                League::whereKey($league->id)->lockForUpdate()->firstOrFail();
                $old = ! empty($d['id']) ? DB::table('campaign_sources')->where('league_id', $league->id)->where('id', $d['id'])->first() : null;
                abort_if(! empty($d['id']) && ! $old, 404);
                $payload = $old ? json_decode($old->payload, true) : [];
                if ($old && ($old->kind !== $d['kind'] || $old->external_id !== ($d['external_id'] ?? null) || $old->url !== $d['url'])) {
                    abort_if(in_array($old->kind, ['x', 'news']) || DB::table('campaign_markets')->where('league_id', $league->id)->where('contract->source_id', $old->id)->exists(), 422, 'מקור שמשויך לחוזה שפורסם אינו ניתן להחלפה. יש ליצור מקור חדש');
                    $payload = [];
                }
                $row = ['kind' => $d['kind'], 'name' => $d['name'], 'url' => $d['url'], 'external_id' => $d['external_id'] ?? null, 'payload' => json_encode([...$payload, ...$d['payload']]), 'updated_at' => now()];
                if ($old) {
                    DB::table('campaign_sources')->where('id', $old->id)->update($row);
                    $id = $old->id;
                } else {
                    $id = DB::table('campaign_sources')->insertGetId([...$row, 'league_id' => $league->id, 'created_at' => now()]);
                }
                $game->event(null, $r->user()->id, 'source_saved', ['source_id' => $id, 'league_id' => $league->id]);
                if (config('campaign.processing_enabled')) {
                    RepriceCampaign::dispatch($league->id)->afterCommit();
                }
                if (config('campaign.processing_enabled') && in_array($d['kind'], ['youtube', 'telegram'])) {
                    CollectCampaignChannel::dispatch($id)->afterCommit();
                }
            }, 3);
        }

        return ['sources' => DB::table('campaign_sources')->where('league_id', $league->id)->get()->map(fn ($s) => [...(array) $s, 'payload' => json_decode($s->payload, true)])];
    }
}

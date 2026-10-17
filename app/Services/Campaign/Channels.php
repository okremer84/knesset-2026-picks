<?php

namespace App\Services\Campaign;

use App\Jobs\RepriceCampaign;
use App\Models\League;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class Channels
{
    public function collect(object $source): bool
    {
        $old = json_decode($source->payload, true);
        $items = $source->kind === 'youtube' ? $this->youtube($source->external_id) : $this->telegram($source->external_id);

        return DB::transaction(function () use ($source, $items) {
            // Serialize with operator evidence edits; do not replace an edited source with an earlier fetch.
            League::whereKey($source->league_id)->lockForUpdate()->firstOrFail();
            $current = DB::table('campaign_sources')->where('id', $source->id)->lockForUpdate()->first();
            if ($current->url !== $source->url || $current->external_id !== $source->external_id || $current->kind !== $source->kind) {
                return false;
            }
            $payload = json_decode($current->payload, true);
            $merged = collect($payload['items'] ?? [])->keyBy('id')->replace(collect($items)->keyBy('id'))->sortBy([['published_at', 'desc'], ['id', 'asc']])->take(2000)->values()->all();
            $changed = app(Evidence::class)->hash($merged) !== app(Evidence::class)->hash($payload['items'] ?? []);
            DB::table('campaign_sources')->where('id', $source->id)->update(['payload' => json_encode([...$payload, 'items' => $merged, 'checked_at' => now()->toIso8601String(), 'last_error' => null]), 'updated_at' => now()]);
            if ($changed) {
                RepriceCampaign::dispatch($source->league_id, ['channel_activity', 'mention_count', 'deadline_event'])->afterCommit();
            }

            return $changed;
        });
    }

    private function youtube(?string $channel): array
    {
        if (! preg_match('/^UC[A-Za-z0-9_-]{22}$/D', $channel ?? '')) {
            throw new \RuntimeException('A YouTube UC channel ID is required');
        }
        if (! config('campaign.youtube_key')) {
            throw new \RuntimeException('CAMPAIGN_YOUTUBE_KEY is required');
        }
        $http = fn () => Http::timeout(25)->withoutRedirecting()->acceptJson();
        $details = $http()->get('https://www.googleapis.com/youtube/v3/channels', ['part' => 'contentDetails', 'id' => $channel, 'key' => config('campaign.youtube_key')])->throw()->json();
        $playlist = $details['items'][0]['contentDetails']['relatedPlaylists']['uploads'] ?? null;
        if (! $playlist) {
            throw new \RuntimeException('Channel uploads not found');
        }
        $response = $http()->get('https://www.googleapis.com/youtube/v3/playlistItems', ['part' => 'snippet,contentDetails', 'playlistId' => $playlist, 'maxResults' => 50, 'key' => config('campaign.youtube_key')])->throw()->json();
        $items = [];
        foreach ($response['items'] ?? [] as $i) {
            $id = $i['contentDetails']['videoId'] ?? null;
            $date = $i['contentDetails']['videoPublishedAt'] ?? null;
            if (! $id || ! $date) {
                continue;
            }
            $items[] = ['id' => $id, 'title' => $i['snippet']['title'], 'url' => 'https://www.youtube.com/watch?v='.rawurlencode($id), 'published_at' => CarbonImmutable::parse($date)->toIso8601String()];
        }

        return $items;
    }

    private function telegram(?string $channel): array
    {
        if (! preg_match('/^[A-Za-z][A-Za-z0-9_]{4,31}$/D', $channel ?? '')) {
            throw new \RuntimeException('A public Telegram username is required');
        }
        $html = Http::timeout(25)->withoutRedirecting()->get('https://t.me/s/'.$channel)->throw()->body();
        $dom = new \DOMDocument;
        $previous = libxml_use_internal_errors(true);
        try {
            $dom->loadHTML('<?xml encoding="UTF-8">'.$html, LIBXML_NONET);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
        $xpath = new \DOMXPath($dom);
        $items = [];
        foreach ($xpath->query('//*[@data-post]') as $node) {
            $id = $node->getAttribute('data-post');
            if (! preg_match('/^'.preg_quote($channel, '/').'\/[0-9]+$/iD', $id)) {
                continue;
            }
            $time = $xpath->query('.//time[@datetime]', $node)->item(0)?->getAttribute('datetime');
            if (! $time) {
                continue;
            }
            $text = $xpath->query('.//*[contains(concat(" ", normalize-space(@class), " "), " tgme_widget_message_text ")]', $node)->item(0)?->textContent ?? 'פרסום בערוץ';
            $items[] = ['id' => $id, 'title' => mb_substr(trim($text), 0, 1500), 'url' => 'https://t.me/'.$id, 'published_at' => CarbonImmutable::parse($time)->toIso8601String()];
        }
        if (! $items) {
            throw new \RuntimeException('Public channel unavailable or feed format changed; retained previous items');
        }

        return $items;
    }
}

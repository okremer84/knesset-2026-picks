<?php

namespace App\Services\Campaign;

use Illuminate\Support\Facades\Http;

class MonitorFeeds
{
    public static function catalog(): array
    {
        return [
            'ynet' => ['name' => 'ynet — חדשות', 'url' => 'https://www.ynet.co.il/Integration/StoryRss2.xml', 'hosts' => ['www.ynet.co.il', 'ynet.co.il']],
            'n12' => ['name' => 'N12 — חדשות בארץ', 'url' => 'https://rcs.mako.co.il/rss/news-israel.xml', 'hosts' => ['www.mako.co.il', 'mako.co.il', 'mobile.mako.co.il', 'rcs.mako.co.il']],
            'globes' => ['name' => 'גלובס — חדשות', 'url' => 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=2', 'hosts' => ['www.globes.co.il', 'globes.co.il']],
        ];
    }

    public function fetch(string $url, array $hosts): string
    {
        for ($i = 0; $i < 4; $i++) {
            $parts = parse_url($url);
            if (($parts['scheme'] ?? '') !== 'https' || ! in_array(strtolower($parts['host'] ?? ''), $hosts, true) || isset($parts['user']) || isset($parts['pass']) || (isset($parts['port']) && $parts['port'] !== 443)) {
                throw new \RuntimeException('כתובת המקור אינה מורשית');
            }
            $response = Http::timeout(12)->connectTimeout(5)->withoutRedirecting()->withUserAgent('CampaignMonitoring/1.0')->get($url);
            if ($response->redirect()) {
                $next = $response->header('Location');
                $url = str_starts_with($next, '/') && ! str_starts_with($next, '//') ? 'https://'.$parts['host'].$next : $next;

                continue;
            }
            if (! $response->successful()) {
                throw new \RuntimeException('המקור החזיר HTTP '.$response->status());
            }
            $body = $response->body();
            if (strlen($body) > 4000000) {
                throw new \RuntimeException('התגובה גדולה מדי');
            }

            return $body;
        }
        throw new \RuntimeException('יותר מדי הפניות במקור');
    }

    public function xml(string $body): \SimpleXMLElement
    {
        if (preg_match('/<!DOCTYPE|<!ENTITY/i', $body)) {
            throw new \RuntimeException('מסמך RSS לא נתמך');
        }
        $previous = libxml_use_internal_errors(true);
        try {
            $xml = simplexml_load_string($body, \SimpleXMLElement::class, LIBXML_NONET);
            if (! $xml || ! isset($xml->channel)) {
                throw new \RuntimeException('המקור אינו הזנת RSS תקינה');
            }

            return $xml;
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
    }

    public function article(string $url, array $hosts): string
    {
        $html = $this->fetch($url, $hosts);
        $dom = new \DOMDocument;
        $previous = libxml_use_internal_errors(true);
        try {
            $dom->loadHTML('<?xml encoding="UTF-8">'.$html, LIBXML_NONET);
            $xpath = new \DOMXPath($dom);
            foreach ($xpath->query('//script[@type="application/ld+json"]') as $node) {
                $json = json_decode($node->textContent, true);
                if (is_array($json)) {
                    $body = $this->body($json);
                    if ($body && mb_strlen($body) >= 150) {
                        return $this->completeBody($this->plain($body));
                    }
                }
            }
            $paragraphs = [];
            foreach ($xpath->query('//article//p | //main//p') as $node) {
                $text = $this->plain($node->textContent);
                if (mb_strlen($text) > 30) {
                    $paragraphs[] = $text;
                }
            }
            $body = implode("\n", array_unique($paragraphs));
            if (mb_strlen($body) < 150) {
                throw new \RuntimeException('תוכן הכתבה אינו נגיש; אין לעקוף חומת תשלום');
            }

            return $this->completeBody($body);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
    }

    private function completeBody(string $body): string
    {
        if (mb_strlen($body) > 30000) {
            throw new \RuntimeException('כתבה ארוכה מדי לבדיקה מלאה');
        }

        return $body;
    }

    private function body(array $json): ?string
    {
        if (isset($json['articleBody']) && is_string($json['articleBody'])) {
            return $json['articleBody'];
        }
        foreach ($json as $value) {
            if (is_array($value) && ($body = $this->body($value))) {
                return $body;
            }
        }

        return null;
    }

    public function plain(string $text): string
    {
        return trim(preg_replace('/[\t ]+/u', ' ', html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5, 'UTF-8')));
    }
}

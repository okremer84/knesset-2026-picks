# Campaign monitoring and approval

## Current status

Implemented: public RSS collection, authenticated X API adapter, evidence archive, collection health, operator review cards, and server-verified settlement previews. No production deployment or continuous monitor has been activated by this change. X access is not available yet; X market publication is blocked until a real collection succeeds. Feed connectivity was checked on October 15, 2026: ynet 30 entries, N12 20, Globes 15; none matched the Urich headline/summary filter. That probe does not establish article-body extraction or historical coverage.

## Activate on the application server

1. Deploy this code and run `php artisan migrate --force`. Configure campaign access as described in [operations](campaign-operations.md).
2. Enable Laravel Cloud's scheduler, run a persistent worker (`php artisan queue:work --timeout=360 --tries=3`), and set `DB_QUEUE_RETRY_AFTER=420`. Use shared database/Redis cache for unique jobs and locks. Restart workers after deployment/config changes.
3. Run `php artisan campaign:check-feeds`. This command only reads the three public feeds; it does not create markets or start monitoring.
4. Open **ניהול → מעקב ואישור → הגדרת מקורות והתחלת איסוף**. It idempotently creates three news feeds and Netanyahu/Lapid X accounts. News collection works without any API key. X shows an explicit missing-access status.
5. Check the source cards after jobs complete. Scheduled collection runs every five minutes. Create drafts for a future window; review and publish them from the ideas inbox. Betting closes at or before the observation window starts. All bound sources must have a successful collection within the last 15 minutes before publication.
6. Review evidence in **מעקב ואישור**. Prepare the payout, then explicitly approve it. Preparation never pays money. Changed evidence invalidates the prepared approval; refresh and review again. Use the explicit void/refund action if the evidence cannot resolve the contract.

For X later: obtain an X developer account with access to user timelines and a suitable read quota. Set `CAMPAIGN_X_BEARER_TOKEN` as a server secret, refresh config/restart workers, and collect once. Never place the token in frontend code or chat. This implementation was tested with simulated API responses; live X access has not been verified.

## What is monitored

- ynet: `https://www.ynet.co.il/Integration/StoryRss2.xml`
- N12 domestic news: `https://rcs.mako.co.il/rss/news-israel.xml`
- Globes: `https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=2`
- X: the configured account's original posts, including quote posts; replies and bare reposts are excluded. Pagination must complete. Long-form text is used when present. Canonical edit IDs deduplicate posts, and the original captured text/time/link are retained.

News discovery only includes feed entries with `אוריך` in the title or RSS description. It is **not** a site-wide search. Contracts and cards say this explicitly. Every discovered article is available for review for each person, even when their full name is absent from the extracted text. This avoids silently missing aliases. Only public readable bodies are collected; inaccessible articles remain unresolved candidates, and redirects cannot leave the source host allowlist.

News outcomes concern new public reporting that attributes a direct conversation to the named people on a matter of public interest. An operator must confirm directness and novelty. The archive shows earlier collected articles for comparison; it is not a comprehensive historical archive. Exact body duplicates cannot be approved as new. Do not approve novelty solely because the local baseline is empty. If prior-publication checks are inconclusive, leave unresolved or void. This workflow does not establish authenticity, wrongdoing or guilt and does not access leaked chat repositories.

For X topics, matches use explicit Hebrew/English words and Hebrew prefixes; URLs are excluded. No image OCR, audio transcription or linked-page text is inferred. A missing original edit version prevents resolution. No qualifying next post before the deadline recommends a refund.

## Coverage and failure behavior

A negative outcome requires a successful baseline run before the window, no failed run or gap longer than 15 minutes, and a successful run at least 15 seconds after the window ends. These checks attest to collector continuity, not completeness of the publisher's feed. Items can disappear between checks; the contracts refer to collected items in the named feeds/accounts.

A positive news report may be approved despite a coverage gap because it has direct evidence. A negative cannot. Inaccessible candidate bodies cannot be dismissed or treated as absent evidence. A corrected body invalidates its earlier dismissal. An operator's dismissal stores the reason, actor, timestamp and body hash.

Failures preserve the archive and appear on source cards. Collection jobs record expected errors themselves, so inspect source health, not only `queue:failed`. Worker crashes may appear only as stale health/coverage gaps. There are no email/push notifications in this version: the approval inbox is in the app, with an explicit refresh button.

Observation storage currently has no automatic retention pruning. Retain it through market resolution and review before adding deletion; immutable original evidence is important to payouts. A broader publisher list, a historical baseline import and automatic semantic novelty analysis are not implemented.

## Verification

`php artisan test --filter=CampaignMonitoringTest` covers API authorization, idempotent setup, missing X access, archive preservation, edit identity, pagination, RSS/article parsing, redirect restrictions, coverage gaps, unreadable bodies, manual-bypass prevention, and stale/duplicate settlement confirmation. Frontend tests verify that payment requires a separate action and refreshing changed evidence clears its approval.

## Private pilot activation

In Laravel Cloud, open the production environment → Environment variables and set `CAMPAIGN_X_BEARER_TOKEN` to the app-only Bearer token. Do not use the API key/client secret in its place. Apply changes and redeploy/restart workers. Keep `CAMPAIGN_X_SLATE_APPROVED=false` and `CAMPAIGN_NEWS_SLATE_APPROVED=false` initially. The admin can set up the sources and collect once using the monitoring screen. Verify stable account IDs for Netanyahu/Lapid, complete pagination, original text/edit history, timestamps, reply/repost exclusion and keyword matches against public posts. The token needs user timeline read access and available quota. Collection reads up to two days per run, bounded to ten pages per account; consider quota before enabling the scheduler. No live X request has yet been validated with the pilot credential.

Review a complete history sample, replace provisional catalog probabilities and rationale, and verify the window is still future before setting the X approval flag. For news, separately review the prior-publication baseline and odds for the exact three-feed scope before approving. Flags alone do not establish sound odds; 50% placeholders are not researched forecasts. Fixed October 18 windows never roll forward automatically. If setup misses the cutoff, create a new explicitly reviewed future slate.

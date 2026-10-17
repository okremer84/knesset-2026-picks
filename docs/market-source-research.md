# Campaign market import research

Verified October 14, 2026 (America/Denver), using official documentation, public market pages, and unauthenticated API GET requests. Market status and prices are snapshots, not promises that a market remains open.

## Recommendation

The other likely reference is **Polymarket**. Both platforms have Israeli election markets and examples of the campaign side bets we want. Import selected questions into the **operator proposal queue**, with source attribution and an immutable source snapshot. The operator must approve the local question, deadlines, evidence source, and void rules before publication. Our LLM sets local quotes; an external price is contextual evidence, not an executable local quote. Two fresh proposal-only evidence records are saved in [`data/campaign-source-examples.json`](../data/campaign-source-examples.json), with original rules, status, dates, and explicitly external price observations.

Do not seed the board with final party seat totals, vote share, election winners, or long government-formation markets. The strongest currently verified campaign candidate is a Netanyahu withdrawal announcement. Endorsement markets are another useful starting point, though their existing deadlines need review against our election cutoff. I did not verify a currently open Israeli ad-count, poll-release, or upcoming speech-mention market in the bounded searches below; those should be authored locally or discovered later.

## Verified candidates and exclusions

| Source | Question / identifier | Verified state | Import decision |
| --- | --- | --- | --- |
| [Polymarket: withdrawal](https://polymarket.com/event/netanyahu-drops-out-before-election) | Event `1124809`, market `5237293`, slug `netanyahu-drops-out-before-election` | `active: true`, `closed: false`, `acceptingOrders: true`. Rules require a definitive announcement by **October 26, 2026, 23:59 Jerusalem time**. | Good proposal candidate. Source is an official Netanyahu announcement, with credible reporting as fallback. |
| [Kalshi: endorsement API](https://external-api.kalshi.com/trade-api/v2/markets/KXDJTENDORSENETANYAHU-26JUN30-OCT28) | `KXDJTENDORSENETANYAHU-26JUN30-OCT28` | `status: active`; public endorsement before October 28. API `close_time: 2026-10-28T14:00:00Z`; `can_close_early: true`. | Useful proposal, but the external deadline extends beyond election day. A shorter local version is a different contract and needs its own pricing. |
| [Polymarket: scheduled election](https://polymarket.com/event/will-israel-election-happen-as-scheduled-20260720204824362) | Event `727086`, market `3008329` | Active, not closed, accepting orders; nationwide voting on October 27 is the condition. | Optional campaign logistics proposal, not a daily bet. |
| [Kalshi: Netanyahu mentions](https://kalshi.com/markets/kxnetanyahumention) | Series `KXNETANYAHUMENTION`; events `26SEP24` (UNGA) and `26SEP30` (Hannity) | All **36** returned contracts were `finalized`; `status=open` returned no markets. | Historical rule examples only. Do not import as open bets. |
| [Polymarket: UNGA mentions](https://polymarket.com/event/what-will-netanyahu-say-during-the-united-nations-general-assembly) | Event `1040086`; example Iran/Lebanon count market `4661126` | Event closed; all 19 contracts closed and no longer accepting orders. | Excellent precedent for the requested format, already resolved. |
| [Kalshi: election winner](https://kalshi.com/markets/kxisraelknesset/israeli-knesset-election/kxisraelknesset-26) | Event `KXISRAELKNESSET-26`, including `-LIK` and `-YAS` | Six active markets. Long-stop close in October 2027 despite an expected October 2026 outcome. | Exclude from initial side-bet imports. |
| [Polymarket: prime minister](https://polymarket.com/event/who-will-be-the-next-prime-minister-of-israel-after-the-next-election) | Event `81557`; Netanyahu market `682705` | Active, not closed, accepting orders. Rules allow government formation through December 2027. | Defer: long resolution window and overlaps the main election experience. |

Search pages were materially stale: both UNGA pages appeared to offer live prices in search results, while fresh APIs confirmed resolution. Polymarket's `active: true` also remains set on resolved markets. Always inspect market-level closed/accepting flags and dates, not just the event or search result.

## Kalshi adapter

Verified unauthenticated endpoints (both `external-api.kalshi.com` and `api.elections.kalshi.com` responded):

```text
GET https://external-api.kalshi.com/trade-api/v2/series
GET https://external-api.kalshi.com/trade-api/v2/series/{series_ticker}
GET https://external-api.kalshi.com/trade-api/v2/markets?series_ticker=KXNETANYAHUMENTION&status=open&limit=100
GET https://external-api.kalshi.com/trade-api/v2/markets/{ticker}
```

List shape is `{ "markets": [...], "cursor": "..." }`; single lookup is `{ "market": {...} }`. Follow the cursor until empty. The query uses `status=open`, while current eligible objects report `status=active`. Store `ticker`, `event_ticker`, `title`, `yes_sub_title`, `rules_primary`, `rules_secondary`, `open_time`, `close_time`, `expected_expiration_time`, `expiration_time`, `can_close_early`, `result`, and source timestamps. Series metadata supplies `settlement_sources`, `contract_terms_url`, and `contract_url`. [List documentation](https://docs.kalshi.com/api-reference/market/get-markets), [market documentation](https://docs.kalshi.com/api-reference/market/get-market).

Prices are decimal dollar strings, including sub-cent precision: `yes_bid_dollars`, `yes_ask_dollars`, `no_bid_dollars`, `no_ask_dollars`, `last_price_dollars`. The endorsement snapshot had Yes bid `0.1600`, ask `0.3300`, last trade `0.2900`, and notional `1.0000`. These are distinct market observations; do not label all of them “the probability,” round to integer cents, or derive guaranteed local payouts from them. Preserve the spread and label the chosen reference measure.

The [endorsement series response](https://external-api.kalshi.com/trade-api/v2/series/KXDJTENDORSENETANYAHU) links [contract terms](https://assets.kalshi.com/contract_terms/ENDORSE.pdf). The [mentions series response](https://external-api.kalshi.com/trade-api/v2/series/KXNETANYAHUMENTION) links [mentions terms](https://assets.kalshi.com/contract_terms/MENTION.pdf). These URLs were verified in API metadata; the PDFs themselves were not reviewed in this research. Some settlement-source URLs are generic templates, so a local proposal still needs a specific usable evidence source.

## Polymarket adapter

Verified unauthenticated GETs with `Accept: application/json` and a normal browser User-Agent; initial requests without these headers returned HTTP 403:

```text
GET https://gamma-api.polymarket.com/public-search?q=Netanyahu&events_status=active&limit_per_type=50
GET https://gamma-api.polymarket.com/events/slug/netanyahu-drops-out-before-election
GET https://gamma-api.polymarket.com/markets/5237293
```

Search returns `{ "events": [...], "tags": [...], "profiles": [...], "pagination": { "hasMore": false, "totalResults": 32 } }`. The event lookup returns one object containing `markets`; single-market lookup returns one market object. Event status does not replace child-market checks. [Discovery documentation](https://docs.polymarket.com/market-data/discover-markets).

Observed withdrawal market shape, reduced to import fields:

```json
{
  "id": "5237293",
  "slug": "netanyahu-drops-out-before-election",
  "question": "Netanyahu drops out before election?",
  "active": true,
  "closed": false,
  "acceptingOrders": true,
  "endDate": "2026-10-27T03:59:00Z",
  "outcomes": "[\"Yes\", \"No\"]",
  "outcomePrices": "[\"0.016\", \"0.984\"]"
}
```

Also preserve `description` (resolution rules), `resolutionSource` (may be empty even when rules name a source), `conditionId`, event ID/slug, `updatedAt`, `bestBid`, `bestAsk`, `lastTradePrice`, and `umaResolutionStatus`. Parse the JSON strings `outcomes` and `outcomePrices` and match by label/index. Prices are fractions of a dollar, not percentages or payout multipliers. Store market ID as text. [Market details documentation](https://docs.polymarket.com/market-data/market-details).

**Do not automatically use `endDate` as the local cutoff.** In the withdrawal example it differs from the rule's Jerusalem deadline. Likewise, the prime-minister metadata suggests an October date while the rules allow much later resolution. The operator should resolve the discrepancy explicitly.

## Import behavior

1. Fetch only allowlisted provider API hosts; accept identifiers or recognized source URLs, not arbitrary remote fetches.
2. Deduplicate by `(provider, external_market_id)` and retain event IDs separately. Never collapse distinct child outcomes into one binary question.
3. Save provenance, fetch time, source status, rules, deadlines, and price snapshot as external evidence. Keep local approved terms separate so later refreshes cannot mutate a funded market.
4. Reject closed, settled, expired, unsupported, or non-binary markets from the open-bet path. Treat provider failures as failures, not an empty successful import.
5. Create proposals only. Require an operator-approved local close time before the outcome can become known, resolution deadline, evidence source, and cancellation rule; then run our pricing flow.
6. Retain a clear provider link on the proposal and any resulting market. Recheck external status before publication. External settlement can flag a review; it should not automatically settle our potentially adapted contract.

These are implementation recommendations, not additional settled product requirements. No account authentication, trading, publishing, or exhaustive inventory crawl was performed. Public read access was verified; redistribution licensing and production rate limits were not reviewed. No future monitoring was scheduled.

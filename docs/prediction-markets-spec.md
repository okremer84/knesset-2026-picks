# אייזנמארקט — Campaign side bets feature spec

Status: Draft, revision 6 · October 14, 2026

### UI amendment · October 15, 2026

Use a compact Kalshi-inspired buy ticket. Market probabilities are percentages; Yes and No buttons show prices in agorot per ₪1 winning unit, not payout multipliers. With probability `p`, Yes costs `100 × p` agorot and No costs `100 × (1 − p)` agorot. Preserve sub-agora quote precision rather than silently rounding the purchase price. The member enters a shekel spend; fractional units are supported by the existing locked-payout calculation, with the final payout rounded down to an agora. Winning units pay ₪1, losing units ₪0, and voids refund the original spend. No interest, fees, selling or cash-out is introduced.

The buy ticket shows the selected side, cent price, spend, available balance, selected-side probability, pricing basis, and possible total payout. Full contract rules, quote history/evidence and public positions remain available through a details link. Existing atomic debit, quote-version confirmation, retry keys and settlement arithmetic continue unchanged.

Add a **Trending / חם בליגה** panel and filter. Rank open, purchasable markets by distinct members with pending tickets accepted in the last 24 hours, then by their combined spend; stable market ID breaks ties. Exclude refunded, future-dated and older tickets, closed markets, and markets processing a terminal action. Show up to three markets in the panel, all ranked markets in the filter, and an honest empty state when there is no activity. Display each market's current Yes percentage and its change from the immediately preceding quote in percentage points (explicitly labeled as the last quote change, not a 24-hour price change). These activity counts never enter AI pricing.

A side game for the league during the campaign: short Yes/No questions about polls, ads, interviews, and campaign events, paid out daily or weekly in play money. Members start with ₪10,000, bet at AI-suggested odds, see each other's positions, hedge if they like, and roll winnings into the next question. The operator (Omer) curates the questions from a daily AI proposal list and member suggestions, settles them, and also plays. Everyone in the league knows this. The game is for friends and does not need to be perfectly fair; it needs to be fun, quick to run, and not break the money.

Final election seat predictions stay in the main prediction game. This feature never asks about final mandate totals.

## What this revision settles

- Questions are bounded to a fixed set of **types**, each tied to a data source. If there is no source, there is no question.
- A daily job has the LLM **propose** markets with odds; the operator edits anything, including the odds, and publishes. The LLM says **50/50 — no basis** when it has nothing to reason from, and the card shows that label.
- Repricing happens only when the underlying data changes (a poll commits, a feed shows a new item). Otherwise the last quote stays live. No freshness timers, no paused state.
- Settlement is operator-confirmed. Where a feed exists the system pre-fills the answer; where it doesn't, the operator enters the fact with a link.
- The operator bets like everyone else. Edits to AI odds are shown on the card as a matter of record, not as a restriction.
- Scope is not a constraint; correctness of money movement is.

## Question types

Every market has exactly one type. The type fixes the source, the pricing inputs, and how settlement works.

| Type | Example | Source | AI pricing | Settlement |
| --- | --- | --- | --- | --- |
| Poll value | Will Party X get ≥ 10 seats in the next Channel 12 / Pollster Y poll? | Poll store | Evidence-based: prior polls | Automatic when the importer commits that poll; operator confirms |
| Poll movement | Will Party X move up vs. its previous poll from the same pollster? | Poll store | Evidence-based | Automatic; operator confirms |
| Channel activity | Will Likud's official YouTube/Telegram post a new video before Friday 18:00? | Channel feed collector (API poll of a named channel) | Evidence-based: posting history | Automatic from feed timestamps; operator confirms |
| Mention count | Will the next qualifying Likud ad say "Iran" at least 3 times? | Channel feed for the asset; operator tally for the count | 50/50 unless prior ads are supplied | Operator enters the count with the asset link and a timestamped tally |
| Statement | Will Speaker X mention Topic Y in the named interview tonight? | Scheduled event entered by operator | 50/50 | Operator enters Yes/No with link and timestamp |
| Deadline event | Will Party X officially announce withdrawal by date/time? | Official party channel / CEC | 50/50 unless the model is given sourced statements | Yes on operator-verified announcement; No after the deadline |

Count questions are Yes/No thresholds; more thresholds are separate markets in one pricing group (higher threshold cannot have higher Yes probability). Exact-number and multi-choice markets are later.

Each market carries a short **contract** the operator sees before publishing: subject, event, source, Yes condition, No condition, betting cutoff, observation window, and void rule (no qualifying ad, no poll in window, evidence unavailable). For mention counts the contract lists accepted Hebrew spellings/prefixes and whether only audio counts (default: audio only, each repetition counts, subtitles don't). Published contracts are immutable; a wrong one is voided and republished.

## Daily proposals

A job runs each morning (Israel time) with the data it has: polls committed overnight, items from channel feeds, and a small operator-maintained list of scheduled events (debates, interviews, known poll days). The LLM proposes up to N markets with: type, filled-in contract, cutoff, suggested Yes probability in basis points, a confidence tag, and a one-line Hebrew rationale.

Confidence tags:

- **Evidence-based** — the model cites polls, history, or feed data and returns a number in 5%–95%.
- **No basis** — the model returns exactly 50% and says why it has nothing to go on.

The operator queue shows AI proposals and member suggestions together. For each the operator can edit any field including the probability, publish, decline, or leave it. Publishing stores the AI's original probability and the published one; if they differ the card shows "AI 40% → published 55%". The operator can publish a market from scratch without a proposal.

Member suggestions are free text plus an optional type, proposed source, and deadline. Duplicates merge in the queue with submitter names preserved. Suggesters see pending / declined / published.

## Pricing and repricing

The server supplies the model with the contract and a dated evidence snapshot for that type (prior polls, feed history, operator-supplied statements). Bets, balances, and member identities are never inputs. Output is validated: probability within 5%–95% or exactly 50% with the no-basis tag, a rationale, evidence references. Invalid output leaves a proposal unpublished or an open market on its last quote; it never produces a fake number.

A published market has a **current quote**. A new quote is generated only on a data-change event for that market's type: the poll importer commits a relevant poll; a channel collector sees a new item; the operator adds or edits evidence or a scheduled event. Identical inputs reuse the existing quote (no new version, no model call). There is no clock-based repricing and no expiry. Repricing stops at the cutoff. Thresholds in one pricing group are repriced and published together.

The operator may also overwrite the current quote manually; the change is logged and shown in the price history as an operator edit.

Each quote is a version. The card shows the current probability, its tag, its generation time, and a small price history with edit markers.

## Bets and payouts

One ₪10,000 grant per account for the season on first access; no top-ups; joins and refreshes cannot re-grant. Winnings and refunds are spendable immediately in other open markets.

For stake `s` and the bet's locked Yes probability `p`: Yes returns `s / p`, No returns `s / (1 - p)`, gross including stake. Store agorot; gross return is `floor(stake_agorot * 10000 / outcome_probability_bps)`, rounded down once and stored on the bet at acceptance. At 40% Yes, ₪100 Yes promises ₪250 (₪150 profit). The 5–95% bounds cap gross return at 20× stake; 50/50 markets pay 2×. The game is the counterparty; no fees.

A bet request carries side, stake (≥ ₪1.00, two decimals), the quote version the member saw, and a request key. The server requires: active league member, market open, server time strictly before cutoff, submitted quote version is current, balance sufficient. A stale version is rejected with the new quote and the UI asks to confirm again. Debit and bet creation are atomic; concurrent bets cannot overdraw; a retried key returns the original bet even after repricing or closure; a reused key with different details fails.

Multiple bets and both sides are allowed at any time. Each ticket keeps its own locked return. The hedge example stands: ₪100 Yes at 40% then ₪100 No when Yes is 60% returns ₪250 on either outcome (₪50 profit on ₪200), or ₪200 back if the market voids. Opposing bets do not free funds early. Bets cannot be edited, withdrawn, or sold.

**Positions are public** to the league from acceptance: member, market, side, stake, locked odds, promised return, time. Later joiners see history.

## Cutoffs and early outcomes

Each market has its own betting cutoff (required, no default) and an observation window; the cutoff is at or before the window's end, and never after the configured election-day cap (20:00 Asia/Jerusalem). Store UTC, show Israel time. Scheduled items (a named poll, an interview) should have cutoffs before the expected release; the proposal job suggests one.

If the answer becomes publicly known before the cutoff (early poll release, withdrawal announced), the operator closes the market and records the event timestamp with a link. Bets accepted after that timestamp are refunded individually and excluded from stats; earlier bets settle normally. This is a courtesy rule for friends, not a legal standard: the operator uses the obvious public timestamp and does not litigate it.

Bets at or after the cutoff are rejected even if the close job is late. Cutoffs cannot be extended; an earlier election date caps them.

## Settlement

The operator opens a market's settlement form. For feed-backed types the form is pre-filled from the source (the poll row, the feed item and timestamp) with a link. For operator-settled types the form asks for the observed value or Yes/No, a link, a timestamp, and for mention counts a short tally. Zero is explicit; blank means unresolved.

The server evaluates the contract, shows outcome, winning/losing tickets, any late-bet refunds, and total payout. The operator confirms. A retryable job credits each winning ticket's stored return once, marks losers lost, refunds late tickets once, and marks the market resolved. The result page shows the evidence link and tally to the league.

Markets in a pricing group settle from one observation together. Operator void with a visible reason refunds every ticket once. Void and settlement take the same lock; the first terminal action wins and the other is rejected. Post-settlement corrections are out of scope; winnings may already be spent, and the house eats the difference.

## Lifecycle

| State | Members | Transition |
| --- | --- | --- |
| Proposed | Not visible | Published by operator → Open; or declined |
| Open | Bet at current quote; see positions, price history | Cutoff or operator early close → Closed; operator void → Void |
| Closed | Await result | Operator confirms settlement → Resolved; void → Void |
| Resolved | See outcome, evidence, payouts | Terminal |
| Void | See reason, refunds | Terminal |

## League experience

Markets view for the league with sections: today, this week, closing soon, my bets, awaiting results, done. Cards: question, type badge, current probability with its tag (evidence-based / no basis / operator-edited), Yes/No return preview, cutoff, activity, my exposure. Detail: contract, evidence, price history, all positions, settlement record.

Leaderboard, separate from the prediction score: net profit (default), ROI (net profit ÷ settled stakes, ranked only with ≥ 3 distinct resolved markets), resolved-market count, outstanding stake. Voids and late refunds contribute nothing. No per-ticket hit rate (splitting and hedging make it meaningless).

Hebrew, RTL, mobile. Distinct states: price changed, insufficient funds, closed, awaiting result, resolved, refunded. Not color-only.

## Implementation notes

Laravel + React, Google identity, existing league, poll store. MySQL for the feature's integration and concurrency tests (prod is MySQL on Laravel Cloud).

- **Operator role**: the repo has console commands, not a web operator role. Add a server-side allowlist (account IDs) gating proposals review, publish, evidence entry, settlement, void. Commissioner status does not grant it.
- **Poll importer**: currently nightly batch commit. Emit a "polls changed" event (including corrections/removals) after commit; the pricing job and poll-type settlement pre-fill listen to it. If daytime polls matter, add a midday run; otherwise poll markets resolve the next morning, which is fine.
- **Channel collectors**: a small scheduled job per configured channel (YouTube Data API, Telegram public channel, X if feasible) that records new items with publication timestamps. These drive channel-activity settlement, mention-count asset selection, and repricing events.
- **Scheduled events**: a tiny operator-editable table (name, time, link) that the proposal job reads.
- **Side-game membership**: league joins currently close at the prediction deadline. Allow side-game join after that without touching prediction eligibility or lock calculations.
- The backend owns contracts, quotes, arithmetic, balances, state. The browser previews only. The LLM sees contracts and evidence snapshots, returns structured output, and touches nothing else.

Records: season wallet + append-only ledger (grant / stake / payout / refund / adjustment, unique op key); market (type, contract fields, cutoff, window, state, current quote, pricing group); quote (version, probability bps, tag, rationale, evidence refs, origin: AI / operator edit); proposal (AI output, operator edits, decision); suggestion; bet (side, stake, quote version, locked bps, promised return, request key, status); resolution (observed value, evidence link, timestamp, early-close timestamp if any, confirming operator); event log.

Invariants: one grant per account per season; one debit per accepted ticket; one terminal outcome per ticket with at most one credit; ledger reconciles to balances; a balance operation never waits on a live LLM call.

## Acceptance criteria

1. ₪10,000 granted once per account under concurrent first access; Monday winnings fund Tuesday bets.
2. Each question type can be published, priced, bet on, and settled using its own source. No market can be published without a type.
3. The LLM returns exactly 50% with a no-basis tag when given no evidence; the card shows the tag. An invalid response never publishes a number.
4. A market's quote changes only on a data-change event or an operator edit; identical inputs reuse the quote with no model call. Operator edits appear in price history and on the card.
5. A ₪100 Yes bet at 40% debits ₪100 and locks ₪250; later quotes never change it. A stale quote version is rejected with no debit; a retried key returns the original ticket.
6. Concurrent bets cannot overdraw. Hedge example: ₪250 either way, ₪200 on void.
7. Positions are visible to all league members from acceptance; non-members see nothing and cannot call operator endpoints.
8. Poll-type and channel-type settlement forms pre-fill from the source; operator types confirm with link and timestamp. Three mentions resolves at-least-3 Yes and more-than-3 No. Blank never resolves; explicit zero does.
9. Early close refunds only tickets after the recorded event timestamp; earlier tickets settle normally.
10. Settlement and void race to one terminal outcome; retried jobs cannot double-credit.
11. ROI appears only with ≥ 3 distinct resolved markets; three tickets in one market count as one.
12. A late side-game join cannot alter an election prediction; operator permission cannot be self-assigned.
13. Hebrew mobile views show threshold meaning, cutoff in Israel time, probability tag, total return vs. profit, and public positions.

## Delivery sequence

1. Operator allowlist, side-game membership, wallet + ledger, market/contract/quote/bet tables, payout math, bet endpoint with quote-version check. Feature flag.
2. Settlement form (manual entry first), confirmation, retryable payout/refund job, void, early-close refunds. Full money flow tested on MySQL.
3. Poll-change event from the importer; channel collectors; scheduled-events table; LLM pricing job with validation and the 50/50 tag; data-change repricing; pricing groups.
4. Daily proposal job and operator queue with editing; member suggestions; Hebrew feed, cards, detail, public positions, price history, bet confirmation; leaderboard.
5. Seed the first week of markets, enable the flag for the league, run it, adjust.

Done when a member can suggest a question, see it priced (or honestly 50/50), bet and hedge, watch everyone's positions, get paid from a settlement that shows its evidence, and spend that money on tomorrow's question.

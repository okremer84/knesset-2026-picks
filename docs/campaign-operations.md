# Campaign side game: setup and operation

The implementation follows [revision 6](prediction-markets-spec.md). It adds a Hebrew, RTL market board and operator console to the existing application, using the existing Google account and league. All amounts are play money; nothing connects to an exchange account or places external trades.

## Enable locally or in a deployment

1. Run `php artisan migrate` against the intended application database.
2. The pilot is enabled by default (`CAMPAIGN_ENABLED=false` is an emergency off switch). Access is fixed to verified Google accounts `okremer84@gmail.com` (admin) and `omer@trytrackit.com` (regular bettor). Each receives one ₪10,000 play-money grant per season on first access. `CAMPAIGN_OPERATOR_IDS` cannot grant admin access during the pilot, and league ownership does not override the roles. Both accounts must join the same league; the secondary account can also use its invite code inside Eisenmarket without joining the election-prediction game. No accounts or OAuth credentials are seeded. Existing wallets are not reset or topped up.
3. For AI proposals/pricing, set `CAMPAIGN_AI_API_KEY` and the configurable `CAMPAIGN_AI_MODEL`. The default is `gpt-4.1-mini`; this is not a claim that it is the newest model. Missing credentials leave manual market creation, betting and settlement available.
4. Run the queue worker with a timeout longer than the jobs, for example `php artisan queue:work --timeout=360 --tries=3`. Set the database queue's `retry_after` to at least 420 seconds (`DB_QUEUE_RETRY_AFTER=420`). Run Laravel's scheduler every minute. The default application queue is `database`.
5. Open **משחק הקמפיין → ניהול**. Add source links and scheduled events, review proposals, and publish questions. Sources can be edited in the same screen. For an existing market, evidence with the same source URL or its bound source ID is relevant to repricing. Sources for unrelated markets do not reprice it.

No live database migration, real market publication, or deployment is performed by the UI preview. Only the two pilot accounts can access the feature by default. The local preview uses explicitly labelled sample data; it does not seed wallets or questions in the database.

## Preview and verification

Run `node scripts/campaign-preview.mjs`, then open `http://127.0.0.1:5174/tests/Fixtures/campaign-preview.html`. The interactive preview supports sample bets and suggestions in memory. `/tests/Fixtures/campaign-mobile.html` embeds it at 390 pixels for mobile QA; `campaign-desktop.html` provides a 1280-pixel layout check. Production uses the actual API, not these fixtures.

Checks:

```sh
npm run lint
npm run test:frontend
npm run build
php artisan test
DB_CONNECTION=mysql DB_DATABASE=knesset_test DB_USERNAME=root DB_PASSWORD=testing php artisan test
vendor/bin/pint --test
```

**Use a disposable test database.** Laravel's test migrations recreate it. The MySQL-only concurrency test launches independent PHP processes for simultaneous grants, competing wallet debits, settlement versus void, and repeated terminal actions. SQLite skips that test. The existing CI runs both database suites.

## Sources and automation

- Daily proposal job: **08:00 Asia/Jerusalem**. Up to eight proposals; repeated runs on the same day do not duplicate an existing batch. A batch with invalid output publishes nothing. Member suggestions with the same normalized question merge and retain all submitters.
- Poll changes: the existing importer and manual `polls:publish` command dispatch repricing after commit. The snapshot includes active opinion polls, so corrections and removals change its hash. No model call occurs for unchanged inputs. Published poll contracts bind the party, institute and publisher; movement contracts also freeze the comparison baseline.
- Channels: queued collection every **15 minutes**. YouTube requires `CAMPAIGN_YOUTUBE_KEY` and a channel ID starting `UC`; it reads the latest 50 uploads through the YouTube Data API. Telegram reads the public channel's web feed by username. This is a best-effort public HTML adapter, not a guaranteed Telegram API. It preserves earlier observations and fails visibly in queue monitoring when the feed becomes unavailable. Up to 2,000 observed items are retained per source. X and news monitoring use a separate five-minute collector and evidence approval workflow; see [monitoring setup](campaign-monitoring.md).
- A channel item prefills its timestamp/link. **An absent item never automatically means No**: feeds can be incomplete. Operators verify negative results and void unavailable evidence.
- Poll storage provides dates, not verified intraday release times. Prefills supply the value/source and ask the operator to enter the actual timestamp; they do not invent one. General audio/video mention counts require a manual tally and link. Monitored X text contracts use the archived original post and explicit keyword rules.
- AI receives only contracts and relevant public evidence. It never receives tickets, balances or league member identities. Outputs are validated against supplied references and the 5–95% bounds. A `no_basis` response must be exactly 50%. Invalid/failed responses preserve the prior quote. Network calls run before acquiring market/wallet locks. Changed evidence or a manual edit during a request discards its stale response.

## Importing initial ideas

The operator import tab has two researched candidates and accepts a Polymarket market ID or Kalshi ticker. Imports fetch fresh public metadata, reject closed/resolved markets, and create an idempotent **review proposal**. They never copy external prices into a local quote or publish automatically.

[Source research](market-source-research.md) and [observed candidates](../data/campaign-source-examples.json) explain the deadline caveats. The Polymarket withdrawal contract has inconsistent API/rule deadlines; the Kalshi endorsement contract ends after this game's election cap. Rewrite their local rules and deadlines explicitly. No live short poll/ad-count markets were verified in that research. Final mandate totals remain in the main prediction game.

## Money and recovery

- Each account has one season wallet, even if it accesses multiple leagues. Each grant, stake, payout and refund has a unique ledger operation key. Amounts and stored promised returns are integer cents.
- Betting locks the league, market and wallet; request keys are idempotent and reject different payloads. A stale quote includes the new quote in the conflict response. The UI requires another click after a conflict.
- Preview closes the group to new bets and binds the observation to a preview ID. A newer preview invalidates earlier previews. Confirmation reserves one terminal action; a retryable job performs atomic payouts for the group. The first settlement/void action wins. Retry failed payout jobs through Laravel's normal queue tooling; never manually replay ledger credits.
- Bets at or after an operator-recorded early public-result timestamp are refunded. This boundary is inclusive. No event cannot be confirmed before the observation window ends. Settlement evidence, operator edits, positions and refunds remain visible to the league.
- Group contracts share source, subject, timing and counting rules. Numeric thresholds are monotonic; strict and inclusive integer thresholds normalize consistently (`>3` equals `≥4`). All members of a pricing group reprice and settle together.
- Group market conditions are immutable. Void and republish a wrong contract. The earlier configured election cap also blocks new bets if the election date changes.
- Inspect `queue:failed` after provider errors. A configured queue worker and scheduler are required for automation and asynchronous payouts. Post-settlement corrections and cash-out are intentionally absent.

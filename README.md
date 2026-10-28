# Knesset Fantasy

A Hebrew React frontend with a Laravel 13 backend for private fantasy election leagues. PHP owns authentication, SQL persistence, deadlines, scoring and five-minute actual-result imports. Vite builds the existing picker, actual-result comparison and historical views; Laravel serves the application from `public/`.

## Local setup

Requires PHP 8.4+, Composer 2 and Node 22+. PHP needs DOM, mbstring and PDO with SQLite for local development or MySQL for production.

```sh
composer install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite
php artisan migrate
php artisan db:seed
npm ci
npm run build
php artisan serve
```

Open http://localhost:8000 and sign in with Google. For frontend development, also run `npm run dev` in a second terminal, while continuing to browse port 8000.

The seeder publishes the reviewed initial vote count in `data/actual-results.json`, preserving later live updates and withdrawals. It deactivates opinion polls and exit polls without deleting their history. Authentication uses Google only. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`; see [Google setup](docs/laravel-cloud.md#google-sign-in).

## Game rules

- Each account can submit one independent prediction per league. Display names are labels, never authentication.
- The creator is the commissioner. Others join using the random invitation code.
- The election date defaults to 27/10/2026; override `ELECTION_DATE` (YYYY-MM-DD) if it changes. The commissioner chooses a submission date when creating the league, no later than election day. Submissions always close at 20:00 Asia/Jerusalem on that date. The deadline cannot be edited after creation. Accepted timestamps are normalized to UTC before storage. The server rejects prediction edits and new members at or after that instant. Existing members can still open their league.
- Each league has its own prediction and deadline. Joining or creating another league starts an unsubmitted draft; editing that prediction never changes another league’s entry. Users create or join a league before submitting a prediction. Each league reveals its predictions at its own deadline.
- Every prediction must contain exactly 120 integer seats using recognized party IDs. Each party must receive either 0 or at least 4 seats. A turnout prediction with at most one decimal place is also required.
- Other players' picks and notes stay private until the deadline, including from the commissioner. Membership and submission status remain visible.
- Lower total absolute seat error wins. Closeness to official turnout is the only tiebreak; until it is published, equal seat errors share a position. Complete ties share a position.
- A poll's unreported parties are excluded from comparison rather than invented as zero.
- League scoring and the **תוצאות אמת** page use the same current vote count. Channel selectors and opinion-poll trends are retired; previous records remain in storage.
- Published election-result corrections update standings across leagues. Historical deadline-change audit records are retained.
- Partial actual counts update automatically and keep shared ranks for equal seat error. Only operator-published official results enable the turnout tiebreak. Publishing results never reopens submissions.

Draft seats, prediction name, turnout and note are stored per account and league in the browser and survive tab navigation and reloads. Background refreshes preserve unsaved edits. The historical tab presents past election results without scoring today's party lists against different historical alliances.

Authentication uses Google OAuth through Laravel Socialite, database sessions, HttpOnly cookies, CSRF checks and rate limits. All writes use same-origin requests. No public AI ingestion endpoint is exposed.

## Actual election results

`results:sync` reads the [Ynet live count](https://www.ynet.co.il/news/blogs/article/hjvyjpc2fe) every five minutes through the existing Laravel scheduler. The browser reads `/api/results` every 30 seconds and when the tab becomes visible or focused. The page shows the count percentage, the result post's publication time, and the last successful source check, all in Israel time. These are partial actual counts, not final certified results. The near-final turnout reported in the article is deliberately not used for a tiebreak.

When Ynet ends a live blog, the importer follows the explicit continuation link in its closure notice and remembers the validated current blog for subsequent checks. Only HTTPS Ynet live-blog URLs are accepted; redirects, missing/ambiguous continuation links, loops and chains longer than three pages fail without refreshing the last-success timestamp. A closed saved HTML snapshot cannot be published as a fresh count.

The parser uses individual national-count posts with explicit seat allocations and timestamps. It never combines updates, cities, percentages or exit-poll estimates. A complete allocation must total 120 seats. Invalid/ambiguous breakdowns, changed HTML, older cached updates and network errors retain the last valid count. The UI warns after a failed check or more than ten minutes without a successful one. `election_result_syncs` records the most recent check and success; `survey_revisions` preserves every changed result. An unchanged successful check advances the check time without creating another revision.

The October 28 migration publishes the reviewed initial count on existing installations during the normal migration-only release. Fresh installations use `php artisan db:seed`. Reseeding never overwrites later updates, corrections or withdrawals. Migrate through the existing GitHub-triggered deployment; no manual Cloud deployment or settings change is needed.

For local validation:

```sh
php artisan results:sync --html=tests/Fixtures/ynet-actual-results.html
php artisan results:sync
php artisan schedule:list
php artisan schedule:work
```

The old `polls:sync` schedule is removed. Legacy poll commands, historical fixtures, and the original channel screenshots are retained for audit/reference; they no longer supply the current results page. A daily cleanup still prunes old poll HTML snapshots.

Final certified results remain an explicit reviewed publication with `kind: official_results`, all configured party allocations totalling 120, and the certified `turnoutPercentage`. They take priority over partial counts and stop the Ynet importer. Automatic source parsing never declares a winner or upgrades a partial count to certified results.

## Checks

```sh
php artisan test
vendor/bin/pint --test
npm run test:frontend
npm run lint
npm run build
```

CI runs the backend suite against SQLite and MySQL 8.4. Tests cover authentication/reset, permissions, identity spoofing, private picks, deadlines, scoring, benchmark snapshots, parser fixtures, import idempotency and failed-source preservation. The public HTML fixture is a saved extract from [Wikipedia's polling table](https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Israeli_legislative_election); the parser tests compare it with the previously reviewed feed.

## Migration from the prototype

The old Express server and public Gemini scanner are retired. `data/leagues.json` is no longer read or written. Existing anonymous records cannot safely be assigned to accounts by matching a display name; importing any real old leagues needs an explicit, verified ownership mapping. The legacy Python/TypeScript poll scripts remain for reference, but do not run in production.

See [Laravel Cloud setup](docs/laravel-cloud.md) for deployment.

The personal-pick migration preserves legacy per-league submissions and revisions in their original tables. It carries forward the first closed league’s submission when present, otherwise the latest submission, into one unique personal prediction per user.

The league-pick migration copies each existing personal submission (including its name, note, turnout, timestamps and revision history) into every existing membership. Closed-league picks remain locked. Original personal and legacy records remain intact. Run `php artisan migrate` during deployment before serving the updated application. Rollback requires restoring a pre-migration backup to avoid discarding independent league picks.

In the picker, select a destination league and click “העתק בחירה מליגה אחת” below the instructions. Choose a source league in the dialog and click copy. Seats, name, turnout and note are copied into the draft; editing and submitting affect only the destination league. Copying replaces the current draft and does not submit automatically.

## מאסטרקפה

The main navigation now opens a shared coffee-bet board for signed-in accounts; old `?tab=campaign` links and saved navigation preferences open `coffee`. Existing campaign records remain intact.

- Each bet stakes one Master Coffee. The creator supplies a yes/no question, optional resolution rules (such as the relevant date or event), and their side. Another account takes the opposite side. Conditions cannot change after creation; only an unmatched bet can be cancelled by its creator.
- **מחכות למהמר** lists unmatched offers. **התערבויות** includes every unresolved bet, including unmatched offers, active matches, pending agreements and disputes. It defaults to all bets, with a toggle for the signed-in player’s bets.
- Either participant can propose the outcome. Only the other participant can agree or dispute. Agreement settles immediately. A dispute opens voting to other signed-in accounts for 48 hours. Each account has one immutable vote; participants cannot vote. The most votes wins. A tie (including zero votes) remains unresolved until a new voter breaks it.
- **טבלה** shows personal totals and everyone’s settled coffee debts as an interactive network. Green means coffee owed to the person; red means coffee they owe. Hover, keyboard focus, or tap highlights one side’s connections; cans animate from debtor to winner, respecting reduced-motion preferences. Opposing debts remain separate; there is no payment tracking. Cancelled offers never count.
- Matching, settlement and voting serialize through a database row lock; votes additionally have a unique bet/account constraint. No payment processing is involved.

Deployment requires `php artisan migrate` before serving the new frontend. The existing Laravel scheduler runs `coffee-settlement` every minute; loading the board also finalizes due non-tied disputes. No production migration or deployment is performed by adding these files.

# Knesset Fantasy

A Hebrew React frontend with a Laravel 13 backend for private fantasy election leagues. PHP owns authentication, SQL persistence, deadlines, scoring and the nightly Wikipedia import. Vite builds the existing picker, survey comparison and historical views; Laravel serves the application from `public/`.

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

Open http://localhost:8000 and register an account. For frontend development, also run `npm run dev` in a second terminal, while continuing to browse port 8000.

The seeder imports only the bundled, previously reviewed Wikipedia feed into an empty database. It never creates demo users and never overwrites live surveys. Local password-reset emails appear in `storage/logs/laravel.log`; configure a real mail provider on Cloud.

## Game rules

- Each account owns one prediction per league. Display names are labels, never authentication.
- The creator is the commissioner. Others join using the random invitation code.
- The commissioner chooses a future submission deadline when creating a league. The server rejects edits and new members at or after that instant. Existing members can still open their league.
- Every prediction must contain exactly 120 nonnegative integer seats using recognized party IDs, and a turnout prediction with at most one decimal place.
- Other players' picks stay private until the deadline, including from the commissioner. Membership and submission status remain visible.
- Lower total absolute seat error wins. Exact hits among parties with seats break ties; closeness to official turnout is the next tiebreak. Complete ties share a position.
- A poll's unreported parties are excluded from comparison rather than invented as zero.
- New benchmarks must use active surveys; withdrawn surveys remain available only through existing league snapshots and revision history.
- Each league saves its benchmark payload. Later source corrections do not silently rescore the league. Commissioner changes are recorded in the audit log.
- Opinion-poll standings are provisional. Exit polls and official results must be published by an operator before a commissioner can select them. Stage changes cannot reopen voting or overwrite a finalized result.

Authentication uses Laravel's hashed passwords, database sessions, HttpOnly cookies, CSRF checks and rate limits. All writes use same-origin requests. No public AI ingestion endpoint is exposed.

## Poll imports

```sh
php artisan polls:sync
php artisan polls:sync --html=/absolute/path/wikipedia.html
php artisan schedule:list
```

The schedule is **03:17 Asia/Jerusalem every night**, with shared cache locks preventing simultaneous runs. Enable the scheduler on Cloud; locally use `php artisan schedule:work`.

The importer parses the 2026 seat-projection tables, expands row/column spans, resolves original citations and uses explicit current-party mappings in `config/poll-aliases.json`. The current mapping starts on 2026-09-08. Earlier alliances are deliberately not combined with today's lists.

A successful batch is committed atomically. Unknown labels, ambiguous identities, missing figures, layout changes or an HTTP failure fail the run and retain the last good data. The command exits nonzero and writes a log entry. `poll_imports` keeps run status and source HTML; `survey_revisions` preserves corrections. Removed Wikipedia entries become inactive while their history and league snapshots remain.

The API reports the latest import status. The frontend shows a notice after a failed import or when it must display its bundled fallback. Operators should monitor failed runs and the last successful timestamp, and arrange database backups. Source snapshots currently have no automatic retention policy.

Wikipedia is a secondary source that can be edited incorrectly. Seat-total validation does not establish factual accuracy. Each poll includes its source links. Party labels and alliance mappings need human review when the ballot changes.

### Publishing reviewed election results

Use `php artisan polls:publish /path/to/reviewed-survey.json` through an operator console. The JSON uses the same Survey shape as `data/wikipedia-surveys.json`, with a unique `id`, `title`, `date` (YYYY-MM-DD), `institute`, `channelOrMedia`, `sourceUrl` (HTTPS), and `seats`.

Set `kind` to `opinion_poll`, `exit_poll`, or `official_results`. Election-result payloads must explicitly report every configured party (including zeros) and sum to 120. Publishing a survey does not change any league automatically. The commissioner selects the published result after the deadline and enters the official turnout to finalize the league. Review final results carefully: finalized leagues cannot be changed through the app.

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

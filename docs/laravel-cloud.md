# Laravel Cloud setup

This change prepares the repository for Cloud. It does not create a Cloud application, attach paid resources or deploy production.

1. Connect the GitHub repository to Laravel Cloud. Use a staging environment and this PR's branch initially. After review/merge, use `main` for production.
2. Confirm Cloud identifies the application as Laravel/PHP, not Express. Choose PHP 8.5 and Node 22. The project root is the repository root and the web document root is `public/`.
3. Attach a MySQL database and use Cloud's injected connection variables. Enable database backups appropriate to the game's needs. Do not use SQLite or local JSON files on Cloud's ephemeral filesystem.
4. Set the build and deploy commands below.
5. Configure the application and Google sign-in environment values below.
6. Enable the **Scheduler** toggle on the App compute cluster, save and deploy. Laravel Cloud then invokes `schedule:run` every minute. The application schedules its own actual-result check every five minutes; do not add another GitHub cron.
7. After the automatic deployment, verify `/api/results` and the results page. Its last successful check should advance within five minutes through the existing scheduler.

## Build commands

Use npm for frontend dependencies, matching CI and the committed `package-lock.json`. Keep this as the only JavaScript lockfile; the obsolete `bun.lock` was incompatible with Bun 1.2.23 and contained stale dependencies. Cloud also retained the old application's Express runtime after the backend migration, requiring a new application detected as PHP. Removing the lockfile alone does not change an existing application's runtime.

In Cloud's environment settings, replace the previous `npm install -g bun` / `bun install --frozen-lockfile` workaround with the complete build commands below, then deploy the commit containing the lockfile removal.

```sh
composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader
npm ci
npm run build
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

## Deploy commands

Releases go through GitHub and the existing automatic deployment. Do not deploy manually on Laravel Cloud or change its settings to ship a release. The October 28 upgrade migration publishes the actual-result bundle on existing installations, so migration-only deployment configurations work without modification.

```sh
php artisan migrate --force
php artisan db:seed --force
```

The seeder publishes `data/actual-results.json` and deactivates opinion/exit polls while retaining their history. It preserves later live counts, operator corrections and withdrawals. Migration-only deployments seed the bundle in the October 28 upgrade migration; no external fetch is required during deployment.

## Automatic result updates

The existing scheduler runs `results:sync` every five minutes. It validates Ynet's national seat-count updates before publishing them; the browser checks `/api/results` every 30 seconds and when the tab becomes visible or focused and displays the source update and last successful check in Israel time. When a Ynet blog closes, the importer follows its explicit continuation and saves the new source URL. Missing or invalid continuations are failures, so a closed blog cannot keep advancing the last-success timestamp. Failures keep the last good result visible with a delayed-update notice. The old nightly `polls:sync` schedule is removed.

Do not deploy directly through Laravel Cloud or change its settings to ship this release. Merge through GitHub and allow the existing automation to build and migrate. Final certified results must be reviewed and published explicitly; they take precedence and stop partial-count imports.

## Environment

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://YOUR-APP-DOMAIN
SESSION_DRIVER=database
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=lax
CACHE_STORE=database
LOG_CHANNEL=stderr
LOG_LEVEL=info
QUEUE_CONNECTION=database
```

Keep a stable, secret `APP_KEY` using Cloud's environment settings. If a key is not generated during setup, generate one locally with `php artisan key:generate --show` and add it as a secret. Never regenerate the key on each deployment.

Keep Cloud's database credentials in its environment settings. The sessions and cache tables live in the same shared SQL database, which also supports the scheduler's `onOneServer` and overlap locks. The campaign feature requires a queue worker (see [campaign setup](campaign-operations.md)). Without that feature, no separate Redis instance or queue worker is required for the initial app: the import runs directly and Google handles authentication; sign-in does not require an email provider.

Set `WIKI_USER_AGENT` to an identifiable application/contact string. Mail delivery can be configured later if the app adds email notifications.

## Release checks and monitoring

- Confirm Google sign-in creates an account, repeat sign-in returns to that account, logout works, and an invitation survives the Google redirect.
- Create a short-lived test league, join with another account and verify that picks are hidden before the deadline and submissions fail afterwards.
- Inspect `php artisan schedule:list`: `results:sync` should run every five minutes, and `polls:sync` should be absent.
- Monitor `election_result_syncs` for failures or a last successful check older than ten minutes. The result page displays both source and check timestamps.
- Back up SQL data, including prediction revisions and league benchmark snapshots. Source HTML bodies are compressed and deduplicated, then pruned after 30 days without another observation; hashes and import statuses remain.
- Original anonymous prototype data remains outside the new backend. Do not publish or import it by guessing ownership from names.

The GitHub checks include MySQL integration tests. A successful local SQLite run is not a substitute for the MySQL CI result or a first staging deployment.

Cloud reference: [environment build/deploy settings](https://laravel.com/cloud/docs/environments), [scheduled tasks](https://laravel.com/cloud/docs/scheduled-tasks).

## Google sign-in

Create an OAuth client of type **Web application** in Google Cloud / Google Auth Platform. Configure the consent screen for this app with the basic `openid`, `email`, and `profile` scopes. If the consent screen is in Testing, add the accounts that should be allowed to sign in as test users.

Add this exact authorized redirect URI to the Google client (replace the domain):

```text
https://YOUR-APP-DOMAIN/auth/google/callback
```

Set these values in Laravel Cloud's environment settings; keep the secret out of Git:

```dotenv
GOOGLE_CLIENT_ID=YOUR-CLIENT-ID
GOOGLE_CLIENT_SECRET=YOUR-CLIENT-SECRET
GOOGLE_REDIRECT_URI=https://YOUR-APP-DOMAIN/auth/google/callback
```

Keep `APP_URL` on the same domain. Redeploy after saving these values because the build caches configuration. The normal deployment migration adds a unique Google account ID to users. Until all three values are configured, the sign-in button is disabled and the server refuses to start OAuth. No email/password registration, login, or reset endpoints remain.

Google's stable account ID identifies returning users. The app requires a verified Google email and does not retain Google access or refresh tokens. Existing password accounts are not automatically linked by matching email; any legacy-account migration must explicitly verify ownership before linking the Google ID. League invitations are preserved across sign-in.

References: [Laravel Socialite](https://laravel.com/docs/13.x/socialite), [Google OpenID Connect setup](https://developers.google.com/identity/openid-connect/openid-connect).


### Profile names and photos

The profile modal lets each signed-in user update their display name and upload a replacement avatar. Google photos are captured on sign-in; existing users must sign in again to populate their Google photo. Later sign-ins preserve custom names and uploaded photos.

Deploy migrations normally (`php artisan migrate --force`) to add the profile photo fields. Uploads are resized in the browser to at most 512 pixels and validated by the server (JPEG, PNG or WebP, maximum 256 KiB and 1024 pixels per side). The small thumbnail is stored in SQL so it survives Cloud deployments without an object-storage bucket or local filesystem dependency. Email and Google account identity cannot be edited through the profile endpoint.

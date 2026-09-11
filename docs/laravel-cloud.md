# Laravel Cloud setup

This change prepares the repository for Cloud. It does not create a Cloud application, attach paid resources or deploy production.

1. Connect the GitHub repository to Laravel Cloud. Use a staging environment and this PR's branch initially. After review/merge, use `main` for production.
2. Choose PHP 8.4 and Node 22. The project root is the repository root and the web document root is `public/`.
3. Attach a MySQL database and use Cloud's injected connection variables. Enable database backups appropriate to the game's needs. Do not use SQLite or local JSON files on Cloud's ephemeral filesystem.
4. Set the build and deploy commands below.
5. Configure the application and mail environment values below.
6. Enable the **Scheduler** toggle on the App compute cluster, save and deploy. Laravel Cloud then invokes `schedule:run` every minute. The application schedules its own nightly import; do not add another GitHub cron.
7. After the first deployment, run `php artisan polls:sync` once through the environment's Commands console. Check its exit status and logs, then register an account, create a league and try an invitation in a second browser session.

## Build commands

```sh
composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader
npm ci
npm run build
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

## Deploy commands

```sh
php artisan migrate --force
php artisan db:seed --force
```

The seeder only initializes an empty surveys table. Do not make external Wikipedia availability a deployment requirement; the importer runs separately and preserves the last good data on failure.

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

Keep Cloud's database credentials in its environment settings. The sessions and cache tables live in the same shared SQL database, which also supports the scheduler's `onOneServer` and overlap locks. No separate Redis instance or queue worker is required for the initial app: the import runs directly and password reset mail is sent synchronously.

Configure `MAIL_MAILER=smtp` and your provider's `MAIL_HOST`, `MAIL_PORT`, `MAIL_SCHEME`, `MAIL_USERNAME`, `MAIL_PASSWORD` and verified `MAIL_FROM_ADDRESS`. The development log mailer does not deliver password resets to users. Set `WIKI_USER_AGENT` to an identifiable application/contact string.

## Release checks and monitoring

- Confirm registration, login, logout and a real delivered password-reset link.
- Create a short-lived test league, join with another account and verify that picks are hidden before the deadline and submissions fail afterwards.
- Inspect `php artisan schedule:list`: `polls:sync` should run at 03:17 in Asia/Jerusalem.
- Monitor `poll_imports` for failures or an absent successful run for more than a day. Logs include import errors and the frontend warns after a failed run.
- Back up SQL data, including prediction revisions and league benchmark snapshots. Source HTML bodies are compressed and deduplicated, then pruned after 30 days without another observation; hashes and import statuses remain.
- Original anonymous prototype data remains outside the new backend. Do not publish or import it by guessing ownership from names.

The GitHub checks include MySQL integration tests. A successful local SQLite run is not a substitute for the MySQL CI result or a first staging deployment.

Cloud reference: [environment build/deploy settings](https://laravel.com/cloud/docs/environments), [scheduled tasks](https://laravel.com/cloud/docs/scheduled-tasks).

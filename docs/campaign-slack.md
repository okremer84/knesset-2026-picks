# Eisenmarkt Slack review notifications

This integration is **outbound review links only**. Slack interactive approvals are not implemented or connected. A Slack message, reaction, button, or reply cannot settle or void a market. The review link opens the existing operator UI; Google sign-in and the existing administrator allowlist still apply. Monitoring freshness checks, explicit news attestations, preview expiry, payout/refund calculation, late-bet handling, locks and idempotent settlement stay in their existing paths.

The notifier intentionally does not call `Settlement::preview`: generating that preview closes a market and issues an approval token. Messages contain the question, source links, evidence status/proposed observation where available, and a link to compute the actual outcome and payout/refund preview in Eisenmarkt. No approval token or wallet/user details are sent to Slack. Play money only.

## Configure the approved destination

1. Identify the intended workspace ID (`T…`), channel ID (`C…` or `G…`), and shared campaign league UUID. Never infer a channel from its display name. Choose a channel whose members may see the source/review information.
2. Create an internal Slack app in that workspace, grant its **bot** only `chat:write`, install it, and invite the bot to the approved channel. No Events API, interactivity endpoint, user-token permissions, or `chat:write.public` scope is needed. A Codex Slack plugin connection can help identify the workspace/channel, but does not provision the server bot token.
3. Put `CAMPAIGN_SLACK_BOT_TOKEN` into Laravel Cloud's secret environment configuration. Do not paste credentials into chat, commit them, or put them in a URL. Set `CAMPAIGN_SLACK_TEAM_ID`, `CAMPAIGN_SLACK_CHANNEL_ID`, `CAMPAIGN_SLACK_LEAGUE_ID`, and production `APP_URL=https://knesset-picks.com`. Leave `CAMPAIGN_SLACK_ENABLED=false` until the destination is approved and the deployment/migration is ready.
4. Deploy the code and run migrations through the usual Laravel Cloud deployment. The existing scheduler runs `campaign:slack --send` once a minute. Use a shared cache supporting locks, as with the existing `onOneServer` schedules.
5. Enable `CAMPAIGN_SLACK_ENABLED=true` and refresh cached configuration. **Enabling starts real delivery on the next scheduled minute.** `php artisan campaign:slack --check` only calls `auth.test` and checks the bot/workspace match; it does not prove channel membership. `php artisan campaign:slack` is local status only. `--send` refreshes notices and attempts at most one actual post. Do not enable or run `--send` until the approved destination is known.
6. Verify the first real review link with the authorized administrator. Confirm the current evidence and payout/refund preview in the web UI before approving. A successful workspace check is not a successful delivery or a connected approval workflow.

## Coverage and delivery behavior

- Only the configured league and current season are considered. Archived/terminal markets and hidden `x_count` questions are excluded.
- X/news packet states `ready`, `review`, `incomplete`, and `void` produce review notices. Waiting packets stay quiet. Incomplete coverage never means “no”. Changes to meaningful candidate evidence can generate another notice; healthy repeated collection runs do not.
- Manual questions (polls, interviews, PM/election and other non-monitored contracts) receive a reminder after their observation window ends. This is not evidence verification and does not imply that the proposed answer is known.
- X/news source collection failures, missing collections, stale runs over 15 minutes, and recovery transitions are reported. A recovery does not erase historical gaps. This does not monitor the daily poll-import job, the scheduler itself, or external service outages independently.
- Durable records in `campaign_slack_notices` deduplicate unchanged notices. New state replaces an unsent older state. A queued notice is refreshed before delivery; already-settled/archived notices become obsolete. Messages already posted are historical snapshots: always refresh in Eisenmarkt.
- Posts are limited to one per scheduled minute. HTTP 429 delays the entire destination until `Retry-After`; ordinary repeated runs do not retry sooner.
- A confirmed API rejection is `blocked`; transport errors, 5xx/malformed responses are `uncertain`. The durable pre-send claim remains `sending` after a worker crash. These statuses do not automatically retry, since Slack might have accepted a message before the response was lost. Error diagnostics use fixed codes, not raw responses or tokens.

## Reconcile delivery failures

Run `php artisan campaign:slack` for status counts and IDs of blocked/uncertain/sending rows. Fix channel membership, permissions, or credentials first. For a confirmed rejection, `php artisan campaign:slack --retry=ID` requeues without sending immediately. For an uncertain/crashed send, inspect the approved channel for that question/source and time first. Only if it was **not delivered**, use `--retry=ID --confirmed-not-delivered` (sending claims must be at least three minutes old). If the message exists, leave it suppressed; do not retry. Schedule/infrastructure monitoring must alert separately if Slack itself cannot be reached.

For true in-Slack approvals, a future implementation must verify raw-body signatures and timestamp freshness, bind requests to the exact workspace/channel and explicitly mapped authorized identity, store replay/idempotency state, regenerate/validate current evidence and payout previews, and reuse the existing settlement service. Do not add a text-triggered settlement shortcut.

Official references: [chat.postMessage](https://docs.slack.dev/reference/methods/chat.postmessage), [Slack rate limits](https://docs.slack.dev/apis/web-api/rate-limits/), [auth.test](https://docs.slack.dev/reference/methods/auth.test/), [request verification](https://docs.slack.dev/authentication/verifying-requests-from-slack/).

## Prepared destination (17 October 2026)

Verified in the Slack desktop client: **The Goose Dept**, workspace `T0A6ZQN19K4`. Created the private channel **eisenmarkt-approvals**, channel `C0CA0TDAWNA`, with no additional human members invited. [Open channel](https://app.slack.com/client/T0A6ZQN19K4/C0CA0TDAWNA).

The app can be created from `docs/slack-app-manifest.json` in this workspace. Production bot installation, secret configuration, first delivery, and live review-link verification remain pending. Do not interpret channel creation as a connected integration.

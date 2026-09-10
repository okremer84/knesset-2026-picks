# בחירות 2026 - ליגת חיזוי המנדטים (Knesset 2026 Prediction League)

אפליקציית חיזוי תוצאות הבחירות לכנסת ה-26, המאפשרת למשתמשים לנחש את חלוקת 120 המנדטים, להקים ליגות חברים פרטיות, ולעקוב אחר השוואות לסקרים חיים.

---

## Wikipedia poll sync

The app now serves real Wikipedia polls through `/api/surveys`. The bundled JSON
snapshot also works when the backend is unavailable. Design fixtures (including
imaginary exit polls/final results) remain in `DEMO_SURVEYS`, outside the live feed.
Election-stage transitions require a real survey of the appropriate kind.

```sh
npm install
python3 -m pip install -r scripts/polls/requirements.txt
npm run test:polls
npm run polls:sync
npm run dev
```

Set `PYTHON` if your Python executable has a different path. Import a downloaded
Wikipedia HTML page with `npm run polls:sync -- --html /absolute/path/polls.html`.
The generated `data/wikipedia-surveys.json` is atomically replaced after validation.
Express reads it on every request; a sync on the app host needs no restart.
`POLL_SURVEYS_FILE` overrides the feed path for both the server and sync command.

The current mapping covers polls ending **September 8, 2026 onward**, matching the
current table's party/alliances. Earlier valid polls remain in the raw archive and
aren't mapped onto today's ballot. Mapping rules are explicit in
`scripts/polls/map-surveys.ts`; new party names and unexpected missing values block
publication. Balad is not separately reported in these polls and is explicitly
marked in `notReportedPartyIds`; the existing game compares absent seat keys as zero.
Bloc totals use this app's party configuration, not Wikipedia's coalition column.

Raw snapshots, SQLite revision history, extraction reviews, mapping reviews and run
status live in `data/poll-sync/` (gitignored). On a persistent host keep this folder;
GitHub Actions runs upload it as diagnostics retained for 30 days, while generated
feed changes are retained in git. Unparsed historical rows require review. Failures
exit nonzero and leave the last published feed intact. A killed Node process may
leave `pipeline.lock`; remove it only after confirming the job has stopped.

### Nightly operation

After this workflow is merged into the default branch, `.github/workflows/sync-polls.yml`
runs around **03:17 Asia/Jerusalem**, with separate summer/winter UTC candidates.
GitHub may delay scheduled runs; the intended cron event, rather than actual start
hour, decides which candidate runs. It also supports **Run workflow** manually.
Repository Actions must allow the built-in token to write contents. Branch rules
may prevent the generated-data push. Inspect failed runs in Actions.

The workflow commits the generated feed, **not a deployment**. A separately hosted
app must pull/redeploy those commits, or run `npm run polls:sync` on its own nightly
scheduler. GitHub-token commits do not trigger ordinary push workflows, so configure
deployment explicitly (for example, a `workflow_run` deployment after sync), once
hosting is chosen. Do not install both host and Actions schedules unnecessarily.

Source: [Wikipedia polling tables](https://en.wikipedia.org/wiki/Opinion_polling_for_the_2026_Israeli_legislative_election).
The UI retains attribution and original publisher links. Wikipedia can lag or be
edited incorrectly; 120-seat totals are a validation check, not proof of accuracy.
The scraper excludes hypothetical scenarios, approval polls and older years.

---

## 📌 Backoffice / Roadmap Note: סריקת סקרים מתמונה (AI Photo Scanner)

> **תזכורת לפיתוח בסשן הבא:**
> פיצ'ר סריקת תמונות הסקרים בעזרת AI (`PhotoScanner.tsx`) הוסר מניווט המשתמשים הראשי מכיוון שהוא מיועד להיות **פיצ'ר ניהול פנימי (Backoffice Feature)**.
> 
> **יעדים לסשן הבא:**
> 1. **ממשק ניהול (Backoffice / Admin Panel)**:
>    - העברת כלי הסריקה למסך מנהל מאובטח לעדכון מאגר הסקרים של המערכת.
> 2. **אוטומציה (Automated Pipeline)**:
>    - הקמת תהליך אוטומטי (Background Job / Webhook / RSS / Social Feeds) לניטור סקרי בחירות חדשים מערוצי התקשורת (ערוץ 12, ערוץ 11, ערוץ 13, ערוץ 14 וכו').
>    - פיענוח אוטומטי של נתוני הסקר (תאריך, מכון סקרים, מנדטים לכל מפלגה) באמצעות Gemini Multimodal Vision API.
>    - הזנה אוטומטית למאגר הנתונים המרכזי כדי שכל המשתמשים באפליקציה יקבלו סקרים מעודכנים בזמן אמת ללא צורך בהעלאה ידנית.

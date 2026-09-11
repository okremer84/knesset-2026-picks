import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_LISTS_FROM, mapSurvey, type Poll } from './polls/map-surveys';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = path.join(root, 'data/poll-sync');
const destination = path.resolve(process.env.POLL_SURVEYS_FILE || path.join(root, 'data/wikipedia-surveys.json'));
fs.mkdirSync(work, { recursive: true });
const lock = path.join(work, 'pipeline.lock');
// Locks the fetch + mapping + publication together, including concurrent CLI runs.
let descriptor: number;
try { descriptor = fs.openSync(lock, 'wx'); }
catch { throw new Error(`Poll sync already running. If a prior process was killed, remove ${lock} after confirming it stopped.`); }
try {
  const args = ['scripts/polls/sync.py', '--data-dir', work, ...process.argv.slice(2)];
  const result = spawnSync(process.env.PYTHON || 'python3', args, { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw result.error || new Error(`Importer exited ${result.status}`);
  const raw = JSON.parse(fs.readFileSync(path.join(work, 'polls.json'), 'utf8')) as {
    sync: { at: string; snapshot: string }; polls: Poll[];
  };
  const surveys = [];
  const review: { id: string; error: string }[] = [];
  const extractionReview = JSON.parse(fs.readFileSync(path.join(work, 'review.json'), 'utf8'));
  for (const poll of extractionReview.polls as Poll[]) {
    if (poll.fieldwork_end >= CURRENT_LISTS_FROM) review.push({ id: poll.id, error: poll.issues.join('; ') });
  }
  for (const poll of raw.polls.filter(p => p.fieldwork_end >= CURRENT_LISTS_FROM)) {
    try { surveys.push(mapSurvey(poll, raw.sync.at)); }
    catch (error) { review.push({ id: poll.id, error: String(error) }); }
  }
  fs.writeFileSync(path.join(work, 'mapping-review.json'), JSON.stringify(review, null, 2) + '\n');
  // Fail closed if a new/current poll cannot be mapped. Keep the last good feed.
  if (review.length || !surveys.length) throw new Error(`Mapping blocked: ${review.length} rows need review, ${surveys.length} valid`);
  surveys.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const feed = { syncedAt: raw.sync.at, sourceSnapshot: raw.sync.snapshot, surveys };
  // Retain publication timestamp when the source snapshot and data are unchanged.
  if (fs.existsSync(destination)) {
    const previous = JSON.parse(fs.readFileSync(destination, 'utf8'));
    if (previous.sourceSnapshot === feed.sourceSnapshot) {
      for (const survey of surveys) survey.syncedAt = previous.syncedAt;
      feed.syncedAt = previous.syncedAt;
    }
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(`${destination}.tmp`, JSON.stringify(feed, null, 2) + '\n');
  fs.renameSync(`${destination}.tmp`, destination);
  console.log(`Published ${surveys.length} surveys to ${destination}`);
} finally {
  fs.closeSync(descriptor);
  fs.unlinkSync(lock);
}

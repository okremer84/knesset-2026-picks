import assert from 'node:assert/strict';
import test from 'node:test';
import { createPredictionSync } from '../../src/lib/predictionSync';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

test('a poll started before submission cannot replace the submitted prediction', async () => {
  const sync = createPredictionSync();
  const old = deferred<string>();
  let prediction = 'original';
  const polling = sync.refresh(() => old.promise, value => { prediction = value; }, () => assert.fail('unexpected failure'));
  sync.beginSubmission();
  prediction = 'submitted';
  await sync.refresh(async () => assert.fail('must not poll while submitting'), () => assert.fail(), () => assert.fail());
  sync.endSubmission();
  old.resolve('stale');
  await polling;
  assert.equal(prediction, 'submitted');
  await sync.refresh(async () => 'fresh', value => { prediction = value; }, () => assert.fail());
  assert.equal(prediction, 'fresh');
});

test('stale poll failures cannot mark a successful submission unavailable; new failures still surface', async () => {
  const sync = createPredictionSync();
  const old = deferred<string>();
  let failures = 0;
  const polling = sync.refresh(() => old.promise, () => assert.fail(), () => { failures++; });
  sync.beginSubmission();
  sync.endSubmission();
  old.reject(new Error('old failure'));
  await polling;
  assert.equal(failures, 0);
  await sync.refresh(async () => { throw new Error('new failure'); }, () => assert.fail(), () => { failures++; });
  assert.equal(failures, 1);
});

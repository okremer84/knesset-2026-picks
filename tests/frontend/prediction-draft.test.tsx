import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SeatPicker } from '../../src/components/SeatPicker';
import { reconcileDraft, sameSeats } from '../../src/utils/predictionDraft';
import type { Prediction } from '../../src/types';

const submitted: Prediction = { id: 'pick', userId: 1, memberName: 'Tester', pickName: 'My pick', seats: { likud: 120 }, submittedAt: '2026-10-06T12:00:00Z', turnoutPercentage: 70 };

test('server refresh initializes empty drafts and updates clean drafts without discarding edits', () => {
  const old = { likud: 120 };
  const edited = { likud: 119, beyachad: 1 };
  const remote = { likud: 118, beyachad: 2 };
  assert.deepEqual(reconcileDraft({}, undefined, old, false), old);
  assert.deepEqual(reconcileDraft(edited, undefined, old, true), edited);
  assert.deepEqual(reconcileDraft({}, undefined, old, true), {}); // Deliberately reset draft survives reload.
  assert.deepEqual(reconcileDraft(old, old, remote, true), remote);
  assert.deepEqual(reconcileDraft(edited, old, remote, true), edited);
  assert.equal(sameSeats(old, { ...old, beyachad: 0 }), true);
});

test('picker distinguishes unsubmitted, submitted, changed and loading states', () => {
  const render = (currentSeats: Record<string, number>, prediction?: Prediction, isLoading = false) => renderToStaticMarkup(
    <SeatPicker currentSeats={currentSeats} prediction={prediction} isLoading={isLoading} isSubmitting={false} isLocked={false} onSeatsChange={() => {}} onSubmitPrediction={async () => {}}/>,
  );
  assert.match(render(submitted.seats), /טיוטה — התחזית עדיין לא הוגשה/);
  assert.match(render(submitted.seats, submitted), /התחזית הוגשה — אין שינויים שלא הוגשו/);
  assert.match(render({ likud: 119 }, submitted), /יש שינויים שלא הוגשו — התחזית הקודמת עדיין בתוקף/);
  assert.match(render({ likud: 119 }, submitted), /חזרה לתחזית שהוגשה/);
  assert.match(render({}, undefined, true), /טוענים את מצב ההגשה/);
});

test('failed prediction loading is unavailable rather than loading or ready to submit', () => {
  const html = renderToStaticMarkup(<SeatPicker currentSeats={submitted.seats} prediction={submitted} hasLoadError isSubmitting={false} isLocked={false} onSeatsChange={() => {}} onSubmitPrediction={async () => {}}/>);
  assert.match(html, /מצב ההגשה אינו זמין — לא ניתן לטעון את התחזית/);
  assert.doesNotMatch(html, /טוענים את מצב ההגשה/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>מצב ההגשה אינו זמין<\/button>/);
});

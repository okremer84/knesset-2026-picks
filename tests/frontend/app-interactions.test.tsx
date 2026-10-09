import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import type { League, Prediction } from '../../src/types';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
  HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
// jsdom supplies DOM events but not native dialog presentation.
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
const { createRoot } = await import('react-dom/client');
const { default: App } = await import('../../src/App');
const { AuthGate } = await import('../../src/components/AuthGate');
const { clearCsrf } = await import('../../src/lib/api');

const submitted: Prediction = { id: 'pick', userId: 1, memberName: 'Tester', pickName: 'Saved name', seats: { likud: 120 }, turnoutPercentage: 70, note: 'Saved note', submittedAt: '2026-10-06T12:00:00Z' };

async function start(t: test.TestContext, initialPick: Prediction | null = null) {
  window.history.replaceState({}, '', '/?tab=picker');
  localStorage.clear();
  clearCsrf();
  const api = { pick: initialPick, refreshFailure: '', saveFailure: false, saves: 0 };
  const league: League = {
    id: 'league', name: 'Our league', creatorName: 'Tester', isCommissioner: true,
    isLocked: false, locksAt: '2026-10-27T18:00:00Z', inviteCode: 'x'.repeat(40),
    predictionsHidden: true, submittedCount: 0, totalPlayersCount: 1, benchmarkSurvey: null,
    rankings: [], scoringVersion: '1', createdAt: '2026-10-06', members: [],
    participants: [{ userId: 1, name: 'Tester', submitted: false }],
  };
  const refreshes = new Map<number, () => Promise<void>>();
  let timerId = 0;
  window.setInterval = ((fn: () => Promise<void>) => { refreshes.set(++timerId, fn); return timerId; }) as typeof window.setInterval;
  window.clearInterval = id => { refreshes.delete(id); };
  window.fetch = async (input, init) => {
    const url = String(input);
    if (url === '/api/auth/user') return Response.json({ user: { id: 1, name: 'Tester', email: 'test@example.org' } });
    if (url === '/api/auth/config') return Response.json({ googleEnabled: true });
    if (url === '/api/csrf') return Response.json({ token: 'test-csrf' });
    if (url === '/api/surveys') return Response.json({ surveys: [], sync: null });
    if (url === '/api/leagues') return Response.json({ leagues: [{ id: league.id, name: league.name }] });
    if (url === '/api/leagues/league') {
      if (api.saves && api.refreshFailure === 'network') throw new Error('League refresh unavailable');
      if (api.saves && api.refreshFailure === 'json') return new Response('invalid JSON');
      if (api.saves && api.refreshFailure === 'status') return new Response('', { status: 503 });
      return Response.json({ league: { ...league, members: api.pick ? [api.pick] : [] } });
    }
    if (url === '/api/my-picks') return Response.json({ pick: api.pick, picks: api.pick ? [api.pick] : [], isLocked: false });
    if (url === '/api/my-pick') {
      api.saves++;
      if (api.saveFailure) return Response.json({ message: 'Save rejected' }, { status: 422 });
      api.pick = { ...submitted, ...JSON.parse(String(init?.body)), submittedAt: '2026-10-06T12:01:00Z' };
      return Response.json({ pick: api.pick, picks: [api.pick], isLocked: false });
    }
    throw new Error('Unexpected request: ' + url);
  };
  const container = document.getElementById('root')!;
  let root = createRoot(container);
  const render = () => act(async () => { root.render(<AuthGate><App/></AuthGate>); });
  await render();
  t.after(async () => { await act(async () => root.unmount()); });
  return { api, async reload() { await act(async () => root.unmount()); root = createRoot(container); await render(); },
    async refresh() { await act(async () => { for (const fn of [...refreshes.values()]) await fn(); }); } };
}

function input(label: string): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  assert.ok(element, 'input exists: ' + label);
  return element;
}
async function fill(label: string, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input(label), value);
    input(label).dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
async function click(text: string) {
  const button = [...document.querySelectorAll('button')].find(b => b.textContent === text);
  assert.ok(button, 'button exists: ' + text);
  assert.equal(button.disabled, false, 'button is enabled: ' + text);
  await act(async () => button.click());
}
async function openDraft() {
  await fill('מנדטים להליכוד', '120');
  await click('הגשת התחזית');
  await fill('שם התחזית', 'My draft');
  await fill('תחזית אחוז הצבעה ארצי', '71.5');
  await fill('הערה לתחזית', 'Draft note');
}
async function submit() {
  await act(async () => document.querySelector('dialog form')!.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
}
function assertDraft() {
  assert.equal(input('שם התחזית').value, 'My draft');
  assert.equal(input('תחזית אחוז הצבעה ארצי').value, '71.5');
  assert.equal(input('הערה לתחזית').value, 'Draft note');
}

test('seat buttons skip results below four in both directions', async t => {
  await start(t);
  const adjust = async (direction: 'הוספת' | 'הפחתת') => {
    const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${direction} מנדט להליכוד"]`)!;
    await act(async () => button.click());
  };
  assert.equal(input('מנדטים להליכוד').value, '');
  await adjust('הוספת');
  assert.equal(input('מנדטים להליכוד').value, '4');
  await adjust('הוספת');
  assert.equal(input('מנדטים להליכוד').value, '5');
  await adjust('הפחתת');
  assert.equal(input('מנדטים להליכוד').value, '4');
  await adjust('הפחתת');
  assert.equal(input('מנדטים להליכוד').value, '');
});

test('typing multi-digit seats works and a below-minimum draft cannot be submitted', async t => {
  await start(t);
  await fill('מנדטים להליכוד', '1');
  assert.equal(input('מנדטים להליכוד').value, '1');
  await fill('מנדטים להליכוד', '12');
  await act(async () => input('מנדטים להליכוד').dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })));
  assert.equal(input('מנדטים להליכוד').value, '12');

  await fill('מנדטים להליכוד', '117');
  await fill('מנדטים לביחד', '3');
  const submitButton = [...document.querySelectorAll('button')].find(b => b.textContent === 'הגשת התחזית')!;
  assert.equal(submitButton.disabled, true);
  assert.equal(input('מנדטים לביחד').getAttribute('aria-invalid'), 'true');
  await act(async () => input('מנדטים לביחד').dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })));
  assert.equal(input('מנדטים לביחד').value, '4');
  await fill('מנדטים להליכוד', '116');
  assert.equal(submitButton.disabled, false);
});

test('the full draft survives tab navigation and reloading the app', async t => {
  const app = await start(t);
  await openDraft();
  await click('ביטול');
  await click('סקרים אחרונים');
  await click('התחזית שלי');
  assert.equal(input('מנדטים להליכוד').value, '120');
  await click('הגשת התחזית');
  assertDraft();
  await app.reload();
  await click('הגשת התחזית');
  assertDraft();
});

for (const failure of ['network', 'json', 'status']) {
  test(`a successful save stays successful when the league refresh fails (${failure})`, async t => {
    const { api } = await start(t);
    api.refreshFailure = failure;
    await openDraft();
    await submit();
    assert.equal(api.saves, 1);
    assert.equal(api.pick?.pickName, 'My draft');
    assert.ok(!document.querySelector('dialog'), 'submission dialog closes');
    assert.ok(document.body.textContent?.includes('התחזית שלך נשמרה בהצלחה'));
    assert.ok(!document.body.textContent?.includes('League refresh unavailable'));
  });
}

test('a failed save retains the draft and shows the save error', async t => {
  const { api } = await start(t);
  api.saveFailure = true;
  await openDraft();
  await submit();
  assert.equal(api.pick, null);
  assertDraft();
  assert.ok(document.body.textContent?.includes('Save rejected'));
});

test('reset restores all submitted fields, and background updates preserve local edits', async t => {
  const app = await start(t, submitted);
  await click('עדכון התחזית');
  await fill('שם התחזית', 'My draft');
  await fill('תחזית אחוז הצבעה ארצי', '71.5');
  await fill('הערה לתחזית', 'Draft note');
  app.api.pick = { ...submitted, note: 'Remote note', submittedAt: '2026-10-06T12:02:00Z' };
  await app.refresh();
  assertDraft();
  await click('ביטול');
  await click('חזרה לתחזית שהוגשה');
  await click('עדכון התחזית');
  assert.equal(input('שם התחזית').value, 'Saved name');
  assert.equal(input('תחזית אחוז הצבעה ארצי').value, '70');
  assert.equal(input('הערה לתחזית').value, 'Remote note');
});

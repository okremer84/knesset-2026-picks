import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import type { League, Prediction, SavedPick, Survey } from '../../src/types';
import resultFeed from '../../data/election-results.json';
import actualFeed from '../../data/actual-results.json';

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

async function start(t: test.TestContext, initialPick: Prediction | null = null, options: { failPickRead?: boolean; singleLeague?: boolean; noLeagues?: boolean; personalPick?: Prediction; personalGate?: Promise<void>; url?: string; failCreatedPick?: boolean } = {}) {
  window.history.replaceState({}, '', options.url ?? '/?tab=picker');
  localStorage.clear();
  clearCsrf();
  const api = { surveys: [] as Survey[], surveyFailure: false, pick: initialPick, refreshFailure: '', saveFailure: false, saves: 0, creates: 0, failCreatedPick: options.failCreatedPick ?? false, joins: 0, locked: false, failPickRead: options.failPickRead ?? false, secondPick: null as Prediction | null, personalPick: (options.personalPick ?? null) as Prediction | null, savedLeagueId: '', extraPicks: [] as SavedPick[], gates: new Map<string, Promise<void>>() };
  if (options.personalGate) api.gates.set('/api/my-picks', options.personalGate);
  const league: League = {
    id: 'league', name: 'Our league', creatorName: 'Tester', isCommissioner: true,
    isLocked: false, locksAt: '2026-10-27T18:00:00Z', inviteCode: 'x'.repeat(40),
    predictionsHidden: true, submittedCount: 0, totalPlayersCount: 1, benchmarkSurvey: null,
    rankings: [], scoringVersion: '1', createdAt: '2026-10-06', members: [],
    participants: [{ userId: 1, name: 'Tester', submitted: false }],
  };
  const refreshes = new Map<number, () => Promise<void>>();
  const intervals: number[] = [];
  let timerId = 0;
  window.setInterval = ((fn: () => Promise<void>, ms: number) => { intervals.push(ms); refreshes.set(++timerId, fn); return timerId; }) as typeof window.setInterval;
  window.clearInterval = id => { refreshes.delete(id); };
  window.fetch = async (input, init) => {
    const url = String(input);
    await api.gates.get(url);
    if (url === '/api/auth/user') return Response.json({ user: { id: 1, name: 'Tester', email: 'test@example.org' } });
    if (url === '/api/auth/config') return Response.json({ googleEnabled: true });
    if (url === '/api/csrf') return Response.json({ token: 'test-csrf' });
    if (url === '/api/results') return api.surveyFailure ? new Response('', { status: 503 }) : Response.json({ surveys: api.surveys, sync: null });
    if (url === '/api/leagues/join') { api.joins++; return Response.json({ league: { ...league, id: 'created', name: 'Joined league' } }); }
    if (url.startsWith('/api/my-picks') && api.failPickRead) return new Response('', { status: 503 });
    if (url === '/api/election') return Response.json({ deadlineLimit: '2026-10-27T18:00:00Z' });
    if (url === '/api/leagues' && init?.method === 'POST') { api.creates++; return Response.json({ league: { ...league, id: 'created', name: 'Created league' } }); }
    if (url === '/api/leagues') return Response.json({ leagues: options.noLeagues ? [] : [{ id: league.id, name: league.name }, ...(options.singleLeague ? [] : [{ id: 'second', name: 'Second league' }])] });
    if (url === '/api/leagues/created') return Response.json({ league: { ...league, id: 'created', name: 'Created league' } });
    if (url === '/api/my-picks?leagueId=created') return api.failCreatedPick ? new Response('', { status: 503 }) : Response.json({ pick: null, picks: [], isLocked: false });
    if (url === '/api/leagues/second') return Response.json({ league: { ...league, id: 'second', name: 'Second league', members: api.secondPick ? [api.secondPick] : [] } });
    if (url === '/api/leagues/league') {
      if (api.saves && api.refreshFailure === 'network') throw new Error('League refresh unavailable');
      if (api.saves && api.refreshFailure === 'json') return new Response('invalid JSON');
      if (api.saves && api.refreshFailure === 'status') return new Response('', { status: 503 });
      return Response.json({ league: { ...league, members: api.pick ? [api.pick] : [] } });
    }
    if (url === '/api/my-picks?leagueId=second') return Response.json({ pick: api.secondPick, picks: [...api.extraPicks, api.pick ? { ...api.pick, leagueId: 'league', leagueName: 'Our league' } : null, api.secondPick ? { ...api.secondPick, leagueId: 'second', leagueName: 'Second league' } : null].filter(Boolean), isLocked: false });
    if (url === '/api/my-picks') return Response.json({ pick: api.personalPick, picks: api.pick ? [{ ...api.pick, leagueId: 'league', leagueName: 'Our league' }] : [], isLocked: false });
    if (url.startsWith('/api/my-picks')) return Response.json({ pick: api.pick, picks: api.pick ? [api.pick] : [], isLocked: api.locked });
    if (url === '/api/my-pick') {
      api.saves++;
      if (api.saveFailure) return Response.json({ message: 'Save rejected' }, { status: 422 });
      const body = JSON.parse(String(init?.body));
      api.savedLeagueId = body.leagueId;
      if (!body.leagueId) {
        api.personalPick = { ...submitted, ...body };
        return Response.json({ pick: api.personalPick, picks: [api.personalPick, api.pick].filter(Boolean), isLocked: false });
      }
      if (body.leagueId === 'second') {
        api.secondPick = { ...submitted, ...body };
        return Response.json({ pick: api.secondPick, picks: [...api.extraPicks, api.pick ? { ...api.pick, leagueId: 'league', leagueName: 'Our league' } : null, api.secondPick ? { ...api.secondPick, leagueId: 'second', leagueName: 'Second league' } : null].filter(Boolean), isLocked: false });
      }
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
  return { api, league, intervals, async reload() { await act(async () => root.unmount()); root = createRoot(container); await render(); },
    async refreshWithoutRender() { await Promise.all([...refreshes.values()].map(fn => fn())); },
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
  await click('תוצאות אמת');
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


test('switching leagues isolates drafts and submits to the selected league', async t => {
  const app = await start(t, submitted);
  const switchLeague = async (id: string) => {
    await act(async () => {
      const select = document.querySelector<HTMLSelectElement>('select')!;
      select.value = id;
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
  };
  await fill('מנדטים להליכוד', '80');
  await switchLeague('second');
  assert.equal(input('מנדטים להליכוד').value, '');
  await openDraft();
  await click('ביטול');
  await switchLeague('league');
  assert.equal(input('מנדטים להליכוד').value, '80');
  await switchLeague('second');
  assert.equal(input('מנדטים להליכוד').value, '120');
  await click('הגשת התחזית');
  assertDraft();
  await submit();
  assert.equal(app.api.savedLeagueId, 'second');
  assert.equal(app.api.pick?.pickName, 'Saved name');
  assert.equal(app.api.secondPick?.pickName, 'My draft');
});

test('Balad is absent from new picks', async t => {
  await start(t);
  assert.equal(document.querySelectorAll('.party-card').length, 13);
  assert.ok(![...document.querySelectorAll('input')].some(el => el.getAttribute('aria-label') === 'מנדטים לבל"ד'));
  assert.ok(document.querySelector('.party-grid')?.textContent?.includes('הרשימה המשותפת'));
  assert.ok(!document.querySelector('.party-grid')?.textContent?.includes('בל"ד'));
});


test('copying a league pick creates an editable draft without submitting or changing the source', async t => {
  const app = await start(t, submitted);
  await act(async () => {
    const select = document.querySelector<HTMLSelectElement>('select')!;
    select.value = 'second';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  assert.equal(document.querySelector('dialog'), null);
  const actions = document.querySelector('.league-pick-import')!;
  assert.equal(document.querySelector('.prediction-dock .league-pick-import'), null);
  assert.ok(!document.body.textContent?.includes('התחזית נשמרת רק לליגת'));
  assert.ok(document.querySelector('.page-heading .league-pick-import'));
  await click('העתק את הבחירה מOur league');
  assert.equal(document.querySelector('dialog') === null, true);
  assert.equal(input('מנדטים להליכוד').value, '120');
  assert.equal(app.api.saves, 0);
  assert.equal(app.api.secondPick, null);
  await click('הגשת התחזית');
  assert.equal(input('שם התחזית').value, 'Saved name');
  assert.equal(input('תחזית אחוז הצבעה ארצי').value, '70');
  assert.equal(input('הערה לתחזית').value, 'Saved note');
  await fill('שם התחזית', 'Second league version');
  await fill('הערה לתחזית', 'Changed only here');
  await click('ביטול');
  await app.reload();
  await click('הגשת התחזית');
  assert.equal(input('שם התחזית').value, 'Second league version');
  await submit();
  assert.equal(app.api.savedLeagueId, 'second');
  assert.equal(app.api.secondPick?.note, 'Changed only here');
  assert.equal(app.api.pick?.note, 'Saved note');
  assert.equal(app.api.pick?.pickName, 'Saved name');
});


test('multiple source leagues require choosing a pick from the copy modal', async t => {
  const app = await start(t, submitted);
  app.api.extraPicks = [{ ...submitted, id: 'third-pick', leagueId: 'third', leagueName: 'Third league', seats: { beyachad: 120 }, note: 'Third note' }];
  await act(async () => {
    const select = document.querySelector<HTMLSelectElement>('select')!;
    select.value = 'second';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await click('העתק בחירה מליגה אחת');
  const actions = document.querySelector('dialog')!;
  const select = actions.querySelector<HTMLSelectElement>('select[aria-label="ליגה להעתקת בחירה"]')!;
  assert.ok(select);
  assert.equal(select.options.length, 3);
  const button = [...actions.querySelectorAll('button')].find(b => b.textContent === 'העתק')!;
  assert.equal(button.disabled, true);
  await act(async () => {
    select.value = 'third-pick';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await click('העתק');
  assert.equal(input('מנדטים לביחד').value, '120');
  assert.equal(input('מנדטים להליכוד').value, '');
  assert.equal(app.api.saves, 0);
});


async function chooseLeague(id: string) {
  await act(async () => {
    const select = document.querySelector<HTMLSelectElement>('select')!;
    select.value = id;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}

test('league switching keeps the chosen dropdown value and shows no empty or falsely locked editor', async t => {
  const app = await start(t, submitted);
  app.api.secondPick = { ...submitted, id: 'second-pick', seats: { likud: 80, beyachad: 40 } };
  let releaseLeague!: () => void;
  let releasePick!: () => void;
  app.api.gates.set('/api/leagues/second', new Promise(resolve => { releaseLeague = resolve; }));
  app.api.gates.set('/api/my-picks?leagueId=second', new Promise(resolve => { releasePick = resolve; }));
  await chooseLeague('second');
  assert.equal(document.querySelector<HTMLSelectElement>('select')!.value, 'second', 'dropdown must not snap back while loading');
  assert.equal(input('מנדטים להליכוד').value, '120');
  await act(async () => releaseLeague());
  assert.equal(input('מנדטים להליכוד').value, '120', 'keep the previous editor until the new pick is ready');
  assert.ok(!document.body.textContent?.includes('התחזית שלך נעולה.'));
  assert.ok(!document.querySelector('.prediction-dock')?.textContent?.includes('ההגשה נסגרה'));
  assert.ok(!document.querySelector('.prediction-dock')?.textContent?.includes('התחזית נעולה'));
  await act(async () => releasePick());
  assert.equal(input('מנדטים להליכוד').value, '80');
});

test('old personal links open a league and the dropdown only contains leagues', async t => {
  const app = await start(t, submitted, { url: '/?tab=picker&league=personal' });
  assert.equal(document.querySelector<HTMLSelectElement>('select')!.value, 'league');
  assert.ok(!document.querySelector('option[value=""]'));
  await fill('מנדטים להליכוד', '72');
  await app.reload();
  assert.equal(document.querySelector<HTMLSelectElement>('select')!.value, 'league');
  assert.equal(input('מנדטים להליכוד').value, '72');
});

test('creating a league after dismissing a pending save cannot change the editor', async t => {
  const app = await start(t);
  let releaseSave!: () => void;
  app.api.gates.set('/api/my-pick', new Promise(resolve => { releaseSave = resolve; }));
  await openDraft();
  await submit();
  await act(async () => document.querySelector('dialog')!.dispatchEvent(new window.Event('cancel', { cancelable: true })));
  await click('הליגות שלי');
  await click('יצירת ליגה חדשה');
  await act(async () => {
    for (const [selector, value] of [['#league-name', 'Created league'], ['input[type="date"]', '2026-10-26']]) {
      const el = document.querySelector<HTMLInputElement>(selector)!;
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(el, value);
      el.dispatchEvent(new window.Event('input', { bubbles: true }));
      el.dispatchEvent(new window.Event('change', { bubbles: true }));
    }
  });
  await act(async () => document.querySelector('dialog form')!.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
  assert.equal(app.api.creates, 0, 'creation must wait for the outstanding submission');
  assert.ok(document.body.textContent?.includes('יש להמתין לסיום הפעולה הנוכחית'));
  await act(async () => releaseSave());
  assert.equal(app.api.pick?.pickName, 'My draft');
  assert.equal(localStorage.getItem('knesset_fantasy_draft_details_1_second'), null);
});


test('successful creation survives a failed destination load and opening it again does not create another league', async t => {
  const app = await start(t, submitted);
  await fill('מנדטים להליכוד', '80');
  app.api.failCreatedPick = true;
  await click('הליגות שלי');
  await click('יצירת ליגה חדשה');
  await act(async () => {
    for (const [selector, value] of [['#league-name', 'Created league'], ['input[type="date"]', '2026-10-26']]) {
      const el = document.querySelector<HTMLInputElement>(selector)!;
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(el, value);
      el.dispatchEvent(new window.Event('input', { bubbles: true }));
      el.dispatchEvent(new window.Event('change', { bubbles: true }));
    }
  });
  await act(async () => document.querySelector('dialog form')!.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
  assert.equal(app.api.creates, 1);
  assert.equal(document.querySelector('dialog') === null, true, 'successful creation closes the form even when opening fails');
  assert.ok(document.querySelector('select option[value="created"]'), 'created league remains selectable');
  assert.equal(document.querySelector<HTMLSelectElement>('select')!.value, 'league');
  await click('התחזית שלי');
  assert.equal(input('מנדטים להליכוד').value, '80');
  app.api.failCreatedPick = false;
  await chooseLeague('created');
  assert.equal(document.querySelector<HTMLSelectElement>('select')!.value, 'created');
  assert.equal(input('מנדטים להליכוד').value, '');
  assert.equal(app.api.creates, 1);
});


test('users without leagues see create and join actions instead of a personal editor', async t => {
  const app = await start(t, null, { noLeagues: true, url: '/?tab=picker&league=personal' });
  assert.ok(!document.querySelector('.party-grid'));
  assert.ok(!document.body.textContent?.includes('התחזית שלך נעולה.'));
  assert.ok(!document.querySelector('select'));
  assert.ok(document.querySelector('[aria-label="קוד הזמנה"]'));
  assert.ok([...document.querySelectorAll('button')].some(button => button.textContent === 'יצירת ליגה'));
  assert.equal(localStorage.getItem('knesset_fantasy_user_seats_1'), null);
  assert.equal(app.api.saves, 0);
});

for (const reason of ['locked', 'failed refresh']) {
  test(`submit dialog remains open when saving becomes unavailable: ${reason}`, async t => {
    const app = await start(t);
    await openDraft();
    app.api.locked = reason === 'locked';
    app.api.failPickRead = reason === 'failed refresh';
    await app.refresh();
    await submit();
    assert.equal(document.querySelector('dialog') !== null, true);
    assert.equal(app.api.saves, 0);
    assertDraft();
    assert.ok(document.querySelector('dialog')?.textContent?.includes(reason === 'locked' ? 'מועד ההגשה הסתיים' : 'לא ניתן לשמור'));
  });
}

test('successful joining remains selectable when destination loading fails', async t => {
  const app = await start(t, submitted, { url: '/?tab=picker&invite=' + 'x'.repeat(40), failCreatedPick: true });
  assert.equal(app.api.joins, 1);
  assert.equal(document.querySelector('select option[value="created"]') !== null, true);
  app.api.failCreatedPick = false;
  await chooseLeague('created');
  assert.equal(document.querySelector<HTMLSelectElement>('select')!.value, 'created');
  assert.equal(app.api.joins, 1);
});


test('retired party stays in an existing pick but is excluded when copied into a new league', async t => {
  const original = { ...submitted, seats: { likud: 110, kachol_lavan: 10 } };
  const app = await start(t, original);
  assert.equal(input('מנדטים לכחול לבן').value, '10');
  await chooseLeague('second');
  assert.ok(!document.querySelector('[aria-label="מנדטים לכחול לבן"]'));
  await click('העתק את הבחירה מOur league');
  assert.equal(document.querySelector('dialog') === null, true);
  assert.equal(input('מנדטים להליכוד').value, '110');
  assert.equal(document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'), '110');
  await fill('מנדטים להליכוד', '120');
  await click('הגשת התחזית');
  await submit();
  assert.equal(app.api.secondPick?.seats.kachol_lavan ?? 0, 0);
  assert.equal(app.api.pick?.seats.kachol_lavan, 10);
});

test('details edited after a failed refresh survive reopening the league', async t => {
  const app = await start(t);
  await openDraft();
  app.api.failPickRead = true;
  await app.refresh();
  await fill('שם התחזית', 'Offline edit');
  await fill('תחזית אחוז הצבעה ארצי', '75');
  await fill('הערה לתחזית', 'Offline note');
  await click('ביטול');
  app.api.failPickRead = false;
  await chooseLeague('second');
  await chooseLeague('league');
  await click('הגשת התחזית');
  assert.equal(input('שם התחזית').value, 'Offline edit');
  assert.equal(input('תחזית אחוז הצבעה ארצי').value, '75');
  assert.equal(input('הערה לתחזית').value, 'Offline note');
});

test('a refresh finishing after a switch but before effect cleanup cannot overwrite the destination draft', async t => {
  const app = await start(t, submitted);
  app.api.secondPick = { ...submitted, id: 'second-pick', seats: { likud: 80, beyachad: 40 } };
  const fetch = window.fetch;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let intercepted = false;
  let destinationReads = 0;
  let oldSignal: AbortSignal | null | undefined;
  window.fetch = async (url, init) => {
    if (String(url) === '/api/my-picks?leagueId=league' && !intercepted) {
      intercepted = true;
      oldSignal = init?.signal;
      await pending;
      const response = Response.json({});
      response.json = async () => ({ pick: submitted, picks: [submitted], isLocked: true });
      return response;
    }
    if (String(url) === '/api/leagues/second') {
      const response = Response.json({});
      response.json = async () => ({ league: { id: 'second', name: 'Second league', isLocked: false } });
      return response;
    }
    if (String(url) === '/api/my-picks?leagueId=second') {
      if (++destinationReads > 1) return new Promise<Response>(() => {});
      const response = Response.json({});
      response.json = async () => ({ pick: app.api.secondPick, picks: [], isLocked: false });
      return response;
    }
    return fetch(url, init);
  };
  await act(async () => {
    const refreshing = app.refreshWithoutRender();
    assert.ok(intercepted, 'old pick refresh started before switching');
    const select = document.querySelector<HTMLSelectElement>('select')!;
    select.value = 'second';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    // Let destination loading finish while React is still batching this turn.
    for (let i = 0; i < 40; i++) await Promise.resolve();
    assert.equal(oldSignal?.aborted, false, 'old effect has not cleaned up');
    release();
    await refreshing;
  });
  assert.equal(input('מנדטים להליכוד').disabled, false);
  assert.equal(input('מנדטים להליכוד').value, '80');
  assert.equal(JSON.parse(localStorage.getItem('knesset_fantasy_user_seats_1_second')!).likud, 80);
});


test('a failed initial load can retry the only league from an empty selection', async t => {
  const app = await start(t, submitted, { singleLeague: true, failPickRead: true });
  const select = document.querySelector<HTMLSelectElement>('select')!;
  assert.equal(select.value, '');
  assert.ok(select.querySelector<HTMLOptionElement>('option[value=""]')?.disabled);
  app.api.failPickRead = false;
  await chooseLeague('league');
  assert.equal(input('מנדטים להליכוד').value, '120');
  assert.equal(app.api.creates, 0);
  assert.equal(app.api.joins, 0);
});

for (const failure of ['writes', 'reads and writes']) {
  test('drafts survive league switches when storage fails: ' + failure, async t => {
    const app = await start(t);
    // Start with an older persisted draft, then make newer edits that cannot persist.
    await openDraft();
    await click('ביטול');
    const prototype = window.Storage.prototype;
    const getItem = prototype.getItem;
    const setItem = prototype.setItem;
    prototype.setItem = () => { throw new Error('Storage unavailable'); };
    if (failure === 'reads and writes') prototype.getItem = () => { throw new Error('Storage unavailable'); };
    try {
      await click('הגשת התחזית');
      await fill('שם התחזית', 'In memory');
      await fill('תחזית אחוז הצבעה ארצי', '77');
      await fill('הערה לתחזית', 'Unsaved note');
      await click('ביטול');
      await fill('מנדטים להליכוד', '80');
      await fill('מנדטים לביחד', '40');
      await chooseLeague('second');
      await fill('מנדטים להליכוד', '100');
      await chooseLeague('league');
      assert.equal(input('מנדטים להליכוד').value, '80');
      assert.equal(input('מנדטים לביחד').value, '40');
      await click('הגשת התחזית');
      assert.equal(input('שם התחזית').value, 'In memory');
      assert.equal(input('תחזית אחוז הצבעה ארצי').value, '77');
      assert.equal(input('הערה לתחזית').value, 'Unsaved note');
      await click('ביטול');
      await chooseLeague('second');
      assert.equal(input('מנדטים להליכוד').value, '100');
      assert.equal(app.api.saves, 0);
    } finally {
      prototype.getItem = getItem;
      prototype.setItem = setItem;
    }
  });
}


for (const edited of [false, true]) {
  test('returning to a league reconciles newer submissions while preserving local edits: ' + edited, async t => {
    const app = await start(t, submitted);
    if (edited) {
      await click('עדכון התחזית');
      await fill('שם התחזית', 'Local name');
      await click('ביטול');
      await fill('מנדטים להליכוד', '80');
      await fill('מנדטים לביחד', '40');
    }
    await chooseLeague('second');
    app.api.pick = { ...submitted, seats: { likud: 90, beyachad: 30 }, pickName: 'Remote name', note: 'Remote note', turnoutPercentage: 77, submittedAt: '2026-10-06T13:00:00Z' };
    await chooseLeague('league');
    assert.equal(input('מנדטים להליכוד').value, edited ? '80' : '90');
    await click('עדכון התחזית');
    assert.equal(input('שם התחזית').value, edited ? 'Local name' : 'Remote name');
    assert.equal(input('הערה לתחזית').value, 'Remote note');
    assert.equal(input('תחזית אחוז הצבעה ארצי').value, '77');
    assert.equal(app.api.saves, 0);
  });
}

test('actual results refresh every five minutes and survive a temporary API failure', async t => {
  const app = await start(t);
  assert.ok(app.intervals.includes(300000), 'actual-result refresh uses a five-minute interval');
  app.api.surveys = actualFeed.surveys as Survey[];
  await app.refresh();
  await click('תוצאות אמת');
  assert.match(document.body.textContent!, /37% מהקולות נספרו/);
  assert.match(document.body.textContent!, /עדכון התוצאות:/);
  assert.match(document.body.textContent!, /כל 5 דקות/);
  assert.equal(document.querySelectorAll('.exit-poll-channels button').length, 0);
  assert.doesNotMatch(document.body.textContent!, /תוצאות המדגמים|המגמה לאורך זמן/);
  app.api.surveyFailure = true;
  await app.refresh();
  assert.match(document.body.textContent!, /לא ניתן לעדכן את הנתונים/);
  assert.match(document.body.textContent!, /37% מהקולות נספרו/);
  app.api.surveyFailure = false;
  app.api.surveys = [];
  await app.refresh();
  assert.match(document.body.textContent!, /ממתינים לפרסום תוצאות האמת/);
  assert.doesNotMatch(document.body.textContent!, /37%|לא ניתן לעדכן את הנתונים/);
});

test('the league page keeps the selected channel on refresh and removes withdrawn results', async t => {
  const results = resultFeed.surveys as Survey[];
  const app = await start(t, { ...submitted, seats: results[3].seats });
  app.api.surveys = results;
  app.league.isLocked = true;
  app.league.predictionsHidden = false;
  app.league.benchmarkSurvey = results[3];
  app.league.targetSurveyId = results[3].id;
  await app.refresh();
  await click('הליגות שלי');
  const selector = () => document.querySelector<HTMLSelectElement>('#league-survey')!;
  const score = () => document.querySelector('.league-score')!.textContent;
  assert.equal(selector().options.length, 4);
  assert.equal(selector().value, results[0].id);
  assert.equal(score(), '12');
  await act(async () => {
    selector().value = results[3].id;
    selector().dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  assert.equal(score(), '0');
  await app.refresh();
  assert.equal(selector().value, results[3].id);
  assert.equal(score(), '0');
  app.api.surveys = results.map((s, i) => i === 3 ? { ...s, seats: results[0].seats } : s);
  await app.refresh();
  assert.equal(selector().value, results[3].id);
  assert.equal(score(), '12');
  app.api.surveys = results.filter(s => s.id !== results[3].id);
  await app.refresh();
  assert.equal(selector().options.length, 3, 'stale league benchmark cannot restore a withdrawn source');
  assert.equal(selector().value, results[0].id);
  app.api.surveys = [];
  await app.refresh();
  assert.equal(selector(), null);
  assert.equal(score(), '—');
  assert.match(document.body.textContent!, /ממתינים לפרסום תוצאות האמת/);
});

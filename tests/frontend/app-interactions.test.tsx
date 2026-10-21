import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import type { League, Prediction, SavedPick } from '../../src/types';

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

async function start(t: test.TestContext, initialPick: Prediction | null = null, options: { personalPick?: Prediction; personalGate?: Promise<void>; url?: string; failCreatedPick?: boolean } = {}) {
  window.history.replaceState({}, '', options.url ?? '/?tab=picker');
  localStorage.clear();
  clearCsrf();
  const api = { pick: initialPick, refreshFailure: '', saveFailure: false, saves: 0, creates: 0, failCreatedPick: options.failCreatedPick ?? false, joins: 0, locked: false, failPickRead: false, secondPick: null as Prediction | null, personalPick: (options.personalPick ?? null) as Prediction | null, savedLeagueId: '', extraPicks: [] as SavedPick[], gates: new Map<string, Promise<void>>() };
  if (options.personalGate) api.gates.set('/api/my-picks', options.personalGate);
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
    await api.gates.get(url);
    if (url === '/api/auth/user') return Response.json({ user: { id: 1, name: 'Tester', email: 'test@example.org' } });
    if (url === '/api/auth/config') return Response.json({ googleEnabled: true });
    if (url === '/api/csrf') return Response.json({ token: 'test-csrf' });
    if (url === '/api/surveys') return Response.json({ surveys: [], sync: null });
    if (url === '/api/leagues/join') { api.joins++; return Response.json({ league: { ...league, id: 'created', name: 'Joined league' } }); }
    if (url.startsWith('/api/my-picks') && api.failPickRead) return new Response('', { status: 503 });
    if (url === '/api/election') return Response.json({ deadlineLimit: '2026-10-27T18:00:00Z' });
    if (url === '/api/leagues' && init?.method === 'POST') { api.creates++; return Response.json({ league: { ...league, id: 'created', name: 'Created league' } }); }
    if (url === '/api/leagues') return Response.json({ leagues: [{ id: league.id, name: league.name }, { id: 'second', name: 'Second league' }] });
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
  await click('העתק בחירה מליגה אחת');
  assert.equal(document.querySelector<HTMLSelectElement>('select[aria-label="ליגה להעתקת בחירה"]')?.value, submitted.id);
  await click('העתק');
  assert.equal(document.querySelector('dialog'), null);
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


test('personal drafts can copy a league pick without changing its submitted prediction', async t => {
  const app = await start(t, submitted);
  await act(async () => {
    const select = document.querySelector<HTMLSelectElement>('select')!;
    select.value = '';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await click('העתק בחירה מליגה אחת');
  await click('העתק');
  assert.equal(input('מנדטים להליכוד').value, '120');
  assert.equal(app.api.saves, 0);
  await click('הגשת התחזית');
  assert.equal(input('שם התחזית').value, 'Saved name');
  await fill('שם התחזית', 'Personal version');
  await submit();
  assert.equal(app.api.savedLeagueId, undefined);
  assert.equal(app.api.personalPick?.pickName, 'Personal version');
  assert.equal(app.api.pick?.pickName, 'Saved name');
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

test('personal scope and its draft survive a reload with league memberships', async t => {
  const app = await start(t, submitted);
  await chooseLeague('');
  await fill('מנדטים להליכוד', '72');
  await app.reload();
  assert.equal(document.querySelector<HTMLSelectElement>('select')!.value, '');
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


test('startup does not persist an empty personal draft before its saved pick loads', async t => {
  let release!: () => void;
  const app = await start(t, submitted, { personalPick: { ...submitted, seats: { likud: 88, beyachad: 32 } }, personalGate: new Promise(resolve => { release = resolve; }) });
  assert.equal(localStorage.getItem('knesset_fantasy_user_seats_1'), null);
  await act(async () => release());
  await chooseLeague('');
  assert.equal(input('מנדטים להליכוד').value, '88');
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
  await click('העתק בחירה מליגה אחת');
  await click('העתק');
  assert.equal(input('מנדטים להליכוד').value, '110');
  assert.equal(document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'), '110');
  await fill('מנדטים להליכוד', '120');
  await click('הגשת התחזית');
  await submit();
  assert.equal(app.api.secondPick?.seats.kachol_lavan ?? 0, 0);
  assert.equal(app.api.pick?.seats.kachol_lavan, 10);
});

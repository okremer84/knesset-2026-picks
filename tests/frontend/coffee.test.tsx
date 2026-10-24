import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { CoffeeView, coffeeStandings, type CoffeeBet } from '../../src/components/CoffeeView';
import { initialTab } from '../../src/lib/navigation';
const a = { id: 1, name: 'נועה' }, b = { id: 2, name: 'אורי' };
const base: CoffeeBet = { id: 1, question: 'ביבי יהיה ראש הממשלה הבא?', terms: 'במועד השבעת הממשלה הבאה', creator: a, opponent: null, creatorSide: true, status: 'waiting', proposerId: null, proposedOutcome: null, outcome: null, votingEndsAt: null, yesVotes: 0, noVotes: 0, myVote: null };
test('standings count wins only and track unresolved participation independently', () => {
  const bets: CoffeeBet[] = [base, { ...base, id: 2, opponent: b, status: 'settled', outcome: false }, { ...base, id: 3, opponent: b, status: 'disputed' }, { ...base, id: 4, status: 'cancelled' }];
  assert.deepEqual(coffeeStandings(bets), [{ ...b, wins: 1, losses: 0, open: 1 }, { ...a, wins: 0, losses: 1, open: 2 }]);
  assert.equal(initialTab(new URLSearchParams('tab=campaign'), null), 'coffee');
  assert.equal(initialTab(new URLSearchParams(), 'campaign'), 'coffee');
});
test('matching requires confirmation, sends authenticated action, and player filters show wins and losses', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const calls: unknown[] = [];
  let bets = [base, { ...base, id: 3, question: 'התערבות של אחרים', creator: { id: 3, name: 'רוני' } }, { ...base, id: 2, question: 'התערבות שהוכרעה', opponent: b, status: 'settled' as const, outcome: false }];
  dom.window.fetch = async (url, init) => {
    if (url === '/api/csrf') return Response.json({ token: 'token' });
    if (init?.method === 'POST') { calls.push(JSON.parse(init.body as string)); bets = bets.map(x => x.id === 1 ? { ...x, opponent: b, status: 'active' } : x); return Response.json({ ok: true }); }
    return Response.json({ bets });
  };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root')!);
  const click = async (text: string) => { const button = [...document.querySelectorAll('button')].find(b => b.textContent?.includes(text)); assert.ok(button, text); await act(async () => button.click()); };
  try {
    await act(async () => root.render(<CoffeeView userId={2}/>));
    await click('שם מאסטרקפה'); assert.equal(calls.length, 0);
    await click('אישור'); assert.deepEqual(calls, [{ action: 'join' }]);
    await click('התערבויות 2'); assert.match(document.body.textContent!, /יש תוצאה/);
    assert.match(document.body.textContent!, /התערבות של אחרים/);
    await click('ההתערבויות שלי'); assert.doesNotMatch(document.body.textContent!, /התערבות של אחרים/);
    await click('כל ההתערבויות'); assert.match(document.body.textContent!, /התערבות של אחרים/);
    await click('טבלה');
    assert.match(document.body.textContent!, /חייבים לך/);
    assert.match(document.body.textContent!, /נועה/);
    assert.ok(document.querySelector('[aria-label="רשת החובות של כולם"]'));
    await click('נועה');
    assert.ok(document.querySelector('.coffee-network-nodes button[aria-pressed="true"]'));
    await click('נועה');
    assert.equal(document.querySelector('.coffee-network-nodes button[aria-pressed="true"]'), null);
    await click('התערבויות 2'); await click('אורי');
    await click('ניצחונות'); assert.match(document.body.textContent!, /התערבות שהוכרעה/);
    await click('הפסדים'); assert.doesNotMatch(document.body.textContent!, /התערבות שהוכרעה/);
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});

test('debt branches keep both directions separate and ignore unresolved bets', async () => {
  const { coffeeDebts } = await import('../../src/components/CoffeeDebts');
  const won = { ...base, opponent: b, status: 'settled' as const, outcome: true };
  const lost = { ...won, id: 2, outcome: false };
  const result = coffeeDebts([won, { ...won, id: 3 }, lost, base], a.id);
  assert.equal(result.incoming[0].person.id, b.id);
  assert.equal(result.incoming[0].bets.length, 2);
  assert.equal(result.outgoing[0].bets.length, 1);
});

test('network aggregates all settled debts without netting, with personal totals above', async () => {
  const { CoffeeDebts, coffeeNetwork } = await import('../../src/components/CoffeeDebts');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const settled = { ...base, opponent: b, status: 'settled' as const, outcome: true };
  const bets = [settled, { ...settled, id: 2 }, { ...settled, id: 3, outcome: false }, { ...settled, id: 4, creator: { id: 3, name: 'Unrelated' } }, base];
  const network = coffeeNetwork(bets);
  assert.deepEqual(network.links, [{ from: 2, to: 1, count: 2 }, { from: 1, to: 2, count: 1 }, { from: 2, to: 3, count: 1 }]);
  const html = renderToStaticMarkup(<CoffeeDebts userId={1} bets={bets}/>);
  assert.match(html, /חייב לאחרים/);
  assert.match(html, /חייבים לך/);
  assert.match(html, /Unrelated/);
  assert.doesNotMatch(html, /<table/);
  assert.match(renderToStaticMarkup(<CoffeeDebts userId={1} bets={[base]}/>), /אין עדיין חובות/);
});

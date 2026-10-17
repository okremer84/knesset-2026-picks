import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { CampaignPicks } from '../../src/components/CampaignPicks';
import { CampaignBoard, MarketCard } from '../../src/components/CampaignView';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CampaignData, Market } from '../../src/lib/campaign';

const market: Market = { id: 'live', title: 'האם המפלגה תעבור את אחוז החסימה?', type: 'poll_value', state: 'open', action: null, closes_at: '2099-01-01T12:00:00Z', window_ends_at: '2099-01-02T12:00:00Z', contract: { source_url: 'https://example.org', yes_rule: 'כן', no_rule: 'לא', void_rule: 'חסר מקור', comparison: 'gte', threshold: 4, window_starts_at: '2099-01-01T12:00:00Z' }, quote: { id: 'q', probability: 4000, ai_probability: 4000, version: 1, tag: 'evidence_based', origin: 'ai', rationale: 'נתונים', created_at: '2026-10-17T10:00:00Z', evidence: [] }, quotes: [], bets: [], resolution: null };

test('expired cards say waiting even before the background close runs', () => {
  const html = renderToStaticMarkup(<MarketCard market={{ ...market, closes_at: '2020-01-01T00:00:00Z' }} userId={1} onSelect={() => {}} />);
  assert.match(html, /ממתינים לתוצאה/);
  assert.match(html, /disabled/);
});

test('open questions are the default, expired questions remain discoverable, and ranking shows ties honestly', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root')!);
  const data: CampaignData = { enabled: true, operator: false, wallet: { available: 1000000, outstanding: 0, profit: 0, entries: [] }, markets: [market, { ...market, id: 'expired', title: 'השאלה שנסגרה', closes_at: '2020-01-01T00:00:00Z' }], proposals: [], leaderboard: [{ user_id: 1, name: 'Main', profit: 0, roi: null, markets: 0, outstanding: 0 }, { user_id: 2, name: 'Secondary', profit: 0, roi: null, markets: 0, outstanding: 35000, potential_return: 46077 }] };
  const click = async (text: string) => { const button = [...document.querySelectorAll('button')].find(b => b.textContent === text); assert.ok(button, text); await act(async () => button.click()); };
  try {
    await act(async () => root.render(<CampaignBoard data={data} userId={2} leagueName="Pilot" onAction={async <T,>() => ({} as T)} onRefresh={async () => {}} />));
    assert.equal(document.querySelectorAll('.market-card').length, 1);
    assert.match(document.querySelector('[aria-pressed="true"]')!.textContent!, /פתוחות לקנייה/);
    await click('ממתינים לתוצאה');
    assert.equal(document.querySelector('.market-question')!.textContent, 'השאלה שנסגרה');
    await click('הכול');
    assert.equal(document.querySelectorAll('.market-card').length, 2, 'all questions remain discoverable');
    await click('טבלת המובילים');
    assert.equal(document.querySelectorAll('.scoreboard-table tbody tr').length, 2);
    assert.equal(document.querySelector('dialog'), null, 'scoreboard is a page, not a modal');
    assert.equal(document.querySelectorAll('.rank-switch').length, 0);
    assert.deepEqual([...document.querySelectorAll('.scoreboard-table tbody tr>td:first-child')].map(e => e.textContent), ['1', '1']);
    assert.match(document.querySelector('.ranking-me')!.textContent!, /Secondaryאת\/ה/);
    assert.match(document.querySelector('.ranking-me')!.textContent!, /₪350/);
    assert.match(document.querySelector('.ranking-me')!.textContent!, /₪460.77/);
    await click('סכום פתוח ↕');
    assert.match(document.querySelector('.scoreboard-table tbody tr')!.textContent!, /Secondary/);
    await click('סכום פתוח ↓');
    assert.match(document.querySelector('.scoreboard-table tbody tr')!.textContent!, /Main/);
    await click('תשואה ↕');
    assert.deepEqual([...document.querySelectorAll('.scoreboard-table tbody tr>td:first-child')].map(e => e.textContent), ['—', '—']);
    assert.match(window.location.search, /view=scoreboard/);
    await click('→ חזרה לשאלות');
    await click('פתוחות לקנייה (1)');
    await click(market.title);
    await click('+₪100');
    await click('+₪25');
    await click('+₪25');
    assert.equal((document.querySelector('[aria-label="סכום הקנייה בשקלים"]') as HTMLInputElement).value, '175');
    assert.match(document.querySelector('.buy-payout')!.textContent!, /₪437.50/);
    await act(async () => root.render(<CampaignBoard data={{ ...data, wallet: { ...data.wallet, available: 19000 } }} userId={2} leagueName="Pilot" onAction={async <T,>() => ({} as T)} onRefresh={async () => {}} />));
    assert.ok([...document.querySelectorAll<HTMLButtonElement>('.buy-presets button')].every(b => b.disabled), 'increments cannot exceed available balance');
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});

 test('personal picks combine pending and settled tickets, with pending first and other users excluded', () => {
  const base = { market_id: market.id, user_id: 1, name: 'Me', side: 'yes' as const, stake: 2500, promised_return: 6250, probability: 4000, paid: 0, created_at: '2026-10-17T10:00:00Z' };
  const html = renderToStaticMarkup(<CampaignPicks markets={[{ ...market, bets: [{ ...base, id: 'won', status: 'won', paid: 6250 }, { ...base, id: 'pending', status: 'pending' }, { ...base, id: 'other', user_id: 2, status: 'lost' }] }]} userId={1} onSelect={() => {}}/>);
  assert.match(html, /1 הימורים פתוחים/);
  assert.equal((html.match(/<article/g) ?? []).length, 2);
  assert.ok(html.indexOf('ממתין לתוצאה') < html.indexOf('שולם'));
  assert.match(html, /₪62.50/);
  assert.doesNotMatch(html, /רווח אפשרי נטו|רווח והפסד/);
});

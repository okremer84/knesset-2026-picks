import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarketCard } from '../../src/components/CampaignView';
import type { Market } from '../../src/lib/campaign';

test('market cards show honest no-basis prices and prevent betting after close', () => {
  const market: Market = { id: 'm', title: 'האם איראן תוזכר?', type: 'mention_count', state: 'closed', action: null, closes_at: '2026-10-15T10:00:00Z', window_ends_at: '2026-10-16T10:00:00Z', contract: { source_url: 'https://example.org', yes_rule: '3+', no_rule: '0–2', void_rule: 'ללא סרטון', comparison: 'gte', threshold: 3, window_starts_at: '2026-10-14T10:00:00Z' }, quote: { id: 'q', probability: 5000, ai_probability: 5000, version: 1, tag: 'no_basis', origin: 'ai', rationale: 'אין בסיס', created_at: '2026-10-14T10:00:00Z', evidence: [] }, quotes: [], bets: [], resolution: null };
  const html = renderToStaticMarkup(<MarketCard market={market} userId={1} onSelect={() => {}}/>);
  assert.match(html, /50\/50 · אין בסיס/);
  assert.match(html, /ממתינים לתוצאה/);
  assert.match(html, /disabled/);
});

test('the slip retries an uncertain request with the same key and requires a new click after a stale quote', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<div id="root"></div>', {url: 'http://localhost/'});
  Object.assign(globalThis, {window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true});
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const { createRoot } = await import('react-dom/client');
  const { CampaignBoard } = await import('../../src/components/CampaignView');
  const { act } = await import('react');
  const market: Market = {id: 'm', title: 'The next ad?', type: 'mention_count', state: 'open', action: null, closes_at: '2099-01-01T12:00:00Z', window_ends_at: '2099-01-02T12:00:00Z', contract: {source_url:'https://example.org',yes_rule:'3+',no_rule:'under 3',void_rule:'no ad',comparison:'gte',threshold:3,window_starts_at:'2099-01-01T00:00:00Z'}, quote: {id:'q1',probability:4000,ai_probability:4000,version:1,tag:'evidence_based',origin:'ai',rationale:'prior ads',created_at:'2026-10-14T10:00:00Z',evidence:[]},quotes:[],bets:[],resolution:null};
  const data = {enabled:true,operator:false,wallet:{available:1000000,outstanding:0,profit:0,entries:[]},markets:[market],proposals:[],leaderboard:[]};
  const calls: { request_key: string; quote_id: string }[] = [];
  let mode = 'network';
  const root = createRoot(document.getElementById('root')!);
  const render = () => root.render(<CampaignBoard data={data} userId={1} leagueName="Friends" onAction={async <T,>(_path: string, body?: unknown): Promise<T> => { calls.push(body as typeof calls[number]); throw new Error(mode === 'network' ? 'Network interrupted' : 'המחיר השתנה. יש לבדוק ולאשר שוב'); }} onRefresh={async () => { if (mode === 'stale') { market.quote = {...market.quote, id:'q2',probability:6000}; render(); } }}/>);
  const click = async (text: string) => { const button = [...document.querySelectorAll('button')].find(b => b.textContent?.includes(text)); assert.ok(button, text); await act(async () => button.click()); };
  try {
    await act(async () => render());
    await click('The next ad?');
    await click('קניית כן');
    await click('קניית כן');
    assert.equal(calls[0].request_key, calls[1].request_key);
    mode = 'stale';
    await click('קניית כן');
    assert.match(document.body.textContent!, /המחיר השתנה/);
    assert.equal(calls.length, 3, 'quote refresh must not automatically place another ticket');
    await click('קניית כן');
    assert.equal(calls[3].quote_id, 'q2');
    assert.notEqual(calls[3].request_key, calls[2].request_key);
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});

test('cent prices retain sub-cent precision and complementary sides pay the stored quote', async () => {
  const { priceCents, probability, returnFor } = await import('../../src/lib/campaign');
  assert.equal(priceCents(3125, 'yes'), '31.25 אג׳');
  assert.equal(priceCents(3125, 'no'), '68.75 אג׳');
  assert.equal(probability(3125), '31.25%');
  assert.equal(returnFor(2500, 3125, 'yes'), 8000);
  assert.equal(returnFor(2500, 3125, 'no'), 3636);
});

test('trending ranks distinct recent players, excludes unavailable markets and never fills with invented activity', async () => {
  const { trendingMarkets } = await import('../../src/lib/campaign');
  const now = Date.parse('2026-10-15T12:00:00Z');
  const base: Market = { id:'a', title:'a', type:'statement', state:'open', action:null, closes_at:'2026-10-16T12:00:00Z', window_ends_at:'2026-10-17T12:00:00Z', contract:{source_url:'https://example.org', yes_rule:'yes',no_rule:'no',void_rule:'missing',comparison:'event',threshold:1,window_starts_at:'2026-10-16T12:00:00Z'}, quote:{id:'q',probability:5000,ai_probability:5000,version:1,tag:'no_basis',origin:'ai',rationale:'',created_at:'2026-10-14T12:00:00Z',evidence:[]},quotes:[],bets:[],resolution:null };
  const ticket = (user_id: number, created_at = '2026-10-15 10:00:00') => ({id:crypto.randomUUID(),user_id,name:'Member',side:'yes' as const,stake:1000,promised_return:2000,probability:5000,paid:0,status:'pending' as const,created_at,market_id:'a'});
  const split = {...base, id:'split', bets:[ticket(1),ticket(1),ticket(1)]};
  const popular = {...base, id:'popular', bets:[ticket(2),ticket(3)]};
  const stale = {...base, id:'old', bets:[ticket(4,'2026-10-14T11:59:59Z')]};
  const boundary = {...base, id:'cutoff', closes_at:'2026-10-15T12:00:00Z', bets:[ticket(7)]};
  const future = {...base, id:'future', bets:[ticket(8,'2026-10-15T12:00:01Z')]};
  const refunded = {...base, id:'refunded', bets:[{...ticket(9),status:'refunded' as const}]};
  const results = trendingMarkets([split,popular,stale,boundary,future,refunded,{...base,id:'processing',action:'settle',bets:[ticket(5)]},{...base,id:'closed',state:'closed',bets:[ticket(6)]},base],now);
  assert.deepEqual(results.map(r=>[r.market.id,r.participants]), [['popular',2],['split',1]]);
  assert.deepEqual(trendingMarkets([stale,base],now),[]);
});

test('same-price purchases group without recalculating rounded locked payouts', async () => {
  const { groupTickets } = await import('../../src/lib/campaign');
  const ticket = {id:'a',market_id:'m',user_id:1,name:'Member',side:'yes' as const,stake:2500,promised_return:10869,probability:2300,paid:0,status:'pending' as const,created_at:'2026-10-15T00:00:00Z'};
  const groups = groupTickets([ticket,{...ticket,id:'b'},{...ticket,id:'c'},{...ticket,id:'d',side:'no'},{...ticket,id:'e',probability:2400}]);
  assert.equal(groups.length,3);
  assert.equal(groups[0].stake,7500);
  assert.equal(groups[0].promised_return,32607);
  assert.equal(ticket.stake,2500);
});

test('monitoring requires a separate payout approval and clears stale previews on refresh', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<div id="root"></div>', {url:'http://localhost/'});
  Object.assign(globalThis, {window:dom.window, document:dom.window.document, HTMLElement:dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT:true});
  const { createRoot } = await import('react-dom/client');
  const { CampaignMonitoring } = await import('../../src/components/CampaignMonitoring');
  const { act } = await import('react');
  const root = createRoot(document.getElementById('root')!);
  let version = 'v1';
  const calls: string[] = [];
  const onAction = async <T,>(path:string):Promise<T> => {
    calls.push(path);
    if (path === '/monitoring') return {x_configured:false,sources:[],packets:[{market_id:'m',title:'Question',mode:'x_count',status:'ready',message:'Ready',version,observed:5,items:[],baseline:[],coverage:[]}]} as T;
    if (path.endsWith('/monitor-preview')) return {token:'signed',outcome:'yes',payout:20000,refund:0} as T;
    throw new Error('Unexpected mutation');
  };
  const click = async (text:string) => { const b = [...document.querySelectorAll('button')].find(b=>b.textContent?.includes(text)); assert.ok(b); await act(async()=>b.click()); };
  try {
    await act(async()=>root.render(<CampaignMonitoring onAction={onAction} onDone={()=>{}}/>));
    assert.match(document.body.textContent!, /X עדיין לא מחובר/);
    assert.equal(calls.length,1);
    await click('בדיקת תשלום לפי הראיות');
    assert.match(document.body.textContent!, /אישור ההכרעה והתשלום/);
    assert.ok(!calls.some(c=>c.endsWith('/settle')));
    version = 'v2';
    await click('רענון מצב המעקב');
    assert.doesNotMatch(document.body.textContent!, /אישור ההכרעה והתשלום/);
  } finally { await act(async()=>root.unmount()); dom.window.close(); }
});

test('candidate rows select the exact market and disable closed purchases', async () => {
  const { JSDOM } = await import('jsdom');
  const { CandidateMarkets } = await import('../../src/components/CandidateMarkets');
  const { createRoot } = await import('react-dom/client');
  const { act } = await import('react');
  const dom = new JSDOM('<div id="root"></div>');
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const base: Market = { id: 'netanyahu', title: 'נתניהו?', type: 'deadline_event', state: 'open', action: null, closes_at: '2099-01-01T00:00:00Z', window_ends_at: '2099-04-01T00:00:00Z', contract: { source_url: 'https://example.org', yes_rule: 'yes', no_rule: 'no', void_rule: 'none', comparison: 'event', threshold: 1, window_starts_at: '2099-01-01T00:00:00Z', presentation: { family: 'prime_minister', key: 'pm', label: 'בנימין נתניהו', portrait: 'likud' } }, quote: { id: 'q', probability: 4000, ai_probability: null, version: 1, tag: 'operator_edited', origin: 'operator', rationale: 'estimate', created_at: '2026-10-17T00:00:00Z', evidence: [] }, quotes: [], bets: [], resolution: null };
  const second: Market = { ...base, id: 'eisenkot', quote: { ...base.quote, probability: 3500 }, contract: { ...base.contract, presentation: { ...base.contract.presentation!, label: 'גדי איזנקוט', portrait: 'yashar' } } };
  const closed: Market = { ...base, id: 'closed', state: 'closed', contract: { ...base.contract, presentation: { ...base.contract.presentation!, label: 'סגור', portrait: null } } };
  const selected: string[] = [];
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(<CandidateMarkets markets={[base, second, closed]} onSelect={m => selected.push(m.id)}/>));
    const row = [...document.querySelectorAll('.candidate-option')].find(r => r.textContent?.includes('גדי איזנקוט'))!;
    assert.match(row.textContent!, /35%/);
    await act(async () => (row.querySelector('.candidate-buy') as HTMLButtonElement).click());
    assert.deepEqual(selected, ['eisenkot']);
    assert.equal(document.querySelectorAll('.candidate-buy:disabled').length, 1);
    assert.equal(document.querySelectorAll('.candidate-avatar img').length, 2);
  } finally { await act(async () => root.unmount()); dom.window.close(); }
});

test('Slack review links open monitoring for an operator and never submit an approval', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<div id="root"></div>', {url: 'https://knesset-picks.com/?tab=campaign&review=monitoring'});
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  Object.assign(globalThis, {window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true});
  const { createRoot } = await import('react-dom/client');
  const { CampaignBoard } = await import('../../src/components/CampaignView');
  const { act } = await import('react');
  const calls: string[] = [];
  const data = {enabled:true,operator:true,wallet:{available:100000,outstanding:0,profit:0,entries:[]},markets:[],proposals:[],leaderboard:[]};
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(<CampaignBoard data={data} userId={1} leagueName="Shared" onAction={async <T,>(path: string): Promise<T> => { calls.push(path); return {x_configured:false,sources:[],packets:[]} as T; }} onRefresh={async () => {}}/>));
    assert.match(document.body.textContent ?? '', /מעקב ואישור ראיות/);
    assert.deepEqual(calls, ['/monitoring']);
    await act(async () => root.unmount());
    const outsider = createRoot(document.getElementById('root')!);
    await act(async () => outsider.render(<CampaignBoard data={{...data,operator:false}} userId={2} leagueName="Shared" onAction={async <T,>(): Promise<T> => { throw new Error('must not call'); }} onRefresh={async () => {}}/>));
    assert.doesNotMatch(document.body.textContent ?? '', /מעקב ואישור ראיות/);
    await act(async () => outsider.unmount());
  } finally { dom.window.close(); }
});

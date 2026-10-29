import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import actualFeed from '../../data/actual-results.json';
import exitFeed from '../../data/election-results.json';
import type { Survey, League } from '../../src/types';
import { latestElectionResults } from '../../src/utils/surveys';
import { ResultsView } from '../../src/components/ResultsView';
import { LeagueView } from '../../src/components/LeagueView';
import { ResultStatus } from '../../src/components/ResultStatus';

const actual = actualFeed.surveys[0] as Survey;
const exits = exitFeed.surveys as Survey[];
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import('react-dom/client');

test('actual count supersedes every channel selection and final results supersede partial counts', () => {
  assert.deepEqual(latestElectionResults([...exits, actual], '2026-10-28'), [actual]);
  const final: Survey = { ...actual, id: 'final', kind: 'official_results' };
  assert.deepEqual(latestElectionResults([actual, final, ...exits], '2026-10-28'), [final]);
});

test('results page exposes partial count and timestamps without opinion-poll or channel controls', () => {
  const html = renderToStaticMarkup(<ResultsView surveys={[...exits, actual]} picks={[]}/>);
  assert.match(html, /תוצאות אמת/);
  assert.match(html, /37/);
  assert.match(html, /עדכון התוצאות:/);
  assert.match(html, /בדיקה מוצלחת אחרונה:/);
  assert.doesNotMatch(html, /בחירת ערוץ|המגמה לאורך זמן|תוצאות המדגמים|תוצאות סופיות/);
  const failure = renderToStaticMarkup(<ResultStatus result={actual} sync={{status:'failed', lastSuccessAt:'2026-10-28T04:10:00Z'}}/>);
  assert.match(failure, /העדכון מתעכב/);
  assert.match(failure, /06:10/);
});

test('actual-count corrections update an open user comparison and ranking together', async () => {
  const root = createRoot(document.getElementById('root')!);
  const league: League = {
    id:'league', name:'League', creatorName:'Owner', createdAt:'2026-10-01', isCommissioner:false,
    isLocked:true, locksAt:'2026-10-27T18:00:00Z', inviteCode:'test', predictionsHidden:false,
    submittedCount:2,totalPlayersCount:2,scoringVersion:'1',benchmarkSurvey:exits[0],rankings:[],
    members:[actual,exits[0]].map((source,i)=>({id:`pick-${i}`,userId:i+1,memberName:`Player ${i}`,seats:source.seats,turnoutPercentage:70+i,submittedAt:'2026-10-26'})),
  };
  const render = (result: Survey) => <LeagueView league={league} allSurveys={[...exits,result]} selectedSurveyId={exits[3].id}
    onSelectSurveyId={()=>{}} onOpenCreateLeague={()=>{}} onJoinExistingLeagueById={()=>{}} onNavigateToPicker={()=>{}}/>;
  try {
    await act(async()=>root.render(render(actual)));
    assert.equal(document.querySelector('#league-survey'),null);
    assert.equal(document.querySelector('[aria-label="התחזית של Player 0"] .league-score')!.textContent,'0');
    await act(async()=>(document.querySelector('[aria-label="התחזית של Player 0"]') as HTMLElement).click());
    const row=()=>[...document.querySelectorAll<HTMLTableRowElement>('.league-pick-details tbody tr')].find(tr=>tr.cells[0].textContent==='הליכוד')!;
    assert.equal(row().cells[2].textContent,'28');
    const corrected={...actual,countedPercentage:42,seats:{...actual.seats,likud:29,yashar:20}};
    await act(async()=>root.render(render(corrected)));
    assert.equal(row().cells[2].textContent,'29');
    assert.equal(document.querySelector('[aria-label="התחזית של Player 0"] .league-score')!.textContent,'2');
    assert.match(document.body.textContent!,/42% מהקולות נספרו/);
    assert.match(document.querySelector('.league-pick-details thead')!.textContent!,/תוצאות אמת/);
    assert.doesNotMatch(document.body.textContent!,/נק׳ אחוז|תוצאות סופיות|המדגם לדירוג/);
  } finally { await act(async()=>root.unmount()); }
});


test('progress-only updates distinguish the count timestamp from the unchanged seat allocation', () => {
  const progress = { ...actual, countedPercentage: 90, publishedAt: '2026-10-28T21:59:11Z', seatsPublishedAt: '2026-10-28T12:38:08Z' };
  const html = renderToStaticMarkup(<ResultStatus result={progress}/>);
  assert.match(html, /90% מהקולות נספרו/);
  assert.match(html, /חלוקת המנדטים ללא שינוי מאז/);
  const markup = new JSDOM(html).window.document;
  assert.ok(markup.querySelector('time[datetime="2026-10-28T21:59:11Z"]'));
  assert.ok(markup.querySelector('time[datetime="2026-10-28T12:38:08Z"]'));
  assert.doesNotMatch(renderToStaticMarkup(<ResultStatus result={actual}/>), /חלוקת המנדטים ללא שינוי מאז/);
});

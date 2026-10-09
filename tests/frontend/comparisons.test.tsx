import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateBlocs, calculateScore } from '../../src/utils/scoring';
import { PARTIES_LIST } from '../../src/data/parties';
import { HistoricalAnalysis } from '../../src/components/HistoricalAnalysis';
import { HISTORICAL_ELECTIONS } from '../../src/data/historical';
import { SurveyComparator } from '../../src/components/SurveyComparator';
import type { Survey } from '../../src/types';

test('bloc totals derive from reported seats, including an omitted blocs payload', () => {
  assert.deepEqual(calculateBlocs({ likud: 50, beyachad: 40, raam: 20, hendel: 10 }), {
    coalition: 50, opposition: 40, arab: 20, other: 10,
  });
  const survey: Survey = {
    id: 'reviewed', title: 'Reviewed result', kind: 'official_results',
    institute: 'Test', channelOrMedia: 'Test', date: '2026-09-09',
    seats: { likud: 50, beyachad: 40, raam: 20, hendel: 10 },
  };
  const props = { picks: [{ id: 'pick', leagueId: 'league', leagueName: 'League', seats: survey.seats }] };
  assert.equal(
    renderToStaticMarkup(<SurveyComparator {...props} surveys={[survey]}/>),
    renderToStaticMarkup(<SurveyComparator {...props} surveys={[{...survey, blocs: calculateBlocs(survey.seats)}]}/>),
  );
});

test('unreported live polls and explicit historical zeroes have different semantics', () => {
  const picks = { likud: 60, amcha: 60 };
  assert.equal(calculateScore(picks, { likud: 60 }).totalSeatDiff, 0);
  const historical = Object.fromEntries(PARTIES_LIST.map(p => [p.id, p.id === 'likud' ? 60 : 0]));
  assert.equal(calculateScore(picks, historical).totalSeatDiff, 60);
});

test('historical results stay independent of current prediction allocations', () => {
  const html = renderToStaticMarkup(<HistoricalAnalysis/>);
  assert.ok(html.includes('תוצאות הבחירות לפי מפלגות'));
  assert.ok(html.includes('יש עתיד'));
  assert.ok(!html.includes('סך ההפרשים בהשוואה ההיסטורית'));
  assert.ok(!html.includes('מיפוי מפלגות המשחק'));
});

test('historical results and bloc totals each account for all 120 seats', () => {
  for (const election of HISTORICAL_ELECTIONS) {
    assert.equal(election.results.reduce((sum, party) => sum + party.seats, 0), 120, `Knesset ${election.knessetNumber} party total`);
    assert.equal(Object.values(election.blocTotals).reduce((sum, seats) => sum + seats, 0), 120, `Knesset ${election.knessetNumber} bloc total`);
  }
  // Central Elections Committee final results: https://votes22.bechirot.gov.il/
  const election = HISTORICAL_ELECTIONS.find(e => e.knessetNumber === 22)!;
  assert.equal(election.results.find(p => p.partyName === 'יהדות התורה')!.seats, 7);
});

test('omitted party allocations do not change displayed user bloc totals', () => {
  const survey: Survey = {
    id: 'partial', title: 'Partial poll', kind: 'opinion_poll',
    institute: 'Test', channelOrMedia: 'Test', date: '2026-09-09',
    seats: { likud: 100, raam: 20 }, notReportedPartyIds: ['joint_list'],
  };
  const html = renderToStaticMarkup(<SurveyComparator surveys={[survey]} picks={[{id:'pick', leagueId:'league', leagueName:'League', seats:{ likud: 100, raam: 10, joint_list: 10 }}]}/>);
  // The Arab bloc compares the 10 reported-party seats, excluding 10 Joint List seats.
  const arabCard = html.slice(html.indexOf('מפלגות ערביות'), html.indexOf('הנדל וזליכה / אחרות')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(arabCard, /מפלגות ערביות 10 \/ בסקר: 20/);
  assert.match(arabCard, /10 מתחת לסקר/);
  assert.doesNotMatch(arabCard, /[+-]10/);
});

test('average error uses scored parties, including reported zeroes, and handles no reported parties', () => {
  const render = (seats: Record<string, number>) => renderToStaticMarkup(
    <SurveyComparator surveys={[{
      id: 'average', title: 'Partial poll', kind: 'opinion_poll',
      institute: 'Test', channelOrMedia: 'Test', date: '2026-09-09', seats,
    }]} picks={[{id:'pick', leagueId:'league', leagueName:'League', seats:{ likud: 90, raam: 20, joint_list: 10 }}]}/>
  ).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
  assert.match(render({ likud: 100, raam: 20 }), /ממוצע של 5\.0 למפלגה/);
  assert.match(render({ likud: 100, raam: 20, joint_list: 0 }), /ממוצע של 6\.7 למפלגה/);
  assert.match(render({}), /ממוצע של — למפלגה/);
});


test('without a submitted pick only survey results and trends are rendered', () => {
  const survey: Survey = { id: 'poll', title: 'Poll', institute: 'Test', channelOrMedia: 'Channel', date: '2026-10-05', seats: { likud: 21 } };
  const html = renderToStaticMarkup(<SurveyComparator surveys={[survey]} picks={[]}/>);
  assert.ok(html.includes('תוצאות הסקר'));
  assert.ok(html.includes('המגמה לאורך זמן'));
  assert.ok(!html.includes('מדדי דיוק'));
  assert.ok(!html.includes('מילאת עד כה'));
  assert.ok(!html.includes('מפלגות שלא דווחו'));
  const pick = { id: 'pick', leagueId: 'league', leagueName: 'My League', seats: { likud: 120 } };
  const single = renderToStaticMarkup(<SurveyComparator surveys={[survey]} picks={[pick]}/>);
  assert.ok(single.includes('מדדי דיוק'));
  assert.ok(!single.includes('<option value="pick"'));
  const multiple = renderToStaticMarkup(<SurveyComparator surveys={[survey]} picks={[pick, {...pick, id:'second'}]}/>);
  assert.equal(multiple, single);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LeagueView, PickDetails } from '../../src/components/LeagueView';
import { israelInstant, israelLocalTime, formatIsraelTime } from '../../src/utils/israelTime';
import type { League } from '../../src/types';

const league: League = {
  id: 'test', name: 'Test league', creatorName: 'Owner', isCommissioner: false, isLocked: false,
  locksAt: '2026-10-27T18:00:00Z', inviteCode: 'secret-invite', predictionsHidden: true,
  submittedCount: 2, totalPlayersCount: 3, benchmarkSurvey: { id: 'poll', kind: 'exit_poll', title: 'Poll', date: '2026-10-01', institute: 'Institute', channelOrMedia: 'Channel', seats: { likud: 60, beyachad: 60 } },
  rankings: [{ predictionId: 'one', error: 2, exactHits: 1, turnoutDiff: null }, { predictionId: 'two', error: 2, exactHits: 0, turnoutDiff: null }],
  members: [{ id: 'one', userId: 1, memberName: 'Alice', seats: { likud: 59, beyachad: 61 }, turnoutPercentage: 70, note: 'Hidden note', submittedAt: '2026-10-06T12:00:00Z' }, { id: 'two', userId: 2, memberName: 'Bob', seats: { likud: 61, beyachad: 59 }, turnoutPercentage: 80, submittedAt: '2026-10-06T12:00:00Z' }],
  participants: [{ userId: 1, name: 'Alice', submitted: true }, { userId: 2, name: 'Bob', submitted: true }, { userId: 3, name: 'Charlie', submitted: false }],
  scoringVersion: '1', createdAt: '2026-10-01',
};
function render(value: League) {
  return renderToStaticMarkup(<LeagueView league={value} allSurveys={[]} selectedSurveyId="" onSelectSurveyId={() => {}} onOpenCreateLeague={() => {}} onJoinExistingLeagueById={() => {}} onNavigateToPicker={() => {}}/>);
}
test('pre-reveal roster contains every member but no notes, scores, or turnout', () => {
  const html = render(league);
  for (const name of ['Alice', 'Bob', 'Charlie']) assert.ok(html.includes(name));
  for (const privateText of ['Hidden note', '70%', '80%', 'נקודות ↓', 'secret-invite']) assert.ok(!html.includes(privateText));
  assert.ok(html.includes('טרם הוגשה'));
});
test('reveal includes notes and turnout; equal points share rank despite different exact hits', () => {
  const html = render({ ...league, predictionsHidden: false, isLocked: true });
  assert.ok(html.includes('Hidden note'));
  assert.ok(html.includes('70%'));
  assert.ok(html.includes('לא הוגשה'));
  assert.equal((html.match(/<td>1<\/td>/g) || []).length, 2);
});
test('official turnout resolves equal points, ignoring exact hits', () => {
  const html = render({ ...league, predictionsHidden: false, isLocked: true, rankings: league.rankings.map((r, i) => ({ ...r, turnoutDiff: i === 0 ? 8 : 2 })) });
  assert.ok(html.indexOf('Bob') < html.indexOf('Alice'));
  assert.ok(html.includes('פער 2.0'));
});
test('expanded picks include unreported parties without inventing comparison values', () => {
  const html = renderToStaticMarkup(<PickDetails prediction={league.members[0]} benchmark={league.benchmarkSurvey}/>);
  assert.ok(html.includes('לא דווח'));
  assert.ok(html.includes('pick-bars'));
  assert.ok(html.includes('59'));
});
test('Israel deadline conversion uses Israel DST, independent of host timezone', () => {
  assert.equal(israelInstant('2026-10-01T20:00'), '2026-10-01T17:00:00.000Z');
  assert.equal(israelInstant('2026-10-27T20:00'), '2026-10-27T18:00:00.000Z');
  assert.equal(israelLocalTime('2026-10-27T18:00:00Z'), '2026-10-27T20:00');
  assert.throws(() => israelInstant('2026-03-27T02:30'));
});

test('league ignores legacy opinion poll benchmarks and waits for election results', () => {
  const html = render({ ...league, isLocked: true, predictionsHidden: false, benchmarkSurvey: { ...league.benchmarkSurvey!, kind: 'opinion_poll' } });
  assert.ok(html.includes('ממתינים לפרסום המדגם'));
  assert.ok(!html.includes('league-score">2'));
});
test('dates display DD/MM/YYYY and 24-hour Israel time', () => {
  assert.equal(formatIsraelTime('2026-10-27T18:00:00Z'), '27/10/2026 20:00');
  assert.throws(() => israelInstant('2026-02-31T20:00'));
});

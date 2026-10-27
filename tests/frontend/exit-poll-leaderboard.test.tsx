import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act, useState } from 'react';
import { JSDOM } from 'jsdom';
import feed from '../../data/election-results.json';
import { LeagueView } from '../../src/components/LeagueView';
import type { League, Survey } from '../../src/types';

const results = feed.surveys as Survey[];
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import('react-dom/client');

const league: League = {
  id: 'test', name: 'Test league', creatorName: 'Owner', isCommissioner: false, isLocked: true,
  locksAt: '2026-10-27T18:00:00Z', inviteCode: 'test', predictionsHidden: false,
  submittedCount: 4, totalPlayersCount: 5, benchmarkSurvey: results[0], benchmarkTurnoutPercentage: 80,
  // Deliberately stale: every selection must calculate from the current result seats.
  rankings: [{ predictionId: 'pick-0', error: 99, exactHits: 0, turnoutDiff: 2 }],
  members: results.map((survey, i) => ({ id: `pick-${i}`, userId: i + 1, memberName: `Player ${i + 1}`,
    seats: survey.seats, turnoutPercentage: 70 + i, submittedAt: '2026-10-26T12:00:00Z' })),
  participants: Array.from({ length: 5 }, (_, i) => ({ userId: i + 1, name: `Player ${i + 1}`, submitted: i < 4 })),
  scoringVersion: '1', createdAt: '2026-10-01',
};

function Preview({ surveys }: { surveys: Survey[] }) {
  const [selected, select] = useState('legacy-poll');
  return <LeagueView league={league} allSurveys={surveys} selectedSurveyId={selected} onSelectSurveyId={select}
    onOpenCreateLeague={() => {}} onJoinExistingLeagueById={() => {}} onNavigateToPicker={() => {}}/>;
}

test('each supplied channel recalculates leaderboard scores, shared places, and expanded comparisons', async () => {
  const root = createRoot(document.getElementById('root')!);
  const oldPoll: Survey = { ...results[0], id: 'legacy-poll', kind: 'opinion_poll', channelOrMedia: 'Old poll' };
  const expected = [
    [0, 8, 6, 12],
    [8, 0, 10, 16],
    [6, 10, 0, 12],
    [12, 16, 12, 0],
  ];
  try {
    await act(async () => root.render(<Preview surveys={[oldPoll, ...results]}/>));
    const select = document.querySelector<HTMLSelectElement>('#league-survey')!;
    assert.deepEqual([...select.options].map(option => option.value), results.map(s => s.id));
    assert.equal(select.value, results[0].id, 'a stored opinion poll resolves to the first channel');
    for (const [i, result] of results.entries()) {
      await act(async () => {
        select.value = result.id;
        select.dispatchEvent(new window.Event('change', { bubbles: true }));
      });
      assert.equal(document.querySelector('.league-result-heading h2')!.textContent, `דירוג לפי מדגם ${result.channelOrMedia}`);
      assert.equal(document.querySelector('.league-pick-row')!.getAttribute('aria-label'), `התחזית של Player ${i + 1}`);
      for (const [j, score] of expected[i].entries()) {
        const row = document.querySelector<HTMLTableRowElement>(`[aria-label="התחזית של Player ${j + 1}"]`)!;
        assert.equal(row.querySelector('.league-score')!.textContent, String(score));
        assert.equal(row.cells[0].textContent, String(1 + expected[i].filter(other => other < score).length));
      }
      assert.equal(document.querySelector('.league-table > tbody > tr:last-child .league-score')!.textContent, '—');
      assert.doesNotMatch(document.querySelector('.league-table')!.textContent!, /נק׳ אחוז/, 'exit polls never apply an official turnout tiebreaker');
    }
    const row = document.querySelector<HTMLTableRowElement>('[aria-label="התחזית של Player 1"]')!;
    await act(async () => row.click());
    const likud = [...document.querySelectorAll<HTMLTableRowElement>('.league-pick-details tbody tr')].find(tr => tr.cells[0].textContent!.includes('הליכוד'))!;
    assert.equal(likud.cells[2].textContent, '27', 'expanded pick compares with the selected channel 14');

    await act(async () => {
      select.value = results[0].id;
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    // A correction under the same ID must beat cached rankings and the older league benchmark.
    const corrected = results.map((result, i) => i === 0 ? { ...result, seats: results[3].seats } : result);
    await act(async () => root.render(<Preview surveys={corrected}/>));
    assert.equal(select.value, results[0].id);
    assert.equal(document.querySelector('.league-pick-row')!.getAttribute('aria-label'), 'התחזית של Player 4');
    assert.equal(document.querySelector('[aria-label="התחזית של Player 1"] .league-score')!.textContent, '12');
    const updatedLikud = [...document.querySelectorAll<HTMLTableRowElement>('.league-pick-details tbody tr')].find(tr => tr.cells[0].textContent!.includes('הליכוד'))!;
    assert.equal(updatedLikud.cells[2].textContent, '27');
  } finally {
    await act(async () => root.unmount());
  }
});

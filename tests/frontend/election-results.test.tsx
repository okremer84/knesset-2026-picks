import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import feed from '../../data/election-results.json';
import { latestElectionResults } from '../../src/utils/surveys';
import { PARTIES_LIST } from '../../src/data/parties';
import { calculateBlocs } from '../../src/utils/scoring';
import { SurveyComparator } from '../../src/components/SurveyComparator';
import type { Survey } from '../../src/types';

const surveys = feed.surveys as Survey[];
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import('react-dom/client');

test('supplied channel results total 120 and match the screenshot bloc counts', () => {
  assert.deepEqual(surveys.map(s => s.channelOrMedia), ['כאן 11', 'חדשות 12', 'חדשות 13', 'ערוץ 14']);
  assert.deepEqual(surveys.map(s => calculateBlocs(s.seats)), [
    { coalition: 50, opposition: 53, arab: 17, other: 0 },
    { coalition: 50, opposition: 52, arab: 18, other: 0 },
    { coalition: 50, opposition: 53, arab: 17, other: 0 },
    { coalition: 55, opposition: 49, arab: 16, other: 0 },
  ]);
  for (const survey of surveys) {
    assert.equal(PARTIES_LIST.map(party => survey.seats[party.id]).reduce((a, b) => a + b, 0), 120);
    assert.equal(survey.kind, 'exit_poll');
  }
});

test('results exclude opinion polls and future records, selecting the newest update per channel', () => {
  const original = surveys[0];
  const updated = { ...original, id: 'updated', publishedAt: '2026-10-27T23:00:00+02:00' };
  const future = { ...original, id: 'future', date: '2026-10-28' };
  const poll = { ...original, id: 'poll', kind: 'opinion_poll' as const };
  const actual = latestElectionResults([original, updated, future, poll, ...surveys.slice(1)], '2026-10-27');
  assert.deepEqual(actual.map(s => s.id), [updated.id, ...surveys.slice(1).map(s => s.id)]);
  assert.deepEqual(latestElectionResults(surveys, '2026-10-26'), []);
});

test('all four channels replace stale weekly poll preferences and remain comparable to a saved pick', async () => {
  localStorage.setItem('knesset_fantasy_poll_weeks', '4');
  localStorage.setItem('knesset_fantasy_poll_channel', JSON.stringify('מעריב'));
  const container = document.getElementById('root')!;
  const root = createRoot(container);
  const oldPoll = { ...surveys[0], id: 'old', date: '2026-09-01', kind: 'opinion_poll' as const, channelOrMedia: 'מעריב' };
  try {
    await act(async () => root.render(<SurveyComparator surveys={[oldPoll, ...surveys]} picks={[]}/>));
    assert.match(container.textContent!, /תוצאות המדגמים/);
    assert.doesNotMatch(container.textContent!, /המגמה לאורך זמן|הסקר האחרון מכל ערוץ|מעריב/);
    for (const survey of surveys) {
      const button = [...container.querySelectorAll<HTMLButtonElement>('.exit-poll-channels button')].find(b => b.textContent!.includes(survey.channelOrMedia))!;
      await act(async () => button.click());
      assert.equal(button.getAttribute('aria-pressed'), 'true');
      const displayed = [...container.querySelectorAll('.survey-results tbody tr')].map(row => Number(row.lastElementChild!.textContent));
      assert.deepEqual(displayed, PARTIES_LIST.map(party => survey.seats[party.id]));
      assert.equal(container.querySelector<HTMLAnchorElement>('a[href^="/results/"]')!.getAttribute('href'), survey.sourceImageUrl);
    }
    await act(async () => root.render(<SurveyComparator surveys={surveys} picks={[{ id: 'pick', seats: surveys[3].seats }]}/>));
    assert.match(container.textContent!, /מדדי דיוק ושגיאות מול ערוץ 14/);
    assert.match(container.textContent!, /100%/);
    assert.match(container.textContent!, /במדגם ערוץ 14/);
    assert.doesNotMatch(container.textContent!, /בסקר|הסקר הכי קרוב/);
  } finally {
    await act(async () => root.unmount());
    localStorage.clear();
  }
});

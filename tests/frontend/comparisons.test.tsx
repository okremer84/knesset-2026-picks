import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateBlocs, calculateScore } from '../../src/utils/scoring';
import { PARTIES_LIST } from '../../src/data/parties';
import { HistoricalAnalysis } from '../../src/components/HistoricalAnalysis';
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
  const props = { userSeats: survey.seats, onNavigateToPicker: () => {} };
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

test('historical UI counts allocations to parties absent from its historical mapping as error', () => {
  const html = renderToStaticMarkup(<HistoricalAnalysis userSeats={{ amcha: 120 }} onNavigateToPicker={() => {}}/>);
  const result = html.match(/>(\d+) מנדטים<\/strong>/);
  assert.ok(result, 'renders the absolute-error label');
  assert.ok(Number(result[1]) >= 120, 'includes all 120 seats allocated to an unmapped party');
  assert.ok(html.includes('פחות עדיף'));
  assert.ok(!html.includes('נקודות</strong>'));
});

test('omitted party allocations do not change displayed user bloc totals', () => {
  const survey: Survey = {
    id: 'partial', title: 'Partial poll', kind: 'opinion_poll',
    institute: 'Test', channelOrMedia: 'Test', date: '2026-09-09',
    seats: { likud: 100, raam: 20 }, notReportedPartyIds: ['balad'],
  };
  const html = renderToStaticMarkup(<SurveyComparator surveys={[survey]} userSeats={{ likud: 100, raam: 10, balad: 10 }} onNavigateToPicker={() => {}}/>);
  // The Arab bloc compares the 10 reported-party seats, excluding 10 Balad seats.
  const arabCard = html.slice(html.indexOf('מפלגות ערביות'), html.indexOf('הנדל וזליכה / אחרות')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(arabCard, /מפלגות ערביות 10 \/ בסקר: 20/);
  assert.match(arabCard, /-10 מתחת לסקר/);
});

test('average error uses scored parties, including reported zeroes, and handles no reported parties', () => {
  const render = (seats: Record<string, number>) => renderToStaticMarkup(
    <SurveyComparator surveys={[{
      id: 'average', title: 'Partial poll', kind: 'opinion_poll',
      institute: 'Test', channelOrMedia: 'Test', date: '2026-09-09', seats,
    }]} userSeats={{ likud: 90, raam: 20, balad: 10 }} onNavigateToPicker={() => {}}/>
  ).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
  assert.match(render({ likud: 100, raam: 20 }), /ממוצע של 5\.0 למפלגה/);
  assert.match(render({ likud: 100, raam: 20, balad: 0 }), /ממוצע של 6\.7 למפלגה/);
  assert.match(render({}), /ממוצע של — למפלגה/);
});

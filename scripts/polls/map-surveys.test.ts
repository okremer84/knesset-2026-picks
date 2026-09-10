import test from 'node:test';
import assert from 'node:assert/strict';
import { mapSurvey, PARTY_ALIASES, type Poll } from './map-surveys';

function fixture(): Poll {
  return { id: 'test', fieldwork_end: '2026-09-09', fieldwork_label: '9 Sep',
    pollster: 'Test', publisher: 'Test', sample_size_raw: '1,000', sources: ['https://example.org/poll'], issues: [],
    results: Object.keys(PARTY_ALIASES).map((party, i) => ({ party, seats: i === 0 ? 120 : 0, vote_percent: null, raw: '0' })) };
}
test('maps current parties and calculates blocs without inventing unreported seats', () => {
  const survey = mapSurvey(fixture(), '2026-09-09T22:00:00Z');
  assert.equal(survey.seats.likud, 120);
  assert.equal(survey.sampleSize, 1000);
  assert.equal(survey.blocs.coalition, 120);
  assert.equal(survey.seats.balad, undefined);
  assert.deepEqual(survey.notReportedPartyIds, ['balad']);
  assert.equal(survey.kind, 'opinion_poll');
});
test('rejects unknown parties and incomplete data', () => {
  const poll = fixture(); poll.results[0].party = 'New alliance';
  assert.throws(() => mapSurvey(poll, ''), /Unmapped/);
  const missing = fixture(); missing.results[0].seats = null;
  assert.throws(() => mapSurvey(missing, ''), /Unknown/);
});
test('does not fold old ballot configurations into current parties', () => {
  const poll = fixture(); poll.fieldwork_end = '2026-08-01';
  assert.throws(() => mapSurvey(poll, ''), /predates/);
});

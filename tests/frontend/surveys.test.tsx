import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveOpinionPollId } from '../../src/utils/surveys';
import type { Survey } from '../../src/types';
const poll = (id: string, kind: Survey['kind'] = 'opinion_poll'): Survey => ({
  id, kind, title: id, date: '2026-09-09', institute: 'Test', channelOrMedia: 'Test', seats: { likud: 120 },
});
test('withdrawn selections resolve to a current opinion poll after async options change', () => {
  assert.equal(resolveOpinionPollId([poll('bundled')], ''), 'bundled');
  assert.equal(resolveOpinionPollId([poll('official', 'official_results'), poll('current')], 'bundled'), 'current');
  assert.equal(resolveOpinionPollId([poll('first'), poll('chosen')], 'chosen'), 'chosen');
  assert.equal(resolveOpinionPollId([poll('official', 'official_results')], 'bundled'), '');
  assert.equal(resolveOpinionPollId([], 'bundled'), '');
});

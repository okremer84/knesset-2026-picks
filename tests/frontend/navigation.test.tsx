import assert from 'node:assert/strict';
import test from 'node:test';
import { initialLeagueId, loadInitialLeague } from '../../src/lib/navigation';
import { surveySyncNotice } from '../../src/utils/surveys';

test('failed invites recover existing membership while successful invites keep their selection', async () => {
  const leagues = [{ id: 'existing', name: 'My league' }];
  const params = new URLSearchParams('invite=expired');
  assert.equal(await initialLeagueId(params, leagues, async code => { assert.equal(code, 'expired'); return false; }), 'existing');
  assert.equal(await initialLeagueId(params, leagues, async () => true), null);
  assert.equal(await initialLeagueId(params, [], async () => false), null);
  assert.equal(await initialLeagueId(new URLSearchParams('league=requested&invite=invalid'), leagues, async () => false), 'requested');
});

test('seeded or unfinished data remains labelled until sync succeeds', () => {
  assert.notEqual(surveySyncNotice(6, null), '');
  assert.notEqual(surveySyncNotice(6, { status: 'running' }), '');
  assert.notEqual(surveySyncNotice(6, { status: 'failed' }), '');
  assert.equal(surveySyncNotice(6, { status: 'succeeded' }), '');
  assert.notEqual(surveySyncNotice(0, { status: 'succeeded' }), '');
});

test('inaccessible league links recover a membership and preserve other errors', async () => {
  for (const status of [403, 404, 401, 500]) {
    const calls: string[] = [];
    const response = await loadInitialLeague('stale', [{ id: 'existing', name: 'Mine' }], async id => {
      calls.push(id);
      return new Response(null, { status: id === 'stale' ? status : 200 });
    });
    const recover = status === 403 || status === 404;
    assert.deepEqual(calls, recover ? ['stale', 'existing'] : ['stale']);
    assert.equal(response.status, recover ? 200 : status);
  }
});

test('league recovery never loops or retries the same membership', async () => {
  for (const leagues of [[], [{ id: 'stale', name: 'Mine' }], [{ id: 'other', name: 'Other' }]]) {
    const calls: string[] = [];
    const response = await loadInitialLeague('stale', leagues, async id => {
      calls.push(id);
      return new Response(null, { status: 404 });
    });
    assert.equal(response.status, 404);
    assert.deepEqual(calls, leagues[0]?.id === 'other' ? ['stale', 'other'] : ['stale']);
  }
});

test('explicit links override remembered tabs and tab URLs preserve league context', async () => {
  const { initialTab } = await import('../../src/lib/navigation');
  assert.equal(initialTab(new URLSearchParams('league=abc'), 'surveys'), 'league');
  assert.equal(initialTab(new URLSearchParams('invite=abc&tab=picker'), 'historical'), 'league');
  assert.equal(initialTab(new URLSearchParams('league=abc&tab=surveys'), 'picker'), 'surveys');
  assert.equal(initialTab(new URLSearchParams(), 'historical'), 'historical');
  assert.equal(initialTab(new URLSearchParams('tab=invalid'), { tab: 'league' }), 'picker');
});

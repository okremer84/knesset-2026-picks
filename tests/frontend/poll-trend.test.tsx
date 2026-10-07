import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PollTrendChart } from '../../src/components/PollTrendChart';

test('every plotted poll date has an axis label, including September 24', () => {
  const dates = ['2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01'];
  const surveys = dates.map(date => ({ id: date, date, title: date, institute: 'Test', channelOrMedia: 'Test', seats: { likud: 21 } }));
  const html = renderToStaticMarkup(<PollTrendChart surveys={surveys}/>);
  const labels = [...html.matchAll(/<text[^>]*y="302"[^>]*>([^<]+)<\/text>/g)].map(match => match[1]);
  assert.deepEqual(labels, ['10.9', '17.9', '24.9', '1.10']);
});

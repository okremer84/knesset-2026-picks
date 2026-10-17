import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { AuthGate } from '../../src/components/AuthGate';
import { Header } from '../../src/components/Header';

test('the campaign navigation requires an explicit server capability', async () => {
  const { JSDOM } = await import('jsdom');
  const { createRoot } = await import('react-dom/client');
  for (const capability of [undefined, false, true]) {
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/?tab=campaign' });
    Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
    dom.window.fetch = async (url) => new Response(JSON.stringify(String(url) === '/api/auth/user'
      ? { user: { id: 1, name: 'Pilot visitor', email: 'visitor@example.org', campaign_access: capability } }
      : { googleEnabled: true }), { status: 200 });
    const root = createRoot(document.getElementById('root')!);
    try {
      await act(async () => root.render(<AuthGate><Header activeTab="picker" setActiveTab={() => {}} /></AuthGate>));
      const labels = [...document.querySelectorAll('nav button')].map(button => button.textContent);
      assert.equal(labels.includes('אייזנמארקט'), capability === true);
      assert.ok(labels.includes('התחזית שלי'), 'ordinary prediction navigation remains available');
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
    }
  }
});

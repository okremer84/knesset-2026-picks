import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { GoogleSignIn } from '../../src/components/AuthGate';

test('sign-in provides only Google and carries the invitation URL', () => {
  const html = renderToStaticMarkup(<GoogleSignIn enabled error="" href="/auth/google?invite=abc"/>);
  assert.match(html, /href="\/auth\/google\?invite=abc"/);
  assert.match(html, /המשך עם Google/);
  assert.doesNotMatch(html, /<input|<form|password|register/);
});

test('missing credentials disable sign-in and explain availability', () => {
  const html = renderToStaticMarkup(<GoogleSignIn enabled={false} error="" href="/auth/google"/>);
  assert.match(html, /disabled/);
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /href=/);
});

test('failed Google sign-in displays an accessible error and retry link', () => {
  const html = renderToStaticMarkup(<GoogleSignIn enabled error="נסו שוב" href="/auth/google"/>);
  assert.match(html, /role="alert"/);
  assert.match(html, /נסו שוב/);
  assert.match(html, /href="\/auth\/google"/);
});

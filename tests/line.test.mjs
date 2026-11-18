// Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
// LINE's built-in browser has no Web Bluetooth and can't save files: a banner there (web only) offers to open the page
// in the phone's own browser with LINE's documented openExternalBrowser=1 parameter (the studio snippet, as in Remark).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { distHtml } from './helpers.mjs';
const code = readFileSync(new URL('../src/line.js', import.meta.url), 'utf8');
const LINE_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7a Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 Line/14.19.1/IAB';
const LINE_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.19.0';
const CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 7a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

// runs line.js against a stand-in page and reports whether the banner showed and where its button goes
function run(ua, { native = false, href = 'https://leadone.anonacondacodelab.com/' } = {}) {
  const els = { lineBar: { hidden: true }, lineOpen: { href: '' } };
  const ctx = { URL, navigator: { userAgent: ua }, location: { href }, document: { getElementById: id => els[id] || null } };
  if (native) ctx.Capacitor = { isNativePlatform: () => true };
  ctx.globalThis = ctx;
  vm.runInNewContext(code, ctx);
  return { shown: !els.lineBar.hidden, link: els.lineOpen.href, api: ctx.LeadOneLine };
}

test('LINE is recognised by "Line/" in the user agent, and nothing else is', () => {
  const { api } = run(CHROME);
  assert.equal(api.inLine(LINE_ANDROID), true);
  assert.equal(api.inLine(LINE_IOS), true);
  assert.equal(api.inLine(CHROME), false);
  assert.equal(api.inLine(''), false);
  assert.equal(api.inLine('Mozilla/5.0 Firefox/131.0 Pipeline/2'), false);
});

test('in LINE\'s browser the banner shows, and its button opens this address with openExternalBrowser=1', () => {
  const r = run(LINE_ANDROID);
  assert.equal(r.shown, true);
  assert.equal(r.link, 'https://leadone.anonacondacodelab.com/?openExternalBrowser=1');
  assert.equal(run(LINE_IOS).shown, true);
  assert.equal(run(LINE_ANDROID, { href: 'https://leadone.anonacondacodelab.com/?a=1#help' }).link,
    'https://leadone.anonacondacodelab.com/?a=1&openExternalBrowser=1#help', 'a query or fragment is kept');
});

test('no banner in other browsers, or in the Android app', () => {
  assert.equal(run(CHROME).shown, false);
  assert.equal(run(LINE_ANDROID, { native: true }).shown, false);
});

test('the banner: hidden by default, web only, at the top of every screen, a same-tab link; built into the page', () => {
  const h = distHtml();
  const bar = /<div id="lineBar"[^>]*>[\s\S]*?<\/div>/.exec(h)[0];
  assert.match(bar, /class="line-bar web-only"/);
  assert.match(bar, /\shidden>/);
  assert.match(bar, />LINE's built-in browser can't connect to your strap or save files\.</);
  assert.match(bar, /<a id="lineOpen"[^>]*>Open in your browser<\/a>/);
  assert.ok(!/target=/.test(bar), 'opens in the same tab');
  assert.ok(h.indexOf('id="lineBar"') < h.indexOf('<header class="bar">') && h.indexOf('id="lineBar"') < h.indexOf('class="screen"'), 'above the header, outside the screens');
  assert.ok(h.includes(code.trim()), 'the whole of line.js is in the page');
});

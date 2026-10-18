import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distHtml } from './helpers.mjs';

test('built page is self-contained and locked down', () => {
  const h = distHtml();
  assert.match(h, /Content-Security-Policy" content="default-src 'none';[^"]*connect-src 'none'/);
  assert.match(h, /<meta name="referrer" content="no-referrer">/);
  assert.ok(!/\bsrc\s*=\s*["']https?:|<link\b[^>]*href\s*=\s*["']https?:|url\(\s*["']?https?:/i.test(h), 'no remote resources');
  for (const m of h.matchAll(/<a\b[^>]*href="https?:[^"]*"[^>]*>/g)) assert.match(m[0], /rel="noopener noreferrer"/, 'external links are isolated');
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(h), 'no network APIs');
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(h), 'all placeholders filled');
  assert.ok(h.includes('<title>Lead One ECG</title>'));
});

test('user manual is built into the app from docs/MANUAL.md', () => {
  const h = distHtml();
  const help = h.slice(h.indexOf('id="scrHelp"'), h.indexOf('<!-- HOME -->'));
  assert.ok(help.includes('<h2>Making a recording</h2>') && help.includes('<h2>Troubleshooting</h2>'), 'manual sections present');
  assert.ok(!/\*\*|^#{1,3} /m.test(help.replace(/<[^>]+>/g, '')), 'no raw Markdown left over');
  assert.ok(!/<script|on\w+=/i.test(help), 'manual contains no script');
  assert.ok(/<div class="callout">[\s\S]*not a medical device/i.test(help), 'wellness-only callout at the top');
  assert.ok(help.includes('<h2>Wellness use only: please read</h2>'), 'wellness section present');
});

test('history import is reachable on first run and file pickers are not type-filtered', () => {
  const h = distHtml();
  assert.ok(/id="btnImportSetup"/.test(h), 'import offered during first-run setup');
  for (const id of ['histIn', 'fileIn']) {
    const acc = (h.match(new RegExp(`id="${id}" accept="([^"]*)"`)) || [])[1] || '';
    assert.ok(acc.includes('application/octet-stream'), id + ': generic data files (as chat apps label them) can be picked');
    assert.ok(!/image|audio|video|\*/.test(acc), id + ': no media or wildcard types, so Android does not offer camera or microphone');
  }
});

test('wellness-use acknowledgement is required before first use', () => {
  const h = distHtml();
  const ack = h.slice(h.indexOf('id="scrAck"'), h.indexOf('<!-- PROFILE'));
  assert.ok(/id="ackBox"/.test(ack) && /id="btnAck"[^>]*disabled/.test(ack), 'checkbox present and Continue disabled by default');
  assert.ok(/not a medical device/i.test(ack) && /emergency/i.test(ack), 'states not a medical device and emergency advice');
  assert.ok(/if \(!acked\(\)\) show\('scrAck'\)/.test(h), 'shown at start-up until acknowledged');
});

test('home-screen install: manifest and icons are local, CSP stays offline', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const h = distHtml();
  assert.match(h, /manifest-src 'self'/);
  assert.match(h, /connect-src 'none'/);
  assert.match(h, /worker-src 'none'/);
  assert.match(h, /<link rel="manifest" href="manifest.webmanifest">/);
  assert.ok(/id="btnInstall"/.test(h), 'install button present');
  const dir = new URL('../dist/', import.meta.url);
  const m = JSON.parse(readFileSync(new URL('manifest.webmanifest', dir), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, '/');
  for (const i of m.icons) { assert.ok(!/^https?:/.test(i.src)); assert.ok(existsSync(new URL(i.src, dir)), i.src); }
  assert.ok(m.icons.some(i => i.sizes === '192x192') && m.icons.some(i => i.sizes === '512x512'));
});

test('donation card is quiet: hidden by default, milestone-based, link isolated', () => {
  const h = distHtml();
  assert.match(h, /<div id="donateCard" class="card donate" hidden>/);
  assert.match(h, /id="btnDonate"[^>]*href="https:\/\/ko-fi\.com\/[^"]+" target="_blank" rel="noopener noreferrer"/);
  assert.match(h, /const DONATE_AT = \[20, 50, 100\]/);
});

test('sample reports never use the personal profile', () => {
  const h = distHtml();
  assert.match(h, /const st = meta\.sample \? \{ name: '', sex: 'M', dob: [^}]+\} : getSettings\(\);/);
});

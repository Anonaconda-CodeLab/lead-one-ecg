#!/usr/bin/env node
// Copyright (C) 2026 Anonaconda Coding Studio · SPDX-License-Identifier: GPL-3.0-or-later
// Builds dist/index.html: a single self-contained page (fonts, styles and scripts inlined)
// with a strict Content Security Policy that blocks every network request.
//   node build.mjs              -> dist/index.html
//   node build.mjs --fragment   -> dist/fragment.html (page body only, for embedding/preview hosts)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
// ---- project settings (edit these) ----
const PROJECT = {
  name: 'Lead One ECG',
  filePrefix: 'LeadOne-ECG',
  repoUrl: '',            // e.g. 'https://github.com/your-name/lead-one-ecg'  (shown in Settings > About)
  kofi: 'anonacondacodelab' // your Ko-fi username; leave empty to hide the support link
};
const APP = { APP_NAME: PROJECT.name, FILE_PREFIX: PROJECT.filePrefix, VERSION: pkg.version };
const safeUrl = u => /^https:\/\/[\w.-]+(\/[\w./%-]*)?$/.test(u) ? u : '';
const repo = safeUrl(PROJECT.repoUrl), kofi = /^[A-Za-z0-9_]{1,60}$/.test(PROJECT.kofi) ? 'https://ko-fi.com/' + PROJECT.kofi : '';
const about = `<div class="card" id="aboutCard">
      <div><div class="dev-name">About ${APP.APP_NAME}</div><div class="dev-meta">Version ${APP.VERSION} · free and open source (GNU GPL v3) · runs entirely on this device</div></div>
      <p class="dev-meta" style="margin:0">© 2026 Anonaconda Coding Studio. You may use, share and modify this app under the GNU General Public License v3 or later; it comes with no warranty. Independent software, not affiliated with Polar Electro. Not a medical device.</p>
      ${repo || kofi ? `<div class="acts-row">${repo ? `<a class="btn" href="${repo}" target="_blank" rel="noopener noreferrer">Source code</a>` : ''}${kofi ? `<a class="btn coffee" href="${kofi}" target="_blank" rel="noopener noreferrer">☕ Support on Ko-fi</a>` : ''}</div>` : ''}
    </div>`;

const src = f => readFileSync(join(root, 'src', f), 'utf8');
const b64 = f => readFileSync(join(root, 'src', 'fonts', f)).toString('base64');
const fill = s => s.replace(/\{\{(APP_NAME|FILE_PREFIX|VERSION)\}\}/g, (_, k) => APP[k]).replace('{{ABOUT}}', about);

const fonts = `@font-face{font-family:"Instrument Sans";font-style:normal;font-display:swap;font-weight:400 700;font-stretch:75% 100%;src:url(data:font/woff2;base64,${b64('InstrumentSans-latin-variable.woff2')}) format("woff2-variations")}
@font-face{font-family:"IBM Plex Mono";font-style:normal;font-display:swap;font-weight:400;src:url(data:font/woff2;base64,${b64('IBMPlexMono-latin-400.woff2')}) format("woff2")}
@font-face{font-family:"IBM Plex Mono";font-style:normal;font-display:swap;font-weight:500;src:url(data:font/woff2;base64,${b64('IBMPlexMono-latin-500.woff2')}) format("woff2")}`;

const css = `<style>${fonts}\n${src('style.css')}</style>`;
const js = `<script>\n${fill(src('core.js'))}\n${fill(src('report.js'))}\n${fill(src('app.js'))}\n</script>`;
const body = fill(src('body.html'));
const title = `<title>${APP.APP_NAME}</title>`;

const CSP = ["default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'", 'font-src data:', 'img-src data: blob:',
  "connect-src 'none'", "media-src 'none'", "object-src 'none'", "frame-src 'none'", "worker-src 'none'", "manifest-src 'none'",
  "base-uri 'none'", "form-action 'none'"].join('; ');

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#b31f39">
<meta name="description" content="${APP.APP_NAME}: record, analyse and report single-lead ECG and HRV from a chest-strap heart-rate monitor. Runs entirely in your browser.">
${title}
<style>html{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}[hidden]{display:none!important}</style>
${css}
</head><body>
${body}
${js}
</body></html>
`;

mkdirSync(join(root, 'dist'), { recursive: true });
const fragment = process.argv.includes('--fragment');
const out = fragment ? `${title}\n<meta name="claude:viewport-fit-sides" content="cover">\n${css}\n${body}\n${js}\n` : page;
const file = join(root, 'dist', fragment ? 'fragment.html' : 'index.html');
writeFileSync(file, out);

// sanity checks: script parses, no remote resources
new Function(js.slice(8, -9));
const stripped = out.replace(/<code>[^<]*<\/code>/g, '');
// anything the page would load by itself (scripts, styles, images, frames) must be local; plain <a href> links are allowed
const remote = stripped.match(/\bsrc\s*=\s*["']https?:|<link\b[^>]*href\s*=\s*["']https?:|url\(\s*["']?https?:/gi);
if (remote) { console.error('Remote resource reference found:', remote); process.exit(1); }
console.log(`${APP.APP_NAME} ${APP.VERSION} -> ${file} (${(out.length / 1024).toFixed(0)} KB)`);

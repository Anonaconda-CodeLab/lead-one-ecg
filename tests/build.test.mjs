import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distHtml } from './helpers.mjs';
import { readFileSync } from 'node:fs';

test('built page is self-contained and locked down', () => {
  const h = distHtml();
  assert.match(h, /Content-Security-Policy" content="default-src 'none';[^"]*connect-src 'none'/);
  assert.match(h, /<meta name="referrer" content="no-referrer">/);
  assert.ok(!/\bsrc\s*=\s*["']https?:|<link\b(?![^>]*rel="canonical")[^>]*href\s*=\s*["']https?:|url\(\s*["']?https?:/i.test(h), 'no remote resources (canonical only names the address)');
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
  assert.match(h, /id="btnDonate"[^>]*href="https:\/\/ko-fi\.com\/[^"]+" rel="noopener noreferrer"/);
  assert.match(h, /const DONATE_AT = \[20, 50, 100\]/);
  assert.ok(h.includes('No ads, no tracking. If you find this app useful, please consider <a href="https://ko-fi.com/anonacondacodelab" rel="noopener noreferrer">making a small donation</a> to help fund development. Thank you!'), 'studio donation line (27 Oct 2026)');
  assert.ok(!/made by one person/i.test(h), 'old wording gone');
});

test('sample reports never use the personal profile', () => {
  const h = distHtml();
  assert.match(h, /const st = meta\.sample \? \{ name: '', sex: 'M', dob: [^}]+\} : getSettings\(\);/);
});

test('Android app: no internet permission, native layer inactive in browsers', async () => {
  const { readFileSync } = await import('node:fs');
  const m = readFileSync(new URL('../mobile/android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  assert.match(m, /android\.permission\.INTERNET" tools:node="remove"/);
  assert.ok(!/<uses-permission android:name="android\.permission\.INTERNET" \/>/.test(m));
  assert.ok(!/<provider\b|FileProvider/.test(m), 'no FileProvider: nothing in the app shares files by link');
  const { existsSync } = await import('node:fs');
  assert.ok(!existsSync(new URL('../mobile/android/app/src/main/res/xml/file_paths.xml', import.meta.url)), 'the template FileProvider paths file stays gone');
  const gw = readFileSync(new URL('../mobile/android/gradle/wrapper/gradle-wrapper.properties', import.meta.url), 'utf8');
  assert.match(gw, /^distributionSha256Sum=[0-9a-f]{64}$/m, 'the Gradle download is checked against a known hash');
  const j = readFileSync(new URL('../mobile/android/app/src/main/java/com/anonacondacodelab/leadone/LeadOnePlugin.java', import.meta.url), 'utf8');
  const wc = j.slice(j.indexOf('public void writeChunk'), j.indexOf('public void print'));
  assert.match(j, /saveUri = uri;/, 'the save screen sets the one address that may be written');
  assert.match(wc, /saveUri == null \|\| !saveUri\.equals\(target\)/, 'writeChunk refuses any other address');
  assert.ok((wc.match(/saveUri = null/g) || []).length >= 2, 'cleared after the last piece and after a failure');
  const guardAt = wc.search(/saveUri == null \|\| !saveUri\.equals\(target\)/), openAt = wc.indexOf('openOutputStream(');
  assert.ok(guardAt > 0 && openAt > guardAt && wc.indexOf('openOutputStream(') === wc.lastIndexOf('openOutputStream('), 'the address is checked before any file is opened (opening with "wt" empties it)');
  const h = distHtml();
  assert.match(h, /const NATIVE = !!\(window\.Capacitor && typeof window\.Capacitor\.isNativePlatform === 'function'/);
});

test('web version points to the Android app; the Android app hides those links', async () => {
  const { readFileSync } = await import('node:fs');
  const h = distHtml(), css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const home = h.slice(h.indexOf('id="scrHome"'), h.indexOf('</section>', h.indexOf('id="scrHome"')));
  assert.ok(home.includes('<p class="android-link web-only"><a href="/android.html">Also available as an Android app →</a></p>'), 'home-screen link');
  assert.ok(home.indexOf('class="thanks"') < home.indexOf('android-link'), 'under the thank-you line');
  assert.match(h, /Source code<\/a><a class="btn web-only" href="\/android\.html">Android app<\/a>/, 'About: next to Source code');
  assert.match(css, /\.native \.web-only\{display:none\}/, 'hidden in the Android app');
  assert.match(css, /html:not\(\.native\) \.native-only\{display:none\}/, 'Android-only buttons hidden on the web, whatever their own display');
  for (const m of h.matchAll(/<a\b[^>]*android\.html[^>]*>/g)) assert.ok(!/target=/.test(m[0]), 'same tab');
});

test('link previews: canonical, Open Graph image, robots.txt and sitemap.xml', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(html, /<link rel="canonical" href="https:\/\/leadone\.anonacondacodelab\.com\/">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/anonacondacodelab\.com\/social\/og-lead-one\.jpg">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(readFileSync(new URL('../dist/robots.txt', import.meta.url), 'utf8'), /Sitemap: https:\/\/leadone\.anonacondacodelab\.com\/sitemap\.xml/);
  assert.match(readFileSync(new URL('../dist/sitemap.xml', import.meta.url), 'utf8'), /<loc>https:\/\/leadone\.anonacondacodelab\.com\/<\/loc>/);
});

test('web app, Android package and Android build all carry the same version', async () => {
  const { readFileSync } = await import('node:fs');
  const r = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const v = JSON.parse(r('package.json')).version, [a, b, c] = v.split('.').map(Number);
  assert.equal(JSON.parse(r('mobile/package.json')).version, v, 'mobile/package.json');
  const g = r('mobile/android/app/build.gradle');
  assert.match(g, new RegExp(`versionName "${v.replace(/\./g, '\\.')}"`), 'versionName');
  assert.match(g, new RegExp(`versionCode ${a * 10000 + b * 100 + c}\\b`), 'versionCode');
});

test('launch: source link, contact, update button and the Android page', async () => {
  const { readFileSync } = await import('node:fs');
  const r = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const h = distHtml(), v = JSON.parse(r('package.json')).version;
  assert.ok(h.includes('href="https://github.com/Anonaconda-CodeLab/lead-one-ecg"'), 'source-code link');
  assert.ok(h.includes('mailto:hello@anonacondacodelab.com') && /don.t send recordings or reports/.test(h), 'contact with a privacy note');
  assert.ok(h.includes(`class="btn native-only" href="https://leadone.anonacondacodelab.com/android.html?v=${v}"`), 'Check for updates (Android only)');
  const a = r('dist/android.html');
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(a), 'all placeholders filled');
  assert.ok(a.includes('4D:6C:EA:58:94:C0:D7:D8:E9:AB:74:BC:3A:1E:9C:A5:47:BD:40:A2:02:B6:70:99:AF:66:5B:29:7F:7A:8F:47'), 'signing fingerprint');
  assert.ok(a.includes(`var latest = '${v}'`) && a.includes('releases/latest') && a.includes('keepandroidopen.org') && a.includes('Obtainium'));
  assert.match(a, /default-src 'none'/);
  assert.ok(r('dist/sitemap.xml').includes('/android.html'));
});

test('release workflow: three jobs; only publish can write, only sign sees the key, no tag trigger', async () => {
  const { readFileSync } = await import('node:fs');
  const w = readFileSync(new URL('../.github/workflows/android.yml', import.meta.url), 'utf8');
  const job = name => { const m = w.match(new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z]+:\\n|$)`)); assert.ok(m, name + ' job'); return m[1]; };
  const build = job('build'), sign = job('sign'), publish = job('publish');
  assert.equal((w.match(/contents: write/g) || []).length, 1, 'contents: write appears once');
  assert.match(publish, /contents: write/);
  for (const j of [build, sign]) assert.match(j, /contents: read/);
  assert.ok(!/secrets\./.test(build) && !/secrets\./.test(publish), 'the signing key is used in the sign job only');
  assert.match(sign, /secrets\.LEADONE_KEYSTORE_B64/);
  assert.match(sign, /\n    environment: signing(\s+#.*)?\n/, 'the sign job uses the protected signing environment');
  assert.ok(sign.includes("to the 'signing' environment"), 'the missing-key message points to the signing environment');
  assert.ok(!/repository secrets/i.test(w), 'help text never points to repository secrets');
  for (const j of [build, publish]) assert.ok(!/environment:/.test(j), 'only the sign job uses an environment');
  assert.match(build, /persist-credentials: false/);
  assert.match(build, /retention-days: 30/, 'the unsigned APK outlives a late approval');
  assert.match(sign, /tr -d '\[:space:\]'/, 'all whitespace is stripped from the stored key');
  assert.ok(sign.includes('the published fingerprint is'), 'the APK must carry the published signing key');
  assert.ok(!/tags:/.test(w.split('jobs:')[0]), 'no tag trigger');
  assert.match(publish, /android-test/);
  // Remark's clear_prerelease: the old pre-release and its tag are removed first, and only "not there" is accepted.
  // The real step runs in bash against a stand-in gh that answers as GitHub would in each case
  assert.match(publish, /clear_prerelease android-test\n\s*gh release create android-test/);
  const step = (() => { const k = w.indexOf('- name: Publish as the android-test pre-release'), r = w.indexOf('run: |', k);
    return w.slice(r + 7).split('\n').filter(l => l.startsWith('          ')).map(l => l.slice(10)).join('\n').replace(/\$\{\{[^}]*\}\}/g, '1'); })();   // ${{ }} is filled in by GitHub before bash runs
  const { execFileSync } = await import('node:child_process'), { mkdtempSync, writeFileSync, chmodSync } = await import('node:fs');
  const { tmpdir } = await import('node:os'), { join } = await import('node:path');
  const runStep = answers => {
    const dir = mkdtempSync(join(tmpdir(), 'gh-')), log = join(dir, 'log');
    // answers: 'releases/tags', 'git/ref/tags', 'DELETE' -> 'ok' | '404' | '403' | '503'
    writeFileSync(join(dir, 'gh'), `#!/bin/bash
echo "$*" >> "${log}"
key=""; case "$*" in *"-X DELETE"*) key=DELETE;; *releases/tags/*) key=rel;; *git/ref/tags/*) key=tag;; esac
case "$key" in rel) a="${answers.rel}";; tag) a="${answers.tag}";; DELETE) a="${answers.del}";; *) exit 0;; esac
case "$a" in ok) exit 0;; 404) echo "gh: Not Found (HTTP 404)"; exit 1;; *) echo "gh: error (HTTP $a)"; exit 1;; esac
`); chmodSync(join(dir, 'gh'), 0o755);
    let code = 0;
    try { execFileSync('bash', ['-e', '-o', 'pipefail', '-c', step], { env: { ...process.env, PATH: dir + ':' + process.env.PATH, GITHUB_REPOSITORY: 'o/r', GITHUB_SHA: 'abc', VER: '1.0.0' }, stdio: 'pipe' }); }
    catch (e) { code = e.status; }
    let calls = ''; try { calls = readFileSync(log, 'utf8'); } catch (e) {}
    return { code, created: /release create android-test/.test(calls), deletedRelease: /release delete android-test/.test(calls) };
  };
  let r = runStep({ rel: 'ok', tag: 'ok', del: 'ok' }); assert.ok(r.code === 0 && r.deletedRelease && r.created, 'both there: both removed, then created');
  r = runStep({ rel: '404', tag: '404', del: 'ok' }); assert.ok(r.code === 0 && !r.deletedRelease && r.created, 'nothing there: created');
  r = runStep({ rel: 'ok', tag: 'ok', del: '403' }); assert.ok(r.code !== 0 && !r.created, 'a failed tag DELETE stops before create');
  r = runStep({ rel: 'ok', tag: 'ok', del: '404' }); assert.ok(r.code === 0 && r.created, 'a tag removed meanwhile is fine');
  r = runStep({ rel: '503', tag: 'ok', del: 'ok' }); assert.ok(r.code !== 0 && !r.created, 'an unclear release lookup stops');
  r = runStep({ rel: '404', tag: '503', del: 'ok' }); assert.ok(r.code !== 0 && !r.created, 'an unclear tag lookup stops');
  assert.ok(!/--cleanup-tag \|\| true/.test(publish), 'no silent failure any more');
  assert.match(w, /LeadOne-ECG-\$VER\.apk/);
  // hardening carried over from Still Point 1.0.2
  const validate = build.search(/- uses: gradle\/actions\/wrapper-validation@[0-9a-f]{40}/), gradle = build.indexOf('./gradlew --no-daemon assembleRelease');
  assert.ok(validate >= 0 && gradle > validate, 'the Gradle wrapper is validated before the build runs it');
  assert.match(sign, /APKVER=\$\("\$BT\/aapt2" dump badging "\$APK"[\s\S]*if \[ "\$APKVER" != "\$VER" \]; then[\s\S]*exit 1;/, 'the APK version is checked against package.json');
  assert.match(publish, /if response=\$\(gh api --include "repos\/\$GH_REPO\/git\/ref\/tags\/\$TAG"[\s\S]*?then[\s\S]*?Tag \$TAG already exists without a release[\s\S]*?exit 1[\s\S]*?HTTP\/\[0-9\.\]\+ 404[\s\S]*?exit 1/, 'an existing tag without a release is refused, and so is an unclear answer');
});

test('CI: tests on Node 20 and 22 (engines from 20.12), and dist/ checked for changed and new files', async () => {
  const { readFileSync } = await import('node:fs');
  const c = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(c, /node: \[20, 22\]/);
  assert.equal(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).engines.node, '>=20.12');
  assert.match(c, /git diff --exit-code -- dist\//);
  assert.match(c, /git ls-files --others --exclude-standard -- dist\//, 'new, uncommitted files in dist/ fail too');
});

test('workflows: every action is pinned to a full commit (a moved tag cannot change what runs)', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['.github/workflows/android.yml', '.github/workflows/ci.yml']) {
    const uses = [...readFileSync(new URL('../' + f, import.meta.url), 'utf8').matchAll(/uses:\s*(\S+)/g)].map(m => m[1]);
    assert.ok(uses.length > 0, f);
    for (const u of uses) assert.match(u, /^[\w.-]+\/[\w.-]+(\/[\w.-]+)*@[0-9a-f]{40}$/, `${f}: ${u}`);
  }
});

test('auto-stop does not apply to training: switch hidden, fixed hint, saved setting kept, 8-hour limit kept', () => {
  const h = distHtml();
  const src = h.match(/function autoStopFor\(ctx, on, min\) \{[^\n]*\}/);
  assert.ok(src, 'autoStopFor in the built page');
  const autoStopFor = new Function('return ' + src[0])();
  assert.equal(autoStopFor('training', true, 30), 0, 'training ignores a saved auto-stop');
  assert.equal(autoStopFor('training', false, 30), 0);
  assert.equal(autoStopFor('ortho', false, 30), 6, 'the orthostatic test still stops at 6 minutes');
  assert.equal(autoStopFor('morning', true, 5), 5, 'other contexts keep the saved setting');
  assert.equal(autoStopFor('rest', false, 5), 0);
  assert.ok(h.includes("$('.setup .auto').hidden = S.ctx === 'ortho' || S.ctx === 'training';"), 'switch hidden for training');
  assert.ok(h.includes("'Training recordings run until you stop them (maximum 8 hours).'"), 'training hint');
  assert.match(h, /if \(S\.total >= MAX_SAMPLES\) stopRecording\('limit'\);/, 'the 8-hour limit still stops every recording');
  const setUpd = h.slice(h.indexOf('function updateAuto()'), h.indexOf("$('#autoOn').onchange"));
  assert.ok(/patchSettings\(\{ autoOn: on, autoMin: S\.autoMinSel \}\)/.test(setUpd), 'the setting is saved only from the switch itself');
});

test('Stop held in the first 2 minutes of recovery asks once more; the finish screen says when recovery was cut short', () => {
  const h = distHtml(), grab = name => new Function('RECOVERY_SEC', 'Math', 'return ' + h.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))[0])(120, Math);
  const need = grab('stopNeedsConfirm');
  assert.equal(need(1800, 1807, 0, 1000), true, '7 s into recovery: ask');
  assert.equal(need(1800, 1807, 5000, 1000), false, 'held again within 10 s: stop');
  assert.equal(need(1800, 1925, 0, 1000), false, 'after 2 minutes: stop straight away');
  assert.equal(need(null, 600, 0, 1000), false, 'no recovery started: stop straight away');
  const note = grab('recoveryCutNote');
  assert.match(note(1802.5, 1809.8), /Recovery was cut short: the recording stopped 7 s after Start recovery/);
  assert.equal(note(1802.5, 1932), ''); assert.equal(note(null, 1809.8), '');
  assert.ok(h.includes("S.stopping = true; S.stopWhy = why;"), 'why it stopped is kept');
  assert.ok(h.includes("stopWhy: ['user', 'auto', 'limit'].includes(m.stopWhy) ? m.stopWhy : ''"), 'and survives export and re-import');
  assert.ok(h.includes("stopHeld(); }, 1200)"), 'the Stop button goes through the guard');
});

test('breathing in Training: live tile says "moving" instead of waiting for ever; exports keep the H10 motion data', () => {
  const h = distHtml();
  const live = new Function('return ' + h.match(/function liveBrText\([^)]*\) \{[\s\S]*?\n\}/)[0])();
  assert.equal(live(true, 14.24, true, 'training'), '14.2<small>/min</small>');
  assert.equal(live(true, null, true, 'training'), 'moving', 'training, 30 s of motion data, no rhythm');
  assert.equal(live(true, null, false, 'training'), '…', 'still collecting');
  assert.equal(live(true, null, true, 'rest'), '…', 'at rest it keeps waiting for a still stretch');
  assert.equal(live(false, null, true, 'rest'), 'n/a');
  // the motion-data rates an export may carry include the H10's 25 Hz averaged by 3 (8.33 Hz), as saved by JSON
  const rates = h.match(/const ACC_RATES = (\[[^\]]*\]);/)[1];
  const ok = new Function(`const ACC_RATES = ${rates}; ${h.match(/const ACC_FS = [^\n]*/)[0]} ${h.match(/const accRateOk = [^\n]*/)[0]} return accRateOk;`)();
  assert.ok(ok(JSON.parse(JSON.stringify(25 / 3))), '8.333… Hz accepted');
  for (const fs of [10, 12.5, 20]) assert.ok(ok(fs), fs + ' Hz accepted');
  for (const fs of [7, 9, '10', NaN, null]) assert.ok(!ok(fs), String(fs) + ' refused');
  assert.ok(h.includes('accRateOk(j.accFs)'), 'the import uses the check');
  assert.ok(h.includes('acc: meta._acc, recMark: meta.recMark, ctx: meta.ctx }'), 'analysis knows the context');
  assert.equal((h.match(/await analyze\(/g) || []).length, (h.match(/await analyze\((raw|S\.raw), analyzeOpts\((meta|S\.meta)\)/g) || []).length, 'every analysis gets the same options');
  assert.ok(h.includes("if (S.raw && wasTraining !== (S.meta.ctx === 'training')) S.analysis = await analyze(S.raw, analyzeOpts(S.meta));"), 'moving a report into or out of Training re-runs the analysis');
  assert.ok(h.includes("S.ctx === 'training' ? 'The motion sensor could not be started, so breathing will not be measured in this session.'"), 'no ECG breathing promised in Training');
});

test('recording timer: held while paused, never goes backwards', () => {
  const h = distHtml();
  const f = new Function('return ' + h.match(/function shownActive\([^)]*\) \{[^\n]*\}/)[0])();
  // paused at 474.6 s: elNow keeps running between packets while paused samples arrive in half-second steps
  let shown = f(0, 474.6, false);
  for (const a of [474.9, 475.2, 474.7, 475.1, 474.6]) { shown = f(shown, a, true); assert.equal(Math.floor(shown), 474, 'stays at 07:54'); }
  shown = f(shown, 474.4, false); assert.equal(shown, 474.6, 'no step back on Resume');
  shown = f(shown, 475.3, false); assert.equal(shown, 475.3, 'counts on after Resume');
  assert.ok(h.includes('const active = S.shownT = shownActive(S.shownT || 0,'), 'the timer uses it');
  assert.ok(h.includes('paused: false, shownT: 0 });'), 'reset for each new recording');
});

test('position remembered per context: Training\'s "walking" does not carry over to a morning reading', () => {
  const h = distHtml();
  const POS = { lying: {}, sitting: {}, standing: {}, walking: {} };
  const grab = name => h.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))[0];
  const { posMap, posFor } = new Function('POS', `${grab('posMap')}\n${grab('posFor')}\nreturn { posMap, posFor };`)(POS);
  // settings saved by 1.8.4: one position for every context
  const old = posMap({ lastCtx: 'training', lastPos: 'walking' });
  assert.equal(posFor(old, 'training'), 'walking', 'kept for the context it was used with');
  assert.equal(posFor(old, 'morning'), '', 'a morning reading starts unselected, not on walking');
  const m = posMap({ lastCtx: 'training', lastPos: 'walking', posByCtx: { morning: 'lying', training: 'walking' } });
  assert.equal(posFor(m, 'morning'), 'lying'); assert.equal(posFor(m, 'training'), 'walking');
  assert.equal(posFor({ morning: 'flying' }, 'morning'), '', 'unknown positions ignored');
  assert.equal(posFor(posMap({ posByCtx: [] }), 'morning'), '', 'malformed settings ignored');
  assert.ok(!/patchSettings\(\{ lastPos/.test(h), 'no single shared position any more');
});

test('interval timer: Tabata schedule, phases, and a simulated session through the live timer', () => {
  const h = distHtml();
  const grab = name => h.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))[0];
  const tab = { w: 20, r: 10, n: 8 };
  const { ivEvents, ivPhase } = new Function(`const IV_COUNT = 3; ${grab('ivEvents')}\n${grab('ivPhase')}\nreturn { ivEvents, ivPhase };`)();
  const ev = ivEvents(tab);
  assert.deepEqual(ev.slice(0, 3).map(e => [e.at, e.k]), [[-3, 'tick'], [-2, 'tick'], [-1, 'tick']]);
  assert.equal(ev.filter(e => e.k === 'work').length, 8); assert.equal(ev.filter(e => e.k === 'rest').length, 7, 'no rest after the last round');
  assert.deepEqual(ev[ev.length - 1], { at: 230, k: 'end' }, '8 × 20 s + 7 × 10 s');
  assert.deepEqual(ivPhase(tab, 25), { k: 'rest', i: 1, left: 5 });
  assert.deepEqual(ivPhase(tab, 30), { k: 'work', i: 2, left: 20 });
  assert.equal(ivPhase(tab, 230).k, 'done'); assert.equal(ivPhase(tab, -2).k, 'count');
  assert.equal(ivEvents({ w: 60, r: 0, n: 3 }).filter(e => e.k === 'rest').length, 0, 'no rest beeps without rests');

  // the live timer, ticked twice a second; Start intervals tapped at 10 s into the recording (round 1 at 13 s).
  // `pause` = a Pause/Resume stretch in recording time: the interval clock must stop for it, beeps included
  const core = readFileSync(new URL('../src/core.js', import.meta.url), 'utf8');
  const grabC = name => core.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))[0];
  const simulate = pause => {
    const el = { v: 10 }, heard = [], marks = [], timers = [];
    const dom = {}; const $ = sel => dom[sel] || (dom[sel] = { textContent: '', classList: { toggle() {}, remove() {} } });
    const S = { plan: tab, ivTap: 10, ivDone: -1, paused: false, recMark: null, planned: null, pauses: [] };
    const CQ = { timers: [] };
    const run = new Function('S', '$', 'CQ', 'elNow', 'planCue', 'markRecovery', 'ms2', 'CUE', `const IV_COUNT = 3, AHEAD = 1.2;
      ${grabC('pauseList')}\n${grabC('activeBetween')}\n${grab('ivTime')}\n${grab('ivEvents')}\n${grab('ivPhase')}\n${grab('ivFinish')}\n${grab('tickIntervals')}\nreturn tickIntervals;`);
    const tick = run(S, $, CQ, () => el.v,
      (key, strong, due, then, pat) => { S.planned = key; timers.push({ at: el.v + due, key, then, pat }); },
      () => { S.recMark = el.v; marks.push(el.v); }, s => String(Math.ceil(s)), { tick: 'tick', go: 'go', rest: 'rest', end: 'end' });
    let msg = '';
    for (; el.v < 13 + 260; el.v = Math.round((el.v + 0.5) * 10) / 10) {
      if (pause && el.v === pause[0]) { S.paused = true; S.pauses.push({ t0: el.v, t1: null }); timers.length = 0; S.planned = null; }   // as the Pause button (cancelCues)
      if (pause && el.v === pause[1]) { S.paused = false; S.pauses[0].t1 = el.v; }
      for (const x of timers.splice(0).sort((a, b) => a.at - b.at)) { if (x.at <= el.v + 1e-9) { heard.push([+(x.at - 13).toFixed(1), x.pat]); if (S.planned === x.key) x.then(); } else timers.push(x); }
      if (S.recMark == null) tick(el.v, $('#stepPanel'));
      if (pause && el.v === pause[0] + 5) msg = $('#spMsg').textContent + ' · ' + $('#spCount').textContent;
    }
    return { heard, marks, msg };
  };
  const plain = simulate(null);
  assert.deepEqual(plain.heard.filter(x => x[1] === 'tick').map(x => x[0]), [-3, -2, -1], '3-2-1');
  assert.deepEqual(plain.heard.filter(x => x[1] === 'go').map(x => x[0]), [0, 30, 60, 90, 120, 150, 180, 210], 'GO at every work round, on time');
  assert.deepEqual(plain.heard.filter(x => x[1] === 'rest').map(x => x[0]), [20, 50, 80, 110, 140, 170, 200]);
  assert.deepEqual(plain.heard.filter(x => x[1] === 'end').map(x => x[0]), [230]);
  assert.equal(plain.marks.length, 1); assert.ok(Math.abs(plain.marks[0] - (13 + 230)) <= 0.5, 'Start recovery marked at the end of round 8: ' + plain.marks[0]);
  // paused 15 s in round 2's work (5 s into it, recording 48-63 s): nothing sounds while paused, round 2 goes on with
  // the 15 s it had left, and every later beep and the end move 15 s later
  const P = simulate([48, 63]);
  assert.ok(!P.heard.some(x => x[0] > 35 && x[0] < 50), 'silent while paused');
  assert.match(P.msg, /^paused · tap Resume to go on · 15$/, 'the round timer holds: ' + P.msg);
  assert.deepEqual(P.heard.filter(x => x[1] === 'go').map(x => x[0]), [0, 30, 75, 105, 135, 165, 195, 225], 'later rounds 15 s later');
  assert.deepEqual(P.heard.filter(x => x[1] === 'rest').map(x => x[0]), [20, 65, 95, 125, 155, 185, 215]);
  assert.deepEqual(P.heard.filter(x => x[1] === 'end').map(x => x[0]), [245]);
  assert.ok(Math.abs(P.marks[0] - (13 + 245)) <= 0.5, 'Start recovery 15 s later: ' + P.marks[0]);
  // a pause in the 3-2-1 holds the count too
  const C = simulate([11, 21]);
  assert.deepEqual(C.heard.filter(x => x[1] === 'tick').map(x => x[0]), [-3, 8, 9], 'count resumes where it stopped');
  assert.equal(C.heard.find(x => x[1] === 'go')[0], 10, 'round 1 starts 10 s later');

  // wiring
  assert.ok(h.includes('<button id="btnIntervals" class="btn primary" hidden>Start intervals</button>'));
  assert.ok(h.includes("if (S.trainType === 'intervals') { tickIntervals(el, P); return; }"));
  assert.ok(h.includes('planT0: S.ivTap != null && Number.isFinite(activeToRec(S.ivTap, S.pauses, IV_COUNT))') && h.includes('planT0: num(m.planT0)'), 'start of round 1 saved with the recording');
  assert.ok(h.includes("setPausedUI(S.paused); putSession(sessionMeta('recording')); tickTraining();"), 'the panel shows the pause at once');
});

test('licences: every bundled font and Android component with its full licence, on the Licences screen and in licences.txt', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const file = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const norm = t => t.replace(/\r\n/g, '\n').trim();
  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const h = distHtml(), web = file('dist/licences.txt'), and = file('dist/licences-android.txt');
  // web: the two typefaces, with their full OFL texts
  for (const f of ['src/fonts/OFL-InstrumentSans.txt', 'src/fonts/OFL-IBMPlexMono.txt']) assert.ok(web.includes(norm(file(f))), f);
  for (const s of ['Instrument Sans typeface', 'IBM Plex Mono typeface', 'SIL OPEN FONT LICENSE']) assert.ok(web.includes(s), s);
  // Android only: Capacitor, the Bluetooth plugin, Cordova (with its NOTICE), AndroidX, Kotlin; the Apache text once
  for (const s of ['Copyright (c) 2017-present Drifty Co.', 'Copyright (c) 2021 Capacitor plugin for Bluetooth Low Energy', 'Capacitor 8.5.3',
    'bluetooth-le', 'Apache Cordova Android framework 14.0.1', 'AndroidX libraries', 'Kotlin standard library', 'Copyright 2015-2020 The Apache Software Foundation'])
    assert.ok(and.includes(s), s);
  assert.equal((and.match(/TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION/g) || []).length, 1, 'the Apache text once, its components listed together');
  for (const f of ['src/vendor/LICENSE-capacitor.txt', 'src/vendor/LICENSE-bluetooth-le.txt', 'src/vendor/LICENSE-apache-2.0.txt', 'src/vendor/NOTICE-cordova.txt'])
    assert.ok(and.includes(norm(file(f))), 'full text in licences-android.txt: ' + f);
  // NOTICE.md carries every full text too (house rule), each matching its source file
  for (const f of ['src/fonts/OFL-InstrumentSans.txt', 'src/fonts/OFL-IBMPlexMono.txt', 'src/vendor/LICENSE-capacitor.txt', 'src/vendor/LICENSE-bluetooth-le.txt', 'src/vendor/LICENSE-apache-2.0.txt', 'src/vendor/NOTICE-cordova.txt'])
    assert.ok(file('NOTICE.md').includes('```text\n' + norm(file(f)) + '\n```'), 'full text in NOTICE.md: ' + f);
  for (const s of ['Drifty', 'Capacitor', 'AndroidX', 'Kotlin', 'Cordova']) assert.ok(!web.includes(s), `${s} is not in the web licences`);
  // every licence file in the source is used, and every font and vendored file has one (a new one fails here until listed)
  const used = [...file('build.mjs').matchAll(/'((?:fonts|vendor)\/[^']+)'/g)].map(m => m[1]);
  for (const f of readdirSync(new URL('../src/vendor', import.meta.url))) assert.ok(used.includes('vendor/' + f), 'listed: vendor/' + f);
  for (const f of readdirSync(new URL('../src/fonts', import.meta.url))) {
    if (f.endsWith('.txt')) { assert.ok(used.includes('fonts/' + f), 'listed: fonts/' + f); continue; }
    const fam = f.startsWith('InstrumentSans') ? 'InstrumentSans' : f.startsWith('IBMPlexMono') ? 'IBMPlexMono' : null;
    assert.ok(fam && used.includes(`fonts/OFL-${fam}.txt`), 'font with a licence: ' + f);
  }
  // the versions named match what the APK is built with
  const pkg = JSON.parse(file('mobile/package.json'));
  assert.equal(pkg.dependencies['@capacitor/android'], '8.5.3'); assert.equal(pkg.dependencies['@capacitor-community/bluetooth-le'], '8.3.0');
  assert.match(file('mobile/android/variables.gradle'), /cordovaAndroidVersion = '14\.0\.1'/);
  // the screen: reached from Settings > About, a list first, every text in full, the Android part in the app only
  assert.match(h, /<button id="btnLicences" class="btn">Licences<\/button>/);
  const scr = h.slice(h.indexOf('<section id="scrLicences"'), h.indexOf('<section id="scrHelp"'));
  assert.ok(scr.indexOf('id="licTop"') < scr.indexOf('<section class="lic" id="lic-1"'), 'the list comes before the texts');
  for (const f of ['fonts/OFL-InstrumentSans.txt', 'fonts/OFL-IBMPlexMono.txt', 'vendor/LICENSE-capacitor.txt', 'vendor/LICENSE-bluetooth-le.txt', 'vendor/LICENSE-apache-2.0.txt', 'vendor/NOTICE-cordova.txt'])
    assert.ok(scr.includes(`<pre class="licences" translate="no">${esc(norm(file('src/' + f)))}</pre>`), 'on the screen: ' + f);
  assert.match(scr, /<div class="native-only"><h2 class="licences-head">In the Android app<\/h2><section class="lic" id="lic-a1"/);
  for (const id of new Set([...scr.matchAll(/data-lic="(lic-a?\d+)"/g)].map(m => m[1]))) assert.match(scr, new RegExp(`<section class="lic" id="${id}" tabindex="-1">`), id);
  assert.equal((scr.match(/<section class="lic" id=/g) || []).length, (scr.match(/↑ Back to the list/g) || []).length);
  assert.match(h, /html:not\(\.native\) \.native-only\{display:none\}/);
  assert.ok(h.includes("scr === 'scrLicences' ? document.getElementById('btnLicencesBack')"), 'Android Back leaves the Licences screen');
  assert.match(file('NOTICE.md'), /Licences\*\* screen/);
  // *.txt is ignored (recordings are never committed), so the licence files need their own exceptions, or they would
  // silently stay out of the repository, the Cloudflare site and the APK
  const { execFileSync } = await import('node:child_process');
  const lic = ['dist/licences.txt', 'dist/licences-android.txt', ...readdirSync(new URL('../src/vendor', import.meta.url)).map(f => 'src/vendor/' + f),
    ...readdirSync(new URL('../src/fonts', import.meta.url)).filter(f => f.endsWith('.txt')).map(f => 'src/fonts/' + f)];
  let ignored = '';
  // --no-index: ignore rules are applied to tracked files too (by default git skips them)
  try { ignored = execFileSync('git', ['check-ignore', '--no-index', ...lic], { cwd: new URL('..', import.meta.url), encoding: 'utf8' }); } catch (e) { if (e.status !== 1) throw e; ignored = e.stdout || ''; }
  assert.equal(ignored.trim(), '', 'licence files are not ignored by git');
});

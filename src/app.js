/* ===== {{APP_NAME}} · recorder, storage, history, UI =====
   Storage keys keep their original 'h10ecg' names so existing recordings and history remain readable.
   Copyright (C) 2026 Anonaconda Code Lab
   SPDX-License-Identifier: GPL-3.0-or-later
*/
const PMD_SERVICE = 'fb005c80-02e7-f387-1cad-8acd2d8df0c8';
const PMD_CP = 'fb005c81-02e7-f387-1cad-8acd2d8df0c8';
const PMD_DATA = 'fb005c82-02e7-f387-1cad-8acd2d8df0c8';
const ECG_START = new Uint8Array([0x02, 0x00, 0x00, 0x01, 0x82, 0x00, 0x01, 0x01, 0x0E, 0x00]);
const ECG_STOP = new Uint8Array([0x03, 0x00]);
/* file formats written by this app; older names are still accepted on import */
const REC_FORMATS = ['lead-one-ecg', 'h10-ecg-studio'], HIST_FORMATS = ['lead-one-ecg-history', 'h10-ecg-studio-history'];
/* Accelerometer (PMD measurement type 2): sample rate, 16-bit resolution, ±8 g range. Output in milli-g. */
const ACC_RATES = [25, 50, 100, 200];
const accStartCmd = hz => new Uint8Array([0x02, 0x02, 0x00, 0x01, hz & 0xff, hz >> 8, 0x01, 0x01, 0x10, 0x00, 0x02, 0x01, 0x08, 0x00]);
const ACC_STOP = new Uint8Array([0x03, 0x02]);
const ACC_GAP = -32768, ACC_CHUNK = 1200;   // stored samples per chunk (3 axes each)
const CHUNK = 60 * FS;

const $ = s => document.querySelector(s);
let FRAMED = false; try { FRAMED = window.top !== window.self; } catch (e) { FRAMED = true; }

const S = {
  device: null, cp: null, data: null, hrc: null, connected: false, battery: null, fw: null, devName: null,
  cpWaiter: null, recording: false, stopping: false, paused: false, sessionId: null, startMs: 0,
  chunks: [], cur: null, curLen: 0, total: 0, gapSamples: 0, pausedSamples: 0, pauses: [], rr: [],
  prevTs: null, lastWall: 0, needGapFill: false, ctx: '', pos: '', autoMin: 0,
  live: new Float32Array(5 * FS), livePos: 0, liveHP: null, liveLP: null, hr: null,
  analysis: null, meta: null, raw: null,
  acc: { on: false, hz: 0, dec: 1, fs: 0, t0: 0, chunks: [], cur: null, curLen: 0, total: 0, sum: [0, 0, 0], k: 0, ring: new Int16Array(3 * 600), ringPos: 0, ringN: 0, liveBr: null, lastBrCalc: 0 }
};

/* ---------- helpers ---------- */
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  document.body.dataset.screen = id; window.scrollTo(0, 0);
  if (id === 'scrReport') fitPages();
}
let toastT;
function toast(msg, ms = 4200) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms); }
const pad2 = v => String(v).padStart(2, '0');
function hms(sec) { sec = Math.max(0, Math.floor(sec)); return pad2(Math.floor(sec / 3600)) + ':' + pad2(Math.floor(sec / 60) % 60) + ':' + pad2(sec % 60); }
function ms2(sec) { sec = Math.max(0, Math.ceil(sec)); return Math.floor(sec / 60) + ':' + pad2(sec % 60); }
function durText(sec) { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); if (h) return `${h} h ${m} min`; if (sec < 60) return Math.round(sec) + ' s'; if (sec < 600) { const r = Math.round(sec), ss = r % 60; return Math.floor(r / 60) + ' min' + (ss ? ' ' + ss + ' s' : ''); } return `${Math.round(sec / 60)} min`; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function downloadFile(name, text) {
  if (FRAMED) { toast('Saving files works when the app is opened from its own web address in Chrome.', 6000); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

/* ---------- validation of anything read from files or imports ---------- */
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k) ? k : '';
const num = v => typeof v === 'number' && isFinite(v) ? v : null;
const str = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').slice(0, n) : '';
const MAX_FILE = 300 * 1024 * 1024;
function cleanMeta(m) {
  const start = num(m.start) != null && m.start > 946684800000 && m.start < Date.now() + 864e5 ? m.start : Date.now();
  return {
    id: str(m.id, 80) || 'file-' + start, start, ctx: own(CTX, m.ctx), pos: own(POS, m.pos),
    device: str(m.device, 40) || 'Polar H10', fw: str(m.fw, 20), battery: num(m.battery) != null ? Math.round(Math.max(0, Math.min(100, m.battery))) : null,
    gap: Math.max(0, num(m.gap) || 0), paused: Math.max(0, num(m.paused) || 0),
    pauses: Array.isArray(m.pauses) ? m.pauses.filter(p => p && num(p.t0) != null && num(p.t1) != null && p.t1 >= p.t0).slice(0, 2000).map(p => ({ t0: p.t0, t1: p.t1 })) : [],
    rr: Array.isArray(m.rr) ? m.rr.filter(p => Array.isArray(p) && num(p[0]) != null && num(p[1]) != null).slice(0, 200000).map(p => [p[0], p[1]]) : null,
    source: str(m.source, 120), notes: str(m.notes, 200),
    trainType: own(TRAIN_TYPES, m.trainType), recovery: m.recovery === 'passive' ? 'passive' : m.recovery === 'active' ? 'active' : '', recMark: num(m.recMark)
  };
}
const HNUM = ['start', 'dur', 'hr', 'rmssd', 'ln', 'sdnn', 'pnn50', 'lfhf', 'hfPct', 'br', 'brShare', 'qtc', 'peak', 'hrr60', 'ect', 'beats', 'peak20', 'rampMax', 'lthr'];
function cleanHistory(x) {
  if (!x || typeof x !== 'object' || num(x.start) == null) return null;
  const o = { id: str(x.id, 80), ctx: own(CTX, x.ctx), pos: own(POS, x.pos), src: x.src === 'h10' ? 'h10' : 'ecg', notes: str(x.notes, 200),
    trainType: own(TRAIN_TYPES, x.trainType), recovery: x.recovery === 'passive' ? 'passive' : 'active', rampPlateau: x.rampPlateau === true, lthrValid: x.lthrValid === true };
  if (!o.id) return null;
  for (const k of HNUM) o[k] = num(x[k]);
  return o;
}
function cleanProfile(p) {
  if (!p || typeof p !== 'object') return {};
  const dob = typeof p.dob === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.dob) ? p.dob : '';
  return { dob, sex: p.sex === 'M' || p.sex === 'F' ? p.sex : '', name: str(p.name, 60) };
}
async function persistStorage() { try { if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch (e) {} }

/* ---------- settings / profile ---------- */
function getSettings() { try { return JSON.parse(localStorage.getItem('h10ecg.settings') || '{}'); } catch (e) { return {}; } }
function putSettings(s) { try { localStorage.setItem('h10ecg.settings', JSON.stringify(s)); } catch (e) {} }
function patchSettings(p) { putSettings(Object.assign(getSettings(), p)); }

function buildChips(el, defs, val, onPick) {
  el.innerHTML = '';
  for (const [k, label, sub] of defs) {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.v = k;
    b.setAttribute('aria-checked', k === val ? 'true' : 'false');
    b.innerHTML = esc(label) + (sub ? `<small>${esc(sub)}</small>` : '');
    b.onclick = () => { const on = b.getAttribute('aria-checked') === 'true'; for (const x of el.children) x.setAttribute('aria-checked', 'false'); if (!on) b.setAttribute('aria-checked', 'true'); onPick(on ? '' : k); };
    el.appendChild(b);
  }
}
const chipVal = el => { const b = el.querySelector('[aria-checked="true"]'); return b ? b.dataset.v : ''; };
const CTX_CHIPS = Object.entries(CTX).map(([k, v]) => [k, v.short, v.sub]);
const POS_CHIPS = Object.entries(POS).map(([k, v]) => [k, v.short]);

const TT_CHIPS = [['session', 'Session', 'steady or mixed'], ['intervals', 'Intervals', 'repeated hard efforts'], ['tempo', 'Tempo', 'sustained, comfortably hard'], ['ramp', 'Max HR ramp test', '3-min steps to failure'], ['lthr', 'LTHR test', '30-min time trial']];
const REC_CHIPS = [['active', 'Active', 'keep moving'], ['passive', 'Passive', 'stand or sit still']];
const TT_HINTS = { session: 'When you finish, tap Start recovery and keep recording for at least 2 minutes.',
  intervals: 'Each hard effort is detected automatically, with your recovery between efforts. After the last one, tap Start recovery and keep recording for 2 minutes.',
  tempo: 'Warm up, then hold a steady, comfortably hard effort for at least 10 minutes. The report shows how steady you held it and how much your heart rate drifted. Tap Start recovery when you finish.',
  ramp: 'Start easy. The app beeps and vibrates every 3 minutes: increase the load each time, until you cannot continue. Tap Start recovery the moment you stop.',
  lthr: 'Warm up first, without recording. Press Start at the moment you begin the 30-minute effort, and go as hard as you can sustain. The app tells you when 30 minutes are up; tap Start recovery then and keep recording for 2 minutes.' };
function stickyChips(el, defs, get, set) { buildChips(el, defs, get(), v => { if (v) set(v); else buildChips(el, defs, get(), x => x && set(x)); stickyChips(el, defs, get, set); }); }
function showTrainOpts() { $('#trainOpts').hidden = S.ctx !== 'training'; $('#ttHint').textContent = TT_HINTS[S.ttSel] || ''; }
function initHomeSetup() {
  const st = getSettings();
  S.ctx = st.lastCtx || ''; S.pos = st.lastPos || '';
  buildChips($('#ctxChips'), CTX_CHIPS, S.ctx, v => { S.ctx = v; patchSettings({ lastCtx: v }); showTrainOpts(); });
  S.ttSel = TRAIN_TYPES[st.lastTT] ? st.lastTT : 'session'; S.recSel = st.lastRec === 'passive' ? 'passive' : 'active';
  stickyChips($('#ttChips'), TT_CHIPS, () => S.ttSel, v => { S.ttSel = v; patchSettings({ lastTT: v }); showTrainOpts(); });
  stickyChips($('#recChips'), REC_CHIPS, () => S.recSel, v => { S.recSel = v; patchSettings({ lastRec: v }); });
  showTrainOpts();
  buildChips($('#posChips'), POS_CHIPS, S.pos, v => { S.pos = v; patchSettings({ lastPos: v }); });
  $('#autoOn').checked = !!st.autoOn; S.autoMinSel = AUTO_STEPS.includes(+st.autoMin) ? +st.autoMin : 5; updateAuto();
}
const AUTO_STEPS = [1, 2, 2.5]; for (let m = 5; m <= 480; m += 5) AUTO_STEPS.push(m);
const minTxt = m => (m === 1 ? '1 minute' : m + ' minutes');
function updateAuto() {
  const on = $('#autoOn').checked; $('#autoStepper').classList.toggle('off', !on);
  $('#autoVal').textContent = S.autoMinSel + ' min';
  $('#autoHint').textContent = on ? `The recording stops automatically after ${minTxt(S.autoMinSel)} of recorded time. Paused time is not counted.` : 'Off: the recording continues until you stop it (maximum 8 hours).';
  patchSettings({ autoOn: on, autoMin: S.autoMinSel });
}
$('#autoOn').onchange = updateAuto;
const stepAuto = d => { const i = AUTO_STEPS.indexOf(S.autoMinSel); S.autoMinSel = AUTO_STEPS[Math.max(0, Math.min(AUTO_STEPS.length - 1, (i < 0 ? 3 : i) + d))]; updateAuto(); };
$('#autoMinus').onclick = () => stepAuto(-1);
$('#autoPlus').onclick = () => stepAuto(1);
const bindCount = (inp, out) => { const u = () => { $(out).textContent = $(inp).value.length + ' / 200'; }; $(inp).addEventListener('input', u); return u; };
const upNotes = bindCount('#notesIn', '#notesCount'), upNotes2 = bindCount('#notesIn2', '#notesCount2');

function openSettings(firstRun) {
  const s = getSettings();
  $('#setupIntro').hidden = !firstRun; $('#btnSetupLater').hidden = !firstRun; $('#btnCloseSettings').hidden = !!firstRun;
  $('#historyCard').hidden = !!firstRun; $('#aboutCard').hidden = !!firstRun;
  $('#setDob').value = s.dob || ''; $('#setName').value = s.name || '';
  for (const b of $('#setSex').children) b.setAttribute('aria-checked', b.dataset.v === s.sex ? 'true' : 'false');
  refreshHistCount();
  show('scrSettings');
}
for (const b of $('#setSex').children) b.onclick = () => { for (const x of $('#setSex').children) x.setAttribute('aria-checked', 'false'); b.setAttribute('aria-checked', 'true'); };
$('#btnSaveSettings').onclick = () => {
  const dob = $('#setDob').value, sex = chipVal($('#setSex'));
  if (dob && (Date.parse(dob) > Date.now() || ageAt(dob, Date.now()) > 110)) { toast('Check the date of birth.'); return; }
  patchSettings({ dob, sex, name: $('#setName').value.trim(), setupDone: true });
  toast('Profile saved.'); profileNote(); show('scrHome');
};
$('#btnCloseSettings').onclick = () => show('scrHome');
$('#btnSetupLater').onclick = () => { patchSettings({ setupDone: true }); profileNote(); show('scrHome'); };
$('#btnFixProfile').onclick = () => openSettings(false);
$('#btnSettings').onclick = () => { if (!S.recording) openSettings(false); };
function profileNote() { const s = getSettings(); $('#profileNote').hidden = !!(s.dob && s.sex); }

/* ---------- IndexedDB ---------- */
let dbP = null;
function db() {
  if (!dbP) dbP = new Promise((res, rej) => {
    let rq; try { rq = indexedDB.open('h10ecg', 2); } catch (e) { return rej(e); }
    rq.onupgradeneeded = () => {
      const d = rq.result;
      if (!d.objectStoreNames.contains('sessions')) d.createObjectStore('sessions', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('chunks')) d.createObjectStore('chunks');
      if (!d.objectStoreNames.contains('history')) d.createObjectStore('history', { keyPath: 'id' });
    };
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
  return dbP;
}
async function idb(store, mode, fn) {
  try {
    const d = await db();
    return await new Promise((res, rej) => { const tx = d.transaction(store, mode); const st = tx.objectStore(store); const r = fn(st); tx.oncomplete = () => res(r && r.result !== undefined ? r.result : r); tx.onerror = () => rej(tx.error); });
  } catch (e) { return null; }
}
const putSession = m => idb('sessions', 'readwrite', s => s.put(m));
const getSessions = () => idb('sessions', 'readonly', s => s.getAll());
const getSession = id => idb('sessions', 'readonly', s => s.get(id));
const putChunk = (id, i, arr) => idb('chunks', 'readwrite', s => s.put(arr, id + ':' + String(i).padStart(4, '0')));
const getHistory = async () => (await idb('history', 'readonly', s => s.getAll())) || [];
const putHistory = e => idb('history', 'readwrite', s => s.put(e));
async function loadRange(prefix, Type) {
  const d = await db().catch(() => null); if (!d) return null;
  return new Promise(res => {
    const out = []; const tx = d.transaction('chunks', 'readonly');
    const rq = tx.objectStore('chunks').openCursor(IDBKeyRange.bound(prefix, prefix + '￿'));
    rq.onsuccess = () => { const c = rq.result; if (c) { out.push(c.value); c.continue(); } };
    tx.oncomplete = () => { let n = 0; for (const a of out) n += a.length; const all = new Type(n); let o = 0; for (const a of out) { all.set(a, o); o += a.length; } res(all); };
    tx.onerror = () => res(null);
  });
}
const loadChunks = id => loadRange(id + ':', Int32Array);
const putAccChunk = (id, i, arr) => idb('chunks', 'readwrite', s => s.put(arr, 'A:' + id + ':' + String(i).padStart(5, '0')));
async function loadAccFor(s) {
  if (!s || !s.accFs) return null;
  const data = await loadRange('A:' + s.id + ':', Int16Array);
  return data && data.length >= 3 * 30 * s.accFs ? { fs: s.accFs, t0: s.accT0 || 0, data } : null;
}
async function deleteSession(id) {
  await idb('sessions', 'readwrite', s => s.delete(id));
  await idb('chunks', 'readwrite', s => s.delete(IDBKeyRange.bound(id + ':', id + ':￿')));
  await idb('chunks', 'readwrite', s => s.delete(IDBKeyRange.bound('A:' + id + ':', 'A:' + id + ':￿')));
}

/* ---------- history export / import ---------- */
async function refreshHistCount() {
  const h = await getHistory(), last = getSettings().lastBackup;
  $('#histCount').textContent = h.length ? `${h.length} reading${h.length === 1 ? '' : 's'} stored on this device. ${last ? 'Last backup: ' + agoText(last) + '.' : 'Not backed up yet.'}` : 'No readings yet.';
  backupNote(h);
}
/* backup reminder: history lives only in this browser, so nudge the user to export it now and then */
const DAY = 864e5, BACKUP_EVERY = 30 * DAY, SNOOZE = 7 * DAY;
function agoText(t) { const d = Math.floor((Date.now() - t) / DAY); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; }
function backupDue(h, s, now = Date.now()) {
  if (!h.length || (s.backupSnooze && now < s.backupSnooze)) return false;
  const last = num(s.lastBackup) || 0, fresh = h.filter(x => (num(x.start) || 0) > last);
  if (!fresh.length) return false;                                   // nothing new since the last backup
  if (!last) return h.length >= 5 || now - Math.min(...h.map(x => num(x.start) || now)) > 7 * DAY;
  return now - last > BACKUP_EVERY;
}
async function backupNote(h) {
  h = h || await getHistory(); donateNote(h); const s = getSettings(), b = $('#backupBanner');
  if (!backupDue(h, s)) { b.hidden = true; return; }
  const n = h.filter(x => (num(x.start) || 0) > (num(s.lastBackup) || 0)).length;
  $('#backupText').textContent = (s.lastBackup ? `Last backup ${agoText(s.lastBackup)}. ` : 'Your history has never been backed up. ')
    + `${n} reading${n === 1 ? '' : 's'} exist only in this browser; clearing Chrome's data or changing phones would lose them.`;
  b.hidden = false;
}
/* gentle donation request: at 20, 50 and 100 readings, never during a recording, never again after Ko-fi is tapped */
const DONATE_AT = [20, 50, 100];
function donateNote(h) {
  const c = $('#donateCard'); if (!c) return;
  const s = getSettings(), n = h.length, m = DONATE_AT.filter(x => n >= x).pop() || 0;
  c.hidden = s.donateDone || !m || (num(s.donateSeen) || 0) >= m;
  if (!c.hidden) { $('#donateN').textContent = n; c.dataset.m = m; }
}
if ($('#donateCard')) {
  $('#btnDonate').onclick = () => { patchSettings({ donateDone: true }); $('#donateCard').hidden = true; };
  $('#btnDonateLater').onclick = () => { patchSettings({ donateSeen: +$('#donateCard').dataset.m }); $('#donateCard').hidden = true; };
}
$('#btnBackupNow').onclick = () => $('#btnExportHist').click();
$('#btnBackupLater').onclick = () => { patchSettings({ backupSnooze: Date.now() + SNOOZE }); $('#backupBanner').hidden = true; };
$('#btnExportHist').onclick = async () => {
  const h = await getHistory(); if (!h.length) { toast('There is no history to export yet.'); return; }
  const s = getSettings(), d = new Date();
  downloadFile(`{{FILE_PREFIX}}-history-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}.json`,
    JSON.stringify({ format: 'lead-one-ecg-history', version: 1, exported: d.toISOString(), profile: { dob: s.dob, sex: s.sex, name: s.name }, history: h }, null, 1));
  if (!FRAMED) { patchSettings({ lastBackup: Date.now(), backupSnooze: 0 }); refreshHistCount(); toast('History exported. Keep the file somewhere safe, such as Google Drive.'); }
};
$('#btnImportHist').onclick = $('#btnImportSetup').onclick = () => $('#histIn').click();
/* read a JSON file robustly: files passed through chat apps or e-mail can gain a byte-order mark or surrounding whitespace */
const readJson = async f => JSON.parse((await f.text()).replace(/^\uFEFF/, '').trim());
$('#histIn').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (f) importHistoryFile(f);
};
async function importHistoryFile(f) {
  let j;
  try { if (f.size > 50 * 1024 * 1024) throw 0; j = await readJson(f); }
  catch (err) { toast(`“${f.name}” could not be read as a {{APP_NAME}} history export. If it was sent through a chat or e-mail app, save it to the phone first (Download or Save to Files) and choose the saved copy.`, 9000); return; }
  if (REC_FORMATS.includes(j && j.format)) { toast('This is a recording file, not a history export. Open it with “Open a recording file” on the home screen.', 7000); return; }
  if (!j || !HIST_FORMATS.includes(j.format) || !Array.isArray(j.history)) { toast('This file is not a {{APP_NAME}} history export. Choose the file saved with “Export history”.', 7000); return; }
  try {
    const have = new Set((await getHistory()).map(x => x.id)); let added = 0, updated = 0;
    for (const raw of j.history.slice(0, 20000)) { const x = cleanHistory(raw); if (!x) continue; have.has(x.id) ? updated++ : added++; await putHistory(x); }
    const s = getSettings(), p = cleanProfile(j.profile);
    if (!s.dob || !s.sex) patchSettings({ dob: s.dob || p.dob, sex: s.sex || p.sex, name: s.name || p.name });
    if (getSettings().dob && getSettings().sex) patchSettings({ setupDone: true });   // a restored profile completes setup
    toast(added + updated ? `Imported ${added} new reading${added === 1 ? '' : 's'}${updated ? `, updated ${updated}` : ''}.` : 'The file contained no readings to import.'); refreshHistCount(); profileNote();
    if (!$('#scrSettings').hidden) { if (!$('#setupIntro').hidden && !needsSetup()) show('scrHome'); else openSettings(needsSetup()); }   // first-run import: profile restored, go straight to recording
  } catch (err) { toast('The history could not be saved on this device: ' + (err && err.message || err), 7000); }
}
$('#btnClearHist').onclick = async function () {
  if (!this.dataset.arm) { this.dataset.arm = 1; this.textContent = 'Tap again to delete'; setTimeout(() => { delete this.dataset.arm; this.textContent = 'Delete history'; }, 3500); return; }
  await idb('history', 'readwrite', s => s.clear()); delete this.dataset.arm; this.textContent = 'Delete history'; toast('History deleted.'); refreshHistCount();
};

/* ---------- Bluetooth ---------- */
function btProblem() {
  const ua = navigator.userAgent, linux = /Linux/.test(ua) && !/Android/.test(ua), brave = !!navigator.brave;
  const scheme = brave ? 'brave' : 'chrome', flag = f => `<code>${scheme}://flags/#${f}</code>`;
  if (FRAMED) return '<b>Bluetooth is blocked in this preview.</b> To record, open the app from {{APP_URL}}. Sample reports and recording files still work here.';
  if (!window.isSecureContext || location.protocol !== 'https:' && location.hostname !== 'localhost')
    return `<b>This page was opened from ${esc(location.protocol === 'file:' ? 'a file on your device' : location.protocol + '//' + location.host)}.</b> Bluetooth only works on https pages. Open <code>{{APP_URL}}</code> instead.`;
  if ('bluetooth' in navigator) return '';
  if (brave) return `<b>Brave has Bluetooth for websites switched off.</b> Open ${flag('brave-web-bluetooth-api')}, set it to Enabled${linux ? `, also enable ${flag('enable-experimental-web-platform-features')}` : ''}, then relaunch Brave.`;
  if (linux) return `<b>Chromium on Linux keeps Bluetooth for websites behind a setting.</b> Open ${flag('enable-experimental-web-platform-features')}, set it to Enabled, then relaunch. If you installed Chromium as a snap, also run <code>sudo snap connect chromium:bluez</code> once.`;
  if (/Firefox|SamsungBrowser/.test(ua) || /iPhone|iPad|Macintosh/.test(ua) && !/Chrome/.test(ua)) return '<b>This browser can’t use Bluetooth from websites.</b> On a phone, use Google Chrome on Android; on a computer, use Chrome or Edge.';
  return `<b>Bluetooth for websites is switched off in this browser.</b> Try enabling ${flag('enable-experimental-web-platform-features')}, then relaunch.`;
}
function envCheck() { const note = $('#envNote'), msg = btProblem(); note.innerHTML = msg; note.hidden = !msg; return !msg || FRAMED; }
function setDev(state, name, meta) {
  const dot = $('#devDot'); dot.className = 'dot' + (state === 'on' ? ' on' : state === 'busy' ? ' busy' : '');
  if (name) $('#devName').textContent = name; if (meta !== undefined) $('#devMeta').textContent = meta;
  $('#btnStart').disabled = !(state === 'on');
  $('#btnConnect').textContent = state === 'on' ? 'Disconnect' : 'Connect H10';
  $('#btnConnect').disabled = state === 'busy';
}
function devMetaText() { const p = []; if (S.battery != null) p.push('Battery ' + S.battery + '%'); if (S.fw) p.push('Firmware ' + S.fw); return p.length ? p.join(' · ') : 'Connected'; }
async function connectFlow() {
  if (!acked()) { show('scrAck'); return; }
  if (S.connected && S.device) { try { S.device.gatt.disconnect(); } catch (e) {} return; }
  if (!('bluetooth' in navigator)) { envCheck(); $('#envNote').scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('Bluetooth isn’t available to this page. See the note for how to fix it.', 6000); return; }
  try {
    setDev('busy', 'Searching for Polar H10…', 'Select your strap in the list that appears.');
    S.device = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'Polar H10' }, { namePrefix: 'Polar H9' }], optionalServices: [PMD_SERVICE, 'heart_rate', 'battery_service', 'device_information'] });
    S.device.addEventListener('gattserverdisconnected', onDisconnected);
    await gattSetup();
    setDev('on', S.device.name || 'Polar H10', devMetaText());
  } catch (e) {
    S.connected = false;
    const msg = e && e.name === 'NotFoundError' ? 'No strap was selected.' : e && e.name === 'SecurityError' ? 'Bluetooth is blocked here. Open the app from its own web address in Chrome.' : 'Connection failed: ' + (e && e.message ? e.message : e);
    setDev('off', 'Polar H10 not connected', msg);
  }
}
function onHR(ev) {
  const v = ev.target.value, f = v.getUint8(0); let o = 1;
  S.hr = f & 1 ? v.getUint16(1, true) : v.getUint8(1); o += f & 1 ? 2 : 1; if (f & 8) o += 2;
  if (!(f & 16) || !S.recording || S.paused) return;
  const rrs = []; for (; o + 1 < v.byteLength; o += 2) rrs.push(v.getUint16(o, true) / 1024 * 1000);
  let tEnd = S.total / FS; const out = [];
  for (let i = rrs.length - 1; i >= 0; i--) { out.unshift([+tEnd.toFixed(3), +rrs[i].toFixed(1)]); tEnd -= rrs[i] / 1000; }
  S.rr.push(...out);
}
async function gattSetup() {
  const server = await S.device.gatt.connect();
  const svc = await server.getPrimaryService(PMD_SERVICE);
  S.cp = await svc.getCharacteristic(PMD_CP); S.data = await svc.getCharacteristic(PMD_DATA);
  S.cp.addEventListener('characteristicvaluechanged', onCP); await S.cp.startNotifications();
  S.data.addEventListener('characteristicvaluechanged', onData); await S.data.startNotifications();
  S.connected = true;
  try { const b = await server.getPrimaryService('battery_service'); const c = await b.getCharacteristic('battery_level'); S.battery = (await c.readValue()).getUint8(0); } catch (e) {}
  try { const d = await server.getPrimaryService('device_information'); const c = await d.getCharacteristic('firmware_revision_string'); S.fw = new TextDecoder().decode(await c.readValue()).replace(/\0/g, '').trim(); } catch (e) {}
  try { const h = await server.getPrimaryService('heart_rate'); S.hrc = await h.getCharacteristic('heart_rate_measurement'); S.hrc.addEventListener('characteristicvaluechanged', onHR); await S.hrc.startNotifications(); } catch (e) {}
}
function onCP(ev) { const v = ev.target.value; if (v.getUint8(0) === 0xF0 && S.cpWaiter) { const w = S.cpWaiter; S.cpWaiter = null; w({ op: v.getUint8(1), err: v.byteLength > 3 ? v.getUint8(3) : 0 }); } }
function cpWrite(bytes, ms = 5000) {
  return new Promise(async (res, rej) => {
    const to = setTimeout(() => { S.cpWaiter = null; res({ err: -1 }); }, ms);
    S.cpWaiter = r => { clearTimeout(to); res(r); };
    try { await (S.cp.writeValueWithResponse ? S.cp.writeValueWithResponse(bytes) : S.cp.writeValue(bytes)); } catch (e) { clearTimeout(to); S.cpWaiter = null; rej(e); }
  });
}
async function startEcg() {
  let r = await cpWrite(ECG_START);
  if (r.err !== 0) { try { await cpWrite(ECG_STOP); } catch (e) {} await sleep(300); r = await cpWrite(ECG_START); }
  if (r.err !== 0 && r.err !== -1) throw new Error('the strap declined to start ECG (code ' + r.err + '). Close other apps connected to the strap and try again.');
}
async function onDisconnected() {
  S.connected = false; S.cp = S.data = S.hrc = null;
  if (S.recording && !S.stopping) {
    $('#recConn').textContent = 'Connection lost · reconnecting…'; $('#recConn').classList.add('bad');
    S.needGapFill = true; S.rr.push([S.total / FS, -1]);
    while (S.recording && !S.connected) {
      try { await gattSetup(); S.prevTs = null; await startEcg(); if (S.acc.hz) await startAcc(); $('#recConn').textContent = 'Reconnected'; $('#recConn').classList.remove('bad'); }
      catch (e) { S.connected = false; await sleep(3000); }
    }
  } else setDev('off', 'Polar H10 disconnected', 'Tap Connect to reconnect.');
}

/* ---------- incoming ECG ---------- */
function pushSample(v) {
  if (!S.cur) { S.cur = new Int32Array(CHUNK); S.curLen = 0; }
  S.cur[S.curLen++] = v; S.total++;
  if (S.curLen === CHUNK) { const full = S.cur, idx = S.chunks.length; S.chunks.push(full); S.cur = null; putChunk(S.sessionId, idx, full); putSession(sessionMeta('recording')); }
}
function pushGap(count) { count = Math.max(0, Math.min(count, MAX_SAMPLES - S.total)); for (let i = 0; i < count; i++) pushSample(GAP); S.gapSamples += count; }
/* ---------- accelerometer (breathing from chest movement) ---------- */
async function startAcc() {
  const A = S.acc, rates = A.hz ? [A.hz] : ACC_RATES;
  for (const hz of rates) {
    let r; try { r = await cpWrite(accStartCmd(hz)); } catch (e) { r = { err: -2 }; }
    if (r.err === 0 || r.err === -1) {
      if (!A.hz) { A.hz = hz; A.dec = Math.max(1, Math.round(hz / 10)); A.fs = hz / A.dec; A.t0 = S.total / FS; }
      A.on = true; return true;
    }
  }
  A.on = false; return false;
}
function accPush(x, y, z) {
  const A = S.acc;
  if (!A.cur) { A.cur = new Int16Array(3 * ACC_CHUNK); A.curLen = 0; }
  A.cur[3 * A.curLen] = x; A.cur[3 * A.curLen + 1] = y; A.cur[3 * A.curLen + 2] = z; A.curLen++; A.total++;
  if (x !== ACC_GAP) { const p = A.ringPos; A.ring[3 * p] = x; A.ring[3 * p + 1] = y; A.ring[3 * p + 2] = z; A.ringPos = (p + 1) % 600; A.ringN = Math.min(600, A.ringN + 1); }
  if (A.curLen === ACC_CHUNK) { const full = A.cur, idx = A.chunks.length; A.chunks.push(full); A.cur = null; putAccChunk(S.sessionId, idx, full); }
}
function onAcc(v) {
  const A = S.acc; if (!A.fs) return;
  // keep the motion stream aligned with the ECG timeline (pauses, drop-outs, clock drift)
  const expected = Math.floor((S.total / FS - A.t0) * A.fs), behind = expected - A.total;
  if (behind > A.fs) { for (let i = 0; i < behind; i++) accPush(ACC_GAP, ACC_GAP, ACC_GAP); A.k = 0; A.sum = [0, 0, 0]; }
  if (A.total - expected > A.fs) return;
  for (const s of pmdSamples(v, 3, 2)) {
    A.sum[0] += s[0]; A.sum[1] += s[1]; A.sum[2] += s[2];
    if (++A.k >= A.dec) {
      const q = c => Math.max(-32767, Math.min(32767, Math.round(A.sum[c] / A.dec)));
      if (S.paused) accPush(ACC_GAP, ACC_GAP, ACC_GAP); else accPush(q(0), q(1), q(2));
      A.k = 0; A.sum = [0, 0, 0];
    }
  }
}
function liveBreathing() {
  const A = S.acc; if (!A.fs || A.ringN < 30 * A.fs) return null;
  const n = Math.floor(Math.min(A.ringN, 45 * A.fs)), d = new Int16Array(3 * n);
  for (let i = 0; i < n; i++) { const p = (A.ringPos - n + i + 600) % 600; d[3 * i] = A.ring[3 * p]; d[3 * i + 1] = A.ring[3 * p + 1]; d[3 * i + 2] = A.ring[3 * p + 2]; }
  const b = accBreathing({ fs: A.fs, data: d, t0: 0 }, 0.05, Math.min(30, n / A.fs));
  return b ? b.median : null;
}
function onData(ev) {
  if (!S.recording) return;
  const v = ev.target.value;
  if (v.getUint8(0) === 0x02) { onAcc(v); return; }
  if (v.getUint8(0) !== 0x00) return;
  const ts = v.getBigUint64(1, true), now = Date.now(), count = Math.floor((v.byteLength - 10) / 3);
  if (S.needGapFill && S.lastWall) { pushGap(Math.round((now - S.lastWall) / 1000 * FS) - count); S.needGapFill = false; }
  else if (S.prevTs !== null) { const exp = Number(ts - S.prevTs) / 1e9 * FS; if (exp > count + 0.5 * FS && exp < 3600 * FS) pushGap(Math.round(exp - count)); }
  S.prevTs = ts; S.lastWall = now; S.lastEcg = now; if (S.kicks) { S.kicks = 0; $('#recConn').textContent = 'Connected'; $('#recConn').classList.remove('bad'); }
  for (let i = 0; i < count; i++) {
    const o = 10 + i * 3; let s = v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getUint8(o + 2) << 16); if (s & 0x800000) s -= 0x1000000;
    if (S.paused) { pushSample(GAP); S.pausedSamples++; } else pushSample(s);
    const f = S.liveLP(S.liveHP(s)); S.live[S.livePos] = f; S.livePos = (S.livePos + 1) % S.live.length;
  }
  if (S.total >= MAX_SAMPLES) stopRecording('limit');
  else if (S.autoMin && (S.total - S.pausedSamples - S.gapSamples) >= S.autoMin * 60 * FS) stopRecording('auto');
}
function sessionMeta(status) {
  return { id: S.sessionId, start: S.startMs, status, samples: S.total, gap: S.gapSamples, paused: S.pausedSamples, pauses: S.pauses, rr: S.rr,
    ctx: S.ctx, pos: S.pos, notes: S.notes || '', trainType: S.trainType || '', recovery: S.recovery || '', recMark: S.recMark, device: S.devName, fw: S.fw, battery: S.battery, accFs: S.acc.fs || 0, accT0: S.acc.t0 || 0 };
}

/* ---------- start / pause / stop ---------- */
let wakeLock = null;
async function keepAwake() { try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.recording) keepAwake(); });

async function startRecording() {
  if (!S.connected) { toast('Connect the H10 first.'); return; }
  Object.assign(S, { chunks: [], cur: null, curLen: 0, total: 0, gapSamples: 0, pausedSamples: 0, pauses: [], rr: [], prevTs: null, lastWall: 0, needGapFill: false, hr: null, stopping: false, paused: false });
  S.autoMin = $('#autoOn').checked ? S.autoMinSel : 0;
  S.notes = str($('#notesIn').value.trim(), 200);
  S.trainType = S.ctx === 'training' ? S.ttSel : ''; S.recovery = S.ctx === 'training' ? S.recSel : ''; S.recMark = null; S.lastStep = 1; S.lthrCued = false;
  try { S.audio = S.audio || new (window.AudioContext || window.webkitAudioContext)(); S.audio.resume && S.audio.resume(); } catch (e) { S.audio = null; }
  S.live.fill(0); S.livePos = 0; S.liveHP = makeStreamFilter(design('hp', 0.5)); S.liveLP = makeStreamFilter(design('lp', 35));
  S.sessionId = 'rec-' + Date.now(); S.startMs = Date.now(); S.devName = S.device && S.device.name || 'Polar H10';
  S.recording = true;
  Object.assign(S.acc, { on: false, hz: 0, dec: 1, fs: 0, t0: 0, chunks: [], cur: null, curLen: 0, total: 0, sum: [0, 0, 0], k: 0, ringPos: 0, ringN: 0, liveBr: null, lastBrCalc: 0 });
  S.lastEcg = Date.now(); S.kicks = 0; S.kicking = false;
  try { await cpWrite(ECG_STOP, 1500); await cpWrite(ACC_STOP, 1500); await sleep(200); } catch (e) {}   // clear streams left running by an earlier session
  try { await startEcg(); } catch (e) { S.recording = false; toast('Could not start: ' + e.message); return; }
  if (!(await startAcc())) toast('The motion sensor could not be started; breathing will be estimated from the ECG.', 5000);
  putSession(sessionMeta('recording')); keepAwake(); persistStorage();
  $('#notesIn').value = ''; upNotes();
  $('#recBatt').textContent = S.battery != null ? S.battery + '%' : '--';
  $('#recCtx').textContent = [S.ctx && CTX[S.ctx].label, S.pos && POS[S.pos].label].filter(Boolean).join(' · ') || 'No context selected';
  $('#btnRecov').hidden = S.ctx !== 'training'; $('#btnRecov').disabled = false; $('#btnRecov').textContent = 'Start recovery';
  $('#stepPanel').hidden = !(S.trainType === 'ramp' || S.trainType === 'lthr'); $('#stepPanel').classList.remove('go');
  if (S.trainType) $('#recCtx').textContent += ' · ' + TRAIN_TYPES[S.trainType] + ' · ' + (S.recovery === 'passive' ? 'passive' : 'active') + ' recovery';
  setPausedUI(false); show('scrRec'); tickRec(); requestAnimationFrame(drawLive);
}
function setPausedUI(p) {
  $('#btnPause').textContent = p ? 'Resume' : 'Pause';
  $('#liveChip').classList.toggle('paused', p); $('#liveTxt').textContent = p ? 'Paused' : 'Recording';
}
$('#btnPause').onclick = () => {
  if (!S.recording) return;
  const t = S.total / FS;
  if (!S.paused) { S.paused = true; S.pauses.push({ t0: t, t1: null }); S.rr.push([t, -1]); }
  else { S.paused = false; const p = S.pauses[S.pauses.length - 1]; if (p) p.t1 = t; S.rr.push([t, -1]); }
  setPausedUI(S.paused); putSession(sessionMeta('recording'));
};
async function stopRecording(why) {
  if (!S.recording || S.stopping) return;
  S.stopping = true;
  if (S.paused) { const p = S.pauses[S.pauses.length - 1]; if (p) p.t1 = S.total / FS; S.paused = false; }
  try { if (S.connected) await cpWrite(ECG_STOP); } catch (e) {}
  try { if (S.connected && S.acc.on) await cpWrite(ACC_STOP); } catch (e) {}
  S.recording = false;
  if (S.cur && S.curLen) { const tail = S.cur.slice(0, S.curLen); putChunk(S.sessionId, S.chunks.length, tail); S.chunks.push(tail); S.cur = null; }
  const AC = S.acc;
  if (AC.cur && AC.curLen) { const tail = AC.cur.slice(0, 3 * AC.curLen); putAccChunk(S.sessionId, AC.chunks.length, tail); AC.chunks.push(tail); AC.cur = null; }
  let accData = null;
  if (AC.fs && AC.total) { accData = new Int16Array(3 * AC.total); let q = 0; for (const c of AC.chunks) { accData.set(c, q); q += c.length; } }
  await putSession(sessionMeta('complete'));
  try { wakeLock && wakeLock.release(); } catch (e) {} wakeLock = null;
  $('#dim').hidden = true;
  const raw = new Int32Array(S.total); let o = 0; for (const c of S.chunks) { raw.set(c, o); o += c.length; }
  S.raw = raw; S.meta = sessionMeta('complete'); S.analysis = null;
  S.meta._acc = accData && accData.length >= 3 * 30 * AC.fs ? { fs: AC.fs, t0: AC.t0, data: accData } : null;
  $('#doneWhy').textContent = why === 'limit' ? 'Stopped automatically at the 8-hour limit.' : why === 'auto' ? `Stopped automatically after ${minTxt(S.autoMin)}.` : 'Stopped manually.';
  $('#doneDur').textContent = hms((S.total - S.pausedSamples - S.gapSamples) / FS);
  $('#doneStart').textContent = new Date(S.startMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  $('#doneGap').textContent = (S.pausedSamples || S.gapSamples) ? durText(S.pausedSamples / FS) + ' / ' + durText(S.gapSamples / FS) : 'None';
  show('scrDone'); refreshPast();
  setDev(S.connected ? 'on' : 'off', S.connected ? (S.device.name || 'Polar H10') : 'Polar H10 disconnected', S.connected ? devMetaText() : 'Tap Connect to reconnect.');
}

/* ---------- recording screen ---------- */
let lastBattRead = 0;
/* training cues: ramp steps every 3 minutes, LTHR 30-minute mark */
/* training cues: square waves at 2–3 kHz (where phone speakers and hearing are most sensitive), pushed through a
   limiter to just below distortion, so they cut through traffic noise at full media volume */
let cueOut = null;
function cueBus(a) {
  if (cueOut && cueOut.context === a) return cueOut;
  const comp = a.createDynamicsCompressor(); comp.threshold.value = -18; comp.knee.value = 0; comp.ratio.value = 20; comp.attack.value = 0.001; comp.release.value = 0.05;
  const g = a.createGain(); g.gain.value = 1.75; comp.connect(g); g.connect(a.destination); cueOut = comp; return comp;
}
function beep(freq = 2400, ms = 220, at = 0) { try { const a = S.audio; if (!a) return; if (a.state === 'suspended') a.resume(); const o = a.createOscillator(), g = a.createGain(); o.type = 'square'; o.frequency.value = freq; o.connect(g); g.connect(cueBus(a)); const t = a.currentTime + at; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.008); g.gain.setValueAtTime(0.9, t + ms / 1000 - 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000); o.start(t); o.stop(t + ms / 1000 + 0.02); } catch (e) {} }
function cue(strong) { try { navigator.vibrate && navigator.vibrate(strong ? [400, 120, 400, 120, 400] : [200, 100, 200]); } catch (e) {} if (strong) { beep(2400, 220, 0); beep(2400, 220, 0.3); beep(3000, 450, 0.6); } else { beep(2000, 160, 0); beep(2000, 160, 0.25); } }
function tickTraining() {
  if (!S.trainType || $('#stepPanel').hidden) return;
  const el = S.total / FS, P = $('#stepPanel');
  if (S.recMark != null) { $('#spLabel').textContent = 'Recovery'; $('#spStep').textContent = ms2(el - S.recMark); $('#spCount').textContent = ms2(Math.max(0, 120 - (el - S.recMark))); $('#spMsg').textContent = (el - S.recMark) < 120 ? 'keep recording' : 'you can stop now'; P.classList.remove('go'); return; }
  if (S.trainType === 'ramp') {
    const step = Math.floor(el / 180) + 1, left = 180 - (el % 180);
    if (step > S.lastStep) { S.lastStep = step; cue(true); S.goUntil = Date.now() + 5000; }
    if (left <= 10.5 && left > 9.9 && S.warned !== step) { S.warned = step; cue(false); }
    const go = Date.now() < (S.goUntil || 0); P.classList.toggle('go', go);
    $('#spLabel').textContent = 'Step'; $('#spStep').textContent = step; $('#spCount').textContent = go ? 'GO' : ms2(left); $('#spMsg').textContent = go ? 'increase the load now' : 'until the next step';
  } else {
    const done = el >= 1800; if (done && !S.lthrCued) { S.lthrCued = true; cue(true); }
    P.classList.toggle('go', done); $('#spLabel').textContent = 'Time trial'; $('#spStep').textContent = ms2(Math.min(el, 1800));
    $('#spCount').textContent = done ? 'Done' : ms2(1800 - el); $('#spMsg').textContent = done ? 'tap Start recovery' : el < 600 ? 'last 20 min count from 10:00' : 'counting toward threshold';
  }
}
$('#btnRecov').onclick = () => {
  if (!S.recording || S.recMark != null) return;
  S.recMark = S.total / FS; $('#btnRecov').disabled = true; $('#btnRecov').textContent = 'Recovery started · ' + hms((S.total - S.pausedSamples - S.gapSamples) / FS).slice(3);
  cue(false); putSession(sessionMeta('recording'));
};
function tickRec() {
  if (!S.recording) return;
  const active = (S.total - S.pausedSamples - S.gapSamples) / FS;
  $('#recTimer').textContent = hms(active); $('#dimT').textContent = hms(active);
  $('#recRemain').textContent = S.autoMin ? `Stops automatically in ${ms2(S.autoMin * 60 - active)}` : `${hms(MAX_SAMPLES / FS - S.total / FS)} remaining before the 8-hour limit`;
  $('#recHR').innerHTML = S.hr ? S.hr + '<small>bpm</small>' : '--';
  tickTraining();
  if (Date.now() - S.acc.lastBrCalc > 5000) { S.acc.lastBrCalc = Date.now(); S.acc.liveBr = liveBreathing(); }
  $('#recBr').innerHTML = !S.acc.on ? 'n/a' : S.acc.liveBr ? S.acc.liveBr.toFixed(1) + '<small>/min</small>' : '…';
  let mn = Infinity, mx = -Infinity; const L = S.live.length;
  for (let i = 0; i < 2 * FS; i++) { const v = S.live[(S.livePos - 1 - i + L) % L]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const p2p = mx - mn, q = $('#recQual');
  if (!S.connected) { q.textContent = 'Lost'; q.className = 'q-weak'; }
  else if (S.total / FS < 3) { q.textContent = '…'; q.className = ''; }
  else if (p2p < 250) { q.textContent = 'Weak'; q.className = 'q-weak'; }
  else if (p2p > 6000) { q.textContent = 'Noisy'; q.className = 'q-weak'; }
  else { q.textContent = 'Good'; q.className = 'q-good'; }
  ecgWatchdog();
  if (Date.now() - lastBattRead > 600000 && S.connected) { lastBattRead = Date.now(); readBattery(); }
  setTimeout(tickRec, 500);
}
/* the strap sometimes accepts the start command but sends no ECG (another app holds the stream, or a stale stream);
   restart the stream automatically, and explain what to do if that does not help */
async function ecgWatchdog() {
  if (!S.recording || S.stopping || !S.connected || S.kicking || Date.now() - S.lastEcg < 6000) return;
  S.kicking = true; S.kicks++;
  $('#recConn').textContent = 'No ECG from the strap · restarting…'; $('#recConn').classList.add('bad');
  if (S.total) S.needGapFill = true;
  try { await cpWrite(ECG_STOP); if (S.acc.on) await cpWrite(ACC_STOP); await sleep(400); S.prevTs = null; await startEcg(); if (S.acc.hz) await startAcc(); } catch (e) {}
  S.lastEcg = Date.now(); S.kicking = false;
  if (S.kicks === 3) { $('#recConn').textContent = 'No ECG from the strap'; toast('The strap is connected but not sending ECG. Close any other app using it (Polar Beat, Polar Flow, ECG Logger, Elite HRV), or unclip the strap for a few seconds, reconnect and start again.', 12000); }
}
async function readBattery() { try { const b = await S.device.gatt.getPrimaryService('battery_service'); const c = await b.getCharacteristic('battery_level'); S.battery = (await c.readValue()).getUint8(0); $('#recBatt').textContent = S.battery + '%'; } catch (e) {} }
function drawLive() {
  if (!S.recording) return;
  const cv = $('#liveCanvas'), dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cs = getComputedStyle(document.documentElement);
  g.fillStyle = cs.getPropertyValue('--surface'); g.fillRect(0, 0, w, h);
  const pxs = w / 5; g.lineWidth = 1; g.strokeStyle = cs.getPropertyValue('--grid-s');
  for (let x = 0; x <= w; x += pxs / 5) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = h / 2 % (pxs / 5); y <= h; y += pxs / 5) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.strokeStyle = cs.getPropertyValue('--grid-l'); for (let x = 0; x <= w; x += pxs) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  const L = S.live.length; let mn = Infinity, mx = -Infinity; for (let i = 0; i < L; i++) { const v = S.live[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const span = Math.max(800, (mx - mn) * 1.15), mid = (mx + mn) / 2;
  g.strokeStyle = cs.getPropertyValue('--trace'); g.globalAlpha = S.paused ? 0.35 : 1; g.lineWidth = 1.8; g.lineJoin = 'round'; g.beginPath();
  for (let i = 0; i < L; i++) { const v = S.live[(S.livePos + i) % L], x = i / L * w, y = h / 2 - (v - mid) / span * h; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke(); g.globalAlpha = 1;
  requestAnimationFrame(drawLive);
}
(function () {
  const b = $('#btnStop'); let t = null;
  const start = e => { e.preventDefault(); b.classList.add('holding'); t = setTimeout(() => { b.classList.remove('holding'); stopRecording('user'); }, 1200); };
  const cancel = () => { b.classList.remove('holding'); clearTimeout(t); };
  b.addEventListener('pointerdown', start); b.addEventListener('pointerup', cancel); b.addEventListener('pointerleave', cancel); b.addEventListener('pointercancel', cancel);
  b.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) start(e); });
  b.addEventListener('keyup', cancel); b.addEventListener('contextmenu', e => e.preventDefault());
})();

/* ---------- analysis, history & report ---------- */
function historyEntry(A, meta) {
  A = ctxView(A, meta.ctx);
  return {
    id: meta.id || ('file-' + meta.start), start: meta.start, ctx: meta.ctx || '', pos: meta.pos || '', notes: meta.notes || '',
    dur: Math.round(A.dur - A.gapSec), hr: A.meanHR, rmssd: A.rmssd, ln: A.lnRmssd, sdnn: A.sdnn, pnn50: A.pnn50,
    lfhf: A.lfhf, hfPct: A.hfPct, br: A.breath ? A.breath.median : null, brShare: A.breathShare, qtc: A.qtc,
    peak: A.exercise ? A.exercise.peak20 : null, peak20: A.exercise ? A.exercise.peak20 : null, hrr60: A.exercise && A.exercise.end != null ? A.exercise.hrr60 : null,
    ect: A.ectopicBeats, beats: A.beats, src: A.hrvSource, trainType: meta.ctx === 'training' ? (meta.trainType || 'session') : '', recovery: meta.recovery || '',
    ...(meta.ctx === 'training' && meta.trainType === 'ramp' ? (r => ({ rampMax: r.max, rampPlateau: r.plateau && r.valid }))(rampTest(A, A.exercise)) : {}),
    ...(meta.ctx === 'training' && meta.trainType === 'lthr' ? (r => ({ lthr: r.lthr, lthrValid: r.valid }))(lthrTest(A, A.exercise)) : {})
  };
}
async function runReport(raw, meta) {
  show('scrAnalyze'); $('#anBar').style.width = '2%';
  try {
    const st = getSettings(), age = ageAt(st.dob, meta.start);
    const A = await analyze(raw, { age: age || 35, rr: meta.rr, acc: meta._acc, recMark: meta.recMark }, (p, step) => { $('#anBar').style.width = Math.round(p * 100) + '%'; $('#anStep').textContent = step; });
    S.analysis = A; S.meta = meta; S.raw = raw;
    if (!meta.sample && A.dur - A.gapSec >= 55) await putHistory(historyEntry(A, meta));
    await renderInto();
    show('scrReport');
  } catch (e) { console.error(e); toast(e.message || String(e), 7000); show('scrHome'); }
}
async function renderInto() {
  const st = getSettings(), meta = S.meta;
  const hist = meta.sample ? sampleHistory(S.analysis, meta) : await getHistory();
  $('#reportPages').innerHTML = renderReport(S.analysis, meta, st, hist);
  fitPages();
}
function fitPages() {
  const wrap = $('#reportPages'); if (!wrap) return;
  const avail = Math.min(wrap.clientWidth - 32, 820), base = 210 * 96 / 25.4, z = Math.min(1, avail / base);
  for (const p of wrap.querySelectorAll('.zoomer')) p.style.zoom = z;
}
window.addEventListener('resize', () => { if (document.body.dataset.screen === 'scrReport') fitPages(); });

/* edit context / position after recording */
$('#btnDetails').onclick = () => {
  const p = $('#detailsPanel'); p.hidden = !p.hidden; if (p.hidden) return;
  buildChips($('#ctxChips2'), CTX_CHIPS, S.meta.ctx || '', () => {});
  buildChips($('#posChips2'), POS_CHIPS, S.meta.pos || '', () => {});
  $('#notesIn2').value = S.meta.notes || ''; upNotes2();
  S.dTT = TRAIN_TYPES[S.meta.trainType] ? S.meta.trainType : 'session'; S.dRec = S.meta.recovery === 'passive' ? 'passive' : 'active';
  stickyChips($('#ttChips2'), TT_CHIPS, () => S.dTT, v => { S.dTT = v; }); stickyChips($('#recChips2'), REC_CHIPS, () => S.dRec, v => { S.dRec = v; });
  $('#trainOpts2').hidden = chipVal($('#ctxChips2')) !== 'training';
  $('#ctxChips2').onclick = () => setTimeout(() => { $('#trainOpts2').hidden = chipVal($('#ctxChips2')) !== 'training'; });
};
$('#btnDetailsCancel').onclick = () => { $('#detailsPanel').hidden = true; };
$('#btnDetailsSave').onclick = async () => {
  S.meta.ctx = chipVal($('#ctxChips2')); S.meta.pos = chipVal($('#posChips2')); S.meta.notes = str($('#notesIn2').value.trim(), 200);
  if (S.meta.ctx === 'training') { S.meta.trainType = S.dTT; S.meta.recovery = S.dRec; } else { S.meta.trainType = ''; S.meta.recovery = ''; }
  if (!S.meta.sample) {
    if (S.meta.id) { const s = await getSession(S.meta.id); if (s) { s.ctx = S.meta.ctx; s.pos = S.meta.pos; s.notes = S.meta.notes; s.trainType = S.meta.trainType; s.recovery = S.meta.recovery; await putSession(s); } }
    if (S.analysis.dur - S.analysis.gapSec >= 55) await putHistory(historyEntry(S.analysis, S.meta));
  }
  $('#detailsPanel').hidden = true; await renderInto(); toast('Report updated.');
};

function savePdf() {
  if (FRAMED) { toast('Saving as PDF works when the app is opened from its own web address in Chrome.', 6000); return; }
  const old = document.title, d = new Date(S.meta.start);
  document.title = 'ECG ' + d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + pad2(d.getMinutes());
  const z = [...document.querySelectorAll('.zoomer')].map(p => p.style.zoom);
  document.querySelectorAll('.zoomer').forEach(p => p.style.zoom = 1);
  setTimeout(() => { window.print(); setTimeout(() => { document.title = old; document.querySelectorAll('.zoomer').forEach((p, i) => p.style.zoom = z[i]); }, 500); }, 60);
  toast('In the print screen, choose “Save as PDF” as the printer.');
}
function b64(bytes) { let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); }
function unb64(str) { const bin = atob(str), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }
function saveRecordingFile() {
  if (!S.raw) return;
  const bytes = new Uint8Array(S.raw.buffer, S.raw.byteOffset, S.raw.byteLength); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  const m = S.meta || {}, d = new Date(m.start || Date.now());
  downloadFile('{{FILE_PREFIX}}-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + '.json',
    JSON.stringify({ format: 'lead-one-ecg', version: 3, fs: FS, id: m.id, start: m.start, ctx: m.ctx, pos: m.pos, notes: m.notes || '', device: m.device, fw: m.fw, battery: m.battery,
      gap: m.gap, paused: m.paused, pauses: m.pauses, rr: m.rr, gapMarker: GAP, samples: btoa(bin),
      trainType: m.trainType || '', recovery: m.recovery || '', recMark: m.recMark,
      accFs: m._acc ? m._acc.fs : 0, accT0: m._acc ? m._acc.t0 : 0, acc: m._acc ? b64(new Uint8Array(m._acc.data.buffer, m._acc.data.byteOffset, m._acc.data.byteLength)) : '' }));
}
async function openFile(file) {
  if (file.size > MAX_FILE) { toast('This file is too large to be an H10 recording.'); return; }
  const text = (await file.text()).replace(/^\uFEFF/, ''); let raw, meta;
  try {
    if (text.trimStart().startsWith('{')) {
      const j = JSON.parse(text);
      if (HIST_FORMATS.includes(j.format)) { importHistoryFile(file); return; }
      if (!REC_FORMATS.includes(j.format)) throw new Error('This file was not saved by {{APP_NAME}}.');
      const bin = atob(j.samples), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      if (u8.length % 4 || u8.length / 4 > MAX_SAMPLES) throw new Error('This recording file is damaged.');
      raw = new Int32Array(u8.buffer);
      meta = cleanMeta(Object.assign({}, j, { source: file.name }));
      if (typeof j.acc === 'string' && j.acc && [10, 12.5, 20, 25, 50, 100, 200].includes(j.accFs)) {
        const a8 = unb64(j.acc); if (a8.length % 6 === 0 && a8.length / 6 <= 8 * 3600 * j.accFs + 100) meta._acc = { fs: j.accFs, t0: Math.max(0, +j.accT0 || 0), data: new Int16Array(a8.buffer) };
      }
    } else {
      const lines = text.split(/\r?\n/), vals = []; let start = null;
      for (const ln of lines) {
        const parts = ln.trim().split(/[;,\t ]+/); if (!parts[0]) continue;
        const v = Number(parts[parts.length - 1]); if (!isFinite(v)) continue;
        if (start === null && parts.length > 1) { const d = Date.parse(parts[0]); if (isFinite(d)) start = d; }
        vals.push(Math.round(v));
      }
      if (vals.length < FS * 30) throw new Error('No ECG values were found in this file. Expected one value in µV per line, at 130 Hz.');
      if (vals.length > MAX_SAMPLES) vals.length = MAX_SAMPLES;
      raw = Int32Array.from(vals.map(v => Math.max(-8388608, Math.min(8388607, v)))); const st0 = start || file.lastModified - vals.length / FS * 1000;
      meta = cleanMeta({ id: 'file-' + st0, start: st0, device: 'Polar H10', source: file.name });
    }
  } catch (e) { toast(e.message || 'This file could not be read.', 6000); return; }
  runReport(raw, meta);
}

/* ---------- recordings on this device ---------- */
async function refreshPast() {
  const list = (await getSessions()) || []; list.sort((a, b) => b.start - a.start);
  const ul = $('#pastList'); ul.innerHTML = '';
  const interrupted = list.find(s => s.status === 'recording' && s.id !== (S.recording ? S.sessionId : null) && s.samples > FS * 30);
  if (interrupted) {
    $('#recoverBanner').hidden = false;
    $('#recoverText').textContent = new Date(interrupted.start).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) + ' · stopped after ' + durText(interrupted.samples / FS);
    $('#btnRecoverView').onclick = async () => { const raw = await loadChunks(interrupted.id); interrupted.status = 'complete'; interrupted.samples = raw.length; await putSession(interrupted); interrupted._acc = await loadAccFor(interrupted); refreshPast(); runReport(raw, interrupted); };
    $('#btnRecoverDiscard').onclick = async () => { await deleteSession(interrupted.id); refreshPast(); };
  } else $('#recoverBanner').hidden = true;
  backupNote();
  const done = list.filter(s => s.status === 'complete');
  if (!done.length) { ul.innerHTML = '<li class="empty">No recordings yet.</li>'; return; }
  for (const s of done.slice(0, 25)) {
    const li = document.createElement('li'), act = (s.samples - (s.paused || 0) - (s.gap || 0)) / FS;
    const tags = [s.ctx && CTX[s.ctx] && CTX[s.ctx].short, s.pos && POS[s.pos] && POS[s.pos].short].filter(Boolean).join(' · ');
    li.innerHTML = `<div class="meta"><b>${new Date(s.start).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</b><span>${durText(act)}${tags ? ' · ' + esc(tags) : ''}</span>${s.notes ? `<i>“${esc(s.notes)}”</i>` : ''}</div>`;
    const v = document.createElement('button'); v.className = 'btn'; v.textContent = 'Report';
    v.onclick = async () => { const raw = await loadChunks(s.id); if (raw && raw.length) runReport(raw, Object.assign({}, s, { _acc: await loadAccFor(s) })); else toast('The data for this recording is missing.'); };
    const d = document.createElement('button'); d.className = 'btn'; d.textContent = 'Delete';
    d.onclick = async () => { if (d.dataset.arm) { await deleteSession(s.id); refreshPast(); } else { d.dataset.arm = 1; d.textContent = 'Tap to confirm'; setTimeout(() => { delete d.dataset.arm; d.textContent = 'Delete'; }, 3000); } };
    li.append(v, d); ul.appendChild(li);
  }
}

/* ---------- wiring ---------- */
$('#btnConnect').onclick = connectFlow;
$('#btnStart').onclick = startRecording;
$('#btnDim').onclick = () => { $('#dim').hidden = false; };
$('#dim').onclick = () => { $('#dim').hidden = true; };
$('#btnView').onclick = () => runReport(S.raw, S.meta);
$('#btnNew').onclick = () => show('scrHome');
$('#btnSaveRec').onclick = saveRecordingFile;
$('#btnSaveRec2').onclick = saveRecordingFile;
$('#btnBack').onclick = () => { $('#detailsPanel').hidden = true; show('scrHome'); };
$('#btnPdf').onclick = savePdf;
$('#btnOpen').onclick = () => $('#fileIn').click();
let helpFrom = 'scrHome';
function openHelp() { const cur = document.body.dataset.screen; helpFrom = cur && cur !== 'scrHelp' ? cur : 'scrHome'; show('scrHelp'); }
$('#btnHelp').onclick = $('#btnHelp2').onclick = openHelp;

// Add to home screen: Chrome offers an install prompt once the page qualifies; otherwise explain the menu route
let installEvt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
$('#btnInstall').hidden = isStandalone();
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
addEventListener('appinstalled', () => { installEvt = null; $('#btnInstall').hidden = true; toast('Added. Open Lead One ECG from its icon on your home screen.', 7000); });
$('#btnInstall').onclick = async () => {
  if (installEvt) { const e = installEvt; installEvt = null; await e.prompt(); try { await e.userChoice; } catch {} return; }
  toast(/Android/i.test(navigator.userAgent)
    ? 'In Chrome, tap the ⋮ menu (top right), then “Add to home screen” or “Install app”. If it is already on your home screen, open it from there.'
    : 'In Chrome or Edge, use the install icon at the right of the address bar, or the ⋮ menu → “Install Lead One ECG”. If it is already installed, open it from there.', 10000);
};
$('#btnHelpBack').onclick = $('#btnHelpBack2').onclick = () => show(helpFrom);
$('#fileIn').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) openFile(f); };
for (const b of document.querySelectorAll('[data-demo]')) b.onclick = () => runSample(b.dataset.demo);
function runSample(kind) {
  const d = new Date(); d.setDate(d.getDate() - 1);
  const cfg = { rest: [5, 30, 2, 46, 'morning', 'lying', 'rest'], training: [17, 10, 0, 35, 'training', 'walking', 'intervals', 'intervals', 'passive'], tempo: [7, 0, 0, 36, 'training', 'walking', 'tempo', 'tempo', 'active'], ramp: [17, 40, 0, 31, 'training', 'walking', 'ramp', 'ramp', 'passive', 1530],
    meditation: [20, 15, 0, 10, 'meditation', 'seated', 'meditation'] }[kind];
  d.setHours(cfg[0], cfg[1], cfg[2], 0);
  const demo = makeDemo(cfg[3], 7, cfg[6]);
  runReport(demo.raw, { id: 'sample-' + kind, start: d.getTime(), ctx: cfg[4], pos: cfg[5], trainType: cfg[7] || '', recovery: cfg[8] || '', recMark: cfg[9], device: 'Polar H10', fw: '5.0.0', battery: 80, rr: demo.rr, _acc: demo.acc, sample: true });
}
window.addEventListener('beforeunload', e => { if (S.recording) { e.preventDefault(); e.returnValue = ''; } });

/* wellness-use acknowledgement: required once, and again whenever ACK_VERSION is raised (wording changed) */
const ACK_VERSION = 1;
$('#ackBox').onchange = () => { $('#btnAck').disabled = !$('#ackBox').checked; };
$('#btnAck').onclick = () => {
  if (!$('#ackBox').checked) return;
  patchSettings({ ackWellness: ACK_VERSION, ackAt: Date.now() });
  if (needsSetup()) openSettings(true); else show('scrHome');
};
$('#btnAckManual').onclick = openHelp;
const acked = () => getSettings().ackWellness === ACK_VERSION;
/* the setup screen is only needed while the profile is missing; a profile restored from a history import counts */
const needsSetup = () => { const st = getSettings(); return !st.setupDone && !(st.dob && st.sex); };
envCheck(); initHomeSetup(); refreshPast(); profileNote();
if (!acked()) show('scrAck'); else if (needsSetup()) openSettings(true); else show('scrHome');
if (location.hash === '#manual') openHelp();   // direct link to the user manual, e.g. from the studio page
if (location.hash === '#sample') runSample('rest');
else if (location.hash === '#training') runSample('training');
else if (location.hash === '#ramp') runSample('ramp');
else if (location.hash === '#tempo') runSample('tempo');
else if (location.hash === '#meditation') runSample('meditation');

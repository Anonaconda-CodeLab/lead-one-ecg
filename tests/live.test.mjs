// Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
// The recording screen's live code, run as written (taken from the built page) against a simulated phone: one clock
// for the strap's samples, performance.now(), the audio clock and timers. Covers the interval timer with the real
// Start intervals and Pause buttons and cue scheduling, what is saved with the recording, the recording timer's
// display, and the position chips.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distHtml } from './helpers.mjs';

const h = distHtml();
// a top-level function from the page, whole: a one-liner, or up to the first closing brace at the start of a line
function fn(name) {
  const i = h.indexOf(`\nfunction ${name}(`); assert.ok(i >= 0, 'in the page: ' + name);
  const eol = h.indexOf('\n', i + 1), first = h.slice(i + 1, eol);
  if (/\}\s*$/.test(first) && (first.match(/\{/g) || []).length === (first.match(/\}/g) || []).length) return first;
  return h.slice(i + 1, h.indexOf('\n}', i) + 2);
}
const decl = (start, end = '\n') => { const i = h.indexOf(start); assert.ok(i >= 0, start); return h.slice(i, h.indexOf(end, i) + end.length); };
const handler = id => decl(`$('#${id}').onclick = () => {`, '\n};');

function phone() {
  const clk = { t: 0 }, timers = [], tones = [];
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
  const audio = {
    get currentTime() { return clk.t; }, outputLatency: 0, baseLatency: 0, state: 'running', destination: {},
    createDynamicsCompressor: () => ({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect() {}, context: audio }),
    createGain: () => { const g = { gain: param(), connect() {}, disconnect() { g.cut = true; } }; return g; },
    createOscillator() { const o = { frequency: {}, type: '', connect(g) { o.out = g; }, start(t) { o.t = t; }, stop() {} }; tones.push(o); return o; }
  };
  return {
    clk, timers, tones, audio, performance: { now: () => clk.t * 1000 },
    setTimeout: (f, ms) => { const x = { at: clk.t + ms / 1000, f }; timers.push(x); return x; },
    clearTimeout: x => { const i = timers.indexOf(x); if (i >= 0) timers.splice(i, 1); },
    run() { for (;;) { timers.sort((a, b) => a.at - b.at); if (!timers.length || timers[0].at > clk.t + 1e-9) break; timers.shift().f(); } },
    // tones heard: started, and not cut off before they began (Pause, Stop and Start recovery cancel waiting tones)
    heard: () => tones.filter(o => o.t <= clk.t + 1e-9 && !(o.out && o.out.cut && o.cutAt != null && o.cutAt < o.t)).map(o => ({ t: +o.t.toFixed(2), f: o.frequency.value }))
  };
}

// Training · Intervals with a plan, on the recording screen
function session(plan) {
  const P = phone(), dom = {}, saved = [], marks = [];
  const $ = sel => dom[sel] || (dom[sel] = { textContent: '', hidden: false, disabled: false, classList: { toggle() {}, remove() {}, add() {} } });
  const S = { recording: true, stopping: false, paused: false, total: 0, pausedSamples: 0, gapSamples: 0, pauses: [], rr: [], plan, trainType: 'intervals', ctx: 'training',
    recMark: null, ivTap: null, ivDone: -1, planned: null, audio: P.audio, acc: {}, ck: null };
  const src = [
    decl('const FS = '), decl('const CUE = ', '};\n'), decl('const CQ = '), decl('const audioLat = '), decl('const audioOff = '), decl('const AHEAD = '), decl('const IV_COUNT = '),
    'let cueOut = null; const CTX = { training: {} }; const NATIVE = false;',
    fn('cueBus'), fn('tone'), fn('dropTone'), fn('playPattern'), fn('cancelCues'), fn('planCue'), fn('elNow'),
    fn('pauseList'), fn('activeBetween'), fn('activeToRec'),
    fn('ivTime'), fn('ivEvents'), fn('ivPhase'), fn('ivFinish'), fn('tickIntervals'), fn('sessionMeta'),
    // Start recovery: the real function, with the button text left out
    fn('markRecovery').replace(/\$\('#btnRecov'\)\.textContent = [^;]*;/, ''),
    'function buzz() {}', 'function setPausedUI() {}', 'function ms2(s) { return String(Math.ceil(s)); }',
    "function tickTraining() { if (!S.recording || S.recMark != null) return; tickIntervals(elNow(), $('#stepPanel')); }",
    'function putSession(m) { saved.push(JSON.parse(JSON.stringify(m))); if (m.recMark != null && !marks.length) marks.push(m.recMark); }',
    handler('btnPause'), handler('btnIntervals'),
    'return { tickTraining };'
  ].join('\n');
  const env = new Function('S', '$', 'performance', 'setTimeout', 'clearTimeout', 'navigator', 'saved', 'marks', src)(S, $, P.performance, P.setTimeout, P.clearTimeout, {}, saved, marks);
  // mark tones cut by cancelCues (dropTone disconnects the gain) with the time they were cut
  const watchCuts = () => { for (const o of P.tones) if (o.out && o.out.cut && o.cutAt == null) o.cutAt = P.clk.t; };
  // the strap sends 130 samples a second (paused ones counted as such); the screen ticks every 0.2 s unless stalled
  const advance = (sec, { stall = false } = {}) => {
    const end = Math.round((P.clk.t + sec) * 1000) / 1000;
    while (P.clk.t < end - 1e-9) {
      P.clk.t = Math.round((P.clk.t + 0.05) * 1000) / 1000;
      const want = Math.round(P.clk.t * 130); while (S.total < want) { S.total++; if (S.paused) S.pausedSamples++; }
      P.run(); watchCuts();
      if (!stall && Math.round(P.clk.t * 1000) % 200 === 0) { env.tickTraining(); watchCuts(); }
    }
  };
  const press = id => { dom[id].onclick(); watchCuts(); };
  return { S, P, dom, saved, marks, advance, press };
}
const GO = 3000, REST = 2000, TICK = 2000;

test('live: Pause cuts a cue already scheduled on the audio clock; silence while paused; the count goes on after Resume', () => {
  const X = session({ w: 20, r: 10, n: 2 });
  X.advance(10); X.press('#btnIntervals');            // tapped at 10 s: 3-2-1 at 10, 11, 12 s, round 1 at 13 s
  X.advance(1.5);                                       // 11.5 s: the "1" (12 s) is already scheduled ahead
  assert.ok(X.P.tones.some(o => Math.abs(o.t - 12) < 0.01), 'the next tick is scheduled ahead on the audio clock');
  X.press('#btnPause'); X.advance(10); X.press('#btnPause');   // paused 11.5-21.5 s
  X.advance(5);
  const heard = X.P.heard();
  assert.ok(!heard.some(x => x.t > 11.5 && x.t < 21.5), 'nothing sounds while paused: ' + JSON.stringify(heard));
  assert.deepEqual(heard.filter(x => x.t <= 23.05).map(x => x.t), [10, 11, 22, 23], '3, 2, (pause), 1, GO: each once');
  assert.equal(heard.find(x => x.t === 23).f, GO);
});

test('live: what is saved with the recording is the pause-adjusted start of round 1', () => {
  const X = session({ w: 20, r: 10, n: 2 });
  X.advance(10); X.press('#btnIntervals');
  X.advance(1); X.press('#btnPause'); X.advance(10); X.press('#btnPause');   // paused 11-21 s, in the count
  const m = X.saved[X.saved.length - 1];
  assert.ok(Math.abs(m.planT0 - 23) < 0.01, 'planT0 saved after Resume: ' + m.planT0);
  assert.equal(JSON.stringify(m.pauses), '[{"t0":11,"t1":21}]');
  // the plan runs on and Start recovery comes by itself at the end of round 2: 23 + 20 + 10 + 20 = 73 s
  X.advance(60);
  assert.equal(X.marks.length, 1); assert.ok(Math.abs(X.marks[0] - 73) <= 0.25, 'Start recovery at 73 s: ' + X.marks[0]);
});

test('live: a cue missed while the page stalled plays once when the next tick sees its phase', () => {
  const X = session({ w: 20, r: 10, n: 2 });
  X.advance(10); X.press('#btnIntervals');            // round 1 work 13-33 s, rest 33-43 s
  X.advance(21.5);                                      // 31.5 s
  X.advance(2, { stall: true });                        // no ticks from 31.5 to 33.5 s: the rest cue at 33 s was never planned
  X.advance(1);
  const rest = X.P.heard().filter(x => x.t > 33 && x.t < 35);
  assert.equal(rest.length, 1, 'the rest cue plays once, late: ' + JSON.stringify(rest)); assert.equal(rest[0].f, REST);
  X.advance(8);
  assert.equal(X.P.heard().filter(x => x.t > 33 && x.t < 42.5).length, 1, 'and is not repeated');
});

test('live: once Stop is held, nothing more is planned or marked', () => {
  const X = session({ w: 20, r: 10, n: 1 });
  X.advance(10); X.press('#btnIntervals');            // round 1 13-33 s, then Start recovery by itself
  X.advance(15); X.S.stopping = true;                   // Stop held at 25 s; the strap takes a moment to stop
  const n = X.P.tones.length;
  X.advance(15);
  assert.equal(X.P.tones.length, n, 'no new cues'); assert.equal(X.marks.length, 0, 'no Start recovery');
});

test('live: the recording timer display holds while paused and goes on after Resume (tickRec)', () => {
  // paused at ten moments across one second, so the packet-by-packet wobble crosses a second boundary in some of them
  for (let k = 0; k < 10; k++) {
    const P = phone(), dom = {};
    const $ = sel => dom[sel] || (dom[sel] = { textContent: '', innerHTML: '', className: '' });
    const S = { recording: true, paused: false, total: 0, pausedSamples: 0, gapSamples: 0, shownT: 0, autoMin: 0, hr: 70, connected: true, ck: null,
      acc: { lastBrCalc: Infinity, on: false }, live: new Float32Array(1000), livePos: 0, ctx: 'rest' };
    const src = [decl('const FS = '), decl('const MAX_SAMPLES = '), 'let lastBattRead = Infinity;', fn('elNow'), fn('shownActive'), fn('tickRec'),
      'function hms(s) { return String(Math.floor(s)); }', 'function ms2(s) { return String(Math.ceil(s)); }',
      'function tickTraining() {} function cueDrift() {} function liveBreathing() {} function liveBrText() { return ""; } function ecgWatchdog() {} function readBattery() {}',
      'return tickRec;'].join('\n');
    const tickRec = new Function('S', '$', 'performance', 'setTimeout', 'Date', src)(S, $, P.performance, () => {}, { now: () => P.clk.t * 1000 });
    // samples arrive in packets of 73 (about 0.56 s), as from the H10; the display ticks every 0.05 s here
    const run = (sec, onTick) => { const end = Math.round((P.clk.t + sec) * 100) / 100; while (P.clk.t < end - 1e-9) { P.clk.t = Math.round((P.clk.t + 0.05) * 100) / 100;
      while (S.total + 73 <= Math.round(P.clk.t * 130)) { S.total += 73; if (S.paused) S.pausedSamples += 73; }
      tickRec(); onTick && onTick($('#recTimer').textContent, $('#dimT').textContent); } };
    run(474 + k / 10);
    S.paused = true; const held = $('#recTimer').textContent;
    run(20, (a, b) => { assert.equal(a, held, `timer holds while paused (paused at ${474 + k / 10} s)`); assert.equal(b, held, 'and the dimmed-screen timer'); });
    S.paused = false; run(3);
    const after = +$('#recTimer').textContent;
    assert.ok(after >= +held + 2 && after <= +held + 4, 'goes on after Resume: ' + held + ' -> ' + after);
  }
});

test('live: positions are saved per context: Morning keeps lying after Training is set to walking, and back', () => {
  const store = { lastCtx: 'training', lastPos: 'walking' }, chips = {};   // settings as left by 1.8.4
  const $ = sel => ({ '#autoOn': { checked: false } }[sel] || (chips[sel] = chips[sel] || {}));
  const S = {};
  const src = [decl('const CTX = {', '};\n'), decl('const POS = ', '};\n'), decl('const POS_CHIPS = '), decl('const CTX_CHIPS = '), decl('const AUTO_STEPS = '),
    fn('posMap'), fn('posFor'), fn('buildPosChips'), fn('initHomeSetup'),
    'function getSettings() { return JSON.parse(JSON.stringify(store)); } function patchSettings(p) { Object.assign(store, JSON.parse(JSON.stringify(p))); }',
    'function buildChips(el, defs, val, onPick) { el.val = val; el.pick = v => { el.val = v; onPick(v); }; }',
    'function stickyChips() {} function planUI() { return () => null; } function showTrainOpts() {} function updateAuto() {} function cleanPlan(p) { return p; }',
    'const TRAIN_TYPES = { session: 1 }, TT_CHIPS = [], REC_CHIPS = []; let getPlanSetup;', 'return initHomeSetup;'].join('\n');
  const init = new Function('S', '$', 'store', src)(S, $, store);
  init();
  assert.equal(S.ctx, 'training'); assert.equal(S.pos, 'walking', "1.8.4's position kept for its context");
  chips['#ctxChips'].pick('morning'); assert.equal(S.pos, '', 'Morning starts unselected, not on walking');
  chips['#posChips'].pick('lying');
  chips['#ctxChips'].pick('training'); assert.equal(S.pos, 'walking', 'Training still walking');
  assert.equal(chips['#posChips'].val, 'walking', 'and its chip shows it');
  init();   // the app opened again (settings from storage), last on Training
  chips['#ctxChips'].pick('morning'); assert.equal(S.pos, 'lying', 'Morning remembered lying');
  assert.equal(chips['#posChips'].val, 'lying');
});

test('import: a pause still open when the recording was cut off is kept; broken pauses are still dropped', () => {
  const src = [decl('const CTX = {', '};\n'), decl('const POS = ', '};\n'), decl('const own = '), decl('const num = '), decl('const str = '),
    fn('cleanPlan'), "const TRAIN_TYPES = { intervals: 'Intervals' };", fn('cleanMeta'), 'return cleanMeta;'].join('\n');
  const cleanMeta = new Function(src)();
  const m = cleanMeta({ start: Date.now() - 1000, ctx: 'training', trainType: 'intervals', plan: { w: 20, r: 10, n: 8 }, planT0: 13,
    pauses: [{ t0: 48, t1: 63 }, { t0: 200, t1: null }, { t0: 'x', t1: 5 }, { t0: 90, t1: 80 }, { t0: 95, t1: 'y' }] });
  assert.equal(JSON.stringify(m.pauses), '[{"t0":48,"t1":63},{"t0":200,"t1":null}]');
  assert.equal(m.planT0, 13);
});

test('Details: choosing a different interval plan drops the app timing; the same plan keeps it', async () => {
  const S = { raw: null, meta: { id: 'r1', ctx: 'training', pos: 'sitting', trainType: 'intervals', recovery: 'passive', plan: { w: 20, r: 10, n: 8 }, planT0: 13, sample: false },
    analysis: { dur: 600, gapSec: 0 }, dTT: 'intervals', dRec: 'passive', getPlan2: null };
  const stored = { id: 'r1', plan: { w: 20, r: 10, n: 8 }, planT0: 13 }, dom = {};
  const $ = sel => dom[sel] || (dom[sel] = { value: '', hidden: false, onclick: null, val: { '#ctxChips2': 'training', '#posChips2': 'sitting' }[sel] });
  const src = decl("$('#btnDetailsSave').onclick = async () => {", '\n};').replace("$('#btnDetailsSave').onclick = async () => {", 'return async () => {');
  const save = new Function('S', '$', 'chipVal', 'str', 'analyze', 'analyzeOpts', 'getSession', 'putSession', 'putHistory', 'historyEntry', 'renderInto', 'toast',
    src)(S, $, el => el.val, s => s, null, null,
    async () => stored, async s => Object.assign(stored, s), async () => {}, () => ({}), async () => {}, () => {});
  S.getPlan2 = () => ({ w: 20, r: 10, n: 8 }); await save();
  assert.equal(S.meta.planT0, 13, 'same plan: still timed'); assert.equal(stored.planT0, 13);
  S.getPlan2 = () => ({ w: 30, r: 30, n: 10 }); await save();
  assert.equal(S.meta.planT0, null, 'a new plan is not the one the app timed'); assert.equal(stored.planT0, null, 'and the stored recording agrees');
});

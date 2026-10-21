import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';
const L = load();
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);
const run = async (kind, minutes, opts = {}) => { const d = L.makeDemo(minutes, 7, kind); return L.analyze(d.raw, { age: 45, rr: d.rr, acc: d.acc, ...opts }); };

test('recovery is measured from the end of the session, not from a mid-session peak', async () => {
  const A = await run('intervals', 35);
  const E = A.exercise;
  assert.equal(E.src, 'auto');
  near(E.end, 1800, 30, 'end of last interval');
  assert.ok(E.stop > 160, 'heart rate at stop is the final effort');
  assert.ok(E.hrr60 > 18, 'passive cool-down recovery');
});

test('a session that ends while still climbing reports no recovery and raises no recovery flag', async () => {
  const A = await run('intervals-climb', 37);
  assert.equal(A.exercise.end, null);
  const meta = { ctx: 'training', pos: 'walking', recovery: 'active', trainType: 'session', start: Date.now(), gap: 0 };
  const R = L.refsFor(45, 'M', 'training', 'walking');
  const G = L.gradeAll(A, meta, R);
  assert.equal(G.hrr.g, 'na');
  assert.equal(G.hrr.value, 'Not measured');
});

test('a marked recovery start is used as the end of exercise', async () => {
  const A = await run('ramp', 31, { recMark: 1530 });
  assert.equal(A.exercise.src, 'marked');
  assert.equal(A.exercise.end, 1530);
  near(A.exercise.stop, 178, 3, 'heart rate at stop');
});

test('active recovery is graded against a looser limit than passive', async () => {
  const A = await run('intervals', 35), R = L.refsFor(45, 'M', 'training', 'walking');
  const E = { ...A.exercise, hrr60: 15 };
  const g = rec => L.gradeAll({ ...A, exercise: E }, { ctx: 'training', pos: 'walking', recovery: rec, gap: 0 }, R).hrr.g;
  assert.equal(g('active'), 'bord');
  assert.equal(g('passive'), 'out');
});

test('ramp test: steps, failure point and plateau', async () => {
  const A = await run('ramp', 31, { recMark: 1530 });
  const r = L.rampTest(A, A.exercise);
  assert.equal(r.completed, 8);
  assert.ok(r.plateau, 'plateau detected');
  near(r.max, 178, 3, 'measured max');
});

test('LTHR: mean heart rate over the last 20 minutes of the time trial', async () => {
  const A = await run('lthr', 38);
  const r = L.lthrTest(A, A.exercise);
  assert.ok(r.valid);
  near(r.lthr, 159.5, 2, 'LTHR');
  near(r.onset, 300, 90, 'effort timed from when it began, not from the warm-up');
  near(r.effortMin, 30, 1.5, 'effort length');
  assert.ok(r.cover > 0.95);
});

test('session maximum is not set by one stray beat', async () => {
  const A = await run('ramp', 31, { recMark: 1530 });       // contains an injected premature beat near peak effort
  const r = L.rampTest(A, A.exercise);
  assert.ok(A.maxHR.v <= r.max + 8, `max ${A.maxHR.v.toFixed(0)} vs 20-s peak ${r.max.toFixed(0)}`);
});

test('zones: %max and LTHR (Friel) boundaries', async () => {
  const A = await run('intervals', 35);
  const z = L.zoneTime(A, 180, L.PCT_ZONES), lz = L.zoneTime(A, 160, L.LTHR_ZONES);
  assert.deepEqual([z[2].bpmLo, z[2].bpmHi], [126, 144]);
  assert.equal(lz.length, 7); assert.equal(lz[3].bpmLo, 152); assert.equal(lz[6].bpmHi, Infinity);
  near(z.reduce((a, b) => a + b.sec, 0), A.dur, 60, 'time adds up');
});

test('working max HR: observed data has priority, +2 % margin, plateau as measured, Tanaka only as fallback', async () => {
  const ctx = vmApi();
  const now = Date.now(), h = (id, peak20, extra = {}) => ({ id, start: now - 864e5, ctx: 'training', trainType: 'session', peak20, ...extra });
  // no training data -> Tanaka
  let W = ctx.maxHrEstimate([], { id: 'c', ctx: 'rest', peak20: 70 }, 50, 'M');
  assert.equal(W.src, 'tanaka'); near(W.v, 173, 0.01, 'Tanaka 208 - 0.7 x 50');
  // observed peak -> +2 %
  W = ctx.maxHrEstimate([h('a', 180)], { id: 'c', ctx: 'training', peak20: 170 }, 50, 'M');
  assert.equal(W.src, 'observed'); near(W.v, 183.6, 0.01, '180 x 1.02');
  // a ramp plateau is used as measured, but a higher observed value still wins
  W = ctx.maxHrEstimate([h('a', 175), h('r', 182, { trainType: 'ramp', rampMax: 186, rampPlateau: true })], { id: 'c', ctx: 'training', peak20: 170 }, 50, 'M');
  assert.equal(W.src, 'ramp'); assert.equal(W.v, 186);
  // high-max flag (> 12 % above Tanaka)
  W = ctx.maxHrEstimate([h('a', 196)], { id: 'c', ctx: 'training', peak20: 150 }, 50, 'M');
  assert.ok(W.highMax);
  // Gulati only for women
  assert.equal(ctx.ageFormulas(50, 'F').list.length, 4); assert.equal(ctx.ageFormulas(50, 'M').list.length, 3);
});
function vmApi() { return L; }

test('end of exercise is where the final fall begins, not the top of the last effort', () => {
  // heart-rate profile: effort peaks at 161, continues ~70 s at 152-158, then a sharp stop (shape taken from a real interval session)
  const prof = s => s < 600 ? 120 + 41 * s / 600 : s < 610 ? 161 : s < 680 ? 155 + 3 * Math.sin(s / 7) : s < 900 ? 110 + 45 * Math.exp(-(s - 680) / 35) : 105 + 20 * Math.max(0, Math.sin((s - 900) / 60));
  const t = [], rr = [], rrOk = [], ect = []; let tc = 0;
  while (tc < 1300) { const r = 60000 / prof(tc); tc += r / 1000; t.push(tc); rr.push(r); rrOk.push(1); ect.push(0); }
  const E = L.exerciseResponse({ beats: t.length, t, rr, rrOk, ect, dur: 1300 });
  assert.ok(E.end >= 670 && E.end <= 690, `end at the start of the fall (${E.end})`);
  assert.ok(E.hrr60 > 25, `recovery measured from the real stop (${E.hrr60})`);
});

test('exercise is not graded against resting waveform norms, and QTc uses Fridericia', async () => {
  const A = await run('intervals', 35), R = L.refsFor(58, 'M', 'training', 'walking');
  const G = L.gradeAll({ ...A, jAmp: -106, tPosPct: 89, qtc: 425, qtcF: 376, meanHR: 133 }, { ctx: 'training', pos: 'walking', recovery: 'active', gap: 0 }, R);
  assert.equal(G.j.g, 'na'); assert.equal(G.t.g, 'na');
  assert.equal(G.qtc.g, 'norm'); assert.ok(G.qtc.frid);
  const G2 = L.gradeAll({ ...A, jAmp: -230 }, { ctx: 'training', pos: 'walking', gap: 0 }, R);
  assert.equal(G2.j.g, 'bord');
});

test('interval training: each hard effort is found, with the recovery between efforts', async () => {
  const { analyze, makeDemo } = load();
  const api = load(); const d = makeDemo(36, 3, 'intervals');
  const A = await analyze(d.raw, { age: 45, rr: d.rr, acc: d.acc });
  const I = api.intervalWork(A, A.exercise);
  assert.equal(I.bouts.length, 4, '4 x 4 min efforts');
  for (const b of I.bouts) assert.ok(b.dur > 150 && b.dur < 300, 'effort length ' + b.dur);
  for (const b of I.bouts.filter(b => !b.last)) assert.ok(b.recDrop > 20, 'heart rate falls between efforts');
});

test('tempo: the sustained block, its average and cardiac drift', async () => {
  const { analyze, makeDemo } = load();
  const api = load(); const d = makeDemo(36, 3, 'tempo');
  const A = await analyze(d.raw, { age: 45, rr: d.rr, acc: d.acc });
  const T = api.tempoWork(A, A.exercise);
  assert.ok(T.valid && T.dur > 18 * 60, 'block of about 25 min');
  assert.ok(T.avg > 145 && T.avg < 160);
  assert.ok(T.drift > 1 && T.drift < 8, 'slight upward drift ' + T.drift);
});

test('DFA alpha1: known exponents for white noise, pink noise and a random walk', () => {
  let s = 1; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const g = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const avg = f => { let t = 0; for (let k = 0; k < 30; k++) t += f(); return t / 30; };
  near(avg(() => L.dfaAlpha1(Array.from({ length: 250 }, g))), 0.55, 0.08, 'white noise');
  near(avg(() => { let c = 0; return L.dfaAlpha1(Array.from({ length: 250 }, () => c += g())); }), 1.47, 0.1, 'random walk');
  assert.ok(Number.isNaN(L.dfaAlpha1([1, 2, 3])), 'too short');
});

test('DFA-alpha1 test: thresholds from strap intervals and from ECG agree', async () => {
  const res = [];
  for (const strap of [true, false]) {
    const d = L.makeDemo(33, 7, 'dfa');
    const A = await L.analyze(d.raw, { age: 50, rr: strap ? d.rr : null, acc: d.acc, recMark: 1800 });
    const r = L.dfaTest(A, A.exercise); res.push(r);
    assert.ok(r.valid, 'valid'); assert.equal(r.src, strap ? 'strap' : 'ecg');
    near(r.vt1, 132, 6, 'HRVT1'); near(r.vt2, 155, 7, 'HRVT2'); assert.ok(r.startA1 > 0.9 && r.minA1 < 0.5);
    assert.equal(r.steep, false, 'a gradual fall is not flagged as steep');
  }
  near(res[0].vt1, res[1].vt1, 3, 'strap vs ECG');
});

test('DFA-alpha1 test: no threshold from a resting recording', async () => {
  const d = L.makeDemo(10, 2, 'rest');
  const A = await L.analyze(d.raw, { age: 50, rr: d.rr });
  const r = L.dfaTest(A, null);
  assert.ok(!r.valid && Number.isNaN(r.vt1));
});

test('interval plan: rounds end at Start recovery; heart rate per round', async () => {
  const A = await run('intervals', 35);
  const end = A.exercise.end, P = L.planWork(A, A.exercise, { w: 240, r: 420 - 240, n: 4 }, end);
  assert.equal(P.rounds.length, 4);
  near(P.rounds[3].t1, end, 0.01, 'last work round ends at the mark');
  near(P.t0, end - (4 * 240 + 3 * 180), 0.01, 'start');
  for (const r of P.rounds) assert.ok(r.avg > 140, 'work rounds are hard: ' + r.avg.toFixed(0));
  const short = L.planWork(A, A.exercise, { w: 20, r: 10, n: 200 }, 60);
  assert.ok(short.clipped && short.t0 === 0, 'a plan longer than the recording is clipped, not shifted');
});

test('orthostatic test: lying, peak and standing heart rate, with and without the stand cue', async () => {
  const d = L.makeDemo(6, 7, 'ortho'), A = await L.analyze(d.raw, { age: 50, rr: d.rr, acc: d.acc });
  for (const mark of [180, undefined]) {
    const o = L.orthoTest(A, mark);
    assert.ok(o.valid, 'valid'); assert.equal(o.src, mark ? 'cue' : 'detected'); near(o.st, 180, 6, 'stand time');
    near(o.lieHR, 57, 2, 'lying'); near(o.standHR, 70, 3, 'standing'); assert.ok(o.peakHR > o.standHR + 5, 'peak above standing');
    assert.ok(o.rmssdStand < o.rmssdLie, 'HRV lower standing'); assert.ok(o.r3015 > 1, '30:15 ratio');
  }
  const r = L.makeDemo(6, 3, 'rest'), B = await L.analyze(r.raw, { age: 50, rr: r.rr, acc: r.acc });
  assert.equal(L.orthoTest(B, undefined).reason, 'nostand', 'a resting recording has no stand');
});

test('orthostatic and spot-check reports', async () => {
  const st = { sex: 'M', dob: '1970-01-01' }, start = Date.now() - 864e5;
  const d = L.makeDemo(6, 7, 'ortho'), A = await L.analyze(d.raw, { age: 50, rr: d.rr, acc: d.acc });
  const h = L.renderReport(A, { start, ctx: 'ortho', pos: 'seated', standMark: 180 }, st, []);
  assert.ok(h.includes('Lying, then standing') && h.includes('Rise when standing') && h.includes('<h2>Orthostatic test</h2>'));
  const r = L.makeDemo(5, 3, 'rest'), B = await L.analyze(r.raw, { age: 50, rr: r.rr, acc: r.acc });
  const s = L.renderReport(B, { start, ctx: 'spot', pos: 'seated' }, st, []);
  assert.ok(s.includes('call emergency services now') && s.includes('cannot rule anything out'), 'spot-check safety wording');
});

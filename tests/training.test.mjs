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

test('exercise is not graded against resting waveform norms, and QTc is not graded at exercise heart rates', async () => {
  const A = await run('intervals', 35), R = L.refsFor(58, 'M', 'training', 'walking');
  const G = L.gradeAll({ ...A, jAmp: -106, tPosPct: 89, qtc: 401, qtcF: 341, meanHR: 156, qtcSteady: null }, { ctx: 'training', pos: 'walking', recovery: 'active', gap: 0 }, R);
  assert.equal(G.j.g, 'na'); assert.equal(G.t.g, 'na');
  assert.equal(G.qtc.g, 'na'); assert.ok(G.qtc.rate); assert.equal(G.qtc.value, 'Not assessed (rate)');
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

test('DFA-alpha1: the fit uses only the falling part, so flat ends do not pull the thresholds up', () => {
  // α1 flat at 1.3 up to 146 bpm, falling to 0.35 by 158 bpm, then flat at 0.35 up to 166 bpm (like 4 Nov 2026)
  const pts = []; let t = 60;
  const a1At = hr => hr <= 146 ? 1.3 : hr >= 158 ? 0.35 : 1.3 - 0.95 * (hr - 146) / 12;
  for (let hr = 115; hr <= 166; hr += 0.25, t += 10) pts.push({ t, hr, a1: a1At(hr) });
  const r = L.dfaFromPoints(pts);
  const exp1 = 146 + 12 * (1.3 - 0.75) / 0.95, exp2 = 146 + 12 * (1.3 - 0.5) / 0.95;   // 152.9 and 156.1
  near(r.vt1, exp1, 1.2, 'HRVT1'); near(r.vt2, exp2, 1.2, 'HRVT2');
  assert.ok(r.steep, 'thresholds within 8 bpm are flagged as approximate');
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

test('ramp test: a step whose last 30 s hit lost signal uses its last clean 30 s or is not measured, and is marked', async () => {
  const d = L.makeDemo(25, 7, 'ramp'), A0 = await L.analyze(d.raw, { age: 40, rr: d.rr });
  const base = L.rampTest(A0, A0.exercise);
  // contact lost over the end of step 3 (8:40-9:00) and the whole of step 4 (9:00-12:00)
  const A = { ...A0, lost: [{ t0: 520, t1: 720 }] };
  const r = L.rampTest(A, A.exercise), s3 = r.steps[2], s4 = r.steps[3];
  assert.equal(s3.flag, 'moved'); assert.ok(s3.w1 <= 520 && s3.w1 - s3.w0 === 30 && isFinite(s3.hr), JSON.stringify(s3));
  assert.equal(s4.flag, 'lost'); assert.ok(!isFinite(s4.hr));
  assert.equal(r.completed, base.completed, 'completed steps still counted');
  assert.equal(r.steps.filter(s => !s.flag).length, base.steps.length - 2, 'only the two affected steps are marked');
  const meta = { id: 'r', start: Date.UTC(2026, 10, 4, 1, 34), ctx: 'training', pos: 'seated', trainType: 'ramp', recovery: 'passive', gap: 0 };
  const html = L.renderReport({ ...A }, meta, { sex: 'M', dob: '1981-01-01' }, []);
  assert.ok(html.includes('strap lost contact') && html.includes('left out of the plateau check'), 'marked in the report');
  assert.ok(html.includes('Heart rate through the steps'), 'heart-rate trace shown');
});

test('recovery cut short: a Start recovery mark seconds before the end is "Cut short", with no recovery floor', async () => {
  const d = L.makeDemo(36, 5, 'lthr');
  const meta = { id: 'c', start: Date.UTC(2026, 10, 9, 1, 9), ctx: 'training', pos: 'seated', trainType: 'lthr', recovery: 'passive', gap: 0, stopWhy: 'user' };
  const dur = d.raw.length / L.FS;
  for (const [after, cut] of [[7, true], [130, false]]) {
    const A = await L.analyze(d.raw, { age: 58, rr: d.rr, recMark: dur - after }), E = A.exercise;
    assert.equal(E.src, 'marked', `mark ${after} s before the end is used`);
    assert.equal(E.cut, cut); assert.ok(Math.abs(E.after - after) < 0.5, `after ${E.after}`);
    const txt = L.renderReport(A, { ...meta, recMark: dur - after }, { sex: 'M', dob: '1968-01-01' }, []).replace(/<[^>]+>/g, ' ');
    if (cut) {
      assert.ok(!isFinite(E.floor), 'no floor from a few seconds');
      assert.ok(!/Recovery floor/.test(txt), 'no floor row');
      assert.ok(/Recovery cut short \(recording stopped 7 s after Start recovery\)/.test(txt), 'summary says cut short');
      assert.ok(/stopped 7 s after you tapped Start recovery \(Stop was held\)/.test(txt), 'card says why');
      assert.ok(!/while you were still exercising/.test(txt), 'never "still exercising" when Start recovery was tapped');
    } else assert.ok(/Recovery floor/.test(txt) && isFinite(E.hrr60), 'a full recovery is unchanged');
  }
});

test('recovery at +60 s and +120 s reads across a few seconds of lost signal', () => {
  // steady 160 bpm effort to 600 s, then an exponential fall; the strap loses contact for 8 s around +60 s and +120 s
  const prof = s => s < 600 ? 160 : 90 + 70 * Math.exp(-(s - 600) / 50);
  const t = [], rr = [], rrOk = [], ect = []; let tc = 0;
  while (tc < 900) { const r = 60000 / prof(tc); tc += r / 1000; t.push(tc); rr.push(r); rrOk.push(1); ect.push(0); }
  const gap = s => (s > 655 && s < 667) || (s > 715 && s < 727);
  const keep = t.map((s, i) => !gap(s));
  const pick = a => a.filter((_, i) => keep[i]);
  const T = pick(t), RR = pick(rr), OK = pick(rrOk), EC = pick(ect);
  // the beat right after each gap spans it: not a valid interval
  for (let i = 1; i < T.length; i++) if (T[i] - T[i - 1] > 2) OK[i] = 0;
  const E = L.exerciseResponse({ beats: T.length, t: T, rr: RR, rrOk: OK, ect: EC, dur: 900 }, 600);
  assert.equal(E.src, 'marked');
  const want60 = prof(660), want120 = prof(720);
  assert.ok(Math.abs(E.at60 - want60) < 6, `+60 s read across the gap (${E.at60} vs ${want60.toFixed(1)})`);
  assert.ok(Math.abs(E.at120 - want120) < 6, `+120 s read across the gap (${E.at120} vs ${want120.toFixed(1)})`);
  // a long loss of signal still gives no value rather than a guess
  const far = t.map(s => !(s > 630 && s < 700)), T2 = t.filter((_, i) => far[i]);
  const OK2 = rrOk.filter((_, i) => far[i]); for (let i = 1; i < T2.length; i++) if (T2[i] - T2[i - 1] > 2) OK2[i] = 0;
  const E2 = L.exerciseResponse({ beats: T2.length, t: T2, rr: rr.filter((_, i) => far[i]), rrOk: OK2, ect: ect.filter((_, i) => far[i]), dur: 900 }, 600);
  assert.ok(Number.isNaN(E2.at60), 'no +60 s value across a 70 s gap');
});

test('Training: no ECG-derived breathing estimate; the report says "Not measured" instead', async () => {
  const { analyze, makeDemo } = load(); const d = makeDemo(36, 3, 'intervals');
  const A = await analyze(d.raw, { age: 45, rr: d.rr, ctx: 'training' });
  assert.equal(A.breathSource, 'none'); assert.equal(A.breath, null);
  const R = await analyze(d.raw, { age: 45, rr: d.rr });
  assert.equal(R.breathSource, 'ecg', 'other contexts keep the ECG fallback');
  const txt = s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const meta = { start: Date.now(), ctx: 'training', pos: '', trainType: 'session', recovery: 'passive' }, st = { sex: 'M', dob: '1968-01-01' };
  const T = txt(L.renderReport(A, meta, st, []));
  assert.match(T, /Breathing rate Not measured/, 'the breathing card says Not measured');
  assert.match(T, /An estimate from the ECG isn’t reliable during exercise/);
  assert.ok(!/Breathing rate ECG-derived/.test(T), 'no ECG-derived breathing value in the measurements table');
  assert.match(T, /Breathing rate not measured while moving/);
  assert.match(txt(L.renderReport(R, { ...meta, ctx: 'rest', trainType: '', recovery: '' }, st, [])), /Breathing rate [0-9.]+ \/min/, 'rest reports still show the ECG estimate');
});

test('a signal gap during exercise is left out of heart-rate averages; ramp steps need a measurable window', async () => {
  // 165 bpm throughout, with one 4.25-s dropout (beats missing) at 300 s
  const t = [], rr = [], rrOk = [], ect = []; let tc = 0, dropped = false;
  while (tc < 600) { let r = 60000 / 165; if (!dropped && tc > 300) { r = 4250; dropped = true; } tc += r / 1000; t.push(tc); rr.push(r); rrOk.push(1); ect.push(0); }
  const nn = rr.map((r, k) => k && r < 2000 ? 1 : 0), ok = rrOk.slice();
  const P = L.splitPauses(t, rr, ok, nn);
  assert.equal(P.gaps.length, 1); assert.equal(P.pauses.length, 0);
  const { analyze, makeDemo } = load(); const d = makeDemo(36, 3, 'intervals');
  const A = await analyze(d.raw, { age: 45, rr: d.rr, ctx: 'training' });
  for (const g of A.gaps || []) assert.equal(A.rrOk[g.k], 0, 'gap interval not a valid beat');
  // with the gap left out, the 20-s heart rate over the dropout stays at 165
  const B = { beats: t.length, dur: 600, t, rr, rrOk: rrOk.map((v, k) => P.gaps.some(g => g.k === k) ? 0 : v), ect };
  const s = L.rollingHR(B, 20, 1).filter(p => Math.abs(p.t - 302) < 3);
  assert.ok(s.length && s.every(p => Math.abs(p.v - 165) < 2), 'rolling 20-s heart rate ' + s.map(p => p.v.toFixed(0)));
  const s0 = L.rollingHR({ ...B, rrOk }, 20, 1).filter(p => Math.abs(p.t - 302) < 3);
  assert.ok(s0.some(p => p.v < 145), 'counted as one beat, the gap would pull it down (' + s0.map(p => p.v.toFixed(0)) + ')');
});

test('ramp: a step moved out of lost signal needs a window with beats in it', () => {
  // 160 bpm; no beats 138-176 s (strap off), lost-contact span 170-185 s covering the end of step 1
  const t = [], rr = [], rrOk = [], ect = []; let tc = 0;
  while (tc < 560) { tc += 0.375; if (tc > 138 && tc < 176) continue; t.push(tc); rr.push(t.length > 1 ? 1000 * (tc - t[t.length - 2]) : 375); rrOk.push(rr[rr.length - 1] < 2000 ? 1 : 0); ect.push(0); }
  const A = { beats: t.length, dur: 560, t, rr, rrOk, ect, lost: [{ t0: 170, t1: 185 }] };
  const s1 = L.rampTest(A, { end: 540 }).steps[0];
  assert.equal(s1.flag, 'moved');
  assert.ok(isFinite(s1.hr) && Math.abs(s1.hr - 160) < 1, `step 1 from a window with beats (${s1.hr}, ${s1.w0}-${s1.w1})`);
  assert.ok(s1.w0 < 138, 'the window has beats in it');
});

test('signal gaps are taken out of the beats used for heart-rate averages', async () => {
  const { readFileSync } = await import('node:fs');
  const c = readFileSync(new URL('../src/core.js', import.meta.url), 'utf8');
  const at = c.indexOf('splitPauses(t, rr, rrOk, nn);');
  assert.ok(at > 0 && /^\s*\/\/[^\n]*\n(\s*\/\/[^\n]*\n)*\s*for \(const g of gaps\) rrOk\[g\.k\] = 0;/.test(c.slice(c.indexOf('\n', at) + 1)), 'gaps cleared from rrOk straight after they are found');
});

test('recovery with the signal missing at +1 min (recording long enough) says Not measured, not Cut short', async () => {
  const { analyze, makeDemo } = load(); const d = makeDemo(36, 3, 'intervals');
  const A = await analyze(d.raw, { age: 45, rr: d.rr, ctx: 'training' });
  assert.ok(A.exercise && A.exercise.end != null, 'demo has a recovery');
  const txt = s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const meta = { start: Date.now(), ctx: 'training', pos: '', trainType: 'intervals', recovery: 'passive' }, st = { sex: 'M', dob: '1968-01-01' };
  const T = txt(L.renderReport({ ...A, exercise: { ...A.exercise, at60: NaN, hrr60: NaN, cut: false, after: 300 } }, meta, st, []));
  assert.match(T, /Heart-rate recovery \(1 min\) Not measured/);
  assert.match(T, /the strap signal was missing around one minute/);
  assert.ok(!/Cut short/.test(T), 'not called cut short');
  const C = txt(L.renderReport({ ...A, exercise: { ...A.exercise, at60: NaN, hrr60: NaN, cut: true, after: 7 } }, meta, st, []));
  assert.match(C, /Heart-rate recovery \(1 min\) Cut short/);
});

test('an invalid ramp test says why: too few steps, signal loss, missing heart rate or no peak', () => {
  const beats = gaps => { const t = [], rr = [], rrOk = [], ect = []; let tc = 0;
    while (tc < 560) { tc += 0.375; if (gaps.some(([a, b]) => tc > a && tc < b)) continue; t.push(tc); const r = t.length > 1 ? 1000 * (tc - t[t.length - 2]) : 375; rr.push(r); rrOk.push(r < 2000 ? 1 : 0); ect.push(0); }
    return { beats: t.length, dur: 560, t, rr, rrOk, ect, lost: [] }; };
  // heart rate missing over the last 30 s of steps 1 and 2, no lost-contact span: completed but not measurable
  const r = L.rampTest(beats([[148, 182], [328, 362]]), { end: 545 });
  assert.equal(r.completed, 3); assert.equal(r.flagged, 0); assert.ok(!r.valid);
  assert.equal(L.rampInvalid(r, false), 'Test not valid: fewer than three completed steps had a measurable heart rate.');
  assert.match(L.rampInvalid(r, true), /^Heart-rate data was missing in too many steps/);
  assert.equal(L.rampInvalid({ completed: 2, max: 160, flagged: 0 }, false), 'Test not valid: fewer than three steps were completed.');
  assert.match(L.rampInvalid({ completed: 2, max: 160, flagged: 0 }, true), /^Fewer than three 3-minute steps were completed/);
  assert.equal(L.rampInvalid({ completed: 4, max: 160, flagged: 2 }, false), 'Test not valid: fewer than three completed steps were free of signal loss.');
  assert.match(L.rampInvalid({ completed: 4, max: NaN, flagged: 0 }, true), /^No 20-second peak heart rate could be measured/);
});

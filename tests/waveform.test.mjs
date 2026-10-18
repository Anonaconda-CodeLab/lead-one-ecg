// QRS delineation on synthetic averaged beats (520 Hz, R at index 130), including exercise-style raised, sloping ST segments.
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';
const { delineate } = load();

const FSU = 520, R = 130, N = 300;
const g = (t, mu, sd, a) => a * Math.exp(-((t - mu) ** 2) / (2 * sd * sd));
function beat(waves, st = null) {
  const tp = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const t = (i - R) / FSU * 1000;                       // ms from R
    for (const [mu, sd, a] of waves) tp[i] += g(t, mu, sd, a);
    if (st && t > st.from) tp[i] += Math.min(t - st.from, st.len) * st.slope;   // linear ST rise (µV/ms)
  }
  return tp;
}
const width = (tp, pol) => delineate(tp, FSU, R, 380, pol);

test('rS beat (main deflection negative) with a raised, sloping exercise ST: QRS ends at the S upstroke', () => {
  const tp = beat([[-30, 7, 450], [0, 8, -1200], [170, 40, 380]], { from: 22, len: 120, slope: 3 });
  const d = width(tp, -1);
  assert.ok(d.qrsOk, 'measurement judged reliable');
  assert.ok(d.qrs > 55 && d.qrs < 95, `QRS ${d.qrs.toFixed(0)} ms should be normal, not drift into the ST segment`);
});

test('qRs beat (main deflection positive) keeps the S wave inside the QRS, also with exercise ST elevation', () => {
  for (const st of [null, { from: 40, len: 120, slope: 2.5 }]) {
    const tp = beat([[-28, 6, -120], [0, 8, 1300], [26, 7, -320], [180, 40, 350]], st);
    const d = width(tp, 1);
    assert.ok(d.qrsOk);
    assert.ok(d.qrs > 65 && d.qrs < 110, `QRS ${d.qrs.toFixed(0)} ms`);
    assert.ok(d.J > R + 0.03 * FSU, 'J lies after the S wave, not at its bottom');
  }
});

test('a beat with no clear QRS end is reported as unreliable rather than given a fixed width', () => {
  const tp = beat([[0, 8, -1200]], { from: 4, len: 200, slope: 9 });   // upstroke that never levels off
  const d = width(tp, -1);
  assert.equal(d.qrsOk, false);
});

test('ectopic detection: real early beats are still caught; ordinary beats at high heart rate are not flagged', async () => {
  const { analyze, makeDemo } = load();
  const rest = makeDemo(42, 1, 'rest');                       // contains 4 premature, wide beats
  const a = await analyze(rest.raw, { age: 45, rr: rest.rr });
  assert.equal(a.events.length, 4);
  assert.ok(a.events.every(e => /Premature/.test(e.kind)));
  const ramp = makeDemo(16, 2, 'ramp');                       // up to ~170 bpm, one injected premature beat
  const b = await analyze(ramp.raw, { age: 45, rr: ramp.rr, acc: ramp.acc });
  assert.ok(b.events.every(e => /Premature/.test(e.kind)), 'no shape-only flags on on-time beats: ' + b.events.map(e => e.kind).join(', '));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';
const L = load();
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);

test('resting recording: beats, ectopics, pause, HRV sources agree, breathing from motion', async () => {
  const d = L.makeDemo(46, 7, 'rest');
  const A = await L.analyze(d.raw, { age: 45, rr: d.rr, acc: d.acc });
  assert.equal(A.ectopicBeats, 4, 'four synthetic ectopic beats');
  assert.equal(A.pauses.length, 1, 'one 2.2 s pause');
  near(A.pauses[0].ms, 2220, 15, 'pause length');
  assert.equal(A.hrvSource, 'h10');
  near(A.rmssd, A.ecgRmssd, 1.5, 'strap vs ECG RMSSD');
  assert.equal(A.breathSource, 'acc');
  near(A.breath.median, 13.8, 0.5, 'breathing rate');
  near(A.qrs, 85, 15, 'QRS width');
  assert.ok(A.qtc > 350 && A.qtc < 450, 'QTc plausible');
});

test('meditation: slow breathing and strong coupling', async () => {
  const d = L.makeDemo(10, 7, 'meditation');
  const A = L.ctxView(await L.analyze(d.raw, { age: 45, rr: d.rr, acc: d.acc }), 'meditation');
  near(A.breath.median, 6, 0.4, 'breathing rate');
  assert.ok(A.breathShare > 60, 'breathing-linked HRV share');
});

test('training: peak heart rate and recovery; breathing falls back to ECG while walking', async () => {
  const d = L.makeDemo(20, 7, 'training');
  const A = await L.analyze(d.raw, { age: 35, rr: d.rr, acc: d.acc });
  near(A.exercise.peak, 166, 4, 'peak HR');
  assert.ok(A.exercise.hrr60 > 12, 'recovery after 1 minute');
  assert.equal(A.breathSource, 'ecg');
  assert.ok(A.stillPct < 60, 'movement detected');
});

test('motion-based breathing ignores slow body sway and rejects walking', () => {
  const fs = 12.5, n = 160 * fs, a = new Int16Array(3 * n);
  for (let i = 0; i < n; i++) { const t = i / fs, b = Math.sin(2 * Math.PI * 0.233 * t), sway = 6 * Math.sin(2 * Math.PI * 0.07 * t);
    a[3 * i] = Math.round(40 + 5 * b + sway); a[3 * i + 1] = Math.round(-990 + 3 * b); a[3 * i + 2] = Math.round(90 + 9 * b); }
  near(L.accBreathing({ fs, t0: 0, data: a }).median, 14, 0.4, 'breathing with sway');
  for (let i = 0; i < n; i++) a[3 * i + 1] = Math.round(-990 + 250 * Math.sin(2 * Math.PI * 1.7 * i / fs));
  assert.equal(L.accBreathing({ fs, t0: 0, data: a }), null);
});

test('short and empty recordings', async () => {
  const d = L.makeDemo(1, 4, 'rest');
  const A = await L.analyze(d.raw, { age: 40, rr: d.rr, acc: d.acc });
  assert.ok(A.rmssd > 0 && A.breath, '1-minute reading analysed');
  await assert.rejects(L.analyze(new Int32Array(130 * 10), {}), /shorter than 30 seconds/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';
const L = load();
const base = async () => { const d = L.makeDemo(5, 7, 'rest'); return L.analyze(d.raw, { age: 45, rr: d.rr, acc: d.acc }); };

test('J-point uses the -100..200 µV normal range', async () => {
  const A = await base(), R = L.refsFor(45, 'M', 'rest', 'lying'), meta = { ctx: 'rest', pos: 'lying', gap: 0 };
  assert.equal(L.gradeAll({ ...A, jAmp: -81 }, meta, R).j.g, 'norm');
  assert.equal(L.gradeAll({ ...A, jAmp: -120 }, meta, R).j.g, 'bord');
  assert.equal(L.gradeAll({ ...A, jAmp: -200 }, meta, R).j.g, 'out');
});

test('a single borderline value does not make the overall verdict borderline', async () => {
  const A = await base(), R = L.refsFor(45, 'M', 'rest', 'lying'), meta = { ctx: 'rest', pos: 'lying', gap: 0 };
  const V1 = L.overallVerdict(L.gradeAll({ ...A, jAmp: -120 }, meta, R));
  assert.notEqual(V1.g, 'bord');
  const V2 = L.overallVerdict(L.gradeAll({ ...A, jAmp: -120, qrs: 110 }, meta, R));
  assert.equal(V2.g, 'bord');
});

test('QTc limits depend on sex', async () => {
  const A = await base(), meta = { ctx: 'rest', pos: 'lying', gap: 0 };
  assert.equal(L.gradeAll({ ...A, qtc: 445 }, meta, L.refsFor(50, 'M', 'rest', 'lying')).qtc.g, 'bord');
  assert.equal(L.gradeAll({ ...A, qtc: 445 }, meta, L.refsFor(50, 'F', 'rest', 'lying')).qtc.g, 'norm');
  const g = L.gradeAll({ ...A, qtc: 520 }, meta, L.refsFor(50, 'F', 'rest', 'lying')).qtc;
  assert.equal(g.g, 'out'); assert.ok(g.urgent);
});

test('HRV is not graded during training or meditation', async () => {
  const A = await base();
  assert.equal(L.gradeAll(A, { ctx: 'training', pos: 'walking' }, L.refsFor(40, 'M', 'training', 'walking')).rmssd.g, 'na');
  assert.equal(L.gradeAll(A, { ctx: 'meditation', pos: 'seated' }, L.refsFor(40, 'M', 'meditation', 'seated')).rmssd.g, 'na');
});

test('report escapes user-supplied text', async () => {
  const A = await base();
  const html = L.renderReport(A, { start: Date.now(), ctx: 'rest', pos: 'lying', notes: '<img src=x onerror=alert(1)>', device: '<b>x</b>', battery: '<script>' },
    { name: '<svg onload=alert(1)>', sex: 'M', dob: '1985-01-01' }, []);
  assert.ok(!/<img src=x/.test(html) && !/<svg onload/.test(html) && !/<b>x<\/b>/.test(html) && !/battery <script>/.test(html));
});

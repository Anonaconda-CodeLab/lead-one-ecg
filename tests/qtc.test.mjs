// QTc is graded (Bazett) only on steady stretches at 50-100 bpm; at exercise rates it is shown without a grade or range
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';
const L = load();

/* beat-level stand-in for an analysis: segments of [seconds, bpm, QT ms]; every beat has a measured T wave */
function synth(segs) {
  const t = [0], rr = [NaN], qtcPts = []; let tc = 0;
  for (const [sec, bpm, qt] of segs) { const r = 60000 / bpm, end = tc + sec; while (tc + r / 1000 <= end + 1e-9) { tc += r / 1000; t.push(tc); rr.push(r); qtcPts.push({ t: tc, rr: r, qt, qtc: qt / Math.sqrt(r / 1000), qtcF: qt / Math.cbrt(r / 1000) }); } }
  const n = t.length;
  return { beats: n, t, rr, rrOk: new Uint8Array(n).fill(1).map((v, i) => i ? 1 : 0), ect: new Uint8Array(n), dur: tc, qtcPts, qtc: NaN, qtcF: NaN, meanHR: NaN };
}
const R = L.refsFor(45, 'M', 'rest', 'seated');
// gradeAll needs a whole analysis: grade the synthetic window's result on top of a demo recording
const demo = await (async () => { const d = L.makeDemo(5, 7, 'rest'); return L.analyze(d.raw, { age: 45, rr: d.rr, acc: d.acc }); })();
const gradeQS = (QS, qtc, ctx = 'rest') => L.gradeAll({ ...demo, qtc, qtcSteady: QS }, { ctx, pos: 'seated', gap: 0 }, R).qtc;
const grade = (A, ctx) => { const QS = L.qtcSteady(A, ctx !== 'training'); return { QS, G: gradeQS(QS, A.qtcPts[0].qtc, ctx) }; };

test('resting QT 480 ms at RR 1.0 s is prolonged (both corrections agree at 60 bpm)', () => {
  const { QS, G } = grade(synth([[300, 60, 480]]), 'rest');
  assert.equal(Math.round(QS.qtc), 480); assert.equal(Math.round(QS.qtcF), 480);
  assert.equal(G.g, 'out');
});

test('5 min at 88 bpm with QT 400 ms is graded through the steady window, and is prolonged (Bazett about 484)', () => {
  const { QS, G } = grade(synth([[300, 88, 400]]), 'training');
  assert.ok(QS && QS.sec >= 60 && QS.sec <= 160, `strict: only time after 150 s of settling counts (${QS && QS.sec} s)`);
  assert.ok(Math.abs(QS.qtc - 484) <= 2, String(QS.qtc));
  assert.equal(G.g, 'out');
});

test('5 min at 75 bpm with QT 360 ms is within the normal range', () => {
  const { QS, G } = grade(synth([[300, 75, 360]]), 'training');
  assert.ok(Math.abs(QS.qtc - 402) <= 2, String(QS.qtc));
  assert.equal(G.g, 'norm');
});

test('30 s at 88 bpm after 20 min at 150 bpm is not assessed: too short and not settled', () => {
  for (const ctx of ['training', 'rest']) {
    const { QS, G } = grade(synth([[1200, 150, 260], [30, 88, 400]]), ctx);
    assert.equal(QS, null, ctx); assert.equal(G.g, 'na'); assert.ok(G.rate, ctx);
  }
});

test('cool-down: the first 150 s below 100 bpm do not count, later steady minutes do', () => {
  const A = synth([[900, 150, 260], [120, 95, 330], [240, 80, 380]]);
  const QS = L.qtcSteady(A, false);
  assert.ok(QS, 'graded once settled');
  assert.ok(QS.spans[0].t0 >= 900 + 150 - 6, `first graded second ${QS.spans[0].t0}`);
});

test('a resting recording counts as settled from its start; training must settle within the recording', () => {
  const A = synth([[120, 62, 400]]);
  assert.ok(L.qtcSteady(A, true), 'rest: 2 minutes graded');
  assert.equal(L.qtcSteady(A, false), null, 'training: 2 minutes is too short to settle');
});

test('the steady stretch needs enough measurable T waves', () => {
  const A = synth([[300, 60, 400]]); A.qtcPts = A.qtcPts.filter((p, i) => i % 20 === 0);
  const QS = L.qtcSteady(A, true); assert.ok(QS.few);
  const G = gradeQS(QS, 400);
  assert.equal(G.g, 'na'); assert.ok(!G.rate);
});

test('report: an ungraded QTc shows no reference range, no grade and says why; the summary says so too', async () => {
  const d = L.makeDemo(20, 7, 'training');
  const A = await L.analyze(d.raw, { age: 35, rr: d.rr, acc: d.acc });
  const meta = { id: 't', start: Date.UTC(2026, 9, 30, 0, 27), ctx: 'training', pos: 'walking', trainType: 'session', recovery: 'active', gap: 0 };
  const html = L.renderReport({ ...A, qtcSteady: null }, meta, { sex: 'M', dob: '1981-01-01' }, []);
  const row = html.match(/QTc \(Bazett\)<span[\s\S]*?<\/tr>/)[0], rowF = html.match(/QTc \(Fridericia\)<span[\s\S]*?<\/tr>/)[0];
  assert.ok(row.includes('n/a at this rate') && rowF.includes('n/a at this rate'), 'range replaced in both rows');
  assert.ok(!/350 – 430/.test(row + rowF), 'no range printed beside the values');
  assert.ok(row.includes('Not assessed (rate)'));
  assert.ok(html.includes('heart-rate corrections aren’t reliable'), 'reason given');
  assert.ok(html.includes('QTc (Bazett) over time'), 'trend chart says which correction it plots');
  assert.ok(L.summary().includes('QTc not assessed (rate)'), 'results summary');
});

test('report: a graded QTc shows the graded Bazett value next to the range, Fridericia as secondary', async () => {
  const d = L.makeDemo(7, 7, 'rest');
  const A = await L.analyze(d.raw, { age: 45, rr: d.rr, acc: d.acc });
  const meta = { id: 'r', start: Date.UTC(2026, 9, 29, 23, 18), ctx: 'morning', pos: 'seated', gap: 0 };
  const html = L.renderReport(A, meta, { sex: 'M', dob: '1981-01-01' }, []);
  const V = L.ctxView(A, 'morning'); assert.ok(V.qtcSteady && isFinite(V.qtcSteady.qtc), 'steady stretch found');
  const row = html.match(/QTc \(Bazett\)<span[\s\S]*?<\/tr>/)[0], rowF = html.match(/QTc \(Fridericia\)<span[\s\S]*?<\/tr>/)[0];
  assert.ok(row.includes('>' + Math.round(V.qtcSteady.qtc) + '<') && row.includes('350 – 430'), 'graded value beside the range');
  assert.ok(rowF.includes('not graded') && !rowF.includes('350 – 430'), 'Fridericia secondary, no range');
});

test('ECG strips print no heart rate over an interval that starts at an ectopic beat', async () => {
  const d = L.makeDemo(46, 7, 'rest'), A = await L.analyze(d.raw, { age: 45, rr: d.rr, acc: d.acc });
  const k = Array.from(A.ect).findIndex((v, i) => v && i + 1 < A.beats && !A.ect[i + 1]); assert.ok(k > 0, 'demo has an ectopic beat');
  const svg = L.stripSvg(A, A.r[k] - 3 * A.fs), x = (5 + (A.r[k + 1] - (A.r[k] - 3 * A.fs)) / A.fs * 25 * (175 / 180)).toFixed(2);
  assert.ok(!svg.includes(`<text x="${x}" y="3.3"`), 'beat after the ectopic has no rate label');
  const x0 = (5 + (A.r[k - 1] - (A.r[k] - 3 * A.fs)) / A.fs * 25 * (175 / 180)).toFixed(2);
  assert.ok(svg.includes(`<text x="${x0}" y="3.3"`), 'ordinary beats keep theirs');
});

test('LTHR: a heart rate still climbing over the last 5 minutes is flagged, a levelled-off one is not', () => {
  const mk = rise => { const t = [0], rr = [NaN]; let tc = 0;
    while (tc < 1860) { const hr = tc < 1500 ? 158 : 158 + rise * (tc - 1500) / 60; tc += 60 / hr; t.push(tc); rr.push(60000 / hr); }
    const n = t.length; return { beats: n, t, rr, rrOk: new Uint8Array(n).fill(1), ect: new Uint8Array(n), dur: tc }; };
  const up = L.lthrTest(mk(2), { end: 1800 }), flat = L.lthrTest(mk(0), { end: 1800 });
  assert.ok(up.noPlateau && Math.abs(up.slope5 - 2) < 0.2, `rising ${up.slope5}`);
  assert.ok(!flat.noPlateau && Math.abs(flat.slope5) < 0.2, `flat ${flat.slope5}`);
  assert.ok(up.valid, 'the threshold is still set');
});

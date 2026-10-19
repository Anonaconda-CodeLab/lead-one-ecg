/* ===== {{APP_NAME}} · report renderer (A4, SVG charts in mm) =====
   Copyright (C) 2026 Anonaconda Code Lab
   SPDX-License-Identifier: GPL-3.0-or-later
*/
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (v, d = 0) => (v == null || !isFinite(v)) ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
let _uid = 0; const uid = p => p + (++_uid);

function niceTicks(lo, hi, count = 5) {
  const span = hi - lo || 1, raw = span / count, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= count) || 10 * mag;
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}
function timeTicks(startMs, dur) {
  const steps = [60, 120, 300, 600, 900, 1800, 3600, 7200];
  const step = steps.find(s => dur / s <= 8) || 7200;
  const t0 = startMs / 1000, out = [];
  for (let a = Math.ceil(t0 / step) * step; a <= t0 + dur; a += step) out.push(a - t0);
  return out;
}

/* generic time-series frame */
function frame({ W, H, padL = 10, padR = 4, padT = 3, padB = 6, x0, x1, y0, y1, yTicks, yFmt = v => v, startMs, xLabel = true }) {
  const iw = W - padL - padR, ih = H - padT - padB;
  const X = v => padL + (v - x0) / (x1 - x0) * iw, Y = v => padT + ih - (v - y0) / (y1 - y0) * ih;
  let g = '';
  for (const v of yTicks) {
    g += `<line x1="${padL}" x2="${W - padR}" y1="${Y(v).toFixed(2)}" y2="${Y(v).toFixed(2)}" stroke="var(--p-line)" stroke-width="0.2"/>`;
    g += `<text x="${padL - 1.4}" y="${(Y(v) + 0.9).toFixed(2)}" text-anchor="end" font-size="2.3" fill="var(--p-muted)" font-family="var(--f-mono)">${yFmt(v)}</text>`;
  }
  if (xLabel) for (const t of timeTicks(startMs, x1)) {
    if (t < x0) continue;
    const lab = new Date(startMs + t * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    g += `<line x1="${X(t).toFixed(2)}" x2="${X(t).toFixed(2)}" y1="${padT}" y2="${H - padB + 0.8}" stroke="var(--p-line)" stroke-width="0.2"/>`;
    g += `<text x="${X(t).toFixed(2)}" y="${H - padB + 3.4}" text-anchor="middle" font-size="2.3" fill="var(--p-muted)" font-family="var(--f-mono)">${lab}</text>`;
  }
  g += `<line x1="${padL}" x2="${W - padR}" y1="${padT + ih}" y2="${padT + ih}" stroke="var(--p-ink)" stroke-width="0.25"/>`;
  return { g, X, Y, iw, ih, padL, padT, padR, padB };
}

/* range bar for measurement rows */
function rangeBar(v, lo, hi, opts = {}) {
  const W = 44, H = 5;
  if (v == null || !isFinite(v) || lo == null) return `<svg viewBox="0 0 ${W} ${H}" width="44mm" height="5mm"><line x1="1" x2="${W - 1}" y1="2.5" y2="2.5" stroke="var(--p-line)" stroke-width="0.6" stroke-linecap="round"/></svg>`;
  const span = hi - lo || 1; let d0 = lo - 0.6 * span, d1 = hi + 0.6 * span;
  if (opts.floor0 !== false) d0 = Math.max(0, d0);
  if (opts.max != null) d1 = Math.min(opts.max, d1);
  d0 = Math.min(d0, v - 0.05 * span); d1 = Math.max(d1, v + 0.05 * span);
  const X = q => 1 + (q - d0) / (d1 - d0) * (W - 2), inR = v >= lo && v <= hi;
  return `<svg viewBox="0 0 ${W} ${H}" width="44mm" height="5mm" aria-hidden="true">
    <line x1="1" x2="${W - 1}" y1="2.5" y2="2.5" stroke="var(--p-line)" stroke-width="0.9" stroke-linecap="round"/>
    <line x1="${X(lo).toFixed(2)}" x2="${X(hi).toFixed(2)}" y1="2.5" y2="2.5" stroke="var(--p-ok-soft)" stroke-width="2.6"/>
    <line x1="${X(lo).toFixed(2)}" x2="${X(lo).toFixed(2)}" y1="1" y2="4" stroke="var(--p-ok)" stroke-width="0.25"/>
    <line x1="${X(hi).toFixed(2)}" x2="${X(hi).toFixed(2)}" y1="1" y2="4" stroke="var(--p-ok)" stroke-width="0.25"/>
    <circle cx="${X(v).toFixed(2)}" cy="2.5" r="1.45" fill="${opts.col || (inR ? 'var(--p-ok)' : 'var(--p-warn)')}" stroke="var(--p-bg)" stroke-width="0.5"/></svg>`;
}
function status(v, lo, hi) { if (v == null || !isFinite(v) || lo == null) return 'info'; return v < lo ? 'low' : v > hi ? 'high' : 'in'; }
function chip(st, txt) { const c = st === 'in' ? 'in' : st === 'info' ? 'info' : 'out'; return `<span class="chip ${c}">${esc(txt || (st === 'in' ? 'Within range' : st === 'low' ? 'Below range' : st === 'high' ? 'Above range' : '—'))}</span>`; }

/* ---------- charts ---------- */
function hrChart(A, startMs, pauses = [], recEnd = null) {
  const W = 186, H = 66, tr = A.hrTrend; if (!tr.length) return '';
  const lo = Math.min(...tr.map(p => p.min)), hi = Math.max(...tr.map(p => p.max));
  const y0 = Math.max(0, Math.floor((lo - 8) / 10) * 10), y1 = Math.ceil((hi + 8) / 10) * 10;
  const F = frame({ W, H, x0: 0, x1: A.dur, y0, y1, yTicks: niceTicks(y0, y1, 5), startMs });
  let s = '';
  // zone bands within domain
  const zc = ['', 'var(--p-teal-soft)', 'var(--p-ok-soft)', 'var(--p-warn-soft)', 'var(--p-accent-soft)'];
  A.zones.forEach((z, i) => {
    if (!i) return; const a = Math.max(y0, z.bpmLo), b = Math.min(y1, i === 4 ? y1 : z.bpmHi); if (b <= a) return;
    s += `<rect x="${F.padL}" width="${F.iw}" y="${F.Y(b).toFixed(2)}" height="${(F.Y(a) - F.Y(b)).toFixed(2)}" fill="${zc[i]}" opacity=".7"/>`;
    s += `<text x="${W - F.padR - 1}" y="${(F.Y(b) + 2.6).toFixed(2)}" text-anchor="end" font-size="2.1" fill="var(--p-muted)">${z.name} zone</text>`;
  });
  for (const p of pauses) if (p.t1 > p.t0) { const xa = F.X(p.t0), xb = F.X(p.t1); s += `<rect x="${xa.toFixed(2)}" y="${F.padT}" width="${Math.max(0.4, xb - xa).toFixed(2)}" height="${F.ih}" fill="var(--p-soft)"/><text x="${((xa + xb) / 2).toFixed(2)}" y="${F.padT + 3}" text-anchor="middle" font-size="2" fill="var(--p-muted)">Paused</text>`; }
  if (recEnd != null) s += `<line x1="${F.X(recEnd).toFixed(2)}" x2="${F.X(recEnd).toFixed(2)}" y1="${F.padT}" y2="${F.padT + F.ih}" stroke="var(--p-teal)" stroke-width="0.35" stroke-dasharray="1.2 0.8"/><text x="${(F.X(recEnd) + 1).toFixed(2)}" y="${F.padT + 2.4}" font-size="2.1" fill="var(--p-teal)" font-weight="600">Recovery</text>`;
  // min-max band
  let band = '', line = '';
  tr.forEach((p, i) => { band += (i ? 'L' : 'M') + F.X(p.t).toFixed(2) + ' ' + F.Y(p.max).toFixed(2); });
  for (let i = tr.length - 1; i >= 0; i--) band += 'L' + F.X(tr[i].t).toFixed(2) + ' ' + F.Y(tr[i].min).toFixed(2);
  let prev = null;
  tr.forEach(p => { const gapped = prev && p.t - prev.t > A.hrBin * 2.5; line += (prev && !gapped ? 'L' : 'M') + F.X(p.t).toFixed(2) + ' ' + F.Y(p.hr).toFixed(2); prev = p; });
  s += `<path d="${band}Z" fill="var(--p-accent)" opacity=".13"/>`;
  s += `<path d="${line}" fill="none" stroke="var(--p-accent)" stroke-width="0.45" stroke-linejoin="round"/>`;
  // mean HR reference
  s += `<line x1="${F.padL}" x2="${W - F.padR}" y1="${F.Y(A.meanHR).toFixed(2)}" y2="${F.Y(A.meanHR).toFixed(2)}" stroke="var(--p-ink)" stroke-width="0.2" stroke-dasharray="1 1"/>`;
  s += `<text x="${F.padL + 1}" y="${(F.Y(A.meanHR) - 1).toFixed(2)}" font-size="2.2" fill="var(--p-ink)">Average ${fmt(A.meanHR)} bpm</text>`;
  // extremes
  const mk = (t, v, lab, up) => `<circle cx="${F.X(t).toFixed(2)}" cy="${F.Y(v).toFixed(2)}" r="0.8" fill="var(--p-ink)"/><text x="${F.X(t).toFixed(2)}" y="${(F.Y(v) + (up ? -1.6 : 3.4)).toFixed(2)}" text-anchor="middle" font-size="2.2" font-weight="600" fill="var(--p-ink)">${lab}</text>`;
  s += mk(A.maxHR.t, Math.min(y1, A.maxHR.v), 'Max ' + fmt(A.maxHR.v), true) + mk(A.minHR.t, Math.max(y0, A.minHR.v), 'Min ' + fmt(A.minHR.v), false);
  // ectopic events
  for (const e of A.events) s += `<path d="M${F.X(e.time).toFixed(2)} ${(F.padT + F.ih).toFixed(2)}l-0.9 -1.6h1.8z" fill="var(--p-warn)"/>`;
  for (const p of A.pauses) s += `<path d="M${F.X(p.time).toFixed(2)} ${(F.padT + F.ih).toFixed(2)}l-0.9 -1.6h1.8z" fill="var(--p-accent)"/>`;
  s += `<text x="1" y="${F.padT + 1}" font-size="2.2" fill="var(--p-muted)" transform="rotate(-90 1 ${F.padT + 1})" text-anchor="end">bpm</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Heart rate over time">${F.g}${s}</svg>`;
}
function zoneBar(A) {
  const W = 186, H = 13, tot = A.zones.reduce((a, z) => a + z.sec, 0) || 1;
  const cols = ['var(--p-faint)', 'var(--p-teal)', 'var(--p-ok)', 'var(--p-warn)', 'var(--p-accent)'];
  let x = 0, s = '', lab = '';
  A.zones.forEach((z, i) => {
    const w = z.sec / tot * W; if (w > 0) s += `<rect x="${x.toFixed(2)}" y="0" width="${Math.max(0.4, w).toFixed(2)}" height="3.2" fill="${cols[i]}"/>`; x += w;
    const lx = i * (W / 5);
    lab += `<rect x="${lx}" y="6" width="2.4" height="2.4" rx=".4" fill="${cols[i]}"/><text x="${lx + 3.4}" y="8.1" font-size="2.3" fill="var(--p-ink)" font-weight="600">${z.name}</text>`;
    lab += `<text x="${lx + 3.4}" y="11.6" font-size="2.1" fill="var(--p-muted)" font-family="var(--f-mono)">${i === 0 ? '<' + z.bpmHi : i === 4 ? '≥' + z.bpmLo : z.bpmLo + '–' + z.bpmHi} bpm · ${durShort(z.sec)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Time in heart-rate zones"><rect x="0" y="0" width="${W}" height="3.2" rx="1" fill="var(--p-soft)"/>${s}${lab}</svg>`;
}
function hrHistogram(A) {
  const W = 186, H = 40, vals = [];
  for (let k = 1; k < A.beats; k++) if (A.nn[k]) vals.push(60000 / A.rr[k]);
  if (!vals.length) return '';
  const lo = Math.floor(Math.min(...vals) / 2) * 2, hi = Math.ceil(Math.max(...vals) / 2) * 2 + 2, nb = (hi - lo) / 2;
  const cnt = new Array(nb).fill(0); for (const v of vals) cnt[Math.min(nb - 1, Math.floor((v - lo) / 2))]++;
  const mx = Math.max(...cnt), padL = 10, padB = 6, padT = 2, iw = W - padL - 4, ih = H - padB - padT, bw = iw / nb;
  let s = '';
  for (const t of niceTicks(0, 100 * mx / vals.length, 3)) { const y = padT + ih - t / (100 * mx / vals.length) * ih; s += `<line x1="${padL}" x2="${W - 4}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}" stroke="var(--p-line)" stroke-width="0.2"/><text x="${padL - 1.4}" y="${(y + 0.8).toFixed(2)}" text-anchor="end" font-size="2.2" fill="var(--p-muted)" font-family="var(--f-mono)">${t}%</text>`; }
  cnt.forEach((c, i) => {
    const bpm = lo + i * 2, h = c / mx * ih, col = bpm < 50 ? 'var(--p-teal)' : bpm >= 100 ? 'var(--p-warn)' : 'var(--p-accent)';
    s += `<rect x="${(padL + i * bw + 0.15).toFixed(2)}" y="${(padT + ih - h).toFixed(2)}" width="${Math.max(0.3, bw - 0.3).toFixed(2)}" height="${h.toFixed(2)}" fill="${col}" opacity=".85"/>`;
    if (i % Math.ceil(nb / 14) === 0) s += `<text x="${(padL + i * bw).toFixed(2)}" y="${H - 2.4}" text-anchor="middle" font-size="2.2" fill="var(--p-muted)" font-family="var(--f-mono)">${bpm}</text>`;
  });
  s += `<line x1="${padL}" x2="${W - 4}" y1="${padT + ih}" y2="${padT + ih}" stroke="var(--p-ink)" stroke-width="0.25"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Heart rate distribution">${s}</svg>`;
}
function durShort(sec) { if (sec < 60) return Math.round(sec) + ' s'; const m = Math.round(sec / 60); return m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min'; }

function hrvChart(A, startMs, ref) {
  const W = 186, H = 38, w = A.hrvWin; if (!w.length) return '<p class="cap">Not enough clean beats to chart HRV over time.</p>';
  const vals = w.map(p => p.rmssd), y1 = Math.max(ref ? ref[1] * 1.25 : 0, Math.ceil(Math.max(...vals) / 10) * 10 + 10);
  const F = frame({ W, H, x0: 0, x1: A.dur, y0: 0, y1, yTicks: niceTicks(0, y1, 4), startMs });
  let s = ref ? `<rect x="${F.padL}" width="${F.iw}" y="${F.Y(ref[1]).toFixed(2)}" height="${(F.Y(ref[0]) - F.Y(ref[1])).toFixed(2)}" fill="var(--p-ok-soft)" opacity=".8"/><text x="${W - F.padR - 1}" y="${(F.Y(ref[1]) + 2.6).toFixed(2)}" text-anchor="end" font-size="2.1" fill="var(--p-ok)">Reference ${ref[0]}–${ref[1]} ms</text>` : '';
  // pNN50 bars (secondary, scaled 0-100 to full height)
  for (const p of w) { const x = F.X(p.t0), x2 = F.X(p.t1), h = p.pnn50 / 100 * F.ih; s += `<rect x="${(x + 0.15).toFixed(2)}" width="${Math.max(0.2, x2 - x - 0.3).toFixed(2)}" y="${(F.padT + F.ih - h).toFixed(2)}" height="${h.toFixed(2)}" fill="var(--p-teal)" opacity=".22"/>`; }
  let d = '', prev = null;
  for (const p of w) { const gap = prev && p.t0 - prev.t1 > 1; d += (prev && !gap ? 'L' + F.X(p.t0).toFixed(2) + ' ' + F.Y(p.rmssd).toFixed(2) : 'M' + F.X(p.t0).toFixed(2) + ' ' + F.Y(p.rmssd).toFixed(2)) + 'L' + F.X(p.t1).toFixed(2) + ' ' + F.Y(p.rmssd).toFixed(2); prev = p; }
  s += `<path d="${d}" fill="none" stroke="var(--p-teal)" stroke-width="0.55" stroke-linejoin="round"/>`;
  s += `<text x="${W - 0.5}" y="${F.padT + 1}" font-size="2.1" fill="var(--p-muted)" text-anchor="end">pNN50 bars: 0–100 %</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="HRV over time">${F.g}${s}</svg>`;
}
function gauge(v, ref) {
  const W = 62, H = 38, cx = 31, cy = 32, R = 25, max = 100, vv = Math.max(0, Math.min(max, v || 0));
  const ang = q => Math.PI * (1 - q / max), P = (q, r) => [cx + r * Math.cos(ang(q)), cy - r * Math.sin(ang(q))];
  const arc = (a, b, col) => { const [x0, y0] = P(a, R), [x1, y1] = P(b, R); return `<path d="M${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}" fill="none" stroke="${col}" stroke-width="5.2"/>`; };
  let s = arc(0, ref[0], 'var(--p-warn-soft)') + arc(ref[0], ref[1], 'var(--p-ok)') + arc(ref[1], max, 'var(--p-teal-soft)');
  for (const q of [0, 20, 40, 60, 80, 100]) { const [x, y] = P(q, R + 4.6); s += `<text x="${x.toFixed(2)}" y="${(y + 0.8).toFixed(2)}" text-anchor="middle" font-size="2.1" fill="var(--p-muted)" font-family="var(--f-mono)">${q}</text>`; }
  const [ax, ay] = P(vv, R - 6.5), [bx, by] = P(vv, R + 2.8);
  s += `<line x1="${ax.toFixed(2)}" y1="${ay.toFixed(2)}" x2="${bx.toFixed(2)}" y2="${by.toFixed(2)}" stroke="var(--p-ink)" stroke-width="1.1" stroke-linecap="round"/>`;
  s += `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="10" font-weight="500" font-family="var(--f-mono)" fill="var(--p-ink)">${fmt(v)}</text>`;
  s += `<text x="${cx}" y="${cy + 2}" text-anchor="middle" font-size="2.3" fill="var(--p-muted)">ms RMSSD</text>`;
  s += `<text x="${cx - R}" y="${cy + 4.6}" text-anchor="middle" font-size="2.1" fill="var(--p-warn)">Sympathetic</text><text x="${cx + R}" y="${cy + 4.6}" text-anchor="middle" font-size="2.1" fill="var(--p-teal)">Parasympathetic</text>`;
  return `<svg viewBox="0 0 ${W} ${H + 3}" role="img" aria-label="HRV gauge">${s}</svg>`;
}
function scatter({ pts, xr, yr, xLab, yLab, W = 88, H = 57, identity = false, ellipse = null, band = null }) {
  const padL = 11, padB = 8, padT = 2, padR = 2, iw = W - padL - padR, ih = H - padT - padB;
  const X = v => padL + (v - xr[0]) / (xr[1] - xr[0]) * iw, Y = v => padT + ih - (v - yr[0]) / (yr[1] - yr[0]) * ih;
  let s = `<rect x="${padL}" y="${padT}" width="${iw}" height="${ih}" fill="var(--p-bg)" stroke="var(--p-line)" stroke-width="0.2"/>`;
  if (band) s += `<rect x="${padL}" width="${iw}" y="${Y(band[1]).toFixed(2)}" height="${(Y(band[0]) - Y(band[1])).toFixed(2)}" fill="var(--p-ok-soft)" opacity=".7"/>`;
  for (const v of niceTicks(xr[0], xr[1], 5)) s += `<line x1="${X(v).toFixed(2)}" x2="${X(v).toFixed(2)}" y1="${padT}" y2="${padT + ih}" stroke="var(--p-line)" stroke-width="0.15"/><text x="${X(v).toFixed(2)}" y="${padT + ih + 3}" font-size="2.1" text-anchor="middle" fill="var(--p-muted)" font-family="var(--f-mono)">${fmt(v)}</text>`;
  for (const v of niceTicks(yr[0], yr[1], 5)) s += `<line x1="${padL}" x2="${padL + iw}" y1="${Y(v).toFixed(2)}" y2="${Y(v).toFixed(2)}" stroke="var(--p-line)" stroke-width="0.15"/><text x="${padL - 1.2}" y="${(Y(v) + 0.8).toFixed(2)}" font-size="2.1" text-anchor="end" fill="var(--p-muted)" font-family="var(--f-mono)">${fmt(v)}</text>`;
  if (identity) s += `<line x1="${X(Math.max(xr[0], yr[0]))}" y1="${Y(Math.max(xr[0], yr[0]))}" x2="${X(Math.min(xr[1], yr[1]))}" y2="${Y(Math.min(xr[1], yr[1]))}" stroke="var(--p-faint)" stroke-width="0.2" stroke-dasharray="1 1"/>`;
  const cid = uid('c');
  s += `<clipPath id="${cid}"><rect x="${padL}" y="${padT}" width="${iw}" height="${ih}"/></clipPath><g clip-path="url(#${cid})">`;
  for (const p of pts) s += `<circle cx="${X(p[0]).toFixed(2)}" cy="${Y(p[1]).toFixed(2)}" r="${p[2] ? 0.6 : 0.32}" fill="${p[2] ? 'var(--p-warn)' : 'var(--p-teal)'}" opacity="${p[2] ? 1 : 0.35}"/>`;
  if (ellipse) { const { cx, cy, sd1, sd2 } = ellipse; const sx = iw / (xr[1] - xr[0]); s += `<ellipse cx="${X(cx).toFixed(2)}" cy="${Y(cy).toFixed(2)}" rx="${(sd2 * 2 * sx).toFixed(2)}" ry="${(sd1 * 2 * sx).toFixed(2)}" transform="rotate(-45 ${X(cx).toFixed(2)} ${Y(cy).toFixed(2)})" fill="none" stroke="var(--p-ink)" stroke-width="0.35"/>`; }
  s += '</g>';
  s += `<text x="${padL + iw / 2}" y="${H - 1}" font-size="2.3" text-anchor="middle" fill="var(--p-ink)">${xLab}</text>`;
  s += `<text x="2" y="${padT + ih / 2}" font-size="2.3" text-anchor="middle" fill="var(--p-ink)" transform="rotate(-90 2 ${padT + ih / 2})">${yLab}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(xLab)} vs ${esc(yLab)}">${s}</svg>`;
}
function thin(arr, max) { if (arr.length <= max) return arr; const out = [], st = arr.length / max; for (let f = 0; f < arr.length; f += st) out.push(arr[Math.floor(f)]); return out; }
function poincareRR(A) {
  const pts = [], vals = [];
  for (let k = 2; k < A.beats; k++) if (A.rrOk[k] && A.rrOk[k - 1]) { const e = A.ect[k] || A.ect[k - 1] || A.ect[k - 2]; pts.push([A.rr[k - 1], A.rr[k], e ? 1 : 0]); vals.push(A.rr[k]); }
  const normal = thin(pts.filter(p => !p[2]), 3500), ect = pts.filter(p => p[2]);
  const lo = Math.floor((Math.min(...vals) - 100) / 200) * 200, hi = Math.ceil((Math.max(...vals) + 100) / 200) * 200;
  return scatter({ pts: normal.concat(ect), xr: [Math.max(200, lo), hi], yr: [Math.max(200, lo), hi], xLab: 'RR interval n (ms)', yLab: 'RR interval n+1 (ms)', identity: true, ellipse: { cx: A.meanNN, cy: A.meanNN, sd1: A.sd1, sd2: A.sd2 } });
}
function qtcChart(A, startMs, q = [340, 470]) {
  const W = 186, H = 40, pts = thin(A.qtcPts, 2500); if (!pts.length) return '<p class="cap">QTc could not be measured reliably in this recording.</p>';
  const F = frame({ W, H, x0: 0, x1: A.dur, y0: 300, y1: 560, yTicks: [300, 350, 400, 450, 500, 550], startMs });
  let s = `<rect x="${F.padL}" width="${F.iw}" y="${F.Y(q[1]).toFixed(2)}" height="${(F.Y(q[0]) - F.Y(q[1])).toFixed(2)}" fill="var(--p-ok-soft)" opacity=".6"/>`;
  s += `<line x1="${F.padL}" x2="${W - F.padR}" y1="${F.Y(q[1])}" y2="${F.Y(q[1])}" stroke="var(--p-ok)" stroke-width="0.25" stroke-dasharray="1.2 0.8"/><text x="${W - F.padR - 1}" y="${F.Y(q[1]) - 1}" text-anchor="end" font-size="2.1" fill="var(--p-ok)">${q[1]} ms</text>`;
  const cid = uid('q'); s += `<clipPath id="${cid}"><rect x="${F.padL}" y="${F.padT}" width="${F.iw}" height="${F.ih}"/></clipPath><g clip-path="url(#${cid})">`;
  for (const p of pts) s += `<circle cx="${F.X(p.t).toFixed(2)}" cy="${F.Y(p.qtc).toFixed(2)}" r="0.3" fill="var(--p-accent)" opacity=".28"/>`;
  let d = '', prev = null; for (const p of A.qtcTrend) { d += (prev && p.t - prev.t < 700 ? 'L' : 'M') + F.X(p.t).toFixed(2) + ' ' + F.Y(p.med).toFixed(2); prev = p; }
  s += `<path d="${d}" fill="none" stroke="var(--p-accent)" stroke-width="0.6"/></g>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="QTc over time">${F.g}${s}</svg>`;
}
function rrQtc(A, q = [340, 470]) {
  const pts = thin(A.qtcPts, 3000).map(p => [p.rr, p.qtc, 0]);
  if (!pts.length) return '';
  const rv = pts.map(p => p[0]); const lo = Math.floor((Math.min(...rv) - 100) / 200) * 200, hi = Math.ceil((Math.max(...rv) + 100) / 200) * 200;
  return scatter({ pts, xr: [Math.max(200, lo), hi], yr: [300, 560], xLab: 'RR interval (ms)', yLab: 'QTc (ms)', band: q });
}
function avgBeatSvg(A) {
  const B = A.avgBeat; if (!B) return '';
  const W = 88, H = 54, tp = B.tp, D = B.D, f = B.fsu, base = D.base, pad = 4;
  const t0 = -B.pre / f, t1 = (tp.length - 1 - B.pre) / f;
  let mn = Infinity, mx = -Infinity; for (const v of tp) { mn = Math.min(mn, v - base); mx = Math.max(mx, v - base); }
  const ylo = Math.min(-300, mn - 100), yhi = mx + 150;
  const X = s => pad + (s / f) / (t1 - t0) * (W - 2 * pad), Y = v => 6 + (yhi - v) / (yhi - ylo) * (H - 20);
  let s = '';
  // ECG paper grid at 40 ms / 100 µV
  for (let tt = Math.ceil(t0 / 0.04) * 0.04; tt <= t1; tt += 0.04) { const x = X(B.pre + tt * f); const big = Math.abs(Math.round(tt / 0.04) % 5) === 0; s += `<line x1="${x.toFixed(2)}" x2="${x.toFixed(2)}" y1="6" y2="${H - 14}" stroke="${big ? 'var(--p-grid-l)' : 'var(--p-grid-s)'}" stroke-width="${big ? 0.22 : 0.12}"/>`; }
  for (let v = Math.ceil(ylo / 100) * 100; v <= yhi; v += 100) { const y = Y(v); const big = v % 500 === 0; s += `<line x1="${pad}" x2="${W - pad}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}" stroke="${big ? 'var(--p-grid-l)' : 'var(--p-grid-s)'}" stroke-width="${big ? 0.22 : 0.12}"/>`; }
  let d = ''; tp.forEach((v, i) => d += (i ? 'L' : 'M') + X(i).toFixed(2) + ' ' + Y(v - base).toFixed(2));
  const abClip = uid('ab');
  s += `<clipPath id="${abClip}"><rect x="${pad}" y="6" width="${W - 2 * pad}" height="${H - 20}"/></clipPath><path d="${d}" fill="none" stroke="var(--p-ink)" stroke-width="0.55" stroke-linejoin="round" clip-path="url(#${abClip})"/>`;
  const mark = (i, lab, col = 'var(--p-accent)') => `<line x1="${X(i).toFixed(2)}" x2="${X(i).toFixed(2)}" y1="6" y2="${H - 14}" stroke="${col}" stroke-width="0.25" stroke-dasharray="0.8 0.6"/><text x="${X(i).toFixed(2)}" y="5" font-size="2.2" text-anchor="middle" fill="${col}" font-weight="600">${lab}</text>`;
  s += mark(D.on, 'Q') + mark(D.R, 'R', 'var(--p-ink)') + mark(D.J, 'J') + mark(D.tpk, 'T', 'var(--p-ink)') + mark(D.tEnd, 'T end');
  const br = (a, b, y, lab) => `<path d="M${X(a).toFixed(2)} ${y - 1}v1H${X(b).toFixed(2)}v-1" fill="none" stroke="var(--p-ink)" stroke-width="0.3"/><text x="${((X(a) + X(b)) / 2).toFixed(2)}" y="${y + 3}" font-size="2.3" text-anchor="middle" fill="var(--p-ink)">${lab}</text>`;
  s += br(D.on, D.J, H - 10.5, D.qrsOk === false ? 'QRS end unclear' : 'QRS ' + fmt(D.qrs) + ' ms') + br(D.on, D.tEnd, H - 4.5, 'QT ' + fmt(D.qt) + ' ms');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Average heartbeat">${s}</svg>`;
}

/* ECG strip (25 mm/s) */
const STRIP_S = 7.2;
function stripSvg(A, startSample, opt = {}) {
  const W = 180, Ht = 34, top = 4.5, gh = 28.5, sig = A.sig, gain = opt.gain || 10;
  const s0 = Math.max(0, Math.min(A.n - Math.round(STRIP_S * A.fs), Math.round(startSample))), s1 = s0 + Math.round(STRIP_S * A.fs);
  const baseY = top + gh * 0.62;
  // local baseline: median of strip
  const seg = []; for (let i = s0; i < s1; i++) seg.push(sig[i]); const med = median(seg);
  const pid = uid('g'), cid = uid('k');
  let s = `<defs><pattern id="${pid}" width="5" height="5" patternUnits="userSpaceOnUse" x="0" y="${(baseY % 5).toFixed(2)}">
    <path d="M1 0V5M2 0V5M3 0V5M4 0V5M0 1H5M0 2H5M0 3H5M0 4H5" stroke="var(--p-grid-s)" stroke-width="0.1"/>
    <path d="M0 0H5M0 0V5" stroke="var(--p-grid-l)" stroke-width="0.22"/></pattern>
    <clipPath id="${cid}"><rect x="0" y="${top}" width="${W}" height="${gh}"/></clipPath></defs>`;
  s += `<rect x="0" y="${top}" width="${W}" height="${gh}" fill="url(#${pid})"/>`;
  // 1 mV calibration pulse
  s += `<path d="M0.6 ${baseY}h1v${-gain}h2.5v${gain}h1" fill="none" stroke="var(--p-ink)" stroke-width="0.3"/>`;
  let d = '';
  for (let i = s0; i < s1; i++) { const x = 5 + (i - s0) / A.fs * 25 * (175 / 180); d += (i > s0 ? 'L' : 'M') + x.toFixed(2) + ' ' + (baseY - (sig[i] - med) / 1000 * gain).toFixed(2); }
  s += `<g clip-path="url(#${cid})"><path d="${d}" fill="none" stroke="var(--p-ink)" stroke-width="0.32" stroke-linejoin="round"/></g>`;
  const X = i => 5 + (i - s0) / A.fs * 25 * (175 / 180);
  // beat labels
  const k0 = lowerBound(A.r, s0), k1 = lowerBound(A.r, s1);
  for (let k = k0; k < k1; k++) {
    const x = X(A.r[k]).toFixed(2);
    if (A.ect[k]) s += `<text x="${x}" y="3.3" text-anchor="middle" font-size="2.4" font-weight="700" fill="var(--p-warn)">E</text>`;
    else if (k > 0 && isFinite(A.rr[k]) && !A.noise[k]) s += `<text x="${x}" y="3.3" text-anchor="middle" font-size="2.2" fill="var(--p-muted)" font-family="var(--f-mono)">${Math.round(60000 / A.rr[k])}</text>`;
    if (k > 0 && A.rrOk[k] && A.rr[k] > 2000 && A.r[k - 1] >= s0) {
      const xa = X(A.r[k - 1]), xb = X(A.r[k]);
      s += `<path d="M${(xa + 1).toFixed(2)} ${top + gh - 1.2}H${(xb - 1).toFixed(2)}" stroke="var(--p-accent)" stroke-width="0.4" marker-end="none"/><rect x="${((xa + xb) / 2 - 5.5).toFixed(2)}" y="${top + gh - 4.6}" width="11" height="3.2" rx="0.6" fill="var(--p-bg)" stroke="var(--p-accent)" stroke-width="0.2"/><text x="${((xa + xb) / 2).toFixed(2)}" y="${top + gh - 2.2}" text-anchor="middle" font-size="2.3" font-weight="600" fill="var(--p-accent)">${(A.rr[k] / 1000).toFixed(2)} s</text>`;
    }
  }
  s += `<text x="${W - 0.5}" y="${top + gh + 3.2}" text-anchor="end" font-size="2" fill="var(--p-faint)" font-family="var(--f-mono)">25 mm/s · ${gain} mm/mV</text>`;
  s += `<text x="0" y="${top + gh + 3.2}" font-size="2" fill="var(--p-faint)" font-family="var(--f-mono)">${opt.startLabel || ''}</text>`;
  return `<svg viewBox="0 0 ${W} ${Ht + 4}" role="img" aria-label="ECG strip">${s}</svg>`;
}


/* ---------- recording context, references, baseline ---------- */
const CTX = {
  morning: { label: 'Morning baseline (on waking)', short: 'Morning baseline', sub: 'on waking', rest: true },
  training: { label: 'Training (during exercise)', short: 'Training', sub: 'during exercise', active: true },
  evening: { label: 'Evening', short: 'Evening', rest: true },
  meditation: { label: 'Meditation / breathing practice', short: 'Meditation', sub: 'breathing practice' },
  sleep: { label: 'Sleep (overnight)', short: 'Sleep', sub: 'overnight', rest: true },
  rest: { label: 'General rest', short: 'General rest', rest: true }
};
const POS = {
  lying: { label: 'Lying (supine)', short: 'Lying' }, seated: { label: 'Seated', short: 'Seated' },
  standing: { label: 'Standing', short: 'Standing' }, walking: { label: 'Walking / moving', short: 'Walking / moving', active: true }
};
function ageAt(dob, ms) {
  if (!dob) return null; const d = new Date(dob + 'T00:00:00'), t = new Date(ms); if (isNaN(d)) return null;
  let a = t.getFullYear() - d.getFullYear(); if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--; return a;
}
/* Population norms (approximate).
   Short-term HRV: Nunan et al. 2010 pooled norms (RMSSD 42 ± 15 ms, SDNN 50 ± 16 ms, supine 5-min), with age decline
   and sex differences approximated from Voss et al. 2015; position factors for seated / standing.
   Grades: below 5th percentile = outside, 5th–15th = borderline, 15th–75th = normal, above 75th = favourable. */
function hrvNorms(age, sex, pos) {
  const a = age || 35;
  const pR = pos === 'standing' ? 0.6 : pos === 'seated' ? 0.85 : 1, pS = pos === 'standing' ? 0.85 : pos === 'seated' ? 0.95 : 1;
  const mR = 42 * Math.exp(-0.017 * (a - 40)) * pR * (sex === 'F' ? 1.05 : 1);
  const mS = 50 * Math.exp(-0.012 * (a - 40)) * pS * (sex === 'F' ? 0.95 : 1);
  const q = (m, sd) => ({ m, p5: m * Math.exp(-1.645 * sd), p15: m * Math.exp(-1.036 * sd), p75: m * Math.exp(0.674 * sd) });
  return { rmssd: q(mR, 0.38), sdnn: q(mS, 0.32) };
}
/* QTc (Bazett) limits after Goldenberg et al. 2006: men ≤430 normal, 431–450 borderline, >450 prolonged;
   women ≤450 normal, 451–470 borderline, >470 prolonged; short QT below 350 / 330 ms. */
function qtcLimits(sex) { return sex === 'M' ? { norm: 430, bord: 450 } : sex === 'F' ? { norm: 450, bord: 470 } : { norm: 440, bord: 460 }; }
function refsFor(age, sex, ctx, pos) {
  const a = age || 35;
  const active = (ctx && CTX[ctx] && CTX[ctx].active) || pos === 'walking';
  const N = hrvNorms(age, sex, pos), Q = qtcLimits(sex);
  const hrv = active ? null : [Math.round(N.rmssd.p15), Math.round(N.rmssd.p75)];
  return {
    active, hrv, norms: N, hrvJudge: !!hrv && ctx !== 'meditation',
    hrvNote: hrv ? `age ${a}${sex ? ', ' + (sex === 'M' ? 'male' : 'female') : ''}${pos ? ', ' + POS[pos].short.toLowerCase() : ''}` : '',
    hr: active ? null : ctx === 'sleep' ? [40, 75] : pos === 'standing' ? [50, 90] : [40, 79],
    qtc: [350, Q.norm], qtcLim: Q, age: a, ageKnown: !!age, sex
  };
}
function computeBaseline(hist, cur) {
  const tr = cur.ctx === 'training';
  if (!cur.ctx || (!cur.pos && !tr)) return { state: 'nocontext' };
  // training is compared by training type and recovery type (body position matters little during exercise)
  const match = tr ? h => h.ctx === 'training' && (h.trainType || 'session') === (cur.trainType || 'session') && (h.recovery || 'active') === (cur.recovery || 'active')
                   : h => h.ctx === cur.ctx && h.pos === cur.pos;
  const prior = hist.filter(h => match(h) && h.id !== cur.id && h.start < cur.start && h.start >= cur.start - 30 * 864e5).sort((a, b) => a.start - b.start).slice(-30);
  const pts = hist.filter(h => match(h) && h.id !== cur.id && h.start < cur.start).sort((a, b) => a.start - b.start).slice(-20).concat([Object.assign({ current: true }, cur)]);
  const B = { n: prior.length, pts, need: Math.max(0, 5 - prior.length) };
  const vals = (k) => prior.map(h => h[k]).filter(v => v != null && isFinite(v));
  const ms = k => { const v = vals(k); return v.length >= 3 ? { m: mean(v), sd: std(v), n: v.length } : null; };
  B.hr = ms('hr'); B.br = ms('br'); B.share = ms('brShare'); B.peak = ms('peak'); B.hrr = ms('hrr60');
  const ln = vals('ln');
  if (ln.length >= 5) {
    const m = mean(ln), sd = Math.max(std(ln), 0.05);
    B.lnMean = m; B.lnSd = sd; B.lo = Math.exp(m - sd); B.hi = Math.exp(m + sd); B.typical = Math.exp(m);
    let streak = 0; for (let i = prior.length - 1; i >= 0; i--) { if (prior[i].ln < m - sd) streak++; else break; }
    B.streak = streak;
    const last7 = prior.slice(-6).map(h => h.ln).concat(isFinite(cur.ln) ? [cur.ln] : []);
    if (prior.length >= 7) B.roll7 = (mean(last7) - m) / sd;
  }
  B.state = prior.length >= 5 ? 'ready' : 'building';
  return B;
}
function commentary(A, meta, R, B, X = null) {
  const ctx = meta.ctx, pos = meta.pos, out = [], f0 = v => fmt(v), name = ctx ? CTX[ctx].short.toLowerCase() : '';
  const where = ctx === 'training' && X ? `${TRAIN_TYPES[X.tt]} · ${X.rec} recovery` : ctx && pos ? `${CTX[ctx].short} · ${POS[pos].short}` : '';
  let verdict = null;
  const brNote = A.breath && A.breath.median < 9 ? ` Breathing averaged ${fmt(A.breath.median, 1)} breaths/min, below the 9/min threshold, so respiratory heart-rate oscillations fall in the LF band; the LF/HF ratio should not be read as autonomic balance for this recording.` : '';
  if (B.state === 'nocontext') {
    out.push('Select a recording context and body position (Details, at the top of the report) to compare this reading with your personal baseline. Comparisons are made only between readings taken under the same conditions.');
    return { verdict, paras: out };
  }
  if (ctx === 'training' && X) {
    const E = X.ER, W = X.WM, L = HRR_LIMITS[X.rec];
    if (E) out.push(`Peak 20-second heart rate was ${f0(E.peak20)} bpm (${f0(100 * E.peak20 / W.v)} % of your working maximum of ${f0(W.v)} bpm${W.src === 'tanaka' ? ', estimated from age' : ''}).${B.peak ? ` Your usual training peak is ${f0(B.peak.m)} bpm.` : ''}`);
    if (X.tt === 'session' || X.tt === 'intervals' || X.tt === 'tempo') out.push('Training sessions, including intervals such as 4 × 4, rarely reach true maximum heart rate: peaks seen in them are a floor, not a ceiling. A ramp test gives a measured value.');
    if (X.tt === 'intervals' && X.iv && X.iv.bouts.length) { const b = X.iv.bouts, rec = b.filter(x => !x.last && isFinite(x.recDrop));
      out.push(`${b.length} hard ${b.length === 1 ? 'effort was' : 'efforts were'} detected, peaking at ${f0(Math.min(...b.map(x => x.peak)))}–${f0(Math.max(...b.map(x => x.peak)))} bpm${rec.length ? `, with heart rate falling ${f0(Math.min(...rec.map(x => x.recDrop)))}–${f0(Math.max(...rec.map(x => x.recDrop)))} bpm in the recoveries between them` : ''}.${isFinite(X.iv.fade) && X.iv.fade >= 5 ? ` Peak heart rate rose ${f0(X.iv.fade)} bpm from the first to the last effort, a common sign of accumulating fatigue (or of pushing harder on later repeats).` : ''}`); }
    if (X.tt === 'tempo' && X.tempo && X.tempo.valid) { const T = X.tempo;
      out.push(`The sustained block lasted ${f0(T.dur / 60)} minutes at an average of ${f0(T.avg)} bpm (${f0(100 * T.avg / X.WM.v)} % of your working maximum). Heart rate drifted ${T.drift >= 0 ? 'up' : 'down'} ${f0(Math.abs(T.drift))} % from the first to the second half${T.drift > 5 ? ', more than the 5 % usually seen at a steady effort; heat, dehydration or fatigue are the common causes' : ', a steady effort'}.`); }
    if (E && E.end != null && isFinite(E.hrr60)) {
      const ok = E.hrr60 > L.out;
      out.push(`Recovery was measured from the end of exercise at ${meta._clock(E.end)} (${E.src === 'marked' ? 'marked with Start recovery' : 'detected automatically'}): heart rate fell from ${f0(E.stop)} to ${f0(E.at60)} bpm in the first minute (${f0(E.hrr60)} bpm)${isFinite(E.hrr120) ? ` and to ${f0(E.at120)} bpm after two minutes (${f0(E.hrr120)} bpm)` : ''}. `
        + (X.rec === 'active' ? `Recovery was active, so it is graded against a relaxed limit of ${L.out} bpm rather than ${HRR_LIMITS.passive.out} bpm for passive recovery. Relative to the recovery floor of ${f0(E.floor)} bpm, ${f0(E.pct60)} % of the total fall happened in the first minute.` : `Recovery was passive (standing or sitting still); a first-minute fall above ${L.out} bpm is expected.`)
        + (B.hrr ? ` Your usual first-minute recovery is ${f0(B.hrr.m)} bpm.` : ''));
      verdict = ok ? ['in', 'Recovery within expected range'] : ['out', 'Slow heart-rate recovery'];
    } else if (E) out.push(E.end == null ? 'Recovery was not measured: the recording ended while you were still exercising, so no recovery flag is raised. To measure it, tap “Start recovery” when you stop and keep recording for two minutes.' : 'Recovery could not be measured because the recording stopped within a minute of finishing.');
    if (W.highMax) out.push(`High-max individual: your recorded maximum is more than 12 % above the Tanaka age estimate (${f0(W.AF.tanaka)} bpm), so age formulas under-read your maximum. Zones in this report use your own data.`);
    if (A.events.length) out.push(`${A.events.length} ectopic ${A.events.length === 1 ? 'event was' : 'events were'} flagged during this session (see the strips). Occasional ectopic beats during exercise are common; frequent or symptomatic ectopic activity during exertion warrants medical review.`);
    out.push('A chest strap provides a single ECG lead. It cannot assess ST-segment changes in the way a clinical exercise stress test does.');
    if (B.state !== 'ready') out.push(`Personal baseline: ${B.n} earlier ${where} reading${B.n === 1 ? '' : 's'} in the past 30 days. Comparisons with your usual values start after ${B.need} more.`);
    return { verdict, paras: out };
  }
  if (ctx === 'meditation') {
    if (A.breath) {
      const sh = A.breathShare;
      out.push(`Breathing averaged ${fmt(A.breath.median, 1)} breaths/min (range ${fmt(A.breath.lo, 1)}–${fmt(A.breath.hi, 1)}). ${isFinite(sh) ? `${f0(sh)} % of heart-rate variability power was concentrated at the breathing frequency${sh >= 60 ? ', indicating strong cardiorespiratory coupling, the pattern sought in slow-paced (resonance) breathing.' : sh >= 35 ? ', indicating moderate coupling between breathing and heart rate.' : '; heart-rate oscillations were only loosely linked to breathing.'}` : ''}`);
      if (B.br && B.share) out.push(`Your usual meditation breathing rate is ${fmt(B.br.m, 1)} breaths/min with ${f0(B.share.m)} % breathing-linked HRV.`);
      verdict = isFinite(sh) ? (sh >= 60 ? ['in', 'Strong breathing–heart coupling'] : ['info', 'Moderate coupling']) : null;
    }
    if (B.state === 'ready') out.push(`RMSSD of ${fmt(A.rmssd, 0)} ms compares with your usual ${f0(B.lo)}–${f0(B.hi)} ms for meditation sessions in this position.`);
    else out.push(`Personal baseline: ${B.n} earlier ${where} reading${B.n === 1 ? '' : 's'} in the past 30 days; comparisons start after ${B.need} more.`);
    out.push('During paced breathing, RMSSD and LF power rise because of the larger breathing-driven oscillation; these values are not comparable with resting readings.');
    return { verdict, paras: out };
  }
  // resting contexts
  if (B.state !== 'ready') {
    out.push(`Personal baseline: ${B.n} of 5 ${where} readings recorded in the past 30 days. Comparisons with your own usual range begin after ${B.need} more. For the most reliable baseline, record at the same time of day, in the same position, for the same duration.`);
    if (brNote) out.push(brNote.trim());
    return { verdict, paras: out };
  }
  const v = A.rmssd, below = v < B.lo, above = v > B.hi;
  const lead = `RMSSD of ${fmt(v, 0)} ms is ${below ? 'below' : above ? 'above' : 'within'} your usual range for ${where} (${f0(B.lo)}–${f0(B.hi)} ms; typical ${f0(B.typical)} ms, from ${B.n} readings over the past 30 days).`;
  if (below) {
    out.push(lead + ' A reduction of this kind commonly accompanies incomplete recovery from training, short or disturbed sleep, alcohol, acute psychological stress, dehydration, or the early phase of an illness. A single low reading has limited significance; consecutive low readings are more meaningful.');
    if (B.streak >= 1) out.push(`This is the ${ordinal(B.streak + 1)} consecutive reading below your usual range. Consider reducing training intensity and prioritising sleep until values return to range.`);
    verdict = ['out', B.streak >= 1 ? 'Below baseline · consecutive' : 'Below your baseline'];
  } else if (above) {
    out.push(lead + ' Higher-than-usual values typically follow rest days or a lighter training period. If accompanied by an unusually low heart rate and persistent fatigue during a heavy training block, high values can also reflect accumulated training load.');
    verdict = ['in', 'Above your baseline'];
  } else { out.push(lead + ' This indicates an autonomic state consistent with your recent norm.'); verdict = ['in', 'Within your baseline']; }
  if (B.hr) {
    const d = A.meanHR - B.hr.m, thr = Math.max(4, 1.5 * B.hr.sd);
    if (d > thr) out.push(`Mean heart rate of ${f0(A.meanHR)} bpm is ${f0(d)} bpm above your usual ${f0(B.hr.m)} bpm.${below ? ' The combination of reduced HRV and raised heart rate is a stronger indicator of physiological strain than either alone.' : ''}`);
    else if (d < -thr) out.push(`Mean heart rate of ${f0(A.meanHR)} bpm is ${f0(-d)} bpm below your usual ${f0(B.hr.m)} bpm.`);
    else out.push(`Mean heart rate (${f0(A.meanHR)} bpm) is in line with your usual ${f0(B.hr.m)} bpm.`);
  }
  if (B.roll7 != null) out.push(B.roll7 < -0.5 ? 'Across your last seven readings RMSSD has trended downward relative to your 30-day baseline, which suggests accumulating fatigue or stress over several days.' : B.roll7 > 0.5 ? 'Across your last seven readings RMSSD has trended upward relative to your 30-day baseline, which typically reflects improving recovery or adaptation.' : 'Across your last seven readings RMSSD has been stable relative to your 30-day baseline.');
  if (brNote) out.push(brNote.trim());
  return { verdict, paras: out };
}
function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
function trendChart(B, key, unit, d = 0) {
  const pts = B.pts.filter(p => p[key] != null && isFinite(p[key])); if (pts.length < 2) return '';
  const W = 89, H = 36, padL = 9, padR = 2, padT = 3, padB = 6, iw = W - padL - padR, ih = H - padT - padB;
  const vals = pts.map(p => p[key]); let lo = Math.min(...vals), hi = Math.max(...vals);
  if (key === 'rmssd' && B.lo) { lo = Math.min(lo, B.lo); hi = Math.max(hi, B.hi); }
  const pad = (hi - lo) * 0.15 || 2; lo = Math.max(0, lo - pad); hi += pad;
  const X = i => padL + (pts.length === 1 ? iw / 2 : i / (pts.length - 1) * iw), Y = v => padT + ih - (v - lo) / (hi - lo) * ih;
  let s = '';
  if (key === 'rmssd' && B.lo) s += `<rect x="${padL}" width="${iw}" y="${Y(B.hi).toFixed(2)}" height="${(Y(B.lo) - Y(B.hi)).toFixed(2)}" fill="var(--p-ok-soft)"/>`;
  if (key === 'hr' && B.hr) s += `<rect x="${padL}" width="${iw}" y="${Y(B.hr.m + B.hr.sd).toFixed(2)}" height="${(Y(B.hr.m - B.hr.sd) - Y(B.hr.m + B.hr.sd)).toFixed(2)}" fill="var(--p-ok-soft)"/>`;
  for (const v of niceTicks(lo, hi, 3)) s += `<line x1="${padL}" x2="${W - padR}" y1="${Y(v).toFixed(2)}" y2="${Y(v).toFixed(2)}" stroke="var(--p-line)" stroke-width="0.15"/><text x="${padL - 1}" y="${(Y(v) + 0.8).toFixed(2)}" text-anchor="end" font-size="2.1" fill="var(--p-muted)" font-family="var(--f-mono)">${fmt(v, d)}</text>`;
  s += `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(2) + ' ' + Y(p[key]).toFixed(2)).join('')}" fill="none" stroke="var(--p-teal)" stroke-width="0.4"/>`;
  pts.forEach((p, i) => { s += `<circle cx="${X(i).toFixed(2)}" cy="${Y(p[key]).toFixed(2)}" r="${p.current ? 1.2 : 0.65}" fill="${p.current ? 'var(--p-accent)' : 'var(--p-teal)'}"/>`; });
  const lab = i => new Date(pts[i].start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  s += `<text x="${padL}" y="${H - 1.2}" font-size="2.1" fill="var(--p-muted)">${lab(0)}</text><text x="${W - padR}" y="${H - 1.2}" font-size="2.1" fill="var(--p-accent)" text-anchor="end">Today</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(key)} trend">${s}</svg>`;
}
/* synthetic history for sample reports only */
function sampleHistory(A, meta) {
  let s = 99; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const out = [], E = A.exercise || {};
  for (let i = 14; i >= 1; i--) {
    const day = meta.start - i * 864e5 * 1.6, ln = Math.log(A.rmssd * 0.97) + (rnd() - 0.5) * 0.3;
    out.push({ id: 'sample-h' + i, start: day, ctx: meta.ctx, pos: meta.pos, hr: A.meanHR - 3 + (rnd() - 0.5) * 5, rmssd: Math.exp(ln), ln,
      br: A.breath ? A.breath.median * (1 + (rnd() - 0.5) * 0.15) : null, brShare: isFinite(A.breathShare) ? Math.min(99, A.breathShare * (0.85 + rnd() * 0.2)) : null,
      peak: isFinite(E.peak20) ? E.peak20 - 6 + rnd() * 5 : null, peak20: isFinite(E.peak20) ? E.peak20 - 6 + rnd() * 5 : null,
      hrr60: isFinite(E.hrr60) ? E.hrr60 + (rnd() - 0.5) * 8 : null, trainType: meta.ctx === 'training' ? 'session' : '' });
  }
  if (meta.ctx === 'training') out.push({ id: 'sample-lthr', start: meta.start - 9 * 864e5, ctx: 'training', pos: 'walking', trainType: 'lthr', lthr: 158, lthrValid: true, peak20: 163 });
  return out;
}

/* ---------- plain-language grading ---------- */
const GRADE = {
  fav: { label: 'Favourable', cls: 'fav', rank: 0 }, norm: { label: 'Within normal range', cls: 'in', rank: 1 },
  bord: { label: 'Borderline', cls: 'bord', rank: 2 }, out: { label: 'Outside normal range', cls: 'red', rank: 3 },
  na: { label: 'Not assessed', cls: 'info', rank: -1 }
};
const gchip = g => `<span class="chip ${GRADE[g].cls}">${GRADE[g].label}</span>`;
const higherBetter = (v, q) => !isFinite(v) ? 'na' : v < q.p5 ? 'out' : v < q.p15 ? 'bord' : v < q.p75 ? 'norm' : 'fav';
function gradeAll(A, meta, R, X = null) {
  const ctx = meta.ctx, pos = meta.pos, sleep = ctx === 'sleep', med = ctx === 'meditation', train = ctx === 'training' || pos === 'walking';
  const f = (v, d = 0) => fmt(v, d), sexW = R.sex === 'M' ? 'men' : R.sex === 'F' ? 'women' : 'adults';
  const hrNote = A.meanHR > 75 && !train ? ` Your heart rate averaged ${f(A.meanHR)} bpm during this reading, and HRV is naturally lower at faster heart rates.` : '';
  const G = {}, add = (k, o) => { G[k] = o; };
  // heart rate
  { const v = A.meanHR; let g, t;
    if (train) { g = 'na'; t = 'During exercise your heart rate is meant to rise, so the average is not graded. See peak heart rate and recovery instead.'; }
    else if (sleep) { g = v < 35 ? 'out' : v < 40 ? 'bord' : v <= 60 ? 'fav' : v <= 75 ? 'norm' : v <= 90 ? 'bord' : 'out';
      t = { fav: 'A low, steady heart rate during sleep is typical of good fitness and restful sleep.', norm: 'A typical heart rate for sleep.', bord: v < 40 ? 'Slower than usual even for sleep. This can be normal in endurance athletes; mention it to a doctor if you also feel faint or unusually tired during the day.' : 'Higher than usual for sleep. Alcohol, a late meal, heat, stress or illness can keep night-time heart rate up.', out: v < 35 ? 'Very slow for sleep. Please discuss this with a doctor, especially if you have dizziness or fainting.' : 'Well above the usual range for sleep. If this is repeated on other nights, discuss it with a doctor.' }[g]; }
    else { const lo = pos === 'standing' ? 50 : 40, hi = pos === 'standing' ? 90 : 79;
      g = v < 40 ? 'out' : v > 100 ? 'out' : v < lo ? 'bord' : v < 60 ? 'fav' : v <= hi ? 'norm' : 'bord';
      t = { fav: 'A resting heart rate in the 40s or 50s usually reflects good aerobic fitness.', norm: 'A typical resting heart rate.', bord: v < lo ? 'Slower than usual for this position. Often normal in fit people; mention it to a doctor if you feel light-headed.' : 'A little higher than ideal for rest. Caffeine, stress, heat, dehydration, poor sleep, illness or recent activity can raise it. If your heart rate on waking is regularly above 80, mention it at your next check-up.', out: v > 100 ? 'Above 100 beats per minute at rest (tachycardia). This is often temporary, for example with fever, dehydration, anxiety or stimulants, but a resting rate that stays this high should be checked by a doctor.' : 'Below 40 beats per minute while awake is unusually slow unless you are a trained endurance athlete. If you also feel dizzy, faint or unusually tired, see a doctor.' }[g]; }
    add('hr', { title: 'Heart rate', short: 'heart rate', value: f(v) + ' bpm', g, what: 'How many times your heart beat per minute, on average, during the recording.', text: t }); }
  // RMSSD
  { const q = R.norms.rmssd, v = A.rmssd; let g, t;
    if (train) { g = 'na'; t = 'HRV falls sharply during exercise, so it is not compared with resting norms.'; }
    else if (med) { g = 'na'; t = 'Slow, paced breathing raises HRV on purpose, so it is not compared with resting norms. See breathing coupling instead.'; }
    else { g = higherBetter(v, q);
      t = { fav: `Higher than most ${sexW} of your age in this position. This points to strong "rest and recover" activity in your nervous system.`, norm: `Typical for ${sexW} of your age in this position.`, bord: 'On the low side. HRV drops temporarily with stress, short or poor sleep, alcohol, hard training, illness or dehydration. Compare it with morning readings over several days before drawing conclusions.' + hrNote, out: `Lower than about 95 % of ${sexW} of your age in this position. A single low reading is common and usually temporary.${hrNote} If your morning readings stay this low, it is worth discussing with a doctor. Regular exercise, good sleep and stress management usually raise HRV over time.` }[g]; }
    add('rmssd', { title: 'Heart rate variability (RMSSD)', short: 'heart rate variability', value: f(v, 1) + ' ms', g, what: 'How much the time between heartbeats changes from one beat to the next. At rest, higher values usually mean your body is relaxed and recovering well.', text: t, ref: q }); }
  // SDNN
  { const q = R.norms.sdnn, v = A.sdnn, short = A.dur - A.gapSec <= 1200; let g, t;
    if (train || med) { g = 'na'; t = 'Not graded during exercise or breathing practice.'; }
    else if (!short) { g = 'na'; t = 'SDNN grows with the length of the recording, so it is only graded for readings of 20 minutes or less.'; }
    else { g = higherBetter(v, q); t = { fav: 'Higher than typical: your heart rhythm adapts well over minutes as well as beat to beat.', norm: 'Typical overall variability for your age.', bord: 'Somewhat low overall variability. Like RMSSD, it varies with sleep, stress and fitness.', out: 'Low overall variability for your age. If this recurs on morning readings, it is worth mentioning to a doctor.' }[g]; }
    add('sdnn', { title: 'Overall variability (SDNN)', short: 'overall variability', value: f(v, 1) + ' ms', g, what: 'How much your heart rate varied over the whole recording, including slower ups and downs.', text: t }); }
  // breathing
  if (A.breath) { const v = A.breath.median; let g, t;
    if (med) { g = v <= 7 ? 'fav' : v <= 12 ? 'norm' : 'bord'; t = { fav: 'In the slow "resonance" range of about 4.5–7 breaths per minute used in HRV-biofeedback breathing.', norm: 'Slow, relaxed breathing. Slowing to about 6 breaths per minute (5 seconds in, 5 seconds out) strengthens the effect.', bord: 'Faster than usual for a breathing practice. Try slower, even breaths.' }[g]; }
    else if (train) { g = 'na'; t = 'Breathing speeds up during exercise, so it is not graded.'; }
    else { g = v > 24 ? 'out' : v > 20 ? 'bord' : 'norm'; t = { norm: v < 8 ? 'Very slow breathing, which is normal when deeply relaxed or asleep. It does make the LF/HF ratio unreliable.' : 'A normal resting breathing rate.', bord: 'Slightly fast for rest. This can reflect anxiety, recent activity, heat or congestion.', out: 'Fast breathing at rest. If you were resting and felt short of breath, seek medical advice.' }[g]; }
    add('br', { title: 'Breathing rate', short: 'breathing rate', value: f(v, 1) + ' /min', g, what: A.breathSource === 'acc' ? 'Breaths per minute, measured from the rise and fall of your chest by the motion sensor in the strap.' : 'Breaths per minute, estimated indirectly from small changes in the ECG that follow your breathing.' + (A.hasAcc ? ' The motion sensor could not be used because you were moving.' : ''), text: t }); }
  if (med && isFinite(A.breathShare)) { const v = A.breathShare, g = v >= 60 ? 'fav' : v >= 35 ? 'norm' : 'bord';
    add('coupling', { title: 'Breathing–heart coupling', short: 'breathing–heart coupling', value: f(v) + ' %', g, what: 'How closely your heart rate rose and fell with each breath. This is the main goal of paced breathing.', text: { fav: 'Your heart rate followed your breathing very closely, which is exactly what paced breathing aims for.', norm: 'Moderate coupling. Smooth, unhurried breaths at about 6 per minute usually increase it.', bord: 'Heart rate and breathing were only loosely linked. Try slower, even breaths, for example 5 seconds in and 5 seconds out.' }[g] }); }
  // exercise (training context, or any recording that reached a hard effort)
  X = X || { ER: A.exercise, WM: { v: A.hrMax, src: 'age', label: 'age formula', AF: ageFormulas(R.age, R.sex) }, rec: meta.recovery === 'passive' ? 'passive' : 'active', tt: ctx === 'training' ? 'session' : null };
  const E = X.ER, WMv = X.WM.v;
  if (E && (ctx === 'training' || E.peak20 > 0.75 * WMv)) {
    const pk = isFinite(E.peak20) ? E.peak20 : E.peak, pct = 100 * pk / WMv;
    add('peak', { title: 'Peak heart rate', short: 'peak heart rate', value: f(pk) + ' bpm', g: 'na', what: 'The highest heart rate held for 20 seconds during the recording.',
      text: `${f(pct)} % of your working maximum (${f(WMv)} bpm). ${pct >= 95 ? 'A maximal or near-maximal effort.' : pct >= 85 ? 'A hard effort.' : pct >= 70 ? 'A moderate effort.' : 'A light effort.'} Peak heart rate reflects how hard you worked, not fitness, so it is not graded.` });
    if (ctx === 'training') {
      const W = X.WM, AF = W.AF;
      add('maxhr', { title: 'Maximum heart rate', short: 'maximum heart rate', value: f(WMv) + ' bpm', g: 'na', what: 'The highest heart rate your heart can reach. It sets your training zones.',
        text: (W.src === 'observed' ? `Based on the highest 20-second heart rate in your training recordings (${f(W.raw)} bpm), plus 2 % because your true maximum is likely a few beats higher than anything recorded so far.`
          : W.src === 'ramp' ? `Measured directly in a ramp test where your heart rate levelled off, the most reliable way to find it.`
          : `No training recordings yet, so this is estimated from your age (Tanaka formula). Record training sessions or do a ramp test to replace it with your own value.`)
          + ` Age formulas give ${f(AF.lo)}–${f(AF.hi)} bpm.` + (W.highMax ? ' Your recorded maximum is more than 12 % above the Tanaka estimate: you are a high-max individual, and age formulas under-read your maximum.' : '') });
      const L = HRR_LIMITS[X.rec], recW = X.rec === 'active' ? 'active' : 'passive';
      if (E.end == null) add('hrr', { title: 'Heart-rate recovery (1 min)', short: 'heart-rate recovery', value: 'Not measured', g: 'na', what: 'How far your heart rate falls in the first minute after you stop exercising.',
        text: 'The recording ended while you were still exercising, so recovery could not be measured. This says nothing bad about your heart. To measure it, tap “Start recovery” when you stop and keep recording for at least two minutes.' });
      else if (isFinite(E.hrr60)) {
        const v = E.hrr60, g = v <= L.out ? 'out' : v <= L.bord ? 'bord' : v < L.fav ? 'norm' : 'fav';
        add('hrr', { title: 'Heart-rate recovery (1 min)', short: 'heart-rate recovery', value: f(v) + ' bpm', g, what: `How far your heart rate fell in the first minute after you stopped exercising (${recW} recovery).`,
          text: { fav: 'A fast recovery, typical of good aerobic fitness.', norm: 'A normal recovery after exercise.',
            bord: `Slightly slower than expected for ${recW} recovery. Heat, dehydration, fatigue and how abruptly you stopped all affect it. Check it again after your next session.`,
            out: `A fall of ${L.out} bpm or less in the first minute is slower than expected for ${recW} recovery. If it stays this slow on repeat tests, discuss it with a doctor.` }[g]
            + (X.rec === 'active' ? ` Because you kept moving, the threshold is relaxed (${L.out} bpm instead of ${HRR_LIMITS.passive.out} bpm for standing still).` : '') });
      } else add('hrr', { title: 'Heart-rate recovery (1 min)', short: 'heart-rate recovery', value: 'Too short', g: 'na', what: 'How far your heart rate falls in the first minute after you stop exercising.',
        text: 'The recording stopped less than a minute after you finished. Keep recording for at least two minutes after stopping.' });
      if (X.tt === 'ramp' && X.ramp) { const r = X.ramp;
        add('ramp', { title: 'Ramp test result', short: 'ramp test', value: r.valid ? f(r.max) + ' bpm' : 'Incomplete', g: 'na', what: 'A step test to exhaustion that measures your maximum heart rate directly.',
          text: !r.valid ? 'Fewer than three 3-minute steps were completed, so the test is not valid. Start easier and increase the load every 3 minutes until you cannot continue.'
            : r.plateau ? `Your heart rate levelled off at ${f(r.max)} bpm over the final steps, so this is your true maximum. It now sets your training zones.`
            : `Your heart rate was still rising when you stopped (${f(r.max)} bpm), so your true maximum is probably higher. This value is a floor, not a ceiling.` }); }
      if (X.tt === 'intervals' && X.iv) { const b = X.iv.bouts;
        add('intervals', { title: 'Interval efforts', short: 'interval efforts', value: b.length ? b.length + (b.length === 1 ? ' effort' : ' efforts') : 'None found', g: 'na', what: 'The hard efforts in this session, found automatically from your heart rate, and how far it fell between them.',
          text: b.length ? `Peaks ranged from ${f(Math.min(...b.map(x => x.peak)))} to ${f(Math.max(...b.map(x => x.peak)))} bpm. ${isFinite(X.iv.fade) && X.iv.fade >= 5 ? `Your peak rose ${f(X.iv.fade)} bpm over the session, a sign of building fatigue.` : 'Your peaks stayed consistent across the session.'} See the training pages for each effort.` : 'No distinct efforts stood out from the rest of the session. Efforts are detected when heart rate rises well above the session’s easy level for at least 20 seconds.' }); }
      if (X.tt === 'tempo' && X.tempo) { const T = X.tempo;
        add('tempo', { title: 'Tempo steadiness', short: 'tempo steadiness', value: T.valid ? 'Drift ' + (T.drift >= 0 ? '+' : '−') + f(Math.abs(T.drift), 1) + ' %' : 'Too short', g: 'na', what: 'How evenly you held a sustained effort. Cardiac drift is how much your heart rate crept up in the second half at the same effort.',
          text: !T.valid ? 'The sustained part lasted less than 10 minutes, too short to judge drift. Hold the tempo effort for at least 10 minutes.'
            : T.drift > 10 ? 'A large drift: your heart rate climbed well above where it started. Heat, dehydration, fatigue or going too hard early are the usual reasons.'
            : T.drift > 5 ? 'A moderate drift. Some rise is normal on long or warm efforts; less drift at the same pace over time is a sign of improving endurance.'
            : `A steady effort: heart rate stayed within ±5 bpm of ${f(T.avg)} bpm for ${f(100 * T.within)} % of the block.` }); }
      if (X.tt === 'lthr' && X.lt) { const r = X.lt;
        add('lthr', { title: 'Threshold heart rate (LTHR)', short: 'threshold heart rate', value: r.valid ? f(r.lthr) + ' bpm' : 'Incomplete', g: 'na', what: 'The heart rate you can sustain for about an hour: your average over the last 20 minutes of a 30-minute all-out effort.',
          text: r.valid ? `Your threshold heart rate is ${f(r.lthr)} bpm. Zones based on it are more accurate than percentages of maximum for hard training.` : 'The effort lasted less than 25 minutes, so the threshold could not be measured reliably. Warm up first, press Start as the effort begins, and hold the hardest pace you can for the full 30 minutes.' }); }
    }
  }
  // QTc
  const qtcFrid = (ctx === 'training' || A.meanHR > 90) && isFinite(A.qtcF);
  { const v = qtcFrid ? A.qtcF : A.qtc, L = R.qtcLim; let g = !isFinite(v) ? 'na' : v < 330 ? 'out' : v < 350 ? 'bord' : v <= L.norm ? 'norm' : v <= L.bord ? 'bord' : 'out';
    const urgent = v >= 500;
    const t = { na: 'Could not be measured reliably in this recording.', norm: 'Within the normal range.', bord: v < 350 ? 'Slightly shorter than typical. This is usually a measurement effect with a chest strap; a standard ECG can confirm.' : `Slightly longer than typical for ${sexW}. This may be a measurement limit of a chest strap, or due to certain medicines or low potassium or magnesium. Worth a standard ECG if it repeats.`, out: urgent ? 'Well above 500 ms. Chest straps can over-estimate QTc, but a value this high should be checked with a standard 12-lead ECG promptly. Arrange a medical review soon, and seek urgent care if you have fainting or palpitations.' : v < 330 ? 'Shorter than the normal range. This needs confirming with a standard 12-lead ECG; please mention it to a doctor.' : `Longer than the normal limit for ${sexW}. Chest straps can over-estimate QTc, so it needs confirming with a standard 12-lead ECG. Please discuss it with a doctor, especially if you take medicines known to affect the QT interval.` }[g];
    add('qtc', { title: 'QTc (heart reset time)', short: 'QTc', value: f(v) + (qtcFrid ? ' ms (Fridericia)' : ' ms'), g, urgent, frid: qtcFrid, what: 'The time your heart’s main chambers take to electrically reset after each beat, adjusted for heart rate. Values that are too long can increase the risk of rhythm problems.', text: t + (qtcFrid ? ` Graded with the Fridericia correction, which is accurate at the higher heart rates of this recording (the Bazett value, ${f(A.qtc)} ms, over-corrects at fast rates).` : '') }); }
  // QRS
  { const v = A.qrs, g = !isFinite(v) ? 'na' : v >= 120 ? 'out' : v > 100 ? 'bord' : v < 50 ? 'bord' : 'norm';
    add('qrs', { title: 'QRS width', short: 'QRS width', value: f(v) + ' ms', g, what: 'How long the electrical signal takes to spread through the heart’s main pumping chambers.', text: { na: 'Could not be measured reliably.', norm: 'Normal conduction through the pumping chambers.', bord: v < 50 ? 'Unusually narrow, most likely a measurement effect.' : 'Slightly wide. Often harmless (a minor conduction variant), but a standard ECG can confirm.', out: 'Wide. This can indicate a bundle branch block. A chest strap cannot confirm it; please arrange a standard ECG.' }[g] }); }
  // ectopic beats
  { const pct = 100 * A.ectopicBeats / A.beats, g = pct > 10 ? 'out' : pct >= 1 ? 'bord' : 'norm';
    add('ect', { title: 'Extra beats (ectopics)', short: 'extra beats', value: f(A.ectopicBeats) + ' · ' + f(pct, 2) + ' %', g, what: 'Early or extra heartbeats, often felt as a "skipped" or "thumping" beat. Occasional ectopic beats are very common in healthy people.', text: { norm: A.ectopicBeats ? 'A small number of extra beats, which is common and usually harmless.' : 'No extra beats were detected.', bord: 'More extra beats than usual. They are often linked to caffeine, alcohol, stress or poor sleep. If they are frequent on repeat recordings, mention it to a doctor.', out: 'A high number of extra beats (over 10 % of all beats). Please discuss this with a doctor; a longer heart monitor may be recommended.' }[g] }); }
  // pauses
  { const lp = A.pauses.reduce((a, p) => Math.max(a, p.ms), 0) / 1000, g = lp >= 3 ? 'out' : lp > 2 ? (sleep ? 'norm' : 'bord') : 'norm';
    add('pause', { title: 'Pauses between beats', short: 'pauses between beats', value: A.pauses.length ? A.pauses.length + ' · longest ' + lp.toFixed(2) + ' s' : 'None over 2 s', g, urgent: lp >= 3, what: 'Gaps of more than 2 seconds between heartbeats.', text: { norm: A.pauses.length ? 'Brief pauses of 2–3 seconds during sleep are common and usually normal.' : 'No long gaps between beats.', bord: 'A brief gap of 2–3 seconds. This can be normal, for example during deep relaxation or in fit people, but note it if it recurs or you feel light-headed.', out: 'A gap of 3 seconds or more between beats. Please have this reviewed by a doctor, especially if you have had dizziness or fainting. Seek urgent care if you faint.' }[g] }); }
  // T waves & J point
  if (ctx === 'training') {
    { const v = A.tPosPct, g = isFinite(v) && v < 70 ? 'bord' : 'na';
      add('t', { title: 'T-wave shape', short: 'T-wave shape', value: f(v) + ' % upright', g, what: 'The shape of the “recovery” wave after each beat.', text: g === 'bord' ? 'Many recovery waves were inverted during exercise. Strap movement often causes this, but if it recurs, mention it to a doctor.' : 'T waves often flatten at high heart rates and when the strap moves, so during exercise they are not compared with resting values.' }); }
    { const v = A.jAmp, g = isFinite(v) && v < -200 ? 'bord' : 'na';
      add('j', { title: 'ST level (J-point)', short: 'ST level', value: f(v) + ' µV', g, what: 'The level of the ECG just after each beat, compared with the baseline.', text: (g === 'bord' ? 'A large dip during exercise (more than 200 µV). It is often positional or normal with a chest strap, but worth mentioning to a doctor. ' : 'During exercise this level normally dips (junctional depression), so it is not compared with resting values. ') + 'A single chest lead cannot tell a normal exercise pattern from an abnormal one: if you have chest pain, pressure or unusual breathlessness on exertion, see a doctor about a clinical exercise stress test.' }); }
  } else {
  { const v = A.tPosPct, g = !isFinite(v) ? 'na' : v >= 90 ? 'norm' : v >= 70 ? 'bord' : 'out';
    add('t', { title: 'T-wave shape', short: 'T-wave shape', value: f(v) + ' % upright', g, what: 'The shape of the “recovery” wave after each beat.', text: { na: 'Could not be assessed.', norm: 'Recovery waves had the expected upright shape.', bord: 'Some recovery waves were flattened or inverted. With a chest strap this often reflects strap or body position; if it persists, check with a standard ECG.', out: 'Many recovery waves were inverted. This can be positional with a chest strap, but should be checked with a standard ECG.' }[g] }); }
  { const v = A.jAmp, g = !isFinite(v) ? 'na' : (v < -150 || v > 300) ? 'out' : (v < -100 || v > 200) ? 'bord' : 'norm';
    add('j', { title: 'ST level (J-point)', short: 'ST level', value: f(v) + ' µV', g, what: 'The level of the ECG just after each beat, compared with the resting baseline.', text: { na: 'Could not be assessed.', norm: 'At the expected level.', bord: 'Slightly shifted. A chest strap gives a single view and cannot diagnose heart strain; mention it to a doctor if you have chest discomfort on exertion.', out: 'Clearly shifted. A chest strap cannot diagnose the cause, but this should be checked with a standard ECG, and urgently if you have chest pain.' }[g] }); }
  }
  // signal quality
  { const lost = 100 * (meta.gap || 0) / FS / Math.max(1, A.dur), noisy = A.noisePct, v = noisy + lost, g = v > 20 ? 'out' : v >= 5 ? 'bord' : 'norm';
    const lostMin = (meta.gap || 0) / FS / 60, lostTxt = lostMin >= 1 ? Math.round(lostMin) + ' min' : Math.round(lostMin * 60) + ' s';
    // say what actually happened: a lost connection needs different advice from a noisy signal
    const why = lost >= noisy
      ? `The strap's signal was lost for ${lostTxt} (the Bluetooth connection dropped); noise affected only ${f(noisy, 1)} % of the rest. Lost and noisy stretches are left out of every measurement. Keeping the phone close to the strap, for example in a chest or front pocket, helps.`
      : `${f(noisy, 1)} % of the signal was noisy${lost > 0.5 ? ` and ${lostTxt} was lost` : ''}. Noisy stretches are left out of every measurement. Moisten the electrodes, tighten the strap and keep still where possible.`;
    add('quality', { title: 'Signal quality', short: 'signal quality', value: f(100 - v) + ' % usable', g, what: 'How much of the recording was clean enough to analyse.', text: { norm: 'Good signal; the results are reliable.', bord: 'Part of the recording could not be used, so the results are a little less precise. ' + why, out: 'Much of the recording could not be used, so treat these results with caution and repeat the reading. ' + why }[g] }); }
  return G;
}
function overallVerdict(G) {
  const list = Object.values(G).filter(x => x.g !== 'na' && x !== G.quality);
  const urgent = list.filter(x => x.urgent && x.g === 'out'), reds = list.filter(x => x.g === 'out'), ambers = list.filter(x => x.g === 'bord'), favs = list.filter(x => x.g === 'fav');
  const join = a => { const n = a.map(x => x.short); return n.length < 2 ? n.join('') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1]; };
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1), are = a => a.length > 1 ? 'are' : 'is';
  const favTxt = favs.length ? ` ${cap(join(favs))} ${are(favs)} better than typical for your age.` : '';
  if (urgent.length) return { g: 'out', head: 'One finding should be reviewed by a doctor soon', text: `The ${join(urgent)} result is outside the normal range by a margin that warrants medical review. Chest-strap readings can be affected by strap position and movement, so a doctor may confirm it with a standard ECG. If you have fainting, chest pain, a racing heart or severe breathlessness, seek urgent care.` };
  if (reds.length) return { g: 'out', head: `${reds.length} value${reds.length > 1 ? 's' : ''} outside the normal range`, text: `${cap(join(reds))} ${reds.length > 1 ? 'were' : 'was'} outside the normal range in this reading${ambers.length ? `, and ${join(ambers)} ${ambers.length > 1 ? 'were' : 'was'} borderline` : ''}.${favTxt} Single readings vary with sleep, stress, caffeine and activity, so repeat the reading under similar conditions. If the result persists, discuss it with a doctor and bring this report.` };
  if (ambers.length >= 2) return { g: 'bord', head: 'Largely normal, with a few values worth watching', text: `${cap(join(ambers))} are borderline; the other measurements are within the normal range.${favTxt} Borderline values are common in a single reading; watch the trend over several readings.` };
  if (ambers.length === 1) return { g: favs.length >= 2 ? 'fav' : 'norm', head: favs.length >= 2 ? 'A favourable result, with one value to watch' : 'Normal overall, with one value to watch', text: `Everything except ${join(ambers)} is within or better than the normal range.${favTxt} ${cap(join(ambers))} is borderline, which on its own in a single reading is not a concern; see its card for details.` };
  return { g: favs.length ? 'fav' : 'norm', head: favs.length ? 'All values normal, several favourable' : 'All values within the normal range', text: `Every graded measurement is within the normal range for your age and sex.${favTxt} No action is needed based on this reading.` };
}
const plain = t => `<div class="plain"><b>In plain terms</b> ${t}</div>`;

/* ---------- training: working maximum heart rate, recovery, tests, zones ---------- */
const TRAIN_TYPES = { session: 'Training session', intervals: 'Interval training', tempo: 'Tempo session', ramp: 'Max HR ramp test', lthr: 'LTHR 30-min test' };
const REC_TYPES = { active: 'Active recovery (kept moving)', passive: 'Passive recovery (stood, sat or lay still)' };
/* HRR at 1 min: active cool-down after Cole et al. 1999 (<= 12 bpm abnormal); passive recovery produces larger falls, so its limit is higher */
const HRR_LIMITS = { active: { out: 12, bord: 17, fav: 30 }, passive: { out: 18, bord: 22, fav: 40 } };
function ageFormulas(age, sex) {
  const a = age || 35, f = [
    { k: 'Fox', v: 220 - a, eq: '220 − age' }, { k: 'Tanaka', v: 208 - 0.7 * a, eq: '208 − 0.7 × age' },
    { k: 'Nes', v: 211 - 0.64 * a, eq: '211 − 0.64 × age' }];
  if (sex === 'F') f.push({ k: 'Gulati', v: 206 - 0.88 * a, eq: '206 − 0.88 × age (women)' });
  const vs = f.map(x => x.v);
  return { list: f, lo: Math.min(...vs), hi: Math.max(...vs), tanaka: 208 - 0.7 * a };
}
/* Working max HR: highest 20-s rolling mean from any training recording (+2 %), or a ramp-test plateau as measured;
   Tanaka only when no training data exists. */
function maxHrEstimate(hist, cur, age, sex) {
  const AF = ageFormulas(age, sex), all = hist.filter(h => h.id !== cur.id).concat([cur]);
  const tr = all.filter(h => h.ctx === 'training' && isFinite(h.peak20) && h.peak20 > 60 && h.peak20 < 240);
  const obs = tr.length ? tr.reduce((a, b) => b.peak20 > a.peak20 ? b : a) : null;
  const pl = all.filter(h => h.trainType === 'ramp' && h.rampPlateau && isFinite(h.rampMax)).reduce((a, b) => !a || b.rampMax > a.rampMax ? b : a, null);
  const cands = [];
  if (obs) cands.push({ v: obs.peak20 * 1.02, raw: obs.peak20, src: 'observed', from: obs });
  if (pl) cands.push({ v: pl.rampMax, raw: pl.rampMax, src: 'ramp', from: pl });
  const W = cands.length ? cands.reduce((a, b) => b.v > a.v ? b : a) : { v: AF.tanaka, raw: NaN, src: 'tanaka', from: null };
  const rawBest = Math.max(obs ? obs.peak20 : 0, pl ? pl.rampMax : 0);
  const top = tr.slice().sort((a, b) => b.peak20 - a.peak20).slice(0, 5);
  return Object.assign(W, { AF, highMax: rawBest > 1.12 * AF.tanaka, rawBest, top, nTraining: tr.length,
    label: W.src === 'observed' ? 'Observed maximum + 2 %' : W.src === 'ramp' ? 'Measured in a ramp test (plateau reached)' : 'Tanaka age formula (no training data yet)' });
}
function latestLthr(hist, cur) {
  const all = hist.filter(h => h.id !== cur.id).concat([cur]).filter(h => h.trainType === 'lthr' && isFinite(h.lthr) && h.lthrValid);
  return all.length ? all.reduce((a, b) => b.start > a.start ? b : a) : null;
}
function trainingContext(A, meta, hist, age, sex) {
  const ER = A.exercise || null, tt = meta.ctx === 'training' ? (TRAIN_TYPES[meta.trainType] ? meta.trainType : 'session') : null;
  const ramp = tt === 'ramp' ? rampTest(A, ER) : null, lt = tt === 'lthr' ? lthrTest(A, ER) : null;
  const iv = tt === 'intervals' ? intervalWork(A, ER) : null, tempo = tt === 'tempo' ? tempoWork(A, ER) : null;
  const cur = { id: meta.id || ('file-' + meta.start), start: meta.start, ctx: meta.ctx, trainType: tt, peak20: ER ? ER.peak20 : NaN,
    rampMax: ramp ? ramp.max : NaN, rampPlateau: ramp ? ramp.plateau : false, lthr: lt ? lt.lthr : NaN, lthrValid: lt ? lt.valid : false };
  const WM = maxHrEstimate(hist, cur, age, sex), LR = latestLthr(hist, cur);
  return { ER, tt, rec: meta.recovery === 'passive' ? 'passive' : 'active', ramp, lt, iv, tempo, WM, LR,
    zonesPct: zoneTime(A, WM.v, PCT_ZONES), zonesL: LR ? zoneTime(A, LR.lthr, LTHR_ZONES) : null };
}
const mmss = sec => Math.floor(sec / 60) + ':' + String(Math.round(sec % 60)).padStart(2, '0');
function recoveryChart(A, ER, startMs) {
  if (!ER || ER.end == null) return '';
  const s = rollingHR(A, 10, 2), t0 = Math.max(0, ER.end - 120), t1 = Math.min(A.dur, ER.end + Math.max(150, Math.min(ER.after || 0, 300)));
  const pts = s.filter(p => p.t >= t0 && p.t <= t1); if (pts.length < 5) return '';
  const W = 186, H = 44, lo = Math.floor((Math.min(...pts.map(p => p.v)) - 8) / 10) * 10, hi = Math.ceil((Math.max(...pts.map(p => p.v)) + 6) / 10) * 10;
  const F = frame({ W, H, x0: t0, x1: t1, y0: lo, y1: hi, yTicks: niceTicks(lo, hi, 4), startMs });
  let g = `<rect x="${F.X(ER.end).toFixed(2)}" y="${F.padT}" width="${(F.X(t1) - F.X(ER.end)).toFixed(2)}" height="${F.ih}" fill="var(--p-teal-soft)" opacity=".55"/>`;
  g += `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + F.X(p.t).toFixed(2) + ' ' + F.Y(p.v).toFixed(2)).join('')}" fill="none" stroke="var(--p-accent)" stroke-width="0.55"/>`;
  const mk = (t, v, lab, left) => isFinite(v) && t <= t1 ? `<circle cx="${F.X(t).toFixed(2)}" cy="${F.Y(v).toFixed(2)}" r="0.9" fill="var(--p-ink)"/><text x="${(F.X(t) + (left ? -1.4 : 1.2)).toFixed(2)}" y="${(F.Y(v) + (left ? 3.4 : -1.2)).toFixed(2)}" text-anchor="${left ? 'end' : 'start'}" font-size="2.2" fill="var(--p-ink)">${lab} ${fmt(v)}</text>` : '';
  g += `<line x1="${F.X(ER.end).toFixed(2)}" x2="${F.X(ER.end).toFixed(2)}" y1="${F.padT}" y2="${F.padT + F.ih}" stroke="var(--p-ink)" stroke-width="0.3" stroke-dasharray="1 0.8"/>`;
  g += `<text x="${(F.X(ER.end) + 1).toFixed(2)}" y="${F.padT + F.ih - 1.6}" font-size="2.2" fill="var(--p-teal)" font-weight="600">Recovery ${ER.src === 'marked' ? '(marked)' : '(detected)'}</text>`;
  g += mk(ER.end, ER.stop, 'Stop', true) + mk(ER.end + 60, ER.at60, '+1 min') + mk(ER.end + 120, ER.at120, '+2 min');
  if (isFinite(ER.floor) && ER.floorT > ER.end + 130 && ER.floorT <= t1) g += mk(ER.floorT, ER.floor, 'Floor');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Heart rate around the end of exercise">${F.g}${g}</svg>`;
}

/* ---------- page assembly ---------- */
function ctxView(A, ctx) { return ctx === 'meditation' ? Object.assign({}, A, { breath: A.breathSlow, breathShare: A.breathShareSlow }) : A; }
function renderReport(A, meta0, st, hist = []) {
  _uid = 0;
  const okKey = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k) ? k : '';
  const meta = Object.assign({}, meta0, { ctx: okKey(CTX, meta0.ctx), pos: okKey(POS, meta0.pos), battery: isFinite(+meta0.battery) && meta0.battery !== null && meta0.battery !== '' ? Math.round(+meta0.battery) : null });
  st = Object.assign({}, st, { sex: st.sex === 'M' || st.sex === 'F' ? st.sex : '' });
  hist = hist.filter(h => h && typeof h === 'object');
  A = ctxView(A, meta.ctx);
  const startMs = meta.start || Date.now(), age = ageAt(st.dob, startMs), sex = st.sex || '';
  const R = refsFor(age, sex, meta.ctx, meta.pos);
  const X = trainingContext(A, meta, hist, R.age, sex);
  A = Object.assign({}, A, { zones: X.zonesPct, hrMax: Math.round(X.WM.v) });
  const G = gradeAll(A, meta, R, X), OV = overallVerdict(G), gc = k => G[k] ? gchip(G[k].g) : '';
  const gcol = g => g === 'out' ? 'var(--p-red)' : g === 'bord' ? 'var(--p-warn)' : g === 'na' ? 'var(--p-faint)' : 'var(--p-ok)';
  const clock = sec => new Date(startMs + sec * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  meta._clock = s => clock(s).slice(0, 5);
  const date = new Date(startMs).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const name = st.name ? esc(st.name) : '';
  const pausedSec = (meta.pauses || []).reduce((a, p) => a + Math.max(0, (p.t1 || 0) - p.t0), 0);
  const lostSec = (meta.gap || 0) / FS, recSec = A.dur - A.gapSec;
  const ctxL = meta.ctx ? CTX[meta.ctx].label : null, posL = meta.pos ? POS[meta.pos].label : null;
  const headR = `${name ? name + ' · ' : ''}${new Date(startMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${clock(0).slice(0, 5)}${ctxL ? ' · ' + esc(CTX[meta.ctx].short) : ''}`;
  const cur = { id: meta.id || ('file-' + startMs), start: startMs, ctx: meta.ctx, pos: meta.pos, hr: A.meanHR, rmssd: A.rmssd, ln: A.lnRmssd, br: A.breath ? A.breath.median : null, brShare: A.breathShare, peak: X.ER ? X.ER.peak20 : null, hrr60: X.ER && X.ER.end != null ? X.ER.hrr60 : null, trainType: X.tt, recovery: X.tt ? X.rec : '' };
  const B = computeBaseline(hist, cur), C = commentary(A, meta, R, B, X);
  const pages = [], page = inner => pages.push(inner);
  const isTraining = meta.ctx === 'training', isMed = meta.ctx === 'meditation';
  const srcTxt = A.hrvSource === 'h10' ? 'strap beat intervals (1 ms)' : 'ECG R-peaks (sub-sample timing)';

  // measurements
  const hrvRef = R.hrv, nEv = A.events.length, evPct = 100 * A.ectopicBeats / A.beats;
  const longP = A.pauses.reduce((a, p) => p.ms > a.ms ? p : a, { ms: 0 });
  const M = [
    { gk: 'hr', label: 'Mean heart rate', key: 'meanHR', v: A.meanHR, d: 0, u: 'bpm', lo: R.hr && R.hr[0], hi: R.hr && R.hr[1] },
    { gk: 'rmssd', label: 'RMSSD', key: 'HRV', v: A.rmssd, d: 1, u: 'ms', lo: R.hrvJudge ? hrvRef[0] : null, hi: R.hrvJudge ? hrvRef[1] : null, refNote: R.hrvJudge ? R.hrvNote : (hrvRef ? 'not judged during practice' : 'not applicable during activity') },
    { label: 'SDNN', key: 'SDNN', v: A.sdnn, d: 1, u: 'ms', lo: G.sdnn.g !== 'na' ? Math.round(R.norms.sdnn.p15) : null, hi: G.sdnn.g !== 'na' ? Math.round(R.norms.sdnn.p75) : null, gk: 'sdnn' },
    { label: 'pNN50', key: 'pNN50', v: A.pnn50, d: 1, u: '%', lo: 0, hi: 55 },
    { label: 'pNN200', key: 'pNN200', v: A.pnn200, d: 1, u: '%', lo: 0, hi: 15 },
    { label: 'LF power', key: '0.04–0.15 Hz', v: A.fd ? A.fd.lf : NaN, d: 0, u: 'ms²' },
    { label: 'HF power', key: '0.15–0.40 Hz', v: A.fd ? A.fd.hf : NaN, d: 0, u: 'ms²' },
    { label: 'LF/HF ratio', key: 'LF/HF', v: A.lfhf, d: 2, u: '', refNote: A.breath && A.breath.median < 9 ? 'not interpretable: slow breathing' : '' },
    { label: 'HF share', key: 'meanHF', v: A.hfPct, d: 0, u: '%', lo: 0, hi: 90, max: 100 },
    { gk: 'br', label: 'Breathing rate', key: A.breathSource === 'acc' ? 'chest movement' : 'ECG-derived', v: A.breath ? A.breath.median : NaN, d: 1, u: '/min', lo: isTraining ? null : 8, hi: isTraining ? null : 20, refNote: isMed ? 'slow breathing expected' : '' },
    { gk: 'coupling', label: 'Breathing-linked HRV', key: 'coupling', v: A.breathShare, d: 0, u: '%' },
    { gk: 'qrs', label: 'QRS duration', key: 'meanQRS', v: A.qrs, d: 0, u: 'ms', lo: 50, hi: 100 },
    { gk: G.qtc && G.qtc.frid ? null : 'qtc', label: 'QTc (Bazett)', key: 'meanQTc', v: A.qtc, d: 0, u: 'ms', lo: R.qtc[0], hi: R.qtc[1], refNote: sex ? (sex === 'M' ? 'male' : 'female') : 'sex not set' },
    { gk: G.qtc && G.qtc.frid ? 'qtc' : null, label: 'QTc (Fridericia)', key: 'QTcF', v: A.qtcF, d: 0, u: 'ms', lo: R.qtc[0], hi: R.qtc[1] },
    { gk: 't', label: 'Upright T waves', key: 'meanTPositive', v: A.tPosPct, d: 0, u: '%', lo: 90, hi: 100, max: 100 },
    { gk: 'j', label: 'J-point level', key: 'meanJPoint', v: A.jAmp, d: 0, u: 'µV', lo: -100, hi: 200, floor0: false },
    { label: 'Systolic amplitude', key: 'meanSystole', v: A.sysAmp, d: 0, u: 'µV', lo: 60, hi: 2600 },
    { label: 'R-wave amplitude', key: 'R amp', v: A.rAmp, d: 0, u: 'µV' },
    { gk: 'ect', label: 'Ectopic beats', key: 'ectopic %', v: evPct, d: 2, u: '%', lo: 0, hi: 1 },
    { gk: 'quality', label: 'Artifact or noise', key: 'noise %', v: A.noisePct, d: 2, u: '%', lo: 0, hi: 5 }
  ];
  for (const m of M) { m.st = status(m.v, m.lo, m.hi); m.g = m.gk && G[m.gk] ? G[m.gk].g : 'na'; m.col = gcol(m.g); }
  const outs = M.filter(m => m.g === 'out' && m.key !== 'ectopic %');

  // summary
  const durTxt = recSec < 600 ? Math.floor(recSec / 60) + ' min ' + String(Math.round(recSec % 60)).padStart(2, '0') + ' s' : durShort(recSec);
  let summ = `${ctxL ? `${esc(ctxL)}${posL ? ', ' + esc(posL.toLowerCase()) : ''}` : 'Recording'}, <b>${durTxt}</b> of ECG${pausedSec > 1 ? ` (paused ${durShort(pausedSec)})` : ''}${lostSec > 1 ? `; signal unavailable for ${durShort(lostSec)}` : ''}. `;
  summ += `Mean heart rate <b>${fmt(A.meanHR)} bpm</b> (${fmt(A.minHR.v)}–${fmt(A.maxHR.v)} bpm) across ${fmt(A.beats)} beats. `;
  summ += isTraining && X.ER ? `${esc(TRAIN_TYPES[X.tt])}. Peak <b>${fmt(X.ER.peak20)} bpm</b> (20-s mean; ${fmt(100 * X.ER.peak20 / X.WM.v)} % of working maximum ${fmt(X.WM.v)} bpm). ${X.ER.end != null && isFinite(X.ER.hrr60) ? `Recovery ${fmt(X.ER.hrr60)} bpm in the first minute (${X.rec}). ` : 'Recovery not measured. '}` : `RMSSD <b>${fmt(A.rmssd, 1)} ms</b>, SDNN ${fmt(A.sdnn, 1)} ms${A.breath ? `, breathing ${fmt(A.breath.median, 1)}/min` : ''}. `;
  summ += nEv ? `<b>${nEv} ectopic ${nEv === 1 ? 'event' : 'events'}</b> (${fmt(evPct, 2)} % of beats). ` : 'No ectopic beats detected. ';
  summ += A.pauses.length ? `<b>${A.pauses.length} ${A.pauses.length === 1 ? 'pause' : 'pauses'} over 2 s</b>, longest ${(longP.ms / 1000).toFixed(2)} s at ${clock(longP.time)}. ` : 'No pauses over 2 s. ';
  summ += outs.length ? `Outside the normal range: ${outs.map(m => m.label).join(', ')}.` : 'All other graded values are within or better than the normal range.';

  const head = `<header class="pg-head"><span class="b"><svg viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" rx="8" fill="var(--p-accent)"/><path d="M5 17h6l2-5 3 11 3-15 2 9h6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>ECG Recording Report</span><span>${headR}${meta.sample ? ' · <span class="sample-tag">Sample data</span>' : ''}</span></header>`;
  const kpi = (l, v, u, ch, sub) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}<small>${u}</small></div>${ch}<div class="s">${sub}</div></div>`;
  const bChip = (v, key) => B.state === 'ready' && key === 'rmssd' && B.lo ? chip(v < B.lo ? 'low' : v > B.hi ? 'high' : 'in', v < B.lo ? 'Below your baseline' : v > B.hi ? 'Above your baseline' : 'Within your baseline') : '';
  const rhythmTile = kpi('Ectopy &amp; pauses', fmt(nEv), nEv === 1 ? 'event' : 'events', gchip(GRADE[G.pause.g].rank >= GRADE[G.ect.g].rank ? G.pause.g : G.ect.g), (A.pauses.length ? A.pauses.length + ' pause' + (A.pauses.length > 1 ? 's' : '') + ' > 2 s · ' : '') + fmt(evPct, 2) + ' % of beats');
  let tiles;
  if (isTraining) {
    const E = X.ER || {}, W = X.WM, hi80 = A.zones.slice(3).reduce((a, z) => a + z.sec, 0);
    const recTile = kpi('Recovery · 1 min', E.end != null && isFinite(E.hrr60) ? fmt(E.hrr60) : '—', E.end != null && isFinite(E.hrr60) ? 'bpm' : '', E.end != null && isFinite(E.hrr60) ? gc('hrr') : chip('info', 'Not measured'),
      E.end != null && isFinite(E.hrr60) ? `${X.rec} · from ${fmt(E.stop)} bpm at stop` : E.end == null ? 'ended while exercising' : 'record 2 min after stopping');
    const maxTile = kpi('Working max HR', fmt(W.v), 'bpm', W.highMax ? chip('info', 'High-max individual') : chip('info', W.src === 'tanaka' ? 'Age estimate' : W.src === 'ramp' ? 'Ramp test' : 'Your data + 2 %'), `age formulas ${fmt(W.AF.lo)}–${fmt(W.AF.hi)}`);
    const peakTile = kpi('Peak heart rate', fmt(E.peak20), 'bpm', chip('info', fmt(100 * E.peak20 / W.v) + ' % of max'), '20-s mean at ' + clock(E.peak20T || 0));
    const first = X.tt === 'ramp' && X.ramp ? kpi('Measured max HR', X.ramp.valid ? fmt(X.ramp.max) : '—', X.ramp.valid ? 'bpm' : '', X.ramp.valid ? chip(X.ramp.plateau ? 'in' : 'info', X.ramp.plateau ? 'Plateau: true max' : 'No plateau: a floor') : chip('info', 'Test incomplete'), `${X.ramp.completed} steps of 3 min`)
      : X.tt === 'lthr' && X.lt ? kpi('Threshold HR (LTHR)', X.lt.valid ? fmt(X.lt.lthr) : '—', X.lt.valid ? 'bpm' : '', X.lt.valid ? chip('info', 'Last 20 min of 30') : chip('info', 'Test too short'), `effort ${fmt(X.lt.effortMin)} min`)
      : kpi('Time ≥ 80 % max', durShort(hi80).split(' ')[0], durShort(hi80).split(' ').slice(1).join(' '), chip('info', 'Anaerobic + maximum'), '≥ ' + A.zones[3].bpmLo + ' bpm');
    tiles = [first, peakTile, recTile, maxTile, kpi('QTc', fmt(G.qtc && G.qtc.frid ? A.qtcF : A.qtc), 'ms', gc('qtc'), (G.qtc && G.qtc.frid ? 'Fridericia' : 'Bazett') + ' · ref ' + R.qtc[0] + '–' + R.qtc[1]), rhythmTile];
  } else if (isMed) {
    tiles = [
      kpi('Breathing rate', A.breath ? fmt(A.breath.median, 1) : '—', '/min', gc('br'), A.breath ? 'range ' + fmt(A.breath.lo, 1) + '–' + fmt(A.breath.hi, 1) : 'not estimated'),
      kpi('Breathing-linked HRV', fmt(A.breathShare), '%', gc('coupling'), 'power at breathing frequency'),
      kpi('RMSSD', fmt(A.rmssd, 1), 'ms', bChip(A.rmssd, 'rmssd') || chip('info', 'Not judged in practice'), srcTxt),
      kpi('Mean heart rate', fmt(A.meanHR), 'bpm', gc('hr'), 'range ' + fmt(A.minHR.v) + '–' + fmt(A.maxHR.v)),
      kpi('QTc', fmt(G.qtc && G.qtc.frid ? A.qtcF : A.qtc), 'ms', gc('qtc'), (G.qtc && G.qtc.frid ? 'Fridericia' : 'Bazett') + ' · ref ' + R.qtc[0] + '–' + R.qtc[1]),
      rhythmTile];
  } else {
    tiles = [
      kpi('Mean heart rate', fmt(A.meanHR), 'bpm', gc('hr'), 'range ' + fmt(A.minHR.v) + '–' + fmt(A.maxHR.v) + ' bpm'),
      kpi('RMSSD', fmt(A.rmssd, 1), 'ms', gc('rmssd') + ' ' + bChip(A.rmssd, 'rmssd'), hrvRef ? 'population ' + hrvRef[0] + '–' + hrvRef[1] + ' ms' : srcTxt),
      kpi('SDNN', fmt(A.sdnn, 1), 'ms', gc('sdnn'), 'ln RMSSD ' + fmt(A.lnRmssd, 2)),
      kpi('Breathing rate', A.breath ? fmt(A.breath.median, 1) : '—', '/min', A.breath ? gc('br') : chip('info', 'Not estimated'), A.breathSource === 'acc' ? 'measured from chest movement' : 'ECG-derived estimate'),
      kpi('QTc', fmt(G.qtc && G.qtc.frid ? A.qtcF : A.qtc), 'ms', gc('qtc'), (G.qtc && G.qtc.frid ? 'Fridericia' : 'Bazett') + ' · ref ' + R.qtc[0] + '–' + R.qtc[1] + ' ms'),
      rhythmTile];
  }
  const baseCharts = B.pts && B.pts.length >= 2 ? (isTraining ? `<div class="cols2"><div class="fig"><div class="cap">Peak heart rate, recent ${esc(CTX.training.short.toLowerCase())} sessions</div>${trendChart(B, 'peak', 'bpm')}</div><div class="fig"><div class="cap">1-minute recovery (bpm)</div>${trendChart(B, 'hrr60', 'bpm')}</div></div>`
    : isMed ? `<div class="cols2"><div class="fig"><div class="cap">Breathing rate (/min)</div>${trendChart(B, 'br', '/min', 1)}</div><div class="fig"><div class="cap">Breathing-linked HRV (%)</div>${trendChart(B, 'brShare', '%')}</div></div>`
    : `<div class="cols2"><div class="fig"><div class="cap">RMSSD (ms) · green band = your usual range</div>${trendChart(B, 'rmssd', 'ms')}</div><div class="fig"><div class="cap">Mean heart rate (bpm) · green band = usual ±1 SD</div>${trendChart(B, 'hr', 'bpm')}</div></div>`) : '';
  const tags = `<div class="ctxline">${ctxL ? `<span class="tag ac">${esc(ctxL)}</span>` : '<span class="tag">Context not set</span>'}${posL ? `<span class="tag">${esc(posL)}</span>` : '<span class="tag">Position not set</span>'}${age ? `<span class="tag">Age ${age}</span>` : ''}${sex ? `<span class="tag">${sex === 'M' ? 'Male' : 'Female'}</span>` : ''}</div>`;

  /* ---- page 1 ---- */
  page(`
    <div class="ttl"><div><h1>${meta.sample ? 'Sample ECG report' : 'Single-lead ECG report'}</h1>
      <div class="when">${date} · <span class="mono">${clock(0)} – ${clock(A.dur)}</span></div>${tags}${meta.notes ? `<div class="notes-p"><b>Notes</b>${esc(String(meta.notes).slice(0, 200))}</div>` : ''}</div>
      <div class="who">${name ? `<b>${name}</b>` : ''}<span>${esc(meta.device || 'Polar H10')}${meta.fw ? ' · fw ' + esc(meta.fw) : ''}${meta.battery != null ? ' · battery ' + meta.battery + '%' : ''}</span><span>HRV source: ${srcTxt}</span></div></div>
    ${meta.sample ? '<div class="summary" style="background:var(--p-warn-soft)"><b>Sample report.</b> Generated from a synthetic ECG and synthetic history to illustrate the layout. It is not a recording of any person.</div>' : ''}
    <div class="summary">${summ}</div>
    <div class="kpis k6">${tiles.join('')}</div>
    <div class="base"><div class="verdict"><h3>Personal baseline${B.state === 'ready' ? (isTraining ? ` · ${esc(TRAIN_TYPES[X.tt])} · ${esc(X.rec)} recovery` : ` · ${esc(CTX[meta.ctx].short)} · ${esc(POS[meta.pos].short)}`) : ''}</h3>${C.verdict ? chip(C.verdict[0] === 'out' ? 'low' : C.verdict[0], C.verdict[1]) : ''}</div>
      ${C.paras.map(p => `<p>${p}</p>`).join('')}${baseCharts}</div>`);

  /* ---- plain-language page(s) ---- */
  const order = ['hr', 'rmssd', 'sdnn', 'br', 'coupling', 'ramp', 'lthr', 'intervals', 'tempo', 'peak', 'maxhr', 'hrr', 'ect', 'pause', 'qtc', 'qrs', 't', 'j', 'quality'].filter(k => G[k]);
  const card = k => { const x = G[k]; return `<div class="pl-card g-${x.g}"><div class="pl-top"><b>${x.title}</b><span class="pl-val">${x.value}</span></div>${gchip(x.g)}<p class="pl-what">${x.what}</p><p>${x.text}</p></div>`; };
  const legend = `<div class="pl-legend">${['fav', 'norm', 'bord', 'out', 'na'].map(g => gchip(g)).join('')}</div>`;
  const help = `<div class="pl-help"><b>When to seek medical help.</b> Whatever this report shows, seek urgent care for chest pain or pressure, fainting, severe shortness of breath, or a racing or very irregular heartbeat with dizziness. This report is for general wellness and education only: it cannot diagnose or rule out any condition. For any health concern, see a doctor rather than relying on this report. The pages that follow give the detailed measurements.</div>`;
  const per = 8;
  for (let i = 0; i < order.length; i += per) {
    const first = i === 0, last = i + per >= order.length;
    page(`<div class="sec-h"><h2>What this means for you${first ? '' : ' (continued)'}</h2><span>Plain-language guide to each result</span></div>
      ${first ? `<div class="pl-verdict g-${OV.g}"><div class="pl-vh">${gchip(OV.g)}<b>${esc(OV.head)}</b></div><p>${OV.text}</p></div>
      <p class="note-p">Each result is compared with typical values for ${R.ageKnown ? 'your age (' + R.age + ')' : 'adults (age not set)'}${sex ? ' and sex' : ''}${posL ? ', ' + esc(posL.toLowerCase()) : ''}. Grades: ${legend}</p>` : ''}
      <div class="pl-grid">${order.slice(i, i + per).map(card).join('')}</div>${last ? help : ''}`);
  }

  /* ---- training pages ---- */
  if (isTraining) {
    const W = X.WM, E = X.ER || {}, Lm = HRR_LIMITS[X.rec], kvT = (l, v, sub, warn) => `<div class="kv"><span>${l}${sub ? `<small>${sub}</small>` : ''}</span><b class="${warn ? 'warn' : ''}">${v}</b></div>`;
    const dShort = ms => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const topRows = W.top.map(h => `<tr><td class="m">${dShort(h.start)}</td><td>${esc(TRAIN_TYPES[h.trainType] || 'Training session')}${h.id === (meta.id || '') ? ' · this recording' : ''}</td><td class="m">${fmt(h.peak20)} bpm</td></tr>`).join('');
    page(`<div class="sec-h"><h2>Maximum heart rate and recovery</h2><span>${esc(TRAIN_TYPES[X.tt])} · ${esc(REC_TYPES[X.rec])}</span></div>
      ${plain('Your maximum heart rate sets your training zones. Age formulas are only averages and can be wrong by 10–20 bpm for an individual, so this app uses the highest heart rate you have actually held for 20 seconds in training, with a small margin. Recovery shows how quickly your heart rate falls once you stop, measured from the moment exercise ended, not from the highest point of the session.')}
      <div class="cols2">
        <div class="panel"><h3>Working maximum · used for zones</h3>
          <div class="bignum">${fmt(W.v)}<small>bpm</small></div><div class="srcl">${esc(W.label)}</div>
          ${kvT('Highest 20-s heart rate recorded', isFinite(W.rawBest) && W.rawBest > 0 ? fmt(W.rawBest) + ' bpm' : '—', W.nTraining ? `${W.nTraining} training recording${W.nTraining === 1 ? '' : 's'}` : 'no training recordings yet')}
          ${kvT('Margin applied', W.src === 'observed' ? '+2 %' : 'none', W.src === 'observed' ? 'true maximum sits a few bpm above anything recorded' : W.src === 'ramp' ? 'plateau reached: measured value used as is' : 'age estimate')}</div>
        <div class="panel"><h3>Age-predicted · for context only</h3>
          ${W.AF.list.map(x => kvT(x.k, fmt(x.v) + ' bpm', x.eq)).join('')}
          ${kvT('Range', fmt(W.AF.lo) + '–' + fmt(W.AF.hi) + ' bpm', `age ${R.age}`)}</div>
      </div>
      ${W.highMax ? `<div class="flag"><b>High-max individual: age formulas under-read.</b> Your recorded maximum (${fmt(W.rawBest)} bpm) is more than 12 % above the Tanaka estimate (${fmt(W.AF.tanaka)} bpm). Zones in this report use your own data.</div>` : ''}
      <p class="note-p">Interval sessions (for example 4 × 4 minutes) rarely reach true maximum: peaks observed in them are a floor, not a ceiling. For a measured value, use the Max HR ramp test. ${W.src === 'tanaka' ? 'Until then, zones use the Tanaka formula.' : ''}</p>
      ${topRows ? `<div class="sec-h"><h2>Highest heart rates recorded</h2><span>20-second rolling means, training recordings</span></div><table class="ev"><thead><tr><th>Date</th><th>Recording</th><th>Highest 20-s HR</th></tr></thead><tbody>${topRows}</tbody></table>` : ''}`);
    let tests = '';
    if (X.tt === 'ramp' && X.ramp) { const r = X.ramp;
      tests = `<div class="sec-h"><h2>Max HR ramp test</h2><span>3-minute steps to failure</span></div>
        <div class="cols2"><div><table class="ev"><thead><tr><th>Step</th><th>Elapsed</th><th>HR, last 30 s</th></tr></thead><tbody>${thin(r.steps, 14).map(st => `<tr><td class="m">${st.n}${st.done ? '' : ' (stopped)'}</td><td class="m">${mmss(st.t0)}–${mmss(st.t1)}</td><td class="m">${fmt(st.hr)} bpm</td></tr>`).join('')}</tbody></table></div>
        <div class="panel"><h3>Result</h3>${kvT('Steps completed', fmt(r.completed))}${kvT('Failure point', clock(r.fail), r.failSrc === 'marked' ? 'marked with Start recovery' : r.failSrc === 'auto' ? 'detected automatically' : 'end of recording')}${kvT('Measured maximum', isFinite(r.max) ? fmt(r.max) + ' bpm' : '—', 'highest 20-s heart rate before failure')}${kvT('Heart-rate plateau', r.plateau ? 'Yes' : 'No', r.plateau ? 'levelled off: true maximum reached' : 'still rising: the true maximum is higher')}
        <p class="note-p" style="margin:0">${!r.valid ? 'Test not valid: fewer than three steps were completed.' : r.plateau ? 'The measured maximum is used as your working maximum without a margin.' : 'Without a plateau, this value is a floor; the +2 % margin applies.'}</p></div></div>`; }
    if (X.tt === 'lthr' && X.lt) { const r = X.lt;
      tests = `<div class="sec-h"><h2>LTHR test</h2><span>30-minute time trial</span></div>
        <div class="panel"><h3>Result</h3>${kvT('Threshold heart rate (LTHR)', r.valid ? fmt(r.lthr) + ' bpm' : '—', 'mean heart rate over the last 20 minutes of the effort')}${kvT('Window used', clock(r.from) + ' – ' + clock(r.end), r.cover < 0.995 ? `signal for ${fmt(20 * r.cover)} of the 20 minutes; gaps are left out` : '')}${kvT('Effort duration', fmt(r.effortMin) + ' min', r.short ? 'shorter than the 25 minutes needed' : r.onset > 30 ? `from ${clock(r.onset)}, when heart rate first reached effort level` : '')}
        <p class="note-p" style="margin:0">${r.valid ? 'This threshold now sets your LTHR zones in later training reports.' : 'Not valid: warm up first, press Start as the 30-minute effort begins, hold the hardest pace you can for the full 30 minutes, and tap Start recovery when you finish.'}</p></div>`; }
    if (X.tt === 'intervals' && X.iv) { const v = X.iv;
      tests = `<div class="sec-h"><h2>Interval efforts</h2><span>detected from 10-s heart rate</span></div>
        ${v.bouts.length ? `<table class="ev"><thead><tr><th>#</th><th>Start</th><th>Effort</th><th>Peak</th><th>Average</th><th>Recovery</th><th>HR fall</th></tr></thead><tbody>${thin(v.bouts, 14).map(b => `<tr><td class="m">${b.n}</td><td class="m">${clock(b.t0)}</td><td class="m">${mmss(b.dur)}</td><td class="m">${fmt(b.peak)} bpm</td><td class="m">${fmt(b.mean)} bpm</td><td class="m">${b.last ? 'end of session' : mmss(b.recSec)}</td><td class="m">${b.last ? 'see below' : isFinite(b.recDrop) ? fmt(b.recDrop) + ' bpm' : '—'}</td></tr>`).join('')}</tbody></table>
        <p class="note-p">An effort is a stretch of at least 20 s above ${fmt(v.thr)} bpm (60 % of the way from this session’s easy level, ${fmt(v.lo)} bpm, to its high, ${fmt(v.hi)} bpm). HR fall is the drop from the effort’s peak to the lowest point before the next effort; faster falls between efforts usually come with better fitness.${isFinite(v.fade) ? ` Peak heart rate changed by ${v.fade >= 0 ? '+' : '−'}${fmt(Math.abs(v.fade))} bpm from the first to the last effort.` : ''}</p>`
          : '<p class="note-p">No distinct efforts were found: heart rate never rose well above the session’s easy level for 20 seconds or more.</p>'}`; }
    if (X.tt === 'tempo' && X.tempo) { const T = X.tempo;
      tests = `<div class="sec-h"><h2>Tempo steadiness</h2><span>the sustained block of this session</span></div>
        <div class="panel"><h3>Sustained block</h3>${kvT('Block', clock(T.t0) + ' – ' + clock(T.end), mmss(T.dur) + ' long')}${kvT('Average heart rate', fmt(T.avg) + ' bpm', fmt(100 * T.avg / X.WM.v) + ' % of working maximum')}${kvT('First half / second half', fmt(T.m1) + ' / ' + fmt(T.m2) + ' bpm')}${kvT('Cardiac drift', (T.drift >= 0 ? '+' : '−') + fmt(Math.abs(T.drift), 1) + ' %', 'under 5 % = steady')}${kvT('Held within ±5 bpm', fmt(100 * T.within) + ' % of the block')}
        <p class="note-p" style="margin:0">${!T.valid ? 'The block lasted less than 10 minutes, too short to judge drift reliably.' : 'Cardiac drift is the rise in heart rate at a steady effort as the session goes on. Less drift at the same pace over the weeks is a sign of improving endurance; heat and dehydration increase it.'}</p></div>`; }
    page(`${tests}
      <div class="sec-h"><h2>Recovery after exercise</h2><span>${E.end != null ? 'Measured from the end of exercise at ' + clock(E.end) : 'Not measured'}</span></div>
      ${E.end == null ? `<p class="note-p" style="font-size:8.6pt">The recording ended while you were still exercising, so recovery was not measured and no recovery flag is raised. To measure it, tap <b>Start recovery</b> on the recording screen when you stop, then keep recording for at least two minutes.</p>` : `
      <div class="cols2">
        <div class="panel"><h3>End-of-session recovery</h3>
          ${kvT('Recovery type', X.rec === 'active' ? 'Active' : 'Passive', X.rec === 'active' ? 'kept moving (walking, easy spinning)' : 'stood, sat or lay still')}
          ${kvT('End of exercise', clock(E.end), E.src === 'marked' ? 'marked with Start recovery' : 'detected automatically')}
          ${kvT('Heart rate at stop', fmt(E.stop) + ' bpm')}
          ${kvT('After 1 minute', isFinite(E.at60) ? fmt(E.at60) + ' bpm' : '—', isFinite(E.hrr60) ? 'fall ' + fmt(E.hrr60) + ' bpm' : 'recording too short', G.hrr && (G.hrr.g === 'out' || G.hrr.g === 'bord'))}
          ${kvT('After 2 minutes', isFinite(E.at120) ? fmt(E.at120) + ' bpm' : '—', isFinite(E.hrr120) ? 'fall ' + fmt(E.hrr120) + ' bpm' : 'recording too short')}
          ${kvT('Recovery floor', fmt(E.floor) + ' bpm', 'lowest 10-s heart rate after stopping, at ' + clock(E.floorT))}
          ${kvT('Share of fall in first minute', isFinite(E.pct60) ? fmt(E.pct60) + ' %' : '—', 'of the total fall from stop to floor')}</div>
        <div class="panel"><h3>How it is graded</h3>
          <p class="note-p" style="margin:0">${X.rec === 'active' ? `<b>Active recovery: limit relaxed.</b> Moving keeps heart rate higher, so a first-minute fall of more than ${Lm.out} bpm is normal (borderline up to ${Lm.bord} bpm), instead of ${HRR_LIMITS.passive.out} bpm for standing still. The share of the fall to your recovery floor is shown as well, because a fixed target suits active recovery less well.` : `<b>Passive recovery.</b> Standing or sitting still lets heart rate fall fastest, so a first-minute fall of more than ${Lm.out} bpm is expected (borderline up to ${Lm.bord} bpm).`}</p>
          <p class="note-p" style="margin:0">Recovery is measured from the end of the session, never from a peak in the middle of it, so intervals with active recovery between efforts do not produce false flags.</p>
          ${G.hrr ? `<div>${gchip(G.hrr.g)}</div>` : ''}</div>
      </div>
      <div class="fig">${recoveryChart(A, E, startMs)}<div class="cap">Heart rate (10-s means) from two minutes before the end of exercise; shaded area = recovery.</div></div>`}`);

    const zRows = (zs, base, unit) => zs.map(z => `<tr><td>${esc(z.name)}</td><td class="m">${Math.round(z.lo * 100)}${z.hi > 5 ? '+' : '–' + Math.round(z.hi * 100)} %</td><td class="m">${z.hi > 5 ? '≥ ' + z.bpmLo : z.bpmLo + '–' + z.bpmHi} bpm</td><td class="m">${durShort(z.sec)}</td></tr>`).join('');
    page(`
      <div class="sec-h"><h2>Training zones</h2><span>Time in each zone during this recording</span></div>
      ${plain('Zones divide effort into bands. Threshold (LTHR) zones come from a 30-minute test and are the most accurate for hard training; zones based on maximum heart rate are shown alongside for comparison.')}
      ${X.zonesL ? `<h3 class="zh">Threshold zones · LTHR ${fmt(X.LR.lthr)} bpm (test on ${dShort(X.LR.start)})</h3><table class="ev"><thead><tr><th>Zone</th><th>% LTHR</th><th>Heart rate</th><th>Time</th></tr></thead><tbody>${zRows(X.zonesL)}</tbody></table>` : '<p class="note-p">No threshold zones yet: complete an LTHR 30-minute test to add them.</p>'}
      <h3 class="zh">Zones by maximum heart rate · working max ${fmt(W.v)} bpm (${esc(W.label.toLowerCase())})</h3>
      <table class="ev"><thead><tr><th>Zone</th><th>% max</th><th>Heart rate</th><th>Time</th></tr></thead><tbody>${zRows(X.zonesPct)}</tbody></table>`);
  }

  /* ---- page 2: measurements ---- */
  page(`
    <div class="sec-h"><h2>All measurements</h2><span>Green band = normal range · dot = this recording</span></div>
    ${plain('Every value measured in this recording, with its normal range. The coloured dot shows where your value sits: green is within or better than normal, amber is borderline, red is outside the normal range. Values without a grade are shown for completeness and are explained in the clinical pages.')}
    <table class="mt"><thead><tr><th>Measurement</th><th style="text-align:right">Value</th><th>Position in interval</th><th>Normal range</th><th>Assessment</th></tr></thead><tbody>
      ${M.map(m => `<tr class="${m.g === 'out' ? 'red' : m.g === 'bord' ? 'out' : ''}"><td>${m.label}<span class="key">${m.key}</span></td><td class="val">${fmt(m.v, m.d)}<small>${m.u}</small></td><td class="rbar">${rangeBar(m.v, m.lo, m.hi, m)}</td><td class="ref">${m.lo != null ? fmt(m.lo) + ' – ' + fmt(m.hi) + (m.u && m.u !== '/min' ? ' ' + m.u : m.u) + (m.refNote ? ' · ' + m.refNote : '') : (m.refNote || '—')}</td><td>${m.g !== 'na' ? gchip(m.g) : '<span class="note-p">—</span>'}</td></tr>`).join('')}
    </tbody></table>
    <p class="note-p">Reference intervals: heart rate by context and position; RMSSD approximate, by age${R.ageKnown ? '' : ' (age not set, 35 assumed)'} and position, applied only to resting contexts; QTc upper limit ${R.qtc[1]} ms (${sex === 'M' ? 'male' : sex === 'F' ? 'female' : 'sex not set; combined limit'}); other intervals follow the Polar ECG Analysis app. HRV values are calculated from ${srcTxt}${A.hrvSource === 'h10' ? `; ${fmt(A.h10Artifacts)} of ${fmt(A.h10Total)} intervals were removed as artifacts or ectopic beats. ECG-derived RMSSD for comparison: ${fmt(A.ecgRmssd, 1)} ms` : ''}.</p>`);

  /* ---- page 3: heart rate & rhythm ---- */
  const kv = (l, v, sub, warn) => `<div class="kv"><span>${l}${sub ? `<small>${sub}</small>` : ''}</span><b class="${warn ? 'warn' : ''}">${v}</b></div>`;
  const E = X.ER || {};
  const thirdPanel = isTraining || (E.peak20 && E.peak20 > 0.75 * X.WM.v)
    ? `<div class="panel"><h3>Exercise response</h3>${kv('Peak heart rate (20 s)', fmt(E.peak20) + ' bpm', fmt(100 * E.peak20 / X.WM.v) + ' % of working max ' + fmt(X.WM.v) + ' bpm')}${kv('End of exercise', E.end != null ? clock(E.end) : 'not reached', E.end != null ? (E.src === 'marked' ? 'marked with Start recovery' : 'detected automatically') : 'recording ended during effort')}${kv('Recovery at 1 / 2 min', E.end != null ? (isFinite(E.hrr60) ? fmt(E.hrr60) : '—') + ' / ' + (isFinite(E.hrr120) ? fmt(E.hrr120) : '—') + ' bpm' : '—', X.rec + ' recovery', G.hrr && (G.hrr.g === 'out' || G.hrr.g === 'bord'))}${kv('Heart rate at end', fmt(E.endHR) + ' bpm')}</div>`
    : `<div class="panel"><h3>Rhythm</h3>${kv('Beats under 50 bpm', fmt(A.bradyPct, 2) + ' %', 'bradycardia range')}${kv('Beats over 150 bpm', fmt(A.tachyPct, 2) + ' %', 'tachycardia range')}${kv('Pauses over 2 s', fmt(A.pauses.length), A.pauses.length ? 'longest ' + (longP.ms / 1000).toFixed(2) + ' s at ' + clock(longP.time) : 'longest gap ' + (A.longest.v / 1000).toFixed(2) + ' s', A.pauses.length > 0)}${kv('pNN50 episodes', fmt(A.pnnEpisodes), 'minutes with pNN50 over 55 %')}</div>`;
  page(`
    <div class="sec-h"><h2>Heart rate and rhythm</h2><span>${durShort(recSec)} recorded · ${fmt(A.beats)} beats</span></div>
    ${plain(isTraining ? 'How hard your heart worked during the session and how quickly it settled afterwards. The chart traces your heart rate through the session; coloured bands show the training zones.' : 'How fast your heart beat and whether the rhythm was steady. The chart shows your heart rate minute by minute; small triangles along the bottom mark extra beats (orange) and long gaps between beats (red).')}
    <div class="grid3">
      <div class="panel"><h3>Beats</h3>${A.stillPct != null ? kv('Time still', fmt(A.stillPct) + ' %', 'from the motion sensor') : ''}${kv('Number of beats', fmt(A.beats))}${kv('Ectopic beats / events', fmt(A.ectopicBeats) + ' / ' + fmt(nEv), null, nEv > 0)}${kv('Ectopic share', fmt(evPct, 2) + ' %')}${kv('Artifact or noise', fmt(A.noisePct, 2) + ' %')}${kv('Paused / signal lost', (pausedSec > 1 ? durShort(pausedSec) : 'none') + ' / ' + (lostSec > 1 ? durShort(lostSec) : 'none'))}</div>
      <div class="panel"><h3>Heart rate</h3>${kv('Maximum', fmt(A.maxHR.v) + ' bpm', 'at ' + clock(A.maxHR.t) + ' · 5-beat median')}${kv('Minimum', fmt(A.minHR.v) + ' bpm', 'at ' + clock(A.minHR.t) + ' · 5-beat median')}${A.hi1 ? kv('Highest 1-min mean', fmt(A.hi1.v) + ' bpm', clock(A.hi1.t0) + ' – ' + clock(A.hi1.t1)) : ''}${A.lo1 ? kv('Lowest 1-min mean', fmt(A.lo1.v) + ' bpm', clock(A.lo1.t0) + ' – ' + clock(A.lo1.t1)) : ''}</div>
      ${thirdPanel}
    </div>
    <div class="fig"><div class="sec-h"><h2>Heart rate over time</h2><span>${A.hrBin}-second means · shaded band = minimum to maximum</span></div>${hrChart(A, startMs, meta.pauses || [], isTraining && X.ER ? X.ER.end : null)}
      <div class="legend"><span><i style="background:var(--p-accent)"></i>Mean heart rate</span><span><i style="background:var(--p-accent);opacity:.25"></i>Range within interval</span><span><i style="background:var(--p-warn)"></i>Ectopic event</span><span><i style="background:var(--p-accent)"></i>Pause over 2 s</span></div></div>
    <div class="fig"><div class="sec-h"><h2>Heart rate distribution</h2><span>Share of normal beats in 2-bpm bins · teal under 50 bpm</span></div>${hrHistogram(A)}</div>
    <div class="fig"><div class="sec-h"><h2>Time in heart-rate zones</h2><span>Working maximum ${fmt(X.WM.v)} bpm · ${esc(X.WM.label)}</span></div>${zoneBar(A)}</div>`);

  /* ---- page 4: HRV ---- */
  const fd = A.fd || {};
  page(`
    <div class="sec-h"><h2>Heart rate variability</h2><span>Normal-to-normal intervals · source: ${srcTxt}</span></div>
    ${plain('A healthy heart does not tick like a metronome: the gap between beats changes slightly all the time, mostly with your breathing. At rest, more variability usually means your body is relaxed and recovering well; it falls with stress, poor sleep, illness, alcohol and hard training. Your own trend matters more than comparisons with other people.')}
    <div class="cols-hrv">
      <div class="fig">${hrvRef ? gauge(A.rmssd, hrvRef) : '<p class="cap">No population reference applies during activity.</p>'}<div class="cap" style="text-align:center">${R.hrvJudge ? gc('rmssd') + '&nbsp; normal range ' + hrvRef[0] + '–' + hrvRef[1] + ' ms (' + R.hrvNote + ', approximate)' : hrvRef ? 'Population interval shown for orientation only.' : ''}</div></div>
      <div class="panel"><h3>Time and frequency domain</h3>
        ${kv('RMSSD · ln RMSSD', fmt(A.rmssd, 1) + ' ms · ' + fmt(A.lnRmssd, 2), 'short-term, vagally mediated variability')}
        ${kv('SDNN', fmt(A.sdnn, 1) + ' ms', 'overall variability, includes slow oscillations')}
        ${kv('pNN50 / pNN200', fmt(A.pnn50, 1) + ' % / ' + fmt(A.pnn200, 1) + ' %')}
        ${kv('SD1 / SD2', fmt(A.sd1, 1) + ' / ' + fmt(A.sd2, 1) + ' ms', 'Poincaré short- / long-term spread')}
        ${kv('LF power · peak', fmt(fd.lf) + ' ms² · ' + fmt(fd.lfPeak, 3) + ' Hz', '0.04–0.15 Hz')}
        ${kv('HF power · peak', fmt(fd.hf) + ' ms² · ' + fmt(fd.hfPeak, 3) + ' Hz', '0.15–0.40 Hz')}
        ${kv('LF/HF · HF share', fmt(A.lfhf, 2) + ' · ' + fmt(A.hfPct) + ' %', A.breath && A.breath.median < 9 ? 'not interpretable at this breathing rate' : '', A.breath && A.breath.median < 9)}
        ${kv('Breathing rate', A.breath ? fmt(A.breath.median, 1) + ' /min' : '—', isFinite(A.breathShare) ? fmt(A.breathShare) + ' % of HRV power at breathing frequency' : '')}</div>
    </div>
    <div class="fig"><div class="sec-h"><h2>HRV over time</h2><span>${A.hrvWinSec / 60}-minute windows · line = RMSSD · bars = pNN50</span></div>${hrvChart(A, startMs, R.hrvJudge ? hrvRef : null)}
      ${A.hrvWin.length ? `<div class="cap">RMSSD across windows ranged ${fmt(Math.min(...A.hrvWin.map(w => w.rmssd)))}–${fmt(Math.max(...A.hrvWin.map(w => w.rmssd)))} ms.</div>` : ''}</div>
    <div class="cols2">
      <div class="fig"><div class="sec-h"><h2>Poincaré plot</h2><span>Each interval against the next</span></div>${poincareRR(A)}
        <div class="cap">A narrow cluster along the diagonal indicates a steady rhythm. Orange points involve an ectopic beat. Ellipse: ±2 SD1 × SD2.</div></div>
      <div class="fig"><div class="sec-h"><h2>Interpretation notes</h2><span></span></div>
        <div class="methods" style="columns:1">
          <p><b>RMSSD</b> reflects beat-to-beat (parasympathetic) modulation and is the most robust short-term HRV measure. It falls as heart rate rises, so compare readings taken in the same context and position.</p>
          <p><b>Breathing and LF/HF.</b> The breathing-driven heart-rate oscillation is counted as HF only when breathing exceeds 9 breaths/min. Slower breathing moves it into the LF band and inflates LF/HF, which is why the ratio is flagged at low breathing rates.</p>
        </div></div>
    </div>`);

  /* ---- page 5: waveform ---- */
  const mw = A.morphWin;
  page(`
    <div class="sec-h"><h2>Waveform and repolarization</h2><span>Averaged beats · ${fmt(A.qtcPts.length)} beats with a measurable T wave</span></div>
    ${plain('The shape of your average heartbeat. Q to J is the electrical spread through the pumping chambers (QRS); J to T end is the recovery, or reset, phase. The most important value here is QTc, the heart’s reset time adjusted for heart rate. A chest strap shows one view of the heart, so waveform findings should be confirmed with a standard ECG before any decisions are made.')}
    <div class="cols2">
      <div class="fig"><div class="sec-h"><h2 style="font-size:9.5pt">Average beat</h2><span>${A.avgBeat ? fmt(A.avgBeat.count) + ' beats averaged' : ''}</span></div>${avgBeatSvg(A)}
        <div class="cap">Grid 40 ms × 100 µV. Q = QRS onset; J = QRS end; T end by the tangent method.</div></div>
      <div class="panel"><h3>Waveform measurements</h3>
        ${kv('QRS duration', fmt(A.qrs) + ' ms', 'reference 50–100 ms')}
        ${kv('QT (median)', fmt(A.qt) + ' ms')}
        ${kv('QTc Bazett', fmt(A.qtc) + ' ms', 'QT / √RR · reference ' + R.qtc[0] + '–' + R.qtc[1] + ' ms', status(A.qtc, R.qtc[0], R.qtc[1]) !== 'in')}
        ${kv('QTc Fridericia', fmt(A.qtcF) + ' ms', 'QT / ∛RR · ' + (A.meanHR > 90 ? 'preferred at this heart rate' : 'less rate-dependent'))}
        ${kv('Upright T waves', fmt(A.tPosPct) + ' %', 'reference 90–100 %', status(A.tPosPct, 90, 100) !== 'in')}
        ${kv('J-point level', fmt(A.jAmp) + ' µV', 'relative to the PR segment')}
        ${kv('R-wave amplitude', fmt(A.rAmp) + ' µV')}
        ${kv('T-wave amplitude', fmt(A.tAmp) + ' µV')}
        ${kv('Systolic amplitude', fmt(A.sysAmp) + ' µV', 'mean |signal|, QRS onset to T end')}</div>
    </div>
    <div class="fig"><div class="sec-h"><h2>QTc over time</h2><span>Points = individual beats · line = ${A.dur <= 7200 ? '1' : '5'}-minute median · green = reference</span></div>${qtcChart(A, startMs, R.qtc)}</div>
    <div class="cols2">
      <div class="fig"><div class="sec-h"><h2>RR interval vs QTc</h2><span>Rate-correction check</span></div>${rrQtc(A, R.qtc)}<div class="cap">A flat cloud indicates that the correction formula suits this heart-rate range. Bazett over-corrects at high heart rates.</div></div>
      <div class="fig"><div class="sec-h"><h2>Waveform trend</h2><span>5-minute averaged beats</span></div>
        ${mw.length ? `<table class="ev"><thead><tr><th>Start</th><th>RR</th><th>QRS</th><th>QTc</th><th>T</th></tr></thead><tbody>${thin(mw, 10).map(m => `<tr><td class="m">${clock(m.t0).slice(0, 5)}</td><td class="m">${fmt(m.rr)}</td><td class="m">${m.qrsOk === false ? '—' : fmt(m.qrs)}</td><td class="m">${fmt(m.qt / Math.sqrt(m.rr / 1000))}</td><td class="m">${fmt(m.tAmp)}</td></tr>`).join('')}</tbody></table>` : '<p class="cap">Insufficient clean beats.</p>'}</div>
    </div>`);

  /* ---- strips ---- */
  const gain = A.rAmp > 1600 ? 5 : 10, strips = [], center = sec => sec * A.fs - STRIP_S * A.fs / 2;
  const cleanStart = (() => { for (let s0 = 5; s0 < A.dur - 8; s0 += 2) { const k0 = lowerBound(A.t, s0), k1 = lowerBound(A.t, s0 + STRIP_S); let ok = k1 - k0 >= 3; for (let k = k0; k < k1 && ok; k++) if (A.noise[k] || A.ect[k]) ok = false; if (ok) return s0; } return 0; })();
  strips.push({ t: 'Representative sample', s: cleanStart * A.fs, at: cleanStart });
  if (A.pauses.length) strips.push({ t: `Longest pause · <em>${(longP.ms / 1000).toFixed(2)} s</em>`, s: center(longP.time + longP.ms / 2000), at: longP.time });
  else strips.push({ t: `Longest RR interval · ${(A.longest.v / 1000).toFixed(2)} s`, s: center(A.t[A.longest.k] - A.longest.v / 2000), at: A.t[A.longest.k] });
  strips.push({ t: `Minimum heart rate · <em>${fmt(A.minHR.v)} bpm</em>`, s: center(A.minHR.t), at: A.minHR.t });
  if (A.lo1) strips.push({ t: `Lowest 1-minute mean · ${fmt(A.lo1.v)} bpm`, s: center((A.lo1.t0 + A.lo1.t1) / 2), at: A.lo1.t0, range: A.lo1 });
  strips.push({ t: `Maximum heart rate · <em>${fmt(A.maxHR.v)} bpm</em>`, s: center(A.maxHR.t), at: A.maxHR.t });
  if (A.hi1) strips.push({ t: `Highest 1-minute mean · ${fmt(A.hi1.v)} bpm`, s: center((A.hi1.t0 + A.hi1.t1) / 2), at: A.hi1.t0, range: A.hi1 });
  A.events.slice(0, 24).forEach((e, i) => strips.push({ t: `Ectopic event ${i + 1} of ${nEv} · <em>${esc(e.kind)}</em>`, s: center(e.time), at: e.time }));
  if (A.dur > 5400) for (let h = 3600; h < A.dur - 60; h += 3600) strips.push({ t: `Hourly sample · hour ${h / 3600}`, s: h * A.fs, at: h });
  for (let i = 0; i < strips.length; i += (i ? 5 : 4)) {
    const grp = strips.slice(i, i + (i ? 5 : 4));
    page(`<div class="sec-h"><h2>ECG strips${i ? ' (continued)' : ''}</h2><span>7.2 s per strip · values above beats = instantaneous heart rate · E = ectopic beat</span></div>${i ? '' : plain('Snapshots of your actual ECG at key moments, printed on standard ECG paper: each large square is 0.2 seconds wide. Each tall spike is one heartbeat; the number above it is your heart rate at that moment. Beats marked E arrived early or had an unusual shape.')}
      ${grp.map(g => `<div class="strip"><div class="sh"><b>${g.t}</b><span>${g.range ? clock(g.range.t0) + ' – ' + clock(g.range.t1) : clock(g.at)}</span></div>${stripSvg(A, g.s, { gain, startLabel: clock(Math.max(0, g.s / A.fs)) })}</div>`).join('')}`);
  }

  /* ---- final page ---- */
  const evRowArr = A.events.map((e, i) => `<tr><td class="m">${i + 1}</td><td class="m">${clock(e.time)}</td><td>${esc(e.kind)}</td><td class="m">${fmt(A.rr[e.first])} ms</td></tr>`);
  const pRows = A.pauses.map(p => `<tr><td class="m">${clock(p.time)}</td><td class="m">${(p.ms / 1000).toFixed(2)} s</td></tr>`).join('');
  const psRows = (meta.pauses || []).filter(p => p.t1 > p.t0).map(p => `<tr><td class="m">${clock(p.t0)}</td><td class="m">${durShort(p.t1 - p.t0)}</td></tr>`).join('');
  page(`
    <div class="sec-h"><h2>Event log</h2><span>${nEv} ectopic events · ${A.pauses.length} pauses over 2 s${psRows ? ' · recording paused ' + (meta.pauses || []).length + '×' : ''}</span></div>
    ${plain('A list of every extra beat and long gap that was detected, with the time it happened, so you or your doctor can find it in the ECG strips. The methods section explains how each value was calculated.')}
    <div class="cols2">
      <div>${nEv ? `<table class="ev"><thead><tr><th>#</th><th>Time</th><th>Type</th><th>Coupling RR</th></tr></thead><tbody>${thin(evRowArr, 36).join('')}</tbody></table>${nEv > 36 ? `<p class="cap">Showing 36 of ${nEv} events, evenly spaced.</p>` : ''}` : '<p class="cap">No ectopic beats detected.</p>'}</div>
      <div style="display:flex;flex-direction:column;gap:3mm">${A.pauses.length ? `<table class="ev"><thead><tr><th>Pause begins</th><th>Duration</th></tr></thead><tbody>${pRows}</tbody></table>` : '<p class="cap">No pauses longer than 2 seconds.</p>'}
        ${psRows ? `<table class="ev"><thead><tr><th>Recording paused at</th><th>For</th></tr></thead><tbody>${psRows}</tbody></table>` : ''}</div>
    </div>
    <div class="sec-h"><h2>Methods</h2><span>{{APP_NAME}} automated analysis</span></div>
    <div class="methods">
      <p><b>Acquisition.</b> Single-lead chest ECG from a Polar H10 at 130 samples/s (µV), recorded together with the strap’s own beat-to-beat intervals (1/1024 s resolution). Paused periods and Bluetooth drop-outs are excluded from all calculations.</p>
      <p><b>Signal conditioning.</b> Zero-phase 0.5 Hz high-pass, 40 Hz low-pass and 50 Hz notch filters. Two-second segments with flat signal, clipping or muscle noise are classed as artifact.</p>
      <p><b>Beat detection.</b> Pan–Tompkins-type energy detector with adaptive thresholds and search-back; R-peak times refined to sub-sample precision by parabolic interpolation.</p>
      <p><b>Ectopic beats.</b> Flagged when a beat is more than 20 % premature and followed by a compensatory interval, or, if it arrives on time, only when its QRS clearly differs from the surrounding beats (local template; correlation below 0.6 or abnormal amplitude). Beats within 3 s form one event; only consecutive ectopic beats count as a run.</p>
      <p><b>HRV.</b> Time-domain indices follow Task Force (1996) definitions. Spectral analysis: 4 Hz resampling, linear detrending, Hann window, 5-minute segments; LF 0.04–0.15 Hz, HF 0.15–0.40 Hz. Strap intervals deviating more than 20 % from the local median are removed.</p>
      <p><b>Breathing.</b> Measured from the strap’s accelerometer (chest wall movement, 12.5 Hz after averaging): spectral peak of the three axes in 60-s windows, 3–42 breaths/min; windows with body movement or no clear rhythm are rejected. If fewer than 40 % of windows are usable, breathing is estimated instead from R-wave amplitude modulation and respiratory sinus arrhythmia (6–42/min at rest). Breathing-linked HRV is the share of 0.033–0.4 Hz HRV power within ±0.03 Hz of the breathing frequency.</p>
      <p><b>Waveform.</b> Beats averaged in 5-minute blocks and upsampled; QRS onset by slope threshold, QRS end by following each QRS wave until its slope levels off (either polarity; not measured if no clear end), T end by the tangent method. QTc is the median of per-beat values.</p>
      <p><b>Grading.</b> HRV norms are approximate, based on Nunan et al. 2010 (RMSSD 42 ± 15 ms, SDNN 50 ± 16 ms) adjusted for age, sex and position after Voss et al. 2015: below the 5th percentile = outside normal range, 5th–15th = borderline, above the 75th = favourable. QTc limits follow Goldenberg et al. 2006 (men ≤ 430 ms normal, 431–450 borderline; women ≤ 450, 451–470). Heart-rate recovery: 12 bpm or less at 1 minute is outside the normal range (Cole et al. 1999).</p>
      <p><b>Training.</b> Working maximum heart rate is the highest 20-s rolling mean from any training recording plus 2 % (a ramp-test plateau is used as measured); Tanaka (208 − 0.7 × age) is used only without training data. Fox, Tanaka, Nes and Gulati (women) are shown for context; a maximum more than 12 % above Tanaka is flagged. Recovery is measured from the end of exercise (marked, or the start of the final sustained fall) at 1 and 2 min; limits: active ≤ 12 bpm, passive ≤ 18 bpm at 1 min. LTHR is the mean heart rate of the last 20 min of a 30-min time trial (gaps excluded; at least 80 % coverage); the effort is timed from when heart rate first reaches 90 % of that value. Threshold zones follow Friel. Session maximum and minimum heart rate are taken from a 5-beat running median of normal beats, so a single stray interval cannot set them.</p>
      <p><b>Personal baseline.</b> Readings with the same context and position from the previous 30 days (minimum 5). Usual range: mean ± 1 SD of ln RMSSD; heart rate mean ± 1 SD. Exercise recovery is the fall from the 10-s peak heart rate at 60 and 120 s.</p>
    </div>
    <div class="disclaimer"><b>For general wellness and education only. Not a medical device.</b> {{APP_NAME}} is independent open-source software, has not been evaluated or cleared by any medical regulator, and is not affiliated with or endorsed by Polar Electro or any device manufacturer. This report is produced by automated analysis of a consumer heart-rate strap and may contain errors. It must not be used to diagnose, treat, rule out or monitor any medical condition, or to make decisions about medicines or treatment. A normal result does not mean your heart is healthy. Seek medical attention for symptoms such as chest pain, fainting, palpitations or breathlessness, and share this report with a clinician if you would like it reviewed.</div>`);

  const total = pages.length;
  return pages.map((inner, i) => `<div class="zoomer"><section class="page">${head}${inner}<footer class="pg-foot"><span>{{APP_NAME}} {{VERSION}} · for wellness and education only · not a medical device</span><span>Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · page ${i + 1} of ${total}</span></footer></section></div>`).join('');
}

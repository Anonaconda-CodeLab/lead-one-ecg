/* ===== {{APP_NAME}} · signal processing & analysis core =====
   Copyright (C) 2026 Anonaconda Code Lab
   SPDX-License-Identifier: GPL-3.0-or-later
*/
const FS = 130;                       // Polar H10 ECG sample rate (Hz)
const GAP = -2147483648;              // marker for missing samples (disconnects)
const MAX_SAMPLES = 8 * 3600 * FS;    // 8-hour cap

/* ---------- filters ---------- */
function design(type, f0, Q = Math.SQRT1_2) {
  const w = 2 * Math.PI * f0 / FS, c = Math.cos(w), s = Math.sin(w), a = s / (2 * Q);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
  else { b0 = 1; b1 = -2 * c; b2 = 1; } // notch
  const a0 = 1 + a;
  return [b0 / a0, b1 / a0, b2 / a0, (-2 * c) / a0, (1 - a) / a0];
}
function runBiquad(y, co) {
  const [b0, b1, b2, a1, a2] = co;
  const g = (b0 + b1 + b2) / (1 + a1 + a2);
  let x1 = y[0], x2 = y[0], y1 = y[0] * g, y2 = y1;
  for (let i = 0; i < y.length; i++) {
    const xi = y[i];
    const v = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
function filtfilt(x, co) {
  const y = new Float64Array(x);
  runBiquad(y, co); y.reverse(); runBiquad(y, co); y.reverse();
  return y;
}
/* streaming biquad for the live view */
function makeStreamFilter(co) {
  const [b0, b1, b2, a1, a2] = co; let x1 = 0, x2 = 0, y1 = 0, y2 = 0, init = false;
  return v => {
    if (!init) { x1 = x2 = v; const g = (b0 + b1 + b2) / (1 + a1 + a2); y1 = y2 = v * g; init = true; }
    const o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = o; return o;
  };
}

/* ---------- small stats ---------- */
function median(a) {
  const n = a.length; if (!n) return NaN;
  const s = Float64Array.from(a).sort();
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
function quantile(a, q) {
  const n = a.length; if (!n) return NaN;
  const s = Float64Array.from(a).sort(); const p = (n - 1) * q, i = Math.floor(p);
  return i + 1 < n ? s[i] + (s[i + 1] - s[i]) * (p - i) : s[i];
}
function mean(a) { let s = 0; for (const v of a) s += v; return a.length ? s / a.length : NaN; }
function std(a) { const m = mean(a); let s = 0; for (const v of a) s += (v - m) * (v - m); return a.length > 1 ? Math.sqrt(s / (a.length - 1)) : NaN; }
function lowerBound(arr, v) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; } return lo; }
function upsample(arr, f) {
  const n = arr.length, out = new Float64Array((n - 1) * f + 1);
  for (let i = 0; i < n - 1; i++) {
    const p0 = arr[Math.max(0, i - 1)], p1 = arr[i], p2 = arr[i + 1], p3 = arr[Math.min(n - 1, i + 2)];
    for (let j = 0; j < f; j++) {
      const t = j / f;
      out[i * f + j] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
    }
  }
  out[out.length - 1] = arr[n - 1];
  return out;
}
function fftPower(re) { // in-place radix-2 on copy, returns |X|^2 for k=0..N/2
  const N = re.length, im = new Float64Array(N); const r = Float64Array.from(re);
  for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [r[i], r[j]] = [r[j], r[i]]; } }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = r[i + j], ui = im[i + j];
        const vr = r[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = r[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        r[i + j] = ur + vr; im[i + j] = ui + vi; r[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  const P = new Float64Array(N / 2 + 1); for (let k = 0; k <= N / 2; k++) P[k] = r[k] * r[k] + im[k] * im[k];
  return P;
}

/* ---------- noise / artifact blocks (2 s) ---------- */
const BL = 2 * FS;
function noiseBlocks(x, sig, gap) {
  const n = x.length, nb = Math.ceil(n / BL);
  const hf = filtfilt(x, design('hp', 35));
  const noisy = new Uint8Array(nb), hasGap = new Uint8Array(nb);
  for (let b = 0; b < nb; b++) {
    const s = b * BL, e = Math.min(n, s + BL);
    let mn = Infinity, mx = -Infinity, h = 0, g = 0;
    for (let i = s; i < e; i++) { if (gap[i]) g++; const v = sig[i]; if (v < mn) mn = v; if (v > mx) mx = v; h += hf[i] * hf[i]; }
    const p2p = mx - mn, hr = Math.sqrt(h / (e - s));
    if (g) hasGap[b] = 1;
    if (g || p2p < 120 || p2p > 9000 || hr > 0.06 * p2p) noisy[b] = 1;
  }
  for (let b = 0; b < nb; b++) if (hasGap[b]) { if (b > 0) noisy[b - 1] = 1; if (b < nb - 1) noisy[b + 1] = 1; }
  return noisy;
}

/* ---------- QRS detection (Pan–Tompkins style) ---------- */
function detectBeats(x, sig, gap, noisyB) {
  const n = x.length;
  let b = filtfilt(x, design('hp', 8)); b = filtfilt(b, design('lp', 20));
  const e = new Float64Array(n);
  for (let i = 2; i < n - 2; i++) { const d = 2 * b[i + 1] + b[i + 2] - b[i - 2] - 2 * b[i - 1]; e[i] = d * d; }
  const w = 19, h = 9, m = new Float64Array(n); let s = 0;
  for (let i = 0; i < n; i++) { s += e[i]; if (i >= w) s -= e[i - w]; if (i >= w - 1) m[i - h] = s / w; }
  for (let i = 0; i < n; i++) if (gap[i]) m[i] = 0;
  const nb = Math.ceil(n / BL), bmax = new Float64Array(nb);
  for (let i = 0; i < n; i++) { const k = (i / BL) | 0; if (m[i] > bmax[k]) bmax[k] = m[i]; }
  const thrB = new Float64Array(nb);
  for (let k = 0; k < nb; k++) {
    const v = [];
    for (let j = Math.max(0, k - 6); j <= Math.min(nb - 1, k + 6); j++) if (bmax[j] > 0 && !noisyB[j]) v.push(bmax[j]);
    if (v.length < 3) for (let j = Math.max(0, k - 6); j <= Math.min(nb - 1, k + 6); j++) if (bmax[j] > 0) v.push(bmax[j]);
    thrB[k] = 0.2 * (v.length ? median(v) : Infinity);
  }
  const refr = Math.round(0.24 * FS), pk = [];
  for (let i = 1; i < n - 1; i++) {
    const t = thrB[(i / BL) | 0];
    if (m[i] > t && m[i] >= m[i - 1] && m[i] > m[i + 1]) {
      if (pk.length && i - pk[pk.length - 1] < refr) { if (m[i] > m[pk[pk.length - 1]]) pk[pk.length - 1] = i; }
      else pk.push(i);
    }
  }
  // search-back for missed beats (wide beats carry less high-frequency energy)
  const p2pAt = c => { let mx = -Infinity, mn = Infinity; for (let i = Math.max(0, c - 12); i <= Math.min(n - 1, c + 12); i++) { if (sig[i] > mx) mx = sig[i]; if (sig[i] < mn) mn = sig[i]; } return mx - mn; };
  const ampSample = []; for (let k = 0; k < pk.length; k += Math.max(1, Math.floor(pk.length / 400))) ampSample.push(p2pAt(pk[k]));
  const medAmp = median(ampSample) || 1000;
  const out = [];
  for (let k = 0; k < pk.length; k++) {
    out.push(pk[k]);
    if (k < pk.length - 1 && out.length > 4) {
      const rrs = []; for (let j = Math.max(1, out.length - 9); j < out.length; j++) rrs.push(out[j] - out[j - 1]);
      const med = median(rrs), gapLen = pk[k + 1] - pk[k];
      if (gapLen > 1.5 * med && gapLen < 6 * FS) {
        let best = -1, bv = 0;
        for (let j = pk[k] + refr; j < pk[k + 1] - refr; j++) if (m[j] > bv && m[j] >= m[j - 1] && m[j] > m[j + 1]) { bv = m[j]; best = j; }
        if (best > 0 && bv > 0.05 * thrB[(best / BL) | 0] && p2pAt(best) > 0.5 * medAmp) out.push(best);
      }
    }
  }
  // polarity & R refinement on the clean signal
  const W = 12; let pos = 0, neg = 0;
  for (let k = 0; k < Math.min(out.length, 600); k++) {
    let mx = -Infinity, mn = Infinity; const c = out[k];
    for (let i = Math.max(0, c - W); i <= Math.min(n - 1, c + W); i++) { if (sig[i] > mx) mx = sig[i]; if (sig[i] < mn) mn = sig[i]; }
    if (mx >= -mn) pos++; else neg++;
  }
  const pol = pos >= neg ? 1 : -1;
  const r = [];
  for (const c of out) {
    let bi = c, bv = -Infinity;
    for (let i = Math.max(0, c - W); i <= Math.min(n - 1, c + W); i++) { const v = pol * sig[i]; if (v > bv) { bv = v; bi = i; } }
    if (r.length && bi - r[r.length - 1] < refr) { if (pol * sig[bi] > pol * sig[r[r.length - 1]]) r[r.length - 1] = bi; }
    else r.push(bi);
  }
  return { r: Int32Array.from(r), pol };
}

/* ---------- template delineation ---------- */
function delineate(tp, fsu, R, rrMs, pol) {
  const ms = v => Math.round(v * fsu / 1000), L = tp.length;
  let base = 0, cnt = 0;
  for (let i = Math.max(0, R - ms(75)); i <= R - ms(45); i++) { base += tp[i]; cnt++; }
  base = cnt ? base / cnt : 0;
  const s = new Float64Array(L);
  for (let i = 1; i < L - 1; i++) s[i] = (tp[i + 1] - tp[i - 1]) / 2;
  let smax = 0;
  for (let i = Math.max(1, R - ms(60)); i < Math.min(L - 1, R + ms(80)); i++) smax = Math.max(smax, Math.abs(s[i]));
  const thr = 0.06 * smax, run = Math.max(3, ms(10));
  let on = Math.max(1, R - ms(110)), c = 0;
  for (let i = R; i > Math.max(1, R - ms(140)); i--) { if (Math.abs(s[i]) < thr) { if (++c >= run) { on = i + run - 1; break; } } else c = 0; }
  // QRS end (J): follow the QRS limb by limb from the main peak. A limb ends where its slope falls below the threshold;
  // if another large deflection follows within 40 ms (an S wave after R, or r' after S), it belongs to the QRS too.
  // This works for either polarity and stops before a raised, sloping ST segment (exercise), instead of drifting into it.
  const rAbs = Math.abs(tp[R] - base) || 1, lim = Math.min(L - 2, R + ms(140));
  let cur = R, S = R, J = -1;
  for (let w = 0; w < 4 && cur < lim; w++) {
    let i = cur + 1; const dir = Math.sign(s[i]) || 1;
    while (i < lim && Math.sign(s[i]) === dir && Math.abs(s[i]) >= thr) i++;
    if (i >= lim) break;
    let nxt = -1;   // a further QRS wave: the limb ended far from the baseline (e.g. the bottom of an S wave),
    // or a swing of more than 25 % of the main peak follows within 40 ms
    const away = Math.abs(tp[i] - base) > 0.15 * rAbs && Math.sign(tp[i] - base) !== Math.sign(tp[R] - base);
    for (let k = i + 1; k < Math.min(lim, i + ms(40)); k++) if (Math.abs(tp[k] - tp[i]) > (away ? 0.08 : 0.25) * rAbs) { nxt = k; break; }
    if (nxt < 0) { J = i; break; }
    let e = i; for (let k = i; k <= nxt; k++) if (Math.abs(tp[k] - tp[i]) > Math.abs(tp[e] - tp[i])) e = k;
    while (e + 1 < lim && Math.sign(s[e + 1]) === Math.sign(tp[nxt] - tp[i]) && Math.abs(s[e + 1]) >= thr) e++;
    S = cur = e;
  }
  const qrsOk = J > 0 && (J - R) <= ms(120);
  if (J < 0) { J = S; for (let i = S; i < lim; i++) if (Math.abs(s[i]) < Math.abs(s[J])) J = i; }
  const tLim = Math.min(L - 2, R + ms(Math.min(0.62 * rrMs, 560)));
  let tpk = Math.min(J + ms(60), tLim), tv = -1;
  for (let i = J + ms(60); i <= tLim; i++) { const v = Math.abs(tp[i] - base); if (v > tv) { tv = v; tpk = i; } }
  const sg = tp[tpk] >= base ? 1 : -1;
  let kk = tpk, kv = Infinity;
  for (let i = tpk + 1; i < Math.min(L - 1, tpk + ms(180)); i++) { const v = sg * s[i]; if (v < kv) { kv = v; kk = i; } }
  let tEnd = (s[kk] !== 0 && sg * s[kk] < 0) ? kk + (base - tp[kk]) / s[kk] : tpk + ms(80);
  if (!isFinite(tEnd) || tEnd < tpk || tEnd > tpk + ms(260)) tEnd = tpk + ms(80);
  let sys = 0, sc = 0;
  for (let i = on; i <= Math.min(L - 1, Math.round(tEnd)); i++) { sys += Math.abs(tp[i] - base); sc++; }
  return {
    on, R, S, J, tpk, tEnd, base,
    qrs: (J - on) / fsu * 1000, qrsOk: qrsOk && (J - on) / fsu * 1000 >= 40 && (J - on) / fsu * 1000 <= 180, qt: (tEnd - on) / fsu * 1000,
    rAmp: tp[R] - base, jAmp: tp[J] - base, tAmp: tp[tpk] - base, sysAmp: sc ? sys / sc : NaN
  };
}

function buildTemplate(sig, r, idx, pre, post, maxBeats = 300) {
  const L = pre + post + 1, n = sig.length;
  const use = idx.filter(k => r[k] - pre >= 0 && r[k] + post < n);
  if (use.length < 5) return null;
  const step = Math.max(1, use.length / maxBeats), pick = [];
  for (let f = 0; f < use.length && pick.length < maxBeats; f += step) pick.push(use[Math.floor(f)]);
  const tp = new Float64Array(L), col = new Float64Array(pick.length);
  for (let j = 0; j < L; j++) {
    for (let q = 0; q < pick.length; q++) { const k = pick[q]; col[q] = sig[r[k] - pre + j]; }
    tp[j] = median(col);
  }
  return { tp, count: pick.length };
}

/* ---------- HRV from a normal-to-normal series {T: beat times s, V: RR ms, C: 1 if previous beat also NN} ---------- */
function resampleSeries(T, V, s0, N, fsR) {
  const y = new Float64Array(N); let j = lowerBound(T, s0); if (j > 0) j--;
  for (let q = 0; q < N; q++) {
    const tt = s0 + q / fsR; while (j < T.length - 2 && T[j + 1] < tt) j++;
    const ta = T[j], tb = T[Math.min(j + 1, T.length - 1)], va = V[j], vb = V[Math.min(j + 1, T.length - 1)];
    y[q] = tb > ta ? va + (vb - va) * Math.min(1, Math.max(0, (tt - ta) / (tb - ta))) : va;
  }
  return y;
}
function welchPsd(y, fsR, nfft) { // detrend + Hann, one-sided PSD in units²/Hz
  const N = y.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let q = 0; q < N; q++) { sx += q; sy += y[q]; sxx += q * q; sxy += q * y[q]; }
  const sl = (N * sxy - sx * sy) / (N * sxx - sx * sx), ic = (sy - sl * sx) / N;
  const z = new Float64Array(nfft); let w2 = 0;
  for (let q = 0; q < N; q++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * q / (N - 1)); w2 += w * w; z[q] = (y[q] - (ic + sl * q)) * w; }
  const P = fftPower(z); for (let k = 0; k < P.length; k++) P[k] = (k && k < P.length - 1 ? 2 : 1) * P[k] / (fsR * w2);
  return P;
}
function freqDomain(T, V) {
  if (T.length < 60) return null;
  const first = T[0], last = T[T.length - 1], WL = Math.min(300, last - first);
  if (WL < 110) return null;
  const fsR = 4, N = Math.floor(WL * fsR); let nfft = 1; while (nfft < N) nfft <<= 1; nfft = Math.max(nfft, 1024);
  const mRR = mean(V); let acc = null, used = 0;
  for (let s0 = first; s0 + WL <= last + 1e-6; s0 += (WL >= 300 ? 150 : WL)) {
    const i0 = lowerBound(T, s0), i1 = lowerBound(T, s0 + WL + 1e-9);
    if (i1 - i0 < 0.7 * WL / (mRR / 1000)) continue;
    const P = welchPsd(resampleSeries(T, V, s0, N, fsR), fsR, nfft);
    if (!acc) acc = new Float64Array(P.length); for (let k = 0; k < P.length; k++) acc[k] += P[k]; used++;
  }
  if (!used) return null;
  for (let k = 0; k < acc.length; k++) acc[k] /= used;
  const df = fsR / nfft; let lf = 0, hf = 0, vlf = 0, lfPk = 0, hfPk = 0, lfMax = -1, hfMax = -1;
  for (let k = 1; k < acc.length; k++) {
    const f = k * df, p = acc[k] * df;
    if (f >= 0.0033 && f < 0.04) vlf += p;
    else if (f >= 0.04 && f < 0.15) { lf += p; if (acc[k] > lfMax) { lfMax = acc[k]; lfPk = f; } }
    else if (f >= 0.15 && f <= 0.4) { hf += p; if (acc[k] > hfMax) { hfMax = acc[k]; hfPk = f; } }
  }
  return { lf, hf, vlf, lfhf: hf > 0 ? lf / hf : NaN, hfPct: lf + hf > 0 ? 100 * hf / (lf + hf) : NaN, lfPeak: lfPk, hfPeak: hfPk, psd: acc, df, windows: used, winSec: WL };
}
function hrvFromSeries(S, dur) {
  const { T, V, C } = S, diffs = [];
  for (let i = 1; i < V.length; i++) if (C[i]) diffs.push(V[i] - V[i - 1]);
  const rmssd = Math.sqrt(mean(diffs.map(d => d * d))), sdnn = std(V), sdsd = std(diffs);
  const out = {
    series: S, rmssd, sdnn,
    pnn50: 100 * diffs.filter(d => Math.abs(d) > 50).length / (diffs.length || 1),
    pnn200: 100 * diffs.filter(d => Math.abs(d) > 200).length / (diffs.length || 1),
    sd1: Math.sqrt(0.5) * sdsd, sd2: Math.sqrt(Math.max(0, 2 * sdnn * sdnn - 0.5 * sdsd * sdsd)),
    fd: freqDomain(T, V)
  };
  // windowed RMSSD / pNN50 / HR
  const win = dur <= 5400 ? 60 : 300, windows = [];
  for (let s0 = 0; s0 < dur - win * 0.5; s0 += win) {
    const i0 = lowerBound(T, s0), i1 = lowerBound(T, s0 + win), d = [], v = [];
    for (let i = i0; i < i1; i++) { v.push(V[i]); if (i > i0 && C[i]) d.push(V[i] - V[i - 1]); }
    if (d.length >= 15) windows.push({ t0: s0, t1: Math.min(dur, s0 + win), rmssd: Math.sqrt(mean(d.map(q => q * q))), pnn50: 100 * d.filter(q => Math.abs(q) > 50).length / d.length, hr: 60000 / mean(v) });
  }
  let ep = 0, inEp = false;
  for (let s0 = 0; s0 + 60 <= dur; s0 += 60) {
    const i0 = lowerBound(T, s0), i1 = lowerBound(T, s0 + 60), d = [];
    for (let i = i0 + 1; i < i1; i++) if (C[i]) d.push(V[i] - V[i - 1]);
    const p = d.length >= 15 ? 100 * d.filter(q => Math.abs(q) > 50).length / d.length : 0;
    if (p > 55) { if (!inEp) ep++; inEp = true; } else inEp = false;
  }
  return Object.assign(out, { windows, winSec: win, pnnEpisodes: ep });
}
/* the strap's own beat intervals: [[tEndSec, rrMs], …], rrMs < 0 marks a break (pause / disconnect) */
function seriesFromH10(list) {
  const S = { T: [], V: [], C: [], artifacts: 0, total: 0, badT: [] };
  let seg = [];
  const flush = () => {
    for (let i = 0; i < seg.length; i++) {
      const v = []; for (let j = Math.max(0, i - 10); j <= Math.min(seg.length - 1, i + 10); j++) if (j !== i) v.push(seg[j][1]);
      const lm = v.length >= 4 ? median(v) : seg[i][1];
      seg[i].bad = seg[i][1] < 300 || seg[i][1] > 2500 || Math.abs(seg[i][1] - lm) > 0.2 * lm;
    }
    for (let i = 0; i < seg.length; i++) {
      S.total++; if (seg[i].bad) { S.artifacts++; S.badT.push(seg[i][0]); continue; }
      S.T.push(seg[i][0]); S.V.push(seg[i][1]); S.C.push(i > 0 && !seg[i - 1].bad ? 1 : 0);
    }
    seg = [];
  };
  for (const p of list) { if (p[1] < 0) flush(); else seg.push([p[0], p[1]]); }
  flush();
  return S;
}
/* breathing rate: combined spectra of R-amplitude (EDR) and NN intervals (RSA), 90-s windows */
function breathingRate(aT, aV, nT, nV, dur, fMin = 0.1) {
  if (aT.length < 40 || nT.length < 40) return null;
  const fsR = 4, WL = Math.min(90, aT[aT.length - 1] - aT[0]); if (WL < 45) return null;
  const N = Math.floor(WL * fsR), nfft = 1024, df = fsR / nfft, series = [];
  for (let s0 = aT[0]; s0 + WL <= aT[aT.length - 1] + 1e-6; s0 += 30) {
    const i0 = lowerBound(aT, s0), i1 = lowerBound(aT, s0 + WL), j0 = lowerBound(nT, s0), j1 = lowerBound(nT, s0 + WL);
    if (i1 - i0 < WL * 0.5 || j1 - j0 < WL * 0.5) continue;
    const Pa = welchPsd(resampleSeries(aT, aV, s0, N, fsR), fsR, nfft), Pr = welchPsd(resampleSeries(nT, nV, s0, N, fsR), fsR, nfft);
    let sa = 0, sr = 0; const k0 = Math.ceil(fMin / df), k1 = Math.floor(0.7 / df);
    for (let k = k0; k <= k1; k++) { sa += Pa[k]; sr += Pr[k]; }
    let best = -1, bk = 0;
    for (let k = k0; k <= k1; k++) { const v = (sa ? Pa[k] / sa : 0) + 0.6 * (sr ? Pr[k] / sr : 0); if (v > best) { best = v; bk = k; } }
    // parabolic peak refinement
    const sc = k => (sa ? Pa[k] / sa : 0) + 0.6 * (sr ? Pr[k] / sr : 0);
    let f = bk * df; if (bk > k0 && bk < k1) { const a = sc(bk - 1), b = sc(bk), c = sc(bk + 1), den = a - 2 * b + c; if (den < 0) f = (bk + 0.5 * (a - c) / den) * df; }
    series.push({ t: s0 + WL / 2, br: f * 60 });
  }
  if (!series.length) return null;
  const v = series.map(s => s.br);
  return { median: median(v), lo: quantile(v, 0.1), hi: quantile(v, 0.9), series };
}

/* breathing from the strap's accelerometer: chest rise and fall, measured directly.
   acc = { fs, t0, data: Int16Array [x,y,z,...] in milli-g, -32768 = missing }.
   Windows with body movement (large changes in total acceleration) or no clear rhythm are rejected. */
function accBreathing(acc, fMin = 0.05, winSec = 60) {
  if (!acc || !acc.fs || !acc.data) return null;
  const fs = acc.fs, d = acc.data, n = Math.floor(d.length / 3), N = Math.floor(winSec * fs);
  if (n < N || N < 20 * fs) return null;
  let nfft = 1; while (nfft < N * 2) nfft <<= 1;
  const df = fs / nfft, k0 = Math.max(1, Math.ceil(fMin / df)), k1 = Math.floor(0.7 / df), step = Math.max(1, Math.round(15 * fs));
  const series = []; let total = 0, moving = 0;
  const ax = [new Float64Array(N), new Float64Array(N), new Float64Array(N)];
  for (let s0 = 0; s0 + N <= n; s0 += step) {
    total++; let gap = false;
    for (let i = 0; i < N && !gap; i++) { const o = 3 * (s0 + i); if (d[o] === -32768) gap = true; else { ax[0][i] = d[o]; ax[1][i] = d[o + 1]; ax[2][i] = d[o + 2]; } }
    if (gap) { total--; continue; }
    // movement check: variation in total acceleration (posture shifts, walking) beyond what breathing produces
    let sm = 0, sm2 = 0, jerk = 0;
    for (let i = 0; i < N; i++) { const m = Math.hypot(ax[0][i], ax[1][i], ax[2][i]); sm += m; sm2 += m * m; if (i) { const p = Math.hypot(ax[0][i - 1], ax[1][i - 1], ax[2][i - 1]); jerk += (m - p) * (m - p); } }
    const sdMag = Math.sqrt(Math.max(0, sm2 / N - (sm / N) ** 2)), rmsJerk = Math.sqrt(jerk / (N - 1));
    if (sdMag > 45 || rmsJerk > 25) { moving++; continue; }
    const P = new Float64Array(nfft / 2 + 1);
    for (const a of ax) { const p = welchPsd(a, fs, nfft); for (let k = 0; k < P.length; k++) P[k] += p[k]; }
    let bk = k0, bv = -1; const band = [];
    for (let k = k0; k <= k1; k++) { band.push(P[k]); if (P[k] > bv) { bv = P[k]; bk = k; } }
    const prom = bv / (median(band) || 1e-9);
    if (prom < 6) continue;
    let f = bk * df;
    if (bk > k0 && bk < k1) { const a = P[bk - 1], b = P[bk], c = P[bk + 1], den = a - 2 * b + c; if (den < 0) f = (bk + 0.5 * (a - c) / den) * df; }
    series.push({ t: (acc.t0 || 0) + (s0 + N / 2) / fs, br: f * 60, prom });
  }
  if (!total || series.length < Math.max(1, Math.ceil(0.4 * total))) return null;
  const v = series.map(s => s.br);
  return { median: median(v), lo: quantile(v, 0.1), hi: quantile(v, 0.9), series, source: 'acc', stillPct: 100 * (total - moving) / total, windows: total, valid: series.length };
}
function accStillness(acc) {
  if (!acc || !acc.fs || !acc.data) return null;
  const fs = acc.fs, d = acc.data, n = Math.floor(d.length / 3), W = Math.round(10 * fs); let tot = 0, still = 0;
  for (let s0 = 0; s0 + W <= n; s0 += W) {
    let sm = 0, sm2 = 0, ok = true;
    for (let i = s0; i < s0 + W; i++) { const o = 3 * i; if (d[o] === -32768) { ok = false; break; } const m = Math.hypot(d[o], d[o + 1], d[o + 2]); sm += m; sm2 += m * m; }
    if (!ok) continue; tot++; if (Math.sqrt(Math.max(0, sm2 / W - (sm / W) ** 2)) <= 45) still++;
  }
  return tot ? 100 * still / tot : null;
}

/* ---------- exercise: rolling heart rate, end of session, recovery, tests, zones ---------- */
function cleanBeats(A) {
  const T = [], R = [];
  for (let k = 1; k < A.beats; k++) if (A.rrOk[k] && !A.ect[k] && !A.ect[k - 1]) { T.push(A.t[k]); R.push(A.rr[k]); }
  const C = new Float64Array(R.length + 1); for (let i = 0; i < R.length; i++) C[i + 1] = C[i] + R[i];
  return { T, R, C };
}
/* time-weighted mean heart rate in centred windows of `win` s, every `step` s (needs 70 % beat coverage) */
function rollingHR(A, win, step = 1, B = cleanBeats(A)) {
  const out = [], { T, C } = B; if (T.length < 3) return out;
  for (let c = win / 2; c <= A.dur - win / 2 + 1e-9; c += step) {
    const i0 = lowerBound(T, c - win / 2), i1 = lowerBound(T, c + win / 2), sm = C[i1] - C[i0];
    if (i1 - i0 >= 3 && sm >= 700 * win) out.push({ t: c, v: 60000 * (i1 - i0) / sm });
  }
  return out;
}
function meanHRBetween(B, t0, t1) {
  const i0 = lowerBound(B.T, t0), i1 = lowerBound(B.T, t1), sm = B.C[i1] - B.C[i0];
  return { v: i1 - i0 >= 3 ? 60000 * (i1 - i0) / sm : NaN, cover: (t1 > t0) ? sm / 1000 / (t1 - t0) : 0 };
}
function exerciseResponse(A, recMark) {
  const B = cleanBeats(A), s10 = rollingHR(A, 10, 1, B), s20 = rollingHR(A, 20, 1, B);
  if (!s10.length) return null;
  const n = s10.length, times = s10.map(p => p.t), tEnd = s10[n - 1].t;
  const pk10 = s10.reduce((a, b) => b.v > a.v ? b : a), pk20 = s20.length ? s20.reduce((a, b) => b.v > a.v ? b : a) : null;
  const at = t => { const i = lowerBound(times, t - 3); return i < n && Math.abs(s10[i].t - t) <= 3 ? s10[i].v : NaN; };
  const base = { peak: pk10.v, peakT: pk10.t, peak20: pk20 ? pk20.v : NaN, peak20T: pk20 ? pk20.t : NaN, endHR: s10[n - 1].v, end: null, src: null };
  let end = null, src = null, stop = NaN;
  if (isFinite(recMark) && recMark > 15 && recMark < A.dur - 5) {
    end = recMark; src = 'marked'; stop = at(recMark - 5); if (!isFinite(stop)) stop = at(recMark);
  } else {
    // auto: the latest heart-rate high point that everything afterwards stays below, followed by a clear fall
    // (>= 10 bpm within 2 min) and no renewed effort (nothing within 12 bpm of it from 1 min later onwards)
    const suf = new Float64Array(n + 1).fill(-Infinity);
    for (let i = n - 1; i >= 0; i--) suf[i] = Math.max(s10[i].v, suf[i + 1]);
    // scan left to right so the highest qualifying point (the start of the final fall) wins
    for (let i = 0; i < n; i++) {
      const p = s10[i]; if (p.v < suf[i + 1] || tEnd - p.t < 60 || p.v < 90) continue;
      let mn = Infinity; for (let j = i + 1; j < n && s10[j].t - p.t <= 120; j++) mn = Math.min(mn, s10[j].v);
      const later = suf[lowerBound(times, p.t + 60)];
      if (p.v - mn >= 10 && later <= p.v - 12) {
        // the effort may continue a little below its top before you stop: the end is where the final fall begins,
        // i.e. the highest point in the 45 s before heart rate first drops more than 10 bpm below the top
        let k = i; while (k < n - 1 && !(s10[k].v < p.v - 10)) k++;
        let b = i; for (let j = i; j <= k; j++) if (s10[j].t >= s10[k].t - 45 && (s10[b].t < s10[k].t - 45 || s10[j].v >= s10[b].v)) b = j;
        end = s10[b].t; src = 'auto'; stop = s10[b].v; break;
      }
    }
  }
  if (end == null || !isFinite(stop)) return base;
  const a60 = end + 60 <= tEnd + 3 ? at(end + 60) : NaN, a120 = end + 120 <= tEnd + 3 ? at(end + 120) : NaN;
  let fl = { v: Infinity, t: end }; for (const q of s10) if (q.t >= end && q.v < fl.v) fl = q;
  const drop = stop - fl.v;
  return Object.assign(base, { end, src, stop, at60: a60, at120: a120, hrr60: stop - a60, hrr120: stop - a120,
    floor: fl.v, floorT: fl.t, drop, pct60: drop > 2 ? 100 * (stop - a60) / drop : NaN, after: tEnd - end });
}
/* ramp test: 3-minute steps from the start of the recording to failure */
function rampTest(A, ER, step = 180) {
  const B = cleanBeats(A), s20 = rollingHR(A, 20, 1, B);
  const fail = ER && ER.end != null ? ER.end : (s20.length ? s20[s20.length - 1].t + 10 : A.dur);
  const steps = [];
  for (let k = 0; k * step < fail - 5; k++) {
    const t0 = k * step, t1 = Math.min((k + 1) * step, fail), done = (k + 1) * step <= fail + 5;
    steps.push({ n: k + 1, t0, t1, done, hr: meanHRBetween(B, Math.max(t0, t1 - 30), t1).v });
  }
  const pre = s20.filter(p => p.t <= fail + 5), mx = pre.length ? pre.reduce((a, b) => b.v > a.v ? b : a) : null;
  const comp = steps.filter(s => s.done && isFinite(s.hr)), ref = comp.filter(s => s.t1 <= fail - 60).pop();
  const plateau = !!(mx && comp.length >= 3 && ref && mx.v - ref.hr <= 2);
  return { steps, fail, failSrc: ER && ER.end != null ? ER.src : 'end', completed: comp.length, max: mx ? mx.v : NaN, maxT: mx ? mx.t : NaN,
    plateau, valid: comp.length >= 3 && !!mx };
}
/* DFA alpha1: short-term fractal scaling of beat intervals (detrended fluctuation analysis, box sizes 4-16 beats).
   About 1.0 at easy effort, falling with intensity: 0.75 marks the aerobic threshold (HRVT1), 0.5 the anaerobic
   threshold (HRVT2) [Rogers et al. 2021; Gronwald et al. 2019]. */
function dfaAlpha1(x) {
  const N = x.length; if (N < 50) return NaN;
  let m = 0; for (let i = 0; i < N; i++) m += x[i]; m /= N;
  const y = new Float64Array(N); let c = 0; for (let i = 0; i < N; i++) { c += x[i] - m; y[i] = c; }
  const L = [], F = [];
  for (let n = 4; n <= 16; n++) {
    const nb = Math.floor(N / n); if (nb < 2) break;
    const sx = n * (n - 1) / 2, sxx = (n - 1) * n * (2 * n - 1) / 6, d = n * sxx - sx * sx;
    let ss = 0, cnt = 0;
    for (let dir = 0; dir < 2; dir++) for (let b = 0; b < nb; b++) {          // boxes from the start and from the end
      const o = dir ? N - (b + 1) * n : b * n;
      let sy = 0, sxy = 0; for (let i = 0; i < n; i++) { sy += y[o + i]; sxy += i * y[o + i]; }
      const b1 = (n * sxy - sx * sy) / d, b0 = (sy - b1 * sx) / n;
      for (let i = 0; i < n; i++) { const r = y[o + i] - b0 - b1 * i; ss += r * r; } cnt += n;
    }
    if (ss > 0) { L.push(Math.log(n)); F.push(0.5 * Math.log(ss / cnt)); }
  }
  if (L.length < 5) return NaN;
  const k = L.length, mx = L.reduce((a, b) => a + b) / k, my = F.reduce((a, b) => a + b) / k;
  let num = 0, den = 0; for (let i = 0; i < k; i++) { num += (L[i] - mx) * (F[i] - my); den += (L[i] - mx) ** 2; }
  return num / den;
}
/* beat intervals for DFA: the strap's 1-ms intervals when recorded (artifacts removed), otherwise ECG normal beats */
function dfaBeats(A) {
  if (A.h10 && A.h10.T.length > 100) return { T: A.h10.T, V: A.h10.V, badT: A.h10.badT || [], src: 'strap' };
  const T = [], V = [], badT = [];
  for (let k = 1; k < A.beats; k++) { if (A.rrOk[k] && !A.ect[k] && !A.ect[k - 1]) { T.push(A.t[k]); V.push(A.rr[k]); } else badT.push(A.t[k]); }
  return { T, V, badT, src: 'ecg' };
}
/* DFA-alpha1 threshold test: alpha1 in 2-minute windows every 10 s through an incremental effort, then the heart rates
   where the alpha1-versus-heart-rate line crosses 0.75 (HRVT1, aerobic) and 0.5 (HRVT2, anaerobic). */
function dfaTest(A, ER, WIN = 120, STEP = 10) {
  const B = dfaBeats(A), end = ER && ER.end != null ? ER.end : A.dur;
  const pts = [];
  for (let t1 = WIN; t1 <= end + 1e-6; t1 += STEP) {
    const i0 = lowerBound(B.T, t1 - WIN), i1 = lowerBound(B.T, t1), n = i1 - i0;
    const bad = lowerBound(B.badT, t1) - lowerBound(B.badT, t1 - WIN), art = n + bad ? bad / (n + bad) : 1;
    if (n < 90) continue;
    const x = B.V.slice(i0, i1), a1 = dfaAlpha1(x), hr = 60000 * n / x.reduce((a, b) => a + b, 0);
    if (isFinite(a1)) pts.push({ t: t1 - WIN / 2, a1, hr, art, ok: art <= 0.05 });
  }
  const ok = pts.filter(p => p.ok), out = { pts, src: B.src, end, valid: false, vt1: NaN, vt2: NaN, fit: null, reason: '' };
  out.artPct = pts.length ? 100 * pts.reduce((a, p) => a + p.art, 0) / pts.length : NaN;
  if (ok.length < 12) { out.reason = pts.length < 12 ? 'short' : 'artifacts'; return out; }
  const sm = ok.map((p, i) => median(ok.slice(Math.max(0, i - 2), i + 3).map(q => q.a1)));   // 5-window running median
  out.startA1 = median(sm.slice(0, Math.min(6, sm.length))); out.minA1 = Math.min(...sm); out.maxHR = Math.max(...ok.map(p => p.hr));
  // fit the falling part: from the highest (smoothed) alpha1 in the first 60 % of the test to the end
  const firstPart = Math.max(1, Math.floor(0.6 * sm.length)); let top = 0;
  for (let i = 1; i < firstPart; i++) if (sm[i] > sm[top]) top = i;
  const use = ok.slice(top).filter(p => p.a1 >= 0.2 && p.a1 <= 1.5);
  if (use.length < 8) { out.reason = 'flat'; return out; }
  const mh = use.reduce((a, p) => a + p.hr, 0) / use.length, ma = use.reduce((a, p) => a + p.a1, 0) / use.length;
  let sxy = 0, sxx = 0, syy = 0; for (const p of use) { sxy += (p.hr - mh) * (p.a1 - ma); sxx += (p.hr - mh) ** 2; syy += (p.a1 - ma) ** 2; }
  const b = sxx ? sxy / sxx : 0, a = ma - b * mh, r2 = sxx && syy ? sxy * sxy / (sxx * syy) : 0;
  out.fit = { a, b, r2, n: use.length, hrLo: Math.min(...use.map(p => p.hr)), hrHi: Math.max(...use.map(p => p.hr)) };
  if (!(b < 0) || r2 < 0.3) { out.reason = 'flat'; return out; }
  const at = v => (v - a) / b, inRange = h => h >= out.fit.hrLo - 5 && h <= out.fit.hrHi + 3;
  if (out.startA1 < 0.75) out.reason = 'startLow';
  else if (out.minA1 > 0.8) out.reason = 'notHard';
  else { const v1 = at(0.75); if (inRange(v1)) { out.vt1 = v1; out.valid = true; } else out.reason = 'flat'; }
  if (out.valid && out.minA1 <= 0.55) { const v2 = at(0.5); if (inRange(v2) && v2 > out.vt1) out.vt2 = v2; }
  return out;
}
/* LTHR: mean heart rate over the last 20 minutes of a 30-minute time trial */
function lthrTest(A, ER) {
  const B = cleanBeats(A), end = ER && ER.end != null ? ER.end : (B.T.length ? B.T[B.T.length - 1] : A.dur);
  const from = Math.max(0, end - 1200), m = meanHRBetween(B, from, end);
  // the effort begins when heart rate first reaches 90 % of the threshold; Start may have been pressed a little early
  const s20 = rollingHR(A, 20, 1, B), on = isFinite(m.v) ? s20.find(q => q.t < from && q.v >= 0.9 * m.v) : null;
  const onset = on ? Math.max(0, on.t - 10) : 0, eff = end - onset;
  return { lthr: m.v, from, end, onset, effortMin: eff / 60, cover: m.cover, valid: eff >= 25 * 60 && m.cover > 0.8 && isFinite(m.v), short: eff < 25 * 60 };
}
/* interval training: the hard efforts and the recoveries between them, from 10-s heart rate up to the end of exercise.
   An effort is a stretch above 60 % of the way from the session's low (10th percentile) to its high (98th percentile),
   lasting at least 20 s; dips shorter than 20 s are bridged. */
function intervalWork(A, ER) {
  const B = cleanBeats(A), s10 = rollingHR(A, 10, 2, B); if (s10.length < 30) return null;
  const end = ER && ER.end != null ? ER.end : s10[s10.length - 1].t, ex = s10.filter(p => p.t <= end);
  if (ex.length < 30) return null;
  const vs = ex.map(p => p.v).sort((a, b) => a - b), lo = vs[Math.floor(0.1 * vs.length)], hi = vs[Math.min(vs.length - 1, Math.floor(0.98 * vs.length))];
  if (!(hi - lo >= 15)) return { bouts: [], lo, hi, thr: NaN, end };
  const thr = lo + 0.6 * (hi - lo), segs = [];
  let cur = null;
  for (const p of ex) if (p.v >= thr) { if (cur && p.t - cur.t1 <= 20) cur.t1 = p.t; else { cur = { t0: p.t, t1: p.t }; segs.push(cur); } }
  const efforts = segs.filter(q => q.t1 - q.t0 >= 20);
  const bouts = efforts.map((q, i) => {
    const pts = ex.filter(p => p.t >= q.t0 && p.t <= q.t1), pk = pts.reduce((a, b) => b.v > a.v ? b : a);
    const nextT = i + 1 < efforts.length ? efforts[i + 1].t0 : end, rec = ex.filter(p => p.t > q.t1 && p.t <= nextT);
    const mn = rec.length ? rec.reduce((a, b) => b.v < a.v ? b : a) : null;
    return { n: i + 1, t0: q.t0, dur: q.t1 - q.t0, peak: pk.v, mean: mean(pts.map(p => p.v)), recSec: Math.max(0, nextT - q.t1), recMin: mn ? mn.v : NaN, recDrop: mn ? pk.v - mn.v : NaN, last: i + 1 === efforts.length };
  });
  const fade = bouts.length >= 3 ? bouts[bouts.length - 1].peak - bouts[0].peak : NaN;
  return { bouts, thr, lo, hi, end, fade };
}
/* tempo: the sustained block (from the first time heart rate reaches 92 % of the session's upper-quartile level to the
   end of exercise), how steadily it was held, and cardiac drift (mean HR of the second half vs the first half) */
function tempoWork(A, ER) {
  const B = cleanBeats(A), s10 = rollingHR(A, 10, 2, B); if (s10.length < 30) return null;
  const end = ER && ER.end != null ? ER.end : s10[s10.length - 1].t, ex = s10.filter(p => p.t <= end);
  if (ex.length < 30) return null;
  const vs = ex.map(p => p.v).sort((a, b) => a - b), q75 = vs[Math.floor(0.75 * vs.length)];
  const first = ex.find(p => p.v >= 0.92 * q75); if (!first) return null;
  const main = ex.filter(p => p.t >= first.t), t0 = first.t, half = (t0 + end) / 2;
  const m1 = mean(main.filter(p => p.t <= half).map(p => p.v)), m2 = mean(main.filter(p => p.t > half).map(p => p.v));
  const avg = mean(main.map(p => p.v)), within = main.filter(p => Math.abs(p.v - avg) <= 5).length / Math.max(1, main.length);
  return { t0, end, dur: end - t0, avg, m1, m2, drift: 100 * (m2 - m1) / m1, within, valid: end - t0 >= 10 * 60 && isFinite(m1) && isFinite(m2) };
}
const PCT_ZONES = [['Rest', 0, 0.6], ['Recovery', 0.6, 0.7], ['Aerobic', 0.7, 0.8], ['Anaerobic', 0.8, 0.9], ['Maximum', 0.9, 10]];
const LTHR_ZONES = [['Z1 Recovery', 0, 0.85], ['Z2 Aerobic', 0.85, 0.90], ['Z3 Tempo', 0.90, 0.95], ['Z4 Sub-threshold', 0.95, 1.0],
  ['Z5a Super-threshold', 1.0, 1.03], ['Z5b Aerobic capacity', 1.03, 1.07], ['Z5c Anaerobic capacity', 1.07, 10]];
function zoneTime(A, ref, defs) {
  const zones = defs.map(([name, lo, hi]) => ({ name, lo, hi, bpmLo: Math.round(lo * ref), bpmHi: hi > 5 ? Infinity : Math.round(hi * ref), sec: 0 }));
  if (!(ref > 0)) return zones;
  for (let k = 1; k < A.beats; k++) if (A.rrOk[k]) { const f = 60000 / A.rr[k] / ref; const z = zones.find(z => f >= z.lo && f < z.hi) || zones[zones.length - 1]; z.sec += A.rr[k] / 1000; }
  return zones;
}

/* ---------- full analysis ---------- */
async function analyze(raw, opts = {}, progress = () => {}) {
  const tick = () => new Promise(res => setTimeout(res, 0));
  const n = raw.length;
  if (n < FS * 30) throw new Error('This recording is shorter than 30 seconds, which is too short to analyze.');
  const x = new Float64Array(n), gap = new Uint8Array(n);
  let last = 0, first = -1, gapCount = 0;
  for (let i = 0; i < n; i++) { const v = raw[i]; if (v === GAP) { gap[i] = 1; x[i] = last; gapCount++; } else { x[i] = v; last = v; if (first < 0) first = i; } }
  if (first < 0) throw new Error('This recording contains no ECG signal.');
  for (let i = 0; i < first; i++) x[i] = x[first];

  progress(0.06, 'Cleaning the signal'); await tick();
  let sig = filtfilt(x, design('hp', 0.5)); sig = filtfilt(sig, design('lp', 40)); sig = filtfilt(sig, design('notch', 50, 4));
  progress(0.22, 'Checking signal quality'); await tick();
  const noisyB = noiseBlocks(x, sig, gap);
  progress(0.32, 'Finding heartbeats'); await tick();
  const { r, pol } = detectBeats(x, sig, gap, noisyB);
  const nb = r.length;
  if (nb < 20) throw new Error('Too few heartbeats were found. Check that the strap was worn and moistened.');
  progress(0.48, 'Classifying beats'); await tick();

  // sub-sample R-peak timing (parabolic interpolation), ~1 ms precision instead of 7.7 ms
  const rf = new Float64Array(nb);
  for (let k = 0; k < nb; k++) {
    const c = r[k]; rf[k] = c;
    if (c > 0 && c < n - 1) {
      const a = pol * sig[c - 1], b = pol * sig[c], d = pol * sig[c + 1], den = a - 2 * b + d;
      if (den < 0) rf[k] = c + Math.max(-0.5, Math.min(0.5, 0.5 * (a - d) / den));
    }
  }
  const t = new Float64Array(nb); for (let k = 0; k < nb; k++) t[k] = rf[k] / FS;
  const noise = new Uint8Array(nb); for (let k = 0; k < nb; k++) noise[k] = noisyB[(r[k] / BL) | 0];
  const rr = new Float64Array(nb).fill(NaN), rrOk = new Uint8Array(nb);
  for (let k = 1; k < nb; k++) { rr[k] = (rf[k] - rf[k - 1]) * 1000 / FS; rrOk[k] = !noise[k] && !noise[k - 1] && rr[k] < 6000 ? 1 : 0; }
  const okRR = []; for (let k = 1; k < nb; k++) if (rrOk[k]) okRR.push(rr[k]);
  const medRR = median(okRR) || 1000;

  // local median RR (±10 beats, excluding k and k+1)
  const lmed = new Float64Array(nb);
  for (let k = 0; k < nb; k++) {
    const v = [];
    for (let j = Math.max(1, k - 10); j <= Math.min(nb - 1, k + 11); j++) if (j !== k && j !== k + 1 && rrOk[j]) v.push(rr[j]);
    lmed[k] = v.length >= 4 ? median(v) : medRR;
  }

  // global template & morphology correlation
  const pre = Math.round(0.25 * FS), post = Math.round(Math.min(0.62, 0.85 * medRR / 1000) * FS);
  const good = []; for (let k = 1; k < nb; k++) if (rrOk[k] && Math.abs(rr[k] - lmed[k]) < 0.15 * lmed[k]) good.push(k);
  const G = buildTemplate(sig, r, good.length > 20 ? good : Array.from({ length: nb }, (_, i) => i), pre, post, 400);
  // morphology: each beat is compared with a LOCAL template (median of the surrounding clean beats), over the QRS only
  // (-46 to +62 ms). A session-wide template made ordinary beats look "different" at high heart rates, when the P wave,
  // ST segment and T wave shift; comparing like with like removes those false flags.
  const corr = new Float64Array(nb).fill(1), amp = new Float64Array(nb).fill(1);
  if (G) {
    const a0 = -6, a1 = 8, W = a1 - a0 + 1, goodSet = new Uint8Array(nb); for (const k of good) goodSet[k] = 1;
    const col = new Float64Array(40), loc = new Float64Array(W), b = new Float64Array(W);
    for (let k = 0; k < nb; k++) {
      const c = r[k]; if (c + a0 < 0 || c + a1 >= n) continue;
      const nb_ = []; for (let j = k - 20; j <= k + 20 && nb_.length < 40; j++) if (j !== k && j >= 0 && j < nb && goodSet[j] && r[j] + a0 >= 0 && r[j] + a1 < n) nb_.push(j);
      if (nb_.length < 8) continue;
      for (let q = 0; q < W; q++) { for (let m = 0; m < nb_.length; m++) col[m] = sig[r[nb_[m]] + a0 + q]; loc[q] = median(col.subarray(0, nb_.length)); b[q] = sig[c + a0 + q]; }
      const ml = mean(loc), mb = mean(b); let sxy = 0, sl = 0, sb = 0, pl = -Infinity, ql = Infinity, pb = -Infinity, qb = Infinity;
      for (let q = 0; q < W; q++) { const lv = loc[q] - ml, bv = b[q] - mb; sxy += lv * bv; sl += lv * lv; sb += bv * bv;
        if (loc[q] > pl) pl = loc[q]; if (loc[q] < ql) ql = loc[q]; if (b[q] > pb) pb = b[q]; if (b[q] < qb) qb = b[q]; }
      corr[k] = sl > 0 && sb > 0 ? sxy / Math.sqrt(sl * sb) : 1;
      amp[k] = pl - ql > 0 ? (pb - qb) / (pl - ql) : 1;     // QRS peak-to-peak relative to the local template
    }
  }
  const ect = new Uint8Array(nb), ectKind = new Array(nb).fill(null);
  for (let k = 1; k < nb; k++) {
    if (noise[k]) continue;
    const lm = lmed[k];
    const prem = rrOk[k] && k + 1 < nb && rrOk[k + 1] && rr[k] < 0.8 * lm && rr[k + 1] > 1.08 * lm && (rr[k + 1] - rr[k]) > 0.3 * lm;
    // shape alone (normal timing) needs a clearly different QRS: a beat that arrives on time is rarely ectopic, and
    // movement or electrode noise changes the shape of ordinary beats. Early beats need less shape evidence.
    const morph = prem ? (corr[k] < 0.8 || amp[k] < 0.5 || amp[k] > 2) : (corr[k] < 0.6 || amp[k] < 0.4 || amp[k] > 2.5);
    if (prem || morph) { ect[k] = 1; ectKind[k] = morph ? (prem ? 'Premature, different shape' : 'Different shape') : 'Premature'; }
  }
  // events (group ectopic beats within 3 s)
  const events = [];
  for (let k = 0; k < nb; k++) if (ect[k]) {
    const ev = events[events.length - 1];
    // beats within 3 s form one event; only CONSECUTIVE ectopic beats are a "run"
    if (ev && t[k] - t[ev.last] < 3) {
      ev.run = ev.last === k - 1 ? ev.run + 1 : 1; ev.maxRun = Math.max(ev.maxRun, ev.run); ev.last = k; ev.beats++;
      ev.kind = ev.maxRun >= 2 ? (ev.maxRun === 2 ? 'Couplet (2 in a row)' : 'Run of ' + ev.maxRun + ' beats') : ev.beats + ' ectopic beats within ' + Math.max(1, Math.round(t[k] - ev.time)) + ' s';
    }
    else events.push({ first: k, last: k, beats: 1, run: 1, maxRun: 1, kind: ectKind[k], time: t[k] });
  }

  // NN intervals
  const nn = new Uint8Array(nb);
  for (let k = 1; k < nb; k++) nn[k] = rrOk[k] && !ect[k] && !ect[k - 1] && rr[k] >= 300 && rr[k] <= 2500 && Math.abs(rr[k] - lmed[k]) < 0.3 * lmed[k] ? 1 : 0;
  const nnT = [], nnV = [];
  for (let k = 1; k < nb; k++) if (nn[k]) { nnT.push(t[k]); nnV.push(rr[k]); }
  const meanNN = mean(nnV), meanHR = 60000 / meanNN;
  // HRV series: ECG-derived, and the strap's own beat intervals when recorded
  const ecgSeries = { T: [], V: [], C: [] };
  for (let k = 1; k < nb; k++) if (nn[k]) { ecgSeries.T.push(t[k]); ecgSeries.V.push(rr[k]); ecgSeries.C.push(k > 1 && nn[k - 1] ? 1 : 0); }
  const dur = n / FS;
  const ecgHrv = hrvFromSeries(ecgSeries, dur);
  const h10Series = opts.rr && opts.rr.length ? seriesFromH10(opts.rr) : null;
  let validBeats = 0; for (let k = 1; k < nb; k++) if (rrOk[k]) validBeats++;
  const useH10 = h10Series && h10Series.T.length >= Math.max(30, 0.8 * validBeats);
  const H = useH10 ? hrvFromSeries(h10Series, dur) : ecgHrv;
  const { rmssd, pnn50, pnn200, sdnn, sd1, sd2 } = H;

  progress(0.6, 'Measuring heart rate'); await tick();
  // extremes from a 5-beat running median of normal beats: one stray interval (for example a premature beat the
  // detector missed, and its compensatory pause) cannot set the maximum or minimum
  let maxHR = { v: -1, t: 0, k: 0 }, minHR = { v: 1e9, t: 0, k: 0 };
  { const ks = []; for (let k = 1; k < nb; k++) if (nn[k]) ks.push(k);
    for (let i = 2; i + 2 < ks.length; i++) {
      if (t[ks[i + 2]] - t[ks[i - 2]] > 8) continue;                  // the five beats must be close together
      const w = [ks[i - 2], ks[i - 1], ks[i], ks[i + 1], ks[i + 2]].map(k => rr[k]).sort((a, b) => a - b), h = 60000 / w[2], k = ks[i];
      if (h > maxHR.v) maxHR = { v: h, t: t[k], k }; if (h < minHR.v) minHR = { v: h, t: t[k], k };
    }
    if (maxHR.v < 0) for (const k of ks) { const h = 60000 / rr[k]; if (h > maxHR.v) maxHR = { v: h, t: t[k], k }; if (h < minHR.v) minHR = { v: h, t: t[k], k }; }
  }
  let brady = 0, tachy = 0, rateBeats = 0;
  for (let k = 1; k < nb; k++) if (rrOk[k] && !ect[k]) { rateBeats++; const h = 60000 / rr[k]; if (h < 50) brady++; if (h > 150) tachy++; }
  // sliding 1-minute means
  const cs = new Float64Array(nnV.length + 1); for (let i = 0; i < nnV.length; i++) cs[i + 1] = cs[i] + nnV[i];
  let hi1 = null, lo1 = null;
  for (let s0 = 0; s0 + 60 <= dur; s0 += 1) {
    const i0 = lowerBound(nnT, s0), i1 = lowerBound(nnT, s0 + 60), c = i1 - i0, sm = cs[i1] - cs[i0];
    if (c < 10 || sm < 36000) continue;
    const h = 60000 * c / sm;
    if (!hi1 || h > hi1.v) hi1 = { v: h, t0: s0, t1: s0 + 60 };
    if (!lo1 || h < lo1.v) lo1 = { v: h, t0: s0, t1: s0 + 60 };
  }
  // pauses (> 2 s) on clean intervals
  const pauses = []; let longest = { v: 0, k: 0 };
  for (let k = 1; k < nb; k++) if (rrOk[k]) { if (rr[k] > longest.v) longest = { v: rr[k], k }; if (rr[k] > 2000) pauses.push({ k, ms: rr[k], time: t[k - 1] }); }

  // zones
  const age = opts.age || 35, hrMax = 220 - age;
  const zoneDefs = [
    { name: 'Rest', lo: 0, hi: 0.6 }, { name: 'Recovery', lo: 0.6, hi: 0.7 }, { name: 'Aerobic', lo: 0.7, hi: 0.8 },
    { name: 'Anaerobic', lo: 0.8, hi: 0.9 }, { name: 'Maximum', lo: 0.9, hi: 10 }
  ];
  const zones = zoneDefs.map(z => ({ ...z, bpmLo: Math.round(z.lo * hrMax), bpmHi: Math.round(Math.min(z.hi, 1) * hrMax), sec: 0 }));
  for (let k = 1; k < nb; k++) if (rrOk[k]) { const f = 60000 / rr[k] / hrMax; const z = zones.find(z => f >= z.lo && f < z.hi) || zones[4]; z.sec += rr[k] / 1000; }

  progress(0.7, 'Estimating breathing and exercise response'); await tick();
  // breathing rate from ECG-derived respiration (R-amplitude modulation) + respiratory sinus arrhythmia
  const ampT = [], ampV = [];
  for (let k = 1; k < nb; k++) if (nn[k] && !noise[k]) {
    const c = r[k]; if (c < 10) continue; let b0 = 0; for (let j = -10; j <= -6; j++) b0 += sig[c + j];
    ampT.push(t[k]); ampV.push(pol * (sig[c] - b0 / 5));
  }
  // Two estimates: resting breathing is searched from 6/min upward, because the ~0.07-0.1 Hz blood-pressure
  // (Mayer) wave, strong when standing, otherwise masquerades as very slow breathing. Paced-breathing
  // contexts use the full band down to 3/min.
  const shareFor = b => {
    if (!b || !H.fd || !H.fd.psd) return NaN;
    const fb = b.median / 60, P = H.fd.psd, df = H.fd.df; let inB = 0, tot = 0;
    for (let k = 1; k < P.length; k++) { const f = k * df; if (f >= 0.033 && f <= 0.4) { tot += P[k]; if (Math.abs(f - fb) <= 0.03) inB += P[k]; } }
    return tot > 0 ? 100 * inB / tot : NaN;
  };
  const accSec = opts.acc && opts.acc.data ? opts.acc.data.length / 3 / opts.acc.fs : 0;
  const accB = accSec >= 30 ? accBreathing(opts.acc, 0.05, Math.min(60, accSec - 0.5)) : null;
  const breathSource = accB ? 'acc' : 'ecg';
  const breath = accB || breathingRate(ampT, ampV, H.series.T, H.series.V, dur, 0.1);
  const breathSlow = accB || breathingRate(ampT, ampV, H.series.T, H.series.V, dur, 0.05);
  const stillPct = accStillness(opts.acc);
  const breathShare = shareFor(breath), breathShareSlow = shareFor(breathSlow);
  // exercise response: 10-s heart rate, peak, recovery at 60 / 120 s
  const hr10 = [];
  { const bt = [], bh = []; for (let k = 1; k < nb; k++) if (rrOk[k] && !ect[k] && !ect[k - 1]) { bt.push(t[k]); bh.push(60000 / rr[k]); }
    for (let s0 = 0; s0 + 10 <= dur; s0 += 2) { const i0 = lowerBound(bt, s0), i1 = lowerBound(bt, s0 + 10); if (i1 - i0 >= 4) { let sm = 0; for (let i = i0; i < i1; i++) sm += bh[i]; hr10.push({ t: s0 + 5, v: sm / (i1 - i0) }); } } }
  // exercise response: recovery is measured from the end of the session (marked or detected), never from a mid-session peak
  const exercise = exerciseResponse({ beats: nb, rrOk, ect, t, rr, dur }, opts.recMark);

  progress(0.78, 'Measuring waveforms'); await tick();
  // morphology windows (5 min templates)
  const UP = 4, fsu = FS * UP, morphWin = [];
  const goodByWin = new Map();
  for (const k of good) if (nn[k]) { const w5 = Math.floor(t[k] / 300); if (!goodByWin.has(w5)) goodByWin.set(w5, []); goodByWin.get(w5).push(k); }
  for (const [w5, ks] of goodByWin) {
    if (ks.length < 25) continue;
    const T = buildTemplate(sig, r, ks, pre, post, 200); if (!T) continue;
    const up = upsample(T.tp, UP), rrW = median(ks.map(k => rr[k]));
    const D = delineate(up, fsu, pre * UP, rrW, pol);
    morphWin.push({ w: w5, t0: w5 * 300, rr: rrW, ...D, onOff: (pre * UP - D.on) / UP });
  }
  morphWin.sort((a, b) => a.w - b.w);
  const winOn = new Map(morphWin.map(m => [m.w, m.onOff]));
  const defaultOn = morphWin.length ? median(morphWin.map(m => m.onOff)) : 0.04 * FS;
  // global average beat
  let avgBeat = null;
  if (G) {
    const up = upsample(G.tp, UP); const D = delineate(up, fsu, pre * UP, medRR, pol);
    avgBeat = { tp: Array.from(up), fsu, pre: pre * UP, D, count: G.count };
  }

  // per-beat QT / T polarity
  const qtcPts = []; let tPos = 0, tTot = 0;
  for (let k = 1; k < nb - 1; k++) {
    if (!nn[k] || noise[k]) continue;
    const c = r[k];
    let base = 0; for (let j = -10; j <= -6; j++) base += sig[c + j]; base /= 5;
    const onOff = winOn.has(Math.floor(t[k] / 300)) ? winOn.get(Math.floor(t[k] / 300)) : defaultOn;
    const on = c - onOff;
    const nextRR = rrOk[k + 1] ? (r[k + 1] - r[k]) : (r[k] - r[k - 1]);
    const s0 = c + Math.round(0.12 * FS), s1 = Math.min(n - 2, c + Math.round(Math.min(0.62 * nextRR, 0.56 * FS)), r[k + 1] - Math.round(0.1 * FS));
    if (s1 <= s0 + 3) continue;
    let tp = s0, tv = -1;
    for (let i = s0; i <= s1; i++) { const v = Math.abs(sig[i] - base); if (v > tv) { tv = v; tp = i; } }
    if (tv < 25) continue;
    const sg = sig[tp] >= base ? 1 : -1; tTot++; if (sg > 0) tPos++;
    let kk = -1, kv = 0;
    for (let i = tp; i < Math.min(n - 1, tp + Math.round(0.18 * FS)); i++) { const d = sig[i + 1] - sig[i]; if (sg * d < kv) { kv = sg * d; kk = i; } }
    if (kk < 0) continue;
    const ds = sig[kk + 1] - sig[kk], ym = (sig[kk] + sig[kk + 1]) / 2;
    const tEnd = kk + 0.5 + (base - ym) / ds;
    if (!isFinite(tEnd) || tEnd < tp) continue;
    const qt = (tEnd - on) / FS * 1000, qtc = qt / Math.sqrt(rr[k] / 1000), qtcF = qt / Math.cbrt(rr[k] / 1000);
    if (qtc < 250 || qtc > 650) continue;
    qtcPts.push({ t: t[k], rr: rr[k], qt, qtc, qtcF });
  }
  const qtcVals = qtcPts.map(p => p.qtc);
  const pick = (arr, f) => arr.length ? median(arr.map(f)) : NaN;

  progress(0.9, 'Preparing report'); await tick();
  // HR trend bins
  const bin = Math.min(60, Math.max(5, Math.round(dur / 500 / 5) * 5 || 5));
  const hrTrend = [];
  for (let s0 = 0; s0 < dur; s0 += bin) {
    const i0 = lowerBound(nnT, s0), i1 = lowerBound(nnT, s0 + bin); if (i1 - i0 < 2) continue;
    let mn = Infinity, mx = -Infinity, sm = 0;
    for (let i = i0; i < i1; i++) { const h = 60000 / nnV[i]; mn = Math.min(mn, h); mx = Math.max(mx, h); sm += nnV[i]; }
    hrTrend.push({ t: s0 + bin / 2, min: mn, max: mx, hr: 60000 * (i1 - i0) / sm });
  }
  // QTc trend bins
  const qb = dur <= 7200 ? 60 : 300, qtcTrend = [];
  for (let s0 = 0; s0 < dur; s0 += qb) {
    const v = qtcPts.filter(p => p.t >= s0 && p.t < s0 + qb).map(p => p.qtc);
    if (v.length >= 8) qtcTrend.push({ t: s0 + qb / 2, med: median(v), lo: quantile(v, 0.1), hi: quantile(v, 0.9) });
  }

  const noiseBeats = noise.reduce((a, b) => a + b, 0);
  let noisyBlocks = 0; for (const v of noisyB) noisyBlocks += v;
  return {
    fs: FS, n, dur, pol, gapSec: gapCount / FS, medRR,
    beats: nb, r, t, rr, rrOk, nn, ect, noise, events, pauses, longest,
    ectopicBeats: ect.reduce((a, b) => a + b, 0),
    noisePct: 100 * noiseBeats / nb, noiseTimePct: 100 * noisyBlocks / noisyB.length,
    meanHR, meanNN, rmssd, sdnn, pnn50, pnn200, sd1, sd2,
    lnRmssd: Math.log(rmssd), fd: H.fd, hfPct: H.fd ? H.fd.hfPct : NaN, lfhf: H.fd ? H.fd.lfhf : NaN,
    h10: useH10 ? h10Series : null,
    hrvSource: useH10 ? 'h10' : 'ecg', hrvCount: H.series.T.length, h10Artifacts: h10Series ? h10Series.artifacts : 0, h10Total: h10Series ? h10Series.total : 0,
    ecgRmssd: ecgHrv.rmssd, ecgSdnn: ecgHrv.sdnn,
    breath, breathShare, breathSlow, breathShareSlow, breathSource, stillPct, hasAcc: !!(opts.acc && opts.acc.data), exercise, hr10,
    maxHR, minHR, hi1, lo1,
    bradyPct: 100 * brady / (rateBeats || 1), tachyPct: 100 * tachy / (rateBeats || 1),
    pnnEpisodes: H.pnnEpisodes, zones, hrMax, hrvWin: H.windows, hrvWinSec: H.winSec,
    qrs: pick(morphWin.filter(m => m.qrsOk), m => m.qrs),   // windows whose QRS end could not be found are left out jAmp: pick(morphWin, m => m.jAmp), sysAmp: pick(morphWin, m => m.sysAmp),
    rAmp: pick(morphWin, m => m.rAmp), tAmp: pick(morphWin, m => m.tAmp),
    qtc: qtcVals.length ? median(qtcVals) : (morphWin.length ? median(morphWin.map(m => m.qt / Math.sqrt(m.rr / 1000))) : NaN),
    qtcF: qtcPts.length ? median(qtcPts.map(p => p.qtcF)) : NaN,
    qt: qtcPts.length ? median(qtcPts.map(p => p.qt)) : NaN,
    tPosPct: tTot ? 100 * tPos / tTot : NaN,
    qtcPts, qtcTrend, hrTrend, hrBin: bin, avgBeat, morphWin, sig
  };
}

/* ---------- Polar Measurement Data (PMD) frames ---------- */
/* Generic PMD frame decoder: returns an array of [ch0, ch1, ...] samples (raw or delta-compressed frames) */
function pmdSamples(v, channels, bytesPer) {
  const ft = v.getUint8(9), out = [];
  if (!(ft & 0x80)) {
    const bp = ft === 0 ? 1 : ft === 1 ? 2 : ft === 2 ? 3 : bytesPer, step = bp * channels;
    for (let o = 10; o + step <= v.byteLength; o += step) {
      const s = []; for (let c = 0; c < channels; c++) s.push(readInt(v, o + c * bp, bp)); out.push(s);
    }
    return out;
  }
  // delta compressed: reference sample, then blocks of [deltaBits, count, packed deltas (LSB first)]
  const bp = bytesPer; let o = 10; if (o + bp * channels > v.byteLength) return out;
  let ref = []; for (let c = 0; c < channels; c++) ref.push(readInt(v, o + c * bp, bp)); o += bp * channels; out.push(ref.slice());
  while (o + 2 <= v.byteLength) {
    const w = v.getUint8(o), n = v.getUint8(o + 1); o += 2; if (!w || !n) break;
    const nbytes = Math.ceil(w * channels * n / 8); if (o + nbytes > v.byteLength) break;
    let bitPos = 0;
    const bit = () => { const b = (v.getUint8(o + (bitPos >> 3)) >> (bitPos & 7)) & 1; bitPos++; return b; };
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < channels; c++) { let d = 0; for (let b = 0; b < w; b++) d |= bit() << b; if (d & (1 << (w - 1))) d -= 1 << w; ref[c] += d; }
      out.push(ref.slice());
    }
    o += nbytes;
  }
  return out;
}
function readInt(v, o, n) { if (n === 1) return v.getInt8(o); if (n === 2) return v.getInt16(o, true); let x = v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getUint8(o + 2) << 16); return x & 0x800000 ? x - 0x1000000 : x; }

/* ---------- synthetic ECG for sample reports and tests ----------
   kind: 'rest' (seated, normal breathing), 'training' (ramp to ~165 bpm then recovery), 'meditation' (6 breaths/min)
   returns { raw: Int32Array µV at 130 Hz, rr: [[tEnd, ms], …] like the strap's own intervals } */
function makeDemo(minutes = 46, seed = 11, kind = 'rest') {
  let s = seed >>> 0;
  const rnd = () => { s += 0x6D2B79F5; let q = s; q = Math.imul(q ^ (q >>> 15), q | 1); q ^= q + Math.imul(q ^ (q >>> 7), q | 61); return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const n = Math.round(minutes * 60 * FS), y = new Float64Array(n), beats = [];
  const wave = (tc, comps) => {
    const i0 = Math.max(0, Math.floor((tc - 0.35) * FS)), i1 = Math.min(n - 1, Math.ceil((tc + 0.7) * FS));
    for (let i = i0; i <= i1; i++) { const dt = i / FS - tc; let v = 0; for (const [a, mu, sg] of comps) v += a * Math.exp(-((dt - mu) ** 2) / (2 * sg * sg)); y[i] += v; }
  };
  // exercise kinds: 'training' (ramp to steady effort), 'intervals' (4x4 with active recovery, passive cool-down),
  // 'intervals-climb' (same, but the recording ends while still climbing), 'ramp' (3-min steps to failure), 'lthr' (30-min time trial)
  const EX = ['training', 'intervals', 'intervals-climb', 'ramp', 'lthr', 'tempo', 'dfa'].includes(kind);
  const brHz = kind === 'meditation' ? 0.1 : EX ? 0.4 : 0.23;
  const T = minutes * 60;
  // first-order heart-rate dynamics toward a target, for the newer exercise kinds
  const target = tc => {
    if (kind === 'intervals' || kind === 'intervals-climb') {
      if (tc < 300) return [95 + 15 * tc / 300, 40];
      const i = Math.floor((tc - 300) / 420), ph = (tc - 300) % 420;
      if (i < 4 && ph < 240) return [160 + 2 * i, 35];
      if (i < 3) return [122, 45];                                   // active recovery between intervals
      if (kind === 'intervals-climb') return tc < 1980 ? [122, 45] : [176, 70];   // recovery, then a final climb to the end
      return [100, 60];                                              // passive cool-down
    }
    if (kind === 'ramp') { if (tc < 1530) return [Math.min(178, 100 + 12 * Math.floor(tc / 180)), 30]; return [105, 50]; }
    if (kind === 'tempo') { if (tc < 420) return [100 + 30 * tc / 420, 40]; if (tc < 1920) return [148 + 9 * (tc - 420) / 1500, 45]; return [102, 55]; }   // 25-min tempo with slight drift
    if (kind === 'dfa') { if (tc < 1800) return [100 + 8 * Math.floor(tc / 180), 30]; return [105, 50]; }   // 3-min steps of +8 bpm
    if (kind === 'lthr') { if (tc < 300) return [110, 40]; if (tc < 2100) return [157 + 4 * (tc - 300) / 1800, 40]; return [100, 50]; }
    return null;
  };
  let hrState = kind === 'ramp' ? 95 : kind === 'lthr' ? 100 : 92;
  const hrAt = tc => {
    const tg = target(tc); if (tg) return hrState;
    if (kind === 'training') {
      const w = 120, ramp = T * 0.6, stop = T * 0.72;
      if (tc < w) return 88; if (tc < ramp) return 88 + (165 - 88) * (tc - w) / (ramp - w); if (tc < stop) return 165;
      return 95 + 70 * Math.exp(-(tc - stop) / 70);
    }
    if (kind === 'meditation') return 68 - 4 * Math.min(1, tc / 300);
    return 54 - 2 * Math.sin(2 * Math.PI * tc / 1700) + 2 * Math.max(0, (tc - 1800) / 1000) - 4 * Math.exp(-((tc - 500) ** 2) / (2 * 60 ** 2));
  };
  const pvcAt = kind === 'rest' ? [8.1, 15.3, 32.25, 39.1].map(m => m * 60).filter(x => x < T - 10) : EX ? [T * 0.4] : [];
  const pauseAt = kind === 'rest' && T > 500 ? 480 : -1;
  let tc = 0.8, nextPvc = 0, pausedone = false, ar = 0, pg = 0;
  while (tc < T - 1) {
    const hr = hrAt(tc), rsaAmp = kind === 'meditation' ? 0.09 : EX ? 0.006 : 0.03;
    let rr = 60 / hr * (1 + rsaAmp * Math.sin(2 * Math.PI * brHz * tc) + 0.025 * Math.sin(2 * Math.PI * tc / 11 + 0.7) * (EX ? 0.3 : 1) + 0.012 * gauss());
    if (kind === 'dfa') {   // fractal (correlated) beat-to-beat variation at easy effort, turning uncorrelated as effort rises
      const w = Math.min(0.9, Math.max(0.2, 0.3 + 0.0057 * (hr - 100))), e = gauss();
      ar = 0.93 * ar + 0.37 * gauss(); const anti = e - 0.6 * pg; pg = e;
      rr = 60 / hr * (1 + 0.012 * ((1 - w) * 1.3 * ar + w * anti));
    }
    { const tg = target(tc); if (tg) hrState += (tg[0] - hrState) * (1 - Math.exp(-rr / tg[1])); }
    const resp = 1 + 0.07 * Math.sin(2 * Math.PI * brHz * tc + 1.2);
    if (nextPvc < pvcAt.length && tc > pvcAt[nextPvc]) {
      nextPvc++; const tp = tc - 0.38 * rr;
      wave(tp, [[1050, 0, 0.022], [-480, 0.06, 0.024], [-360, 0.33, 0.06]]); beats.push(tp);
      tc = tp + 1.38 * rr; continue;
    }
    if (!pausedone && pauseAt > 0 && tc > pauseAt) { pausedone = true; rr = 2.22; }
    const st = Math.sqrt(Math.max(0.33, rr));
    wave(tc, [[110, -0.17 * Math.min(1, st), 0.022], [-90, -0.03, 0.008], [(1250 + 60 * gauss()) * resp, 0, 0.0105], [-300 * resp, 0.028, 0.0105], [310, 0.285 * st, 0.044 * Math.min(1, st + 0.1)]]);
    beats.push(tc); tc += rr;
  }
  beats.sort((a, b) => a - b);
  const rrList = []; for (let i = 1; i < beats.length; i++) rrList.push([beats[i], Math.round((beats[i] - beats[i - 1]) * 1024) / 1024 * 1000]);
  // chest accelerometer at 12.5 Hz (milli-g): gravity + breathing movement (+ footsteps when training)
  const fsA = 12.5, nA = Math.floor(T * fsA), acc = new Int16Array(3 * nA);
  const ampB = kind === 'meditation' ? 28 : 14;
  for (let i = 0; i < nA; i++) {
    const ts = i / fsA, b = Math.sin(2 * Math.PI * brHz * ts);
    const tg = target(ts), effort = kind === 'training' ? ts > 120 && ts < T * 0.72 : tg ? tg[0] > 125 : false;
    const walk = effort ? 260 * Math.sin(2 * Math.PI * 1.6 * ts) * (0.6 + 0.4 * rnd()) : 0;
    acc[3 * i] = Math.round(120 + ampB * 0.6 * b + walk * 0.3 + 3 * gauss());
    acc[3 * i + 1] = Math.round(-975 + ampB * 0.3 * b + walk + 3 * gauss());
    acc[3 * i + 2] = Math.round(180 + ampB * b + walk * 0.4 + 3 * gauss());
  }
  const emg = EX ? 30 : 12, out = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const ts = i / FS;
    out[i] = Math.round(y[i] + 80 * Math.sin(2 * Math.PI * brHz * ts) + 35 * Math.sin(2 * Math.PI * 0.05 * ts + 1) + 8 * Math.sin(2 * Math.PI * 50 * ts) + emg * gauss());
  }
  return { raw: out, rr: rrList, acc: { fs: fsA, t0: 0, data: acc } };
}



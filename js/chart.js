// Verlaufskurven als SVG – leuchtendes Blau, weiche Linie, Rekorde als gefüllte Punkte.
import { fmtNum, esc } from './format.js';

let uidc = 0;

function niceStep(range, ticks) {
  const raw = range / Math.max(1, ticks);
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
}

/** Monotone Kurve (kein Überschwingen über die echten Werte). */
function smoothPath(p) {
  if (p.length === 1) return `M${p[0][0]},${p[0][1]}`;
  if (p.length === 2) return `M${p[0][0]},${p[0][1]}L${p[1][0]},${p[1][1]}`;
  const n = p.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((p[i + 1][1] - p[i][1]) / ((p[i + 1][0] - p[i][0]) || 1e-6));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  let s = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = (p[i + 1][0] - p[i][0]) / 3;
    s += `C${(p[i][0] + dx).toFixed(1)},${(p[i][1] + m[i] * dx).toFixed(1)} ${(p[i + 1][0] - dx).toFixed(1)},${(p[i + 1][1] - m[i + 1] * dx).toFixed(1)} ${p[i + 1][0].toFixed(1)},${p[i + 1][1].toFixed(1)}`;
  }
  return s;
}

/**
 * points: [{t, v, pr}], opts: {w, h, start, end, ticks:[{t,label}], unit, spark, label}
 */
export function chartSVG(points, opts = {}) {
  const W = opts.w || 340, H = opts.h || (opts.spark ? 44 : 170);
  const spark = !!opts.spark;
  const padL = spark ? 3 : 8, padR = spark ? 3 : 40, padT = spark ? 5 : 14, padB = spark ? 5 : 24;
  if (!points.length) return '';
  const vs = points.map(p => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (hi - lo < 1e-6) { lo -= Math.max(1, hi * 0.05); hi += Math.max(1, hi * 0.05); }
  const step = niceStep(hi - lo, 3);
  const y0 = spark ? lo - (hi - lo) * 0.1 : Math.floor(lo / step) * step;
  const y1 = spark ? hi + (hi - lo) * 0.1 : Math.ceil(hi / step) * step;
  let t0 = opts.start, t1 = opts.end;
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t0 <= 0) { t0 = points[0].t; t1 = points[points.length - 1].t; }
  if (t1 - t0 < 1) { t0 -= 86400e3; t1 += 86400e3; }
  const X = t => padL + (W - padL - padR) * (t - t0) / (t1 - t0);
  const Y = v => padT + (H - padT - padB) * (1 - (v - y0) / ((y1 - y0) || 1));
  const pts = points.map(p => [X(p.t), Y(p.v)]);
  const id = 'g' + (++uidc);
  const line = smoothPath(pts);
  const area = `${line}L${pts[pts.length - 1][0].toFixed(1)},${(H - padB).toFixed(1)}L${pts[0][0].toFixed(1)},${(H - padB).toFixed(1)}Z`;
  let g = '';
  if (!spark) {
    for (let v = y0; v <= y1 + 1e-9; v += step) {
      const y = Y(v).toFixed(1);
      g += `<line class="grid" x1="${padL}" x2="${W - padR + 6}" y1="${y}" y2="${y}"/>`;
      g += `<text class="axis" x="${W - padR + 10}" y="${(+y + 4).toFixed(1)}">${esc(fmtNum(v))}</text>`;
    }
    for (const tk of opts.ticks || []) {
      const x = X(tk.t);
      if (x < padL - 1 || x > W - padR + 1) continue;
      g += `<text class="axis" x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(tk.label)}</text>`;
    }
  }
  const showDots = !spark && points.length <= 24;
  const dots = points.map((p, i) => (showDots || p.pr) && !spark ? `<circle class="dot${p.pr ? ' pr' : ''}" cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="${p.pr ? 5 : 4}"/>` : '').join('');
  const last = pts[pts.length - 1];
  const lastLbl = !spark ? `<text class="lastlbl" x="${Math.min(last[0], W - padR - 4).toFixed(1)}" y="${Math.max(12, last[1] - 10).toFixed(1)}" text-anchor="end">${esc(fmtNum(points[points.length - 1].v))}${opts.unit ? ' ' + esc(opts.unit) : ''}</text>` : '';
  const single = points.length === 1 ? `<circle class="dot pr" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="${spark ? 3.5 : 5}"/>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || 'Verlauf')}">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="gstop-top"/><stop offset="1" class="gstop-bottom"/></linearGradient></defs>
${g}${points.length > 1 ? `<path d="${area}" fill="url(#${id})" stroke="none"/><path class="line${spark ? ' thin' : ''}" d="${line}"/>` : ''}${dots}${single}${lastLbl}</svg>`;
}

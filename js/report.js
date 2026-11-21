// Trainingsbericht als PDF: Kennzahlen, Verbesserungen, Rekorde und eine Kurve pro Übung.
import { PDF, A4 } from './pdfwriter.js';
import * as S from './store.js';
import { summarize, recordIds, dayPoints, bucketPoints, bucketFor, roundHalf, score, VS } from './stats.js';
import { fmtNum, fmtVolume, fmtChange, fmtSet, fmtDate, fmtInt } from './format.js';

const C = { ink: '#12223a', sub: '#24364f', muted: '#5b6b80', faint: '#8a99ad', line: '#d6e1ee', tile: '#f2f6fb', chart: '#1f7bff', pr: '#1d6fe5', ok: '#12804f', bad: '#c0392b', g0: '#7fa6d3', g1: '#f1f6fc' };
const M = 40, CW = A4.w - 2 * M;
const pct = (a, b) => (b > 0 ? (a - b) / b * 100 : null);
const deltaColor = d => (d == null || Math.abs(d) < 0.5 ? C.muted : d > 0 ? C.ok : C.bad);

export function buildReport(range, locId) {
  const locName = locId === 'all' ? 'Alle Orte' : (S.locationById(locId)?.name || '');
  const pdf = new PDF({ title: `Trainingsbericht ${range.label} – ${locName}` });
  const sets = locId === 'all' ? S.state.sets : S.state.sets.filter(s => s.locationId === locId);
  const prIds = recordIds(S.state.sets);
  const sum = summarize(sets, range, prIds);
  const vs = VS[range.type];
  let y = 0;

  const newPage = first => {
    pdf.addPage();
    if (first) {
      pdf.gradientRect(0, 0, A4.w, 132, 0, C.g0, C.g1);
      pdf.text(M, 60, 'Trainingsbericht', { size: 28, bold: true });
      pdf.text(M, 86, `${range.label} · ${locName}`, { size: 13, color: C.sub });
      pdf.text(A4.w - M, 60, `Erstellt am ${fmtDate(Date.now())}`, { size: 9, color: C.sub, align: 'right' });
      y = 158;
    } else {
      pdf.text(M, 40, `Trainingsbericht · ${range.label} · ${locName}`, { size: 9, color: C.muted });
      pdf.line(M, 48, A4.w - M, 48);
      y = 72;
    }
  };
  const ensure = h => { if (y + h > A4.h - 56) newPage(false); };
  const section = (title, need = 70) => {
    ensure(need);
    pdf.text(M, y, title, { size: 13, bold: true });
    y += 8;
    pdf.line(M, y, A4.w - M, y);
    y += 18;
  };
  newPage(true);

  // ---- Kennzahlen ----
  const tiles = [
    [String(sum.days), 'Trainingstage', vs ? pct(sum.days, sum.prevDays) : null],
    [fmtInt(sum.setCount), 'Sätze', vs ? pct(sum.setCount, sum.prevSetCount) : null],
    [fmtVolume(sum.volume), 'bewegtes Gewicht', vs ? pct(sum.volume, sum.prevVolume) : null],
    [String(sum.records.length), 'neue Rekorde', null],
  ];
  const tw = (CW - 30) / 4;
  tiles.forEach(([v, k, d], i) => {
    const x = M + i * (tw + 10);
    pdf.rrect(x, y, tw, 72, 10, { fill: C.tile, stroke: C.line });
    pdf.text(x + 12, y + 30, v, { size: 20, bold: true, max: tw - 22 });
    pdf.text(x + 12, y + 46, k, { size: 9, color: C.muted, max: tw - 22 });
    if (d != null) pdf.text(x + 12, y + 61, `${fmtChange(d)} ${vs.zu}`, { size: 8, bold: true, color: deltaColor(d), max: tw - 22 });
  });
  y += 72 + 14;
  if (sum.running && vs && tiles.some(t => t[2] != null)) { pdf.text(M, y, `Laufender Zeitraum: Tage, Sätze und Gewicht im Vergleich zum gleichen Abschnitt davor (bis zum selben Tag).`, { size: 8, color: C.faint, max: CW }); y += 10; }
  y += 18;

  if (!sum.setCount) {
    pdf.text(M, y, 'In diesem Zeitraum gibt es noch keine Einträge.', { size: 12, color: C.muted });
    return finish(pdf);
  }

  const exName = id => S.exerciseById(id)?.name || 'Übung';
  const unitOf = x => (x.bodyweight ? 'Wdh.' : 'kg');

  // ---- Verbesserungen ----
  if (vs) {
    section(`Verbesserungen gegenüber ${range.prev.label}`);
    const rows = sum.perEx.filter(x => x.change != null).sort((a, b) => b.change - a.change);
    if (!rows.length) { pdf.text(M, y, `Für einen Vergleich fehlen Einträge ${vs.im}.`, { size: 10, color: C.muted }); y += 22; }
    for (const x of rows) {
      ensure(24);
      pdf.text(M, y, exName(x.exerciseId), { size: 10.5, bold: true, max: 210 });
      pdf.text(M + 220, y, `von ${fmtNum(roundHalf(x.prevBest))} ${unitOf(x)} auf ${fmtNum(roundHalf(x.best))} ${unitOf(x)}`, { size: 9.5, color: C.muted, max: 215 });
      pdf.text(A4.w - M, y, fmtChange(x.change), { size: 10.5, bold: true, color: deltaColor(x.change), align: 'right' });
      y += 8; pdf.line(M, y, A4.w - M, y, { color: '#e7eef6' }); y += 14;
    }
    pdf.text(M, y, 'Verglichen wird das beste geschätzte Maximalgewicht (bei Übungen ohne Gewicht: die meisten Wiederholungen).', { size: 8, color: C.faint, max: CW });
    y += 26;
  }

  // ---- Rekorde ----
  section('Rekorde im Zeitraum');
  const recs = [...sum.records].sort((a, b) => a.ts - b.ts);
  if (!recs.length) { pdf.text(M, y, 'Keine neuen Rekorde in diesem Zeitraum.', { size: 10, color: C.muted }); y += 22; }
  recs.slice(0, 14).forEach(s => {
    ensure(22);
    pdf.text(M, y, fmtDate(s.ts), { size: 9.5, color: C.muted });
    pdf.text(M + 70, y, exName(s.exerciseId), { size: 10.5, bold: true, max: 200 });
    pdf.text(M + 280, y, fmtSet(s), { size: 10, max: 120 });
    pdf.text(A4.w - M, y, s.weight > 0 ? `geschätzt ${fmtNum(roundHalf(score(s)))} kg` : 'neue Bestmarke', { size: 10, bold: true, color: C.pr, align: 'right' });
    y += 20;
  });
  if (recs.length > 14) { pdf.text(M, y, `… und ${recs.length - 14} weitere`, { size: 9.5, color: C.muted }); y += 18; }
  y += 14;

  // ---- Übungen im Einzelnen ----
  section('Übungen im Einzelnen', 150 + 40);
  const cards = sum.perEx.map(x => ({ ...x, name: exName(x.exerciseId) })).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const cw = (CW - 12) / 2, ch = 150;
  cards.forEach((x, i) => {
    const col = i % 2;
    if (col === 0) ensure(ch + 12);
    const cx = M + col * (cw + 12), cy = y;
    pdf.rrect(cx, cy, cw, ch, 12, { fill: C.tile, stroke: C.line });
    pdf.text(cx + 14, cy + 24, x.name, { size: 12, bold: true, max: cw - 28 });
    pdf.text(cx + 14, cy + 40, `${x.count} ${x.count === 1 ? 'Satz' : 'Sätze'}${x.volume > 0 ? ` · bewegt ${fmtVolume(x.volume)} · Höchstgewicht ${fmtNum(x.maxWeight)} kg` : ''}`, { size: 9, color: C.muted, max: cw - 28 });
    pdf.text(cx + 14, cy + 56, x.bodyweight ? `Bestwert: ${x.best} Wiederholungen` : `Bestwert: geschätzt ${fmtNum(roundHalf(x.best))} kg Maximalgewicht`, { size: 9, max: cw - 28 });
    if (x.change != null) pdf.text(cx + cw - 14, cy + 24, fmtChange(x.change), { size: 10, bold: true, color: deltaColor(x.change), align: 'right' });
    drawChart(pdf, x.sets, prIds, range, cx + 14, cy + 70, cw - 56, 64, unitOf(x), x.mode);
    if (col === 1 || i === cards.length - 1) y += ch + 12;
  });
  return finish(pdf);
}

function drawChart(pdf, sets, prIds, range, x, y, w, h, unit, mode) {
  const day = dayPoints(sets, prIds, mode);
  const pts = bucketPoints(day, bucketFor(range.type, day));
  if (!pts.length) return;
  const vs = pts.map(p => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12;
  lo -= pad; hi += pad;
  let t0 = range.start, t1 = range.end;
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || range.type === 'all') { t0 = pts[0].t - 2 * 864e5; t1 = pts[pts.length - 1].t + 2 * 864e5; }
  const X = t => x + w * (t - t0) / (t1 - t0);
  const Y = v => y + h * (1 - (v - lo) / (hi - lo));
  pdf.line(x, y, x + w, y, { color: '#e3ebf4' });
  pdf.line(x, y + h, x + w, y + h, { color: '#e3ebf4' });
  pdf.text(x + w + 6, y + 4, fmtNum(roundHalf(hi - pad)), { size: 7.5, color: C.faint });
  pdf.text(x + w + 6, y + h + 2, fmtNum(roundHalf(lo + pad)), { size: 7.5, color: C.faint });
  pdf.text(x + w + 6, y + h / 2 + 3, unit, { size: 7.5, color: C.faint });
  const xy = pts.map(p => [X(p.t), Y(p.v)]);
  if (xy.length > 1) pdf.polyline(xy, { color: C.chart, lw: 1.8, baseY: y + h });
  pts.forEach((p, i) => { if (p.pr || pts.length === 1) pdf.circle(xy[i][0], xy[i][1], 2.4, C.pr); });
}

function finish(pdf) {
  const n = pdf.pages.length;
  pdf.pages.forEach((p, i) => {
    pdf.page = p;
    pdf.line(M, A4.h - 38, A4.w - M, A4.h - 38, { color: '#e3ebf4' });
    pdf.text(M, A4.h - 24, 'Fitness-Tracker · Deine Daten bleiben auf deinem Handy', { size: 8, color: C.faint });
    pdf.text(A4.w - M, A4.h - 24, `Seite ${i + 1} von ${n}`, { size: 8, color: C.faint, align: 'right' });
  });
  return pdf.build();
}

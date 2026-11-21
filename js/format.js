// Deutsche Schreibweisen für Zahlen und Daten, plus sicheres Einfügen von Text.

const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

export const fmtNum = v => nf1.format(Math.round(v * 10) / 10);
export const fmtNum2 = v => nf2.format(v);
export const fmtInt = v => nf0.format(Math.round(v));

export function fmtKg(v) {
  if (!(v > 0)) return 'ohne Gewicht';
  return `${nf2.format(v)} kg`;
}
/** Bewegtes Gewicht: ab 10 Tonnen in t, sonst kg. */
export function fmtVolume(kg) {
  if (kg >= 10000) return `${nf1.format(kg / 1000)} t`;
  return `${nf0.format(kg)} kg`;
}
export function fmtSet(s) {
  return s.weight > 0 ? `${s.reps} × ${nf2.format(s.weight)} kg` : `${s.reps} Wdh.`;
}
/** „3 × 10 · 80 kg“ für gleiche Sätze, sonst einzeln. */
export function fmtSets(sets) {
  if (!sets.length) return '';
  const groups = [];
  for (const s of sets) {
    const g = groups[groups.length - 1];
    if (g && g.weight === s.weight && g.reps === s.reps) g.n++;
    else groups.push({ weight: s.weight, reps: s.reps, n: 1 });
  }
  return groups.map(g => {
    const w = g.weight > 0 ? ` · ${nf2.format(g.weight)} kg` : ' Wdh.';
    return g.n > 1 ? `${g.n} × ${g.reps}${w}` : `${g.reps}${w}`;
  }).join(', ');
}
export function fmtChange(pct) {
  if (pct == null) return '';
  if (Math.abs(pct) < 0.5) return '±0 %';
  return `${pct > 0 ? '+' : '−'}${nf0.format(Math.abs(pct))} %`;
}
export const changeClass = pct => pct == null || Math.abs(pct) < 0.5 ? 'flat' : pct > 0 ? 'up' : 'down';

const dfLong = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const dfShort = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
const dfFull = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dfTime = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
export const fmtToday = () => dfLong.format(new Date());
export const fmtDayShort = ts => dfShort.format(new Date(ts));
export const fmtDate = ts => dfFull.format(new Date(ts));
export const fmtTime = ts => dfTime.format(new Date(ts));
export function dayKeyToTs(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12).getTime(); }

export function daysAgo(ts) {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(ts); b.setHours(0, 0, 0, 0);
  return Math.round((a - b) / 86400e3);
}
export function fmtAgo(ts) {
  const d = daysAgo(ts);
  if (d <= 0) return 'heute';
  if (d === 1) return 'gestern';
  return `vor ${d} Tagen`;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

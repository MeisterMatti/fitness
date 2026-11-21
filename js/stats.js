// Berechnungen: geschätztes Maximalgewicht, Rekorde, Zeiträume, Vergleiche.

/** Geschätztes Maximalgewicht für eine Wiederholung (Epley-Formel). */
export function e1rm(weight, reps) {
  if (!(weight > 0) || !(reps > 0)) return 0;
  if (reps === 1) return weight;
  return weight * (1 + Math.min(reps, 30) / 30);
}

/** Fortschrittswert eines Satzes: mit Gewicht das geschätzte Maximum, ohne Gewicht die Wiederholungen. */
export function score(set) {
  return set.weight > 0 ? e1rm(set.weight, set.reps) : set.reps;
}

/**
 * Auswertungsart einer Übung: Sobald es Sätze mit Gewicht gibt, zählt nur das geschätzte
 * Maximum in kg (Sätze ohne Gewicht werden dann nicht verglichen). Sonst zählen die Wiederholungen.
 * So werden nie Kilo mit Wiederholungen verglichen.
 */
export const modeOf = sets => (sets.some(s => s.weight > 0) ? 'kg' : 'reps');
export const counts = (set, mode) => mode !== 'kg' || set.weight > 0;
export function scoreIn(set, mode) {
  if (mode === 'kg') return set.weight > 0 ? e1rm(set.weight, set.reps) : 0;
  return set.reps;
}

export const isBodyweight = sets => sets.length > 0 && modeOf(sets) === 'reps';
export const volume = sets => sets.reduce((a, s) => a + (s.weight > 0 ? s.weight * s.reps : 0), 0);

export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dayStart(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
export const todayKey = () => dayKey(Date.now());

export function groupByDay(sets) {
  const m = new Map();
  for (const s of sets) {
    const k = dayKey(s.ts);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(s);
  }
  return m;
}

export function bests(sets, mode = modeOf(sets)) {
  let best = 0, weight = 0, reps = 0;
  for (const s of sets) {
    best = Math.max(best, scoreIn(s, mode));
    weight = Math.max(weight, s.weight || 0);
    reps = Math.max(reps, s.reps || 0);
  }
  return { best, weight, reps, volume: volume(sets), count: sets.length };
}

/**
 * Markiert Rekord-Sätze: Ein Satz ist ein Rekord, wenn sein Wert alles davor
 * bei dieser Übung übertrifft (der allererste Satz zählt nicht).
 * Gibt eine Menge von Satz-IDs zurück.
 */
export function recordIds(allSets) {
  const byEx = new Map();
  for (const s of allSets) {
    if (!byEx.has(s.exerciseId)) byEx.set(s.exerciseId, []);
    byEx.get(s.exerciseId).push(s);
  }
  const ids = new Set();
  for (const list of byEx.values()) {
    list.sort((a, b) => a.ts - b.ts);
    const mode = modeOf(list);
    let run = -1;
    for (const s of list) {
      if (!counts(s, mode)) continue;
      const v = scoreIn(s, mode);
      if (run >= 0 && v > run + 1e-9) ids.add(s.id);
      if (v > run) run = v;
    }
  }
  return ids;
}

/** Zeitraum: type = week | month | year | all, offset 0 = aktuell, -1 = davor ... */
function bounds(type, offset, now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  let start, end;
  if (type === 'week') {
    const wd = (d.getDay() + 6) % 7; // Montag = 0
    start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - wd + offset * 7);
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  } else if (type === 'month') {
    start = new Date(d.getFullYear(), d.getMonth() + offset, 1);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  } else {
    start = new Date(d.getFullYear() + offset, 0, 1);
    end = new Date(start.getFullYear() + 1, 0, 1);
  }
  return { type, offset, start: start.getTime(), end: end.getTime() };
}

export function periodRange(type, offset = 0, now = Date.now()) {
  if (!['week', 'month', 'year'].includes(type)) {
    return { type: 'all', start: 0, end: Infinity, label: 'Gesamter Zeitraum', short: '', prev: null };
  }
  const r = bounds(type, offset, now);
  r.label = periodLabel(r, now);
  r.short = periodShort(r);
  const p = bounds(type, offset - 1, now);
  p.label = periodLabel(p, now);
  p.short = r.short;
  r.prev = p;
  // Laufender Zeitraum: Mengen nur mit dem gleichen Abschnitt davor vergleichen (fair statt „halber Monat gegen ganzen“).
  r.running = now >= r.start && now < r.end;
  r.prevSame = r.running ? { start: p.start, end: Math.min(p.end, p.start + (now - r.start)) } : p;
  return r;
}

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MON_SHORT = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
export { MONTHS, MON_SHORT };

function periodLabel(r, now) {
  const s = new Date(r.start), e = new Date(r.end - 1);
  const thisYear = new Date(now).getFullYear();
  if (r.type === 'month') return `${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
  if (r.type === 'year') return String(s.getFullYear());
  const yr = e.getFullYear() !== thisYear ? ` ${e.getFullYear()}` : '';
  if (s.getMonth() === e.getMonth()) return `${s.getDate()}.–${e.getDate()}. ${MONTHS[e.getMonth()]}${yr}`;
  return `${s.getDate()}. ${MON_SHORT[s.getMonth()]} – ${e.getDate()}. ${MON_SHORT[e.getMonth()]}${yr}`;
}
function periodShort(r) {
  if (r.type === 'week') return 'Vorwoche';
  if (r.type === 'month') return 'Vormonat';
  if (r.type === 'year') return 'Vorjahr';
  return '';
}
/** Richtige Artikel: „zur Vorwoche“, „zum Vormonat“ … */
export const VS = {
  week: { zu: 'zur Vorwoche', mit: 'mit der ganzen Vorwoche', im: 'in der Vorwoche', lauf: 'der laufenden Woche' },
  month: { zu: 'zum Vormonat', mit: 'mit dem ganzen Vormonat', im: 'im Vormonat', lauf: 'dem laufenden Monat' },
  year: { zu: 'zum Vorjahr', mit: 'mit dem ganzen Vorjahr', im: 'im Vorjahr', lauf: 'dem laufenden Jahr' },
};

export const inRange = (s, r) => s.ts >= r.start && s.ts < r.end;

/** Achsenbeschriftung für einen Zeitraum. */
export function xTicks(r, minTs, maxTs) {
  const ticks = [];
  if (r.type === 'week') {
    const names = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    for (let i = 0; i < 7; i++) {
      const t = new Date(r.start); t.setDate(t.getDate() + i);
      ticks.push({ t: t.getTime() + 12 * 3600e3, label: names[i] });
    }
  } else if (r.type === 'month') {
    const s = new Date(r.start);
    for (const day of [1, 8, 15, 22, 29]) {
      const t = new Date(s.getFullYear(), s.getMonth(), day);
      if (t.getTime() < r.end) ticks.push({ t: t.getTime(), label: `${day}.` });
    }
  } else if (r.type === 'year') {
    const y = new Date(r.start).getFullYear();
    for (const m of [0, 3, 6, 9]) ticks.push({ t: new Date(y, m, 1).getTime(), label: MON_SHORT[m].replace('.', '') });
  } else if (minTs != null) {
    const y0 = new Date(minTs).getFullYear(), y1 = new Date(maxTs).getFullYear();
    if (y1 > y0) {
      for (let y = y0 + 1; y <= y1; y++) ticks.push({ t: new Date(y, 0, 1).getTime(), label: String(y) });
    } else {
      const m0 = new Date(minTs).getMonth(), m1 = new Date(maxTs).getMonth();
      const step = Math.max(1, Math.ceil((m1 - m0 + 1) / 4));
      for (let m = m0; m <= m1; m += step) ticks.push({ t: new Date(y0, m, 1).getTime(), label: MON_SHORT[m].replace('.', '') });
    }
  }
  return ticks;
}

/** Tagespunkte einer Übung (bester Wert pro Tag). */
export function dayPoints(sets, prIds, mode = modeOf(sets)) {
  const days = groupByDay(sets.filter(s => counts(s, mode)));
  const pts = [];
  for (const list of days.values()) {
    let best = list[0];
    for (const s of list) if (scoreIn(s, mode) > scoreIn(best, mode)) best = s;
    pts.push({ t: dayStart(best.ts) + 12 * 3600e3, v: scoreIn(best, mode), pr: list.some(s => prIds && prIds.has(s.id)) });
  }
  return pts.sort((a, b) => a.t - b.t);
}

/** Fasst Tagespunkte zu Wochen oder Monaten zusammen (bester Wert), damit lange Kurven ruhig bleiben. */
export function bucketPoints(points, size) {
  if (size !== 'week' && size !== 'month') return points;
  const m = new Map();
  for (const p of points) {
    const d = new Date(p.t);
    let k;
    if (size === 'week') { const wd = (d.getDay() + 6) % 7; k = new Date(d.getFullYear(), d.getMonth(), d.getDate() - wd).getTime(); }
    else k = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const b = m.get(k);
    if (!b) m.set(k, { t: k + (size === 'week' ? 3.5 : 15) * 86400e3, v: p.v, pr: p.pr });
    else { b.v = Math.max(b.v, p.v); b.pr = b.pr || p.pr; }
  }
  return [...m.values()].sort((a, b) => a.t - b.t);
}
/** Passende Zusammenfassung für den Zeitraum. */
export function bucketFor(type, points) {
  if (type === 'year') return 'week';
  if (type === 'all' && points.length > 1) {
    const span = (points[points.length - 1].t - points[0].t) / 86400e3;
    return span > 400 ? 'month' : span > 90 ? 'week' : null;
  }
  return null;
}

/** Veränderung in Prozent, null wenn kein Vergleich möglich. */
export function change(now, before) {
  if (!(before > 0) || !(now > 0)) return null;
  return (now - before) / before * 100;
}

/** Auswertung eines Zeitraums für eine Liste von Sätzen (bereits nach Ort gefiltert). */
export function summarize(sets, range, prIds) {
  const cur = sets.filter(s => inRange(s, range));
  const prev = range.prev ? sets.filter(s => inRange(s, range.prev)) : [];
  const same = range.prevSame ? sets.filter(s => inRange(s, range.prevSame)) : [];
  const days = new Set(cur.map(s => dayKey(s.ts))).size;
  const prevDays = new Set(same.map(s => dayKey(s.ts))).size;
  const exIds = [...new Set(cur.map(s => s.exerciseId))];
  const perEx = exIds.map(id => {
    const mode = modeOf(sets.filter(s => s.exerciseId === id));
    const c = cur.filter(s => s.exerciseId === id);
    const p = prev.filter(s => s.exerciseId === id && counts(s, mode));
    const bc = bests(c, mode), bp = bests(p, mode);
    return {
      exerciseId: id, mode, sets: c, best: bc.best, maxWeight: bc.weight, maxReps: bc.reps, volume: bc.volume, count: bc.count,
      bodyweight: mode === 'reps', prevBest: p.length ? bp.best : null, change: p.length && bc.best > 0 ? change(bc.best, bp.best) : null,
      records: c.filter(s => prIds && prIds.has(s.id)),
    };
  });
  return {
    sets: cur, days, prevDays, setCount: cur.length, prevSetCount: same.length,
    volume: volume(cur), prevVolume: volume(same), perEx, running: !!range.running,
    records: cur.filter(s => prIds && prIds.has(s.id)),
  };
}

/** Rundet sinnvoll für die Anzeige (0,5er-Schritte bei Schätzwerten). */
export const roundHalf = v => Math.round(v * 2) / 2;

// Bereich „Verlauf“: Kurven pro Übung, Woche/Monat/Jahr, Rekorde und Vergleich mit dem Zeitraum davor.
import * as S from './store.js';
import { esc, fmtNum, fmtVolume, fmtChange, changeClass, fmtSets, fmtDayShort, dayKeyToTs, fmtInt } from './format.js';
import { periodRange, summarize, recordIds, dayPoints, xTicks, inRange, groupByDay, bests, isBodyweight, roundHalf, bucketPoints, bucketFor, VS, modeOf, counts } from './stats.js';
import { chartSVG } from './chart.js';
import { ICON } from './nav.js';

const PERIODS = [['week', 'Woche'], ['month', 'Monat'], ['year', 'Jahr'], ['all', 'Alles']];
const ui = { period: 'month', offset: 0, loc: 'all', ex: null };
let view = null;

export function renderVerlauf(v, params = {}) {
  view = v;
  if (params.ex) { ui.ex = params.ex; }
  else if (params.top) ui.ex = null;
  if (ui.ex && !S.exerciseById(ui.ex)) ui.ex = null;
  if (ui.loc !== 'all' && !S.activeLocations().some(l => l.id === ui.loc)) ui.loc = 'all';
  v.innerHTML = ui.ex ? detailHTML() : overviewHTML();
  v.onclick = onClick;
  v.onsubmit = null;
  v.onkeydown = null;
}

const filtered = () => (ui.loc === 'all' ? S.state.sets : S.state.sets.filter(s => s.locationId === ui.loc));
const range = () => periodRange(ui.period, ui.offset);

function controls() {
  const r = range();
  const locs = S.activeLocations();
  return `<div class="seg" role="group" aria-label="Zeitraum">${PERIODS.map(([k, l]) => `<button type="button" data-period="${k}" aria-pressed="${ui.period === k}">${l}</button>`).join('')}</div>
    ${ui.period !== 'all' ? `<div class="period"><button class="icon-btn" type="button" data-act="prev" aria-label="Zeitraum davor">${ICON.left}</button><strong>${esc(r.label)}</strong><button class="icon-btn" type="button" data-act="next" aria-label="Zeitraum danach" ${ui.offset >= 0 ? 'disabled' : ''}>${ICON.right}</button></div>` : ''}
    ${locs.length > 1 ? `<div class="chips" role="group" aria-label="Ort"><button class="chip" type="button" data-locf="all" aria-pressed="${ui.loc === 'all'}">Alle Orte</button>${locs.map(l => `<button class="chip" type="button" data-locf="${esc(l.id)}" aria-pressed="${ui.loc === l.id}">${esc(l.name)}</button>`).join('')}</div>` : ''}`;
}

function delta(pct, label) {
  if (pct == null) return '';
  return `<div class="delta ${changeClass(pct)}">${fmtChange(pct)} ${label ? `<span class="muted">${esc(label)}</span>` : ''}</div>`;
}
const pctOf = (a, b) => (b > 0 ? (a - b) / b * 100 : null);

function overviewHTML() {
  const r = range();
  const prIds = recordIds(S.state.sets);
  const sum = summarize(filtered(), r, prIds);
  const vs = VS[r.type];
  const short = vs ? vs.zu : '';
  const rows = sum.perEx.map(x => ({ ...x, ex: S.exerciseById(x.exerciseId) })).filter(x => x.ex)
    .sort((a, b) => a.ex.name.localeCompare(b.ex.name, 'de'));
  const list = rows.map(x => {
    const pts = dayPoints(x.sets, prIds, x.mode);
    const unit = x.bodyweight ? 'Wdh.' : 'kg';
    return `<button class="card ex-row" type="button" data-ex="${esc(x.ex.id)}" aria-label="${esc(x.ex.name)} – Verlauf öffnen">
      <div class="meta"><div class="ex-name">${esc(x.ex.name)}</div><div class="ex-last">${x.count} ${x.count === 1 ? 'Satz' : 'Sätze'}${x.records.length ? ` · <span class="badge">Rekord</span>` : ''}</div></div>
      <div class="spark-wrap" aria-hidden="true">${pts.length > 1 ? chartSVG(pts, { spark: true, w: 96, h: 40, start: r.start, end: Math.min(r.end, Date.now() + 864e5) }) : ''}</div>
      <div class="best">${fmtNum(roundHalf(x.best))} ${unit}<small>${x.change != null ? `<span class="delta ${changeClass(x.change)}">${fmtChange(x.change)}</span>` : (x.bodyweight ? 'beste Wdh.' : 'geschätzt max.')}</small></div>
    </button>`;
  }).join('');
  return `<header class="head"><div><h1>Verlauf</h1><div class="date">Wirst du stärker? Hier siehst du es.</div></div></header>
    ${controls()}
    <section class="card"><div class="stats">
      <div class="stat"><div class="v">${sum.days}</div><div class="k">Trainingstage</div>${r.prev ? delta(pctOf(sum.days, sum.prevDays), short) : ''}</div>
      <div class="stat"><div class="v">${fmtInt(sum.setCount)}</div><div class="k">Sätze</div>${r.prev ? delta(pctOf(sum.setCount, sum.prevSetCount), short) : ''}</div>
      <div class="stat"><div class="v">${esc(fmtVolume(sum.volume))}</div><div class="k">bewegtes Gewicht</div>${r.prev ? delta(pctOf(sum.volume, sum.prevVolume), short) : ''}</div>
      <div class="stat"><div class="v">${sum.records.length}</div><div class="k">neue Rekorde</div></div>
    </div></section>
    <h3 class="section-title">Übungen</h3>
    ${rows.length ? list : `<div class="card empty"><strong>Hier ist noch nichts</strong>In diesem Zeitraum hast du noch keine Sätze eingetragen.</div>`}
    ${vs ? `<p class="note">Der Prozentwert bei den Übungen vergleicht dein bestes geschätztes Maximalgewicht ${esc(vs.mit)}.${sum.running ? ` Tage, Sätze und Gewicht vergleicht die App bei ${esc(vs.lauf)} mit dem gleichen Abschnitt davor – also bis zum selben Tag.` : ''}</p>` : ''}`;
}

function detailHTML() {
  const ex = S.exerciseById(ui.ex);
  const r = range();
  const prIds = recordIds(S.state.sets);
  const mine = filtered().filter(s => s.exerciseId === ex.id);
  const inR = ui.period === 'all' ? mine : mine.filter(s => inRange(s, r));
  const mode = modeOf(S.setsOf(ex.id));
  const bw = mode === 'reps';
  const unit = bw ? 'Wdh.' : 'kg';
  const dayPts = dayPoints(inR, prIds, mode);
  const bucket = bucketFor(ui.period, dayPts);
  const pts = bucketPoints(dayPts, bucket);
  let chart;
  if (!pts.length) chart = `<div class="empty"><strong>Keine Einträge</strong>In diesem Zeitraum gibt es zu ${esc(ex.name)} nichts.</div>`;
  else {
    const start = ui.period === 'all' ? pts[0].t - 86400e3 * 2 : r.start;
    const end = ui.period === 'all' ? pts[pts.length - 1].t + 86400e3 * 2 : r.end;
    chart = chartSVG(pts, { start, end, ticks: xTicks(r, pts[0].t, pts[pts.length - 1].t), unit, label: `Verlauf ${ex.name}` });
  }
  const all = bests(S.setsOf(ex.id), mode);
  const prevSets = r.prev ? mine.filter(s => inRange(s, r.prev) && counts(s, mode)) : [];
  const prev = r.prev ? bests(prevSets, mode) : null;
  const cur = bests(inR.filter(s => counts(s, mode)), mode);
  const ch = prev && prev.count && cur.count ? pctOf(cur.best, prev.best) : null;
  const days = [...groupByDay(inR).entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  return `<header class="head"><div class="row detail-head">
      <button class="icon-btn back-btn" type="button" data-act="back" aria-label="Zurück zur Übersicht">${ICON.left}</button>
      <div><h1 class="detail-title">${esc(ex.name)}</h1><div class="date">${bw ? 'Wiederholungen' : 'Geschätztes Maximalgewicht'} ${bucket === 'week' ? 'pro Woche' : bucket === 'month' ? 'pro Monat' : 'pro Training'}</div></div></div></header>
    ${controls()}
    <section class="card">
      <div class="row between"><div><div class="big-num">${cur.count ? `${fmtNum(roundHalf(cur.best))} ${unit}` : '–'}</div>
      <div class="muted small">bester Wert ${ui.period === 'all' ? 'insgesamt' : 'im Zeitraum'}</div></div>${ch != null ? delta(ch, VS[r.type]?.zu) : ''}</div>
      <div class="chart">${chart}</div>
    </section>
    <div class="records">
      ${bw ? '' : `<div class="stat"><div class="v">${fmtNum(roundHalf(all.best))} <span class="unit">kg</span></div><div class="k">geschätztes Max.</div></div>`}
      ${bw ? '' : `<div class="stat"><div class="v">${fmtNum(all.weight)} <span class="unit">kg</span></div><div class="k">Höchstgewicht</div></div>`}
      <div class="stat"><div class="v">${all.reps}</div><div class="k">meiste Wdh.</div></div>
      ${bw ? `<div class="stat"><div class="v">${all.count}</div><div class="k">Sätze insgesamt</div></div>` : ''}
    </div>
    <p class="note">${bw ? 'Bei Übungen ohne Gewicht zählen die Wiederholungen.' : 'Das geschätzte Maximalgewicht rechnet Gewicht und Wiederholungen zusammen: so viel würdest du etwa einmal schaffen. Damit siehst du Fortschritt auch, wenn du mal mit weniger Gewicht mehr Wiederholungen machst.'} Gefüllte Punkte sind Rekorde.</p>
    <section class="card"><h2>Trainings</h2><div class="history">
      ${days.length ? days.map(([k, list]) => `<div class="day"><div><div class="d">${esc(fmtDayShort(dayKeyToTs(k)))}</div><div class="muted small">${esc(S.locationById(list[0].locationId)?.name || '')}</div></div><div class="s">${esc(fmtSets(list))}${list.some(s => prIds.has(s.id)) ? '<br><span class="badge">Rekord</span>' : ''}</div></div>`).join('') : '<div class="muted">Keine Trainings in diesem Zeitraum.</div>'}
    </div></section>`;
}

function onClick(e) {
  const t = e.target.closest('button');
  if (!t || !view.contains(t)) return;
  if (t.dataset.period) { ui.period = t.dataset.period; ui.offset = 0; return renderVerlauf(view); }
  if (t.dataset.locf) { ui.loc = t.dataset.locf; return renderVerlauf(view); }
  if (t.dataset.ex && !t.dataset.act) { ui.ex = t.dataset.ex; renderVerlauf(view); window.scrollTo(0, 0); return; }
  switch (t.dataset.act) {
    case 'prev': ui.offset--; return renderVerlauf(view);
    case 'next': if (ui.offset < 0) ui.offset++; return renderVerlauf(view);
    case 'back': ui.ex = null; renderVerlauf(view); window.scrollTo(0, 0);
  }
}

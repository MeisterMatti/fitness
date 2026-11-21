// Bereich „Training“: Ort wählen, Übungen sehen, Sätze eintragen.
import * as S from './store.js';
import { esc, fmtToday, fmtSets, fmtSet, fmtDayShort, dayKeyToTs, fmtNum, fmtTime } from './format.js';
import { openSheet, closeSheet, toast, celebrate, buzz } from './ui.js';
import { stepperHTML, wireSteppers } from './stepper.js';
import { recordIds, roundHalf, todayKey } from './stats.js';
import { backupDue, exportBackup } from './backup.js';
import { go, ICON, currentTab } from './nav.js';

let openEx = null;
const drafts = new Map();
let view = null;

export function setOpenExercise(id) { openEx = id; }
export const openExercise = () => openEx;

export function getDraft(exId) {
  if (!drafts.has(exId)) {
    const last = S.lastSet(exId, S.currentLocation()?.id);
    drafts.set(exId, last ? { weight: last.weight, reps: last.reps, count: 1 } : { weight: 20, reps: 10, count: 1 });
  }
  return drafts.get(exId);
}
export function resetDraft(exId) { drafts.delete(exId); }

function lastLine(ex, locId) {
  const p = S.previousSession(ex.id, locId);
  if (!p) return 'Noch nicht trainiert';
  const where = p.elsewhere ? ` · ${esc(S.locationById(p.sets[0].locationId)?.name || '')}` : '';
  return `Letztes Mal (${esc(fmtDayShort(dayKeyToTs(p.day)))}): ${esc(fmtSets(p.sets))}${where}`;
}

function cardHTML(ex, locId, prIds) {
  const today = S.todaySets(ex.id, locId);
  const open = openEx === ex.id;
  const d = open ? getDraft(ex.id) : null;
  return `<article class="card" data-ex="${esc(ex.id)}">
    <div class="ex-head">
      <div class="grow"><div class="ex-name">${esc(ex.name)}</div><div class="ex-last">${lastLine(ex, locId)}</div></div>
      <button class="icon-btn" type="button" data-act="history" aria-label="Verlauf von ${esc(ex.name)}">${ICON.chart}</button>
    </div>
    ${today.length ? `<div class="sets" aria-label="Heute">${today.map(s => `<button class="set-chip${prIds.has(s.id) ? ' pr' : ''}" type="button" data-set="${esc(s.id)}" aria-label="Satz ändern: ${esc(fmtSet(s))}">${esc(fmtSet(s))}</button>`).join('')}</div>` : ''}
    ${open ? `<div class="editor">
        ${stepperHTML('weight', d.weight)}
        ${stepperHTML('reps', d.reps)}
        ${stepperHTML('count', d.count, 'Sätze auf einmal')}
        <button class="btn-primary" type="button" data-act="save">Speichern</button>
        <button class="btn-link" type="button" data-act="close">Fertig mit dieser Übung</button>
      </div>` : `<button class="add-set" type="button" data-act="open">+ Satz hinzufügen</button>`}
  </article>`;
}

export function renderTraining(v) {
  view = v;
  const loc = S.currentLocation();
  const locs = S.activeLocations();
  const list = S.exercisesAt(loc.id);
  const others = S.activeExercises().filter(e => !e.locationIds.includes(loc.id));
  const prIds = recordIds(S.state.sets);
  const due = backupDue();
  v.innerHTML = `
    <header class="head"><div><h1>Training</h1><div class="date">${esc(fmtToday())}</div></div></header>
    <div class="chips" role="group" aria-label="Ort wählen">
      ${locs.map(l => `<button class="chip" type="button" data-loc="${esc(l.id)}" aria-pressed="${l.id === loc.id}">${esc(l.name)}</button>`).join('')}
      <button class="chip add" type="button" data-act="add-loc" aria-label="Ort hinzufügen">+</button>
    </div>
    ${due ? `<div class="banner" role="status"><div class="grow"><strong>${esc(due.text)}</strong><span>Sicher deine Daten, damit nichts verloren geht.</span></div>
      <button class="btn-link" type="button" data-act="backup">Sichern</button>
      <button class="icon-btn" type="button" data-act="snooze" aria-label="Heute nicht mehr erinnern">${ICON.close}</button></div>` : ''}
    <section class="stack" aria-label="Übungen">
      ${list.length ? list.map(e => cardHTML(e, loc.id, prIds)).join('') : `<div class="card empty"><strong>Noch keine Übungen hier</strong>
        Leg unten deine erste Übung an – oder drück aufs Mikrofon und sag zum Beispiel:<br>„Beinpresse, 80 Kilo, 10 Wiederholungen, 3 Sätze“.</div>`}
    </section>
    <form class="add-ex" data-form="add-ex" autocomplete="off">
      <input class="input" name="name" placeholder="Neue Übung oder Maschine" maxlength="60" list="ex-suggest" enterkeyhint="done" aria-label="Neue Übung oder Maschine">
      <button type="submit" aria-label="Übung hinzufügen">+</button>
    </form>
    <datalist id="ex-suggest">${others.map(e => `<option value="${esc(e.name)}"></option>`).join('')}</datalist>`;

  v.onclick = onClick;
  v.onsubmit = onSubmit;
  v.onkeydown = e => {
    if (e.key === 'Enter' && e.target.matches('[data-form="add-ex"] input')) { e.preventDefault(); e.target.form.requestSubmit(); }
  };
  wireSteppers(v, el => { const c = el.closest('[data-ex]'); return c ? getDraft(c.dataset.ex) : null; }, () => S.settings().weightStep);
}

const rerender = () => { if (view && currentTab() === 'training') renderTraining(view); };
const cardEl = id => view && view.querySelector(`[data-ex="${CSS.escape(id)}"]`);

async function onClick(e) {
  const t = e.target.closest('button');
  if (!t || !view.contains(t)) return;
  const card = t.closest('[data-ex]');
  const exId = card && card.dataset.ex;
  if (t.dataset.loc) {
    await S.setMeta('lastLocationId', t.dataset.loc);
    openEx = null; drafts.clear();
    rerender();
    return;
  }
  switch (t.dataset.act) {
    case 'add-loc': return addLocationSheet();
    case 'backup':
      try { if (await exportBackup()) toast('Sicherung gespeichert – bitte kurz im Ordner „Download“ nachsehen, ob die Datei da ist.', { duration: 6000 }); }
      catch (err) { toast(err.message, { kind: 'error' }); }
      return rerender();
    case 'snooze': await S.setMeta('backupSnoozed', todayKey()); return rerender();
    case 'open': openEx = exId; rerender(); cardEl(exId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return;
    case 'close': openEx = null; return rerender();
    case 'save': return save(exId);
    case 'history': return go('verlauf', { ex: exId });
  }
  if (t.dataset.set) editSetSheet(t.dataset.set);
}

async function onSubmit(e) {
  const f = e.target.closest('[data-form="add-ex"]');
  if (!f) return;
  e.preventDefault();
  const name = f.elements.name.value;
  if (!S.cleanName(name)) return;
  const ex = await S.addExercise(name, S.currentLocation().id);
  if (!ex) return;
  openEx = ex.id;
  rerender();
  cardEl(ex.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/** Speichert die Sätze einer Übung und meldet Rekorde. Wird auch von der Spracheingabe genutzt. */
export async function saveSets(exId, locId, weight, reps, count) {
  const ex = S.exerciseById(exId);
  const { created, record } = await S.addSets(exId, locId, weight, reps, count);
  const d = drafts.get(exId);
  drafts.set(exId, { weight: created[0].weight, reps: created[0].reps, count: 1 });
  if (d) d.count = 1;
  buzz(15);
  rerender();
  const card = cardEl(exId);
  const undo = async () => { await S.deleteSets(created.map(s => s.id)); rerender(); };
  if (record) {
    celebrate(record.kind === 'reps'
      ? `Neuer Rekord bei ${ex.name}: ${record.value} Wiederholungen`
      : `Neuer Rekord bei ${ex.name}: geschätzt ${fmtNum(roundHalf(record.value))} kg Maximalgewicht`, card, { onUndo: undo });
  } else {
    toast(created.length > 1 ? `${created.length} Sätze gespeichert` : 'Satz gespeichert', { action: 'Rückgängig', onAction: undo });
  }
  return created;
}

async function save(exId) {
  const d = getDraft(exId);
  const btn = view.querySelector(`[data-ex="${CSS.escape(exId)}"] [data-act="save"]`);
  if (btn) btn.disabled = true;
  try { await saveSets(exId, S.currentLocation().id, d.weight, d.reps, d.count); }
  catch { toast('Speichern hat nicht geklappt. Bitte nochmal versuchen.', { kind: 'error' }); if (btn) btn.disabled = false; }
}

function addLocationSheet() {
  const el = openSheet(`<h2>Neuer Ort</h2>
    <label class="field"><span>Name</span><input class="input" name="loc" maxlength="60" placeholder="z. B. Hotel oder Büro" autocomplete="off" enterkeyhint="done" autofocus></label>
    <button class="btn-primary" type="button" data-a="ok">Ort anlegen</button>`, { label: 'Neuer Ort' });
  const inp = el.querySelector('input');
  const done = async () => {
    const l = await S.addLocation(inp.value);
    if (!l) { inp.focus(); return; }
    await S.setMeta('lastLocationId', l.id);
    openEx = null; drafts.clear();
    closeSheet();
    rerender();
  };
  el.querySelector('[data-a="ok"]').onclick = done;
  inp.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); done(); } };
}

function editSetSheet(setId) {
  const s = S.state.sets.find(x => x.id === setId);
  if (!s) return;
  const ex = S.exerciseById(s.exerciseId);
  const model = { weight: s.weight, reps: s.reps };
  const el = openSheet(`<h2>Satz ändern</h2>
    <p class="note">${esc(ex?.name || '')} · heute ${esc(fmtTime(s.ts))} Uhr</p>
    ${stepperHTML('weight', model.weight)}
    ${stepperHTML('reps', model.reps)}
    <button class="btn-primary" type="button" data-a="save">Speichern</button>
    <button class="btn-danger" type="button" data-a="del">Satz löschen</button>`, { label: 'Satz ändern' });
  wireSteppers(el, () => model, () => S.settings().weightStep);
  el.querySelector('[data-a="save"]').onclick = async () => { await S.updateSet(setId, model.weight, model.reps); closeSheet(); rerender(); toast('Satz geändert'); };
  el.querySelector('[data-a="del"]').onclick = async () => {
    const gone = await S.deleteSets([setId]);
    closeSheet();
    rerender();
    toast('Satz gelöscht', { action: 'Rückgängig', onAction: async () => { await S.restoreSets(gone); rerender(); } });
  };
}

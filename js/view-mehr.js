// Bereich „Mehr“: Sicherung, Orte, Übungen, Darstellung, Infos.
import * as S from './store.js';
import { esc, fmtDate, fmtAgo } from './format.js';
import { exportBackup, exportCSV, readBackupFile, STEPS, REMIND } from './backup.js';
import { openSheet, closeSheet, toast, ask, applyTheme } from './ui.js';
import { ICON, currentTab } from './nav.js';
import { IN_CLAUDE, env } from './env.js';

export const APP_VERSION = '1.0.2';
let view = null;
let exLoc = null;
let persisted = null;

const THEME_LABELS = [['system', 'Wie das Handy'], ['evening', 'Abends dunkel (19–7 Uhr)'], ['light', 'Immer hell'], ['dark', 'Immer dunkel']];

export function renderMehr(v) {
  view = v;
  const st = S.settings();
  const locs = S.activeLocations();
  if (!exLoc || !locs.some(l => l.id === exLoc)) exLoc = S.currentLocation().id;
  const exs = S.exercisesAt(exLoc);
  const last = S.state.meta.lastBackupAt;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const cloud = env.storage === 'cloud';
  v.innerHTML = `
    <header class="head"><div><h1>Mehr</h1><div class="date">Sicherung, Orte, Übungen und Einstellungen</div></div></header>

    <h3 class="section-title">Sicherung</h3>
    <section class="card stack">
      <div class="row between"><div><strong>${last ? `Letzte Sicherung ${esc(fmtAgo(last))}` : 'Noch keine Sicherung'}</strong>
        <div class="muted small">${last ? esc(fmtDate(last)) : 'Am besten gleich eine machen.'}</div></div>
        ${cloud ? '<span class="badge ok">Im Claude-Konto</span>' : persisted === null ? '' : `<span class="badge ${persisted ? 'ok' : 'warn'}">${persisted ? 'Schutz aktiv' : 'Schutz noch aus'}</span>`}</div>
      ${IN_CLAUDE && !cloud ? '<p class="note"><strong>Achtung:</strong> Das Claude-Konto ist gerade nicht erreichbar. Neue Einträge landen nur auf diesem Gerät.</p>' : ''}
      ${!IN_CLAUDE && persisted === false ?'<p class="note">„Schutz“ heißt: Der Browser löscht die Daten nicht von selbst, wenn der Speicher knapp wird. Er wird meist automatisch aktiv, sobald die App auf dem Startbildschirm liegt. Die Sicherung ist trotzdem wichtig.</p>' : ''}
      <button class="btn-primary" type="button" data-act="export">Sicherung speichern</button>
      <button class="btn-secondary" type="button" data-act="import">Sicherung einlesen</button>
      <input type="file" accept=".json,application/json" data-file hidden>
      <label class="field"><span>Erinnern, wenn die letzte Sicherung älter ist als</span>
        <select class="select" data-set="backupDays">${REMIND.map(d => `<option value="${d}" ${st.backupDays === d ? 'selected' : ''}>${d} Tage</option>`).join('')}</select></label>
      ${cloud ? `<p class="note">Deine Einträge liegen in deinem Claude-Konto. Sie sind auf Handy und PC gleich und bleiben auch beim Handywechsel erhalten. Die Sicherungsdatei ist eine zusätzliche Kopie, z. B. für die NAS oder für den späteren Umzug in die Handy-App.</p>`
        : `<p class="note">Deine Einträge liegen nur auf diesem Handy. Die Sicherungsdatei landet im Ordner „Download“. Leg sie ab und zu an einen zweiten Ort, z. B. in deine Cloud, auf den PC oder per Mail an dich selbst. Im Notfall (neues Handy, Daten weg) holst du die Datei von dort zurück und tippst auf „Sicherung einlesen“. Mach auf jeden Fall eine Sicherung, bevor du das Handy wechselst.</p>
      <p class="note"><strong>Achtung:</strong> „Browserdaten löschen“ in Chrome löscht auch dein Training. Vorher sichern.</p>`}
      <button class="btn-link" type="button" data-act="csv">Alles als Tabelle für Excel speichern</button>
    </section>

    <h3 class="section-title">Orte</h3>
    <section class="card"><div class="list">
      ${locs.map(l => `<div class="list-row"><div class="grow"><strong>${esc(l.name)}</strong> <span class="muted small">· ${S.exercisesAt(l.id).length} Übungen</span></div>
        <button class="icon-btn" type="button" data-loc-edit="${esc(l.id)}" aria-label="${esc(l.name)} umbenennen oder entfernen">${ICON.edit}</button></div>`).join('')}
    </div><button class="btn-link" type="button" data-act="add-loc">+ Ort hinzufügen</button></section>

    <h3 class="section-title">Übungen</h3>
    <section class="card stack">
      ${locs.length > 1 ? `<div class="chips" role="group" aria-label="Ort">${locs.map(l => `<button class="chip" type="button" data-exloc="${esc(l.id)}" aria-pressed="${l.id === exLoc}">${esc(l.name)}</button>`).join('')}</div>` : ''}
      <div class="list">${exs.length ? exs.map((e, i) => `<div class="list-row"><div class="grow">${esc(e.name)}</div>
        <button class="icon-btn" type="button" data-move="${esc(e.id)}" data-d="-1" aria-label="${esc(e.name)} nach oben" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button>
        <button class="icon-btn" type="button" data-move="${esc(e.id)}" data-d="1" aria-label="${esc(e.name)} nach unten" ${i === exs.length - 1 ? 'disabled' : ''}>${ICON.down}</button>
        <button class="icon-btn" type="button" data-ex-edit="${esc(e.id)}" aria-label="${esc(e.name)} bearbeiten">${ICON.edit}</button></div>`).join('') : '<div class="muted">Hier sind noch keine Übungen.</div>'}</div>
      <p class="note">Mit den Pfeilen legst du die Reihenfolge im Training fest.</p>
    </section>

    <h3 class="section-title">Darstellung</h3>
    <section class="card stack">
      <label class="field"><span>Farben</span><select class="select" data-set="theme">${THEME_LABELS.map(([k, l]) => `<option value="${k}" ${st.theme === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Schritte bei Plus und Minus (Gewicht)</span><select class="select" data-set="weightStep">${STEPS.map(s => `<option value="${s}" ${st.weightStep === s ? 'selected' : ''}>${String(s).replace('.', ',')} kg</option>`).join('')}</select></label>
    </section>

    <h3 class="section-title">Über die App</h3>
    <section class="card stack">
      ${IN_CLAUDE
        ? `<p class="note">Aufs Handy: Diese Seite in Chrome öffnen (bei claude.ai angemeldet), dann im Menü (⋮) „Zum Startbildschirm hinzufügen“. Zum Öffnen braucht das Handy Internet.</p>
      <p class="note">Deine Einträge liegen in deinem Claude-Konto und sind nur für dich sichtbar. Keine Werbung, kein Tracking. Die Spracheingabe läuft über Claude: Was du sagst, wird bei Anthropic in Text umgewandelt.</p>`
        : `${standalone ? '<div><span class="badge ok">Läuft als App vom Startbildschirm</span></div>' : window.__installPrompt ? '<button class="btn-secondary" type="button" data-act="install">Auf den Startbildschirm legen</button>' : '<p class="note">Als App installieren: im Browser-Menü (⋮) „Zum Startbildschirm hinzufügen“ bzw. „App installieren“ wählen.</p>'}
      <p class="note">Deine Trainingsdaten bleiben auf diesem Handy. Es gibt kein Konto, keine Werbung und kein Tracking. Beim Sprechen geht deine Aufnahme zur Erkennung an Google (bei Chrome), außer dein Handy kann Deutsch direkt auf dem Gerät erkennen. Deine gespeicherten Einträge werden nicht übertragen.</p>`}
      <p class="note">Version ${APP_VERSION}</p>
    </section>`;
  v.onclick = onClick;
  v.onchange = onChange;
  // Direkt am Feld, damit die Auswahl auch ankommt, falls die Seite zwischendurch neu gezeichnet wurde.
  const fileInput = v.querySelector('[data-file]');
  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (f) importFlow(f);
  });
  v.onsubmit = null;
  v.onkeydown = null;
  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then(p => { if (p !== persisted) { persisted = p; if (currentTab() === 'mehr') renderMehr(v); } }).catch(() => {});
  }
}

const rerender = () => { if (view && currentTab() === 'mehr') renderMehr(view); };

async function onChange(e) {
  const sel = e.target.closest('[data-set]');
  if (sel) {
    const k = sel.dataset.set;
    const val = k === 'theme' ? sel.value : Number(sel.value);
    await S.setSetting(k, val);
    if (k === 'theme') { applyTheme(val); document.dispatchEvent(new Event('themechange')); }
    toast('Gespeichert');
  }
}

async function importFlow(f) {
  let data;
  try { data = await readBackupFile(f); } catch (err) { toast(err.message, { kind: 'error', duration: 7000 }); return; }
  const empty = !S.state.sets.length && !S.state.exercises.length;
  const info = `Sicherung vom ${data.exportedAt ? fmtDate(data.exportedAt) : 'unbekannten Datum'}: ${data.locations.length} Orte, ${data.exercises.length} Übungen, ${data.sets.length} Sätze.${data.skipped ? ` ${data.skipped} beschädigte Einträge werden übersprungen.` : ''}`;
  const mode = await new Promise(resolve => {
    let done = false;
    const el = openSheet(`<h2>Sicherung einlesen</h2><p class="note">${esc(info)}</p>
      ${empty ? '<button class="btn-primary" type="button" data-m="replace">Einlesen</button>' : `
      <button class="btn-primary" type="button" data-m="merge">Zusammenführen</button>
      <p class="note">Empfohlen: Was schon auf dem Handy ist, bleibt so, wie es ist. Doppelte Einträge entstehen nicht. Was du seit dieser Sicherung gelöscht hast, kommt allerdings zurück.</p>
      <button class="btn-danger" type="button" data-m="replace">Alles ersetzen</button>
      <p class="note">Löscht alles auf dem Handy und übernimmt nur die Sicherung.</p>`}
      <button class="btn-secondary" type="button" data-m="">Abbrechen</button>`, { label: 'Sicherung einlesen', onClose: () => { if (!done) resolve(null); } });
    el.addEventListener('click', ev => { const b = ev.target.closest('[data-m]'); if (!b) return; done = true; resolve(b.dataset.m || null); closeSheet(); });
  });
  if (!mode) return;
  if (mode === 'replace' && !empty && !(await ask('Wirklich alles ersetzen?', 'Alle Einträge, die jetzt auf dem Handy sind, werden gelöscht und durch die Sicherung ersetzt.', { ok: 'Ja, ersetzen', danger: true }))) return;
  try {
    await S.applyImport(data, mode);
    applyTheme(S.settings().theme);
    toast('Sicherung eingelesen');
  } catch { toast('Einlesen hat nicht geklappt.', { kind: 'error' }); }
  rerender();
}

async function onClick(e) {
  const t = e.target.closest('button');
  if (!t || !view.contains(t)) return;
  if (t.dataset.exloc) { exLoc = t.dataset.exloc; return rerender(); }
  if (t.dataset.move) { await S.moveExercise(t.dataset.move, exLoc, Number(t.dataset.d)); return rerender(); }
  if (t.dataset.locEdit) return editLocation(t.dataset.locEdit);
  if (t.dataset.exEdit) return editExercise(t.dataset.exEdit);
  switch (t.dataset.act) {
    case 'export': {
      try { const n = await exportBackup(); if (n) toast(`Gespeichert: ${n} – bitte kurz im Ordner „Download“ nachsehen, ob die Datei da ist.`, { duration: 7000 }); }
      catch (err) { toast(err.message, { kind: 'error' }); }
      return rerender();
    }
    case 'import': return view.querySelector('[data-file]').click();
    case 'csv': {
      try { const n = await exportCSV(); if (n) toast(`Gespeichert: ${n}`); }
      catch (err) { toast(err.message, { kind: 'error' }); }
      return;
    }
    case 'add-loc': return editLocation(null);
    case 'install': {
      const p = window.__installPrompt;
      if (!p) return;
      window.__installPrompt = null;
      p.prompt();
      try { await p.userChoice; } catch { /* egal */ }
      return rerender();
    }
  }
}

function editLocation(id) {
  const l = id ? S.locationById(id) : null;
  const canRemove = l && S.activeLocations().length > 1;
  const el = openSheet(`<h2>${l ? 'Ort bearbeiten' : 'Neuer Ort'}</h2>
    <label class="field"><span>Name</span><input class="input" name="n" maxlength="60" value="${esc(l ? l.name : '')}" placeholder="z. B. Hotel oder Büro" autocomplete="off" autofocus></label>
    <button class="btn-primary" type="button" data-a="save">Speichern</button>
    ${canRemove ? '<button class="btn-danger" type="button" data-a="del">Ort ausblenden</button><p class="note">Die Einträge von diesem Ort bleiben im Gesamtverlauf erhalten.</p>' : ''}`, { label: 'Ort' });
  const inp = el.querySelector('input');
  el.addEventListener('click', async ev => {
    const a = ev.target.closest('[data-a]')?.dataset.a;
    if (a === 'save') {
      if (!S.cleanName(inp.value)) { inp.focus(); return; }
      if (l) await S.renameLocation(l.id, inp.value); else await S.addLocation(inp.value);
      closeSheet(); rerender();
    }
    if (a === 'del') {
      closeSheet();
      if (await ask(`„${l.name}“ ausblenden?`, 'Der Ort verschwindet aus der Auswahl. Die Einträge bleiben im Verlauf unter „Alle Orte“.', { ok: 'Ausblenden', danger: true })) {
        await S.archiveLocation(l.id); rerender();
      }
    }
  });
}

function editExercise(id) {
  const ex = S.exerciseById(id);
  if (!ex) return;
  const locs = S.activeLocations();
  const count = S.setsOf(id).length;
  const el = openSheet(`<h2>Übung bearbeiten</h2>
    <label class="field"><span>Name</span><input class="input" name="n" maxlength="60" value="${esc(ex.name)}" autocomplete="off"></label>
    <div class="field"><span>An welchen Orten?</span>${locs.map(l => `<label class="row check-row"><input type="checkbox" data-l="${esc(l.id)}" ${ex.locationIds.includes(l.id) ? 'checked' : ''}> ${esc(l.name)}</label>`).join('')}</div>
    <button class="btn-primary" type="button" data-a="save">Speichern</button>
    <button class="btn-danger" type="button" data-a="del">Übung löschen</button>
    <p class="note">${count ? `Beim Löschen verschwinden auch die ${count} Sätze dieser Übung.` : 'Zu dieser Übung gibt es noch keine Sätze.'}</p>`, { label: 'Übung bearbeiten' });
  const inp = el.querySelector('input[name="n"]');
  el.addEventListener('click', async ev => {
    const a = ev.target.closest('[data-a]')?.dataset.a;
    if (a === 'save') {
      const name = S.cleanName(inp.value);
      if (!name) { inp.focus(); return; }
      const boxes = [...el.querySelectorAll('[data-l]')];
      if (!boxes.some(cb => cb.checked)) { toast('Bitte mindestens einen Ort ankreuzen.', { kind: 'error' }); return; }
      if (name !== ex.name && !(await S.renameExercise(id, name))) { toast('Diesen Namen gibt es schon.', { kind: 'error' }); return; }
      for (const cb of boxes) await S.setExerciseAt(id, cb.dataset.l, cb.checked);
      closeSheet(); rerender(); toast('Gespeichert');
    }
    if (a === 'del') {
      closeSheet();
      if (await ask(`„${ex.name}“ löschen?`, count ? `Die Übung und alle ${count} Sätze werden endgültig gelöscht. Das lässt sich nicht rückgängig machen.` : 'Die Übung wird gelöscht.', { ok: 'Endgültig löschen', danger: true })) {
        await S.deleteExercise(id); rerender(); toast('Übung gelöscht');
      }
    }
  });
}

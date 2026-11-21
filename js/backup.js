// Sicherung: alles als Datei speichern und wieder einlesen, dazu eine Tabelle für Excel.
import * as S from './store.js';
import { dayKey, todayKey, score, roundHalf } from './stats.js';
import { daysAgo } from './format.js';
import { IN_CLAUDE, cap, env } from './env.js';

const FORMAT = 1;
const THEMES = ['system', 'evening', 'light', 'dark'];
const STEPS = [0.5, 1, 1.25, 2, 2.5, 5];
const REMIND = [3, 7, 14, 30];

/**
 * Datei anbieten. Als Claude-Seite fragt Claude kurz nach („Speichern?“).
 * Ergebnis: 'saved' oder 'declined'; wirft bei einem echten Fehler.
 */
export async function download(blob, name) {
  if (IN_CLAUDE) {
    const dl = await cap('downloads');
    if (!dl) throw new Error('Dateien speichern geht in dieser Ansicht nicht.');
    try { await dl.save({ filename: name, data: blob }); return 'saved'; }
    catch (e) {
      if (e && e.code === 'declined') return 'declined';
      if (e && e.code === 'rate_limited') throw new Error('Einen Moment – eine Speicher-Frage ist schon offen.');
      throw new Error('Dateien speichern geht in dieser Ansicht nicht.');
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'saved';
}

/** Über das Teilen-Menü weitergeben, sonst herunterladen. */
export async function shareFile(blob, name, title) {
  if (IN_CLAUDE) return download(blob, name);
  try {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'aborted';
  }
  await download(blob, name);
  return 'downloaded';
}

export function buildBackup() {
  return {
    app: 'fitness-tracker', format: FORMAT, exportedAt: new Date().toISOString(),
    locations: S.state.locations, exercises: S.state.exercises, sets: S.state.sets,
    meta: { settings: S.settings(), lastLocationId: S.state.meta.lastLocationId },
  };
}

/** Gibt den Dateinamen zurück oder null, wenn das Speichern abgelehnt wurde. */
export async function exportBackup() {
  const name = `fitness-sicherung-${dayKey(Date.now())}.json`;
  const r = await download(new Blob([JSON.stringify(buildBackup())], { type: 'application/json' }), name);
  if (r !== 'saved') return null;
  await S.setMeta('lastBackupAt', Date.now());
  return name;
}

// ---------- Tabelle (CSV, öffnet sich in Excel) ----------
function cell(v) {
  const quoteAlways = v && typeof v === 'object';   // Namen immer in Anführungszeichen
  let s = String(quoteAlways ? v.text : (v ?? ''));
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // keine Formeln einschleusen
  return quoteAlways || /[;,"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const dec = v => String(Math.round(v * 100) / 100).replace('.', ',');

export async function exportCSV() {
  const name = `fitness-tabelle-${dayKey(Date.now())}.csv`;
  const r = await download(new Blob([buildCSV()], { type: 'text/csv;charset=utf-8' }), name);
  return r === 'saved' ? name : null;
}

export function buildCSV() {
  const rows = [['Datum', 'Uhrzeit', 'Ort', 'Übung', 'Gewicht (kg)', 'Wiederholungen', 'Geschätztes Maximum (kg)']];
  for (const s of [...S.state.sets].sort((a, b) => a.ts - b.ts)) {
    const d = new Date(s.ts);
    rows.push([
      d.toLocaleDateString('de-DE'), d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      { text: S.locationById(s.locationId)?.name || '' }, { text: S.exerciseById(s.exerciseId)?.name || '' },
      dec(s.weight), s.reps, s.weight > 0 ? dec(roundHalf(score(s))) : '',
    ]);
  }
  return '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n');
}

// ---------- Erinnerung ----------
export function backupDue() {
  if (env.storage === 'cloud') return null; // liegt sicher im Claude-Konto
  if (!S.state.sets.length) return null;
  if (S.state.meta.backupSnoozed === todayKey()) return null;
  const last = S.state.meta.lastBackupAt;
  if (!last) return { text: 'Noch keine Sicherung gemacht', days: null };
  const d = daysAgo(last);
  return d >= S.settings().backupDays ? { text: `Letzte Sicherung vor ${d} Tagen`, days: d } : null;
}

// ---------- Einlesen mit Prüfung ----------
const arr = v => (Array.isArray(v) ? v : []);
const isId = v => typeof v === 'string' && v.length > 0 && v.length <= 64 && /^[A-Za-z0-9_-]+$/.test(v);
const num = (v, d) => (Number.isFinite(v) ? v : d);
const MIN_TS = Date.UTC(2000, 0, 1);

export async function readBackupFile(file) {
  if (!file) throw new Error('Keine Datei gewählt.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Die Datei ist zu groß für eine Sicherung.');
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('Das ist keine Sicherungsdatei dieser App.'); }
  return validateBackup(data);
}

export function validateBackup(d) {
  if (!d || typeof d !== 'object' || d.app !== 'fitness-tracker' || !Number.isFinite(d.format)) throw new Error('Das ist keine Sicherungsdatei dieser App.');
  if (d.format > FORMAT) throw new Error('Diese Sicherung stammt aus einer neueren Version der App. Bitte erst die App aktualisieren.');
  const maxTs = Date.now() + 2 * 86400e3;
  const locations = arr(d.locations).filter(l => l && isId(l.id) && S.cleanName(l.name))
    .map(l => ({ id: l.id, name: S.cleanName(l.name), order: num(l.order, 0), createdAt: num(l.createdAt, Date.now()), archived: !!l.archived }));
  if (!locations.length) throw new Error('In der Datei stehen keine Orte – sie ist wohl beschädigt.');
  if (!locations.some(l => !l.archived)) locations[0].archived = false; // mindestens ein sichtbarer Ort
  const locIds = new Set(locations.map(l => l.id));
  const activeIds = new Set(locations.filter(l => !l.archived).map(l => l.id));
  const exercises = arr(d.exercises).filter(e => e && isId(e.id) && S.cleanName(e.name)).map(e => {
    const order = {};
    if (e.orderByLoc && typeof e.orderByLoc === 'object') for (const [k, v] of Object.entries(e.orderByLoc)) if (locIds.has(k) && Number.isFinite(v)) order[k] = v;
    return { id: e.id, name: S.cleanName(e.name), locationIds: [...new Set(arr(e.locationIds).filter(id => locIds.has(id)))], orderByLoc: order, createdAt: num(e.createdAt, Date.now()), archived: !!e.archived };
  });
  const exIds = new Set(exercises.map(e => e.id));
  const rawSets = arr(d.sets);
  const sets = rawSets.filter(s => s && isId(s.id) && exIds.has(s.exerciseId) && Number.isFinite(s.ts) && s.ts > MIN_TS && s.ts < maxTs)
    .map(s => ({ id: s.id, exerciseId: s.exerciseId, locationId: locIds.has(s.locationId) ? s.locationId : locations[0].id, weight: S.cleanWeight(s.weight), reps: S.cleanReps(s.reps), ts: Math.round(s.ts) }));
  const exp = typeof d.exportedAt === 'string' ? Date.parse(d.exportedAt) : NaN;
  const exportedTs = Number.isFinite(exp) && exp > MIN_TS && exp < maxTs ? exp : null;
  const meta = { lastBackupAt: exportedTs || Date.now() };
  const st = d.meta && d.meta.settings;
  if (st && typeof st === 'object') {
    meta.settings = {
      theme: THEMES.includes(st.theme) ? st.theme : 'system',
      weightStep: STEPS.includes(st.weightStep) ? st.weightStep : 2.5,
      backupDays: REMIND.includes(st.backupDays) ? st.backupDays : 7,
    };
  }
  if (d.meta && activeIds.has(d.meta.lastLocationId)) meta.lastLocationId = d.meta.lastLocationId;
  return { locations, exercises, sets, meta, exportedAt: exportedTs, skipped: rawSets.length - sets.length };
}

export { THEMES, STEPS, REMIND };

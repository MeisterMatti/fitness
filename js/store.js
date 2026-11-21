// Daten im Speicher plus Änderungen, die sofort auf dem Gerät gesichert werden.
import * as db from './db.js';
import { dayKey, todayKey, isBodyweight, modeOf, counts, scoreIn } from './stats.js';

export const DEFAULT_SETTINGS = { theme: 'system', weightStep: 2.5, backupDays: 7 };
export const LIMITS = { name: 60, weightMax: 1000, repsMax: 999, setsMax: 20 };

export const state = { locations: [], exercises: [], sets: [], meta: {} };

export function uid() {
  if (self.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function cleanName(s) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.name);
}
export function norm(s) {
  return String(s ?? '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
}
export function cleanWeight(v) {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(LIMITS.weightMax, Math.round(n * 100) / 100);
}
export function cleanReps(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(LIMITS.repsMax, n);
}

export const settings = () => ({ ...DEFAULT_SETTINGS, ...(state.meta.settings || {}) });

export async function init() {
  const data = await db.loadAll();
  Object.assign(state, data);
  state.sets.sort((a, b) => a.ts - b.ts);
  if (!state.locations.length) {
    const now = Date.now();
    const locs = [
      { id: uid(), name: 'Studio', order: 0, createdAt: now, archived: false },
      { id: uid(), name: 'Zuhause', order: 1, createdAt: now, archived: false },
    ];
    state.locations = locs;
    await db.write(locs.map(l => ({ store: 'locations', put: l })));
  } else if (!activeLocations().length) {
    // Alle Orte ausgeblendet (z. B. durch eine beschädigte Sicherung): den ersten wieder zeigen.
    const first = [...state.locations].sort((a, b) => a.order - b.order)[0];
    first.archived = false;
    await db.put('locations', first);
  }
  const cur = state.locations.find(l => l.id === state.meta.lastLocationId && !l.archived);
  if (!cur) state.meta.lastLocationId = activeLocations()[0].id;
}

/** Daten neu vom Gerät lesen (z. B. wenn die App und ein Browser-Tab gleichzeitig offen waren). */
export async function reload() {
  const keep = state.meta.lastLocationId;
  await init();
  if (locationById(keep) && !locationById(keep).archived) state.meta.lastLocationId = keep;
}

export async function setMeta(key, value) {
  state.meta[key] = value;
  await db.setMeta(key, value);
}
export async function setSetting(key, value) {
  const s = { ...(state.meta.settings || {}), [key]: value };
  await setMeta('settings', s);
}

// ---------- Orte ----------
export const activeLocations = () => state.locations.filter(l => !l.archived).sort((a, b) => a.order - b.order);
export const locationById = id => state.locations.find(l => l.id === id);
export function currentLocation() {
  const l = locationById(state.meta.lastLocationId);
  return l && !l.archived ? l : activeLocations()[0];
}

export async function addLocation(name) {
  name = cleanName(name);
  if (!name) return null;
  const existing = activeLocations().find(l => norm(l.name) === norm(name));
  if (existing) return existing;
  const l = { id: uid(), name, order: Math.max(-1, ...state.locations.map(x => x.order)) + 1, createdAt: Date.now(), archived: false };
  state.locations.push(l);
  await db.put('locations', l);
  return l;
}
export async function renameLocation(id, name) {
  const l = locationById(id); name = cleanName(name);
  if (!l || !name) return;
  l.name = name;
  await db.put('locations', l);
}
/** Ort ausblenden. Die Einträge bleiben im Gesamtverlauf erhalten. */
export async function archiveLocation(id) {
  const l = locationById(id);
  if (!l || activeLocations().length <= 1) return false;
  l.archived = true;
  await db.put('locations', l);
  if (state.meta.lastLocationId === id) await setMeta('lastLocationId', activeLocations()[0].id);
  return true;
}

// ---------- Übungen ----------
export const exerciseById = id => state.exercises.find(e => e.id === id);
export const activeExercises = () => state.exercises.filter(e => !e.archived);
export function exercisesAt(locId) {
  return activeExercises().filter(e => e.locationIds.includes(locId))
    .sort((a, b) => (a.orderByLoc?.[locId] ?? 0) - (b.orderByLoc?.[locId] ?? 0));
}
export const findExerciseByName = name => activeExercises().find(e => norm(e.name) === norm(name));

function nextOrder(locId) {
  return Math.max(-1, ...exercisesAt(locId).map(e => e.orderByLoc?.[locId] ?? 0)) + 1;
}

export async function addExercise(name, locId) {
  name = cleanName(name);
  if (!name || !locId) return null;
  let e = findExerciseByName(name);
  if (e) {
    if (!e.locationIds.includes(locId)) {
      e.locationIds.push(locId);
      e.orderByLoc = { ...(e.orderByLoc || {}), [locId]: nextOrder(locId) };
      await db.put('exercises', e);
    }
    return e;
  }
  e = { id: uid(), name, locationIds: [locId], orderByLoc: { [locId]: nextOrder(locId) }, createdAt: Date.now(), archived: false };
  state.exercises.push(e);
  await db.put('exercises', e);
  return e;
}
export async function renameExercise(id, name) {
  const e = exerciseById(id); name = cleanName(name);
  if (!e || !name) return false;
  const other = findExerciseByName(name);
  if (other && other.id !== id) return false;
  e.name = name;
  await db.put('exercises', e);
  return true;
}
export async function setExerciseAt(id, locId, on) {
  const e = exerciseById(id);
  if (!e) return;
  if (on && !e.locationIds.includes(locId)) {
    e.locationIds.push(locId);
    e.orderByLoc = { ...(e.orderByLoc || {}), [locId]: nextOrder(locId) };
  } else if (!on) {
    e.locationIds = e.locationIds.filter(x => x !== locId);
  }
  await db.put('exercises', e);
}
export async function moveExercise(id, locId, dir) {
  const list = exercisesAt(locId);
  const i = list.findIndex(e => e.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((e, k) => { e.orderByLoc = { ...(e.orderByLoc || {}), [locId]: k }; });
  await db.write(list.map(e => ({ store: 'exercises', put: e })));
}
/** Übung komplett löschen, mit allen Sätzen. */
export async function deleteExercise(id) {
  const gone = state.sets.filter(s => s.exerciseId === id);
  state.sets = state.sets.filter(s => s.exerciseId !== id);
  state.exercises = state.exercises.filter(e => e.id !== id);
  await db.write([{ store: 'exercises', del: id }, ...gone.map(s => ({ store: 'sets', del: s.id }))]);
}

// ---------- Sätze ----------
export const setsOf = (exId, locId) => state.sets.filter(s => s.exerciseId === exId && (!locId || s.locationId === locId));
export const todaySets = (exId, locId) => setsOf(exId, locId).filter(s => dayKey(s.ts) === todayKey());

/** Letzter Satz – bevorzugt am selben Ort, sonst irgendwo. */
export function lastSet(exId, locId) {
  const here = setsOf(exId, locId);
  if (here.length) return here[here.length - 1];
  const any = setsOf(exId);
  return any[any.length - 1] || null;
}
/** Das letzte Training vor heute (Tag + Sätze). */
export function previousSession(exId, locId) {
  const today = todayKey();
  for (const list of [setsOf(exId, locId), setsOf(exId)]) {
    const before = list.filter(s => dayKey(s.ts) < today);
    if (before.length) {
      const k = dayKey(before[before.length - 1].ts);
      return { day: k, sets: before.filter(s => dayKey(s.ts) === k), elsewhere: list !== setsOf(exId, locId) && !setsOf(exId, locId).some(s => dayKey(s.ts) === k) };
    }
  }
  return null;
}
export const exerciseIsBodyweight = exId => { const l = setsOf(exId).slice(-6); return isBodyweight(l); };

/** Fügt Sätze hinzu und meldet, ob dabei ein neuer Rekord entstanden ist. */
export async function addSets(exId, locId, weight, reps, count = 1) {
  weight = cleanWeight(weight); reps = cleanReps(reps);
  count = Math.max(1, Math.min(LIMITS.setsMax, Math.round(count) || 1));
  const before = setsOf(exId);
  const base = Date.now();
  const created = [];
  for (let i = 0; i < count; i++) created.push({ id: uid(), exerciseId: exId, locationId: locId, weight, reps, ts: base + i });
  // Rekord nur im Vergleich mit Sätzen derselben Art (mit Gewicht ↔ mit Gewicht, ohne ↔ ohne).
  const mode = modeOf([...before, created[0]]);
  const comparable = before.filter(s => counts(s, mode));
  const prevBest = comparable.reduce((a, s) => Math.max(a, scoreIn(s, mode)), 0);
  state.sets.push(...created);
  await db.write(created.map(s => ({ store: 'sets', put: s })));
  let record = null;
  if (comparable.length && counts(created[0], mode)) {
    const v = scoreIn(created[0], mode);
    if (v > prevBest + 1e-9) record = { kind: mode === 'kg' ? 'best' : 'reps', value: v, prev: prevBest };
  }
  return { created, record };
}
export async function updateSet(id, weight, reps) {
  const s = state.sets.find(x => x.id === id);
  if (!s) return;
  s.weight = cleanWeight(weight); s.reps = cleanReps(reps);
  await db.put('sets', s);
}
export async function deleteSets(ids) {
  const set = new Set(ids);
  const gone = state.sets.filter(s => set.has(s.id));
  state.sets = state.sets.filter(s => !set.has(s.id));
  await db.write(gone.map(s => ({ store: 'sets', del: s.id })));
  return gone;
}
export async function restoreSets(sets) {
  state.sets.push(...sets);
  state.sets.sort((a, b) => a.ts - b.ts);
  await db.write(sets.map(s => ({ store: 'sets', put: s })));
}

/** Alles durch importierte Daten ersetzen oder zusammenführen. */
export async function applyImport(data, mode) {
  // Frische App ohne eigene Einträge: einfach alles übernehmen.
  if (!state.sets.length && !state.exercises.length) mode = 'replace';
  if (mode === 'replace') {
    const meta = { ...state.meta, ...data.meta };
    await db.replaceAll({ ...data, meta });
  } else {
    // Gleiche Namen zusammenlegen, damit nichts doppelt auftaucht.
    const locMap = new Map(), exMap = new Map();
    const ops = [];
    // Was es auf dem Handy schon gibt (gleiche ID), bleibt so wie auf dem Handy.
    for (const l of data.locations) {
      if (state.locations.some(x => x.id === l.id)) continue;
      const same = activeLocations().find(x => norm(x.name) === norm(l.name));
      if (same) { locMap.set(l.id, same.id); continue; }
      ops.push({ store: 'locations', put: l });
    }
    const mapLoc = id => locMap.get(id) || id;
    for (const e of data.exercises) {
      const same = state.exercises.find(x => x.id === e.id) || activeExercises().find(x => norm(x.name) === norm(e.name));
      const locIds = e.locationIds.map(mapLoc);
      if (same) {
        if (same.id !== e.id) exMap.set(e.id, same.id);
        same.locationIds = [...new Set([...same.locationIds, ...locIds])];
        same.orderByLoc = { ...Object.fromEntries(Object.entries(e.orderByLoc || {}).map(([k, v]) => [mapLoc(k), v])), ...(same.orderByLoc || {}) };
        ops.push({ store: 'exercises', put: same });
      } else {
        ops.push({ store: 'exercises', put: { ...e, locationIds: locIds, orderByLoc: Object.fromEntries(Object.entries(e.orderByLoc || {}).map(([k, v]) => [mapLoc(k), v])) } });
      }
    }
    const have = new Set(state.sets.map(s => s.id));
    for (const s of data.sets) {
      if (have.has(s.id)) continue;
      ops.push({ store: 'sets', put: { ...s, exerciseId: exMap.get(s.exerciseId) || s.exerciseId, locationId: mapLoc(s.locationId) } });
    }
    await db.write(ops);
  }
  await init(); // neu laden und prüfen, dass es einen sichtbaren Ort gibt
}

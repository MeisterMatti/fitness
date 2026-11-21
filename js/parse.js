// Versteht Sätze wie „Beinpresse, 80 Kilo, 10 Wiederholungen, 3 Sätze“ – auch mit Zahlwörtern.

const n = s => String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');

const ONES = { ein: 1, eins: 1, eine: 1, einen: 1, einem: 1, einer: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9 };
const TEENS = { null: 0, zehn: 10, elf: 11, zwoelf: 12, dreizehn: 13, vierzehn: 14, fuenfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19 };
const TENS = { zwanzig: 20, dreissig: 30, dreizig: 30, vierzig: 40, fuenfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90 };
const ONE_WORDS = new Set(['ein', 'eine', 'einen', 'einem', 'einer']);

function below100(w) {
  if (w in TEENS) return TEENS[w];
  if (w in ONES) return ONES[w];
  if (w in TENS) return TENS[w];
  const i = w.indexOf('und');
  if (i > 0) {
    const a = w.slice(0, i), b = w.slice(i + 3);
    if (a in ONES && b in TENS) return ONES[a] + TENS[b];
  }
  return null;
}

/** Zahlwort (bereits klein, ohne Umlaute) in Zahl umwandeln, sonst null. */
export function wordToNumber(w) {
  if (!w) return null;
  if (w === 'anderthalb' || w === 'eineinhalb') return 1.5;
  if (w.length > 7 && w.endsWith('einhalb')) {
    const b = wordToNumber(w.slice(0, -7));
    return b == null ? null : b + 0.5;
  }
  const h = w.indexOf('hundert');
  if (h >= 0) {
    const left = w.slice(0, h), right = w.slice(h + 7);
    const hv = left === '' ? 1 : (left in ONES ? ONES[left] : null);
    if (hv == null) return null;
    if (right === '') return hv * 100;
    const rv = below100(right.startsWith('und') ? right.slice(3) : right);
    return rv == null ? null : hv * 100 + rv;
  }
  return below100(w);
}

const WEIGHT_U = new Set(['kilo', 'kilos', 'kg', 'kilogramm', 'kilogram', 'kgs']);
const REPS_U = new Set(['wiederholung', 'wiederholungen', 'wdh', 'whd', 'wh', 'reps', 'rep', 'wiederholungn']);
const SETS_U = new Set(['satz', 'saetze', 'saetzen', 'saetz', 'sets', 'set', 'durchgang', 'durchgaenge', 'durchgaengen', 'runde', 'runden']);
const TIMES = new Set(['x', 'mal']);
const BODY = new Set(['koerpergewicht', 'eigengewicht', 'ohnegewicht']);
const FILLER = new Set(['mit', 'und', 'je', 'a', 'à', 'bei', 'auf', 'fuer', 'im', 'in', 'am', 'an', 'der', 'die', 'das', 'dem', 'den', 'des',
  'ich', 'habe', 'hab', 'heute', 'noch', 'jeweils', 'pro', 'gemacht', 'geschafft', 'jetzt', 'dann', 'also', 'ok', 'okay', 'bitte',
  'gewicht', 'ohne', 'wiederholt', 'studio', 'zuhause', 'hause', 'zu', 'von', 'vom', 'zum', 'zur', 'ueber', 'nochmal', 'satzweise', 'jeder', 'jede']);

function tokenize(text) {
  let t = String(text || '');
  t = t.replace(/(\d)\s*[.,]\s*(\d)/g, '$1#$2');           // Dezimalzahlen schützen
  t = t.replace(/[×*]/g, ' x ');
  t = t.replace(/(\d)\s*x\s*(\d)/gi, '$1 x $2');
  t = t.replace(/(\d)([a-zA-ZäöüÄÖÜß])/g, '$1 $2');        // 80kg → 80 kg
  t = t.replace(/([a-zA-ZäöüÄÖÜß])(\d)/g, '$1 $2');
  t = t.replace(/[,.;:!?()"„“”'’\-–/+]/g, ' ');
  t = t.replace(/#/g, '.');
  return t.split(/\s+/).filter(Boolean);
}

/**
 * Zerlegt einen gesprochenen oder getippten Satz.
 * Ergebnis: { name, weight, reps, sets } – fehlende Werte sind null.
 */
export function parseUtterance(text) {
  const raw = tokenize(text);
  // 1) Tokens bestimmen: Zahl oder Wort
  const toks = [];
  for (let i = 0; i < raw.length; i++) {
    const orig = raw[i], w = n(orig);
    const next = raw[i + 1] ? n(raw[i + 1]) : '';
    if (/^\d+(\.\d+)?$/.test(w)) { toks.push({ num: parseFloat(w), orig }); continue; }
    if (w === 'einhalb' && toks.length && toks[toks.length - 1].num != null) { toks[toks.length - 1].num += 0.5; continue; }
    if (w === 'komma' && toks.length && toks[toks.length - 1].num != null && raw[i + 1]) {
      const nx = n(raw[i + 1]);
      const dv = /^\d+$/.test(nx) ? nx : (wordToNumber(nx) != null && Number.isInteger(wordToNumber(nx)) ? String(wordToNumber(nx)) : null);
      if (dv != null) { const p = toks[toks.length - 1]; p.num = parseFloat(`${Math.trunc(p.num)}.${dv}`); i++; continue; }
    }
    if (w.length > 3 && w.endsWith('mal') && wordToNumber(w.slice(0, -3)) != null) {
      toks.push({ num: wordToNumber(w.slice(0, -3)), orig }, { word: 'mal', orig: 'mal' });
      continue;
    }
    const wn = wordToNumber(w);
    if (wn != null) {
      const unitNext = WEIGHT_U.has(next) || REPS_U.has(next) || SETS_U.has(next) || TIMES.has(next);
      if (!ONE_WORDS.has(w) || unitNext) { toks.push({ num: wn, orig }); continue; }
    }
    if (w === 'ohne' && next === 'gewicht') { toks.push({ body: true, orig }); i++; continue; }
    toks.push({ word: w, orig });
  }

  let weight = null, reps = null, sets = null, body = false;
  const used = new Set();
  const isUnit = (t, set) => t && t.word != null && set.has(t.word);

  // 2) „3 x 10“ bzw. „3 mal 10“
  for (let i = 0; i + 2 < toks.length; i++) {
    const a = toks[i], m = toks[i + 1], b = toks[i + 2];
    if (a.num != null && isUnit(m, TIMES) && b.num != null && !used.has(i) && !used.has(i + 2)) {
      if (isUnit(toks[i + 3], WEIGHT_U)) { reps = a.num; weight = b.num; used.add(i + 3); }
      else { sets = a.num; reps = b.num; if (isUnit(toks[i + 3], REPS_U)) used.add(i + 3); }
      used.add(i); used.add(i + 1); used.add(i + 2);
    }
  }
  // 3) Zahl + Einheit
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], u = toks[i + 1];
    if (used.has(i) || t.num == null || !u || used.has(i + 1)) continue;
    if (isUnit(u, WEIGHT_U) && weight == null) { weight = t.num; used.add(i); used.add(i + 1); }
    else if (isUnit(u, REPS_U) && reps == null) { reps = t.num; used.add(i); used.add(i + 1); }
    else if (isUnit(u, SETS_U) && sets == null) { sets = t.num; used.add(i); used.add(i + 1); }
    else if (isUnit(u, TIMES) && reps == null) { reps = t.num; used.add(i); used.add(i + 1); }
  }
  // 4) Einheit + Zahl („Sätze 3“)
  for (let i = 0; i + 1 < toks.length; i++) {
    const u = toks[i], t = toks[i + 1];
    if (used.has(i) || used.has(i + 1) || t.num == null || u.word == null) continue;
    if ((WEIGHT_U.has(u.word) || u.word === 'gewicht') && weight == null) { weight = t.num; used.add(i); used.add(i + 1); }
    else if (REPS_U.has(u.word) && reps == null) { reps = t.num; used.add(i); used.add(i + 1); }
    else if (SETS_U.has(u.word) && sets == null) { sets = t.num; used.add(i); used.add(i + 1); }
  }
  // 5) Körpergewicht
  toks.forEach((t, i) => { if (t.body || (t.word && BODY.has(t.word))) { body = true; used.add(i); } });
  if (body && weight == null) weight = 0;

  // 6) Zahlen ohne Einheit der Reihe nach verteilen
  const free = toks.map((t, i) => ({ t, i })).filter(x => x.t.num != null && !used.has(x.i));
  const take = () => { const x = free.shift(); used.add(x.i); return x.t.num; };
  if (weight == null && reps == null && free.length >= 2) { weight = take(); reps = take(); }
  else if (weight == null && reps == null && free.length === 1) {
    const v = free[0].t.num;
    if (v >= 25 || !Number.isInteger(v)) weight = take(); else reps = take();
  }
  if (weight == null && reps != null && free.length) weight = take();
  if (reps == null && weight != null && free.length) reps = take();
  if (sets == null && free.length) sets = take();

  // 7) Übrige Wörter ergeben den Namen der Übung
  const nameParts = toks.filter((t, i) => !used.has(i) && t.word != null && !FILLER.has(t.word)
    && !WEIGHT_U.has(t.word) && !REPS_U.has(t.word) && !SETS_U.has(t.word) && !TIMES.has(t.word)).map(t => t.orig);
  let name = nameParts.join(' ').trim();
  if (name) name = name.charAt(0).toUpperCase() + name.slice(1);

  const clean = (v, int) => (v == null || !Number.isFinite(v) ? null : int ? Math.round(v) : Math.round(v * 100) / 100);
  return { name: name || null, weight: clean(weight), reps: clean(reps, true), sets: clean(sets, true) };
}

// ---------- Übung zuordnen ----------
const key = s => n(s).replace(/[^a-z0-9]/g, '');

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, k = b.length;
  if (!m) return k; if (!k) return m;
  let prev = Array.from({ length: k + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= k; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[k];
}

/** Sucht die passende Übung. Bevorzugt Übungen am aktuellen Ort. */
export function matchExercise(name, exercises, locId) {
  const q = key(name);
  if (!q) return null;
  let best = null, bestScore = 0;
  for (const e of exercises) {
    const k = key(e.name);
    let s = 0;
    if (k === q) s = 1;
    else if (q.length >= 4 && (k.includes(q) || q.includes(k)) && Math.min(k.length, q.length) >= 4) s = 0.8 + 0.15 * Math.min(k.length, q.length) / Math.max(k.length, q.length);
    else s = 1 - lev(k, q) / Math.max(k.length, q.length);
    if (e.locationIds && e.locationIds.includes(locId)) s += 0.03;
    if (s > bestScore) { bestScore = s; best = e; }
  }
  return bestScore >= 0.74 ? best : null;
}

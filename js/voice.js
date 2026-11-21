// Spracheingabe: zuhören, verstehen, zur Kontrolle zeigen, speichern.
import * as S from './store.js';
import { parseUtterance, matchExercise } from './parse.js';
import { openSheet, closeSheet, toast } from './ui.js';
import { stepperHTML, wireSteppers } from './stepper.js';
import { saveSets, getDraft, openExercise, setOpenExercise } from './view-training.js';
import { esc } from './format.js';
import { go } from './nav.js';
import { IN_CLAUDE, cap } from './env.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
const micBtn = () => document.getElementById('micBtn');
const EXAMPLE = '„Beinpresse, 80 Kilo, 10 Wiederholungen, 3 Sätze“';

// Kann das Handy Deutsch direkt auf dem Gerät erkennen? Dann bleibt die Aufnahme auf dem Handy.
let localOk = false;
try {
  if (SR && typeof SR.available === 'function') {
    SR.available({ langs: ['de-DE'], processLocally: true }).then(s => { localOk = s === 'available'; }).catch(() => {});
  }
} catch { /* ältere Browser */ }

// Als Claude-Seite übernimmt Claude das Zuhören (die Seite selbst darf kein Mikrofon öffnen).
let dict = null;
if (IN_CLAUDE) cap('dictation').then(d => { dict = d; });

export function startVoice() {
  if (rec) { rec.stop(); return; }
  if (IN_CLAUDE) {
    if (!dict) { typeSheet(); return; }
    if (S.state.meta.speechInfoSeen) { listenDictation(); return; }
  } else {
    if (!SR) { typeSheet(); return; }
    if (S.state.meta.speechInfoSeen) { listen(); return; }
  }
  // Einmaliger Hinweis vor dem ersten Sprechen
  const el = openSheet(`<h2>Kurz vorab</h2>
    <p class="note">${IN_CLAUDE
      ? 'Die Spracheingabe läuft über Claude: Was du sagst, wird bei Anthropic in Text umgewandelt, wie beim Diktieren im Claude-Chat. Beim ersten Mal fragt Claude, ob die Seite das Mikrofon nutzen darf.'
      : 'Wenn dein Handy es kann, erkennt die App deine Sprache direkt auf dem Gerät. Sonst geht die Aufnahme zur Erkennung an Google (bei Chrome). Deine gespeicherten Einträge werden dabei nicht übertragen.'}</p>
    <button class="btn-primary" type="button" data-a="ok">Verstanden, los geht's</button>
    <button class="btn-secondary" type="button" data-a="type">Lieber tippen</button>`, { label: 'Hinweis zur Spracheingabe' });
  el.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'ok') { S.setMeta('speechInfoSeen', true); if (IN_CLAUDE) listenDictation(); else listen(); }
    if (a === 'type') typeSheet();
  });
}

/** Zuhören über Claudes Diktieren. Muss direkt aus dem Tipp aufgerufen werden (nichts vorher abwarten). */
function listenDictation() {
  const d = dict;
  let text = '', partial = '', timer = null, done = false;
  const unsubs = [];
  const cleanup = () => { clearTimeout(timer); unsubs.forEach(u => { try { u(); } catch { /* egal */ } }); micBtn()?.classList.remove('listening'); };
  const el = openSheet(`<h2>Ich höre zu …</h2>
    <div class="row"><span class="listen-dot" aria-hidden="true"></span><div class="heard grow" data-heard aria-live="polite">Sag zum Beispiel: ${EXAMPLE}</div></div>
    <button class="btn-secondary" type="button" data-a="stop">Fertig</button>
    <button class="btn-link" type="button" data-a="type">Lieber tippen</button>`,
  { label: 'Spracheingabe', onClose: () => { if (!done) { done = true; cleanup(); d.stop().catch(() => {}); } } });
  const show = () => { const h = el.querySelector('[data-heard]'); if (h) h.textContent = (text + ' ' + partial).trim() || '…'; };
  const finish = async () => {
    if (done) return;
    done = true;
    try { await d.stop(); } catch { /* egal */ }
    cleanup();
    if (!el.isConnected) return;
    const t = (text + ' ' + partial).trim();
    if (t) confirmSheet(t); else typeSheet('Ich habe nichts verstanden. Versuch es nochmal oder tippe es ein.');
  };
  unsubs.push(d.onPartial(e => { partial = e.text || ''; show(); }));
  unsubs.push(d.onFinal(e => {
    text += e.text || ''; partial = ''; show();
    clearTimeout(timer);
    timer = setTimeout(finish, 1800); // kurze Pause = fertig gesprochen
  }));
  el.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'stop') finish();
    if (a === 'type') { done = true; cleanup(); d.stop().catch(() => {}); typeSheet(); }
  });
  d.start({ language: 'de-DE' }).then(() => { if (!done) micBtn()?.classList.add('listening'); }).catch(err => {
    if (done) return;
    done = true;
    cleanup();
    if (!el.isConnected) return;
    const code = err && err.code;
    if (code === 'stopped') return;
    typeSheet(code === 'not_granted'
      ? 'Das Mikrofon ist für diese Seite nicht erlaubt. Du kannst es im Menü der Seite unter „Berechtigungen“ freigeben – oder hier tippen bzw. die Mikrofon-Taste deiner Tastatur nutzen.'
      : 'Die Spracheingabe klappt hier gerade nicht. Tippe es ein oder nutze die Mikrofon-Taste deiner Tastatur.');
  });
}

function listen() {
  const el = openSheet(`<h2>Ich höre zu …</h2>
    <div class="row"><span class="listen-dot" aria-hidden="true"></span><div class="heard grow" data-heard aria-live="polite">Sag zum Beispiel: ${EXAMPLE}</div></div>
    <button class="btn-secondary" type="button" data-a="stop">Fertig</button>
    <button class="btn-link" type="button" data-a="type">Lieber tippen</button>`,
  { label: 'Spracheingabe', onClose: () => { if (rec) rec.abort(); } });

  let finalText = '', interim = '', error = null;
  const r = new SR();
  rec = r;
  r.lang = 'de-DE';
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  if (localOk && 'processLocally' in r) { try { r.processLocally = true; } catch { /* egal */ } }
  r.onresult = ev => {
    interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const res = ev.results[i];
      if (res.isFinal) finalText += res[0].transcript + ' ';
      else interim += res[0].transcript;
    }
    const h = el.querySelector('[data-heard]');
    if (h) h.textContent = (finalText + interim).trim() || '…';
  };
  r.onerror = ev => { error = ev.error; };
  r.onend = () => {
    if (rec === r) rec = null;
    micBtn()?.classList.remove('listening');
    if (r.processLocally && error && error !== 'no-speech' && error !== 'aborted') localOk = false; // nächstes Mal ohne Gerät-Erkennung
    if (!el.isConnected) return; // vom Nutzer geschlossen oder gewechselt
    const text = (finalText + ' ' + interim).trim();
    if (text) { confirmSheet(text); return; }
    if (error === 'not-allowed' || error === 'service-not-allowed') typeSheet('Das Mikrofon ist für diese App noch nicht erlaubt. Du kannst es in den Browser-Einstellungen freigeben – oder hier tippen bzw. die Mikrofon-Taste deiner Tastatur nutzen.');
    else if (error === 'network') typeSheet('Für die Spracheingabe braucht dein Handy gerade Internet. Nutz die Mikrofon-Taste deiner Tastatur oder tippe es ein.');
    else typeSheet('Ich habe nichts verstanden. Versuch es nochmal oder tippe es ein.');
  };
  el.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'stop') r.stop();
    if (a === 'type') { r.abort(); typeSheet(); }
  });
  try { r.start(); micBtn()?.classList.add('listening'); }
  catch { rec = null; typeSheet(); }
}

function typeSheet(note = '') {
  const el = openSheet(`<h2>Eintragen</h2>
    ${note ? `<p class="note">${esc(note)}</p>` : ''}
    <label class="field"><span>Was hast du gemacht?</span>
      <input class="input" name="t" maxlength="200" placeholder="Beinpresse 80 Kilo 10 Wiederholungen 3 Sätze" autocomplete="off" enterkeyhint="go" autofocus></label>
    <p class="note">Tipp: Mit der Mikrofon-Taste deiner Handy-Tastatur kannst du auch hier einfach sprechen.</p>
    <button class="btn-primary" type="button" data-a="go">Weiter</button>`, { label: 'Eintragen' });
  const inp = el.querySelector('input');
  const next = () => { if (inp.value.trim()) confirmSheet(inp.value); else inp.focus(); };
  el.querySelector('[data-a="go"]').onclick = next;
  inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); next(); } };
}

export function confirmSheet(text) {
  const p = parseUtterance(text);
  const loc = S.currentLocation();
  let ex = p.name ? matchExercise(p.name, S.activeExercises(), loc.id) : null;
  if (!ex && !p.name && openExercise()) ex = S.exerciseById(openExercise());
  const base = ex ? getDraft(ex.id) : { weight: 20, reps: 10 };
  const model = { weight: p.weight ?? base.weight, reps: p.reps ?? base.reps, count: p.sets ?? 1 };
  const nameVal = ex ? ex.name : (p.name || '');
  const el = openSheet(`<h2>Stimmt das so?</h2>
    <p class="heard">„${esc(text.trim())}“</p>
    <label class="field"><span>Übung</span>
      <input class="input" name="ex" list="voice-ex" value="${esc(nameVal)}" maxlength="60" placeholder="Name der Übung" autocomplete="off"></label>
    <datalist id="voice-ex">${S.activeExercises().map(e => `<option value="${esc(e.name)}"></option>`).join('')}</datalist>
    <p class="note" data-newhint ${!ex && p.name ? '' : 'hidden'}>Neue Übung – wird beim Speichern für „${esc(loc.name)}“ angelegt.</p>
    ${stepperHTML('weight', model.weight)}
    ${stepperHTML('reps', model.reps)}
    ${stepperHTML('count', model.count, 'Sätze')}
    <button class="btn-primary" type="button" data-a="save">Speichern</button>
    <div class="btn-row"><button class="btn-secondary" type="button" data-a="again">Nochmal sprechen</button><button class="btn-secondary" type="button" data-a="cancel">Abbrechen</button></div>`,
  { label: 'Eingabe prüfen' });
  wireSteppers(el, () => model, () => S.settings().weightStep);
  const nameInp = el.querySelector('input[name="ex"]');
  const hint = el.querySelector('[data-newhint]');
  nameInp.addEventListener('input', () => { hint.hidden = !S.cleanName(nameInp.value) || !!S.findExerciseByName(nameInp.value); });
  el.addEventListener('click', async e => {
    const btn = e.target.closest('[data-a]');
    const a = btn?.dataset.a;
    if (a === 'cancel') closeSheet();
    if (a === 'again') startVoice();
    if (a !== 'save' || btn.disabled) return;
    btn.disabled = true; // kein doppeltes Speichern
    const name = S.cleanName(nameInp.value);
    if (!name) { btn.disabled = false; nameInp.focus(); toast('Bitte noch die Übung eintragen.'); return; }
    try {
      const exercise = await S.addExercise(name, loc.id);
      closeSheet();
      setOpenExercise(exercise.id);
      go('training');
      await saveSets(exercise.id, loc.id, model.weight, model.reps, model.count);
    } catch {
      toast('Speichern hat nicht geklappt. Bitte nochmal versuchen.', { kind: 'error' });
    }
  });
}

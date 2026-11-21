// Start der App: Daten laden, Bereiche umschalten, Offline-Betrieb einrichten.
import * as S from './store.js';
import { applyTheme, toast, sheetOpen, closeSheet } from './ui.js';
import { setRouter, setTab } from './nav.js';
import { renderTraining } from './view-training.js';
import { renderVerlauf } from './view-verlauf.js';
import { renderBericht } from './view-bericht.js';
import { renderMehr } from './view-mehr.js';
import { startVoice } from './voice.js';
import { IN_CLAUDE } from './env.js';

const view = document.getElementById('view');
const tabs = [...document.querySelectorAll('.tab')];
const VIEWS = { training: renderTraining, verlauf: renderVerlauf, bericht: renderBericht, mehr: renderMehr };
let current = 'training';

function show(tab, params = {}) {
  if (!VIEWS[tab]) tab = 'training';
  if (sheetOpen()) closeSheet();
  const changed = tab !== current;
  current = tab;
  setTab(tab);
  tabs.forEach(b => (b.dataset.tab === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  VIEWS[tab](view, params);
  if (changed || params.top) window.scrollTo(0, 0);
}

export function themeNow() {
  applyTheme(S.settings().theme);
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', dark ? '#0e1828' : '#7fa6d3'));
}

async function start() {
  registerSW(); // zuerst, damit Updates auch dann ankommen, wenn später etwas schiefgeht
  view.innerHTML = '<div class="card empty"><strong>Dein Training wird geladen …</strong>Einen Moment.</div>';
  let failShown = 0;
  document.addEventListener('savefail', () => {
    if (Date.now() - failShown < 8000) return;
    failShown = Date.now();
    toast('Speichern im Claude-Konto hat gerade nicht geklappt. Bitte Internet prüfen und die Seite neu öffnen.', { kind: 'error', duration: 8000 });
  });
  try {
    await S.init();
  } catch (e) {
    view.innerHTML = `<div class="card empty"><strong>Speichern ist hier nicht möglich</strong>
      Dieser Browser lässt die App keine Daten ablegen (zum Beispiel im privaten Modus). Öffne die App bitte normal im Browser oder vom Startbildschirm.</div>`;
    return;
  }
  setRouter(show);
  themeNow();
  setInterval(themeNow, 5 * 60e3);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeNow);
  document.addEventListener('themechange', themeNow);
  tabs.forEach(b => b.addEventListener('click', () => show(b.dataset.tab, { top: true })));
  document.getElementById('micBtn').addEventListener('click', () => {
    if (current !== 'training') show('training');
    startVoice();
  });
  // Wieder sichtbar: Daten neu lesen (falls App und Browser-Tab parallel offen waren) und neu zeichnen.
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) return;
    // Nicht bei „Mehr“/„Bericht“: Dort kommt man von Dateiauswahl oder Teilen-Menü zurück.
    if (current !== 'training' && current !== 'verlauf') return;
    try { await S.reload(); } catch { /* alter Stand bleibt */ }
    if (!sheetOpen()) show(current);
  });
  show('training');
  protectStorage();
}

/** Bittet den Browser, die Daten nicht bei Platzmangel zu löschen. */
async function protectStorage() {
  if (IN_CLAUDE) return;
  try {
    if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* nicht schlimm */ }
}

function registerSW() {
  if (IN_CLAUDE || !('serviceWorker' in navigator)) return;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (local && !new URLSearchParams(location.search).has('sw')) return; // beim Entwickeln ohne Zwischenspeicher
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloading) { reloading = true; location.reload(); }
  });
  navigator.serviceWorker.register('./sw.js').then(reg => {
    const offer = w => toast('Eine neue Version der App ist da.', { action: 'Aktualisieren', duration: 20000, onAction: () => w.postMessage('skipWaiting') });
    if (reg.waiting && hadController) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
  }).catch(() => { /* ohne Offline-Modus geht es trotzdem */ });
}

// „Auf den Startbildschirm“-Angebot des Browsers merken, damit „Mehr“ einen Knopf dafür zeigen kann.
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  window.__installPrompt = e;
  if (current === 'mehr' && !sheetOpen()) show('mehr');
});

start();

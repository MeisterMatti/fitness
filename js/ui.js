// Gemeinsame Bausteine: Unterseiten von unten, Meldungen, Rückfragen, Rekord-Funkeln, Farbmodus.
import { esc } from './format.js';

let current = null;
let skipPop = 0; // eigene history.back()-Aufrufe, deren popstate nicht noch ein Fenster schließen darf

export function openSheet(html, opts = {}) {
  if (current) closeSheet({ keepHistory: true });
  const root = document.getElementById('sheet-root');
  const back = document.createElement('div');
  back.className = 'sheet-backdrop';
  const el = document.createElement('div');
  el.className = 'sheet';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  if (opts.label) el.setAttribute('aria-label', opts.label);
  el.innerHTML = '<div class="grip" aria-hidden="true"></div>' + html;
  root.append(back, el);
  back.addEventListener('click', () => closeSheet());
  if (!(history.state && history.state.sheet)) history.pushState({ sheet: true }, '');
  current = { el, back, opts, prevFocus: document.activeElement };
  requestAnimationFrame(() => {
    const f = el.querySelector('[autofocus]') || el.querySelector('button:not(.grip), input, select');
    if (f) f.focus({ preventScroll: true });
  });
  return el;
}

export function closeSheet({ keepHistory = false, fromPop = false } = {}) {
  if (!current) return;
  const c = current;
  current = null;
  c.el.remove();
  c.back.remove();
  if (!keepHistory && !fromPop && history.state && history.state.sheet) { skipPop++; history.back(); }
  if (c.opts.onClose) c.opts.onClose();
  if (!keepHistory && c.prevFocus && c.prevFocus.isConnected) c.prevFocus.focus({ preventScroll: true });
}
export const sheetOpen = () => !!current;

window.addEventListener('popstate', () => {
  if (skipPop > 0) {
    skipPop--;
    // Wurde inzwischen schon das nächste Fenster geöffnet, braucht es wieder einen eigenen Zurück-Schritt.
    if (current && !(history.state && history.state.sheet)) history.pushState({ sheet: true }, '');
    return;
  }
  if (current) closeSheet({ fromPop: true });
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && current) closeSheet(); });

/** Rückfrage mit zwei Knöpfen. */
export function ask(title, text, { ok = 'OK', cancel = 'Abbrechen', danger = false } = {}) {
  return new Promise(resolve => {
    let answered = false;
    const el = openSheet(`
      <h2>${esc(title)}</h2>
      ${text ? `<p class="note">${esc(text)}</p>` : ''}
      <button class="${danger ? 'btn-danger' : 'btn-primary'}" data-a="ok" type="button">${esc(ok)}</button>
      <button class="btn-secondary" data-a="cancel" type="button">${esc(cancel)}</button>`,
    { label: title, onClose: () => { if (!answered) resolve(false); } });
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      answered = true;
      resolve(b.dataset.a === 'ok');
      closeSheet();
    });
  });
}

/** Kurze Meldung unten, optional mit Knopf (z. B. „Rückgängig“). */
export function toast(msg, { action, onAction, duration = 4000, kind = '', html = '' } = {}) {
  const root = document.getElementById('toast-root');
  while (root.children.length >= 2) root.firstElementChild.remove();
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.innerHTML = `${html}<div class="grow">${esc(msg)}</div>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  root.append(el);
  let t = setTimeout(() => el.remove(), duration);
  if (action) {
    el.querySelector('button').addEventListener('click', () => {
      clearTimeout(t);
      el.remove();
      onAction && onAction();
    });
  }
  return el;
}

const TROPHY = '<span class="trophy" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/></svg></span>';

/** Rekord feiern: Meldung, Funkeln und kurzes Vibrieren. */
export function celebrate(text, originEl, { onUndo } = {}) {
  toast(text, { kind: 'record', html: TROPHY, duration: 6000, action: onUndo ? 'Rückgängig' : undefined, onAction: onUndo });
  buzz([25, 50, 25]);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fx = document.getElementById('fx-root');
  const r = originEl ? originEl.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < 22; i++) {
    const s = document.createElement('span');
    s.className = 'spark';
    const a = (Math.PI * 2 * i) / 22 + Math.random() * 0.4;
    const d = 70 + Math.random() * 90;
    s.style.left = `${cx}px`;
    s.style.top = `${cy}px`;
    s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    s.style.setProperty('--dy', `${Math.sin(a) * d - 30}px`);
    s.style.animationDelay = `${Math.random() * 80}ms`;
    fx.append(s);
    setTimeout(() => s.remove(), 1300);
  }
  if (originEl) { originEl.classList.remove('glow-pop'); void originEl.offsetWidth; originEl.classList.add('glow-pop'); }
}

export function buzz(p = 12) { try { if (navigator.vibrate) navigator.vibrate(p); } catch { /* egal */ } }

/** Farbmodus: system | evening | light | dark */
// Als Claude-Seite setzt Claude selbst hell/dunkel auf die Seite; das merken wir uns für „Wie das Handy“.
let hostTheme = document.documentElement.dataset.theme || null;
new MutationObserver(() => {
  const t = document.documentElement.dataset.theme || null;
  if (!applying) hostTheme = t;
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
let applying = false;

export function applyTheme(mode) {
  const root = document.documentElement;
  let t = null;
  if (mode === 'light' || mode === 'dark') t = mode;
  else if (mode === 'evening') { const h = new Date().getHours(); t = h >= 19 || h < 7 ? 'dark' : 'light'; }
  else t = hostTheme;
  applying = true;
  if (t) root.dataset.theme = t; else delete root.dataset.theme;
  Promise.resolve().then(() => { applying = false; });
}

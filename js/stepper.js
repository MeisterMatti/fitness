// Plus-/Minus-Felder für Gewicht, Wiederholungen und Sätze. Gedrückt halten zählt schnell weiter.
import { esc, fmtNum2 } from './format.js';
import { buzz } from './ui.js';

const CFG = {
  weight: { min: 0, max: 1000, label: 'Gewicht', unit: 'kg', size: 4, mode: 'decimal' },
  reps: { min: 1, max: 999, label: 'Wiederholungen', unit: 'Wdh.', size: 3, mode: 'numeric' },
  count: { min: 1, max: 20, label: 'Sätze', unit: '', size: 2, mode: 'numeric' },
};
const show = (f, v) => (f === 'weight' ? fmtNum2(v) : String(v));

export function stepperHTML(field, value, label) {
  const c = CFG[field];
  const l = label || c.label;
  return `<div class="stepper">
    <span class="lbl">${esc(l)}</span>
    <button class="step" type="button" data-step="${field}" data-d="-1" aria-label="${esc(l)} verringern">−</button>
    <div class="val-wrap"><input class="big-input" data-field="${field}" value="${esc(show(field, value))}" inputmode="${c.mode}" size="${c.size}" maxlength="6" autocomplete="off" aria-label="${esc(l)}">${c.unit ? `<span class="unit">${c.unit}</span>` : ''}</div>
    <button class="step" type="button" data-step="${field}" data-d="1" aria-label="${esc(l)} erhöhen">+</button>
  </div>`;
}

let stopAll = () => {};
['pointerup', 'pointercancel', 'blur'].forEach(t => window.addEventListener(t, () => stopAll()));

/** getModel(el) liefert das Objekt mit weight/reps/count, getStep() die Gewichtsschritte. */
export function wireSteppers(root, getModel, getStep) {
  root.__steppers = { getModel, getStep };
  if (root.__steppersWired) return;
  root.__steppersWired = true;
  let timer = null, rep = null;
  const stop = () => { clearTimeout(timer); clearInterval(rep); timer = rep = null; };

  const bump = btn => {
    const { getModel: gm, getStep: gs } = root.__steppers;
    const f = btn.dataset.step, d = Number(btn.dataset.d);
    const m = gm(btn);
    if (!m) return;
    const c = CFG[f];
    const step = f === 'weight' ? (gs() || 2.5) : 1;
    let v = (Number(m[f]) || 0) + d * step;
    v = Math.min(c.max, Math.max(c.min, Math.round(v * 100) / 100));
    m[f] = v;
    const inp = btn.parentElement.querySelector(`[data-field="${f}"]`);
    if (inp) inp.value = show(f, v);
    buzz(6);
  };

  root.addEventListener('pointerdown', e => {
    const btn = e.target.closest('[data-step]');
    if (!btn || e.button > 0) return;
    e.preventDefault();
    stop();
    bump(btn);
    stopAll = stop;
    timer = setTimeout(() => { rep = setInterval(() => bump(btn), 85); }, 420);
  });
  root.addEventListener('pointerout', e => { if (e.target.closest && e.target.closest('[data-step]')) stop(); });
  root.addEventListener('click', e => {
    const btn = e.target.closest('[data-step]');
    if (btn && e.detail === 0) bump(btn); // Bedienung per Tastatur
  });
  root.addEventListener('input', e => {
    const inp = e.target.closest('[data-field]');
    if (!inp) return;
    const m = root.__steppers.getModel(inp);
    if (!m) return;
    const f = inp.dataset.field, c = CFG[f];
    const v = f === 'weight' ? parseFloat(inp.value.replace(',', '.')) : parseInt(inp.value, 10);
    if (Number.isFinite(v)) m[f] = Math.min(c.max, Math.max(c.min, f === 'weight' ? Math.round(v * 100) / 100 : v));
  });
  root.addEventListener('focusout', e => {
    const inp = e.target.closest && e.target.closest('[data-field]');
    if (!inp) return;
    const m = root.__steppers.getModel(inp);
    if (m) inp.value = show(inp.dataset.field, m[inp.dataset.field]);
  });
  root.addEventListener('focusin', e => {
    const inp = e.target.closest && e.target.closest('[data-field]');
    if (inp) setTimeout(() => inp.select(), 0);
  });
}

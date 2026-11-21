// Wechsel zwischen den Bereichen, ohne dass sich die Module gegenseitig laden müssen.
let router = null;
let tab = 'training';
export const setRouter = fn => { router = fn; };
export const go = (t, params) => router && router(t, params);
export const setTab = t => { tab = t; };
/** Welcher Bereich gerade sichtbar ist – späte Neuzeichnungen anderer Bereiche werden so verhindert. */
export const currentTab = () => tab;
export const ICON = {
  chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16M5 15l4-5 4 3 6-7"/></svg>',
  left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
};

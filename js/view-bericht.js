// Bereich „Bericht“: PDF zum Anschauen, Teilen oder Drucken (keine Sicherung!).
import * as S from './store.js';
import { esc } from './format.js';
import { periodRange, summarize, recordIds, dayKey } from './stats.js';
import { buildReport } from './report.js';
import { shareFile, download } from './backup.js';
import { toast } from './ui.js';
import { ICON } from './nav.js';
import { IN_CLAUDE } from './env.js';

const ui = { period: 'month', offset: 0, loc: 'all' };
let view = null;

const canShareFiles = (() => {
  if (IN_CLAUDE) return false;
  try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] })); }
  catch { return false; }
})();

export function renderBericht(v) {
  view = v;
  const r = periodRange(ui.period, ui.offset);
  const locs = S.activeLocations();
  if (ui.loc !== 'all' && !locs.some(l => l.id === ui.loc)) ui.loc = 'all';
  const sets = ui.loc === 'all' ? S.state.sets : S.state.sets.filter(s => s.locationId === ui.loc);
  const sum = summarize(sets, r, recordIds(S.state.sets));
  v.innerHTML = `
    <header class="head"><div><h1>Bericht</h1><div class="date">Dein Training als PDF – zum Anschauen, Teilen oder Drucken</div></div></header>
    <section class="card stack">
      <div class="field"><span>Zeitraum</span>
        <div class="seg" role="group" aria-label="Zeitraum">${[['week', 'Woche'], ['month', 'Monat'], ['year', 'Jahr']].map(([k, l]) => `<button type="button" data-period="${k}" aria-pressed="${ui.period === k}">${l}</button>`).join('')}</div></div>
      <div class="period"><button class="icon-btn" type="button" data-act="prev" aria-label="Zeitraum davor">${ICON.left}</button><strong>${esc(r.label)}</strong><button class="icon-btn" type="button" data-act="next" aria-label="Zeitraum danach" ${ui.offset >= 0 ? 'disabled' : ''}>${ICON.right}</button></div>
      ${locs.length > 1 ? `<div class="field"><span>Ort</span><div class="chips" role="group" aria-label="Ort"><button class="chip" type="button" data-locf="all" aria-pressed="${ui.loc === 'all'}">Alle Orte</button>${locs.map(l => `<button class="chip" type="button" data-locf="${esc(l.id)}" aria-pressed="${ui.loc === l.id}">${esc(l.name)}</button>`).join('')}</div></div>` : ''}
      <p class="note">${sum.setCount ? `Im Bericht: ${sum.days} Trainingstage · ${sum.setCount} Sätze · ${sum.perEx.length} Übungen · ${sum.records.length} Rekorde` : 'In diesem Zeitraum gibt es noch keine Einträge.'}</p>
      <button class="btn-primary" type="button" data-act="make">Bericht als PDF</button>
      ${canShareFiles ? '<button class="btn-secondary" type="button" data-act="save">Nur auf dem Handy speichern</button>' : ''}
    </section>
    <p class="note">Im Bericht stehen die Kurven pro Übung, deine Rekorde, das insgesamt bewegte Gewicht und die Verbesserungen gegenüber dem Zeitraum davor. ${canShareFiles ? '„Bericht als PDF“ öffnet das Teilen-Menü (z. B. WhatsApp, E-Mail, Drive).' : ''} Zum Drucken die PDF öffnen und dort „Drucken“ wählen.</p>
    <p class="note"><strong>Wichtig:</strong> Der Bericht ist nur zum Anschauen. Zum Sichern deiner Daten nimm „Mehr → Sicherung“ – aus einer PDF lassen sich keine Daten zurückholen.</p>`;
  v.onclick = onClick;
  v.onsubmit = null;
  v.onkeydown = null;
}

function fileName(r) {
  const loc = ui.loc === 'all' ? '' : '-' + (S.locationById(ui.loc)?.name || '').replace(/[^A-Za-z0-9ÄÖÜäöüß_-]+/g, '-');
  const s = new Date(r.start);
  const part = r.type === 'year' ? `${s.getFullYear()}` : r.type === 'month' ? `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}` : `Woche-${dayKey(r.start)}`;
  return `Trainingsbericht-${part}${loc}.pdf`;
}

async function onClick(e) {
  const t = e.target.closest('button');
  if (!t || !view.contains(t)) return;
  if (t.dataset.period) { ui.period = t.dataset.period; ui.offset = 0; return renderBericht(view); }
  if (t.dataset.locf) { ui.loc = t.dataset.locf; return renderBericht(view); }
  const act = t.dataset.act;
  if (act === 'prev') { ui.offset--; return renderBericht(view); }
  if (act === 'next') { if (ui.offset < 0) ui.offset++; return renderBericht(view); }
  if (act !== 'make' && act !== 'save') return;
  t.disabled = true;
  const label = t.textContent;
  t.textContent = 'Wird erstellt …';
  try {
    const r = periodRange(ui.period, ui.offset);
    const blob = buildReport(r, ui.loc);
    const name = fileName(r);
    if (act === 'save') { if (await download(blob, name) === 'saved') toast(`Gespeichert: ${name}`); }
    else {
      const res = await shareFile(blob, name, `Trainingsbericht ${r.label}`);
      if (res === 'downloaded' || res === 'saved') toast(`Gespeichert: ${name}`);
    }
  } catch (err) {
    toast(err && err.message ? err.message : 'Der Bericht konnte nicht erstellt werden.', { kind: 'error' });
  } finally {
    t.disabled = false;
    t.textContent = label;
  }
}

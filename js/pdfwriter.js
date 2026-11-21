// Kleiner PDF-Baustein ohne fremde Bibliotheken: Text (Helvetica), Linien, Flächen, Farbverlauf.
// Koordinaten wie auf dem Bildschirm: oben links ist (0,0), Einheit Punkt (A4 = 595 × 842).

export const A4 = { w: 595.28, h: 841.89 };

const W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const W_HIGH = { 0x80: [556, 556], 0x84: [333, 500], 0x85: [1000, 1000], 0x91: [222, 278], 0x92: [222, 278], 0x93: [333, 500], 0x94: [333, 500], 0x95: [350, 350], 0x96: [556, 556], 0x97: [1000, 1000], 0xA0: [278, 278], 0xB0: [400, 400], 0xB1: [584, 584], 0xB7: [278, 278], 0xBD: [834, 834], 0xC4: [667, 722], 0xD6: [778, 778], 0xD7: [584, 584], 0xDC: [722, 722], 0xDF: [611, 611], 0xE0: [556, 556], 0xE4: [556, 556], 0xE8: [556, 556], 0xE9: [556, 556], 0xF6: [556, 611], 0xFC: [556, 611] };
const UNI = { 0x20AC: 0x80, 0x201A: 0x82, 0x201E: 0x84, 0x2026: 0x85, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2212: 0x2D, 0x202F: 0x20, 0x2009: 0x20 };

/** Unicode → WinAnsi-Codes (ein Zeichen = ein Byte). Unbekanntes wird zu „?“. */
export function winAnsi(s) {
  let out = '';
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c >= 0x20 && c <= 0x7e) out += ch;
    else if (UNI[c] != null) out += String.fromCharCode(UNI[c]);
    else if (c >= 0xa0 && c <= 0xff) out += String.fromCharCode(c);
    else if (c === 0x0a || c === 0x09) out += ' ';
    else out += '?';
  }
  return out;
}

export function textWidth(s, size, bold) {
  const t = winAnsi(s);
  let w = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c >= 32 && c <= 126) w += (bold ? W_BOLD : W_REG)[c - 32];
    else w += (W_HIGH[c] || [556, 556])[bold ? 1 : 0];
  }
  return (w / 1000) * size;
}

/** Kürzt Text mit „…“, bis er in die Breite passt. */
export function fit(s, size, bold, max) {
  s = String(s);
  if (textWidth(s, size, bold) <= max) return s;
  while (s.length > 1 && textWidth(s + '…', size, bold) > max) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}

/** Text für die PDF-Eigenschaften (Titel): UTF-16 als Hex, damit Umlaute und Striche stimmen. */
const infoString = s => '<FEFF' + [...String(s)].map(ch => {
  const c = ch.codePointAt(0);
  const units = c > 0xffff ? [0xd800 + ((c - 0x10000) >> 10), 0xdc00 + ((c - 0x10000) & 0x3ff)] : [c];
  return units.map(u => u.toString(16).padStart(4, '0')).join('');
}).join('').toUpperCase() + '>';

const esc = s => winAnsi(s).replace(/[\\()]/g, m => '\\' + m).replace(/[\x80-\xff]/g, m => '\\' + m.charCodeAt(0).toString(8).padStart(3, '0'));
const f = n => (Math.round(n * 100) / 100).toString();
const rgb = hex => { const v = parseInt(hex.slice(1), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255].map(x => f(x)).join(' '); };

export class PDF {
  constructor({ title = 'Dokument' } = {}) { this.title = title; this.pages = []; this.shadings = []; }
  addPage() { this.page = { ops: [] }; this.pages.push(this.page); return this.page; }
  op(s) { this.page.ops.push(s); }
  Y(y) { return A4.h - y; }

  text(x, y, s, { size = 11, bold = false, color = '#12223a', align = 'left', max } = {}) {
    if (max) s = fit(s, size, bold, max);
    let tx = x;
    if (align !== 'left') { const w = textWidth(s, size, bold); tx = align === 'right' ? x - w : x - w / 2; }
    this.op(`BT /${bold ? 'F2' : 'F1'} ${f(size)} Tf ${rgb(color)} rg 1 0 0 1 ${f(tx)} ${f(this.Y(y))} Tm (${esc(s)}) Tj ET`);
  }
  rrectPath(x, y, w, h, r) {
    const X = x, B = this.Y(y + h), k = 0.5523 * r;
    return `${f(X + r)} ${f(B)} m ${f(X + w - r)} ${f(B)} l ${f(X + w - r + k)} ${f(B)} ${f(X + w)} ${f(B + r - k)} ${f(X + w)} ${f(B + r)} c ` +
      `${f(X + w)} ${f(B + h - r)} l ${f(X + w)} ${f(B + h - r + k)} ${f(X + w - r + k)} ${f(B + h)} ${f(X + w - r)} ${f(B + h)} c ` +
      `${f(X + r)} ${f(B + h)} l ${f(X + r - k)} ${f(B + h)} ${f(X)} ${f(B + h - r + k)} ${f(X)} ${f(B + h - r)} c ` +
      `${f(X)} ${f(B + r)} l ${f(X)} ${f(B + r - k)} ${f(X + r - k)} ${f(B)} ${f(X + r)} ${f(B)} c h`;
  }
  rrect(x, y, w, h, r, { fill, stroke, lw = 0.8 } = {}) {
    const p = this.rrectPath(x, y, w, h, r);
    this.op(`q ${fill ? rgb(fill) + ' rg ' : ''}${stroke ? rgb(stroke) + ' RG ' + f(lw) + ' w ' : ''}${p} ${fill && stroke ? 'B' : fill ? 'f' : 'S'} Q`);
  }
  line(x1, y1, x2, y2, { color = '#d6e1ee', lw = 0.7 } = {}) {
    this.op(`q ${rgb(color)} RG ${f(lw)} w ${f(x1)} ${f(this.Y(y1))} m ${f(x2)} ${f(this.Y(y2))} l S Q`);
  }
  circle(cx, cy, r, color) {
    const k = 0.5523 * r, X = cx, Yc = this.Y(cy);
    this.op(`q ${rgb(color)} rg ${f(X + r)} ${f(Yc)} m ${f(X + r)} ${f(Yc + k)} ${f(X + k)} ${f(Yc + r)} ${f(X)} ${f(Yc + r)} c ${f(X - k)} ${f(Yc + r)} ${f(X - r)} ${f(Yc + k)} ${f(X - r)} ${f(Yc)} c ${f(X - r)} ${f(Yc - k)} ${f(X - k)} ${f(Yc - r)} ${f(X)} ${f(Yc - r)} c ${f(X + k)} ${f(Yc - r)} ${f(X + r)} ${f(Yc - k)} ${f(X + r)} ${f(Yc)} c f Q`);
  }
  /** Linie durch Punkte [[x,y],...] mit halbtransparenter Fläche bis baseY. */
  polyline(pts, { color = '#1f7bff', lw = 1.8, baseY = null, fillOpacity = true } = {}) {
    if (pts.length < 2) return;
    const path = pts.map((p, i) => `${f(p[0])} ${f(this.Y(p[1]))} ${i ? 'l' : 'm'}`).join(' ');
    if (baseY != null && fillOpacity) {
      const last = pts[pts.length - 1], first = pts[0];
      this.op(`q /GS1 gs ${rgb(color)} rg ${path} ${f(last[0])} ${f(this.Y(baseY))} l ${f(first[0])} ${f(this.Y(baseY))} l h f Q`);
    }
    this.op(`q ${rgb(color)} RG ${f(lw)} w 1 J 1 j ${path} S Q`);
  }
  /** Farbverlauf in einem abgerundeten Rechteck (von links oben nach rechts unten). */
  gradientRect(x, y, w, h, r, c0, c1) {
    const name = `Sh${this.shadings.length + 1}`;
    this.shadings.push({ name, coords: [x, this.Y(y), x + w, this.Y(y + h)], c0, c1 });
    this.op(`q ${this.rrectPath(x, y, w, h, r)} W n /${name} sh Q`);
  }

  build() {
    const objs = [];
    const add = s => { objs.push(s); return objs.length; };
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add('PAGES');
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const gs1 = add('<< /Type /ExtGState /ca 0.16 >>');
    const sh = this.shadings.map(s => `/${s.name} ${add(`<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [${s.coords.map(f).join(' ')}] /Function << /FunctionType 2 /Domain [0 1] /C0 [${rgb(s.c0)}] /C1 [${rgb(s.c1)}] /N 1 >> /Extend [true true] >>`)} 0 R`).join(' ');
    const res = `<< /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> /ExtGState << /GS1 ${gs1} 0 R >>${sh ? ` /Shading << ${sh} >>` : ''} >>`;
    const kids = [];
    for (const p of this.pages) {
      const content = p.ops.join('\n');
      const c = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources ${res} /Contents ${c} 0 R >>`));
    }
    objs[1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    const d = new Date(), p2 = n => String(n).padStart(2, '0');
    const info = add(`<< /Title ${infoString(this.title)} /Producer (Fitness-Tracker) /CreationDate (D:${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}) >>`);
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return new Blob([bytes], { type: 'application/pdf' });
  }
}

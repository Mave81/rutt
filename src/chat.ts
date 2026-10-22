/* Chatten: nummer i text, namnförslag, smileys (rena funktioner – testas i __tests__/chatt.test.js). */
import P from './opter/protocol';

export const QUICK = ['OK', 'På väg', 'Framme om 10 min', 'Står utanför', 'Klart', 'Ring mig'];
// Smileys/emoji (surrogatpar, symboler, variantväljare) – Opter-chatten visar dem inte.
const EMOJI = /(?:[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]|\uFE0F|\u200D)/g;
export const stripEmoji = (t: string) => String(t || '').replace(EMOJI, '').replace(/[ \t]{2,}/g, ' ').trim();
export const hasEmoji = (t: string) => { EMOJI.lastIndex = 0; const r = EMOJI.test(String(t || '')); EMOJI.lastIndex = 0; return r; };

const PHONE = /(?:\+46[\s-]?|\b0)\d{1,3}(?:[\s-]?\d){5,9}\b/g;
export type Seg = {t: string; num?: string};
/** Delar texten i bitar, med nummer för sig (samma regler som Opter-texterna i protocol.extractPhones). */
export function splitPhones(text: string): Seg[] {
  const out: Seg[] = []; const s = String(text || ''); let last = 0; let m: RegExpExecArray | null;
  PHONE.lastIndex = 0;
  while ((m = PHONE.exec(s))) {
    const num = m[0].replace(/[^0-9+]/g, '').replace(/^\+46/, '0');
    if (num.length < 8 || num.length > 11) continue;
    if (m.index > last) out.push({t: s.slice(last, m.index)});
    out.push({t: m[0], num});
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({t: s.slice(last)});
  return out;
}
/** Namnförslag för ett nummer ur texten: "Ring Katta på stena 010…" → "Katta Stena". */
export function nameFor(text: string, num: string): string {
  const hit = (P.extractPhones(text) || []).find((x: any) => x.num === num);
  if (!hit || !hit.label || /^Nummer i ordern$/i.test(hit.label)) return '';
  return String(hit.label).replace(/\s*\((.*?)\)\s*/, ' $1').trim();
}


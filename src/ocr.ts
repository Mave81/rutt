/*
 * Läs en sida med telefonens textläsare (ML Kit). Ligger sedeln på tvären i bilden (fotad med telefonen vriden)
 * provar RUTT att vrida bilden 90°/270°/180° och tar det varv där texten blir vanliga rader.
 */
import {NativeModules} from 'react-native';

/** Hur läsbar en läsning är: antal vanliga textrader (liggande rutor med bokstäver i). */
export function ocrScore(o: any): number {
  const L = (o && o.lines) || [];
  let n = 0;
  for (const l of L) { const t = String(l.t || ''); if (l.w > l.h * 1.6 && (t.match(/[A-Za-zÅÄÖåäö]/g) || []).length >= 4) n++; }
  const words = /(mottagare|avs[aä]ndare|adress|kolli|order|leverans|telefon|datum|s[aä]ndning|artikel|antal|vikt)/i;
  const kw = L.filter((l: any) => words.test(String(l.t || ''))).length;
  return n + kw * 3;
}
export const ocrGood = (o: any) => ocrScore(o) >= 25;

export async function readPage(uri: string): Promise<any> {
  const SMS = NativeModules.RuttSms;
  if (!SMS || !SMS.ocr) throw new Error('läsaren saknas i den här versionen');
  const a = await SMS.ocr(uri);
  if (ocrGood(a) || !SMS.ocrRot) return {...a, uri};
  let best = {...a, uri}, bs = ocrScore(a);
  for (const deg of [90, 270, 180]) {
    try { const b = await SMS.ocrRot(uri, deg); const sc = ocrScore(b); if (sc > bs) { best = b; bs = sc; } if (ocrGood(b)) break; } catch (e) {}
  }
  return best;
}

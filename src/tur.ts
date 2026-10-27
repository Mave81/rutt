/*
 * Bevego turleveranslista → stopp. Flera sidor till samma kund (Opejra: 2 pall + 1 kartong) blir ETT stopp.
 * Stoppen kopplas till Opter-ordern som bara säger "Distribution" (parent) – se App: hämtningen är Opter-orderns,
 * Lossad på sista stoppet skickar Lossad för Opter-ordern.
 */
import {Egen, Place} from './egna';

export type TurStop = {
  key: string; name: string; adr: string; zip: string; area: string; tel: string; tel2: string; contact: string; note: string;
  orders: string[]; kolli: any[]; counts: Record<string, number>; goods: string[]; pal: number; sure: boolean; pages: number; tour: string; date: string | null;
  // BDX fraktsedel: sändningsnr, avsändare, vikt, totalt antal kolli (för kontroll), mottagarens referens, sidor (x av y)
  kind?: string; sendNo?: string; sender?: any; kg?: number; total?: number | null; ref?: string; pageOf?: number | null;
  srcs?: string[]; confirmed?: boolean; edited?: boolean; match?: {cid: string; orderNo: string; who: string; adr: string; how: string} | null;
};
export const SCAN_KINDS = ['bevego-tur', 'bdx-frakt'];
const nk = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
export const stopKey = (d: {name?: string; adr?: string; zip?: string}) => `${nk(d.name || '').slice(0, 10)}|${nk(d.adr || '') || nk(d.zip || '')}`;

/** Parsade sidor (parseSedel) → stopp, sammanslagna per kund + adress. */
export function mergeTur(pages: any[]): TurStop[] {
  const out: TurStop[] = [];
  for (const r of pages) {
    if (!r || !r.drop) continue;
    const d = r.drop;
    // BDX: en sändning (sändningsnr) = ett stopp, alla sidor (1 av 5 …) läggs ihop. Bevego: kund + adress.
    let s = r.sendNo ? out.find(x => x.sendNo === r.sendNo)
      : out.find(x => !x.sendNo && (x.key === stopKey(d) || (nk(x.name) && nk(x.name) === nk(d.name) && (!x.adr || !d.adr || nk(x.adr) === nk(d.adr)))));
    if (!s && r.cont) continue; // fortsättningssida utan sin förstasida
    if (!s) {
      s = {key: r.sendNo ? 'S' + r.sendNo : stopKey(d), name: d.name || '', adr: d.adr || '', zip: d.zip || '', area: d.area || '', tel: '', tel2: '', contact: '', note: '',
        orders: [], kolli: [], counts: {}, goods: [], pal: 0, sure: false, pages: 0, tour: r.tour || '', date: r.date || null,
        kind: r.kind, sendNo: r.sendNo || '', sender: r.sender || null, kg: 0, total: null, ref: '', pageOf: r.pages || null, srcs: []};
      out.push(s);
    }
    s.pages++;
    if (r.pageUri && s.srcs && !s.srcs.includes(r.pageUri)) s.srcs.push(r.pageUri);
    if (r.kg) s.kg = Math.max(s.kg || 0, r.kg);
    if (r.total) s.total = Math.max(s.total || 0, r.total);
    if (d.ref && !s.ref) s.ref = d.ref;
    if (r.sender && r.sender.name && !(s.sender && s.sender.name)) s.sender = r.sender;
    for (const k of ['name', 'adr', 'zip', 'area', 'contact'] as const) if (!s[k] && d[k]) (s as any)[k] = d[k];
    for (const t of [d.tel, d.tel2]) if (t && t !== s.tel && t !== s.tel2) { if (!s.tel) s.tel = t; else if (!s.tel2) s.tel2 = t; }
    if (d.note) s.note = [...new Set([...(s.note ? s.note.split(' · ') : []), ...String(d.note).split(' · ')])].join(' · ');
    s.orders = [...new Set([...s.orders, ...(r.orders || [])])];
    const have = new Set(s.kolli.map((k: any) => k.no));
    for (const k of r.kolli || []) if (!have.has(k.no)) { s.kolli.push(k); have.add(k.no); }
    s.counts = {}; s.kolli.forEach((k: any) => { const t = k.type || 'KOLLI'; s!.counts[t] = (s!.counts[t] || 0) + 1; });
    const arts = (r.goods || []).filter((g: string) => !/^\d+ [a-zåäö]+$/.test(g));
    s.goods = [...new Set([...s.goods, ...arts])];
    s.pal = s.kolli.filter((k: any) => /KLOVE|PALL|ST[AÄ]LL/i.test(k.type)).length;
    s.sure = !!(s.name && s.adr && s.zip && (r.drop.sure !== false || s.sure));
    if (!s.tour && r.tour) s.tour = r.tour;
    if (!s.date && r.date) s.date = r.date;
  }
  return out;
}
export const countsText = (c: Record<string, number>) => Object.entries(c).map(([t, n]) => `${n} ${t.toLowerCase()}`).join(' + ');

/** Ett stopp → ett eget jobb. pick = Opter-orderns hämtning (Bevego Älvsjö) när det finns en. */
export function turToEgen(s: TurStop, pick: Place, parent: string | null, day: string, i = 0): Egen {
  const drop: Place = {name: s.name, adr: s.adr, zip: s.zip, area: s.area, tel: s.tel, tel2: s.tel2, contact: s.contact, note: s.note, sure: s.sure};
  const bdx = s.kind === 'bdx-frakt';
  const note = [s.note, bdx && s.ref ? `Mottagarens ref ${s.ref}` : '', bdx && s.sender && s.sender.name ? `Avsändare ${[s.sender.name, s.sender.area].filter(Boolean).join(', ')}` : '', bdx && s.kg ? `${s.kg} kg` : ''].filter(Boolean).join(' · ');
  return {id: 'E' + (Date.now() + i), day, createdAt: Date.now(), kind: bdx ? 'bdx-frakt' : 'bevego-tur', title: bdx ? 'BDX fraktsedel' : 'Bevego-tur', from: bdx ? 'BDX' : 'Bevego',
    ref: bdx ? s.sendNo || '' : (s.tour.match(/^\d+/) || [''])[0], orderNo: s.orders.join(', '),
    pick, drop: {...drop, note}, goods: [countsText(s.counts), ...s.goods].filter(Boolean), pal: s.pal, note, tidspass: null,
    sms: false, sign: false, media: null, ocr: null, signed: null, sent: {}, parent, kolli: s.kolli, tour: bdx ? `sändning ${s.sendNo}` : s.tour};
}

/** Opter-order som papperen hör till: lämningen saknar adress ("Distribution"), eller (Bevego) hämtas på Bevego. Bäst träff först. */
export function turParents(stops: any[], kind = 'bevego-tur'): {cid: string; orderNo: string; pick: any; drop: any; score: number}[] {
  const out: any[] = [];
  const word = kind === 'bdx-frakt' ? /\bbdx\b/i : /bevego/i;
  for (const p of stops || []) {
    if (!p || !p.pickup || p.own) continue;
    const cid = String(p.pickup);
    const d = (stops || []).find((x: any) => String(x.drop) === cid);
    const noAdr = !d || !d.adr || /distribution/i.test(String(d.who));
    const named = word.test([p.who, p.customer, p.adr, p.service].join(' '));
    if (!noAdr && !(kind === 'bevego-tur' && named)) continue;
    let score = 1;
    if (noAdr) score += 2;
    if (named) score += 2;
    if (/skriv\s*timmar|distribution|tur/i.test([p.info, d && d.who, p.service].join(' '))) score += 1;
    out.push({cid, orderNo: String(p.orderNo || cid), pick: p, drop: d || null, score});
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Finns stoppet redan som Opter-order? Samma sändningsnr/fraktsedel/ordernr, eller samma gata + nummer (och postnr). */
const street = (s: string) => nk(String(s || '').replace(/\s+(\d+[a-z]?).*$/i, ' $1'));
export function matchOpter(s: TurStop, drops: any[]): TurStop['match'] {
  const nums = [s.sendNo, ...(s.orders || [])].filter(Boolean).map(x => String(x).replace(/\D/g, ''));
  for (const d of drops || []) {
    const ds = [d.freightBill, d.orderNo, d.ref].filter(Boolean).map((x: any) => String(x).replace(/\D/g, ''));
    if (nums.some(n => n.length >= 6 && ds.includes(n))) return {cid: String(d.drop), orderNo: String(d.orderNo || d.drop), who: d.who || '', adr: [d.adr, d.area].filter(Boolean).join(', '), how: 'samma nummer'};
  }
  if (!s.adr) return null;
  for (const d of drops || []) {
    if (!d.adr || street(d.adr) !== street(s.adr)) continue;
    const z1 = String(s.zip || '').replace(/\D/g, ''), z2 = String(d.zip || '').replace(/\D/g, '');
    if (z1 && z2 && z1 !== z2) continue;
    return {cid: String(d.drop), orderNo: String(d.orderNo || d.drop), who: d.who || '', adr: [d.adr, d.area].filter(Boolean).join(', '), how: 'samma adress'};
  }
  return null;
}

/** "skriv timmar" i ordern → timjobb: start = när du lastade, slut = när du lossar. */
export const TIMJOBB = /skriv\s*(?:in\s*)?(?:timmar|tid(?:en)?)\b|timdebit|debiteras\s+per\s+timme|per\s+timme|timjobb|timpris/i;
export const isTimjobb = (st: any) => !!st && (st.timjobb === true || TIMJOBB.test([st.info, st.service, st.note, st.adrMsg].filter(Boolean).join(' ')));

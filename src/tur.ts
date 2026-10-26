/*
 * Bevego turleveranslista → stopp. Flera sidor till samma kund (Opejra: 2 pall + 1 kartong) blir ETT stopp.
 * Stoppen kopplas till Opter-ordern som bara säger "Distribution" (parent) – se App: hämtningen är Opter-orderns,
 * Lossad på sista stoppet skickar Lossad för Opter-ordern.
 */
import {Egen, Place} from './egna';

export type TurStop = {
  key: string; name: string; adr: string; zip: string; area: string; tel: string; tel2: string; contact: string; note: string;
  orders: string[]; kolli: any[]; counts: Record<string, number>; goods: string[]; pal: number; sure: boolean; pages: number; tour: string; date: string | null;
};
const nk = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
export const stopKey = (d: {name?: string; adr?: string; zip?: string}) => `${nk(d.name || '').slice(0, 10)}|${nk(d.adr || '') || nk(d.zip || '')}`;

/** Parsade sidor (parseSedel) → stopp, sammanslagna per kund + adress. */
export function mergeTur(pages: any[]): TurStop[] {
  const out: TurStop[] = [];
  for (const r of pages) {
    if (!r || !r.drop) continue;
    const d = r.drop;
    let s = out.find(x => x.key === stopKey(d) || (nk(x.name) && nk(x.name) === nk(d.name) && (!x.adr || !d.adr || nk(x.adr) === nk(d.adr))));
    if (!s) {
      s = {key: stopKey(d), name: d.name || '', adr: d.adr || '', zip: d.zip || '', area: d.area || '', tel: '', tel2: '', contact: '', note: '',
        orders: [], kolli: [], counts: {}, goods: [], pal: 0, sure: false, pages: 0, tour: r.tour || '', date: r.date || null};
      out.push(s);
    }
    s.pages++;
    for (const k of ['name', 'adr', 'zip', 'area', 'contact'] as const) if (!s[k] && d[k]) (s as any)[k] = d[k];
    for (const t of [d.tel, d.tel2]) if (t && t !== s.tel && t !== s.tel2) { if (!s.tel) s.tel = t; else if (!s.tel2) s.tel2 = t; }
    if (d.note) s.note = [...new Set([...(s.note ? s.note.split(' · ') : []), ...String(d.note).split(' · ')])].join(' · ');
    s.orders = [...new Set([...s.orders, ...(r.orders || [])])];
    const have = new Set(s.kolli.map((k: any) => k.no));
    for (const k of r.kolli || []) if (!have.has(k.no)) { s.kolli.push(k); have.add(k.no); }
    s.counts = {}; s.kolli.forEach((k: any) => { const t = k.type || 'KOLLI'; s!.counts[t] = (s!.counts[t] || 0) + 1; });
    const arts = (r.goods || []).filter((g: string) => !/^\d+ [a-zåäö]+$/.test(g));
    s.goods = [...new Set([...s.goods, ...arts])];
    s.pal = s.kolli.filter((k: any) => /KLOVE|PALL|ST[AÄ]LL/.test(k.type)).length;
    s.sure = !!(s.name && s.adr && s.zip);
    if (!s.tour && r.tour) s.tour = r.tour;
    if (!s.date && r.date) s.date = r.date;
  }
  return out;
}
export const countsText = (c: Record<string, number>) => Object.entries(c).map(([t, n]) => `${n} ${t.toLowerCase()}`).join(' + ');

/** Ett stopp → ett eget jobb. pick = Opter-orderns hämtning (Bevego Älvsjö) när det finns en. */
export function turToEgen(s: TurStop, pick: Place, parent: string | null, day: string, i = 0): Egen {
  const drop: Place = {name: s.name, adr: s.adr, zip: s.zip, area: s.area, tel: s.tel, tel2: s.tel2, contact: s.contact, note: s.note, sure: s.sure};
  return {id: 'E' + (Date.now() + i), day, createdAt: Date.now(), kind: 'bevego-tur', title: 'Bevego-tur', from: 'Bevego', ref: (s.tour.match(/^\d+/) || [''])[0], orderNo: s.orders.join(', '),
    pick, drop, goods: [countsText(s.counts), ...s.goods].filter(Boolean), pal: s.pal, note: s.note, tidspass: null,
    sms: false, sign: false, media: null, ocr: null, signed: null, sent: {}, parent, kolli: s.kolli, tour: s.tour};
}

/** Opter-order som turlistan hör till: hämtas på Bevego, lämningen saknar adress ("Distribution"). Bäst träff först. */
export function turParents(stops: any[]): {cid: string; orderNo: string; pick: any; drop: any; score: number}[] {
  const out: any[] = [];
  for (const p of stops || []) {
    if (!p || !p.pickup || p.own) continue;
    const cid = String(p.pickup);
    const d = (stops || []).find((x: any) => String(x.drop) === cid);
    if (!/bevego/i.test([p.who, p.customer, p.adr].join(' '))) continue;
    let score = 1;
    if (d && (!d.adr || /distribution/i.test(String(d.who)))) score += 2;
    if (/skriv\s*timmar|distribution|tur/i.test([p.info, d && d.who, p.service].join(' '))) score += 1;
    out.push({cid, orderNo: String(p.orderNo || cid), pick: p, drop: d || null, score});
  }
  return out.sort((a, b) => b.score - a.score);
}

/** "skriv timmar" i ordern → timjobb: start = när du lastade, slut = när du lossar. */
export const TIMJOBB = /skriv\s*(?:in\s*)?(?:timmar|tid(?:en)?)\b|timdebit|debiteras\s+per\s+timme|per\s+timme|timjobb|timpris/i;
export const isTimjobb = (st: any) => !!st && (st.timjobb === true || TIMJOBB.test([st.info, st.service, st.note, st.adrMsg].filter(Boolean).join(' ')));

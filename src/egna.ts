/*
 * Egna jobb – sedlar från Joel (Inomec, Cramo, bilder) som du gjort till stopp i RUTT.
 * De finns inte i Opter: RUTT sparar dem i telefonen, räknar in dem i rutten och lastplanen,
 * och skickar Lastat ✅ / Lossat ✅ till Joel som SMS om du vill.
 */
export type Place = {name: string; adr: string; zip: string; area: string; tel: string; tel2?: string; contact: string; code?: string; note?: string; sure?: boolean; lat?: number | null; lng?: number | null};
export type Signed = {name: string; sig: any; at: number; image?: string};
export type Egen = {
  id: string; day: string; createdAt: number;
  kind: string; title: string; from: string; ref: string; orderNo: string;
  pick: Place; drop: Place; goods: string[]; pal: number; note: string; tidspass?: {time: string | null} | null;
  sms: boolean; sign?: boolean;
  media?: {kind: 'image' | 'pdf'; uri: string; name?: string; pages?: number; pageUris?: string[]} | null;
  ocr?: any; // texten RUTT läste (rader med rutor), för ifyllnad av sedeln
  signed?: Signed | null;
  sent?: {load?: number; unload?: number};
  loadedAt?: number | null; doneAt?: number | null; // sparas på jobbet (inte per dag) så ett lossat jobb inte kommer tillbaka nästa dag
  // Bevego-tur: stoppet hör till en Opter-order (t.ex. 234014 "Distribution"). Hämtningen är Opter-orderns, Lossad på sista stoppet = Lossad i Opter.
  parent?: string | null; kolli?: {no: string; type: string; mark: string; order: string; kg: number}[]; tour?: string;
};
export const EGNA_KEY = 'rutt.egna.v1';
export const isEgen = (cid: any) => /^E\d/.test(String(cid || ''));

const two = (n: number) => String(n).padStart(2, '0');
const hm = (t: number) => { const d = new Date(t); return `${two(d.getHours())}:${two(d.getMinutes())}`; };
const place = (p: Place) => [p.name, [p.adr, p.area].filter(Boolean).join(', ')].filter(Boolean).join(', ');
const refLine = (e: Egen) => [e.title && e.ref ? `${e.title} ${e.ref}` : e.title || e.ref, e.orderNo ? (e.kind === 'inomec-hamt' ? `Kundens ordernr ${e.orderNo}` : `Märkt ${e.orderNo}`) : ''].filter(Boolean).join(' · ');

// Stoppen RUTT räknar med: hämtning + lämning, som Opter-orderna (samma fält).
export function toStops(e: Egen) {
  const tel = (p: Place) => [p.tel, p.tel2].filter(Boolean).map(t => ({label: p.contact || p.name || 'Kontakt', num: String(t).replace(/[^\d+]/g, '')}));
  const info = [e.goods.join('\n'), e.note].filter(Boolean).join('\n\n');
  const tur = e.kind === 'bevego-tur';
  const base = tur
    ? {own: e, orderNo: e.orderNo || null, freightBill: null, customer: 'Bevego', service: `Bevego-tur${e.tour ? ' ' + e.tour : ''}`, info: e.note || '', kg: (e.kolli || []).reduce((n, k) => n + (k.kg || 0), 0), pal: e.pal, kolli: (e.kolli || []).length, goods: e.goods.join(', ')}
    : {own: e, orderNo: e.ref || null, freightBill: e.orderNo || null, customer: e.from, service: ['Eget jobb', e.from].filter(Boolean).join(' · '), info, kg: 0, pal: e.pal, kolli: 0, goods: e.goods.join(', ')};
  const t = {date: e.day, hhmm: null};
  const tp = e.tidspass && e.tidspass.time ? e.tidspass : null;
  const pick = {...base, parent: e.parent || null, verb: 'Hämta', pickup: e.id, who: e.pick.name || e.pick.adr, adr: e.pick.adr, zip: e.pick.zip, area: e.pick.area, lat: e.pick.lat ?? null, lng: e.pick.lng ?? null,
    tel: tel(e.pick), contact: e.pick.contact, code: e.pick.code || '', adrMsg: e.pick.note || '', tEarliest: t, tLatest: null, deadline: null, earliest: null};
  const drop = {...base, parent: e.parent || null, verb: 'Lämna', drop: e.id, who: e.drop.name || e.drop.adr, adr: e.drop.adr, zip: e.drop.zip, area: e.drop.area, lat: e.drop.lat ?? null, lng: e.drop.lng ?? null,
    tel: tel(e.drop), contact: e.drop.contact, code: e.drop.code || '', adrMsg: e.drop.note || '', tEarliest: t, tLatest: tp ? {date: e.day, hhmm: tp.time} : null,
    tidspass: e.tidspass || null, deadline: tp ? tp.time : null, dlDate: tp ? e.day : null, req: {}, suggest: e.signed && e.signed.name ? [e.signed.name] : []};
  return [pick, drop];
}
export const cargoOf = (e: Egen) => ({name: e.from ? `${e.from} · ${e.pick.name || ''}` : e.pick.name || 'Eget jobb', pal: e.pal, kg: 0, to: e.drop.area || '', goods: e.goods.join(', ')});

// SMS till Joel. Kort, samma ordning varje gång: vad, när, var, vad, referens, vem som kvitterat.
export function statusSms(e: Egen, what: 'load' | 'unload' | 'way' | 'here' | 'late', opts: {at?: number; podName?: string; me?: string; min?: number} = {}) {
  const at = opts.at || Date.now();
  const me = (opts.me || '').split(' ')[0];
  const head = what === 'load' ? `✅ Lastat ${hm(at)}` : what === 'unload' ? `✅ Lossat ${hm(at)}` : what === 'way' ? `🚚 På väg ${hm(at)}` : what === 'here' ? `📍 Framme ${hm(at)}` : `⏱ Försenad ca ${opts.min || 15} min`;
  const p = what === 'unload' || what === 'here' ? e.drop : e.pick;
  const lines = [head, place(p)];
  if (what === 'load' || what === 'unload') { if (e.goods.length) lines.push(e.goods.join('\n')); else if (e.pal) lines.push(`${e.pal} pall`); }
  const r = refLine(e); if (r) lines.push(r);
  const by = what === 'load' ? (e.signed && e.signed.name) || opts.podName : what === 'unload' ? opts.podName : '';
  if (by) lines.push(`${what === 'load' ? 'Kvitterat av' : 'Mottaget av'} ${by}`);
  if (me) lines.push(`/${me}`);
  return lines.join('\n');
}
// Samma sorts SMS för en Opter-order (om du slagit på det i Inställningar).
export function opterSms(st: any, what: 'load' | 'unload', opts: {at?: number; podName?: string; me?: string; pal?: number} = {}) {
  const at = opts.at || Date.now(); const me = (opts.me || '').split(' ')[0];
  const lines = [what === 'load' ? `✅ Lastat ${hm(at)}` : `✅ Lossat ${hm(at)}`, [st.who, [st.adr, st.area].filter(Boolean).join(', ')].filter(Boolean).join(', ')];
  if (opts.pal) lines.push(`${opts.pal} pall`);
  if (st.orderNo) lines.push(`Order ${st.orderNo}`);
  if (opts.podName) lines.push(`${what === 'load' ? 'Kvitterat av' : 'Mottaget av'} ${opts.podName}`);
  if (me) lines.push(`/${me}`);
  return lines.join('\n');
}

export function fromParsed(r: any, media: any, ocr: any, day: string): Egen {
  const P = (p: any): Place => ({name: p.name || '', adr: p.adr || '', zip: p.zip || '', area: p.area || '', tel: p.tel || '', contact: p.contact || '', code: p.code || '', note: p.note || '', sure: !!p.sure});
  return {id: 'E' + Date.now(), day, createdAt: Date.now(), kind: r.kind, title: r.title || 'Sedel', from: r.from || '', ref: r.ref || '', orderNo: r.orderNo || '',
    pick: P(r.pick || {}), drop: P(r.drop || {}), goods: r.goods || [], pal: 1, note: r.note || '', tidspass: r.tidspass || null,
    sms: true, sign: !!r.sign, media: media || null, ocr: ocr || null, signed: null, sent: {}};
}

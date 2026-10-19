/*
 * Dagbok – vad du gjort varje dag, sparat i telefonen (90 dagar).
 * En post per dag: händelser i tidsordning (start, lastad, lossad, rast, lunch, slut) och ordern som de
 * såg ut när du körde (namn, adress, pall, kvittensens namn). Inget skickas någonstans.
 * Lärandet (riktiga körtider) läses också härifrån: tiden mellan två av dina stopp.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type DayEvent = {t: number; kind: 'start' | 'load' | 'unload' | 'rast' | 'lunch' | 'igång' | 'slut'; cid?: string; who?: string; lat?: number | null; lng?: number | null; pal?: number};
export type DayOrder = {cid: string; orderNo?: string | null; freightBill?: string | null; pickWho?: string; pickAdr?: string; dropWho?: string; dropAdr?: string;
  pal?: number; kg?: number; loadedAt?: number; doneAt?: number; podName?: string; kolli?: number | null; sent?: string; edits?: string[]};
export type Day = {ymd: string; events: DayEvent[]; orders: Record<string, DayOrder>; note?: string};

const KEEP_DAYS = 90;
const INDEX = 'rutt.dag.index';
const keyOf = (ymd: string) => 'rutt.dag.' + ymd;
const two = (n: number) => String(n).padStart(2, '0');
export const ymdOf = (d: Date | number = new Date()) => { const x = new Date(d); return `${x.getFullYear()}-${two(x.getMonth() + 1)}-${two(x.getDate())}`; };

const cache: Record<string, Day> = {};
let chain: Promise<any> = Promise.resolve();
const listeners = new Set<() => void>();
export const onChange = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
const emit = () => listeners.forEach(f => { try { f(); } catch (e) {} });

export async function loadDay(ymd: string): Promise<Day> {
  if (cache[ymd]) return cache[ymd];
  try { const v = await AsyncStorage.getItem(keyOf(ymd)); if (v) { cache[ymd] = JSON.parse(v); return cache[ymd]; } } catch (e) {}
  return {ymd, events: [], orders: {}};
}
export async function listDays(): Promise<string[]> {
  try { const v = await AsyncStorage.getItem(INDEX); return v ? JSON.parse(v) : []; } catch (e) { return []; }
}
// Ändringar köas så två händelser i samma sekund inte skriver över varandra.
function edit(ymd: string, f: (d: Day) => void) {
  chain = chain.catch(() => {}).then(async () => {
    const d = await loadDay(ymd);
    f(d);
    cache[ymd] = d;
    await AsyncStorage.setItem(keyOf(ymd), JSON.stringify(d));
    let idx: string[] = await listDays();
    if (!idx.includes(ymd)) {
      idx = [...idx, ymd].sort();
      while (idx.length > KEEP_DAYS) { const old = idx.shift() as string; delete cache[old]; try { await AsyncStorage.removeItem(keyOf(old)); } catch (e) {} }
      await AsyncStorage.setItem(INDEX, JSON.stringify(idx));
    }
    emit();
  });
  return chain;
}
export function logEvent(ev: DayEvent) {
  const ymd = ymdOf(ev.t);
  return edit(ymd, d => {
    // Samma order lastad/lossad två gånger (Ångra + igen) → senaste gäller.
    if (ev.cid && (ev.kind === 'load' || ev.kind === 'unload')) d.events = d.events.filter(x => !(x.cid === ev.cid && x.kind === ev.kind));
    d.events.push(ev);
    d.events.sort((a, b) => a.t - b.t);
  });
}
export function unlogEvent(cid: string, kind: 'load' | 'unload', t: number) {
  return edit(ymdOf(t), d => { d.events = d.events.filter(x => !(x.cid === cid && x.kind === kind)); });
}
export function saveOrder(ymd: string, o: DayOrder) {
  return edit(ymd, d => { d.orders[o.cid] = {...(d.orders[o.cid] || {}), ...o}; });
}
export function saveNote(ymd: string, note: string) {
  return edit(ymd, d => { d.note = note; });
}

/* Summering: order, pall, start/slut, rast och arbetad tid (från start till slut minus rast/lunch). */
export function summary(d: Day, now = Date.now()) {
  const ev = d.events;
  const done = Object.values(d.orders).filter(o => o.doneAt);
  const pal = done.reduce((n, o) => n + (Number(o.pal) || 0), 0);
  const first = ev.length ? ev[0].t : null;
  const endEv = [...ev].reverse().find(x => x.kind === 'slut');
  const last = endEv ? endEv.t : ev.length ? (ymdOf(now) === d.ymd ? now : ev[ev.length - 1].t) : null;
  let rest = 0; let restFrom: number | null = null;
  for (const x of ev) {
    if (x.kind === 'rast' || x.kind === 'lunch') restFrom = x.t;
    else if ((x.kind === 'igång' || x.kind === 'slut') && restFrom != null) { rest += x.t - restFrom; restFrom = null; }
  }
  if (restFrom != null && last != null) rest += Math.max(0, last - restFrom);
  const worked = first != null && last != null ? Math.max(0, last - first - rest) : 0;
  return {orders: done.length, pal, first, last, restMin: Math.round(rest / 60000), workedMin: Math.round(worked / 60000), ended: !!endEv};
}

/* Resor för lärandet: från ett stopp till nästa samma dag, utan rast emellan. Tiden räknas till nästa stopps händelse,
 * så den innehåller körningen + tiden på nästa ställe (servMin). */
export function legsFrom(days: Day[], servOf: (pal: number) => number) {
  const out: {from: {lat: number; lng: number}; to: {lat: number; lng: number}; actualMin: number; servMin: number}[] = [];
  for (const d of days) {
    let prev: DayEvent | null = null;
    for (const x of d.events) {
      if (x.kind !== 'load' && x.kind !== 'unload') { prev = null; continue; } // rast/lunch/start bryter
      if (x.lat == null || x.lng == null) { prev = null; continue; }
      if (prev && prev.lat != null && prev.lng != null) out.push({from: {lat: prev.lat, lng: prev.lng}, to: {lat: x.lat, lng: x.lng}, actualMin: (x.t - prev.t) / 60000, servMin: servOf(Number(x.pal) || 0)});
      prev = x;
    }
  }
  return out;
}

export function dayReport(d: Day, me: string, now = Date.now()) {
  const s = summary(d, now);
  const hm = (t: number | null) => (t ? new Date(t).toTimeString().slice(0, 5) : '–');
  const dur = (m: number) => `${Math.floor(m / 60)} h ${m % 60} min`;
  const date = new Date(d.ymd + 'T12:00').toLocaleDateString('sv-SE', {weekday: 'long', day: 'numeric', month: 'long'});
  const lines = [`${date.charAt(0).toUpperCase() + date.slice(1)} – ${me}`, `Start ${hm(s.first)}${s.ended ? ` · Slut ${hm(s.last)}` : ''} · Arbetat ${dur(s.workedMin)} · Rast ${s.restMin} min`, ''];
  const done = Object.values(d.orders).filter(o => o.doneAt).sort((a, b) => (a.doneAt || 0) - (b.doneAt || 0));
  for (const o of done) lines.push(`${hm(o.doneAt || null)} ${o.dropWho || '—'}${o.orderNo ? ` #${o.orderNo}` : ''}${o.pal ? ` · ${o.pal} pall` : ''}${o.podName ? ` · ${o.podName}` : ''}`);
  lines.push('', `Totalt ${s.orders} order · ${s.pal} pall`);
  if (d.note) lines.push('', 'Anteckning: ' + d.note);
  return lines.join('\n');
}
export const _cache = cache;

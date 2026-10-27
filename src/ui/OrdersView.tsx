/**
 * Plan – jobblistan (förslag A, valt 22 okt). Se kommentaren vid OrdersView nedan.
 * (Tidigare: förslag A "Fokus" 16 okt – EN skärm per ställe.)
 *  - Stort: stället du ska till, adress, tid, portkod. Inga lådor runt allt.
 *  - Orderna som en bocklista (alla bockade). Många order grupperas på vart de ska.
 *    Varje order: tryck för mottagaren/avsändaren med allt, ⋯ = tillägg, bild, avvikelse, ändring.
 *  - Allt du trycker på sitter längst ner vid tummen: GPS · Ring · SMS och dragknappen.
 *  - ‹ › (eller "Ställe 2 av 5") byter ställe. Klart = nästa ställe av sig själv.
 *  - Markera: bocka valfria order → Lastad och/eller Lossad. Flera order samtidigt följer
 *    kontorets behörighet (SetMultipleStatusPermission), som Opter Driver.
 */
import React, {useMemo, useState} from 'react';
import {FlatList, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, themed, hhmm, prettyPhone, whenText, FONT, R} from './theme';
import {Sheet} from './parts';
import {Bi, BiName} from './Bi';
import Slider from './Slider';
import ReorderSheet from './Reorder';
import {TimeSheet} from './Wheel';
import {loadJSON, saveJSON} from '../store';

type Row = {kind: 'pickup' | 'drop'; st: any; cid: string; plan: any; dropLater?: {eta: Date | null; area: string} | null};

// ---- Navigering: Google Maps eller Waze (val under Inställningar), eller bara visa platsen på kartan ----
export type NavApp = 'google' | 'waze';
let NAV: NavApp = 'google';
loadJSON('rutt.nav', 'google').then((v: any) => { if (v === 'waze' || v === 'google') NAV = v; });
export function setNavApp(v: NavApp) { NAV = v; saveJSON('rutt.nav', v); }
export const navAppName = (v: NavApp = NAV) => (v === 'waze' ? 'Waze' : 'Google Maps');
export function navigate(st: any, app: NavApp | 'map' = NAV) {
  // Adressen i ordern går före koordinaterna: Opters (eller uppslagna) koordinater kan ligga på fel husnummer
  // (Morabergsvägen 25 → punkten låg vid nr 7). Koordinater används bara när ordern saknar gatuadress.
  const hasAdr = !!(st.adr && /\d/.test(String(st.adr)) && (st.zip || st.area));
  const geo = !hasAdr && st.lat != null && st.lng != null;
  const ll = geo ? `${st.lat},${st.lng}` : '';
  const q = encodeURIComponent([st.adr, st.zip, st.area].filter(Boolean).join(', '));
  const web = `https://www.google.com/maps/dir/?api=1&destination=${geo ? ll : q}`;
  if (app === 'waze') { Linking.openURL(geo ? `https://waze.com/ul?ll=${ll}&navigate=yes` : `https://waze.com/ul?q=${q}&navigate=yes`).catch(() => Linking.openURL(web).catch(() => {})); return; }
  if (app === 'map') { Linking.openURL(geo ? `geo:${ll}?q=${ll}(${encodeURIComponent(st.who || 'Stopp')})` : `geo:0,0?q=${q}`).catch(() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${geo ? ll : q}`).catch(() => {})); return; }
  Linking.openURL(`google.navigation:q=${geo ? ll : q}`).catch(() => Linking.openURL(web).catch(() => {}));
}
export const dial = (num: string) => Linking.openURL(`tel:${num}`).catch(() => {});
// Bara mobilnummer kan ta emot SMS (07x / +467x / 00467x).
export const isMobile = (num: string) => /^(07|\+467|00467|467)\d{7,8}$/.test(String(num || '').replace(/[^0-9+]/g, ''));
// Navigera-knappen: hela knappen startar din navigeringsapp, pilen till höger ger fler val.
function NavButton({st, leg, onMore, small}: {st: any; leg?: any; onMore: () => void; small?: boolean}) {
  const sub = [leg && leg.km ? `${leg.km.toFixed(1)} km` : '', leg && leg.min ? `ca ${Math.round(leg.min)} min` : '', navAppName()].filter(Boolean).join(' · ');
  return (
    <View style={[o.nav, small && {marginTop: 10}]}>
      <Pressable style={o.navMain} onPress={() => navigate(st)} android_ripple={{color: C.edge}}>
        <View style={[o.navIco, small && {width: 32, height: 32, borderRadius: 16}]}><Bi n="cursor-fill" size={small ? 14 : 17} color={C.onAccent} /></View>
        <View style={{flex: 1, minWidth: 0}}>
          <Text style={[o.navTxt, small && {fontSize: 14}]}>Navigera</Text>
          <Text style={o.navSub} numberOfLines={1}>{sub}</Text>
        </View>
      </Pressable>
      <Pressable style={o.navMore} onPress={onMore} hitSlop={6} android_ripple={{color: C.edge}}>
        <Bi n="chevron-down" size={16} color={C.dim} />
      </Pressable>
    </View>
  );
}
function NavSheet({st, onClose}: {st: any; onClose: () => void}) {
  const go = (a: NavApp | 'map') => { onClose(); if (st) navigate(st, a); };
  const Row = ({a, icon, t, sub}: {a: NavApp | 'map'; icon: any; t: string; sub: string}) => (
    <Pressable style={o.callRow} onPress={() => go(a)}>
      <View style={[o.navIco, {backgroundColor: C.panel}]}><Bi n={icon} size={16} color={C.ink} /></View>
      <View style={{flex: 1}}><Text style={o.callNum}>{t}</Text><Text style={o.callLabel}>{sub}</Text></View>
      <Bi n="chevron-right" size={14} color={C.faint} />
    </Pressable>
  );
  return (
    <Sheet open={!!st} onClose={onClose} title="Navigera" sub={st ? [st.who, [st.adr, st.area].filter(Boolean).join(', ')].filter(Boolean).join(' · ') : ''}>
      <Row a="google" icon="signpost-2-fill" t="Google Maps" sub="Vägbeskrivning med röst" />
      <Row a="waze" icon="cursor-fill" t="Waze" sub="Vägbeskrivning med trafik och kameror" />
      <Row a="map" icon="geo-alt-fill" t="Visa på kartan" sub="Bara platsen, ingen vägbeskrivning" />
      <Text style={o.plannedNote}>Vilken app knappen startar direkt väljer du under Inställningar.</Text>
    </Sheet>
  );
}

const GENERIC = /^(nummer|kund|referens|avsändare|mottagare|växel|kontor)/i;
function Face({label}: {label: string}) {
  return <View style={o.avatar}>{GENERIC.test(String(label || '')) ? <Bi n="building" size={15} color={C.people} /> : <Text style={o.avatarTxt}>{initials(label)}</Text>}</View>;
}
// Info som bara upprepar godsraden ("2 pall 760 kg") visas inte två gånger.
const norm = (x: any) => String(x || '').toLowerCase().replace(/[^a-z0-9åäö]/g, '');
function uniqNotes(list: any[], goods: string) {
  const g = norm(goods), seen = new Set<string>(), out: string[] = [];
  for (const n of list) { const k = norm(n); if (!k || seen.has(k) || (g && g.includes(k))) continue; seen.add(k); out.push(String(n)); }
  return out;
}
// Samma ställe: inom ~60 m när båda har koordinater, annars samma gatuadress + ort.
const normAdr = (s: any) => `${String(s.adr || '').toLowerCase().replace(/\s+/g, '')}|${String(s.zip || s.area || '').toLowerCase().replace(/\s+/g, '')}`;
export function samePlace(a: any, b: any) {
  if (a.lat != null && b.lat != null && a.lng != null && b.lng != null) {
    const dx = (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180), dy = (a.lat - b.lat) * 110540;
    if (Math.hypot(dx, dy) < 60) return true;
  }
  return !!a.adr && normAdr(a) === normAdr(b);
}
const initials = (s: string) => String(s || '').replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

// Hur långt sändningen till Opter kommit.
const SYNC_TXT: Record<string, string> = {
  waiting: 'Skickas till Opter om några sekunder…', sending: 'Skickar till Opter…',
  ok: 'Uppdaterad i Opter', 'ok-noimg': 'Uppdaterad i Opter (bilden kom inte med)', nopod: 'Lossad i Opter – kvittensen kom inte med',
  unconfirmed: 'Opter har inte bekräftat – tryck för att försöka igen', failed: 'Kunde inte nå Opter – tryck för att försöka igen',
};
function SyncLine({state, label, onRetry}: {state?: string; label: string; onRetry: () => void}) {
  if (!state) return null;
  const bad = state === 'unconfirmed' || state === 'failed' || state === 'nopod';
  const ok = state === 'ok' || state === 'ok-noimg';
  const col = ok ? C.accent2 : bad ? C.bad : C.faint;
  return (
    <Pressable disabled={!bad} onPress={onRetry} hitSlop={6} style={o.syncRow}>
      <Bi n={ok ? 'cloud-check-fill' : bad ? 'cloud-slash-fill' : 'arrow-repeat'} size={14} color={col} />
      <Text style={[o.sync, {color: col}]}>{label}: {SYNC_TXT[state] || state}</Text>
    </Pressable>
  );
}

// ---- SMS: färdiga texter, du trycker bara skicka i telefonens SMS-app ----
const MINS = [5, 10, 15, 20, 30];
export type TellTarget = {id: string; name: string; sub: string; icon: BiName};
// "Säg till": texten går att ändra, sen ett tryck på vem som ska få den.
function TellSheet({t, targets, onClose, onSend, onSms}: {t: {text: string; mob: any; who: string} | null; targets: TellTarget[]; onClose: () => void; onSend: (id: string, text: string) => void; onSms: (num: string, text: string) => void}) {
  const [text, setText] = useState('');
  const [base, setBase] = useState('');
  if (t && t.text !== base) { setBase(t.text); setText(t.text); }
  if (!t) return null;
  const body = text.trim();
  const Row = ({icon, name, sub, go}: {icon: BiName; name: string; sub: string; go: () => void}) => (
    <Pressable disabled={!body} style={[o.tellRow, !body && {opacity: 0.4}]} onPress={go} android_ripple={{color: C.edge}}>
      <View style={o.tellIc}><Bi n={icon} size={17} color={C.people} /></View>
      <View style={{flex: 1, minWidth: 0}}><Text style={o.tellN} numberOfLines={1}>{name}</Text><Text style={o.tellS} numberOfLines={1}>{sub}</Text></View>
      <Bi n="send-fill" size={16} color={C.people} />
    </Pressable>
  );
  return (
    <Sheet open onClose={onClose} title="Säg till" sub={t.who} scroll>
      <TextInput value={text} onChangeText={setText} multiline style={o.tellIn} placeholderTextColor={C.faint} placeholder="Vad vill du säga?" />
      <Text style={o.sheetLbl}>Skicka till</Text>
      {targets.map(x => <Row key={x.id} icon={x.icon} name={x.name} sub={x.sub} go={() => onSend(x.id, body)} />)}
      {t.mob ? <Row icon="geo-alt-fill" name={String(t.mob.label).replace(/\s*\(mobil\)/i, '')} sub={`SMS · ${prettyPhone(t.mob.num)} · på stället`} go={() => onSms(t.mob.num, body)} /> : null}
      <Row icon="share-fill" name="Annan app" sub="WhatsApp, mejl, kopiera …" go={() => { onClose(); Share.share({message: body}).catch(() => {}); }} />
    </Sheet>
  );
}
function SmsSheet({to, onClose}: {to: {name: string; num: string; who: string} | null; onClose: () => void}) {
  const [min, setMin] = useState(10);
  if (!to) return null;
  const T = [
    `Hej! Jag är hos er om ca ${min} min med leveransen${to.who ? ` till ${to.who}` : ''}.`,
    'Hej! Jag står utanför nu med er leverans.',
    'Hej! Jag är framme men kommer inte in – kan någon möta mig?',
  ];
  const send = (t: string) => { onClose(); Linking.openURL(`sms:${to.num}${t ? `?body=${encodeURIComponent(t)}` : ''}`).catch(() => {}); };
  return (
    <Sheet open onClose={onClose} title={`SMS till ${to.name}`} sub={prettyPhone(to.num)}>
      <Text style={o.sheetLbl}>Om</Text>
      <View style={o.minRow}>
        {MINS.map(m => (
          <Pressable key={m} onPress={() => setMin(m)} style={[o.minChip, m === min && o.minOn]}>
            <Text style={[o.minTxt, m === min && {color: C.onAccent}]}>{m} min</Text>
          </Pressable>
        ))}
      </View>
      {T.map((t, i) => (
        <Pressable key={i} style={o.tmpl} onPress={() => send(t)}>
          <Text style={o.tmplTxt}>{t}</Text>
          <Bi n="send-fill" size={16} color={C.people} />
        </Pressable>
      ))}
      <Pressable style={o.tmplOpen} onPress={() => send('')}>
        <Text style={o.tmplOpenTxt}>Skriv eget i SMS-appen</Text>
      </Pressable>
    </Sheet>
  );
}

/* =====================================================================================
 * Jobblistan (förslag A, valt 22 okt): hela dagen på en skärm.
 *  - Stopp i körordning: nummer, HÄMTA/LÄMNA, namn, adress, tid. Under: en rad per order.
 *  - Tryck på en order = allt om den i ett blad (+ "Visa för butiken" vid hämtning).
 *  - Håll in en order = markera flera (även andra adresser), sen en knapp: "Lastad · n" / "Lossad · n".
 *  - Lämningar är grå tills godset är lastat. Nere: nästa stopp med GPS, Ring och dra-för-Lastad/Lossad.
 * ===================================================================================== */
type JRow = Row & {state: 'act' | 'wait'};
type JPlace = {key: string; st: any; rows: JRow[]; eta: any; late: number};

// Klockslag: tryck → hjulet (som väckarklockan), eller "Nu". Dagens datum.
function ClockField({label, value, onSet, placeholder = '--:--'}: {label: string; value: number | null; onSet: (v: number | null) => void; placeholder?: string}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{flex: 1, minWidth: 0}}>
      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end'}}>
        <Text style={o.clkL}>{label}</Text>
        <Pressable hitSlop={8} onPress={() => onSet(Date.now())}><Text style={o.clkNow}>Nu</Text></Pressable>
      </View>
      <Pressable style={o.clk} onPress={() => setOpen(true)} accessibilityLabel={`${label}, tryck för att ändra`}>
        <Text style={[o.clkT, !value && {color: C.faint, fontSize: 15}]}>{value ? hhmm(new Date(value)) : placeholder}</Text>
      </Pressable>
      <TimeSheet open={open} title={label === 'Start' ? 'Starttid' : label === 'Slut' ? 'Sluttid' : label} value={value} onClose={() => setOpen(false)} onDone={t => { setOpen(false); onSet(t); }} />
    </View>
  );
}

export default function OrdersView({route, cargo, ost, allStops, onLoaded, onUnload, onEdit, onAvised, onRetry, live, later = [], onReorder, perm, tellTo = [], onTell, me = '', onAddNum, onScan, timOf, onSetTim, onSetTimes, sedelOf}: {
  route: any; cargo: any; ost: Record<string, any>; allStops: any[];
  onLoaded: (st: any, more?: any[]) => void; onUnload: (st: any, more?: any[]) => void;
  onEdit: (cid: string, st: any) => void;
  onAvised: (cid: string) => void;
  onRetry: (cid: string) => void; live: boolean; later?: any[]; onReorder?: (keys: string[] | null) => void; perm?: any;
  tellTo?: TellTarget[];
  onTell?: (id: string, text: string) => void;
  me?: string;
  onAddNum?: (cid: string, c: {label: string; num: string}) => void;
  onScan?: () => void;
  timOf?: (st: any) => {on: boolean; start: number | null; end?: number | null; auto: boolean};
  onSetTim?: (sts: any[], on: boolean) => void;
  onSetTimes?: (sts: any[], t: {start?: number | null; end?: number | null}) => void;
  sedelOf?: (cid: string) => any;
}) {
  const [callStop, setCallStop] = useState<any>(null);
  const [sms, setSms] = useState<any>(null);
  const [tell, setTell] = useState<{text: string; mob: any; who: string} | null>(null);
  const [reorder, setReorder] = useState(false);
  const [navFor, setNavFor] = useState<any>(null);
  const [placeSheet, setPlaceSheet] = useState<any>(null);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [selMode, setSelMode] = useState(false);
  const [openRow, setOpenRow] = useState<JRow | null>(null);
  const [shop, setShop] = useState<JRow[] | null>(null);
  const [addNum, setAddNum] = useState<{cid: string; label: string; num: string} | null>(null);
  const [planned, setPlanned] = useState<any>(null);
  const now = Date.now();
  const insets = useSafeAreaInsets();

  // Alla rader ur körordningen. Lämningar vars gods inte är lastat än visas grå ("väntar på lastning").
  const rows: JRow[] = useMemo(() => {
    const order = route.order || [], prow = route.plan.rows || [];
    const pendingPick = new Set(order.filter((s: any) => s.pickup).map((s: any) => String(s.pickup)));
    const out: JRow[] = [];
    order.forEach((s: any, i: number) => {
      // Opter-ordern bakom en turlista ("Distribution") syns som sina stopp – Lastad på dem lastar även den.
      if (s.pickup && s.kids && s.kids.length) return;
      if (s.pickup) out.push({kind: 'pickup', st: s, cid: s.pickup, plan: prow[i], state: 'act'});
      else if (s.drop) out.push({kind: 'drop', st: s, cid: s.drop, plan: prow[i], state: pendingPick.has(String(s.drop)) ? 'wait' : 'act'});
    });
    return out;
  }, [route, ost]);
  // Stopp = samma ställe (Opter har ingen sådan logik – RUTT slår ihop på adress/koordinater).
  const places: JPlace[] = useMemo(() => {
    const out: JPlace[] = [];
    for (const r of rows) {
      let pl = out.find(x => samePlace(x.st, r.st));
      if (!pl) out.push(pl = {key: r.kind + r.cid, st: r.st, rows: [], eta: null, late: 0});
      pl.rows.push(r);
      if (r.state === 'act' && !pl.eta && r.plan && r.plan.eta) pl.eta = r.plan.eta;
      if (r.plan && r.plan.late) pl.late = Math.max(pl.late, r.plan.late);
    }
    const rank = (r: JRow) => (r.state === 'wait' ? 2 : r.kind === 'drop' ? 0 : 1);
    out.forEach(pl => pl.rows.sort((a, b) => rank(a) - rank(b)));
    return out;
  }, [rows]);
  const k = (r: Row) => r.kind + r.cid;
  const multi = !perm || perm.multi !== false;
  const canP = !perm || perm.pickup !== false, canD = !perm || perm.delivery !== false;
  const canAct = (r: JRow) => r.state === 'act' && (r.kind === 'pickup' ? canP : canD);
  const otherOf = (r: Row) => r.kind === 'pickup'
    ? (allStops.find((s: any) => s.drop === r.cid) || later.find((s: any) => s.drop === r.cid))
    : (allStops.find((s: any) => s.pickup === r.cid) || later.find((s: any) => s.pickup === r.cid));
  const placeName = (st: any) => st.who || [st.adr, st.area].filter(Boolean).join(', ') || '—';
  const qty = (r: Row) => { const c = cargo[r.cid] || {}; const kli = Number(r.st.kolli) || 0; return kli ? {n: kli, u: 'kli'} : c.pal ? {n: Number(c.pal), u: 'pall'} : null; };
  // Godset = kollitexten i Opter ("2 pall", "Kartonger"). Inte kundnamnet/tjänsten ("Bud BDX"), det är inget gods.
  const goodsOf = (r: Row) => { const c = cargo[r.cid] || {}; const g = String(c.goods || ''); return /^order\b/i.test(g) ? '' : g; };
  const syncBad = (r: Row) => { const sy = (ost[r.cid] || {}).sync || {}; const v = r.kind === 'pickup' ? sy.load : sy.unload; return v === 'failed' || v === 'unconfirmed'; };
  const nextPl = places.find(pl => pl.rows.some(r => r.state === 'act')) || null;
  // Rubriken på ett stopp: företaget när alla order gäller samma, annars gatan (t.ex. Birger Jarlsgatan 18 med fyra mottagare).
  const titleOf = (pl: JPlace) => { const whos = [...new Set(pl.rows.map(r => String(r.st.who || '')))]; return whos.length === 1 && whos[0] ? whos[0] : pl.st.adr || placeName(pl.st); };
  const sumQty = (rs: Row[]) => { let kli = 0, pal = 0; rs.forEach(r => { const q = qty(r); if (q) { if (q.u === 'kli') kli += q.n; else pal += q.n; } }); return {kli, pal}; };
  const qtyTxt = (q: {kli: number; pal: number}) => [q.kli ? `${q.kli} kli` : '', q.pal ? `${q.pal} pall` : ''].filter(Boolean).join(' · ');

  // ---- markera flera ----
  const selRows = rows.filter(r => sel[k(r)] && canAct(r));
  const nP = selRows.filter(r => r.kind === 'pickup').length, nD = selRows.length - nP;
  const exitSel = () => { setSelMode(false); setSel({}); };
  const toggle = (r: JRow) => { if (!canAct(r)) return; setSel(x => { const n = {...x, [k(r)]: !x[k(r)]}; if (!Object.values(n).some(Boolean)) setSelMode(false); return n; }); };
  const startSel = (r: JRow) => { if (!multi || !canAct(r)) return; setSel({[k(r)]: true}); setSelMode(true); };
  const togglePlace = (pl: JPlace) => { const rs = pl.rows.filter(canAct); const all = rs.every(r => sel[k(r)]); setSel(x => { const n = {...x}; rs.forEach(r => { n[k(r)] = !all; }); if (!Object.values(n).some(Boolean)) setSelMode(false); return n; }); };
  const selectAll = () => { const kind = selRows[0] ? selRows[0].kind : (nextPl && nextPl.rows.find(canAct) || {kind: 'drop'}).kind; setSel(x => { const n = {...x}; rows.filter(r => canAct(r) && r.kind === kind).forEach(r => { n[k(r)] = true; }); return n; }); };
  const doGo = (kind: 'pickup' | 'drop') => {
    const ch = selRows.filter(r => r.kind === kind); if (!ch.length) return;
    exitSel();
    if (kind === 'pickup') onLoaded(ch[0].st, ch.slice(1).map(r => r.st)); else onUnload(ch[0].st, ch.slice(1).map(r => r.st));
  };
  const doPlace = (pl: JPlace, kind: 'pickup' | 'drop') => { const ch = pl.rows.filter(r => r.kind === kind && canAct(r)); if (!ch.length) return; if (kind === 'pickup') onLoaded(ch[0].st, ch.slice(1).map(r => r.st)); else onUnload(ch[0].st, ch.slice(1).map(r => r.st)); };

  // Personerna på ett stopp: rund avatar, SMS (bara mobil) och Ring.
  const peopleRows = (st: any) => {
    const tel = (st.tel || []).slice(0, 4);
    if (!tel.length) return null;
    return (
      <View style={o.people}>
        {tel.map((t: any) => (
          <View key={t.num} style={o.person}>
            <Face label={t.label} />
            <View style={{flex: 1, minWidth: 0}}>
              <Text style={o.pName} numberOfLines={1}>{String(t.label).replace(/\s*\(mobil\)/i, '')}</Text>
              <Text style={o.pNum}>{prettyPhone(t.num)}{t.src ? `  ·  ${t.src}` : ''}</Text>
            </View>
            {isMobile(t.num) && (
              <Pressable hitSlop={6} style={o.pBtn} onPress={() => setSms({name: String(t.label).replace(/\s*\(mobil\)/i, ''), num: t.num, who: st.who})}>
                <Bi n="chat-dots-fill" size={17} color={C.people} />
              </Pressable>
            )}
            <Pressable hitSlop={6} style={o.pBtn} onPress={() => dial(t.num)}>
              <Bi n="telephone-fill" size={17} color={C.people} />
            </Pressable>
          </View>
        ))}
      </View>
    );
  };

  // ---- Senare dagar: en rad per ORDER (hämta + lämna ihop) ----
  const laterOrders = (() => {
    const by: Record<string, any> = {}; const out: any[] = [];
    for (const st of later) {
      const cid = String(st.pickup || st.drop);
      if (!by[cid]) { by[cid] = {cid, pick: null, drop: null}; out.push(by[cid]); }
      if (st.pickup) by[cid].pick = st; else by[cid].drop = st;
    }
    return out;
  })();
  const when = (st: any) => (st ? whenText(st.tEarliest || st.tLatest) : '');

  // ---- En rad ----
  const orderRow = (r: JRow) => {
    const on = !!sel[k(r)], other = otherOf(r), q = qty(r), act = r.state === 'act';
    const pick = r.kind === 'pickup', bad = syncBad(r);
    const t1 = pick ? (other ? placeName(other) : goodsOf(r) || 'Order') : (r.st.who || goodsOf(r) || 'Order');
    const dest = other ? [other.adr, other.area].filter(Boolean).join(', ') : '';
    const sub: React.ReactNode[] = [];
    if (r.st.tidspass) sub.push(<Text key="tp" style={o.tp}>{r.st.tidspass.time ? `Tidspass ${r.st.tidspass.time}` : 'Tidspassning'}  </Text>);
    if (r.st.own) sub.push(<Text key="own" style={o.ownTag}>{(r.st.own.from || 'EGET').toUpperCase()}  </Text>);
    if (r.st.orderNo) sub.push(<Text key="no" style={o.mono}>{r.st.orderNo}</Text>);
    const rest = !act ? `väntar på lastning${other ? ` · hämtas hos ${placeName(other)}` : ''}`
      : pick ? (dest ? `→ ${dest}` : 'mottagarens adress saknas i ordern')
      : [goodsOf(r), other ? `från ${placeName(other)}` : ''].filter(Boolean).join(' · ');
    if (rest) sub.push(<Text key="r">{sub.length ? (pick && act ? ' ' : ' · ') : ''}{rest}</Text>);
    return (
      <Pressable key={k(r)} style={[o.jr, on && o.jrOn]} android_ripple={{color: C.edge}}
        onPress={() => (selMode ? toggle(r) : setOpenRow(r))} onLongPress={() => (selMode ? toggle(r) : startSel(r))} delayLongPress={350}>
        {selMode && canAct(r)
          ? <View style={[o.jck, on && o.jckOn]}>{on ? <Bi n="check2" size={14} color="#000000" /> : null}</View>
          : <View style={[o.mk, act ? (pick ? o.mkP : o.mkD) : null, bad && {backgroundColor: C.bad}]} />}
        <View style={{flex: 1, minWidth: 0}}>
          <Text style={[o.jt1, !act && {color: C.faint}]} numberOfLines={1}>{t1}</Text>
          {bad
            ? <Text style={[o.jt2, {color: C.bad}]} numberOfLines={1} onPress={() => onRetry(r.cid)}>Inte bekräftad i Opter – tryck för att skicka igen</Text>
            : <Text style={o.jt2} numberOfLines={1}>{sub}</Text>}
        </View>
        {q ? <View style={o.jq}><Text style={[o.jqN, !act && {color: C.faint}]}>{q.n}</Text><Text style={o.jqU}>{q.u.toUpperCase()}</Text></View> : null}
      </Pressable>
    );
  };
  const placeBlock = (pl: JPlace, i: number) => {
    const act = pl.rows.filter(r => r.state === 'act');
    const hasP = act.some(r => r.kind === 'pickup'), hasD = act.some(r => r.kind === 'drop');
    const isNext = nextPl === pl;
    const st = pl.st;
    const sameTitle = titleOf(pl) === st.adr;
    const meta = [sameTitle ? st.area : [st.adr, st.area].filter(Boolean).join(', '), pl.eta ? `ca ${hhmm(pl.eta)}` : '', st.code ? `Portkod ${st.code}` : ''].filter(Boolean).join('  ·  ');
    const selAble = selMode && pl.rows.some(canAct);
    return (
      <View key={pl.key} style={{marginTop: i === 0 ? 4 : 14}}>
        <Pressable style={o.sh} onPress={() => (selMode ? togglePlace(pl) : openPlace(pl))} onLongPress={() => { if (!selMode && multi && pl.rows.some(canAct)) { setSelMode(true); const n: Record<string, boolean> = {}; pl.rows.filter(canAct).forEach(r => { n[k(r)] = true; }); setSel(n); } }} delayLongPress={350} android_ripple={{color: C.edge}}>
          <View style={[o.ix, isNext && o.ixNext]}><Text style={[o.ixT, isNext && {color: '#000000'}]}>{i + 1}</Text></View>
          <View style={{flex: 1, minWidth: 0}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
              {hasD || !act.length ? <Text style={[o.vb, {color: act.length ? C.accent2 : C.faint}]}>LÄMNA</Text> : null}
              {hasP ? <Text style={[o.vb, {color: C.accentInk}]}>HÄMTA</Text> : null}
              <Text style={o.shName} numberOfLines={1}>{titleOf(pl)}</Text>
            </View>
            {meta ? <Text style={[o.shMeta, pl.late ? {color: C.bad} : null]} numberOfLines={1}>{meta}{pl.late ? `  ·  ${pl.late} min sen` : ''}</Text> : null}
          </View>
          {selAble
            ? <Pressable hitSlop={10} onPress={() => togglePlace(pl)} style={o.allBtn}><Text style={o.allTxt}>Alla</Text></Pressable>
            : <Text style={o.shQty}>{qtyTxt(sumQty(act.length ? act : pl.rows))}</Text>}
        </Pressable>
        <View style={o.jg}>{pl.rows.map(orderRow)}</View>
      </View>
    );
  };

  // ---- På timme? Väljs innan Lossad. Ja → Tid öppnas vid Lossad med start (när du lastade) och slut (nu). ----
  const timSeg = (sts: any[], big = false) => {
    if (!timOf || !onSetTim || !sts.length) return null;
    const t = timOf(sts[0]); const on = sts.some(x => timOf(x).on);
    // Turlista: tiden går på Opter-ordern, vid sista stoppet (då följer den med i kvittensen).
    const fam = sts.every(x => x.own && x.parent) ? rows.filter(x => x.kind === 'drop' && x.st.parent && sts.some(y => y.parent === x.st.parent)).length : 0;
    const notLast = fam > sts.length;
    const sub = on ? (t.start ? `start ${hhmm(new Date(t.start))} · ${t.end ? `slut ${hhmm(new Date(t.end))}` : notLast ? 'tiden fylls i vid sista stoppet' : 'slut när du lossar'}` : 'start sätts när du lastar') : t.auto ? 'ordern nämner timmar – tryck Ja om jobbet är på timme' : 'nej – ingen tid skickas';
    const span = t.start && t.end ? Math.max(0, Math.round((t.end - t.start) / 60000)) : null;
    return (
      <View style={big ? o.timBig : null}>
      <View style={o.tim}>
        <Bi n="stopwatch-fill" size={big ? 17 : 15} color={on ? C.accentInk : C.faint} />
        <View style={{flex: 1, minWidth: 0}}>
          <Text style={o.timL}>På timme</Text>
          <Text style={o.timS} numberOfLines={1}>{sub}</Text>
        </View>
        <View style={o.seg}>
          {[false, true].map(v => (
            <Pressable key={String(v)} hitSlop={4} style={[o.segB, on === v && (v ? o.segOnY : o.segOnN)]} onPress={() => onSetTim(sts, v)}>
              <Text style={[o.segT, on === v && (v ? {color: '#000000'} : {color: C.ink})]}>{v ? 'Ja' : 'Nej'}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {big && on && onSetTimes ? (
        // Start och slut går att sätta själv – "Nu" eller skriv klockslag (7.30, 0730, 07:30).
        <View style={o.timRow}>
          <ClockField label="Start" value={t.start} onSet={v => onSetTimes(sts, {start: v})} />
          <ClockField label="Slut" value={t.end || null} onSet={v => onSetTimes(sts, {end: v})} placeholder="vid Lossad" />
          <View style={{justifyContent: 'flex-end', paddingBottom: 9, minWidth: 64}}><Text style={o.timSum}>{span != null ? (span >= 60 ? `${Math.floor(span / 60)} h ${span % 60} min` : `${span} min`) : ''}</Text></View>
        </View>
      ) : null}
      </View>
    );
  };
  // ---- Bladet för en order: hela körningen, båda ändarna, som i Opter (och lite till) ----
  const legRow = (lbl: string, x: any, here: boolean, i: number, key?: string) => {
    const t = x.tEarliest && x.tLatest ? `${whenText(x.tEarliest)} – ${whenText(x.tLatest)}` : whenText(x.tEarliest || x.tLatest);
    const tel = (x.tel || [])[0];
    const adr = [x.adr, [x.zip, x.area].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return (
      <View key={key || lbl} style={[o.lg, i > 0 && o.kvLine]}>
        <Text style={[o.lgK, {color: here ? (lbl.startsWith('H') ? C.accentInk : C.accent2) : C.faint}]}>{lbl}</Text>
        <View style={{flex: 1, minWidth: 0}}>
          <Text style={o.lgWho}>{x.who || placeName(x)}</Text>
          <Text style={[o.lgAdr, !x.adr && {color: C.bad}]}>{adr || 'Adressen saknas i ordern'}</Text>
          {t || x.contact || x.qtyTxt ? <Text style={o.lgMeta}>{[x.qtyTxt, t, x.contact].filter(Boolean).join('  ·  ')}</Text> : null}
          {x.orderNo && key ? <Text style={o.mono}>order {x.orderNo}</Text> : null}
        </View>
        {/* Navigera och ring direkt vid adressen – inte längst ner i bladet */}
        <View style={{flexDirection: 'row', gap: 6}}>
          {x.adr || x.lat != null ? <Pressable hitSlop={6} style={o.lgNav} onPress={() => navigate(x)} onLongPress={() => setNavFor(x)} accessibilityLabel={`Navigera till ${x.who || x.adr}`}><Bi n="cursor-fill" size={16} color="#000000" /></Pressable> : null}
          {tel ? <Pressable hitSlop={6} style={o.lgTel} onPress={() => dial(tel.num)} accessibilityLabel={`Ring ${tel.label || ''}`}><Bi n="telephone-fill" size={15} color={C.people} /></Pressable> : null}
        </View>
      </View>
    );
  };
  // Inläst fraktsedel (BDX) som hör till Opter-ordern – allt som stod på den, och varning om adressen skiljer sig.
  const sedelBox = (r: JRow, st: any) => {
    const f = sedelOf ? sedelOf(String(r.cid)) : null;
    const own = st.own && (st.own.kind === 'bdx-frakt') ? st.own : null;
    if (!f && !own) return null;
    const d = f || {sendNo: own.ref, counts: null, kolli: own.kolli || [], total: null, kg: 0, orders: [], ref: '', sender: null, note: ''};
    const counts = d.counts || (d.kolli || []).reduce((m: any, k: any) => { m[k.type] = (m[k.type] || 0) + 1; return m; }, {});
    const ct = Object.entries(counts).map(([t, n]) => `${n} ${String(t).toLowerCase()}`).join(' + ');
    const nk2 = (x: string) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    const diff = f && f.adr && st.adr && !r.kind.startsWith('p') && nk2(f.adr) !== nk2(st.adr);
    const rowsF: [string, string, boolean?][] = [];
    if (d.sendNo) rowsF.push(['Sändningsnr', String(d.sendNo).replace(/^(\d{3})(\d{3})(\d{3})(\d)$/, '$1 $2 $3 $4'), true]);
    if (ct) rowsF.push(['Kolli', ct + (d.total ? `  (${(d.kolli || []).length} av ${d.total})` : '')]);
    if (d.kg) rowsF.push(['Vikt', `${d.kg} kg`]);
    if (d.orders && d.orders.length) rowsF.push(['Ingående order', d.orders.join(', '), true]);
    if (d.ref) rowsF.push(['Mott. ref', d.ref, true]);
    if (d.sender && d.sender.name) rowsF.push(['Avsändare', [d.sender.name, d.sender.area].filter(Boolean).join(', ')]);
    if (f && f.note) rowsF.push(['Info', f.note]);
    return (
      <View style={o.fullTxt}>
        <Text style={o.fullK}>FRAKTSEDEL (INLÄST)</Text>
        {diff ? <Text style={[o.fullV, {color: C.bad, fontWeight: '700'}]}>Sedeln säger {f.adr}{f.zip ? `, ${f.zip} ${f.area || ''}` : ''} – Opter säger {st.adr}. Kolla innan du kör.</Text> : null}
        {rowsF.map(([a, b, mono]) => (
          <View key={a} style={{flexDirection: 'row', gap: 10, marginTop: 3}}><Text style={[o.kvK, {fontSize: 13, minWidth: 104}]}>{a}</Text><Text style={[o.fullV, {flex: 1, fontSize: 14}, mono && o.mono, mono && {color: C.noteInk, fontSize: 13.5}]}>{b}</Text></View>
        ))}
        {(d.kolli || []).length ? <Text style={[o.mono, {marginTop: 6, lineHeight: 18}]} selectable>{(d.kolli || []).map((k: any) => `${k.no}  ${k.type}${k.kg ? '  ' + k.kg + ' kg' : ''}`).join('\n')}</Text> : null}
      </View>
    );
  };
  const rowSheet = () => {
    const r = openRow; if (!r) return null;
    const pick = r.kind === 'pickup', other = otherOf(r), st = r.st, q = qty(r), act = r.state === 'act';
    const notes = uniqNotes([st.adrMsg, st.info], goodsOf(r));
    const kv: [string, string, boolean?][] = [];
    if (st.service) kv.push(['Tjänst', String(st.service)]);
    if (st.customer && st.customer !== st.who) kv.push(['Kund', String(st.customer)]);
    if (st.orderedBy) kv.push(['Beställare', String(st.orderedBy)]);
    if (st.parentNo) kv.push(['Opter-order', String(st.parentNo), true]);
    if (st.freightBill && st.freightBill !== st.orderNo) kv.push(['Fraktsedel', String(st.freightBill), true]);
    if (st.orderNo) kv.push(['Order', String(st.orderNo), true]);
    if (st.ref) kv.push(['Referens', String(st.ref)]);
    if (goodsOf(r)) kv.push(['Gods', goodsOf(r)]);
    if (q) kv.push([q.u === 'kli' ? 'Kolli' : 'Pall', String(q.n)]);
    if (st.kg) kv.push(['Vikt', `${st.kg} kg`]);
    if (st.km) kv.push(['Sträcka', `${st.km} km`]);
    if (st.live && st.live.cur) kv.push(['Status i Opter', String(st.live.cur)]);
    const pk = pick ? st : other, dr = pick ? other : st;
    const kids: any[] = (pk && pk.kids) || [];
    const noAdr = !kids.length && (!dr || !dr.adr);
    const close = () => setOpenRow(null);
    return (
      <Sheet open onClose={close} scroll>
        <Text style={[o.vb, {color: pick ? C.accentInk : C.accent2}]}>{pick ? 'HÄMTA' : 'LÄMNA'}{st.orderNo ? `  ·  ORDER ${st.orderNo}` : ''}</Text>
        <Text style={o.rsTitle}>{st.who || placeName(st)}</Text>
        <Text style={o.rsAdr}>{[st.adr, [st.zip, st.area].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</Text>
        {st.tidspass ? <View style={o.tpBox}><Bi n="alarm-fill" size={15} color="#000000" /><Text style={o.tpBoxT}>{st.tidspass.time ? `Tidspassning kl ${st.tidspass.time}` : 'Tidspassning – tiden står inte i ordern'}</Text></View> : null}
        {st.code ? <View style={o.codeRow}><Bi n="key-fill" size={15} color={C.accentInk} /><Text style={o.codeV}>{st.code}</Text><Text style={o.codeL}>PORTKOD</Text></View> : null}
        <Text style={[o.vb, {color: C.faint, marginTop: 12}]}>KÖRNINGEN</Text>
        <View style={o.lgs}>
          {pk ? legRow('HÄMTA', pk, pick, 0) : null}
          {kids.length
            ? kids.map((x, i) => legRow(`LÄMNA ${i + 1}/${kids.length}`, x, false, i + 1, 'k' + i))
            : dr ? legRow('LÄMNA', dr, !pick, 1) : null}
        </View>
        {noAdr && onScan && !/\bbdx\b/i.test([pk && pk.who, pk && pk.customer].join(' ')) ? (
          <Pressable style={o.scanRow} onPress={() => { close(); onScan(); }}>
            <Bi n="upc-scan" size={16} color={C.accentInk} />
            <View style={{flex: 1}}>
              <Text style={o.scanT}>Läs in turleveranslistan</Text>
              <Text style={o.scanS}>Opter säger inte vart godset ska. Fota pappren så blir varje kund ett stopp.</Text>
            </View>
          </Pressable>
        ) : null}
        {sedelBox(r, st)}
        {notes.length > 0 && (
          <View style={o.fullTxt}>
            <Text style={o.fullK}>TEXT I ORDERN</Text>
            <Text style={o.fullV} selectable>{notes.join('\n\n')}</Text>
          </View>
        )}
        {!st.own || st.parent ? timSeg([st], true) : null}
        <View style={o.kv}>
          {kv.map(([a, b, mono], i) => (
            <View key={a} style={[o.kvRow, i > 0 && o.kvLine]}><Text style={o.kvK}>{a}</Text><Text style={[o.kvV, mono && o.mono, mono && {fontSize: 14, color: C.ink}]}>{b}</Text></View>
          ))}
        </View>
        {peopleRows(st)}
        {onAddNum ? <Pressable hitSlop={6} style={o.addNum} onPress={() => setAddNum({cid: String(r.cid), label: '', num: ''})}><Bi n="plus-lg" size={13} color={C.accentInk} /><Text style={o.addNumT}>Lägg till nummer på jobbet</Text></Pressable> : null}
        <View style={o.rsBtns}>
          <Pressable style={o.sqBtn} onPress={() => navigate(st)} onLongPress={() => { close(); setNavFor(st); }}><Bi n="cursor-fill" size={18} color={C.ink} /></Pressable>
          {pick ? <Pressable style={[o.bigBtn, {backgroundColor: C.panel2, flex: 1.25}]} onPress={() => { const rs = rows.filter(x => x.kind === 'pickup' && x.state === 'act' && samePlace(x.st, st)); close(); setShop(rs.length ? rs : [r]); }}><Text style={o.bigBtnT} numberOfLines={1}>Visa för butiken</Text></Pressable> : null}
          {act && canAct(r) ? <Pressable style={[o.bigBtn, {backgroundColor: pick ? C.accent : C.accent2}]} onPress={() => { close(); if (pick) onLoaded(st); else onUnload(st); }}><Text style={[o.bigBtnT, {color: pick ? '#000000' : '#FFFFFF'}]}>{pick ? 'Lastad' : 'Lossad'}</Text></Pressable> : null}
        </View>
        <Pressable style={o.moreRow} onPress={() => { close(); onEdit(st.parent && st.own ? String(st.parent) : r.cid, st); }}>
          <Bi n="three-dots" size={16} color={C.dim} /><Text style={o.moreRowT}>Mer: status, tid, tillägg, bild, avvikelse, ändring</Text>
        </Pressable>
      </Sheet>
    );
  };

  // ---- Visa för butiken: vit helskärm med det de frågar efter vid hämtning ----
  const shopView = () => {
    const rs = shop || [];
    const tot = sumQty(rs);
    return (
      <Modal visible={!!shop} animationType="slide" onRequestClose={() => setShop(null)} statusBarTranslucent>
        <View style={[o.shop, {paddingTop: insets.top + 14, paddingBottom: insets.bottom + 12}]}>
          <Text style={o.shopK}>RUTT{me ? ` · ${me}` : ''}</Text>
          <Text style={o.shopH}>Jag ska hämta {rs.length} {rs.length === 1 ? 'sändning' : 'sändningar'}</Text>
          <ScrollView style={{flex: 1}}>
            {rs.map(r => { const ot = otherOf(r), q = qty(r); return (
              <View key={k(r)} style={o.shopRow}>
                <View style={{width: 116}}><Text style={o.shopNo}>{r.st.freightBill || r.st.orderNo || ''}</Text>{r.st.freightBill && r.st.orderNo && r.st.freightBill !== r.st.orderNo ? <Text style={o.shopNo2}>order {r.st.orderNo}</Text> : null}</View>
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={o.shopTo}>{ot ? placeName(ot) : goodsOf(r) || '—'}</Text>
                  <Text style={o.shopAdr}>{ot ? [ot.adr, ot.area].filter(Boolean).join(', ') || 'adress saknas i ordern' : ''}</Text>
                </View>
                <Text style={o.shopQ}>{q ? `${q.n}` : ''}<Text style={o.shopU}>{q ? ` ${q.u}` : ''}</Text></Text>
              </View>
            ); })}
            <View style={o.shopTot}><Text style={o.shopTotT}>Totalt</Text><Text style={o.shopTotT}>{qtyTxt(tot) || `${rs.length} st`}</Text></View>
          </ScrollView>
          <Pressable style={o.shopClose} onPress={() => setShop(null)}><Text style={o.shopCloseT}>Stäng</Text></Pressable>
        </View>
      </Modal>
    );
  };

  // ---- Mottagare / avsändare / ställe – allt om stoppet ----
  const placeSheetView = () => {
    const ps = placeSheet; if (!ps) return null;
    const st = ps.st, pl: JPlace | undefined = ps.pl;
    const notes = uniqNotes(ps.rows ? ps.rows.flatMap((r: Row) => [r.st.adrMsg, r.st.info]) : [st.adrMsg, st.info], '');
    const tel = st.tel || [], mob = tel.find((t: any) => isMobile(t.num));
    const picks = pl ? pl.rows.filter(r => r.kind === 'pickup' && r.state === 'act') : [];
    const drops = pl ? pl.rows.filter(r => r.kind === 'drop' && r.state === 'act') : [];
    const close = () => setPlaceSheet(null);
    // Avisering: närmaste som inte är gjord.
    const av = pl ? pl.rows.filter(r => r.kind === 'drop').map(r => ({r, a: r.st.avise})).find(x => x.a && !(ost[x.r.cid] || {}).avisedAt) : null;
    const avAt = av && av.r.plan && av.r.plan.eta ? new Date(new Date(av.r.plan.eta).getTime() - av.a.min * 60000) : null;
    return (
      <Sheet open onClose={close} scroll>
        <Text style={[o.vb, {color: C.faint}]}>{ps.role}</Text>
        <Text style={o.rsTitle}>{pl ? titleOf(pl) : placeName(st)}</Text>
        <Text style={o.rsAdr}>{[st.adr, st.zip, st.area].filter(Boolean).join(', ')}</Text>
        {st.code ? <View style={o.codeRow}><Bi n="key-fill" size={15} color={C.accentInk} /><Text style={o.codeV}>{st.code}</Text><Text style={o.codeL}>PORTKOD</Text></View> : null}
        {avAt ? (
          <Pressable style={[o.avise, now >= avAt.getTime() && o.aviseDue]} onPress={() => { if (av!.a.who) dial(av!.a.who.num); onAvised(av!.r.cid); }}>
            <Bi n="bell-fill" size={15} color={now >= avAt.getTime() ? '#000000' : C.accentInk} />
            <Text style={[o.aviseT, {flex: 1}, now >= avAt.getTime() && {color: '#000000'}]} numberOfLines={1}>{now >= avAt.getTime() ? 'Avisera nu' : `Avisera kl ${hhmm(avAt)}`}{av!.a.who ? ` · ${av!.a.who.label}` : ''}</Text>
            <Text style={[o.aviseT, now >= avAt.getTime() && {color: '#000000'}]}>{av!.a.who ? 'Ring' : 'Klar'}</Text>
          </Pressable>
        ) : null}
        {picks.length ? (
          // Vid hämtning frågar de "vad ska du hämta och vart ska det?" – svaret står här direkt.
          <View style={o.kv}>
            <Text style={[o.vb, {color: C.faint, marginBottom: 2}]}>SKA TILL</Text>
            {picks.map((r, i) => { const ot = otherOf(r), q = qty(r); return (
              <Pressable key={k(r)} style={[o.toRow, i > 0 && o.kvLine]} onPress={() => { close(); setOpenRow(r); }} android_ripple={{color: C.edge}}>
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={o.toName} numberOfLines={2}>{ot ? placeName(ot) : goodsOf(r) || '—'}</Text>
                  <Text style={o.toAdr} numberOfLines={2}>{ot ? [ot.adr, [ot.zip, ot.area].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'adressen saknas i ordern' : ''}</Text>
                  {r.st.orderNo ? <Text style={o.mono}>order {r.st.orderNo}{r.st.freightBill && r.st.freightBill !== r.st.orderNo ? `  ·  fraktsedel ${r.st.freightBill}` : ''}</Text> : null}
                </View>
                {q ? <View style={o.jq}><Text style={o.jqN}>{q.n}</Text><Text style={o.jqU}>{q.u.toUpperCase()}</Text></View> : null}
                <Bi n="chevron-right" size={13} color={C.faint} />
              </Pressable>
            ); })}
          </View>
        ) : null}
        {drops.length ? (
          // Lämna här: varje order går att trycka på → hela ordern.
          <View style={o.kv}>
            <Text style={[o.vb, {color: C.faint, marginBottom: 2}]}>LÄMNA HÄR</Text>
            {drops.map((r, i) => { const ot = otherOf(r), q = qty(r); return (
              <Pressable key={k(r)} style={[o.toRow, i > 0 && o.kvLine]} onPress={() => { close(); setOpenRow(r); }} android_ripple={{color: C.edge}}>
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={o.toName} numberOfLines={2}>{r.st.who || goodsOf(r) || '—'}</Text>
                  <Text style={o.toAdr} numberOfLines={2}>{[goodsOf(r), ot ? `från ${placeName(ot)}` : ''].filter(Boolean).join(' · ')}</Text>
                  {r.st.orderNo ? <Text style={o.mono}>order {r.st.orderNo}</Text> : null}
                </View>
                {q ? <View style={o.jq}><Text style={o.jqN}>{q.n}</Text><Text style={o.jqU}>{q.u.toUpperCase()}</Text></View> : null}
                <Bi n="chevron-right" size={13} color={C.faint} />
              </Pressable>
            ); })}
          </View>
        ) : null}
        {notes.length > 0 && <View style={o.info}><Bi n="info-circle" size={15} color={C.dim} style={{marginTop: 1}} /><Text style={o.infoTxt}>{notes.join('\n\n')}</Text></View>}
        {peopleRows(st)}
        <View style={o.rsBtns}>
          <Pressable style={[o.bigBtn, {backgroundColor: C.accent}]} onPress={() => { close(); navigate(st); }} onLongPress={() => { close(); setNavFor(st); }}><Bi n="cursor-fill" size={16} color="#000000" /><Text style={[o.bigBtnT, {color: '#000000'}]}>Navigera</Text></Pressable>
          <Pressable style={[o.bigBtn, {backgroundColor: C.panel2}]} onPress={() => { close(); setTell({text: tellText(pl, st), mob, who: placeName(st)}); }}><Bi n="megaphone-fill" size={15} color={C.people} /><Text style={o.bigBtnT}>Säg till</Text></Pressable>
          {picks.length ? <Pressable style={[o.bigBtn, {backgroundColor: C.panel2}]} onPress={() => { close(); setShop(picks); }}><Bi n="display" size={15} color={C.ink} /><Text style={o.bigBtnT}>Butiken</Text></Pressable> : null}
        </View>
        <Pressable style={{alignSelf: 'center', paddingVertical: 12}} onPress={() => { close(); setNavFor(st); }}>
          <Text style={o.link}>Öppna i annan kartapp</Text>
        </Pressable>
      </Sheet>
    );
  };
  // "Säg till": färdig text om vad du hämtar/lämnar här.
  const tellText = (pl: JPlace | undefined, st: any) => {
    const rs = pl ? pl.rows.filter(r => r.state === 'act') : [];
    const picks = rs.filter(r => r.kind === 'pickup'), drops = rs.filter(r => r.kind === 'drop');
    const what = [drops.length ? `lämnar ${qtyTxt(sumQty(drops)) || (drops.length > 1 ? drops.length + ' order' : 'leveransen')}` : '', picks.length ? `hämtar ${qtyTxt(sumQty(picks)) || (picks.length > 1 ? picks.length + ' order' : 'godset')}` : ''].filter(Boolean).join(' och ');
    const where = [st.who, st.adr, st.area].filter(Boolean).filter((x: string, i: number, a: string[]) => a.indexOf(x) === i).join(', ');
    const nos = [...new Set(rs.map(r => r.st.orderNo).filter(Boolean).map(String))];
    const t = `Jag ${what || 'är'} hos ${where || placeName(st)}.` + (nos.length ? ` Order ${nos.join(', ')}.` : '');
    return t.charAt(0).toUpperCase() + t.slice(1);
  };

  // ---- Siffrorna överst ----
  const left = rows; const cidsLeft = new Set(left.map(r => r.cid));
  const leftQ = sumQty(left.filter(r => r.kind === 'drop'));
  const strip = (
    <View style={o.strip}>
      <View style={o.stat}><Text style={o.statN}>{cidsLeft.size}</Text><Text style={o.statL}>ORDER KVAR</Text></View>
      <View style={o.stat}><Text style={o.statN}>{leftQ.kli || leftQ.pal || 0}</Text><Text style={o.statL}>{leftQ.kli ? 'KOLLI KVAR' : 'PALL KVAR'}</Text></View>
      <View style={o.stat}><Text style={o.statN}>{places.length}</Text><Text style={o.statL}>STOPP KVAR</Text></View>
      {onScan ? <Pressable style={o.stripBtn} hitSlop={6} onPress={onScan}><Bi n="upc-scan" size={15} color={C.ink} /><Text style={o.stripBtnT}>Skanna</Text></Pressable> : null}
      {onReorder && places.length > 1 ? <Pressable style={o.stripBtn} hitSlop={6} onPress={() => setReorder(true)}><Bi n="list-ul" size={16} color={C.ink} /><Text style={o.stripBtnT}>Ordning</Text></Pressable> : null}
    </View>
  );
  const selBar = (
    <View style={o.selBar}>
      <Pressable hitSlop={12} onPress={exitSel} style={{paddingRight: 6}}><Bi n="x-lg" size={18} color={C.ink} /></Pressable>
      <Text style={o.selN}>{selRows.length} valda</Text>
      <Pressable hitSlop={10} onPress={selectAll}><Text style={o.selAll}>Markera alla</Text></Pressable>
    </View>
  );
  // ---- Nere: nästa stopp, eller knapparna när du markerat ----
  // Tryck på ett stopp: en order → hela ordern direkt. Flera → stoppet, där varje order går att trycka på.
  const openPlace = (pl: JPlace) => {
    const act = pl.rows.filter(r => r.state === 'act');
    const rs = act.length ? act : pl.rows;
    if (rs.length === 1) { setOpenRow(rs[0]); return; }
    const hasP = act.some(r => r.kind === 'pickup'), hasD = act.some(r => r.kind === 'drop');
    setPlaceSheet({st: pl.st, role: hasP && !hasD ? 'HÄMTA HÄR' : 'LÄMNA HÄR', rows: pl.rows, pl});
  };
  const nextDock = () => {
    const pl = nextPl; if (!pl) return null;
    const st = pl.st, tel = st.tel || [];
    const dr = pl.rows.filter(r => r.kind === 'drop' && canAct(r)), pk = pl.rows.filter(r => r.kind === 'pickup' && canAct(r));
    return (
      <View style={[o.dock2, {paddingBottom: 10}]}>
        <View style={o.dockHead}>
          <Pressable style={{flex: 1, minWidth: 0}} hitSlop={8} onPress={() => openPlace(pl)}>
            <Text style={o.dockL} numberOfLines={1}>NÄSTA  <Text style={o.dockN}>{titleOf(pl)}</Text>  <Text style={o.dockMore}>visa ›</Text></Text>
          </Pressable>
          <Pressable style={o.sqSm} onPress={() => navigate(st)} onLongPress={() => setNavFor(st)}><Bi n="cursor-fill" size={16} color="#000000" /></Pressable>
          <Pressable disabled={!tel.length} style={[o.sqSm, {backgroundColor: C.peopleSoft}, !tel.length && {opacity: 0.35}]} onPress={() => (tel.length === 1 ? dial(tel[0].num) : setCallStop(st))}><Bi n="telephone-fill" size={16} color={C.people} /></Pressable>
        </View>
        {/* På timme nere vid reglaget bara när det berör stoppet (valt Ja, eller ordern nämner timmar) – annars i ordern */}
        {(() => { const sts = (dr.length ? dr : pk).filter(r => !r.st.own || r.st.parent).map(r => r.st); return timOf && sts.some(x => timOf(x).on || timOf(x).auto) ? timSeg(sts) : null; })()}
        {dr.length ? <Slider key={'d' + pl.key + dr.length} label={`Dra för Lossad${dr.length > 1 ? ` · ${dr.length}` : ''}`} tone="ok" onDone={() => doPlace(pl, 'drop')} /> : null}
        {pk.length ? <Slider style={dr.length ? {marginTop: 8} : undefined} key={'p' + pl.key + pk.length} label={`Dra för Lastad${pk.length > 1 ? ` · ${pk.length}` : ''}`} tone="go" onDone={() => doPlace(pl, 'pickup')} /> : null}
      </View>
    );
  };
  const selDock = (
    <View style={[o.dock2, o.selDock]}>
      {nP ? <Pressable style={[o.bigBtn, {backgroundColor: C.accent, flex: 1}]} onPress={() => doGo('pickup')}><Text style={[o.bigBtnT, {color: '#000000'}]}>Lastad · {nP}</Text></Pressable> : null}
      {nD ? <Pressable style={[o.bigBtn, {backgroundColor: C.accent2, flex: 1}]} onPress={() => doGo('drop')}><Text style={[o.bigBtnT, {color: '#FFFFFF'}]}>Lossad · {nD}</Text></Pressable> : null}
      {!nP && !nD ? <View style={[o.bigBtn, {backgroundColor: C.panel2, flex: 1}]}><Text style={[o.bigBtnT, {color: C.faint}]}>Välj order</Text></View> : null}
    </View>
  );

  return (
    <View style={{flex: 1}}>
      {selMode ? selBar : (places.length ? strip : null)}
      <ScrollView style={{flex: 1}} contentContainerStyle={{paddingHorizontal: 12, paddingBottom: 18}} keyboardShouldPersistTaps="handled">
        {places.length ? places.map(placeBlock) : (
          <View style={o.allDoneBox}>
            <Bi n="check2-all" size={40} color={C.accent2} />
            <Text style={o.allDoneBig}>Allt klart</Text>
            <Text style={o.allDone}>Det du gjort finns under Klart – där kan du ändra i efterhand.</Text>
            {onScan ? <Pressable style={[o.stripBtn, {marginTop: 14, height: 44, paddingHorizontal: 16}]} onPress={onScan}><Bi n="upc-scan" size={16} color={C.ink} /><Text style={o.stripBtnT}>Skanna sedel eller turlista</Text></Pressable> : null}
          </View>
        )}
        {laterOrders.length ? (
          <View style={{marginTop: 20}}>
            <View style={o.sh}><Text style={[o.vb, {color: C.faint}]}>SENARE DAGAR</Text><View style={{flex: 1}} /><Text style={o.shQty}>{laterOrders.length} order</Text></View>
            <View style={o.jg}>
              {laterOrders.map((g: any) => (
                <Pressable key={g.cid} style={o.jr} onPress={() => setPlanned(g)} android_ripple={{color: C.edge}}>
                  <View style={o.mk} />
                  <View style={{flex: 1, minWidth: 0}}>
                    <Text style={o.jt1} numberOfLines={1}>{[g.pick && g.pick.who, g.drop && g.drop.who].filter(Boolean).join('  →  ') || '—'}</Text>
                    <Text style={o.jt2} numberOfLines={1}>{[g.pick && `Hämta ${when(g.pick)}`, g.drop && `Lämna ${when(g.drop)}`].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <Bi n="chevron-right" size={13} color={C.faint} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
      {selMode ? selDock : nextDock()}

      {rowSheet()}
      {shopView()}
      {placeSheetView()}
      <CallSheet st={callStop} onClose={() => setCallStop(null)} />
      <SmsSheet to={sms} onClose={() => setSms(null)} />
      <TellSheet t={tell} targets={tellTo} onClose={() => setTell(null)} onSend={(id, text) => { setTell(null); onTell && onTell(id, text); }} onSms={(num, text) => { setTell(null); Linking.openURL(`sms:${num}?body=${encodeURIComponent(text)}`).catch(() => {}); }} />
      <NavSheet st={navFor} onClose={() => setNavFor(null)} />
      {onReorder ? <ReorderSheet open={reorder} items={(route.order || []).map((s: any, i: number) => ({key: s.pickup ? 'p' + s.pickup : 'd' + s.drop, kind: s.pickup ? 'pickup' : 'drop', cid: s.pickup || s.drop, st: s, plan: (route.plan.rows || [])[i]}))} manual={!!route.manual} onClose={() => setReorder(false)} onSave={keys => { setReorder(false); onReorder(keys); }} /> : null}
      <Sheet open={!!addNum} onClose={() => setAddNum(null)} title="Lägg till nummer på jobbet" sub="Syns under Ring på stoppet så länge ordern finns">
        {addNum ? (
          <View style={{gap: 8, marginTop: 4}}>
            <TextInput style={o.numIn} value={addNum.label} onChangeText={t => setAddNum({...addNum, label: t})} placeholder="Namn, t.ex. Katta Stena" placeholderTextColor={C.faint} />
            <TextInput style={[o.numIn, o.mono, {fontSize: 16}]} value={addNum.num} onChangeText={t => setAddNum({...addNum, num: t})} placeholder="Nummer" placeholderTextColor={C.faint} keyboardType="phone-pad" />
            <Pressable style={[o.bigBtn, {backgroundColor: C.accent}, String(addNum.num).replace(/\D/g, '').length < 6 && {opacity: 0.4}]} disabled={String(addNum.num).replace(/\D/g, '').length < 6}
              onPress={() => { onAddNum && onAddNum(addNum.cid, {label: addNum.label.trim() || 'Nummer', num: addNum.num.replace(/[^0-9+]/g, '')}); setAddNum(null); }}>
              <Text style={[o.bigBtnT, {color: '#000000'}]}>Spara på jobbet</Text>
            </Pressable>
          </View>
        ) : null}
      </Sheet>
      <Sheet open={!!planned} onClose={() => setPlanned(null)} scroll>
        {planned ? (
          <View>
            <Text style={[o.vb, {color: C.faint}]}>PLANERAD ORDER{(planned.pick || planned.drop || {}).orderNo ? `  ·  ${(planned.pick || planned.drop).orderNo}` : ''}</Text>
            {[planned.pick, planned.drop].filter(Boolean).map((s: any) => (
              <View key={s.pickup ? 'p' : 'd'} style={{marginTop: 10}}>
                <Text style={[o.vb, {color: s.pickup ? C.accentInk : C.accent2}]}>{s.pickup ? 'HÄMTA' : 'LÄMNA'}  <Text style={{color: C.dim}}>{when(s)}</Text></Text>
                <Text style={o.rsTitle}>{s.who || '—'}</Text>
                <Text style={o.rsAdr}>{[s.adr, s.area].filter(Boolean).join(', ')}</Text>
                {peopleRows(s)}
              </View>
            ))}
            {planned.pick ? <View style={{marginTop: 12}}><Slider label="Dra för Lastad nu" tone="go" onDone={() => { const p0 = planned.pick; setPlanned(null); onLoaded(p0); }} /></View> : null}
            <Text style={o.plannedNote}>Planerad {when(planned.pick || planned.drop) || 'senare'} – men det är du som bestämmer. Kan du lasta tidigare drar du bara Lastad.</Text>
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

function CallSheet({st, onClose}: {st: any; onClose: () => void}) {
  return (
    <Sheet open={!!st} onClose={onClose} title="Ring" sub={st ? st.who : ''}>
      {st && (st.tel || []).map((t: any) => (
        <Pressable key={t.num} style={o.callRow} onPress={() => { onClose(); dial(t.num); }}>
          <Face label={t.label} />
          <View style={{flex: 1}}>
            <Text style={o.callLabel}>{t.label}</Text>
            <Text style={o.callNum}>{prettyPhone(t.num)}</Text>
          </View>
          <Bi n="telephone-fill" size={20} color={C.people} />
        </Pressable>
      ))}
    </Sheet>
  );
}

const o = themed(() => StyleSheet.create({

  // ---- Jobblistan (A) ----
  mono: {fontFamily: FONT.mono, fontSize: 12.5, color: C.faint},
  tp: {color: C.accentInk, fontWeight: '700'},
  strip: {flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginBottom: 6, backgroundColor: C.panel, borderRadius: R},
  stat: {flex: 1, paddingVertical: 7, paddingHorizontal: 10},
  statN: {color: C.ink, fontFamily: FONT.cond, fontSize: 19, fontWeight: '700', lineHeight: 21},
  statL: {color: C.faint, fontFamily: FONT.cond, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.8},
  stripBtn: {flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 34, marginRight: 6, borderRadius: R, backgroundColor: C.panel2},
  stripBtnT: {color: C.ink, fontFamily: FONT.cond, fontSize: 13.5, fontWeight: '600'},
  selBar: {flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginBottom: 6, height: 46, paddingHorizontal: 12, borderRadius: R, backgroundColor: C.accentSoft},
  selN: {flex: 1, color: C.ink, fontFamily: FONT.cond, fontSize: 18, fontWeight: '700'},
  selAll: {color: C.accentInk, fontFamily: FONT.cond, fontSize: 15, fontWeight: '700'},
  sh: {flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6, paddingHorizontal: 2},
  ix: {minWidth: 24, height: 24, borderRadius: 4, paddingHorizontal: 5, backgroundColor: C.edge, alignItems: 'center', justifyContent: 'center'},
  ixNext: {backgroundColor: C.accent},
  ixT: {color: C.dim, fontFamily: FONT.cond, fontSize: 13.5, fontWeight: '700'},
  vb: {fontFamily: FONT.cond, fontSize: 12.5, fontWeight: '700', letterSpacing: 1.1},
  shName: {flex: 1, color: C.ink, fontFamily: FONT.cond, fontSize: 16.5, fontWeight: '600'},
  shMeta: {color: C.dim, fontSize: 12.5, marginTop: 1},
  shQty: {color: C.dim, fontFamily: FONT.cond, fontSize: 14, fontWeight: '600'},
  allBtn: {paddingHorizontal: 12, height: 30, borderRadius: R, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center'},
  allTxt: {color: C.accentInk, fontFamily: FONT.cond, fontSize: 14, fontWeight: '700'},
  jg: {backgroundColor: C.panel, borderRadius: R, overflow: 'hidden'},
  jr: {flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 54, paddingVertical: 7, paddingHorizontal: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.edge, marginTop: -StyleSheet.hairlineWidth},
  jrOn: {backgroundColor: C.accentSoft},
  mk: {width: 8, height: 8, borderRadius: 2, backgroundColor: C.edge},
  mkP: {backgroundColor: C.accent},
  mkD: {backgroundColor: C.accent2},
  jck: {width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: C.faint, alignItems: 'center', justifyContent: 'center'},
  jckOn: {backgroundColor: C.accent, borderColor: C.accent},
  jt1: {color: C.ink, fontFamily: FONT.cond, fontSize: 16.5, fontWeight: '600'},
  jt2: {color: C.dim, fontSize: 13, marginTop: 1},
  jq: {alignItems: 'flex-end', minWidth: 40},
  jqN: {color: C.ink, fontFamily: FONT.cond, fontSize: 17, fontWeight: '700', lineHeight: 19},
  jqU: {color: C.faint, fontFamily: FONT.cond, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.6},
  rsTitle: {color: C.ink, fontFamily: FONT.cond, fontSize: 25, fontWeight: '700', lineHeight: 28, marginTop: 2},
  rsAdr: {color: C.dim, fontSize: 14.5, marginTop: 2},
  tpBox: {flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.accent, borderRadius: R, paddingHorizontal: 10, paddingVertical: 8, marginTop: 10},
  tpBoxT: {color: '#000000', fontFamily: FONT.cond, fontSize: 16, fontWeight: '700'},
  codeRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10},
  codeV: {color: C.ink, fontFamily: FONT.mono, fontSize: 22, fontWeight: '600', letterSpacing: 2},
  codeL: {color: C.faint, fontFamily: FONT.cond, fontSize: 11.5, fontWeight: '700', letterSpacing: 1},
  kv: {marginTop: 10},
  lgs: {marginTop: 4, backgroundColor: C.panel2, borderRadius: R, paddingHorizontal: 10},
  lg: {flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 9},
  lgK: {fontFamily: FONT.cond, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.8, width: 70, marginTop: 3},
  lgWho: {color: C.ink, fontFamily: FONT.cond, fontSize: 17, fontWeight: '700', lineHeight: 20},
  lgAdr: {color: C.dim, fontSize: 13.5, marginTop: 1},
  lgMeta: {color: C.faint, fontSize: 12.5, marginTop: 2},
  lgNav: {width: 40, height: 40, borderRadius: R, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center'},
  lgTel: {width: 40, height: 40, borderRadius: R, backgroundColor: C.peopleSoft, alignItems: 'center', justifyContent: 'center'},
  tim: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8},
  timRow: {flexDirection: 'row', gap: 8, marginTop: 2},
  clkL: {color: C.dim, fontSize: 12.5, fontWeight: '700'},
  clkNow: {color: C.accentInk, fontFamily: FONT.cond, fontSize: 14, fontWeight: '700'},
  clk: {backgroundColor: C.panel, borderRadius: R, borderWidth: 1, borderColor: C.edge, height: 42, marginTop: 3, alignItems: 'center', justifyContent: 'center'},
  clkT: {color: C.ink, fontFamily: FONT.cond, fontSize: 20, fontWeight: '700'},
  timSum: {color: C.ink, fontFamily: FONT.cond, fontSize: 15.5, fontWeight: '700', textAlign: 'right'},
  timBig: {backgroundColor: C.panel2, borderRadius: R, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8, marginTop: 10},
  timL: {color: C.ink, fontFamily: FONT.cond, fontSize: 15.5, fontWeight: '700'},
  timS: {color: C.dim, fontSize: 12.5},
  seg: {flexDirection: 'row', backgroundColor: C.panel2, borderRadius: R, padding: 3, gap: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: C.edge},
  segB: {minWidth: 52, height: 34, borderRadius: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10},
  segOnY: {backgroundColor: C.accent},
  segOnN: {backgroundColor: C.panel},
  segT: {color: C.dim, fontFamily: FONT.cond, fontSize: 15.5, fontWeight: '700'},
  fullTxt: {backgroundColor: C.noteBg, borderRadius: R, paddingHorizontal: 11, paddingVertical: 10, marginTop: 10},
  fullK: {color: C.faint, fontFamily: FONT.cond, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 3},
  fullV: {color: C.noteInk, fontSize: 15, lineHeight: 21},
  dockMore: {color: C.accentInk, fontFamily: FONT.cond, fontSize: 13.5, fontWeight: '700', letterSpacing: 0},
  timBox: {flexDirection: 'row', gap: 8, backgroundColor: C.accentSoft, borderRadius: R, paddingHorizontal: 10, paddingVertical: 9, marginTop: 10},
  timT: {color: C.ink, fontSize: 13.5, lineHeight: 19, flex: 1},
  scanRow: {flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: C.accent, borderRadius: R, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8},
  scanT: {color: C.accentInk, fontFamily: FONT.cond, fontSize: 16.5, fontWeight: '700'},
  scanS: {color: C.dim, fontSize: 12.5, marginTop: 1},
  kvRow: {flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 9},
  kvLine: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.edge},
  kvK: {color: C.dim, fontSize: 14, minWidth: 82},
  toRow: {flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 9},
  toName: {color: C.ink, fontFamily: FONT.cond, fontSize: 18, fontWeight: '700', lineHeight: 21},
  toAdr: {color: C.dim, fontSize: 14, marginTop: 1},
  kvV: {color: C.ink, fontSize: 14.5, fontWeight: '600', flexShrink: 1, textAlign: 'right'},
  addNum: {flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 8},
  addNumT: {color: C.accentInk, fontFamily: FONT.cond, fontSize: 14.5, fontWeight: '700'},
  rsBtns: {flexDirection: 'row', gap: 6, marginTop: 12},
  sqBtn: {width: 50, height: 50, borderRadius: R, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center'},
  sqSm: {width: 44, height: 44, borderRadius: R, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center'},
  bigBtn: {flex: 1, height: 50, borderRadius: R, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10},
  bigBtnT: {color: C.ink, fontFamily: FONT.cond, fontSize: 17, fontWeight: '700'},
  moreRow: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, marginTop: 4},
  moreRowT: {color: C.dim, fontSize: 13.5, fontWeight: '600'},
  dock2: {paddingHorizontal: 12, paddingTop: 8, backgroundColor: C.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.edge},
  selDock: {flexDirection: 'row', gap: 6, paddingBottom: 10},
  dockHead: {flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8},
  dockL: {flex: 1, color: C.faint, fontFamily: FONT.cond, fontSize: 12.5, fontWeight: '700', letterSpacing: 1},
  dockN: {color: C.ink, fontFamily: FONT.cond, fontSize: 16.5, fontWeight: '600', letterSpacing: 0},
  numIn: {backgroundColor: C.panel2, color: C.ink, borderRadius: R, paddingHorizontal: 12, height: 48, fontSize: 16},
  shop: {flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 18},
  shopK: {color: '#7e8794', fontFamily: FONT.cond, fontSize: 13, fontWeight: '700', letterSpacing: 1.4},
  shopH: {color: '#0b0f14', fontFamily: FONT.cond, fontSize: 30, fontWeight: '700', lineHeight: 33, marginTop: 2, marginBottom: 10},
  shopRow: {flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#e4e7eb'},
  shopNo: {color: '#0b0f14', fontFamily: FONT.mono, fontSize: 15, fontWeight: '600'},
  shopNo2: {color: '#7e8794', fontFamily: FONT.mono, fontSize: 11.5, marginTop: 2},
  shopTo: {color: '#0b0f14', fontFamily: FONT.cond, fontSize: 19, fontWeight: '700', lineHeight: 21},
  shopAdr: {color: '#465361', fontSize: 13.5, marginTop: 1},
  shopQ: {color: '#0b0f14', fontFamily: FONT.cond, fontSize: 21, fontWeight: '700'},
  shopU: {color: '#7e8794', fontSize: 13, fontWeight: '600'},
  shopTot: {flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 2, borderTopColor: '#0b0f14', paddingTop: 8, marginTop: 2},
  shopTotT: {color: '#0b0f14', fontFamily: FONT.cond, fontSize: 21, fontWeight: '700'},
  shopClose: {height: 52, borderRadius: R, backgroundColor: '#f0f2f5', alignItems: 'center', justifyContent: 'center', marginTop: 10},
  shopCloseT: {color: '#0b0f14', fontFamily: FONT.cond, fontSize: 18, fontWeight: '700'},
  hero: {backgroundColor: C.panel, borderColor: C.edge, borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 6},
  headRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  verb: {flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4},
  verbTxt: {fontSize: 11.5, fontWeight: '900', letterSpacing: 1.2},
  num: {color: C.faint, fontSize: 12.5, fontWeight: '700'},
  lateTag: {backgroundColor: C.badSoft, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3},
  lateTxt: {color: C.bad, fontSize: 11.5, fontWeight: '800'},
  moreBtn: {flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.panel2, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 9},
  moreN: {color: C.accentInk, fontSize: 12, fontWeight: '800'},
  who: {color: C.ink, fontSize: 24, fontWeight: '800', marginTop: 2, letterSpacing: -0.2},
  adrRow: {flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3},
  adr: {color: C.dim, fontSize: 14.5, flex: 1},
  facts: {flexDirection: 'row', gap: 6, marginTop: 14},
  fact: {flex: 1, backgroundColor: C.panel2, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 10, minWidth: 0},
  factHot: {backgroundColor: C.accent},
  factK: {color: C.faint, fontSize: 11, fontWeight: '600'},
  factV: {color: C.ink, fontSize: 19, fontWeight: '800', marginTop: 2},
  meta: {color: C.faint, fontSize: 12, marginTop: 8},
  syncRow: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8},
  sync: {fontSize: 12, fontWeight: '700', flexShrink: 1},
  ownTag: {color: C.people, fontSize: 11, fontWeight: '900', letterSpacing: 0.6},
  avise: {flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, backgroundColor: C.accentSoft, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12},
  aviseDue: {backgroundColor: C.accent},
  aviseT: {color: C.accentInk, fontSize: 15, fontWeight: '800'},
  aviseS: {color: C.dim, fontSize: 12, marginTop: 2},
  aviseCall: {color: C.accentInk, fontSize: 15, fontWeight: '900'},
  info: {flexDirection: 'row', gap: 8, backgroundColor: C.noteBg, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 11, marginTop: 12},
  infoTxt: {color: C.noteInk, fontSize: 13.5, lineHeight: 19, flex: 1},
  orderLine: {color: C.faint, fontSize: 12, marginTop: 10, fontWeight: '600'},
  people: {marginTop: 14, gap: 8},
  person: {flexDirection: 'row', alignItems: 'center', gap: 10},
  avatar: {width: 36, height: 36, borderRadius: 18, backgroundColor: C.peopleSoft, alignItems: 'center', justifyContent: 'center'},
  avatarTxt: {color: C.people, fontSize: 13, fontWeight: '800'},
  pName: {color: C.ink, fontSize: 14.5, fontWeight: '700'},
  pNum: {color: C.faint, fontSize: 12, marginTop: 1},
  pBtn: {width: 42, height: 42, borderRadius: 21, backgroundColor: C.peopleSoft, alignItems: 'center', justifyContent: 'center'},
  nav: {flexDirection: 'row', alignItems: 'stretch', marginTop: 16, backgroundColor: C.panel2, borderRadius: 12, overflow: 'hidden'},
  navMain: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12},
  navIco: {width: 38, height: 38, borderRadius: 19, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center'},
  navTxt: {color: C.ink, fontSize: 16, fontWeight: '800'},
  navSub: {color: C.faint, fontSize: 12, marginTop: 1},
  navMore: {width: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: C.panel2},
  link: {color: C.accentInk, fontSize: 13.5, fontWeight: '700'},
  restHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, paddingBottom: 6, paddingHorizontal: 2},
  restTitle: {color: C.ink, fontSize: 15, fontWeight: '800'},
  restSum: {color: C.faint, fontSize: 12, fontWeight: '600'},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 12, marginTop: 6},
  rowIco: {width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center'},
  rowWho: {color: C.ink, fontSize: 15, fontWeight: '700'},
  rowMeta: {color: C.faint, fontSize: 12, marginTop: 1},
  rowEta: {color: C.dim, fontSize: 14, fontWeight: '800'},
  allDoneBox: {alignItems: 'center', gap: 10, marginTop: 40},
  allDone: {color: C.dim, fontSize: 15, textAlign: 'center'},
  leg: {marginTop: 14},
  legWhen: {color: C.ink, fontSize: 14, fontWeight: '800'},
  legNav: {width: 34, height: 34, borderRadius: 17, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center'},
  legWho: {color: C.ink, fontSize: 19, fontWeight: '800', marginTop: 8},
  codeChip: {flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: C.accent, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5, marginTop: 8},
  codeTxt: {color: C.onAccent, fontSize: 13.5, fontWeight: '800', letterSpacing: 0.5},
  reBtn: {flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.panel2, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10},
  reTxt: {color: C.ink, fontSize: 12.5, fontWeight: '700'},
  thenRow: {flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, backgroundColor: C.panel2, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 10},
  thenLbl: {color: C.faint, fontSize: 11.5, fontWeight: '700'},
  thenWho: {color: C.ink, fontSize: 14.5, fontWeight: '700', marginTop: 1},
  grp: {marginTop: 12, backgroundColor: C.panel2, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, gap: 8},
  grpHead: {color: C.dim, fontSize: 12.5, fontWeight: '800'},
  grpTxt: {color: C.ink, fontSize: 14, fontWeight: '600', flex: 1},
  legLbl: {color: C.faint, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 12},
  thenMore: {color: C.accentInk, fontSize: 12, fontWeight: '700', marginTop: 3},
  thenNav: {width: 36, height: 36, borderRadius: 18, backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center'},
  signBtn: {flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, backgroundColor: C.peopleSoft, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14},
  signTxt: {color: C.people, fontSize: 15, fontWeight: '800', flex: 1},
  signSub: {color: C.people, fontSize: 12, fontWeight: '600', opacity: 0.8},
  heroTop: {flexDirection: 'row', alignItems: 'flex-start', gap: 12},
  nextBdg: {backgroundColor: C.ink, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2},
  nextTxt: {color: C.bg, fontSize: 10.5, fontWeight: '900', letterSpacing: 1},
  pn: {color: C.ink, fontSize: 22, fontWeight: '800', marginTop: 6, letterSpacing: -0.2},
  pa: {color: C.dim, fontSize: 14, marginTop: 2},
  gpsBig: {width: 56, height: 56, borderRadius: 28, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4},
  gpsSm: {width: 38, height: 38, borderRadius: 19, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center'},
  step: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, flexWrap: 'wrap'},
  code: {flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.panel2, borderRadius: 16, paddingHorizontal: 11, height: 32},
  codeT: {color: C.ink, fontSize: 15, fontWeight: '900', letterSpacing: 1.5},
  moreDrop: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: C.edge, backgroundColor: C.panel2},
  moreDropT: {flex: 1, color: C.ink, fontSize: 13.5, fontWeight: '800'},
  chipBtn: {flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.panel2, borderRadius: 16, paddingHorizontal: 11, height: 32},
  chipTxt: {color: C.ink, fontSize: 13, fontWeight: '700', maxWidth: 110},
  secLbl: {color: C.faint, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 14, marginBottom: 2},
  ord: {flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel2, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginTop: 6},
  ck: {width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: C.edge, alignItems: 'center', justifyContent: 'center', backgroundColor: C.panel},
  ckOn: {backgroundColor: C.accent2, borderColor: C.accent2},
  ckPart: {borderColor: C.accent2},
  ordT: {color: C.ink, fontSize: 14.5, fontWeight: '700'},
  ordNo: {color: C.faint, fontSize: 12, fontWeight: '600'},
  ordS: {color: C.dim, fontSize: 12, marginTop: 2},
  ordSB: {color: C.ink, fontWeight: '700'},
  grpBox: {backgroundColor: C.panel2, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginTop: 6},
  grpRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  reqTag: {backgroundColor: C.accent, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2},
  reqTxt: {color: C.onAccent, fontSize: 10, fontWeight: '900', letterSpacing: 0.8},
  markHead: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6},
  markBox: {backgroundColor: C.panel, borderRadius: 12, padding: 10, marginTop: 8},
  bar: {position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.panel, borderTopColor: C.edge, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingTop: 10},
  barCnt: {color: C.dim, fontSize: 13, fontWeight: '800', flex: 1},
  barBtn: {height: 46, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center'},
  barTxt: {fontSize: 15, fontWeight: '800'},
  plannedNote: {color: C.faint, fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 6, lineHeight: 17},
  backDrive: {flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingVertical: 8, marginBottom: 4},
  backDriveTxt: {color: C.dim, fontSize: 13, fontWeight: '700'},
  // A · Fokus
  fBar: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 2, paddingBottom: 6},
  fArrow: {width: 38, height: 38, borderRadius: 19, backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center'},
  fCount: {alignItems: 'center', gap: 4, paddingHorizontal: 4},
  fCountTxt: {color: C.dim, fontSize: 12, fontWeight: '700'},
  dots: {flexDirection: 'row', gap: 4},
  dot: {width: 6, height: 6, borderRadius: 3, backgroundColor: C.edge},
  dotOn: {width: 16, backgroundColor: C.ink},
  fTags: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12},
  fName: {color: C.ink, fontSize: 32, fontWeight: '900', lineHeight: 36, letterSpacing: -0.6, marginTop: 10},
  fAdr: {color: C.dim, fontSize: 17, marginTop: 4},
  fMeta: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8},
  fMetaTxt: {color: C.dim, fontSize: 13, fontWeight: '700'},
  fCode: {flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14},
  fCodeT: {color: C.ink, fontSize: 28, fontWeight: '900', letterSpacing: 3},
  fCodeL: {color: C.faint, fontSize: 11, fontWeight: '800', letterSpacing: 1},
  fNext: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingVertical: 6},
  fNextTxt: {color: C.dim, fontSize: 13, flex: 1},
  li: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomColor: C.edge, borderBottomWidth: StyleSheet.hairlineWidth},
  liT: {color: C.ink, fontSize: 15.5, fontWeight: '800'},
  liMore: {width: 38, height: 38, borderRadius: 19, backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center'},
  tellIn: {backgroundColor: C.panel2, color: C.ink, borderRadius: 12, padding: 12, fontSize: 16, fontWeight: '600', minHeight: 92, textAlignVertical: 'top', marginBottom: 6},
  tellRow: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: C.edge},
  tellIc: {width: 36, height: 36, borderRadius: 18, backgroundColor: C.peopleSoft, alignItems: 'center', justifyContent: 'center'},
  tellN: {color: C.ink, fontSize: 15, fontWeight: '800'},
  tellS: {color: C.dim, fontSize: 12.5, marginTop: 1},
  dock: {paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, backgroundColor: C.bg},
  dockRow: {flexDirection: 'row', gap: 8},
  round: {flex: 1, height: 54, borderRadius: 14, backgroundColor: C.panel, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3},
  roundTxt: {fontSize: 12.5, fontWeight: '800'},
  allDoneBig: {color: C.ink, fontSize: 26, fontWeight: '900'},
  // SMS
  sheetLbl: {color: C.dim, fontSize: 12, fontWeight: '600', marginTop: 6},
  minRow: {flexDirection: 'row', gap: 6, marginTop: 8, marginBottom: 6},
  minChip: {flex: 1, alignItems: 'center', backgroundColor: C.panel2, borderRadius: 8, paddingVertical: 9},
  minOn: {backgroundColor: C.accent},
  minTxt: {color: C.ink, fontSize: 13, fontWeight: '700'},
  tmpl: {flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel2, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 14, marginTop: 8},
  tmplTxt: {color: C.ink, fontSize: 14.5, flex: 1, lineHeight: 20},
  tmplOpen: {alignItems: 'center', paddingVertical: 14},
  tmplOpenTxt: {color: C.people, fontSize: 14, fontWeight: '700'},
  // Ring
  callRow: {flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel2, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 12, marginTop: 8},
  callLabel: {color: C.dim, fontSize: 12, fontWeight: '600'},
  callNum: {color: C.ink, fontSize: 17, fontWeight: '800', marginTop: 1},
  // Kör-läge
  drive: {flex: 1, paddingHorizontal: 20, paddingTop: 8},
  driveTop: {flexDirection: 'row', alignItems: 'center', gap: 10},
  chip: {flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.panel2, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5},
  driveSub: {color: C.faint, fontSize: 13, fontWeight: '600'},
  driveWho: {color: C.ink, fontSize: 34, fontWeight: '800', marginTop: 18, letterSpacing: -0.3},
  driveAdr: {color: C.dim, fontSize: 18, marginTop: 4},
  driveBigRow: {flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginBottom: 20},
  driveBig: {color: C.accentInk, fontSize: 112, fontWeight: '800', lineHeight: 112, letterSpacing: -2, includeFontPadding: false},
  driveBigTxt: {color: C.ink, fontSize: 19, lineHeight: 26, marginBottom: 12},
  driveBtns: {gap: 10},
  driveBtn: {flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 14, paddingVertical: 20, paddingHorizontal: 20},
  driveBtnGhost: {backgroundColor: C.panel, borderColor: C.edge, borderWidth: 1},
  driveBtnTxt: {color: C.ink, fontSize: 21, fontWeight: '800', flexShrink: 1},
  // Klart
  doneCard: {backgroundColor: C.panel, borderRadius: 12, padding: 14, marginBottom: 8},
  doneTop: {flexDirection: 'row', alignItems: 'center', gap: 8},
  doneTag: {fontSize: 11.5, fontWeight: '900', letterSpacing: 1.2},
  doneTime: {color: C.dim, fontSize: 14, fontWeight: '800'},
  doneWho2: {color: C.ink, fontSize: 17, fontWeight: '800', marginTop: 8},
  doneMeta: {color: C.faint, fontSize: 12, marginTop: 2},
  doneHint: {color: C.faint, fontSize: 12.5, lineHeight: 18, marginBottom: 10, marginTop: 2},
  doneEdit: {flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.panel2, borderRadius: 14, paddingHorizontal: 10, height: 28},
  doneEditTxt: {color: C.ink, fontSize: 12.5, fontWeight: '800'},
}));


/* ---- Klart: allt som är lossat (i RUTT eller i Opter). Tryck på en order = ändra i efterhand (som Opter). ---- */
export function DoneView({done, onRetry, onOpen}: {done: any[]; onRetry: (cid: string) => void; onOpen: (d: any) => void}) {
  const bottom = useSafeAreaInsets().bottom + 24;
  return (
    <FlatList
      data={done}
      style={{flex: 1}}
      keyExtractor={d => String(d.cid)}
      contentContainerStyle={{paddingHorizontal: 14, paddingBottom: bottom}}
      ListHeaderComponent={done.length ? <Text style={o.doneHint}>Tryck på en order för att ändra status, lägga till bild, tillägg, ändring eller avvikelse.</Text> : undefined}
      ListEmptyComponent={<View style={o.allDoneBox}><Bi n="inbox-fill" size={30} color={C.faint} /><Text style={o.allDone}>Inget klart än idag.</Text></View>}
      renderItem={({item: d}) => {
        const last = (d.edits || [])[d.edits.length - 1];
        return (
          <Pressable style={o.doneCard} onPress={() => onOpen(d)} android_ripple={{color: C.edge}}>
            <View style={o.doneTop}>
              <Bi n={d.rejected ? 'x-circle-fill' : 'check-circle-fill'} size={16} color={d.rejected ? C.bad : C.accent2} />
              <Text style={[o.doneTag, {color: d.rejected ? C.bad : C.accent2}]}>{d.rejected ? 'NEKAD' : 'LOSSAD'}</Text>
              <Text style={o.doneTime}>{d.doneAt ? hhmm(new Date(d.doneAt)) : ''}</Text>
              <View style={{flex: 1}} />
              {d.locked ? <Bi n="lock-fill" size={14} color={C.faint} /> : <View style={o.doneEdit}><Bi n="pencil-square" size={13} color={C.ink} /><Text style={o.doneEditTxt}>Ändra</Text></View>}
            </View>
            <Text style={o.doneWho2} numberOfLines={1}>{d.who || '—'}</Text>
            <Text style={o.doneMeta} numberOfLines={1}>{[d.adr, d.area].filter(Boolean).join(', ')}{d.orderNo ? `  ·  Order ${d.orderNo}` : ''}</Text>
            {(d.pod && (d.pod.name || (d.pod.photos && d.pod.photos.length))) ? (
              <Text style={o.doneMeta}>{d.pod.name ? `Mottagare: ${d.pod.name}` : ''}{d.pod.photos && d.pod.photos.length ? `  ·  ${d.pod.photos.length} foto` : ''}</Text>
            ) : null}
            {last ? <Text style={[o.doneMeta, {color: last.state === 'ok' ? C.accent2 : last.state === 'failed' || last.state === 'unconfirmed' ? C.bad : C.dim}]} numberOfLines={1}>{last.state === 'ok' ? '✓ ' : ''}{last.label}{d.edits.length > 1 ? `  +${d.edits.length - 1}` : ''}</Text> : null}
            {d.locked ? <Text style={o.doneMeta}>Klarmarkerad av kontoret – låst</Text> : d.byOpter ? <Text style={o.doneMeta}>Lossad i Opter</Text> : null}
            <SyncLine state={d.sync} label="Lossad" onRetry={() => onRetry(d.cid)} />
          </Pressable>
        );
      }}
    />
  );
}

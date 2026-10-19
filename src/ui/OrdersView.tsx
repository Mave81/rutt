/**
 * Plan – förslag A "Fokus" (valt 16 okt): EN skärm per ställe.
 *  - Stort: stället du ska till, adress, tid, portkod. Inga lådor runt allt.
 *  - Orderna som en bocklista (alla bockade). Många order grupperas på vart de ska.
 *    Varje order: tryck för mottagaren/avsändaren med allt, ⋯ = tillägg, bild, avvikelse, ändring.
 *  - Allt du trycker på sitter längst ner vid tummen: GPS · Ring · SMS och dragknappen.
 *  - ‹ › (eller "Ställe 2 av 5") byter ställe. Klart = nästa ställe av sig själv.
 *  - Markera: bocka valfria order → Lastad och/eller Lossad. Flera order samtidigt följer
 *    kontorets behörighet (SetMultipleStatusPermission), som Opter Driver.
 */
import React, {useMemo, useState} from 'react';
import {FlatList, Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, themed, hhmm, prettyPhone, whenText} from './theme';
import {Sheet} from './parts';
import {Bi, BiName} from './Bi';
import Slider from './Slider';
import ReorderSheet from './Reorder';
import {loadJSON, saveJSON} from '../store';

type Row = {kind: 'pickup' | 'drop'; st: any; cid: string; plan: any; dropLater?: {eta: Date | null; area: string} | null};

// ---- Navigering: Google Maps eller Waze (val under Inställningar), eller bara visa platsen på kartan ----
export type NavApp = 'google' | 'waze';
let NAV: NavApp = 'google';
loadJSON('rutt.nav', 'google').then((v: any) => { if (v === 'waze' || v === 'google') NAV = v; });
export function setNavApp(v: NavApp) { NAV = v; saveJSON('rutt.nav', v); }
export const navAppName = (v: NavApp = NAV) => (v === 'waze' ? 'Waze' : 'Google Maps');
export function navigate(st: any, app: NavApp | 'map' = NAV) {
  const geo = st.lat != null && st.lng != null;
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

export default function OrdersView({route, cargo, ost, allStops, onLoaded, onUnload, onEdit, onAvised, onRetry, live, later = [], onReorder, perm, tellTo = [], onTell}: {
  route: any; cargo: any; ost: Record<string, any>; allStops: any[];
  onLoaded: (st: any, more?: any[]) => void; onUnload: (st: any, more?: any[]) => void;
  onEdit: (cid: string, st: any) => void;
  onAvised: (cid: string) => void;
  onRetry: (cid: string) => void; live: boolean; later?: any[]; onReorder?: (keys: string[] | null) => void; perm?: any;
  tellTo?: TellTarget[];
  onTell?: (id: string, text: string) => void;
}) {
  const [focus, setFocus] = useState<string | null>(null); // annat stopp än NÄSTA valt som "nu"
  const [callStop, setCallStop] = useState<any>(null);
  const [sms, setSms] = useState<any>(null);
  const [tell, setTell] = useState<{text: string; mob: any; who: string} | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [fullInfo, setFullInfo] = useState<Record<string, boolean>>({});
  const [reorder, setReorder] = useState(false);
  const [unsel, setUnsel] = useState<Record<string, boolean>>({}); // order på samma ställe som du bockat ur
  const [navFor, setNavFor] = useState<any>(null);
  const [radio, setRadio] = useState<Record<string, string>>({}); // en i taget när kontoret stängt av flera
  const [openG, setOpenG] = useState<Record<string, boolean>>({});
  const [placeSheet, setPlaceSheet] = useState<any>(null);
  const [mark, setMark] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [planned, setPlanned] = useState<any>(null); // order för senare dag, visas som kort i ett blad // visa planen fast bilen rullar
  const now = Date.now();
  const bottom = useSafeAreaInsets().bottom + 24;

  // Bygg raderna ur körordningen: hämtningar alltid; lämningar bara när godset är lastat.
  const rows: Row[] = useMemo(() => {
    const order = route.order || [], prow = route.plan.rows || [];
    const dropAt: Record<string, any> = {};
    order.forEach((s: any, i: number) => { if (s.drop) dropAt[s.drop] = {eta: prow[i] && prow[i].eta, area: s.area || s.adr}; });
    const out: Row[] = [];
    const pendingPick = new Set(order.filter((s: any) => s.pickup).map((s: any) => String(s.pickup)));
    order.forEach((s: any, i: number) => {
      if (s.pickup) out.push({kind: 'pickup', st: s, cid: s.pickup, plan: prow[i], dropLater: dropAt[s.pickup] || null});
      else if (s.drop && !pendingPick.has(String(s.drop))) out.push({kind: 'drop', st: s, cid: s.drop, plan: prow[i]});
    });
    return out;
  }, [route, ost]);

  const p = route.plan;
  // Hela körordningen (även lossningar som väntar på sin hämtning) för "Ändra ordning".
  const orderItems = useMemo(() => (route.order || []).map((s: any, i: number) => ({key: s.pickup ? 'p' + s.pickup : 'd' + s.drop, kind: s.pickup ? 'pickup' : 'drop', cid: s.pickup || s.drop, st: s, plan: (route.plan.rows || [])[i]})), [route]);

  function callFor(st: any) {
    const tel = st.tel || [];
    if (tel.length === 1) dial(tel[0].num);
    else if (tel.length > 1) setCallStop(st);
  }

  // Personerna på ett stopp: rund avatar, SMS (bara mobil) och Ring.
  const peopleRows = (st: any) => {
    const tel = (st.tel || []).slice(0, 3);
    if (!tel.length) return null;
    return (
      <View style={o.people}>
        {tel.map((t: any) => (
          <View key={t.num} style={o.person}>
            <Face label={t.label} />
            <View style={{flex: 1, minWidth: 0}}>
              <Text style={o.pName} numberOfLines={1}>{String(t.label).replace(/\s*\(mobil\)/i, '')}</Text>
              <Text style={o.pNum}>{/\(mobil\)/i.test(t.label) ? 'Mobil · ' : ''}{prettyPhone(t.num)}</Text>
            </View>
            {isMobile(t.num) && (
              <Pressable hitSlop={6} style={o.pBtn} onPress={() => setSms({name: String(t.label).replace(/\s*\(mobil\)/i, ''), num: t.num, who: st.who})}>
                <Bi n="chat-dots-fill" size={18} color={C.people} />
              </Pressable>
            )}
            <Pressable hitSlop={6} style={o.pBtn} onPress={() => dial(t.num)}>
              <Bi n="telephone-fill" size={18} color={C.people} />
            </Pressable>
          </View>
        ))}
      </View>
    );
  };

  // ---- Senare dagar: en rad per ORDER (hämta + lämna ihop), inte per stopp ----
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
  const plannedCard = (g: any) => {
    const any = g.pick || g.drop;
    const c = cargo[g.cid] || {};
    const gName = c.goods || c.name || '';
    const goods = [c.pal ? `${c.pal} pall` : '', c.kg ? `${c.kg} kg` : '', /^order\b/i.test(gName) ? '' : gName].filter(Boolean).join(' · ');
    const orderLine = [any.orderNo && `Order ${any.orderNo}`, any.freightBill && any.freightBill !== any.orderNo && `Fraktsedel ${any.freightBill}`, any.service].filter(Boolean).join('  ·  ');
    const notes = uniqNotes([g.pick && g.pick.adrMsg, g.drop && g.drop.adrMsg, any.info], goods);
    // Du bestämmer: går det att lasta tidigare än planerat drar du bara Lastad.
    const os = ost[g.cid] || {};
    const P = g.pick;
    const loaded = !P || !!os.loadedAt || !!(P.live && ((P.live.loadSt && P.live.curId === P.live.loadSt.id) || P.live.serverDone));
    const leg = (st: any, pickup: boolean) => st && (
      <View style={o.leg}>
        <View style={o.headRow}>
          <View style={[o.verb, {backgroundColor: pickup ? C.accentSoft : C.okSoft}]}>
            <Bi n={pickup ? 'box-seam-fill' : 'check-circle-fill'} size={12} color={pickup ? C.accentInk : C.accent2} />
            <Text style={[o.verbTxt, {color: pickup ? C.accentInk : C.accent2}]}>{pickup ? 'HÄMTA' : 'LÄMNA'}</Text>
          </View>
          <Text style={o.legWhen}>{when(st)}</Text>
        </View>
        <Text style={o.legWho} numberOfLines={2}>{st.who || '—'}</Text>
        <View style={o.adrRow}><Bi n="geo-alt-fill" size={13} color={C.faint} /><Text style={o.adr} numberOfLines={2}>{[st.adr, st.area].filter(Boolean).join(', ')}</Text></View>
        {!!st.code && <View style={o.codeChip}><Bi n="key-fill" size={13} color={C.onAccent} /><Text style={o.codeTxt}>Portkod {st.code}</Text></View>}
        {peopleRows(st)}
        <NavButton st={st} small onMore={() => { setPlanned(null); setNavFor(st); }} />
        {pickup ? (loaded
          ? <View style={o.syncRow}><Bi n="check-circle-fill" size={14} color={C.accent2} /><Text style={[o.sync, {color: C.accent2}]}>Lastad{os.loadedAt ? ` ${hhmm(new Date(os.loadedAt))}` : ''} – godset är ombord</Text></View>
          : <Slider key={'p' + g.cid} label="Dra för Lastad" tone="go" onDone={() => { setPlanned(null); onLoaded(st); }} />)
        : (loaded
          ? <Slider key={'d' + g.cid} label="Dra för Lossad" tone="ok" onDone={() => { setPlanned(null); onUnload(st); }} />
          : <Text style={o.meta}>Lossas när godset är lastat.</Text>)}
      </View>
    );
    return (
      <View style={o.hero}>
        <View style={o.headRow}>
          <Bi n={g.today ? "box-seam" : "calendar-event"} size={15} color={C.dim} />
          <Text style={o.num}>{g.today ? 'Hela ordern' : 'Planerad order'}{any.orderNo ? ` ${any.orderNo}` : ''}</Text>
        </View>
        {leg(g.pick, true)}
        {leg(g.drop, false)}
        {notes.length > 0 && <View style={o.info}><Bi n="info-circle" size={15} color={C.dim} style={{marginTop: 1}} /><Text style={o.infoTxt}>{notes.join('\n')}</Text></View>}
        {(!!goods || !!orderLine) && <Text style={o.orderLine}>{[goods, orderLine].filter(Boolean).join('  ·  ')}</Text>}
      </View>
    );
  };

  // ---- B: ett ställe i taget. Alla stopp på samma adress slås ihop (det gör RUTT – Opter har ingen sådan logik). ----
  type Place = {key: string; st: any; drops: Row[]; picks: Row[]; eta: any; late: number};
  const places: Place[] = useMemo(() => {
    const out: Place[] = [];
    for (const r of rows) {
      let pl = out.find(x => samePlace(x.st, r.st));
      if (!pl) out.push(pl = {key: r.kind + r.cid, st: r.st, drops: [], picks: [], eta: r.plan && r.plan.eta, late: 0});
      (r.kind === 'drop' ? pl.drops : pl.picks).push(r);
      if (r.plan && r.plan.late) pl.late = Math.max(pl.late, r.plan.late);
    }
    return out;
  }, [rows]);
  const heroPl = places.find(pl => pl.key === focus) || places[0];
  const multi = !perm || perm.multi !== false; // kontoret kan stänga av flera order samtidigt
  const otherOf = (r: Row) => r.kind === 'pickup'
    ? (allStops.find((s: any) => s.drop === r.cid) || later.find((s: any) => s.drop === r.cid))
    : (allStops.find((s: any) => s.pickup === r.cid) || later.find((s: any) => s.pickup === r.cid));
  const k = (r: Row) => r.kind + r.cid;
  // Bockat: alla som standard (bocka ur det som inte ska med). Utan "flera"-behörighet: en i taget.
  const isOn = (list: Row[], r: Row) => (multi ? !unsel[k(r)] : (radio[list[0].kind] || k(list[0])) === k(r));
  const toggle = (list: Row[], r: Row) => { if (multi) setUnsel(u => ({...u, [k(r)]: !u[k(r)]})); else setRadio(x => ({...x, [r.kind]: k(r)})); };
  const goodsOf = (r: Row) => { const c = cargo[r.cid] || {}; const g = c.goods || c.name || ''; return [/^order\b/i.test(g) ? '' : g, r.st.kolli ? `${r.st.kolli} kolli` : c.pal ? `${c.pal} pall` : ''].filter(Boolean).join(' · ') || 'Order'; };
  const syncBad = (r: Row) => { const sy = (ost[r.cid] || {}).sync || {}; const v = r.kind === 'pickup' ? sy.load : sy.unload; return v === 'failed' || v === 'unconfirmed'; };
  const placeName = (st: any) => st.who || [st.adr, st.area].filter(Boolean).join(', ') || '—';

  const ordRow = (list: Row[], r: Row) => {
    const on = isOn(list, r), other = otherOf(r);
    const nEd = ((ost[r.cid] || {}).edits || []).length;
    return (
      <View key={k(r)} style={o.li}>
        <Pressable hitSlop={12} onPress={() => toggle(list, r)} style={{paddingVertical: 4}}><View style={[o.ck, on && o.ckOn]}>{on ? <Bi n="check2" size={14} color="#FFFFFF" /> : null}</View></Pressable>
        <Pressable style={[{flex: 1, minWidth: 0}, !on && {opacity: 0.5}]} onPress={() => other && setPlaceSheet({st: other, role: r.kind === 'pickup' ? 'MOTTAGARE · dit godset ska' : 'AVSÄNDARE · där det hämtades'})}>
          <Text style={o.liT} numberOfLines={1}>{goodsOf(r)}</Text>
          <Text style={o.ordS} numberOfLines={1}>{other ? <>{r.kind === 'pickup' ? '→ ' : 'från '}<Text style={o.ordSB}>{placeName(other)}</Text>{other.area ? ` · ${other.area}` : ''}</> : null}{r.st.orderNo ? `  ·  ${r.st.orderNo}` : ''}</Text>
          {syncBad(r) ? <Text style={[o.ordS, {color: C.bad}]} onPress={() => onRetry(r.cid)}>Inte bekräftad i Opter – tryck för att skicka igen</Text> : null}
        </Pressable>
        <Pressable hitSlop={8} style={o.liMore} onPress={() => onEdit(r.cid, r.st)}>
          <Bi n="three-dots" size={18} color={nEd ? C.accentInk : C.dim} />
        </Pressable>
      </View>
    );
  };
  const section = (list: Row[]) => {
    if (!list.length) return null;
    const pickup = list[0].kind === 'pickup';
    const head = <Text style={o.secLbl}>{pickup ? 'HÄMTA HÄR' : 'LOSSA HÄR'} · {list.length} order</Text>;
    if (list.length <= 4) return <View>{head}{list.map(r => ordRow(list, r))}</View>;
    // Många order: grupperat på vart de ska (eller varifrån de kom).
    const groups: {name: string; area: string; rs: Row[]}[] = [];
    for (const r of list) { const ot = otherOf(r); const nm = ot ? placeName(ot) : '—'; let g = groups.find(x => x.name === nm); if (!g) groups.push(g = {name: nm, area: (ot && ot.area) || '', rs: []}); g.rs.push(r); }
    return (
      <View>
        {head}
        {groups.map(g => {
          const nOn = g.rs.filter(r => isOn(list, r)).length, gk = (pickup ? 'p' : 'd') + g.name, open = !!openG[gk];
          return (
            <View key={gk} style={o.grpBox}>
              <View style={o.grpRow}>
                {multi ? (
                  <Pressable hitSlop={10} onPress={() => { const all = nOn === g.rs.length; setUnsel(u => { const n = {...u}; g.rs.forEach(r => { n[k(r)] = all; }); return n; }); }}>
                    <View style={[o.ck, nOn === g.rs.length && o.ckOn, nOn > 0 && nOn < g.rs.length && o.ckPart]}>{nOn === g.rs.length ? <Bi n="check2" size={14} color="#FFFFFF" /> : nOn ? <Bi n="three-dots" size={12} color={C.accent2} /> : null}</View>
                  </Pressable>
                ) : null}
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={o.ordT} numberOfLines={1}>{pickup ? '→ ' : '← '}{g.name}</Text>
                  <Text style={o.ordS}>{nOn} av {g.rs.length} order{g.area ? ` · ${g.area}` : ''}</Text>
                </View>
                <Pressable style={o.chipBtn} onPress={() => setOpenG(x => ({...x, [gk]: !open}))}><Text style={o.chipTxt}>{open ? 'Dölj' : 'Visa'}</Text></Pressable>
              </View>
              {open ? g.rs.map(r => ordRow(list, r)) : null}
            </View>
          );
        })}
      </View>
    );
  };
  function resetSel() { setUnsel({}); setRadio({}); setOpenG({}); setFocus(null); }
  const doLoad = (list: Row[]) => { const ch = list.filter(r => isOn(list, r)); if (!ch.length) return; resetSel(); onLoaded(ch[0].st, ch.slice(1).map(r => r.st)); };
  const doUnload = (list: Row[]) => { const ch = list.filter(r => isOn(list, r)); if (!ch.length) return; resetSel(); onUnload(ch[0].st, ch.slice(1).map(r => r.st)); };

  // ---- A · Fokus: ett ställe, stort ----
  const heroIdx = Math.max(0, places.indexOf(heroPl));
  const goTo = (i: number) => { const pl = places[Math.max(0, Math.min(places.length - 1, i))]; if (!pl) return; setUnsel({}); setRadio({}); setOpenG({}); setFocus(i === 0 ? null : pl.key); };
  const focusView = (pl: Place) => {
    const st = pl.st;
    const all = [...pl.drops, ...pl.picks];
    const latest = all.map(r => r.st.tLatest).filter(Boolean)[0];
    const notes = uniqNotes(all.flatMap(r => [r.st.adrMsg, r.st.info]), '');
    // Avisering: närmaste som inte är gjord.
    const av = pl.drops.map(r => ({r, a: r.st.avise})).find(x => x.a && !(ost[x.r.cid] || {}).avisedAt);
    const avAt = av && av.r.plan && av.r.plan.eta ? new Date(new Date(av.r.plan.eta).getTime() - av.a.min * 60000) : null;
    const avDue = avAt && now >= avAt.getTime();
    const next = places[heroIdx + 1];
    return (
      <View>
        <View style={o.fTags}>
          {pl.drops.length ? <View style={[o.verb, {backgroundColor: C.okSoft}]}><Text style={[o.verbTxt, {color: C.accent2}]}>LOSSA {pl.drops.length}</Text></View> : null}
          {pl.picks.length ? <View style={[o.verb, {backgroundColor: C.accentSoft}]}><Text style={[o.verbTxt, {color: C.accentInk}]}>HÄMTA {pl.picks.length}</Text></View> : null}
          {pl.late ? <View style={o.lateTag}><Text style={o.lateTxt}>{pl.late} min sen</Text></View> : null}
        </View>
        <Pressable onPress={() => setPlaceSheet({st, role: pl.picks.length && !pl.drops.length ? 'AVSÄNDARE' : 'MOTTAGARE', rows: all})}>
          <Text style={o.fName}>{placeName(st)}</Text>
          <Text style={o.fAdr}>{[st.adr, st.area].filter(Boolean).join(', ')}</Text>
        </Pressable>
        <View style={o.fMeta}>
          <Bi n="clock" size={13} color={C.dim} />
          <Text style={o.fMetaTxt}>{[pl.eta ? `ca ${hhmm(pl.eta)}` : '', latest ? `senast ${whenText(latest)}` : ''].filter(Boolean).join('  ·  ') || 'Ingen tid angiven'}</Text>
        </View>
        {!!st.code && (
          <View style={o.fCode}><Bi n="key-fill" size={18} color={C.accentInk} /><Text style={o.fCodeT}>{st.code}</Text><Text style={o.fCodeL}>PORTKOD</Text></View>
        )}
        {notes.length > 0 && (
          <Pressable style={o.info} onPress={() => setPlaceSheet({st, role: 'INFO', rows: all})}>
            <Bi n="info-circle" size={15} color={C.dim} style={{marginTop: 1}} />
            <Text style={o.infoTxt} numberOfLines={3}>{notes.join(' · ')}</Text>
          </Pressable>
        )}
        {avAt && (
          <Pressable style={[o.avise, avDue && o.aviseDue]} onPress={() => { if (av!.a.who) dial(av!.a.who.num); onAvised(av!.r.cid); }}>
            <Bi n="bell-fill" size={16} color={avDue ? C.onAccent : C.accentInk} />
            <Text style={[o.aviseT, {flex: 1, fontSize: 14}, avDue && {color: C.onAccent}]} numberOfLines={1}>{avDue ? 'Avisera nu' : `Avisera kl ${hhmm(avAt)}`}{av!.a.who ? ` · ${av!.a.who.label}` : ''}</Text>
            <Text style={[o.aviseCall, avDue && {color: C.onAccent}]}>{av!.a.who ? 'Ring' : 'Klar'}</Text>
          </Pressable>
        )}
        {section(pl.drops)}
        {section(pl.picks)}
        {next ? (
          <Pressable style={o.fNext} onPress={() => goTo(heroIdx + 1)}>
            <Text style={o.fNextTxt} numberOfLines={1}>Sedan: <Text style={{color: C.ink, fontWeight: '800'}}>{placeName(next.st)}</Text>{next.eta ? `  ·  ${hhmm(next.eta)}` : ''}</Text>
            <Bi n="chevron-right" size={13} color={C.faint} />
          </Pressable>
        ) : null}
        {focus ? (
          <Pressable hitSlop={10} onPress={() => setFocus(null)} style={{alignSelf: 'center', marginTop: 10}}>
            <Text style={o.link}>Tillbaka till nästa i ordningen</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };
  // "Säg till": färdig text om vad du hämtar/lämnar här – antal pall, ställe, gata, ordernummer.
  const tellText = (pl: Place) => {
    const st = pl.st;
    const pals = (rs: Row[]) => rs.reduce((n, r) => n + ((cargo[r.cid] && Number(cargo[r.cid].pal)) || 0), 0);
    const pt = (n: number) => (n > 0 ? `${n} pall` : '');
    const pick = pl.picks.filter(r => isOn(pl.picks, r)), drop = pl.drops.filter(r => isOn(pl.drops, r));
    const what = [drop.length ? `lämnar ${pt(pals(drop)) || (drop.length > 1 ? drop.length + ' order' : 'leveransen')}` : '', pick.length ? `hämtar ${pt(pals(pick)) || (pick.length > 1 ? pick.length + ' order' : 'godset')}` : ''].filter(Boolean).join(' och ');
    const where = [st.who, st.adr, st.area].filter(Boolean).filter((x: string, i: number, a: string[]) => a.indexOf(x) === i).join(', ');
    const nos = [...new Set([...drop, ...pick].map(r => r.st.orderNo).filter(Boolean).map(String))];
    const t = `Jag ${what || 'är'} hos ${where || placeName(st)}.` + (nos.length ? ` Order ${nos.join(', ')}.` : '');
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  // Tummzonen: GPS · Ring · SMS + dragknappen för stället som visas.
  const dock = (pl: Place) => {
    const st = pl.st;
    const tel = st.tel || [];
    const mob = tel.find((t: any) => isMobile(t.num));
    const nDrop = pl.drops.filter(r => isOn(pl.drops, r)).length, nPick = pl.picks.filter(r => isOn(pl.picks, r)).length;
    return (
      <View style={o.dock}>
        <View style={o.dockRow}>
          <Pressable style={[o.round, {backgroundColor: C.accent}]} onPress={() => navigate(st)} onLongPress={() => setNavFor(st)} android_ripple={{color: C.edge}}>
            <Bi n="cursor-fill" size={18} color={C.onAccent} /><Text style={[o.roundTxt, {color: C.onAccent}]}>GPS</Text>
          </Pressable>
          <Pressable disabled={!tel.length} style={[o.round, !tel.length && {opacity: 0.35}]} onPress={() => (tel.length === 1 ? dial(tel[0].num) : setCallStop(st))} android_ripple={{color: C.edge}}>
            <Bi n="telephone-fill" size={18} color={C.people} /><Text style={[o.roundTxt, {color: C.people}]}>Ring</Text>
          </Pressable>
          <Pressable disabled={!mob} style={[o.round, !mob && {opacity: 0.35}]} onPress={() => mob && setSms({name: String(mob.label).replace(/\s*\(mobil\)/i, ''), num: mob.num, who: st.who})} android_ripple={{color: C.edge}}>
            <Bi n="chat-dots-fill" size={18} color={C.people} /><Text style={[o.roundTxt, {color: C.people}]}>SMS</Text>
          </Pressable>
          <Pressable style={o.round} onPress={() => setTell({text: tellText(pl), mob, who: placeName(st)})} android_ripple={{color: C.edge}}>
            <Bi n="megaphone-fill" size={18} color={C.people} /><Text style={[o.roundTxt, {color: C.people}]}>Säg till</Text>
          </Pressable>
        </View>
        {pl.drops.length > 0 && (
          <Slider style={{marginTop: 8}} key={'d' + pl.key + nDrop} label={`Dra för Lossad${nDrop > 1 ? ` · ${nDrop}` : ''}`} tone="ok" onDone={() => doUnload(pl.drops)} />
        )}
        {pl.picks.length > 0 && (
          <Slider style={{marginTop: 8}} key={'p' + pl.key + nPick} label={`Dra för Lastad${nPick > 1 ? ` · ${nPick}` : ''}`} tone="go" onDone={() => doLoad(pl.picks)} />
        )}
      </View>
    );
  };

  // Mottagare / avsändare / ställe – allt på ett ställe.
  const placeSheetView = () => {
    const ps = placeSheet; if (!ps) return null;
    const st = ps.st;
    const notes = uniqNotes(ps.rows ? ps.rows.flatMap((r: Row) => [r.st.adrMsg, r.st.info]) : [st.adrMsg, st.info], '');
    const t = st.tLatest || st.tEarliest;
    return (
      <Sheet open onClose={() => setPlaceSheet(null)} scroll>
        <Text style={o.secLbl}>{ps.role === 'INFO' ? 'INFO OCH KONTAKTER' : ps.role}</Text>
        <View style={o.heroTop}>
          <View style={{flex: 1, minWidth: 0}}>
            <Text style={o.pn}>{placeName(st)}</Text>
            <Text style={o.pa}>{[st.adr, st.zip, st.area].filter(Boolean).join(', ')}</Text>
          </View>
          <Pressable style={o.gpsBig} onPress={() => { setPlaceSheet(null); navigate(st); }} onLongPress={() => { setPlaceSheet(null); setNavFor(st); }}>
            <Bi n="cursor-fill" size={22} color={C.onAccent} />
          </Pressable>
        </View>
        <View style={o.step}>
          {!!st.code && <View style={o.code}><Bi n="key-fill" size={13} color={C.accentInk} /><Text style={o.codeT}>{st.code}</Text></View>}
          {t ? <Text style={o.num}>{st.tEarliest && st.tLatest ? `${whenText(st.tEarliest)} – ${whenText(st.tLatest)}` : whenText(t)}</Text> : null}
          {st.req && st.req.sig ? <View style={o.reqTag}><Text style={o.reqTxt}>SIGNATUR KRÄVS</Text></View> : null}
        </View>
        {notes.length > 0 && <View style={o.info}><Bi n="info-circle" size={15} color={C.dim} style={{marginTop: 1}} /><Text style={o.infoTxt}>{notes.join('\n\n')}</Text></View>}
        {peopleRows(st)}
        {ps.rows && ps.rows.length ? (
          <View style={{marginTop: 14}}>
            <Text style={o.secLbl}>ORDER HÄR · tryck för tillägg, bild, avvikelse</Text>
            {ps.rows.map((r: Row) => (
              <Pressable key={k(r)} style={o.ord} onPress={() => { setPlaceSheet(null); onEdit(r.cid, r.st); }}>
                <Bi n={r.kind === 'pickup' ? 'box-seam-fill' : 'check-circle-fill'} size={14} color={r.kind === 'pickup' ? C.accentInk : C.accent2} />
                <Text style={[o.ordT, {flex: 1}]} numberOfLines={1}>{goodsOf(r)}<Text style={o.ordNo}>{r.st.orderNo ? `  ·  ${r.st.orderNo}` : ''}</Text></Text>
                <Bi n="three-dots" size={16} color={C.dim} />
              </Pressable>
            ))}
          </View>
        ) : null}
        <Pressable style={{alignSelf: 'center', paddingVertical: 14}} onPress={() => { setPlaceSheet(null); setNavFor(st); }}>
          <Text style={o.link}>Öppna i annan kartapp</Text>
        </Pressable>
      </Sheet>
    );
  };

  // ---- Markera: alla order per ställe, bocka valfria → Lastad och/eller Lossad ----
  const markView = () => {
    const selRows = rows.filter(r => sel[k(r)]);
    const nP = selRows.filter(r => r.kind === 'pickup').length, nD = selRows.filter(r => r.kind === 'drop').length;
    const canP = !perm || perm.pickup !== false, canD = !perm || perm.delivery !== false;
    return (
      <View style={{flex: 1}}>
        <View style={o.markHead}>
          <View style={{flex: 1}}><Text style={o.restTitle}>Markera</Text><Text style={o.restSum}>Bocka det du gjort – välj sen Lastad eller Lossad</Text></View>
          <Pressable style={o.chipBtn} onPress={() => { setMark(false); setSel({}); }}><Text style={o.chipTxt}>Klar</Text></Pressable>
        </View>
        <FlatList
          data={places}
          keyExtractor={pl => pl.key}
          style={{flex: 1}}
          contentContainerStyle={{paddingHorizontal: 14, paddingBottom: bottom + 70}}
          renderItem={({item: pl}) => {
            const all = [...pl.drops, ...pl.picks], nOn = all.filter(r => sel[k(r)]).length;
            return (
              <View style={o.markBox}>
                <View style={o.grpRow}>
                  <Pressable hitSlop={10} onPress={() => { const allOn = nOn === all.length; setSel(x => { const n = {...x}; all.forEach(r => { n[k(r)] = !allOn; }); return n; }); }}>
                    <View style={[o.ck, nOn === all.length && o.ckOn, nOn > 0 && nOn < all.length && o.ckPart]}>{nOn === all.length ? <Bi n="check2" size={14} color="#FFFFFF" /> : nOn ? <Bi n="three-dots" size={12} color={C.accent2} /> : null}</View>
                  </Pressable>
                  <View style={{flex: 1, minWidth: 0}}>
                    <Text style={o.ordT} numberOfLines={1}>{placeName(pl.st)}</Text>
                    <Text style={o.ordS}>{pl.eta ? `ca ${hhmm(pl.eta)} · ` : ''}{[pl.drops.length ? `Lossa ${pl.drops.length}` : '', pl.picks.length ? `Hämta ${pl.picks.length}` : ''].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <Pressable style={o.gpsSm} onPress={() => navigate(pl.st)} onLongPress={() => setNavFor(pl.st)}><Bi n="cursor-fill" size={14} color={C.ink} /></Pressable>
                </View>
                {all.map(r => {
                  const on = !!sel[k(r)], other = otherOf(r);
                  return (
                    <Pressable key={k(r)} style={o.ord} onPress={() => setSel(x => ({...x, [k(r)]: !on}))}>
                      <View style={[o.ck, on && o.ckOn]}>{on ? <Bi n="check2" size={14} color="#FFFFFF" /> : null}</View>
                      <View style={{flex: 1, minWidth: 0}}>
                        <Text style={o.ordT} numberOfLines={1}>{r.kind === 'pickup' ? 'Hämta' : 'Lossa'} · {goodsOf(r)}<Text style={o.ordNo}>{r.st.orderNo ? `  ·  ${r.st.orderNo}` : ''}</Text></Text>
                        <Text style={o.ordS} numberOfLines={1}>{r.kind === 'pickup' ? `→ ${other ? placeName(other) : ''}` : `i bilen${other ? `, från ${placeName(other)}` : ''}`}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            );
          }}
        />
        {selRows.length > 0 && (
          <View style={[o.bar, {paddingBottom: 10}]}>
            <Text style={o.barCnt}>{selRows.length} valda</Text>
            <Pressable disabled={!nP || !canP} style={[o.barBtn, {backgroundColor: C.accent}, (!nP || !canP) && {opacity: 0.35}]} onPress={() => { const ps = selRows.filter(r => r.kind === 'pickup'); setMark(false); setSel({}); onLoaded(ps[0].st, ps.slice(1).map(r => r.st)); }}>
              <Text style={[o.barTxt, {color: C.onAccent}]}>Lastad{nP ? ` · ${nP}` : ''}</Text>
            </Pressable>
            <Pressable disabled={!nD || !canD} style={[o.barBtn, {backgroundColor: C.accent2}, (!nD || !canD) && {opacity: 0.35}]} onPress={() => { const ds = selRows.filter(r => r.kind === 'drop'); setMark(false); setSel({}); onUnload(ds[0].st, ds.slice(1).map(r => r.st)); }}>
              <Text style={[o.barTxt, {color: '#FFFFFF'}]}>Lossad{nD ? ` · ${nD}` : ''}</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={{flex: 1}}>
      {mark ? markView() : (
      <>
        {heroPl ? (
          <View style={o.fBar}>
            <Pressable hitSlop={8} disabled={heroIdx === 0} style={[o.fArrow, heroIdx === 0 && {opacity: 0.3}]} onPress={() => goTo(heroIdx - 1)}><Bi n="chevron-left" size={16} color={C.ink} /></Pressable>
            <Pressable style={o.fCount} onPress={() => setListOpen(true)} hitSlop={6}>
              <View style={o.dots}>{places.slice(0, 9).map((pl, i) => <View key={pl.key} style={[o.dot, i === heroIdx && o.dotOn]} />)}</View>
              <Text style={o.fCountTxt}>Ställe {heroIdx + 1} av {places.length}</Text>
            </Pressable>
            <Pressable hitSlop={8} disabled={heroIdx >= places.length - 1} style={[o.fArrow, heroIdx >= places.length - 1 && {opacity: 0.3}]} onPress={() => goTo(heroIdx + 1)}><Bi n="chevron-right" size={16} color={C.ink} /></Pressable>
            <View style={{flex: 1}} />
            {multi && rows.length > 1 ? (
              <Pressable style={o.reBtn} hitSlop={6} onPress={() => { setSel({}); setMark(true); }}>
                <Bi n="check-square-fill" size={13} color={C.ink} /><Text style={o.reTxt}>Markera</Text>
              </Pressable>
            ) : null}
            {onReorder && orderItems.length > 1 ? (
              <Pressable style={[o.reBtn, {marginLeft: 6}]} hitSlop={6} onPress={() => setReorder(true)}>
                <Bi n="list-ul" size={14} color={C.ink} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <ScrollView style={{flex: 1}} contentContainerStyle={{paddingHorizontal: 18, paddingBottom: 24}} keyboardShouldPersistTaps="handled">
          {heroPl ? focusView(heroPl) : (
            <View style={o.allDoneBox}>
              <Bi n="check2-all" size={40} color={C.accent2} />
              <Text style={o.allDoneBig}>Allt klart</Text>
              <Text style={o.allDone}>Snyggt jobbat! Det du gjort finns under Klart – där kan du ändra i efterhand.</Text>
            </View>
          )}
          {later.length ? (
            <View style={{marginTop: 22}}>
              <View style={o.restHead}><Text style={o.restTitle}>Senare dagar</Text><Text style={o.restSum}>{laterOrders.length} order</Text></View>
              {laterOrders.map((g: any) => (
                <Pressable key={g.cid} style={o.row} onPress={() => setPlanned(g)}>
                  <View style={[o.rowIco, {backgroundColor: C.panel2}]}><Bi n="calendar-event" size={14} color={C.dim} /></View>
                  <View style={{flex: 1, minWidth: 0}}>
                    <Text style={o.rowWho} numberOfLines={1}>{[g.pick && g.pick.who, g.drop && g.drop.who].filter(Boolean).join('  →  ') || '—'}</Text>
                    <Text style={o.rowMeta} numberOfLines={1}>{[g.pick && `Hämta ${when(g.pick)}`, g.drop && `Lämna ${when(g.drop)}`].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <Bi n="chevron-right" size={14} color={C.faint} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>
        {heroPl ? dock(heroPl) : null}
      </>)}

      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="Alla ställen idag" sub={`${places.length} ställen · klar ${p.end ? hhmm(p.end) : '–'} · ${Math.round(p.totKm || 0)} km${route.manual ? ' · din ordning' : ''}`} scroll>
        {places.map((pl, i) => (
          <Pressable key={pl.key} style={[o.row, i === heroIdx && {borderColor: C.accent, borderWidth: 2}]} onPress={() => { setListOpen(false); goTo(i); }}>
            <Text style={[o.rowEta, {width: 44}, pl.late ? {color: C.bad} : null]}>{pl.eta ? hhmm(pl.eta) : ''}</Text>
            <View style={{flex: 1, minWidth: 0}}>
              <Text style={o.rowWho} numberOfLines={1}>{placeName(pl.st)}</Text>
              <Text style={o.rowMeta} numberOfLines={1}>{[pl.drops.length ? `Lossa ${pl.drops.length}` : '', pl.picks.length ? `Hämta ${pl.picks.length}` : '', pl.st.area || ''].filter(Boolean).join(' · ')}</Text>
            </View>
            <Pressable style={o.gpsSm} hitSlop={6} onPress={() => navigate(pl.st)} onLongPress={() => setNavFor(pl.st)}><Bi n="cursor-fill" size={14} color={C.ink} /></Pressable>
          </Pressable>
        ))}
      </Sheet>
      {placeSheetView()}
      <CallSheet st={callStop} onClose={() => setCallStop(null)} />
      <SmsSheet to={sms} onClose={() => setSms(null)} />
      <TellSheet t={tell} targets={tellTo} onClose={() => setTell(null)} onSend={(id, text) => { setTell(null); onTell && onTell(id, text); }} onSms={(num, text) => { setTell(null); Linking.openURL(`sms:${num}?body=${encodeURIComponent(text)}`).catch(() => {}); }} />
      <NavSheet st={navFor} onClose={() => setNavFor(null)} />
      {onReorder ? <ReorderSheet open={reorder} items={orderItems} manual={!!route.manual} onClose={() => setReorder(false)} onSave={keys => { setReorder(false); setFocus(null); onReorder(keys); }} /> : null}
      <Sheet open={!!planned} onClose={() => setPlanned(null)} scroll>
        {planned ? plannedCard(planned) : null}
        {planned && !planned.today ? <Text style={o.plannedNote}>Planerad {when(planned.pick || planned.drop) || 'senare'} – men det är du som bestämmer. Kan du lasta tidigare drar du bara Lastad.</Text> : null}
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

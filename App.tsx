/**
 * RUTT – native förar-app.
 * Logga in mot Opter → välj namn → jobb hämtas → optimerad plan + lastplan.
 * (Kör-läge och statusar tillbaka till Opter kommer härnäst.)
 */
import React, {useMemo, useState, useEffect, useRef} from 'react';
import {
  View, StatusBar, StyleSheet, Text, TextInput, Pressable,
  FlatList, ActivityIndicator, ScrollView, Keyboard, Share, Vibration, NativeModules, PermissionsAndroid, Platform, useColorScheme, Linking,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, themed, hhmm, isFutureDay, applyTheme, prettyPhone, slack} from './src/ui/theme';
import {Bi} from './src/ui/Bi';
import {Sheet} from './src/ui/parts';
import OrdersView, {DoneView, setNavApp, NavApp} from './src/ui/OrdersView';
import SignScreen from './src/ui/SignScreen';
import EditSheet, {DEMO_OPTS} from './src/ui/EditOrder';
import JobbetView, {useJobbet} from './src/ui/JobbetView';
import NewOrdersView, {NewOrderCard, RejectSheet, ForwardSheet} from './src/ui/NewOrdersView';
import LoadView from './src/ui/LoadView';
import {loadJSON, saveJSON, ORDERS_KEY, NAMES_KEY, companyKey, rememberName} from './src/store';
import * as DB from './src/dagbok';
import DagbokView from './src/ui/DagbokView';
import PlanDay from './src/ui/PlanDay';
import MediaViewer from './src/ui/MediaViewer';
import SedelSheet from './src/ui/SedelSheet';
import {Egen, EGNA_KEY, isEgen, toStops, cargoOf, statusSms, opterSms} from './src/egna';
const TRAVEL = require('./src/opter/travel');
import {baseDriveMin, SERVICE_MIN, PAL_MIN} from './src/opter/optimizer';
import {Buffer} from 'buffer';
import {PixelRatio, BackHandler, AppState, DeviceEventEmitter, NativeModules as NM} from 'react-native';
// @ts-ignore
import P from './src/opter/protocol';
// @ts-ignore
import OpterClient from './src/opter/OpterClient';
// @ts-ignore
import computeRoute from './src/opter/optimizer';

const client = new OpterClient();
const dlog = (t: string) => { try { const c: any = client; if (c.d) c.d(t); } catch (e) {} };
// Var dagen börjar (rutten räknas därifrån tills du klarat första stoppet). Väljs under Plan → Imorgon.
const STARTS = [
  {id: 'vb', lat: 59.2938, lng: 18.0127, label: 'Västberga', end: '15:00'},
  {id: 'ty', lat: 59.2437, lng: 18.2280, label: 'Willys, Tyresö', end: '15:00'},
];
// Synlig bygg-stämpel så du alltid kan se vilket bygge du kör. Bumpas vid varje leverans.
const BUILD = '21 okt · 3.40 · Tid som i Opter (timmar + minuter, timjobb start–slut), tillägg dolda när kontoret inte tillåter dem';
// Arbetstids-typer (RST) – matchar protokollet.
const RST = {EndWork: 2, StartLunch: 3, EndLunch: 4, StartBreak: 5, EndBreak: 6};

const DEMO = {
  cargo: {
    A: {name: 'Nordsjö-pall + list', pal: 1, kg: 330, to: 'Klara Södra', goods: '1 st EUR-pall, 4 list'},
    B: {name: 'Golvpall', pal: 1, kg: 1160, to: 'Älta', goods: '1 st helpall golv'},
    C: {name: 'Sprutmaskin', pal: 0, kg: 60, to: 'Sundbyberg', goods: 'Sprutmaskin i kartong'},
    D: {name: 'Byte 17x 660L kärl', pal: 4, kg: 0, to: 'Haninge', goods: '17 st 660L kärl'},
  },
  stops: [
    {verb: 'Hämta', adr: 'Västberga Allé 40', area: 'Hägersten', lat: 59.2939, lng: 18.0129, pickup: 'A', deadline: '14:15', who: 'Nordsjö Idé & Design', contact: 'Lagret, Peter', code: '', tel: [{label: 'Peter (lager)', num: '0701234567'}, {label: 'Kund', num: '086001122'}], adrMsg: 'Ring på vid port 3, lastkaj B.', orderNo: '481203'},
    {verb: 'Hämta', adr: 'Lerkrogsvägen 9', area: 'Hägersten', lat: 59.2918, lng: 18.0045, pickup: 'B', deadline: '15:30', who: 'Golvgrossisten', contact: '', tel: [{label: 'Golvgrossisten', num: '087778899'}], orderNo: '481207'},
    {verb: 'Hämta', adr: 'Hjärtervägen 17', area: 'Trångsund', lat: 59.2377, lng: 18.1280, pickup: 'C', deadline: null, who: 'Olle Persson', contact: '', tel: [{label: 'Olle (mobil)', num: '0739876543'}], msg: 'Står i garaget om ingen är hemma.', orderNo: '481210'},
    {verb: 'Hämta', adr: 'Metallvägen 60', area: 'Rosersberg', lat: 59.5838, lng: 17.8846, pickup: 'D', deadline: '16:00', earliest: '08:00', who: 'Stena Återvinning Rosersberg', tel: [{label: 'Katta (Stena)', num: '0104457271'}, {label: 'Johannes', num: '0851833262'}], orderNo: '226815', freightBill: '41805637', kolli: 17, service: 'Bud', info: "41805637\nKärl hämtas och lämnar på Stena i Rosersberg,  kör ingenting över våg. Åk förbi vågen och till baksidan av huset, vid lastkaj på höger sida har \"Bygg\" sina kärl. Ring Katta på stena 010 445 72 71 och meddela vilka fraktioner/ antal kärlen innehåller\n\nUnder dagen, Avisera 1 timma innan ankomst\nRudsjöterassen, Handen\nJohannes 08 518 332 62 Avisera kund Ca 1 timma innan ankomst\n\n• Byte 17x 660L kärl (Lämna lika många kärl som vi hämtar fulla, ibland har dom inte fyllt alla\nOBS Kärlen vägs inte in i Rosersberg. Meddela antal kärl/ fraktioner till Katta 010 445 72 71"},
    {verb: 'Lämna', adr: 'Rudsjöterassen', area: 'Haninge', lat: 59.1730, lng: 18.1440, drop: 'D', deadline: null, who: 'Distribution', contact: 'Johannes', tel: [{label: 'Johannes', num: '0851833262'}, {label: 'Katta (Stena)', num: '0104457271'}], orderNo: '226815', freightBill: '41805637', kolli: 17, service: 'Bud', req: {sig: true}, avise: {min: 60, who: {label: 'Johannes', num: '0851833262'}}, info: "41805637\nKärl hämtas och lämnar på Stena i Rosersberg,  kör ingenting över våg. Åk förbi vågen och till baksidan av huset, vid lastkaj på höger sida har \"Bygg\" sina kärl. Ring Katta på stena 010 445 72 71 och meddela vilka fraktioner/ antal kärlen innehåller\n\nUnder dagen, Avisera 1 timma innan ankomst\nRudsjöterassen, Handen\nJohannes 08 518 332 62 Avisera kund Ca 1 timma innan ankomst\n\n• Byte 17x 660L kärl (Lämna lika många kärl som vi hämtar fulla, ibland har dom inte fyllt alla\nOBS Kärlen vägs inte in i Rosersberg. Meddela antal kärl/ fraktioner till Katta 010 445 72 71"},
    {verb: 'Lämna', adr: 'Klara Södra Kyrkogata 1', area: 'Stockholm', lat: 59.3302, lng: 18.0618, drop: 'A', deadline: null, who: 'NP Måleri', contact: 'Niklas', code: '1947', tel: [{label: 'Niklas (mobil)', num: '0761112233'}], suggest: ['Niklas Persson'], req: {sig: true, name: true}, orderNo: '481203'},
    {verb: 'Lämna', adr: 'Järnvägsgatan 11', area: 'Sundbyberg', lat: 59.3662, lng: 17.9522, drop: 'C', deadline: null, who: 'Verkstaden', contact: '', code: '', tel: [], suggest: [], req: {sig: true}, driverMsg: 'Lämna i verkstaden, inte i butiken.', orderNo: '481210'},
    {verb: 'Lämna', adr: 'Torvmossevägen 15', area: 'Älta', lat: 59.2660, lng: 18.1780, drop: 'B', deadline: null, who: 'Vasa Golv', contact: 'Arbetsledare Sara', code: '', tel: [{label: 'Sara', num: '0704445566'}, {label: 'Kund', num: '087778899'}], suggest: ['Sara Lind', 'Johan Ek'], req: {sig: true, name: true, pic: true}, orderNo: '481207'},
  ],
};


// ---- Skyddsnät: fel får aldrig stänga appen. Felet loggas (syns under Felsök) och appen fortsätter. ----
const CRASH_KEY = 'rutt.crashes.v1';
// Sändloggen (vad som skickades till Opter och vad Opter svarade) sparas i telefonen och följer med i Skicka orderdata.
const SENDLOG_KEY = 'rutt.sendlog.v1';
client.onLog = (l: any) => { saveJSON(SENDLOG_KEY, l); };
loadJSON(SENDLOG_KEY, []).then((l: any) => { if (Array.isArray(l) && !client.log.length) client.log = l; }).catch(() => {});
async function logCrash(e: any, where: string) {
  try {
    const list: any[] = await loadJSON(CRASH_KEY, []);
    list.unshift({at: new Date().toISOString(), where, msg: String((e && e.message) || e), stack: String((e && e.stack) || '').slice(0, 700), build: BUILD});
    await saveJSON(CRASH_KEY, list.slice(0, 12));
  } catch (x) {}
}
const g: any = globalThis as any;
if (g.ErrorUtils && !g.__ruttGuard) {
  g.__ruttGuard = true;
  const prev = g.ErrorUtils.getGlobalHandler && g.ErrorUtils.getGlobalHandler();
  g.ErrorUtils.setGlobalHandler((e: any, isFatal?: boolean) => {
    logCrash(e, isFatal ? 'fatal' : 'fel');
    if (!isFatal && prev) prev(e, isFatal); // icke-fatala: som vanligt. Fatala: svälj så appen lever vidare.
  });
}
class Guard extends React.Component<{children: any}, {err: any}> {
  state = {err: null as any};
  static getDerivedStateFromError(err: any) { return {err}; }
  componentDidCatch(err: any) { logCrash(err, 'vy'); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <View style={{flex: 1, backgroundColor: C.bg, justifyContent: 'center', padding: 28}}>
        <Text style={{color: C.ink, fontSize: 22, fontWeight: '800'}}>Något gick snett</Text>
        <Text style={{color: C.dim, fontSize: 14, marginTop: 8, lineHeight: 20}}>Felet är sparat så det kan rättas. Inget av ditt arbete har försvunnit.</Text>
        <Text style={{color: C.faint, fontSize: 12, marginTop: 12}} numberOfLines={4}>{String(this.state.err && this.state.err.message || this.state.err)}</Text>
        <Pressable onPress={() => this.setState({err: null})} style={{backgroundColor: C.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 22}}>
          <Text style={{color: C.onAccent, fontSize: 16, fontWeight: '800'}}>Fortsätt</Text>
        </Pressable>
      </View>
    );
  }
}

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <Guard>
        <AppInner />
      </Guard>
    </SafeAreaProvider>
  );
}

function AppInner(): React.JSX.Element {
  const [step, setStep] = useState<'login' | 'pick' | 'route'>('login');
  const [tab, setTab] = useState<'nytt' | 'plan' | 'klart' | 'last' | 'chat'>('plan');
  const [msgs, setMsgs] = useState<any[]>([]);
  const [msgText, setMsgText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('');
  const [demo, setDemo] = useState(false);
  const [manual, setManual] = useState<{day: string; keys: string[]} | null>(null);
  const [startId, setStartId] = useState('vb');
  const START = STARTS.find(x => x.id === startId) || STARTS[0];
  useEffect(() => { loadJSON('rutt.start.v1', null).then((v: any) => { if (v && STARTS.some(x => x.id === v)) setStartId(v); }); }, []);
  const pickStart = (id: string) => { setStartId(id); saveJSON('rutt.start.v1', id); };
  const [manualLater, setManualLater] = useState<{day: string; keys: string[]} | null>(null); // din ordning för en kommande dag (yyyy-mm-dd)
  const [travelVer, setTravelVer] = useState(0); // nya riktiga körtider / ny inlärd faktor → räkna om rutten
  const [planDay, setPlanDay] = useState<'idag' | 'imorgon'>('idag');
  // Dela → RUTT: bild eller PDF från en annan app (t.ex. Inomecs sedel i Meddelanden) öppnas direkt.
  const [shared, setShared] = useState<any[]>([]);
  useEffect(() => {
    const SMSM: any = NM.RuttSms; if (!SMSM || !SMSM.getShared) return;
    const take = () => SMSM.getShared().then((l: any[]) => { if (l && l.length) setShared(x => [...x, ...l.filter(m => m.kind !== 'text')]); }).catch(() => {});
    take();
    const a = DeviceEventEmitter.addListener('ruttSms', (ev: any) => { if (ev && ev.type === 'shared') take(); });
    const b = AppState.addEventListener('change', (st: string) => { if (st === 'active') take(); });
    return () => { a.remove(); b.remove(); };
  }, []);
  // Egna jobb (sedlar från Joel som du gjort till stopp). Klara jobb äldre än en vecka rensas.
  const [egna, setEgna] = useState<Egen[]>([]);
  const egnaLoaded = useRef(false);
  useEffect(() => { loadJSON(EGNA_KEY, []).then((v: any) => { const wk = new Date(Date.now() - 7 * 86400000); const lim = `${wk.getFullYear()}-${String(wk.getMonth() + 1).padStart(2, '0')}-${String(wk.getDate()).padStart(2, '0')}`; setEgna(Array.isArray(v) ? v.filter((e: any) => e && e.day >= lim) : []); egnaLoaded.current = true; }); }, []);
  const saveEgna = (f: (l: Egen[]) => Egen[]) => setEgna(l => { const n = f(l); if (egnaLoaded.current) saveJSON(EGNA_KEY, n); return n; });
  const [sedelFor, setSedelFor] = useState<{media?: any; job?: Egen} | null>(null);
  const [smsOpter, setSmsOpter] = useState(false); // Lastat/Lossat-SMS även för Opter-order (Inställningar)
  useEffect(() => { loadJSON('rutt.smsopter.v1', false).then((v: any) => setSmsOpter(!!v)); }, []);
  const [klartView, setKlartView] = useState<'idag' | 'dagbok'>('idag');

  // Arbetstid, stopp-status och POD
  const [work, setWork] = useState<'igång' | 'rast' | 'lunch' | 'slut'>('igång');
  const [workSince, setWorkSince] = useState<number>(0); // när rasten/lunchen började
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => { loadJSON('rutt.work.v1', null).then((v: any) => { if (v && v.day === new Date().toDateString() && v.state) { setWork(v.state); setWorkSince(v.since || 0); } }); }, []);
  useEffect(() => { if (work === 'igång') return; const t = setInterval(() => setNowTick(Date.now()), work === 'slut' ? 15000 : 1000); return () => clearInterval(t); }, [work]);
  const [workSheet, setWorkSheet] = useState(false);
  // Orderstatus per order (cid): {loadedAt, doneAt, pod}. Sparas lokalt per dag.
  const [ost, setOst] = useState<Record<string, any>>({});
  const [newState, setNewState] = useState<Record<string, 'sending' | 'failed' | 'forwarding'>>({});
  const [rejectFor, setRejectFor] = useState<any>(null);
  const [forwardFor, setForwardFor] = useState<any>(null);
  const [names, setNames] = useState<Record<string, string[]>>({}); // sparade mottagarnamn per företag
  const [signStop, setSignStop] = useState<any>(null); // stopp som signeras just nu
  const [editFor, setEditFor] = useState<{cid: string; st: any; done: boolean; start?: number | null} | null>(null); // order som ändras (Klart eller planen)
  const addTimers = useRef<Record<string, any>>({}); // tillägg valda vid lossning – skickas när Ångra gått ut
  const [toast, setToast] = useState<{text: string; undo: (() => void) | null} | null>(null);
  const [claudeSend, setClaudeSend] = useState<{text: string; state: 'busy' | 'ok' | 'err'} | null>(null); // Skicka till Claude – syns hela vägen
  const toastTimer = useRef<any>(null);
  const [diag, setDiag] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [crashes, setCrashes] = useState<any[]>([]);
  const podMem = useRef<Record<string, any>>({}); // bilddata hålls i minnet, inte i lagringen
  // GPS (som Opter: skickas till kontoret med serverns intervall, även med släckt skärm)
  const [gpsOn, setGpsOn] = useState(true);
  const [gps, setGps] = useState<{state: 'av' | 'startar' | 'nekad' | 'söker' | 'ok' | 'fel'; sentAt?: number; acc?: number}>({state: 'av'});
  const [gpsRoutePos, setGpsRoutePos] = useState<any>(null); // position som rutten räknas från (uppdateras vid > 1 km förflyttning)
  const [diagBusy, setDiagBusy] = useState(false);
  // Ljust / mörkt: Auto följer telefonen. Sparas på telefonen.
  const [themePref, setThemePref] = useState<'auto' | 'dark' | 'light'>('auto');
  const sysScheme = useColorScheme();
  const mode = themePref === 'auto' ? (sysScheme === 'light' ? 'light' : 'dark') : themePref;
  if (C.mode !== mode) applyTheme(mode);
  useEffect(() => { loadJSON('rutt.theme', 'auto').then((v: any) => { if (v === 'dark' || v === 'light' || v === 'auto') setThemePref(v); }); }, []);
  function pickTheme(v: 'auto' | 'dark' | 'light') { setThemePref(v); saveJSON('rutt.theme', v); }
  const [navApp, setNavAppState] = useState<NavApp>('google');
  useEffect(() => { loadJSON('rutt.nav', 'google').then((v: any) => { if (v === 'waze' || v === 'google') setNavAppState(v); }); }, []);
  function pickNav(v: NavApp) { setNavAppState(v); setNavApp(v); }
  // Statusraden: inloggad mot Opter? GPS-tjänsten (med fast notis) igång? Hastighet för kör-läget.
  const [online, setOnline] = useState<'ja' | 'nej' | 'åter'>('nej');
  const [gpsStat, setGpsStat] = useState<{running: boolean; notif: boolean; locOn: boolean} | null>(null);
  const [kbOpen, setKbOpen] = useState(false);
  const reconnecting = useRef(false);
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', () => setKbOpen(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setKbOpen(false));
    return () => { a.remove(); b.remove(); };
  }, []);
  // Skicka rådata från Opter (via telefonens dela-meny → Gmail till dig själv) så Claude kan läsa den.
  // Data till Claude via din Gmail. Android klarar ungefär 1 MB text mellan appar (och Gmail dubblar den) →
  // högst ~90 000 tecken: viktigast först (sändlogg, order, statusar, kvittenser), resten kortas bort men JSON hålls hel.
  const withTimeout = <T,>(p: Promise<T>, ms: number, what: string) => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(what + ' svarade inte på ' + Math.round(ms / 1000) + ' s')), ms))]);
  async function mailToClaude(subject: string, d: any) {
    const MAX = 90000;
    const prio = ['Shipment', 'ShipmentStatusLog', 'ShipmentPod', 'ShipmentPackagePod', 'DefaultPodType', 'ShipmentStatus', 'ShipmentPodType', 'ShipmentPackage', 'Setting', 'Office', 'ResourceStatusLog'];
    let rows: any[] = (d.rows || []).filter((r: any) => prio.includes(r.t || r.table));
    rows.sort((x: any, y: any) => prio.indexOf(x.t || x.table) - prio.indexOf(y.t || y.table));
    rows = rows.filter((r: any) => (r.t || r.table) !== 'Setting' || /pod|permission|status|give/i.test(String((r.c && r.c.name) || '')));
    let log = (d.sendLog || []).slice(-40);
    const pack = () => JSON.stringify({...d, rows, sendLog: log, rowsLeft: (d.rows || []).length - rows.length});
    let json = pack();
    while (json.length > MAX && rows.length) { rows = rows.slice(0, Math.floor(rows.length * 0.8)); json = pack(); }
    while (json.length > MAX && log.length > 5) { log = log.slice(-Math.floor(log.length * 0.7)); json = pack(); }
    setClaudeSend({text: 'Öppnar Gmail…', state: 'busy'});
    try {
      if (!(NativeModules.RuttSms && NativeModules.RuttSms.email)) throw new Error('mejl saknas i den här versionen');
      await NativeModules.RuttSms.email('kenta81@gmail.com', subject, json);
    } catch (e) {
      await Share.share({title: subject, message: json}); // reserv: telefonens dela-meny
    }
    setClaudeSend({text: `Gmail öppnad (${Math.round(json.length / 1024)} kB) – tryck Skicka i Gmail`, state: 'ok'});
    setTimeout(() => setClaudeSend(c => (c && c.state === 'ok' ? null : c)), 20000);
  }
  async function sendDump() {
    setDiag(false); // stäng Inställningar direkt så det som händer syns
    if (!client.logon) { setClaudeSend({text: 'Inte inloggad mot Opter – logga in först', state: 'err'}); return; }
    setDiagBusy(true);
    setClaudeSend({text: 'Hämtar data från Opter…', state: 'busy'});
    try {
      let d: any;
      try { d = await withTimeout(client.dump(), 20000, 'Opter'); } catch (e: any) { d = {app: 'RUTT', rows: [], note: 'kunde inte hämta från Opter: ' + String(e?.message || e)}; }
      d.crashes = await loadJSON(CRASH_KEY, []);
      d.build = BUILD;
      d.sendLog = client.log;
      d.diag = (client as any).diag || [];
      d.local = Object.fromEntries(Object.entries(ost).map(([k, o]: any) => [k, {...o, pod: o && o.pod ? {name: o.pod.name, typeId: o.pod.typeId, kolli: o.pod.kolli, photos: (o.pod.photos || []).length, sigStrokes: o.pod.sig ? (o.pod.sig.strokes || []).length : 0} : null}]));
      await mailToClaude('RUTT-DATA helbild ' + new Date().toLocaleTimeString('sv-SE').slice(0, 5), d);
    } catch (e: any) { setClaudeSend({text: 'Kunde inte skicka: ' + String(e?.message || e), state: 'err'}); }
    finally { setDiagBusy(false); }
  }

  const [server, setServer] = useState('foriase.opter.cloud');
  const [port, setPort] = useState('443');
  const [path, setPath] = useState('mobile');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');

  const [resources, setResources] = useState<{resId: number; name: string}[]>([]);
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState<{cargo: any; stops: any[]; perm?: any; opts?: any}>({cargo: {}, stops: []});
  // Folket på jobbet: aktiva förare + trafikledningens nummer ur Opter (sparas så listan finns även offline).
  const [team, setTeam] = useState<{drivers: {resId: number; name: string}[]; dispatchPhone: string}>({drivers: [], dispatchPhone: ''});
  useEffect(() => { loadJSON('rutt.team.v1', null).then((v: any) => { if (v && v.drivers) setTeam(v); }); }, []);
  useEffect(() => {
    const d = client.lastDecoded; if (!d) return;
    try { const t = P.team(d, client.logon); if (t.drivers.length || client.logon) { setTeam(t); saveJSON('rutt.team.v1', t); } } catch (e) {}
  }, [orders]);
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [loginGear, setLoginGear] = useState(false);
  useEffect(() => { loadJSON('rutt.remember', true).then((v: any) => setRemember(v !== false)); }, []);

  const filtered = useMemo(
    () => (query ? resources.filter(r => r.name.toLowerCase().includes(query.toLowerCase())) : resources),
    [resources, query],
  );

  // Dagens order sparas i telefonen. Opter slutar skicka en order när kontoret klarmarkerat den, men Opter Driver
  // visar den ändå under Klart resten av dagen (lokalt sparad) – RUTT gör likadant.
  const [dayCache, setDayCache] = useState<{day: string; stops: Record<string, any>; cargo: Record<string, any>}>({day: '', stops: {}, cargo: {}});
  const dayLoaded = useRef(false);
  useEffect(() => { loadJSON('rutt.daystops.v1', null).then((v: any) => { if (v && v.day === new Date().toDateString()) setDayCache(c => ({day: v.day, stops: {...(v.stops || {}), ...c.stops}, cargo: {...(v.cargo || {}), ...c.cargo}})); dayLoaded.current = true; }); }, []);
  useEffect(() => {
    if (demo || !orders.stops.length) return;
    setDayCache(c => {
      const day = new Date().toDateString();
      const base = c.day === day ? c : {day, stops: {}, cargo: {}};
      const stops = {...base.stops}, cargo = {...base.cargo, ...orders.cargo};
      for (const x of orders.stops) stops[(x.pickup ? 'p' : 'd') + String(x.pickup || x.drop)] = x;
      const n = {day, stops, cargo};
      if (dayLoaded.current) saveJSON('rutt.daystops.v1', n);
      return n;
    });
  }, [orders, demo]);
  const ordersAll: any = useMemo(() => {
    if (demo) return orders;
    const have = new Set(orders.stops.map((x: any) => String(x.pickup || x.drop)));
    const extra = Object.values(dayCache.stops).filter((x: any) => {
      const cid = String(x.pickup || x.drop);
      if (have.has(cid)) return false;
      const L = x.live || {};
      return !!((ost[cid] && ost[cid].doneAt) || L.tab === 'done' || L.serverDone); // bara klara order ligger kvar
    }).map((x: any) => ({...x, live: x.live ? {...x.live, gone: true} : x.live}));
    return extra.length ? {...orders, cargo: {...dayCache.cargo, ...orders.cargo}, stops: [...orders.stops, ...extra]} : orders;
  }, [orders, dayCache, ost, demo]);
  const baseSrc: any = demo ? DEMO : ordersAll.stops.length ? ordersAll : null; // demo går att slå på när som helst (Inställningar)
  // Egna jobb blandas in som vanliga order: samma plan, lastplan, Klart och dagbok – men skickas aldrig till Opter.
  const fullSrc: any = useMemo(() => {
    if (!egna.length) return baseSrc;
    const st = egna.flatMap(e => toStops(e)); const cg: any = {}; for (const e of egna) cg[e.id] = cargoOf(e);
    return baseSrc ? {...baseSrc, stops: [...baseSrc.stops, ...st], cargo: {...baseSrc.cargo, ...cg}} : {stops: st, cargo: cg, perm: null, opts: null};
  }, [baseSrc, egna]);
  // ---- Var hör varje order hemma? Opters regler (live.tab) + dina tryck i RUTT ----
  const cidsAll: string[] = useMemo(() => (fullSrc ? [...new Set(fullSrc.stops.map((s: any) => String(s.pickup || s.drop)))] as string[] : []), [fullSrc]);
  const legs = (cid: string) => ({pick: fullSrc.stops.find((s: any) => String(s.pickup) === cid), drop: fullSrc.stops.find((s: any) => String(s.drop) === cid)});
  const classOf = (cid: string): 'new' | 'todo' | 'done' | 'hidden' => {
    const o = ost[cid] || {};
    if (o.rejectedAt || o.givenAt) return 'hidden';
    const {pick, drop} = legs(cid);
    const L = (pick && pick.live) || (drop && drop.live);
    const t0 = L ? L.tab : 'todo'; // demo: allt är att göra
    if (o.doneAt) return 'done';
    if (t0 === 'new' || t0 === 'revoked') return o.acceptedAt ? 'todo' : 'new';
    return t0;
  };
  const cls = useMemo(() => { const m: Record<string, string> = {}; for (const c of cidsAll) m[c] = classOf(c); return m; }, [cidsAll, ost, fullSrc]);
  const newOrders = useMemo(() => cidsAll.filter(c => cls[c] === 'new').map(cid => ({cid, ...legs(cid), state: newState[cid]})), [cidsAll, cls, newState]);
  const doneOrders = useMemo(() => cidsAll.filter(c => cls[c] === 'done').map(cid => {
    const {pick, drop} = legs(cid); const st = drop || pick || {}; const o = ost[cid] || {}; const L = st.live || {};
    return {cid, st, who: st.who, adr: st.adr, area: st.area, orderNo: st.orderNo, doneAt: o.doneAt || L.doneAt || null, pod: o.pod, edits: o.edits || [],
      sync: o.sync && o.sync.unload, byOpter: !o.doneAt, rejected: /nekad/i.test(String(L.cur || '')), locked: !!(L.locked || (L.edit && L.edit.completed))};
  }).concat(demo ? [] : Object.keys(ost).filter(cid => !cidsAll.includes(cid) && ost[cid] && ost[cid].doneAt && !ost[cid].rejectedAt && !ost[cid].givenAt).map(cid => {
    // Lossad i RUTT men finns inte längre hos Opter (kontoret har klarmarkerat den) – visas ur det RUTT sparat, som i Opter.
    const o = ost[cid] || {};
    const st = {who: o.who || '', orderNo: cid, drop: cid, verb: 'Lämna', gone: true};
    return {cid, st, who: o.who || '', adr: '', area: '', orderNo: cid, doneAt: o.doneAt, pod: o.pod, edits: o.edits || [], sync: o.sync && o.sync.unload, byOpter: false, rejected: false, locked: true};
  })).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)), [cidsAll, cls, ost, demo]);
  // Dagens plan: "att göra"-ordrar. Steg som ska göras en senare dag läggs under "Senare dagar".
  const {src, later} = useMemo(() => {
    if (!fullSrc) return {src: null as any, later: [] as any[]};
    const keep: any[] = [], lat: any[] = [];
    for (const c of cidsAll) {
      if (cls[c] !== 'todo') continue;
      const {pick, drop} = legs(c);
      if (pick && isFutureDay(pick.tEarliest)) { lat.push(pick); if (drop) lat.push(drop); continue; }
      if (pick) keep.push(pick);
      if (drop) { if (isFutureDay(drop.tEarliest)) lat.push(drop); else keep.push(drop); }
    }
    return {src: {cargo: fullSrc.cargo, stops: keep}, later: lat};
  }, [fullSrc, cidsAll, cls]);
  const live = !demo && (orders.stops.length > 0 || online === 'ja'); // skarpt läge = inloggad mot Opter (även utan order)
  // Står ordern redan som Lastad i Opter (t.ex. satt i Opter Driver)?
  const serverLoaded = (s: any) => !!(s.live && s.live.loadSt && s.live.curId === s.live.loadSt.id);
  const route = useMemo(() => {
    if (!src) return null;
    // Klara steg ut ur planeringen; lastat gods räknas som ombord.
    const stops = TRAVEL.withGeo(src.stops).map((s: any) => {
      const o = ost[s.pickup || s.drop] || {};
      const sDone = !!(s.live && s.live.serverDone);
      return {...s, done: s.pickup ? !!(o.loadedAt || o.doneAt || serverLoaded(s) || sDone) : !!(o.doneAt || sDone)};
    });
    // Där du står nu = senast avklarade steg.
    let cur: any = null, last = 0;
    for (const s of src.stops) {
      const o = ost[s.pickup || s.drop] || {};
      const at = s.pickup ? o.loadedAt : o.doneAt;
      if (at && at > last && s.lat != null) { last = at; cur = {lat: s.lat, lng: s.lng}; }
    }
    if (gpsRoutePos && Date.now() - gpsRoutePos.time < 10 * 60000) cur = {lat: gpsRoutePos.lat, lng: gpsRoutePos.lng};
    const anyDone = Object.keys(ost).length > 0;
    const now = demo && !anyDone ? new Date(new Date().setHours(6, 0, 0, 0)).getTime() : Date.now();
    try {
      return computeRoute(stops, src.cargo, {...START, cur}, now, manual ? manual.keys : null);
    } catch (e: any) {
      return {error: String(e?.message || e)};
    }
  }, [src, ost, gpsRoutePos, manual, travelVer, startId]);

  // Kommande dagars order planeras också (från startadressen, första dagens morgon) – så lastplanen vet i vilken
  // ordning du hämtar och kan ställa godset rätt. Samma optimerare som idag, med omlastning inräknad.
  const laterRoute = useMemo(() => {
    if (!later.length) return null;
    const days = later.map((s: any) => (s.tEarliest && s.tEarliest.date) || (s.tLatest && s.tLatest.date)).filter(Boolean).sort();
    const t0 = days.length ? new Date(days[0] + 'T06:00').getTime() : Date.now() + 86400000;
    const stops = TRAVEL.withGeo(later).map((s: any) => { const o = ost[s.pickup || s.drop] || {}; return {...s, done: s.pickup ? !!(o.loadedAt || serverLoaded(s)) : !!o.doneAt}; });
    const day = days.length ? days[0] : '';
    const keys = manualLater && manualLater.day === day ? manualLater.keys : null;
    try { const r: any = computeRoute(stops, fullSrc.cargo, {...START, cur: null}, t0, keys); r.day = day; return r; } catch (e) { return null; }
  }, [later, ost, fullSrc, manualLater, travelVer, startId]);

  // Lastplanen: allt som ska med i bilen – ombord, dagens hämtningar och kommande dagars order.
  const loadOrders = useMemo(() => {
    if (!fullSrc) return [] as any[];
    return cidsAll.filter(c => cls[c] === 'todo').map(cid => {
      const {pick, drop} = legs(cid); const o = ost[cid] || {};
      const onboard = !pick || !!o.loadedAt || serverLoaded(pick) || !!(pick.live && pick.live.serverDone);
      return {cid, pick, drop, onboard};
    });
  }, [fullSrc, cidsAll, cls, ost]);

  // Ladda/spara orderstatus (per dag, demo separat) och sparade namn.
  const ostLoaded = useRef<string | null>(null);
  // Din egen körordning (dragen med handen). Gäller dagen ut, demo separat. null = smart ordning.
  const MANUAL_KEY = demo ? 'rutt.manual.demo' : 'rutt.manual.v1';
  useEffect(() => {
    Promise.all([loadJSON(MANUAL_KEY, null), loadJSON(MANUAL_KEY + '.later', null)]).then(([v, l]: any) => {
      // Ordningen du lade kvällen innan blir dagens ordning när dagen kommer.
      if (v && v.day === new Date().toDateString()) setManual(v);
      else if (l && l.day === DB.ymdOf()) { const t = {day: new Date().toDateString(), keys: l.keys}; setManual(t); saveJSON(MANUAL_KEY, t); }
      else setManual(null);
      setManualLater(l && l.day > DB.ymdOf() ? l : null);
    });
  }, [MANUAL_KEY]);
  function saveManualLater(keys: string[] | null) {
    const day = laterRoute && laterRoute.day; if (!day) return;
    const v = keys ? {day, keys} : null;
    setManualLater(v); saveJSON(MANUAL_KEY + '.later', v);
    flash(keys ? 'Din ordning för imorgon sparad' : 'Smart ordning igen', null);
  }
  // Riktiga körtider (OpenStreetMap) för alla adresser i dagens och kommande dagars plan. Utan nät: uppskattning.
  useEffect(() => { TRAVEL.init({load: loadJSON, save: saveJSON}).then(() => TRAVEL.initGeo()).then(() => setTravelVer(v => v + 1)); }, []);
  // Adresser som Opter skickat utan koordinater slås upp (OpenStreetMap), annars blir körtiden 0 och rutten blind.
  useEffect(() => { if (demo || !fullSrc) return; let alive = true; TRAVEL.geocode(fullSrc.stops).then((n: number) => { if (alive && n) setTravelVer(v => v + 1); }); return () => { alive = false; }; }, [fullSrc, demo]);
  const travelPts = useMemo(() => {
    const pts: any[] = [{lat: START.lat, lng: START.lng}];
    for (const x of TRAVEL.withGeo([...((src && src.stops) || []), ...later])) if (x && x.lat != null) pts.push({lat: x.lat, lng: x.lng});
    if (gpsRoutePos) pts.push({lat: gpsRoutePos.lat, lng: gpsRoutePos.lng});
    return pts;
  }, [src, later, travelVer, startId, gpsRoutePos && Math.round(gpsRoutePos.lat * 200), gpsRoutePos && Math.round(gpsRoutePos.lng * 200)]);
  useEffect(() => { if (demo) return; let alive = true; TRAVEL.ensure(travelPts).then((ch: boolean) => { if (alive && ch) setTravelVer(v => v + 1); }); return () => { alive = false; }; }, [travelPts, demo]);
  // RUTT lär sig av dina riktiga tider (dagboken, senaste 30 dagarna).
  const [learnInfo, setLearnInfo] = useState<{factor: number; samples: number}>({factor: 1, samples: 0});
  const relearn = async () => {
    const idx = (await DB.listDays()).slice(-30);
    const days = await Promise.all(idx.map(DB.loadDay));
    const res = TRAVEL.learn(DB.legsFrom(days, (pal: number) => SERVICE_MIN + Math.round(PAL_MIN * pal)), baseDriveMin);
    setLearnInfo(res); setTravelVer(v => v + 1);
  };
  useEffect(() => { relearn(); const off = DB.onChange(() => { relearn(); }); return off; }, [travelVer > 0]);
  function saveManual(keys: string[] | null) {
    const v = keys ? {day: new Date().toDateString(), keys} : null;
    setManual(v); saveJSON(MANUAL_KEY, v);
    flash(keys ? 'Din ordning sparad' : 'Smart ordning igen', null);
  }
  useEffect(() => { loadJSON(NAMES_KEY, {}).then(n => setNames(n || {})); }, []);
  useEffect(() => {
    // Dagens sparade orderstatus laddas direkt (även utan order från Opter) – annars blir Klart tomt.
    const key = ORDERS_KEY(!!demo);
    if (ostLoaded.current === key) return;
    ostLoaded.current = key;
    loadJSON(key, {}).then(v => setOst(v || {}));
  }, [demo]);
  useEffect(() => { if (ostLoaded.current) saveJSON(ostLoaded.current, ost); }, [ost]);

  function flash(text: string, undo: (() => void) | null) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({text, undo});
    toastTimer.current = setTimeout(() => setToast(null), 8000);
  }
  // Lastad: raden byter till LOSSA och sorteras in i körordningen.
  // ---- Skicka status till Opter: väntar tills "Ångra" gått ut, sen exakt en gång + kontroll ----
  const sendTimers = useRef<Record<string, any>>({});
  const sendChain = useRef<Promise<any>>(Promise.resolve());
  const setSync = (cid: string, step: 'load' | 'unload', state: string) =>
    setOst(o => ({...o, [cid]: {...(o[cid] || {}), sync: {...((o[cid] && o[cid].sync) || {}), [step]: state}}}));
  // Lossad/Lastad väntar 8 s (Ångra) och skickas sen. Går RUTT i bakgrunden (t.ex. du byter till Opter) skickas allt
  // som väntar DIREKT – Android pausar annars RUTT:s klockor i bakgrunden och då skulle inget gå iväg.
  function queueSend(cid: string, step: 'load' | 'unload', run: () => Promise<any>) {
    const key = cid + step;
    if (sendTimers.current[key]) clearTimeout(sendTimers.current[key].t);
    setSync(cid, step, 'waiting');
    const fire = () => {
      if (!sendTimers.current[key] || sendTimers.current[key].fire !== fire) return;
      clearTimeout(sendTimers.current[key].t);
      delete sendTimers.current[key];
      setSync(cid, step, 'sending');
      // En sändning i taget mot Opter – 14 order på en gång köas i stället för att skickas samtidigt.
      sendChain.current = sendChain.current.catch(() => {}).then(async () => {
        try {
          const r = await run();
          setSync(cid, step, r.confirmed ? (r.noPod ? 'nopod' : r.imageDropped ? 'ok-noimg' : 'ok') : 'unconfirmed');
          if (r.rutt && r.rutt.stops && r.rutt.stops.length) setOrders(r.rutt);
        } catch (e) { setSync(cid, step, 'failed'); }
      });
    };
    sendTimers.current[key] = {t: setTimeout(fire, 8200), fire};
  }
  const cancelSend = (cid: string, step: string) => { const x = sendTimers.current[cid + step]; if (x) { clearTimeout(x.t); delete sendTimers.current[cid + step]; } };
  const flushSends = () => {
    for (const k of Object.keys(sendTimers.current)) { const x = sendTimers.current[k]; if (x) x.fire(); }
    for (const k of Object.keys(addTimers.current)) { const x = addTimers.current[k]; if (x) x.fire(); }
  };
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st: string) => { if (st !== 'active') flushSends(); });
    return () => sub.remove();
  }, []);
  function sendLoad(st: any) {
    const L = st.live;
    if (!live || !L || !L.loadSt) return;
    queueSend(st.pickup, 'load', () => client.setStatus(L, L.loadSt.id, null));
  }
  // Lossad → Opter, byte för byte som Opter Driver (registerPod + setShipmentStatus i samma synk).
  async function sendUnload(st: any, pod: any) {
    const L = st.live;
    if (!live || !L || !L.unloadSt) return;
    const podData = await podPayload(L, pod);
    const hadPod = !!(pod && (pod.name || (pod.sig && pod.sig.strokes && pod.sig.strokes.length)));
    // Opter tar bara emot en kvittens med en kvittenstyp. Saknas den → säg det, låtsas inte att den kom fram.
    if (!podData && hadPod) flash('Kvittensen kom inte med – ordern saknar kvittenstyp i Opter', null);
    queueSend(st.drop, 'unload', async () => { const r = await client.setStatus(L, L.unloadSt.id, podData); return (!podData && hadPod && r.confirmed) ? {...r, noPod: true} : r; });
  }
  // Kvittensen som sparades vid lossningen (signatur + namn) skickas till Opter igen, utan ny signatur.
  // En order till Claude (från Klart eller planen): serverns rader för ordern + vad RUTT skickat + det RUTT har sparat.
  async function sendOrderDump(cid: string, st: any) {
    if (!client.logon) { setClaudeSend({text: 'Inte inloggad mot Opter – logga in först', state: 'err'}); return; }
    setClaudeSend({text: 'Hämtar ordern från Opter…', state: 'busy'});
    try {
      // Finns ordern inte längre i Opters lista skickas hela helbilden + hela sändloggen i stället.
      const L = st && st.live;
      let d: any;
      try { d = await withTimeout<any>((L ? client.orderDump(L.shiId) : client.dump()) as Promise<any>, 20000, 'Opter'); } catch (e: any) { d = {rows: [], fresh: false, note: String(e?.message || e)}; }
      if (!L) d.sendLog = client.log;
      const o = ost[cid] || {};
      const local = {...o, pod: o.pod ? {...o.pod, photos: (o.pod.photos || []).length, sig: o.pod.sig ? {strokes: (o.pod.sig.strokes || []).length, points: (o.pod.sig.strokes || []).reduce((n: number, x: any[]) => n + x.length, 0)} : null} : null};
      const body = JSON.stringify({app: 'RUTT', kind: 'order', at: new Date().toISOString(), build: BUILD, cid, shiId: L ? L.shiId : null, orderNo: (st && st.orderNo) || null,
        live: L ? {key: L.key, curId: L.curId, unloadSt: L.unloadSt, loadSt: L.loadSt, podType: L.podType, hasSpt: L.hasSpt, packageIds: L.packageIds} : null,
        fresh: d.fresh, local, sendLog: d.sendLog, rows: d.rows});
      await mailToClaude(`RUTT-DATA order ${(st && st.orderNo) || cid}`, JSON.parse(body));
    } catch (e: any) { setClaudeSend({text: 'Kunde inte skicka: ' + String(e?.message || e), state: 'err'}); }
  }
  async function resendSavedPod(cid: string, st: any) {
    const pod = podMem.current[cid] || (ost[cid] || {}).pod;
    if (!pod) { flash('Ingen sparad kvittens på ordern', null); return; }
    const L = st && st.live;
    const pd = live && L ? await podPayload(L, pod) : null;
    if (live && L && !pd) { flash('Ordern saknar kvittenstyp i Opter', null); return; }
    sendEdit(cid, st, {pod: pd}, `Sparad kvittens${pod.name ? ' · ' + pod.name : ''}`);
  }
  // Blev något liggande osänt (RUTT stängdes under Ångra-väntan eller mitt i)? Skicka när vi är inloggade igen –
  // men bara om Opter inte redan har statusen (då blir inget dubbelt).
  const resumed = useRef(false);
  useEffect(() => {
    if (!live || resumed.current || !orders.stops.length) return;
    resumed.current = true;
    for (const cid of Object.keys(ost)) {
      const o = ost[cid] || {}, sy = o.sync || {};
      if (sendTimers.current[cid + 'unload'] || sendTimers.current[cid + 'load']) continue;
      const left = (v: any) => v === 'waiting' || v === 'sending';
      const drop = orders.stops.find((x: any) => String(x.drop) === String(cid));
      const pick = orders.stops.find((x: any) => String(x.pickup) === String(cid));
      if (o.doneAt && left(sy.unload) && drop && drop.live) {
        if (drop.live.unloadSt && drop.live.curId === drop.live.unloadSt.id) setSync(cid, 'unload', 'ok'); else retrySync(cid);
      } else if (o.loadedAt && !o.doneAt && left(sy.load) && pick && pick.live) {
        if (pick.live.loadSt && pick.live.curId === pick.live.loadSt.id) setSync(cid, 'load', 'ok'); else retrySync(cid);
      }
    }
  }, [live, orders]);
  function retrySync(cid: string) {
    const o = ost[cid] || {};
    const pick = fullSrc && fullSrc.stops.find((s: any) => String(s.pickup) === String(cid));
    const drop = fullSrc && fullSrc.stops.find((s: any) => String(s.drop) === String(cid));
    if (o.doneAt && drop) sendUnload(drop, podMem.current[cid] || o.pod || {});
    else if (o.loadedAt && pick) sendLoad(pick);
  }

  async function setOrderStatus(o: any, which: 'accept' | 'reject') {
    const L = (o.pick && o.pick.live) || (o.drop && o.drop.live);
    const target = L && (which === 'accept' ? L.acceptSt : L.rejectSt);
    const mark = () => setOst(x => ({...x, [o.cid]: {...(x[o.cid] || {}), [which === 'accept' ? 'acceptedAt' : 'rejectedAt']: Date.now()}}));
    if (!live || !target) { mark(); flash(which === 'accept' ? 'Accepterad' : 'Nekad', null); return; }
    setNewState(s => ({...s, [o.cid]: 'sending'}));
    try {
      const r = await client.setStatus(L, target.id, null);
      if (r.confirmed) {
        mark();
        setNewState(s => { const n = {...s}; delete n[o.cid]; return n; });
        if (r.rutt && r.rutt.stops) setOrders(r.rutt);
        flash(which === 'accept' ? `Accepterad · ${(o.pick && o.pick.who) || ''}` : 'Nekad', null);
        if (which === 'accept') setTab('plan');
      } else setNewState(s => ({...s, [o.cid]: 'failed'}));
    } catch (e) { setNewState(s => ({...s, [o.cid]: 'failed'})); }
  }

  // Skicka vidare (Opters "Ge bort") till en annan förare i åkeriet.
  async function forwardOrder(o: any, d: any) {
    const L = (o.pick && o.pick.live) || (o.drop && o.drop.live);
    const first = d.name.split(' ')[0];
    const mark = () => setOst(x => ({...x, [o.cid]: {...(x[o.cid] || {}), givenAt: Date.now(), givenTo: d.name}}));
    if (!live || !L) { mark(); flash(`Demo · skickad till ${first}`, null); return; }
    setNewState(s => ({...s, [o.cid]: 'forwarding'}));
    try {
      const r = await client.giveAway(L, d);
      if (r.confirmed) {
        mark(); setNewState(s => { const n = {...s}; delete n[o.cid]; return n; });
        if (r.rutt && r.rutt.stops) setOrders(r.rutt);
        flash(`Skickad till ${first} i Opter`, null);
      } else { setNewState(s => ({...s, [o.cid]: 'failed'})); flash('Opter tog inte emot – ordern ligger kvar hos dig', null); }
    } catch (e) { setNewState(s => ({...s, [o.cid]: 'failed'})); flash('Kunde inte nå Opter – ordern ligger kvar hos dig', null); }
  }

  // Lastad – en eller flera order på samma ställe på en gång. Ångra tar tillbaka alla.
  // Dagboken: ordern som den såg ut när du körde.
  function dayOrderOf(cid: string): any {
    const {pick, drop} = fullSrc ? legs(cid) : ({} as any);
    const c = (fullSrc && fullSrc.cargo && fullSrc.cargo[cid]) || {};
    const s = drop || pick || {};
    return {cid, orderNo: s.orderNo || null, freightBill: s.freightBill || null, pickWho: pick ? pick.who : '', pickAdr: pick ? [pick.adr, pick.area].filter(Boolean).join(', ') : '',
      dropWho: drop ? drop.who : '', dropAdr: drop ? [drop.adr, drop.area].filter(Boolean).join(', ') : '', pal: Number(c.pal) || 0, kg: Number(c.kg) || 0};
  }
  function onLoaded(st: any, more: any[] = []) {
    const list = [st, ...more];
    const prev: Record<string, any> = {};
    for (const x of list) prev[x.pickup] = ost[x.pickup];
    const at = Date.now();
    setOst(o => { const n = {...o}; for (const x of list) n[x.pickup] = {...(o[x.pickup] || {}), loadedAt: at}; return n; });
    list.forEach(x => sendLoad(x));
    smsLater(list.map(x => ({st: x, cid: String(x.pickup)})), 'load', at, '');
    if (!demo) for (const x of list) { const cid = String(x.pickup); const d = dayOrderOf(cid); DB.logEvent({t: at, kind: 'load', cid, who: x.who, lat: x.lat, lng: x.lng, pal: d.pal}); DB.saveOrder(DB.ymdOf(at), {...d, loadedAt: at}); }
    flash(list.length > 1 ? `Lastad · ${list.length} order hos ${st.who || ''}` : `Lastad · ${st.who || 'order'}`, () => {
      if (!demo) list.forEach(x => DB.unlogEvent(String(x.pickup), 'load', at));
      list.forEach(x => { cancelSend(x.pickup, 'load'); smsCancel(String(x.pickup), 'load'); });
      setOst(o => { const n = {...o}; for (const x of list) { if (prev[x.pickup]) n[x.pickup] = prev[x.pickup]; else delete n[x.pickup]; } return n; });
    });
  }
  // ---- Ändra en order (Klart eller planen): status, tillägg, ändring, avvikelse, bild, ny kvittens → Opter ----
  // Ett tryck på "Skicka till Opter" = en sändning, köad efter övriga. Historiken syns på ordern.
  const b64buf = (x: any) => (x && x.b64 ? Buffer.from(x.b64, 'base64') : null);
  function setEditState(cid: string, id: string, state: string) {
    setOst(o => { const cur = o[cid] || {}; return {...o, [cid]: {...cur, edits: (cur.edits || []).map((h: any) => (h.id === id ? {...h, state, at: state === 'ok' ? Date.now() : h.at} : h))}}; });
  }
  function sendEdit(cid: string, st: any, edit: any, label: string) {
    const id = String(Date.now()) + Math.random().toString(36).slice(2, 6);
    const L = st && st.live;
    const s0 = edit._status;
    setOst(o => {
      const cur = {...(o[cid] || {})};
      cur.edits = [...(cur.edits || []), {id, label, at: Date.now(), state: live && L ? 'sending' : 'demo'}];
      // Ny status gäller direkt i RUTT: tillbaka till Lastad = in i planen igen, Lossad = till Klart.
      if (s0) {
        if (s0.delivery && !s0.pickup) { cur.doneAt = Date.now(); cur.loadedAt = cur.loadedAt || Date.now(); }
        else if (s0.pickup) { delete cur.doneAt; cur.loadedAt = Date.now(); }
        else { delete cur.doneAt; delete cur.loadedAt; }
        cur.sync = {};
      }
      return {...o, [cid]: cur};
    });
    if (!live || !L) { flash(`Demo · ${label} (skickas inte)`, null); return; }
    const payload: any = {
      statusId: edit.statusId || 0,
      addServices: edit.addServices || [],
      changes: edit.changes || [],
      damages: (edit.damages || []).map((d: any) => ({...d, images: (d.images || []).map((im: any) => ({name: im.name, bytes: b64buf(im)})).filter((im: any) => im.bytes)})),
      images: (edit.images || []).map((im: any) => ({comment: im.comment, orderId: im.orderId, bytes: b64buf(im)})).filter((im: any) => im.bytes),
      pod: edit.pod || null,
    };
    flash(`Skickar till Opter · ${label}`, null);
    sendChain.current = sendChain.current.catch(() => {}).then(async () => {
      try {
        const r = await client.editShipment(L, payload);
        setEditState(cid, id, r.confirmed ? 'ok' : 'unconfirmed');
        if (r.rutt && r.rutt.stops && r.rutt.stops.length) setOrders(r.rutt);
        flash(r.confirmed ? `Klart i Opter · ${label}` : `Opter bekräftade inte · ${label}`, null);
      } catch (e) { setEditState(cid, id, 'failed'); flash(`Kunde inte nå Opter · ${label}`, null); }
    });
  }
  // Kvittensen som Opter vill ha den (samma som vid Lossad).
  async function podPayload(L: any, pod: any) {
    const scale = PixelRatio.get();
    const first = (pod.photos || [])[0];
    const typeId = pod.typeId || (L.podType && L.podType.id) || 0;
    let pos: any = null;
    try { const l = NativeModules.RuttLocation && (await NativeModules.RuttLocation.getLast()); if (l && l.lat && Date.now() - l.time < 10 * 60000) pos = l; } catch (e) {}
    return typeId ? {
      sptId: L.hasSpt ? 0 : -typeId, dptId: L.hasSpt ? typeId : 0,
      sptIdSub: !L.hasSpt && pod.subId ? pod.subId : 0, dptIdSub: L.hasSpt && pod.subId ? pod.subId : 0,
      name: pod.name || '', remark: pod.comment || '', comment: pod.comment2 || '',
      signature: pod.sig ? P.signatureString(pod.sig.strokes, scale) : '',
      packageCount: pod.kolli != null ? pod.kolli : null,
      lat: pos ? pos.lat : null, lng: pos ? pos.lng : null,
      image: first && first.b64 ? Buffer.from(first.b64, 'base64') : null,
    } : null;
  }
  function onAvised(cid: string) { setOst(o => ({...o, [cid]: {...(o[cid] || {}), avisedAt: Date.now()}})); }

  // Lossad: kvittensen sparas, ordern flyttar till Klart, namnet minns till nästa gång.
  // Lossad – samma kvittens (signatur/namn/foto) gäller alla order som lossas på stället. Kollin räknas per order.
  async function onSigned(st0: any, pod0: any) {
    if (st0.ownSign) { setSignStop(null); ownSigned(st0.ownSign, pod0); return; }
    // Ny kvittens på en order som redan är lossad: bara kvittensen, statusen rörs inte (som Opter).
    if (st0.repod) {
      setSignStop(null);
      const cid = st0.drop;
      setOst(o => ({...o, [cid]: {...(o[cid] || {}), pod: {...pod0, photos: (pod0.photos || []).map((x: any) => ({uri: x.uri}))}}}));
      podMem.current[cid] = pod0;
      const L = st0.live;
      const pd = live && L ? await podPayload(L, pod0) : null;
      if (live && L && !pd) { flash('Ordern saknar kvittenstyp i Opter', null); return; }
      sendEdit(cid, st0, {pod: pd}, `Ny kvittens${pod0.name ? ' · ' + pod0.name : ''}`);
      return;
    }
    const list = st0.group && st0.group.length ? st0.group : [st0];
    const many = list.length > 1;
    const prev: Record<string, any> = {};
    for (const x of list) prev[x.drop] = ost[x.drop];
    setSignStop(null);
    setOst(o => {
      const n = {...o};
      for (const st of list) {
        const cid = st.drop, pod = many ? {...pod0, kolli: st.kolli != null ? st.kolli : null} : pod0;
        n[cid] = {...(o[cid] || {}), who: st.who, loadedAt: (o[cid] && o[cid].loadedAt) || Date.now(), doneAt: Date.now(), extras: pod.extras || (o[cid] && o[cid].extras), kolli: pod.kolli, pod: {...pod, photos: (pod.photos || []).map((x: any) => ({uri: x.uri}))}};
      }
      return n;
    });
    const doneT = Date.now();
    for (const st of list) {
      const pod = many ? {...pod0, kolli: st.kolli != null ? st.kolli : null} : pod0;
      podMem.current[st.drop] = pod;
      sendUnload(st, pod);
      if (!demo) { const cid = String(st.drop); const d = dayOrderOf(cid); DB.logEvent({t: doneT, kind: 'unload', cid, who: st.who, lat: st.lat, lng: st.lng, pal: d.pal}); DB.saveOrder(DB.ymdOf(doneT), {...d, doneAt: doneT, podName: pod.name || '', kolli: pod.kolli != null ? pod.kolli : null}); }
      // Tid (timjobb) från kvittensen: skickas som Opters "Tid" (minuter) när Ångra gått ut, på första ordern.
      if (pod0.timeMin && st === list[0] && st.live) {
        const tm = pod0.timeMin, key = st.drop + ':tid';
        if (addTimers.current[key]) clearTimeout(addTimers.current[key].t);
        const fireTid = () => { if (!addTimers.current[key] || addTimers.current[key].fire !== fireTid) return; clearTimeout(addTimers.current[key].t); delete addTimers.current[key]; sendEdit(st.drop, st, {changes: [{cet: 34, kind: 'dec', value: String(tm)}]}, `Tid ${tm >= 60 ? Math.floor(tm / 60) + ' h ' : ''}${tm % 60 ? (tm % 60) + ' min' : ''}`.trim()); };
        addTimers.current[key] = {t: setTimeout(fireTid, 8400), fire: fireTid};
      }
      // Tillägg valda i kvittensen skickas när Ångra gått ut (samma väntan som Lossad).
      const adds = (pod0.adds || []).filter((a: any) => a.satId);
      // Gäller hela stoppet → läggs på första ordern (en väntetid debiteras en gång), som när man gör det i Opter.
      if (adds.length && st === list[0]) {
        const mine = adds;
        {
          if (addTimers.current[st.drop]) clearTimeout(addTimers.current[st.drop].t);
          const fireAdd = () => { if (!addTimers.current[st.drop] || addTimers.current[st.drop].fire !== fireAdd) return; clearTimeout(addTimers.current[st.drop].t); delete addTimers.current[st.drop]; sendEdit(st.drop, st, {addServices: mine.map((a: any) => ({satId: a.satId, number: a.number, descr: ''}))}, 'Tillägg: ' + mine.map((a: any) => a.name + (a.number ? ' ' + a.number : '')).join(', ')); };
          addTimers.current[st.drop] = {t: setTimeout(fireAdd, 8400), fire: fireAdd};
        }
      }
    }
    smsLater(list.map((x: any) => ({st: x, cid: String(x.drop)})), 'unload', doneT, pod0.name || '');
    if (pod0.name) setNames(n => { const nn = rememberName(n, st0.who, pod0.name); saveJSON(NAMES_KEY, nn); return nn; });
    flash(many ? `Lossad · ${list.length} order hos ${st0.who || ''}` : `Lossad · ${st0.who || 'order'}`, () => {
      if (!demo) list.forEach((x: any) => { DB.unlogEvent(String(x.drop), 'unload', doneT); DB.saveOrder(DB.ymdOf(doneT), {cid: String(x.drop), doneAt: undefined}); });
      list.forEach((x: any) => { cancelSend(x.drop, 'unload'); smsCancel(String(x.drop), 'unload'); const tk = x.drop + ':tid'; if (addTimers.current[tk]) { clearTimeout(addTimers.current[tk].t); delete addTimers.current[tk]; } if (addTimers.current[x.drop]) { clearTimeout(addTimers.current[x.drop].t); delete addTimers.current[x.drop]; } });
      setOst(o => { const n = {...o}; for (const x of list) { if (prev[x.drop]) n[x.drop] = prev[x.drop]; else delete n[x.drop]; } return n; });
    });
  }

  // Inloggningen sparas på telefonen efter första gången: server, användare, lösenord och ditt namn.
  const LOGIN_KEY = 'rutt.login.v1';
  const savedLogin = useRef<any>(null);
  useEffect(() => {
    loadJSON(LOGIN_KEY, null).then((v: any) => {
      if (!v || !v.user || !v.pass) return;
      savedLogin.current = v;
      setServer(v.server || server); setPort(v.port || port); setPath(v.path || path); setUser(v.user); setPass(v.pass);
      if (v.name) setDriverName(v.name);
      login(v);
    });
    // Android-krasch från förra körningen? Läs in den, spara bland felen och visa under Felsök.
    (async () => {
      let list: any[] = await loadJSON(CRASH_KEY, []);
      try {
        const CL = NativeModules.CrashLog;
        const nat = CL && (await CL.getLast());
        if (nat) {
          const first = String(nat).split('\n').slice(1).find((l: string) => l.trim()) || String(nat);
          list = [{at: new Date().toISOString(), where: 'android', msg: first.slice(0, 200), stack: String(nat).slice(0, 3000), build: BUILD}, ...list].slice(0, 12);
          await saveJSON(CRASH_KEY, list);
          await CL.clear();
        }
      } catch (e) {}
      setCrashes(list || []);
    })();
  }, []);

  async function login(v?: any) {
    const cfg = v || {server, port, path, user, pass};
    setErr(''); setBusy(true);
    setStatus(v && v.name ? `Välkommen tillbaka ${v.name} – loggar in…` : 'Ansluter och loggar in…');
    try {
      await client.connect({server: String(cfg.server).trim(), port: String(cfg.port).trim(), app: String(cfg.path).trim(), https: true});
      const info = await client.doLogon({user: String(cfg.user).trim(), pass: cfg.pass});
      if (!info.ok) throw new Error('Inloggning nekad – kolla användarnamn/lösenord');
      savedLogin.current = {...(savedLogin.current || {}), server: cfg.server, port: cfg.port, path: cfg.path, user: String(cfg.user).trim(), pass: cfg.pass};
      setStatus('Hämtar förarlista…');
      await client.syncRef();
      if (info.needChoose) {
        const list = client.resources();
        setResources(list);
        const prevRes = savedLogin.current && savedLogin.current.resId;
        const hit = prevRes && list.find((r: any) => r.resId === prevRes);
        if (hit) await pull(hit.resId, hit.name); else setStep('pick');
      } else await pull(info.resId, info.name);
    } catch (e: any) { setErr(String(e?.message || e)); }
    finally { setBusy(false); }
  }
  async function pull(resId: number, name?: string) {
    setBusy(true); setStatus(name ? `Hej ${name.split(' ')[0]} – hämtar dina jobb…` : 'Hämtar dina jobb…');
    try {
      const {rutt} = await client.startWork(resId);
      setOrders(rutt); setMsgs(client.messages()); setStep('route');
      // Dagboken: första inloggningen för dagen = Start.
      DB.loadDay(DB.ymdOf()).then(d => { if (!d.events.some(e => e.kind === 'start')) DB.logEvent({t: Date.now(), kind: 'start'}); });
      const nm = name || (savedLogin.current && savedLogin.current.name) || '';
      setDriverName(nm);
      savedLogin.current = {...(savedLogin.current || {}), resId, name: nm};
      // Kom ihåg mig (som Opter Driver): annars sparas inget på telefonen.
      saveJSON(LOGIN_KEY, remember ? savedLogin.current : null);
    }
    catch (e: any) { setErr(String(e?.message || e)); }
    finally { setBusy(false); }
  }
  async function logout() {
    setDiag(false);
    try { await client.disconnect(); } catch (e) {}
    savedLogin.current = null; saveJSON(LOGIN_KEY, null);
    try { NativeModules.RuttLocation && NativeModules.RuttLocation.stop(); } catch (e) {}
    setPass(''); setDriverName(''); setOrders({cargo: {}, stops: []}); setMsgs([]); setDemo(false); setStep('login');
  }
  // Logga ut = allt stängs: Opter-sessionen, GPS-tjänsten och appen. Nästa gång loggar du in på nytt.
  async function logoutAndClose() {
    await logout();
    setTimeout(() => { try { BackHandler.exitApp(); } catch (e) {} }, 300);
  }

  // ---- I bakgrunden: håll JS vaken (Opter-anslutningen pingar, nya uppdrag kommer fram) ----
  useEffect(() => {
    const RL: any = NativeModules.RuttLocation;
    if (!RL || !RL.keepAlive || Platform.OS !== 'android') return;
    RL.keepAlive(step === 'route' && live).then((v: any) => dlog('håll vaken: ' + v)).catch((e: any) => dlog('håll vaken fel: ' + String(e?.message || e)));
  }, [step, live]);
  // ---- Nytt uppdrag → notis på låsskärmen (som Opter). En gång per order; inte i demo. ----
  // Anropas direkt från hämtningen (fungerar även när appen ligger i bakgrunden) och från listan när den ändras.
  // cid → senaste notis. Står uppdraget kvar som nytt (inte bekräftat) påminner RUTT var 15:e minut, som Opter.
  const notified = useRef<Record<string, number> | null>(null);
  const ostRef = useRef<any>({}); ostRef.current = ost;
  async function announce(list: {cid: string; pick: any; drop: any}[]) {
    if (demo) return;
    const RL: any = NativeModules.RuttLocation;
    if (!notified.current) { const v: any = await loadJSON('rutt.notified.v2', {}); notified.current = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
    const now = Date.now(), N = notified.current!;
    const fresh = list.filter(o => !((ostRef.current[o.cid] || {}).acceptedAt) && (!N[o.cid] || now - N[o.cid] > 15 * 60000));
    if (!fresh.length) return;
    const again = fresh.every(o => N[o.cid]);
    fresh.forEach(o => { N[o.cid] = now; });
    const keys = Object.keys(N).sort((a, b) => N[b] - N[a]).slice(0, 300); const keep: Record<string, number> = {}; keys.forEach(k => { keep[k] = N[k]; }); notified.current = keep;
    saveJSON('rutt.notified.v2', keep);
    const line = (o: any) => { const p = o.pick || {}, d = o.drop || {}; const t = p.tEarliest && p.tEarliest.hhmm ? ` ${p.tEarliest.hhmm}` : ''; return `Hämta ${p.who || p.adr || '—'}${p.area ? ', ' + p.area : ''}${t} → ${d.who || d.adr || '—'}${d.area ? ', ' + d.area : ''}`; };
    const title = (fresh.length === 1 ? 'Nytt uppdrag' : `${fresh.length} nya uppdrag`) + (again ? ' – väntar på svar' : '');
    dlog((again ? 'påminnelse: ' : 'nya uppdrag: ') + fresh.map(o => o.cid).join(',') + ' · ' + AppState.currentState);
    if (RL && RL.notify) RL.notify(4800 + (Number(String(fresh[0].cid).replace(/\D/g, '').slice(-4)) || 0), title, fresh.map(line).join('\n')).then((v: any) => dlog('notis visad: ' + v)).catch((e: any) => dlog('notis fel: ' + String(e?.message || e)));
  }
  useEffect(() => { if (live) announce(newOrders as any); }, [newOrders, demo, live]);
  // ---- GPS: be om behörighet, starta tjänsten, skicka senaste position med serverns intervall ----
  useEffect(() => { loadJSON('rutt.gps.v1', true).then((v: any) => setGpsOn(v !== false)); }, []);
  useEffect(() => {
    const RL = NativeModules.RuttLocation;
    if (!RL || Platform.OS !== 'android') return;
    if (step !== 'route' || !live || !gpsOn) { RL.stop().catch(() => {}); setGps({state: 'av'}); return; }
    let alive = true, timer: any = null, lastSent = 0;
    const kmBetween = (a: any, b: any) => { const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r; return Math.sqrt(x * x + y * y) * 6371; };
    (async () => {
      setGps({state: 'startar'});
      try {
        const fine = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
          title: 'RUTT behöver din position', message: 'Kontoret ser var du är, precis som i Opter Driver. Positionen skickas bara när du är inloggad.', buttonPositive: 'OK',
        });
        if (Number(Platform.Version) >= 33) { try { await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS' as any); } catch (e) {} }
        if (fine !== PermissionsAndroid.RESULTS.GRANTED) { if (alive) setGps({state: 'nekad'}); return; }
        const sec = client.positionInterval();
        await RL.start(sec);
        if (alive) setGps({state: 'söker'});
        const tick = async () => {
          try {
            const l = await RL.getLast();
            if (l && l.time > lastSent) {
              await client.sendPosition(l);
              lastSent = l.time;
              if (!alive) return;
              setGps({state: 'ok', sentAt: Date.now(), acc: l.acc});
              setGpsRoutePos((prev: any) => (!prev || kmBetween(prev, l) > 1 || Date.now() - prev.time > 9 * 60000 ? {lat: l.lat, lng: l.lng, time: Date.now()} : prev));
            }
          } catch (e) { if (alive) setGps(g => ({...g, state: 'fel'})); }
        };
        await tick();
        timer = setInterval(tick, sec * 1000);
      } catch (e) { if (alive) setGps({state: 'fel'}); }
    })();
    return () => { alive = false; if (timer) clearInterval(timer); };
  }, [step, live, gpsOn]);
  function toggleGps() { const v = !gpsOn; setGpsOn(v); saveJSON('rutt.gps.v1', v); }
  useEffect(() => {
    if (step !== 'route') { setOnline('nej'); return; }
    const RL = NativeModules.RuttLocation;
    let alive = true;
    const tick = async () => {
      const ok = !!(client.logon && (client.logon as any).ok);
      const up = ok && client._alive && client._alive();
      if (alive) setOnline(!ok ? 'nej' : up ? 'ja' : 'åter');
      // Tappad kontakt (t.ex. efter att telefonen sovit): anslut igen direkt i stället för att vänta på nästa hämtning.
      if (ok && !up && !reconnecting.current) {
        reconnecting.current = true;
        try { await client.relogin(); const {rutt, msgs: fresh} = await client.poll(); if (alive) { if (rutt && rutt.stops && rutt.stops.length) setOrders(rutt); setMsgs(fresh); setOnline('ja'); } } catch (e) {}
        reconnecting.current = false;
      }
      if (!RL) return;
      try { const st = RL.status && (await RL.status()); if (alive && st) setGpsStat(st); } catch (e) {}
    };
    tick();
    const iv = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(iv); };
  }, [step]);

  // Vibrera när en ny order kommer in.
  const lastNew = useRef(0);
  useEffect(() => {
    if (step === 'route' && newOrders.length > lastNew.current) { try { Vibration.vibrate([0, 350, 180, 350]); } catch (e) {} }
    lastNew.current = newOrders.length;
  }, [newOrders.length, step]);

  const unread = msgs.filter(m => m.received && !m.confirmed).length;
  const jobbet = useJobbet({team, me: driverName, enabled: step === 'route'});
  const navInset = useSafeAreaInsets().bottom;

  async function openChat() { setTab('chat'); }
  async function markOpterRead() {
    const toRead = msgs.filter(m => m.received && !m.confirmed).map(m => m.key);
    if (toRead.length) { try { await client.markRead(toRead); setMsgs(client.messages()); } catch (e) {} }
  }
  // Skicka: visas direkt som "Skickar…", blir "Skickat" eller "Ej skickat – tryck igen".
  const [pending, setPending] = useState<any[]>([]);
  async function deliver(item: any) {
    setPending(p => p.map(x => (x.id === item.id ? {...x, state: 'sending'} : x)));
    try {
      const {msgs: m, stored} = await client.sendMessage(item.text);
      setMsgs(m);
      setPending(p => p.map(x => (x.id === item.id ? {...x, state: stored ? 'stored' : 'unconfirmed'} : x)));
    } catch (e: any) {
      setPending(p => p.map(x => (x.id === item.id ? {...x, state: 'failed'} : x)));
    }
  }
  async function sendMsg() {
    const t = msgText.trim();
    if (!t) return;
    setMsgText('');
    if (demo || !client.logon) { setErr('Logga in mot Opter för att skicka meddelanden.'); return; }
    const item = {id: Date.now() + Math.random(), text: t, created: new Date(), received: false, state: 'sending', local: true};
    setPending(p => [...p, item]);
    deliver(item);
  }
  // Ta bort lokala bubblor så fort serverns egen kopia av meddelandet finns (aldrig dubbelt).
  const chatList = useMemo(() => {
    const mine = msgs.filter(m => !m.received);
    const keep = pending.filter(pm => !(pm.state !== 'failed' && pm.state !== 'sending' && mine.some(m => m.text === pm.text && m.created && Math.abs(m.created.getTime() - pm.created.getTime()) < 15 * 60000)));
    return [...msgs, ...keep].sort((a, b) => (a.created ? a.created.getTime() : 0) - (b.created ? b.created.getTime() : 0));
  }, [msgs, pending]);


  // "Säg till" från ett ställe: Kontoret (chatten i Opter), chefen och trafikledningen (SMS, samma som under Jobbet).
  const chefC = jobbet.contacts.find((c: any) => c.name === jobbet.chef && c.num) || null;
  const tellTo: any[] = [
    {id: 'office', name: 'Kontoret', sub: 'Chatten i Opter', icon: 'headset'},
    ...(chefC ? [{id: 'chef', name: chefC.name.split(' ')[0] + ' · chef', sub: 'SMS · ' + prettyPhone(chefC.num), icon: 'star-fill'}] : []),
    ...(jobbet.tl ? [{id: 'tl', name: 'Trafikledningen', sub: 'SMS · ' + prettyPhone(jobbet.tl), icon: 'telephone-fill'}] : []),
  ];
  function tell(id: string, text: string) {
    const t = text.trim(); if (!t) return;
    if (id === 'office') {
      if (demo || !client.logon) { flash('Demo · skickas inte till Kontoret', null); return; }
      const item = {id: Date.now() + Math.random(), text: t, created: new Date(), received: false, state: 'sending', local: true};
      setPending(p => [...p, item]);
      deliver(item);
      flash('Skickat till Kontoret', null);
    } else if (id === 'chef' && chefC) { jobbet.send(chefC, t); flash(`SMS till ${chefC.name.split(' ')[0]}`, null); }
    else if (id === 'tl' && jobbet.tl) { jobbet.send({name: 'Trafikledningen', num: jobbet.tl, kind: 'tl'}, t); flash('SMS till trafikledningen', null); }
  }

  // ---- SMS till chefen: Lastat ✅ / Lossat ✅. Skickas när Ångra gått ut (8 s), aldrig dubbelt. ----
  const smsTimers = useRef<Record<string, any>>({});
  function smsLater(items: {st: any; cid: string}[], what: 'load' | 'unload', at: number, podName: string) {
    if (demo || !chefC) return;
    for (const {st, cid} of items) {
      const e: Egen | null = st.own || null;
      if (e ? !e.sms : !smsOpter) continue;
      if (e && e.sent && e.sent[what]) continue;
      const key = cid + ':' + what;
      if (smsTimers.current[key]) clearTimeout(smsTimers.current[key]);
      smsTimers.current[key] = setTimeout(() => {
        delete smsTimers.current[key];
        const cur = e ? egnaRef.current.find(x => x.id === e.id) || e : null;
        const text = cur ? statusSms(cur, what, {at, podName, me: driverName}) : opterSms(st, what, {at, podName, me: driverName, pal: Number(((fullSrc && fullSrc.cargo[cid]) || {}).pal) || 0});
        jobbet.send(chefC, text);
        if (cur) saveEgna(l => l.map(x => (x.id === cur.id ? {...x, sent: {...(x.sent || {}), [what]: Date.now()}} : x)));
        flash(`${what === 'load' ? 'Lastat' : 'Lossat'} ✅ skickat till ${chefC.name.split(' ')[0]}`, null);
      }, 8600);
    }
  }
  function smsCancel(cid: string, what: string) { const k = cid + ':' + what; if (smsTimers.current[k]) { clearTimeout(smsTimers.current[k]); delete smsTimers.current[k]; } }
  const egnaRef = useRef<Egen[]>([]); egnaRef.current = egna;
  function ownStatus(e: Egen, what: 'way' | 'here' | 'late') {
    if (!chefC) { flash('Välj chef under Jobbet → Folk först', null); return; }
    jobbet.send(chefC, statusSms(e, what, {me: driverName}));
    flash(`SMS till ${chefC.name.split(' ')[0]}`, null);
  }
  // Kvittens på sedeln: namn, datum, tid, hämtad av och signaturen ritas på sidan (eller i en list under den).
  async function ownSigned(e: Egen, pod: any) {
    const SM: any = NM.RuttSms;
    const page = e.media ? (e.media.kind === 'pdf' ? (e.media.pageUris || [])[0] : e.media.uri) : null;
    const now = new Date(); const two = (n: number) => String(n).padStart(2, '0');
    const date = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`, time = `${two(now.getHours())}:${two(now.getMinutes())}`;
    const name = (pod && pod.name) || '';
    let image: string | undefined;
    if (page && SM && SM.fillSedel) {
      try {
        const L: any[] = (e.ocr && e.ocr.lines) || []; const W = (e.ocr && e.ocr.w) || 1400, Hh = (e.ocr && e.ocr.h) || 2000;
        const nm = (re: RegExp, after?: any) => L.find(l => re.test(String(l.t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')) && (!after || l.y > after.y - 4));
        const sf = nm(/^signatur f/), nf = nm(/^namnf/, sf), dt = nm(/^datum/, nf || sf), ha = nm(/^h.mtad av|^hamtad av/, sf), td = nm(/^tid\b/, nf || sf);
        const sig = pod && pod.sig && pod.sig.strokes && pod.sig.strokes.length ? pod.sig : null;
        if (e.kind === 'inomec-hamt' && nf && dt && ha && td) {
          const sz = Math.max(14, nf.h * 1.05), base = (l: any) => l.y + l.h * 0.9;
          const texts = [
            {t: name, x: nf.x + nf.w + W * 0.02, y: base(nf), size: sz}, {t: date, x: dt.x + dt.w + W * 0.03, y: base(dt), size: sz},
            {t: driverName || '', x: ha.x, y: base(nf), size: sz}, {t: time, x: td.x + td.w + W * 0.03, y: base(td), size: sz},
          ].filter(x => x.t);
          const top = (sf ? sf.y : nf.y) - Hh * 0.03, bot = dt.y + dt.h + Hh * 0.02;
          image = await SM.fillSedel(page, texts, sig ? {...sig, box: {x: W * 0.70, y: top, w: W * 0.22, h: bot - top}} : null, null);
        } else {
          const foot = [`Kvitterat ${date} kl ${time}`, name ? `Namnförtydligande: ${name}` : '', `Hämtad av: ${driverName || ''}`, [e.title, e.ref].filter(Boolean).join(' ')].filter(Boolean);
          image = await SM.fillSedel(page, [], sig, foot);
        }
      } catch (x) { flash('Kunde inte fylla i sedeln – kvittensen är sparad ändå', null); }
    }
    const signed = {name, sig: pod && pod.sig, at: Date.now(), image};
    saveEgna(l => l.map(x => (x.id === e.id ? {...x, signed} : x)));
    if (name) setNames(n => { const nn = rememberName(n, e.pick.name, name); saveJSON(NAMES_KEY, nn); return nn; });
    setSedelFor({job: {...e, signed}});
    flash(image ? 'Sedeln är ifylld – skicka den till Joel nedan' : 'Kvittensen är sparad', null);
  }
  function shareSigned(e: Egen) {
    const SM: any = NM.RuttSms;
    if (!e.signed || !e.signed.image || !SM || !SM.shareImage) return;
    SM.shareImage(e.signed.image, chefC ? chefC.num : '', statusSms(e, 'load', {me: driverName})).catch(() => flash('Kunde inte öppna Meddelanden', null));
  }
  const openOwn = (cid: string) => { const e = egna.find(x => x.id === cid); if (e) setSedelFor({job: e}); };

  // Arbetstid → Opter (live). RST-typ + nytt visningsläge.
  async function doWork(rst: number, newState: 'igång' | 'rast' | 'lunch' | 'slut') {
    const since = Date.now();
    setWork(newState); setWorkSince(since); setNowTick(since);
    saveJSON('rutt.work.v1', {day: new Date().toDateString(), state: newState, since});
    DB.logEvent({t: since, kind: newState});
    setWorkSheet(false);
    if (live) { try { await client.workStatus(rst); } catch (e) {} }
  }

  // Live-uppdatering: servern säger till (StartServerInitiatedSync) när nåt ändrats
  // → hämta färska jobb + chatt direkt. Även en lugn backup-poll var 30:e sek.
  useEffect(() => {
    if (step !== 'route') return;
    let alive = true;
    let busy = 0; // när pågående hämtning startade (0 = ingen)
    async function refresh(why = 'tid') {
      if (busy) {
        // Hänger en hämtning (svar som aldrig kom)? Efter 45 s: börja om anslutningen.
        if (Date.now() - busy > 45000) { dlog('hämtningen hängde – börjar om'); client.reset(); busy = 0; } else return;
      }
      busy = Date.now();
      dlog('hämtar (' + why + ')');
      try {
        const {rutt, msgs: fresh} = await client.poll();
        if (!alive) return;
        const nNew = rutt && rutt.stops ? new Set(rutt.stops.filter((x: any) => x.live && x.live.isNew).map((x: any) => x.pickup || x.drop)).size : 0;
        dlog(`hämtat ${rutt && rutt.stops ? rutt.stops.length : 0} stopp, ${nNew} nya · ${AppState.currentState}`);
        if (rutt && rutt.stops && rutt.stops.length) setOrders(rutt);
        setMsgs(fresh);
        if (rutt && rutt.stops) {
          const by: Record<string, any> = {};
          for (const x of (rutt.stops as any[])) { if (!(x.live && x.live.tab === 'new')) continue; const c = String(x.pickup || x.drop); by[c] = by[c] || {cid: c}; if (x.pickup) by[c].pick = x; else by[c].drop = x; }
          announce(Object.values(by));
        }
      } catch (e: any) { dlog('hämtning misslyckades: ' + String(e?.message || e)); }
      finally { busy = 0; }
    }
    client.onPush = () => refresh('push');
    const iv = setInterval(() => refresh('tid'), 30000);
    // I bakgrunden pausar Android appens timers – då kommer klockan från telefonen i stället (var 20:e s).
    const RL: any = NativeModules.RuttLocation;
    if (RL && RL.ticker) RL.ticker(20).then((v: any) => dlog('klocka: ' + v)).catch((e: any) => dlog('klocka fel: ' + String(e?.message || e)));
    else dlog('klocka saknas');
    const tk = DeviceEventEmitter.addListener('ruttTick', () => { if (AppState.currentState !== 'active') refresh('klocka'); });
    return () => { alive = false; client.onPush = null; clearInterval(iv); tk.remove(); if (RL && RL.ticker) RL.ticker(0).catch(() => {}); };
  }, [step]);

  // Läskvitton på automatik: så fort chatten är öppen och det finns olästa
  // mottagna meddelanden markeras de som lästa mot Opter.
  useEffect(() => {
    if (tab !== 'chat' || step !== 'route') return;
    const toRead = msgs.filter(m => m.received && !m.confirmed).map(m => m.key);
    if (!toRead.length) return;
    (async () => {
      try { await client.markRead(toRead); setMsgs(client.messages()); } catch (e) {}
    })();
  }, [tab, msgs, step]);

  const hour = new Date().getHours();
  const hej = hour < 10 ? 'Godmorgon' : hour < 18 ? 'Hej' : 'Godkväll';
  const title = step === 'login' ? (driverName ? `Välkommen ${driverName}` : 'Logga in mot Opter') : step === 'pick' ? 'Välj ditt namn' : tab === 'chat' ? 'Jobbet' : tab === 'last' ? 'Lastplan' : tab === 'klart' ? 'Klart idag' : tab === 'nytt' ? 'Nya order' : (driverName ? `${hej} ${driverName.split(' ')[0]}` : demo ? 'Demo' : 'Dina jobb');

  return (
    <SafeAreaView style={s.safe} edges={['top']} key={'root-' + mode}>
      <MediaViewer media={shared[0] || null} title={shared.length > 1 ? `Delat till RUTT · 1 av ${shared.length}` : 'Delat till RUTT'} onClose={() => setShared(x => x.slice(1))}
        action={shared[0] ? {label: 'Gör till jobb', icon: 'plus-circle-fill', onPress: () => { const m = shared[0]; setShared(x => x.slice(1)); setSedelFor({media: m}); }} : undefined} />
      <SedelSheet media={sedelFor && sedelFor.media} job={sedelFor && sedelFor.job} chefName={chefC ? chefC.name : ''} me={driverName}
        onClose={() => setSedelFor(null)}
        onSave={(e: Egen) => { saveEgna(l => (l.some(x => x.id === e.id) ? l.map(x => (x.id === e.id ? e : x)) : [...l, e])); setSedelFor(null); flash(sedelFor && sedelFor.job ? 'Sparat' : `Lagt i planen · ${e.pick.name || e.pick.adr} → ${e.drop.name || e.drop.adr}`, null); }}
        onRemove={(id: string) => { saveEgna(l => l.filter(x => x.id !== id)); setSedelFor(null); flash('Jobbet borttaget', null); }}
        onSign={(e: Egen) => { const [p] = toStops(e); setSedelFor(null); setSignStop({...p, drop: e.id, ownSign: e, who: e.pick.name, suggest: e.pick.contact ? [e.pick.contact] : []}); }}
        onStatus={ownStatus} onShareSigned={shareSigned} />
      <StatusBar barStyle={C.mode === 'light' ? 'dark-content' : 'light-content'} backgroundColor={C.bg} />
      <View style={s.head}>
        <View style={s.headTop}>
          <Text style={s.brand}>RUTT</Text>
          <View style={{flex: 1}} />
          {step === 'route' && (() => {
            // Inloggad mot Opter?
            const on = demo ? {t: 'Demo', c: C.faint, i: 'info-circle'} : online === 'ja' ? {t: 'Inloggad', c: C.accent2, i: 'person-check-fill'} : online === 'åter' ? {t: 'Ansluter', c: C.accentInk, i: 'arrow-repeat'} : {t: 'Utloggad', c: C.bad, i: 'wifi-off'};
            // GPS-tjänsten med sin fasta notis.
            const g = !live ? null
              : !gpsOn ? {t: 'GPS av', c: C.faint, i: 'geo-fill'}
              : gps.state === 'nekad' ? {t: 'GPS nekad', c: C.bad, i: 'exclamation-triangle-fill'}
              : gpsStat && !gpsStat.locOn ? {t: 'Plats av', c: C.bad, i: 'exclamation-triangle-fill'}
              : gpsStat && !gpsStat.notif ? {t: 'Notis av', c: C.bad, i: 'exclamation-triangle-fill'}
              : gps.state === 'fel' ? {t: 'GPS fel', c: C.bad, i: 'exclamation-triangle-fill'}
              : gps.state === 'ok' && (!gpsStat || gpsStat.running) ? {t: 'GPS på', c: C.accent2, i: 'broadcast'}
              : {t: 'GPS söker', c: C.accentInk, i: 'broadcast'};
            return (
              <Pressable hitSlop={8} onPress={() => setDiag(true)} style={s.chips}>
                <View style={s.stChip}><Bi n={on.i as any} size={13} color={on.c} /><Text style={[s.stChipTxt, {color: on.c}]}>{on.t}</Text></View>
                {g && <View style={s.stChip}><Bi n={g.i as any} size={13} color={g.c} /><Text style={[s.stChipTxt, {color: g.c}]}>{g.t}</Text></View>}
              </Pressable>
            );
          })()}
          {step === 'route' && (
            <Pressable hitSlop={8} onPress={() => setWorkSheet(true)} style={[s.iconBtn, work !== 'igång' && {borderColor: C.bad, backgroundColor: C.badSoft}]}><Bi n="cup-hot-fill" size={16} color={work === 'igång' ? C.dim : C.bad} /></Pressable>
          )}
          <Pressable hitSlop={8} onPress={() => setDiag(true)} style={s.iconBtn}><Bi n="gear-fill" size={16} color={C.dim} /></Pressable>
        </View>
        <Text style={s.tag} numberOfLines={1}>{title}</Text>
      </View>

      {busy && <View style={s.busy}><ActivityIndicator color={C.accent} /><Text style={s.busyTxt}>{status}</Text></View>}
      {!!err && <View style={s.errBox}><Bi n="exclamation-circle-fill" size={15} color={C.bad} /><Text style={s.errTxt}>{err}</Text></View>}

      {step === 'login' && !busy && (
        <ScrollView contentContainerStyle={[s.wrap, {paddingTop: 18}]} keyboardShouldPersistTaps="handled">
          {/* Som Opter Driver: nummer, lösenord, Kom ihåg mig. Server och demo bakom kugghjulet uppe till höger. */}
          <Text style={s.loginSub}>Logga in med samma uppgifter som i Opter Driver</Text>
          <Text style={s.label}>Användarnummer</Text>
          <TextInput style={[s.input, s.loginIn]} value={user} onChangeText={setUser} autoCapitalize="none" autoCorrect={false} keyboardType="default" placeholder="T.ex. 3111" placeholderTextColor={C.faint} />
          <Text style={s.label}>Lösenord</Text>
          <View style={{justifyContent: 'center'}}>
            <TextInput style={[s.input, s.loginIn, {paddingRight: 52}]} value={pass} onChangeText={setPass} secureTextEntry={!showPw} autoCapitalize="none" autoCorrect={false} onSubmitEditing={() => login()} />
            <Pressable hitSlop={10} style={s.eye} onPress={() => setShowPw(v => !v)}><Bi n={showPw ? 'eye-slash' : 'eye'} size={20} color={C.dim} /></Pressable>
          </View>
          <Pressable style={s.remRow} onPress={() => { const v = !remember; setRemember(v); saveJSON('rutt.remember', v); }}>
            <View style={[s.remBox, remember && {backgroundColor: C.accent2, borderColor: C.accent2}]}>{remember ? <Bi n="check2" size={15} color="#FFFFFF" /> : null}</View>
            <Text style={s.remTxt}>Kom ihåg mig</Text>
          </Pressable>
          <Pressable style={[s.btn, s.loginBtn, !(user.trim() && pass) && {opacity: 0.45}]} disabled={!(user.trim() && pass)} onPress={() => login()}><Text style={s.btnTxt}>Logga in</Text></Pressable>
          <Pressable style={{alignSelf: 'center', padding: 14}} onPress={() => setLoginGear(true)}><Text style={s.loginLink}>Server och demo</Text></Pressable>
        </ScrollView>
      )}
      <Sheet open={loginGear} onClose={() => setLoginGear(false)} title="Server" sub="Behöver bara ändras om kontoret byter Opter-server.">
        <Text style={s.label}>Adress</Text>
        <TextInput style={s.input} value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} />
        <View style={s.row}>
          <View style={{width: 90}}><Text style={s.label}>Port</Text><TextInput style={s.input} value={port} onChangeText={setPort} keyboardType="numeric" /></View>
          <View style={{flex: 1}}><Text style={s.label}>Sökväg</Text><TextInput style={s.input} value={path} onChangeText={setPath} autoCapitalize="none" /></View>
        </View>
        <Pressable style={[s.sheetBtn, {marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8}]} onPress={() => { setLoginGear(false); setDemo(true); setStep('route'); setTab('plan'); }}>
          <Bi n="play-circle" size={16} color={C.ink} /><Text style={s.sheetBtnTxt}>Prova demo utan inloggning</Text>
        </Pressable>
      </Sheet>

      {step === 'pick' && !busy && (
        <View style={s.wrap}>
          <TextInput style={s.input} value={query} onChangeText={setQuery} placeholder="Sök ditt namn…" placeholderTextColor={C.faint} autoCapitalize="none" />
          <FlatList style={{marginTop: 10}} data={filtered} keyExtractor={r => String(r.resId)}
            renderItem={({item}) => <Pressable style={s.nameRow} onPress={() => pull(item.resId, item.name)}><Bi n="person-fill" size={16} color={C.faint} /><Text style={s.nameTxt}>{item.name}</Text></Pressable>} />
        </View>
      )}

      {step === 'route' && !busy && (
        <View style={{flex: 1}} key={mode}>
          {demo && (
            <Pressable style={s.demoBar} onPress={() => setDemo(false)}>
              <Bi n="info-circle" size={15} color={C.people} />
              <Text style={s.demoTxt}>Demo – inget skickas till Opter</Text>
              <Text style={s.demoGo}>Avsluta</Text>
            </Pressable>
          )}
          {newOrders.length > 0 && tab !== 'nytt' && (work === 'igång' || work === 'slut') && (
            <Pressable style={s.banner} onPress={() => setTab('nytt')}>
              <Bi n="bell-fill" size={16} color={C.onAccent} />
              <Text style={s.bannerTxt}>{newOrders.length === 1 ? '1 ny order' : `${newOrders.length} nya order`} väntar på svar</Text>
              <Text style={s.bannerGo}>Visa</Text><Bi n="chevron-right" size={14} color={C.onAccent} />
            </Pressable>
          )}
          {work !== 'igång' && (() => {
            // Rast / lunch: liten ruta på alla flikar – tid som går, knapp för att avsluta. Röd lampa = inte i tjänst.
            const sec = workSince ? Math.max(0, Math.floor((nowTick - workSince) / 1000)) : 0;
            const two = (x: number) => String(x).padStart(2, '0');
            const clock = sec >= 3600 ? `${Math.floor(sec / 3600)}:${two(Math.floor(sec / 60) % 60)}:${two(sec % 60)}` : `${Math.floor(sec / 60)}:${two(sec % 60)}`;
            const what = work === 'rast' ? 'Rast' : work === 'lunch' ? 'Lunch' : 'Arbetsdagen avslutad';
            const onBreak = work === 'rast' || work === 'lunch';
            const top = onBreak && tab !== 'nytt' ? newOrders[0] : null;
            return (
              <View style={{marginHorizontal: 14, marginBottom: 8}}>
                {top ? (
                  <NewOrderCard compact item={top} cargo={fullSrc ? fullSrc.cargo : {}}
                    extra={newOrders.length > 1 ? <Pressable onPress={() => setTab('nytt')}><Text style={s.moreNew}>+{newOrders.length - 1} till</Text></Pressable> : null}
                    onAccept={(o: any) => setOrderStatus(o, 'accept')} onReject={setRejectFor}
                    onForward={(orders.perm && orders.perm.giveAway === false) ? undefined : setForwardFor} />
                ) : null}
                <View style={s.breakCard}>
                  <View style={s.breakIco}><Bi n={work === 'slut' ? 'power' : 'cup-hot-fill'} size={20} color={C.bad} /></View>
                  <View style={{flex: 1, minWidth: 0}}>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}><Lamp col={C.bad} size={8} /><Text style={s.breakT}>{what}</Text></View>
                    {onBreak ? <Text style={s.breakClock}>{clock}</Text> : null}
                    <Text style={s.breakS}>{workSince ? `sedan ${hhmm(new Date(workSince))}` : ''}{live ? '' : '  ·  demo'}</Text>
                  </View>
                  <Pressable style={s.breakBtn} onPress={() => (work === 'rast' ? doWork(RST.EndBreak, 'igång') : work === 'lunch' ? doWork(RST.EndLunch, 'igång') : doWork(1, 'igång'))} android_ripple={{color: C.edge}}>
                    <Bi n={work === 'slut' ? 'play-circle' : 'stopwatch-fill'} size={16} color="#FFFFFF" />
                    <Text style={s.breakBtnT}>{work === 'slut' ? 'Återuppta' : `Avsluta ${work === 'rast' ? 'rasten' : 'lunchen'}`}</Text>
                  </Pressable>
                </View>
              </View>
            );
          })()}

          {tab === 'klart' && (
            <View style={s.segRow}>
              {([['idag', 'Idag'], ['dagbok', 'Dagbok']] as const).map(([k, t]) => (
                <Pressable key={k} style={[s.segB, klartView === k && s.segOn2]} onPress={() => setKlartView(k)}><Text style={[s.segT, klartView === k && s.segTOn]}>{t}</Text></Pressable>
              ))}
            </View>
          )}
          {tab === 'klart' && klartView === 'dagbok' && <DagbokView me={driverName || 'RUTT'} onSms={chefC ? (text: string) => { jobbet.send(chefC, text); flash(`Dagrapport till ${chefC.name.split(' ')[0]}`, null); } : undefined} />}
          {tab === 'klart' && klartView === 'idag' && <DoneView done={doneOrders} onRetry={retrySync} onOpen={(d: any) => (isEgen(d.cid) ? openOwn(d.cid) : setEditFor({cid: d.cid, st: d.st, done: true, start: (ost[d.cid] || {}).loadedAt || null}))} />}
          {tab === 'nytt' && <NewOrdersView orders={newOrders} cargo={fullSrc ? fullSrc.cargo : {}} onAccept={(o: any) => setOrderStatus(o, 'accept')} onReject={(o: any) => setOrderStatus(o, 'reject')} onForward={(orders.perm && orders.perm.giveAway === false) ? undefined : setForwardFor} />}
          <RejectSheet o={rejectFor} onClose={() => setRejectFor(null)} onReject={(o: any) => setOrderStatus(o, 'reject')} />
          <ForwardSheet o={forwardFor} drivers={team.drivers} onClose={() => setForwardFor(null)} onForward={forwardOrder} />

          {tab === 'plan' && later.length > 0 && (
            <View style={s.segRow}>
              {([['idag', 'Idag'], ['imorgon', laterRoute && laterRoute.day ? 'Imorgon · ' + new Date(laterRoute.day + 'T12:00').toLocaleDateString('sv-SE', {weekday: 'short', day: 'numeric'}) : 'Imorgon']] as const).map(([k, t]) => (
                <Pressable key={k} style={[s.segB, planDay === k && s.segOn2]} onPress={() => setPlanDay(k)}><Text style={[s.segT, planDay === k && s.segTOn]}>{t}</Text></Pressable>
              ))}
            </View>
          )}
          {tab === 'plan' && planDay === 'imorgon' && later.length > 0 && <PlanDay route={laterRoute} cargo={fullSrc ? fullSrc.cargo : {}} onReorder={saveManualLater} starts={STARTS} startId={startId} onStart={pickStart} />}
          {tab === 'plan' && (planDay === 'idag' || !later.length) && !orders.stops.length && !demo && (
            <View style={s.emptyBox}>
              <Bi n="inbox-fill" size={30} color={C.faint} />
              <Text style={s.empty}>Inga aktiva jobb just nu.</Text>
              <Pressable style={s.ghost} onPress={() => setDemo(true)}><Text style={s.ghostTxt}>Visa demo så du ser planen</Text></Pressable>
            </View>
          )}

          {tab === 'plan' && (planDay === 'idag' || !later.length) && route && !(route as any).error && (
            <OrdersView route={route} cargo={src.cargo} ost={ost} allStops={src.stops} onLoaded={onLoaded} onUnload={(st: any, more: any[] = []) => setSignStop(more.length ? {...st, group: [st, ...more]} : st)} onEdit={(cid: string, st: any) => (isEgen(cid) ? openOwn(cid) : setEditFor({cid, st, done: false, start: (ost[cid] || {}).loadedAt || null}))} onAvised={onAvised} onRetry={retrySync} live={live} later={later} onReorder={saveManual} perm={demo ? null : orders.perm} tellTo={tellTo} onTell={tell} />
          )}
          {tab === 'last' && src && <LoadView orders={loadOrders} cargo={src.cargo} route={route && !(route as any).error ? route : null} laterRoute={laterRoute} />}
          {tab === 'chat' && <JobbetView j={jobbet} onMakeJob={(m: any) => setSedelFor({media: m})} live={live} opterUnread={unread} opterLast={chatList[chatList.length - 1]} onOpenOpter={markOpterRead}
            opterView={<ChatView msgs={chatList} msgText={msgText} setMsgText={setMsgText} onSend={sendMsg} onRetry={deliver} />} />}
          {(tab === 'plan' || tab === 'last') && route && (route as any).error && <Text style={s.errTxt}>Optimeringsfel: {(route as any).error}</Text>}

          {!kbOpen && (
            <View style={[s.nav, {paddingBottom: 8 + navInset}]}>
              {([['plan', 'Plan', 'signpost-2-fill'], ['chat', 'Jobbet', 'people-fill'], ['last', 'Last', 'grid-3x3-gap-fill'], ['klart', 'Klart', 'check2-all']] as const).map(([k, label, icon]) => {
                const on = tab === k;
                const col = on ? C.accentInk : C.faint;
                return (
                  <Pressable key={k} style={s.navBtn} onPress={() => (k === 'chat' ? openChat() : setTab(k as any))}>
                    <View>
                      <Bi n={icon as any} size={21} color={col} />
                      {k === 'chat' && unread + jobbet.smsUnread > 0 && <View style={s.navDot} />}
                    </View>
                    <Text style={[s.navTxt, {color: col}, on && {fontWeight: '800'}]}>{label}{k === 'klart' && doneOrders.length ? ` ${doneOrders.length}` : ''}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}

      <Sheet open={diag} onClose={() => setDiag(false)} title="Inställningar" sub={`Bygge: ${BUILD}`} scroll>
        <Text style={s.podLabel}>Utseende</Text>
        <View style={s.seg}>
          {([['auto', 'Auto', 'circle-half'], ['dark', 'Mörkt', 'moon-stars-fill'], ['light', 'Ljust', 'sun-fill']] as const).map(([k, label, icon]) => (
            <Pressable key={k} style={[s.segBtn, themePref === k && s.segOn]} onPress={() => pickTheme(k)}>
              <Bi n={icon} size={15} color={themePref === k ? C.onAccent : C.dim} />
              <Text style={[s.segTxt, themePref === k && {color: C.onAccent}]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.podLabel}>Navigera med</Text>
        <View style={s.seg}>
          {([['google', 'Google Maps', 'signpost-2-fill'], ['waze', 'Waze', 'cursor-fill']] as const).map(([k, label, icon]) => (
            <Pressable key={k} style={[s.segBtn, navApp === k && s.segOn]} onPress={() => pickNav(k)}>
              <Bi n={icon} size={15} color={navApp === k ? C.onAccent : C.dim} />
              <Text style={[s.segTxt, navApp === k && {color: C.onAccent}]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {step === 'route' && !demo && (
          <View style={s.statusCard}>
            <StatusLine ok={online === 'ja'} warn={online === 'åter'} text={online === 'ja' ? `Inloggad mot Opter${driverName ? ` som ${driverName}` : ''}` : online === 'åter' ? 'Tappade kontakten – ansluter igen' : 'Inte inloggad'} />
            <StatusLine ok={!!(gpsStat && gpsStat.running)} text={gpsStat && gpsStat.running ? 'GPS-tjänsten är igång' : 'GPS-tjänsten är inte igång'} />
            <StatusLine ok={!!(gpsStat && gpsStat.notif)} text={gpsStat && gpsStat.notif ? 'Notisen "Skickar din position" visas' : 'Notiser är avstängda för RUTT'} onFix={gpsStat && !gpsStat.notif ? () => Linking.openSettings() : undefined} />
            <StatusLine ok={!!(gpsStat && gpsStat.locOn)} text={gpsStat && gpsStat.locOn ? 'Telefonens plats är på' : 'Telefonens plats är avstängd'} />
            <StatusLine ok={gps.state === 'ok'} warn={gps.state === 'söker' || gps.state === 'startar'} text={gps.state === 'ok' ? `Position skickad ${hhmm(new Date(gps.sentAt || Date.now()))}${gps.acc ? ` (±${Math.round(gps.acc)} m)` : ''}` : gps.state === 'söker' ? 'Söker position…' : gps.state === 'startar' ? 'Startar GPS…' : gps.state === 'nekad' ? 'Platsbehörighet saknas' : gps.state === 'fel' ? 'Kunde inte skicka position' : 'GPS avstängd'} onFix={gps.state === 'nekad' ? () => Linking.openSettings() : undefined} />
          </View>
        )}
        <Pressable style={[s.sheetBtn, {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16}]} onPress={() => { setDemo(d => !d); setDiag(false); if (step !== 'route') setStep('route'); setTab('plan'); }}>
          <View style={{flex: 1}}>
            <Text style={s.sheetBtnTxt}>Demo-läge</Text>
            <Text style={[s.sheetNote, {marginTop: 2}]}>Prova allt med påhittade order. Inget skickas till Opter.</Text>
          </View>
          <View style={[s.toggle, demo && {backgroundColor: C.accent2}]}><View style={[s.toggleKnob, demo && {alignSelf: 'flex-end'}]} /></View>
        </Pressable>
        <Text style={s.podLabel}>Notis vid nytt uppdrag</Text>
        <Pressable style={s.setRow} onPress={() => { const RL: any = NativeModules.RuttLocation; if (RL && RL.notify) RL.notify(4799, 'Nytt uppdrag (test)', 'Så här ser det ut när ett uppdrag kommer in.').then((v: any) => flash(v ? 'Testnotis skickad – dra ner för att se den' : 'Notiser är avstängda för RUTT', null)).catch((e: any) => flash('Notis fel: ' + String(e?.message || e), null)); }}>
          <Text style={[s.sheetNote, {flex: 1, marginTop: 0}]}>Testa notisen (ljud, vibration, låsskärm)</Text>
          <Bi n="bell-fill" size={18} color={C.accentInk} />
        </Pressable>
        <Text style={s.podLabel}>SMS till chefen</Text>
        <Pressable style={s.setRow} onPress={() => { const v = !smsOpter; setSmsOpter(v); saveJSON('rutt.smsopter.v1', v); }}>
          <Text style={[s.sheetNote, {flex: 1, marginTop: 0}]}>Lastat ✅ / Lossat ✅ som SMS till {chefC ? chefC.name.split(' ')[0] : 'chefen'} även för Opter-order. Egna jobb från sedlar väljer du på jobbet.</Text>
          <View style={[s.tg, smsOpter && s.tgOn]}><View style={[s.tgK, smsOpter && s.tgKOn]} /></View>
        </Pressable>
        <Text style={s.podLabel}>Rutten</Text>
        <Text style={s.sheetNote}>Körtider längs vägarna från OpenStreetMap när telefonen har nät, annars en uppskattning. {learnInfo.samples >= 5
          ? `RUTT har lärt sig av ${learnInfo.samples} av dina resor: du kör ${Math.abs(Math.round((1 - learnInfo.factor) * 100))} % ${learnInfo.factor <= 1 ? 'snabbare' : 'långsammare'} än kartan, och planen räknar med det.`
          : `RUTT lär sig av dina riktiga tider mellan stoppen – efter 5 resor (nu ${learnInfo.samples}) börjar planen räkna med hur du faktiskt kör.`}</Text>
        <Text style={s.podLabel}>Felsök</Text>
        <Text style={s.sheetNote}>Skickar Opters rådata för dina jobb (order, adresser, kolli, statustyper, kvittenstyper) så Claude kan läsa den. Gmail öppnas med ett färdigt mejl till dig själv – tryck Skicka, sen läser Claude det.</Text>
        <Pressable style={[s.primaryBtn, diagBusy && {opacity: 0.5}]} disabled={diagBusy} onPress={sendDump}>
          <Text style={s.primaryBtnTxt}>{diagBusy ? 'Hämtar från Opter…' : 'Skicka orderdata till Claude'}</Text>
        </Pressable>
        {crashes.length > 0 && (
          <View style={{marginTop: 14}}>
            <Text style={s.sheetNote}>Senaste fel ({crashes.length}) – skickas med i orderdatan:</Text>
            {crashes.slice(0, 3).map((c: any, i: number) => <Text key={i} style={[s.sheetNote, {marginTop: 4, color: C.bad}]} numberOfLines={2}>{c.at.slice(11, 16)} · {c.msg}</Text>)}
          </View>
        )}
        <Pressable style={[s.sheetBtn, {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16}]} onPress={toggleGps}>
          <View style={{flex: 1}}>
            <Text style={s.sheetBtnTxt}>Skicka GPS-position</Text>
            <Text style={[s.sheetNote, {marginTop: 2}]}>Kontoret ser var du är (som Opter Driver). Var {client.positionInterval ? client.positionInterval() : 60}:e sekund.</Text>
          </View>
          <View style={[s.toggle, gpsOn && {backgroundColor: C.accent2}]}><View style={[s.toggleKnob, gpsOn && {alignSelf: 'flex-end'}]} /></View>
        </Pressable>
        {gps.state === 'nekad' && <Text style={[s.sheetNote, {color: C.bad}]}>Platsbehörighet saknas: öppna telefonens Inställningar → Appar → RUTT → Behörigheter → Plats → Tillåt.</Text>}
        {step === 'route' && (
          <>
            <Pressable style={s.logoutBtn} onPress={logoutAndClose}>
              <Bi n="power" size={17} color={C.bad} /><Text style={s.logoutTxt}>Logga ut och stäng RUTT</Text>
            </Pressable>
            <Text style={[s.sheetNote, {textAlign: 'center', marginTop: 6}]}>GPS slutar skickas och appen stängs. Nästa gång loggar du in igen.</Text>
          </>
        )}
      </Sheet>

      <WorkSheet open={workSheet} work={work} live={live} onClose={() => setWorkSheet(false)} onPick={doWork} />
      <EditSheet
        item={editFor}
        opts={demo ? DEMO_OPTS : orders.opts}
        history={editFor ? ((ost[editFor.cid] || {}).edits || []) : []}
        onClose={() => setEditFor(null)}
        onSend={(edit: any, label: string) => editFor && sendEdit(editFor.cid, editFor.st, edit, label)}
        onRepod={editFor && editFor.done && editFor.st && editFor.st.drop && editFor.st.live ? () => { const st = editFor.st; setEditFor(null); setSignStop({...st, repod: true}); } : undefined}
        saved={editFor ? (() => { const p = podMem.current[editFor.cid] || (ost[editFor.cid] || {}).pod; return p ? {name: p.name || '', hasSig: !!(p.sig && p.sig.strokes && p.sig.strokes.length)} : null; })() : null}
        onResend={editFor && editFor.done && editFor.st && editFor.st.drop && editFor.st.live ? () => { const f = editFor; setEditFor(null); resendSavedPod(f.cid, f.st); } : undefined}
        onDump={editFor ? () => { const f = editFor; setEditFor(null); sendOrderDump(f.cid, f.st); } : undefined}
      />
      {signStop && (
        <SignScreen
          stop={signStop}
          savedNames={names[companyKey(signStop.who)] || []}
          saved={ost[signStop.drop]}
          addOk={demo || !(orders.opts && orders.opts.perm && orders.opts.perm.addService === false)}
          timeOk={!signStop.own && !signStop.ownSign && (demo || !!(orders.opts && orders.opts.perm && orders.opts.perm.changes !== false && (orders.opts.fields || []).some((f: any) => f.cetName === 'SHI_TimeMinutes')))}
          start={(ost[signStop.drop] || {}).loadedAt || null}
          onCancel={() => setSignStop(null)}
          onDone={(pod: any) => onSigned(signStop, pod)}
        />
      )}

      {claudeSend && (
        <Pressable style={[s.claudeBar, claudeSend.state === 'err' && {borderColor: C.bad}]} onPress={() => claudeSend.state !== 'busy' && setClaudeSend(null)}>
          {claudeSend.state === 'busy' ? <ActivityIndicator size="small" color={C.accent} /> : <Bi n={claudeSend.state === 'ok' ? 'check-circle-fill' : 'exclamation-triangle-fill'} size={18} color={claudeSend.state === 'ok' ? C.accent2 : C.bad} />}
          <View style={{flex: 1, minWidth: 0}}>
            <Text style={s.claudeT}>Skicka till Claude</Text>
            <Text style={s.claudeS}>{claudeSend.text}</Text>
          </View>
          {claudeSend.state !== 'busy' ? <Bi n="x-lg" size={14} color={C.dim} /> : null}
        </Pressable>
      )}
      {toast && (
        <View style={s.toast} pointerEvents="box-none">
          <Bi n="check-circle-fill" size={18} color={C.accent2} />
          <Text style={s.toastTxt} numberOfLines={1}>{toast.text}</Text>
          {toast.undo && <Pressable hitSlop={12} onPress={() => { toast.undo && toast.undo(); setToast(null); }}><Text style={s.toastUndo}>Ångra</Text></Pressable>}
        </View>
      )}
    </SafeAreaView>
  );
}

function ChatView({msgs, msgText, setMsgText, onSend, onRetry}: any) {
  const stamp = (m: any) => {
    const t = m.created ? hhmm(m.created) : '';
    const sameDay = m.created && new Date().toDateString() === m.created.toDateString();
    const d = m.created && !sameDay ? `${String(m.created.getDate()).padStart(2, '0')}/${m.created.getMonth() + 1} ` : '';
    return m.received ? `${m.from || ''}${m.from ? ' · ' : ''}${d}${t}` : `${d}${t}`;
  };
  const data = [...msgs].reverse(); // nyast sist visuellt (inverted)
  // Lyft hela chatten över tangentbordet via RN:s egna Keyboard-event
  // (funkar med edge-to-edge utan native-beroende).
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => setKb(e.endCoordinates?.height || 0));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  // endCoordinates.height räknar INTE in tangentbordets verktygsrad (emoji/urklipp/
  // kugghjul) på många Android-tangentbord, så skrivrutan hamnar bakom den.
  // Lägg på en buffert så rutan garanterat klarar hela tangentbordet.
  const KB_BUFFER = 64;
  const lift = kb > 0 ? kb + KB_BUFFER : 0;
  return (
    <View style={{flex: 1, paddingBottom: lift}}>
      {msgs.length === 0 ? (
        <View style={{flex: 1, padding: 18}}><Text style={s.empty}>Inga meddelanden.</Text></View>
      ) : (
        <FlatList
          style={{flex: 1}}
          contentContainerStyle={{padding: 14, paddingTop: 18}}
          data={data}
          inverted
          keyboardShouldPersistTaps="handled"
          keyExtractor={(_, i) => String(i)}
          renderItem={({item}) => {
            const failed = item.local && item.state === 'failed';
            // Ärlig status: "Mottaget av Opter" först när servern sparat det med eget id.
            const status = item.received ? '' : item.local
              ? (item.state === 'sending' ? '  Skickar…' : failed ? '  Ej skickat – tryck för att försöka igen' : item.state === 'stored' ? '  ✓ Mottaget av Opter' : '  Skickat – väntar på kvitto')
              : (item.confirmed ? '  ✓✓ Läst' : item.serverId ? '  ✓ Mottaget av Opter' : '  ✓ Skickat');
            return (
              <Pressable disabled={!failed} onPress={() => onRetry && onRetry(item)} style={[s.bubbleWrap, item.received ? s.bwL : s.bwR]}>
                <View style={[s.bubble, item.received ? s.bubbleIn : s.bubbleOut, item.local && item.state === 'sending' && {opacity: 0.6}, failed && {borderWidth: 1, borderColor: C.bad}]}>
                  {/* textBreakStrategy="simple": Samsung-typsnitt mäts olika mot hur de ritas → sista ordet ("07.00") klipptes bort. */}
                  <Text style={s.bubbleTxt} textBreakStrategy="simple" android_hyphenationFrequency="none">{slack(item.text)}</Text>
                </View>
                <Text style={[s.bubbleStamp, item.received ? s.stampL : s.stampR, failed && {color: C.bad}]}>
                  {stamp(item)}{status}
                </Text>
              </Pressable>
            );
          }}
        />
      )}
      <View style={[s.sendRow, {paddingBottom: 12}]}>
        <TextInput style={s.sendInput} value={msgText} onChangeText={setMsgText} placeholder="Skriv ett meddelande…" placeholderTextColor={C.dim} multiline />
        <Pressable style={s.sendBtn} onPress={onSend}><Bi n="send-fill" size={18} color={C.onAccent} /></Pressable>
      </View>
    </View>
  );
}

// Statusrad med en liten lampa: grön = funkar, orange = jobbar på det, röd = fel. Mjukt sken runt lampan.
function Lamp({col, size = 10}: {col: string; size?: number}) {
  return (
    <View style={{width: size + 10, height: size + 10, alignItems: 'center', justifyContent: 'center'}}>
      <View style={{position: 'absolute', width: size + 10, height: size + 10, borderRadius: (size + 10) / 2, backgroundColor: col, opacity: 0.18}} />
      <View style={{position: 'absolute', width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, backgroundColor: col, opacity: 0.28}} />
      <View style={{width: size, height: size, borderRadius: size / 2, backgroundColor: col}} />
    </View>
  );
}
function StatusLine({ok, warn, text, onFix}: {ok: boolean; warn?: boolean; text: string; onFix?: () => void}) {
  const col = ok ? C.accent2 : warn ? C.accent : C.bad;
  return (
    <Pressable disabled={!onFix} onPress={onFix} style={s.stLine}>
      <Lamp col={col} />
      <Text style={[s.stLineTxt, !ok && !warn && {color: C.bad}]}>{text}</Text>
      {onFix ? <Text style={s.stFix}>Öppna inställningar</Text> : null}
    </Pressable>
  );
}

// ---- Arbetstid (rast/lunch/avsluta) ----
function WorkSheet({open, work, live, onClose, onPick}: any) {
  const B = (label: string, rst: number, state: string, kind?: string) => (
    <Pressable style={[s.sheetBtn, kind === 'bad' && s.sheetBtnBad]} onPress={() => onPick(rst, state)}>
      <Text style={[s.sheetBtnTxt, kind === 'bad' && {color: C.bad}]}>{label}</Text>
    </Pressable>
  );
  return (
    <Sheet open={open} onClose={onClose} title="Arbetstid">
      {work === 'igång' && (<>
        {B('Påbörja rast', RST.StartBreak, 'rast')}
        {B('Påbörja lunch', RST.StartLunch, 'lunch')}
        {B('Avsluta arbetsdag', RST.EndWork, 'slut', 'bad')}
      </>)}
      {work === 'rast' && B('Avsluta rast', RST.EndBreak, 'igång')}
      {work === 'lunch' && B('Avsluta lunch', RST.EndLunch, 'igång')}
      {work === 'slut' && B('Återuppta arbetspass', 1, 'igång')}
      {!live && <Text style={s.sheetNote}>I demoläge ändras bara visningen. Inloggad på riktiga jobb skickas detta till Opter.</Text>}
    </Sheet>
  );
}

const s = themed(() => StyleSheet.create({
  toast: {position: 'absolute', left: 14, right: 14, top: 60, backgroundColor: C.toast, borderColor: C.edge, borderWidth: 1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, elevation: 8, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: {width: 0, height: 4}},
  toastTxt: {color: C.ink, fontSize: 15, fontWeight: '700', flex: 1},
  toastUndo: {color: C.accentInk, fontSize: 15, fontWeight: '900'},
  safe: {flex: 1, backgroundColor: C.bg},
  head: {paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10},
  headTop: {flexDirection: 'row', alignItems: 'center', gap: 6},
  brand: {color: C.accentInk, fontSize: 13, fontWeight: '900', letterSpacing: 3},
  tag: {color: C.ink, fontSize: 24, fontWeight: '800', marginTop: 6, letterSpacing: -0.2},
  chips: {flexDirection: 'row', gap: 6},
  stChip: {flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.panel, borderColor: C.edge, borderWidth: 1, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 4},
  stChipTxt: {fontSize: 11.5, fontWeight: '800'},
  iconBtn: {width: 32, height: 32, borderRadius: 16, backgroundColor: C.panel, borderColor: C.edge, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  errBox: {flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginBottom: 8, backgroundColor: C.badSoft, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12},
  errTxt: {color: C.bad, fontSize: 13, fontWeight: '600', flex: 1},
  demoBar: {flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginBottom: 8, backgroundColor: C.peopleSoft, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14},
  demoTxt: {color: C.people, fontSize: 13.5, fontWeight: '700', flex: 1},
  demoGo: {color: C.people, fontSize: 13.5, fontWeight: '800'},
  banner: {flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginBottom: 8, backgroundColor: C.accent, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14},
  bannerTxt: {color: C.onAccent, fontSize: 14.5, fontWeight: '800', flex: 1},
  bannerGo: {color: C.onAccent, fontSize: 13.5, fontWeight: '800'},
  nav: {flexDirection: 'row', backgroundColor: C.panel, borderTopColor: C.edge, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8},
  navBtn: {flex: 1, alignItems: 'center', gap: 3},
  navTxt: {fontSize: 11.5, fontWeight: '600'},
  navDot: {position: 'absolute', top: -2, right: -6, width: 9, height: 9, borderRadius: 5, backgroundColor: C.people, borderColor: C.panel, borderWidth: 1.5},
  seg: {flexDirection: 'row', gap: 6},
  segBtn: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.panel2, borderRadius: 10, paddingVertical: 11},
  segOn: {backgroundColor: C.accent},
  segTxt: {color: C.dim, fontSize: 14, fontWeight: '700'},
  toggle: {width: 46, height: 28, borderRadius: 14, backgroundColor: C.edge, padding: 3, justifyContent: 'center'},
  toggleKnob: {width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF'},
  stLine: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5},
  stLineTxt: {color: C.ink, fontSize: 14, flex: 1, fontWeight: '600'},
  statusCard: {marginTop: 14, backgroundColor: C.panel2, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12},
  logoutBtn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 20, height: 52, borderRadius: 12, backgroundColor: C.badSoft},
  logoutTxt: {color: C.bad, fontSize: 15.5, fontWeight: '800'},
  segRow: {flexDirection: 'row', gap: 4, backgroundColor: C.panel, borderRadius: 12, padding: 4, marginHorizontal: 14, marginBottom: 8},
  segB: {flex: 1, alignItems: 'center', justifyContent: 'center', height: 34, borderRadius: 9},
  segOn2: {backgroundColor: C.panel2},
  segT: {color: C.dim, fontSize: 13.5, fontWeight: '800'},
  segTOn: {color: C.ink},
  moreNew: {color: C.accentInk, fontSize: 12.5, fontWeight: '900'},
  claudeBar: {position: 'absolute', left: 12, right: 12, top: 8, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderColor: C.edge, borderWidth: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, elevation: 8, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: {width: 0, height: 4}},
  claudeT: {color: C.ink, fontSize: 14.5, fontWeight: '900'},
  claudeS: {color: C.dim, fontSize: 13, marginTop: 1},
  breakClock: {color: C.ink, fontSize: 26, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: 0.5, marginTop: 1},
  breakCard: {flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.badSoft, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12},
  breakIco: {width: 42, height: 42, borderRadius: 21, backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center'},
  breakT: {color: C.ink, fontSize: 16, fontWeight: '900'},
  breakS: {color: C.dim, fontSize: 13, marginTop: 2, fontWeight: '600'},
  breakBtn: {flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.bad, borderRadius: 12, paddingHorizontal: 14, height: 46, justifyContent: 'center'},
  breakBtnT: {color: '#FFFFFF', fontSize: 13.5, fontWeight: '800'},
  stFix: {color: C.accentInk, fontSize: 12.5, fontWeight: '700'},
  build: {color: C.accentInk, fontSize: 11, opacity: 0.8},
  wrap: {flexGrow: 1, paddingHorizontal: 18, paddingTop: 8},
  card: {backgroundColor: C.panel, borderColor: C.edge, borderWidth: 1, borderRadius: 16, padding: 16},
  label: {color: C.dim, fontSize: 12, marginBottom: 5, marginTop: 10},
  input: {backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 10, color: C.ink, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15},
  row: {flexDirection: 'row', gap: 10},
  btn: {backgroundColor: C.accent, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 18},
  btnTxt: {color: C.onAccent, fontSize: 15, fontWeight: '700'},
  ghost: {marginTop: 6, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, alignSelf: 'flex-start'},
  ghostTxt: {color: C.ink, fontSize: 14},
  busy: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 22, paddingVertical: 14},
  busyTxt: {color: C.dim, fontSize: 14},
  err: {color: C.bad, fontSize: 13, paddingHorizontal: 22, paddingVertical: 8},
  nameRow: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 9},
  nameTxt: {color: C.ink, fontSize: 16},
  emptyBox: {flex: 1, alignItems: 'center', paddingHorizontal: 22, paddingTop: 50, gap: 10},
  empty: {color: C.dim, fontSize: 14},
  tabs: {flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 10},
  tabBtn: {flex: 1, alignItems: 'center', paddingVertical: 9, paddingHorizontal: 2, borderRadius: 20, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1},
  gpsRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 22, marginTop: -4, marginBottom: 8},
  gpsTxt: {color: C.faint, fontSize: 12, fontWeight: '600'},
  tabAlert: {backgroundColor: C.accent, borderColor: C.accent},
  tabOn: {backgroundColor: C.accent, borderColor: C.accent},
  tabTxt: {color: C.dim, fontSize: 13.5, fontWeight: '700'},
  tabTxtOn: {color: C.onAccent},
  statRow: {flexDirection: 'row', gap: 10, paddingHorizontal: 18, marginBottom: 8},
  stat: {flex: 1, backgroundColor: C.panel, borderColor: C.edge, borderWidth: 1, borderRadius: 12, paddingVertical: 11, alignItems: 'center'},
  statB: {color: C.ink, fontSize: 17, fontWeight: '700'},
  statT: {color: C.dim, fontSize: 11, marginTop: 2},
  stop: {flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 18, borderTopColor: C.edge, borderTopWidth: StyleSheet.hairlineWidth},
  num: {color: C.dim, fontSize: 15, fontWeight: '700', width: 20, textAlign: 'center', marginTop: 1},
  verb: {fontSize: 15, fontWeight: '700'},
  addr: {color: C.ink, fontSize: 14, marginTop: 2},
  meta: {color: C.dim, fontSize: 12, marginTop: 3},
  foot: {color: C.dim, fontSize: 12, padding: 18, lineHeight: 18},
  loadIntro: {color: C.dim, fontSize: 13, lineHeight: 19, marginBottom: 14},
  slot: {flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10, borderTopColor: C.edge, borderTopWidth: StyleSheet.hairlineWidth},
  slotNo: {color: C.accentInk, fontWeight: '700', width: 26, textAlign: 'center'},
  slotName: {color: C.ink, fontSize: 15},
  slotWhere: {color: C.dim, fontSize: 12, marginTop: 1},
  bubbleWrap: {marginBottom: 12, maxWidth: '82%'},
  bwL: {alignSelf: 'flex-start'},
  bwR: {alignSelf: 'flex-end'},
  bubble: {borderRadius: 16, paddingHorizontal: 13, paddingVertical: 10},
  bubbleIn: {backgroundColor: C.bubbleIn, borderBottomLeftRadius: 5},
  bubbleOut: {backgroundColor: C.bubbleOut, borderBottomRightRadius: 5},
  bubbleTxt: {color: C.ink, fontSize: 15, lineHeight: 21},
  bubbleStamp: {color: C.dim, fontSize: 11, marginTop: 4},
  stampL: {textAlign: 'left', marginLeft: 6},
  stampR: {textAlign: 'right', marginRight: 6},
  sendRow: {flexDirection: 'row', gap: 8, padding: 12, borderTopColor: C.edge, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'flex-end'},
  sendInput: {flex: 1, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 10, color: C.ink, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, maxHeight: 120},
  loginSub: {color: C.dim, fontSize: 14, marginBottom: 6},
  loginIn: {height: 54, fontSize: 18, fontWeight: '700'},
  eye: {position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center'},
  remRow: {flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, alignSelf: 'flex-start', paddingVertical: 4},
  remBox: {width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: C.edge, alignItems: 'center', justifyContent: 'center'},
  remTxt: {color: C.ink, fontSize: 15.5, fontWeight: '700'},
  loginBtn: {height: 56, justifyContent: 'center', marginTop: 18},
  loginLink: {color: C.accentInk, fontSize: 14, fontWeight: '700'},
  sendBtn: {backgroundColor: C.accent, borderRadius: 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  sendBtnTxt: {color: C.onAccent, fontSize: 15, fontWeight: '700'},

  // Arbetstidsrad
  workBar: {flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 14, marginBottom: 8, backgroundColor: C.accentSoft, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14},
  workDot: {width: 9, height: 9, borderRadius: 5},
  workTxt: {color: C.ink, fontSize: 14, flex: 1, fontWeight: '600'},
  workAction: {color: C.accentInk, fontSize: 13, fontWeight: '700'},

  // Status-brickor på stopp
  chip: {color: C.accent2, fontSize: 12, fontWeight: '700', marginLeft: 8},
  chevron: {color: C.dim, fontSize: 20, marginLeft: 8, marginTop: -2},

  // Sheets
  overlay: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.overlay},
  sheet: {position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 10},
  sheetHandle: {alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.edge, marginBottom: 12},
  sheetTitle: {color: C.ink, fontSize: 18, fontWeight: '800'},
  sheetSub: {color: C.dim, fontSize: 13, marginTop: 2, marginBottom: 2},
  sheetBtn: {backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, marginTop: 10},
  sheetBtnBad: {borderColor: C.bad},
  sheetBtnTxt: {color: C.ink, fontSize: 15, fontWeight: '600'},
  sheetDiv: {height: 1, backgroundColor: C.edge, marginVertical: 12, opacity: 0.6},
  sheetNote: {color: C.dim, fontSize: 12, marginTop: 12, lineHeight: 17},
  primaryBtn: {backgroundColor: C.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10},
  primaryBtnTxt: {color: C.onAccent, fontSize: 15, fontWeight: '800'},

  // POD
  podLabel: {color: C.dim, fontSize: 12, marginTop: 14, marginBottom: 6, fontWeight: '600'},
  setRow: {flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12},
  tg: {width: 44, height: 26, borderRadius: 13, backgroundColor: C.edge, justifyContent: 'center', paddingHorizontal: 3},
  tgOn: {backgroundColor: C.accent2},
  tgK: {width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF'},
  tgKOn: {alignSelf: 'flex-end'},
  sigPad: {height: 170, backgroundColor: C.sigBg, borderColor: C.edge, borderWidth: 1, borderRadius: 12, overflow: 'hidden', justifyContent: 'center', alignItems: 'center'},
  sigHint: {color: C.dim, fontSize: 14},
  sigClear: {alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 4, marginTop: 4},
  sigClearTxt: {color: C.accentInk, fontSize: 13, fontWeight: '700'},
  chipsWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  rChip: {backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 13},
  rChipOn: {backgroundColor: C.accent, borderColor: C.accent},
  rChipTxt: {color: C.dim, fontSize: 13, fontWeight: '600'},
  rChipTxtOn: {color: C.onAccent},

  // Stor statusknapp (Lastad / Lossad)
  bigBtn: {backgroundColor: C.accent, borderRadius: 16, paddingVertical: 20, paddingHorizontal: 20, marginTop: 14},
  bigBtnTxt: {color: C.onAccent, fontSize: 22, fontWeight: '800'},
  bigBtnSub: {color: C.onAccent, opacity: 0.7, fontSize: 13, marginTop: 3, fontWeight: '600'},

  // Foto
  photoRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  photoBox: {width: 84, height: 84, borderRadius: 12, overflow: 'hidden', backgroundColor: C.panel2},
  photoImg: {width: '100%', height: '100%'},
  photoX: {position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(20,18,16,0.8)', alignItems: 'center', justifyContent: 'center'},
  photoXTxt: {color: C.ink, fontSize: 16, lineHeight: 18, fontWeight: '700'},
  photoAdd: {width: 84, height: 84, borderRadius: 12, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  photoAddIco: {color: C.accentInk, fontSize: 22, fontWeight: '700'},
  photoAddTxt: {color: C.dim, fontSize: 12, marginTop: 2, fontWeight: '600'},
}));

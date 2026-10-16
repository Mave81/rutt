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
import {C, themed, hhmm, isFutureDay, applyTheme} from './src/ui/theme';
import {Bi} from './src/ui/Bi';
import {Sheet} from './src/ui/parts';
import OrdersView, {DoneView, setNavApp, NavApp} from './src/ui/OrdersView';
import SignScreen from './src/ui/SignScreen';
import NewOrdersView from './src/ui/NewOrdersView';
import LoadView from './src/ui/LoadView';
import {loadJSON, saveJSON, ORDERS_KEY, NAMES_KEY, companyKey, rememberName} from './src/store';
import {Buffer} from 'buffer';
import {PixelRatio} from 'react-native';
// @ts-ignore
import P from './src/opter/protocol';
// @ts-ignore
import OpterClient from './src/opter/OpterClient';
// @ts-ignore
import computeRoute from './src/opter/optimizer';

const client = new OpterClient();
const START = {lat: 59.2437, lng: 18.2280, label: 'Willys, Tyresö', end: '15:00'};
// Synlig bygg-stämpel så du alltid kan se vilket bygge du kör. Bumpas vid varje leverans.
const BUILD = '16 okt · hela ordern + #121212';
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

  // Arbetstid, stopp-status och POD
  const [work, setWork] = useState<'igång' | 'rast' | 'lunch' | 'slut'>('igång');
  const [workSheet, setWorkSheet] = useState(false);
  // Orderstatus per order (cid): {loadedAt, doneAt, pod}. Sparas lokalt per dag.
  const [ost, setOst] = useState<Record<string, any>>({});
  const [newState, setNewState] = useState<Record<string, 'sending' | 'failed'>>({});
  const [names, setNames] = useState<Record<string, string[]>>({}); // sparade mottagarnamn per företag
  const [signStop, setSignStop] = useState<any>(null); // stopp som signeras just nu
  const [toast, setToast] = useState<{text: string; undo: (() => void) | null} | null>(null);
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
  async function sendDump() {
    if (!client.logon) { setErr('Logga in mot Opter först.'); setDiag(false); return; }
    setDiagBusy(true);
    try {
      const d: any = await client.dump();
      d.crashes = await loadJSON(CRASH_KEY, []);
      d.build = BUILD;
      const json = JSON.stringify(d);
      // Direkt till din server (forre.nu/rutt/dump.php) – Claude läser filen på datorn. Ingen delningsmeny, ingen storleksgräns.
      let sent = '', why = '';
      try {
        const r = await fetch('https://forre.nu/rutt/dump.php', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: json});
        const j: any = await r.json().catch(() => null);
        if (r.ok && j && j.ok) sent = `${Math.round(json.length / 1024)} kB`; else why = (j && j.err) || `svar ${r.status}`;
      } catch (e: any) { why = String(e?.message || e); }
      if (sent) { flash(`Orderdata skickad till Claude · ${sent}`, null); return; }
      // Reserv: dela-menyn klarar bara mindre text (Android-gräns), så skicka en kortad version.
      const small = json.length > 400000 ? JSON.stringify({...d, rows: (d.rows || []).filter((r: any) => /^(Shipment|Address|DefaultPodType|Setting)/.test(r.t)).slice(0, 1500), trimmed: true, uploadErr: why}) : json;
      await Share.share({title: 'RUTT orderdata', message: 'RUTT-DATA v1\n' + small.slice(0, 450000)});
    } catch (e: any) { setErr('Kunde inte skicka orderdata: ' + String(e?.message || e)); }
    finally { setDiagBusy(false); setDiag(false); }
  }

  const [server, setServer] = useState('foriase.opter.cloud');
  const [port, setPort] = useState('443');
  const [path, setPath] = useState('mobile');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');

  const [resources, setResources] = useState<{resId: number; name: string}[]>([]);
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState<{cargo: any; stops: any[]}>({cargo: {}, stops: []});

  const filtered = useMemo(
    () => (query ? resources.filter(r => r.name.toLowerCase().includes(query.toLowerCase())) : resources),
    [resources, query],
  );

  const fullSrc: any = demo ? DEMO : orders.stops.length ? orders : null; // demo går att slå på när som helst (Inställningar)
  // ---- Var hör varje order hemma? Opters regler (live.tab) + dina tryck i RUTT ----
  const cidsAll: string[] = useMemo(() => (fullSrc ? [...new Set(fullSrc.stops.map((s: any) => String(s.pickup || s.drop)))] as string[] : []), [fullSrc]);
  const legs = (cid: string) => ({pick: fullSrc.stops.find((s: any) => String(s.pickup) === cid), drop: fullSrc.stops.find((s: any) => String(s.drop) === cid)});
  const classOf = (cid: string): 'new' | 'todo' | 'done' | 'hidden' => {
    const o = ost[cid] || {};
    if (o.rejectedAt) return 'hidden';
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
    return {cid, who: st.who, adr: st.adr, area: st.area, orderNo: st.orderNo, doneAt: o.doneAt || L.doneAt || null, pod: o.pod, damages: o.damages && o.damages.length,
      sync: o.sync && o.sync.unload, byOpter: !o.doneAt, rejected: /nekad/i.test(String(L.cur || ''))};
  }).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)), [cidsAll, cls, ost]);
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
  const live = !demo && orders.stops.length > 0; // skarpt läge = riktiga jobb inloggade
  // Står ordern redan som Lastad i Opter (t.ex. satt i Opter Driver)?
  const serverLoaded = (s: any) => !!(s.live && s.live.loadSt && s.live.curId === s.live.loadSt.id);
  const route = useMemo(() => {
    if (!src) return null;
    // Klara steg ut ur planeringen; lastat gods räknas som ombord.
    const stops = src.stops.map((s: any) => {
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
    const now = fullSrc === DEMO && !anyDone ? new Date(new Date().setHours(6, 0, 0, 0)).getTime() : Date.now();
    try {
      return computeRoute(stops, src.cargo, {...START, cur}, now, manual ? manual.keys : null);
    } catch (e: any) {
      return {error: String(e?.message || e)};
    }
  }, [src, ost, gpsRoutePos, manual]);

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
  useEffect(() => { loadJSON(MANUAL_KEY, null).then((v: any) => setManual(v && v.day === new Date().toDateString() ? v : null)); }, [MANUAL_KEY]);
  function saveManual(keys: string[] | null) {
    const v = keys ? {day: new Date().toDateString(), keys} : null;
    setManual(v); saveJSON(MANUAL_KEY, v);
    flash(keys ? 'Din ordning sparad' : 'Smart ordning igen', null);
  }
  useEffect(() => { loadJSON(NAMES_KEY, {}).then(n => setNames(n || {})); }, []);
  useEffect(() => {
    if (!src) return;
    const key = ORDERS_KEY(fullSrc === DEMO);
    if (ostLoaded.current === key) return;
    ostLoaded.current = key;
    loadJSON(key, {}).then(v => setOst(v || {}));
  }, [src]);
  useEffect(() => { if (ostLoaded.current) saveJSON(ostLoaded.current, ost); }, [ost]);

  function flash(text: string, undo: (() => void) | null) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({text, undo});
    toastTimer.current = setTimeout(() => setToast(null), 8000);
  }
  // Lastad: raden byter till LOSSA och sorteras in i körordningen.
  // ---- Skicka status till Opter: väntar tills "Ångra" gått ut, sen exakt en gång + kontroll ----
  const sendTimers = useRef<Record<string, any>>({});
  const setSync = (cid: string, step: 'load' | 'unload', state: string) =>
    setOst(o => ({...o, [cid]: {...(o[cid] || {}), sync: {...((o[cid] && o[cid].sync) || {}), [step]: state}}}));
  function queueSend(cid: string, step: 'load' | 'unload', run: () => Promise<any>) {
    if (sendTimers.current[cid + step]) clearTimeout(sendTimers.current[cid + step]);
    setSync(cid, step, 'waiting');
    sendTimers.current[cid + step] = setTimeout(async () => {
      delete sendTimers.current[cid + step];
      setSync(cid, step, 'sending');
      try {
        const r = await run();
        setSync(cid, step, r.confirmed ? (r.imageDropped ? 'ok-noimg' : 'ok') : 'unconfirmed');
        if (r.rutt && r.rutt.stops && r.rutt.stops.length) setOrders(r.rutt);
      } catch (e) { setSync(cid, step, 'failed'); }
    }, 8200);
  }
  const cancelSend = (cid: string, step: string) => { if (sendTimers.current[cid + step]) { clearTimeout(sendTimers.current[cid + step]); delete sendTimers.current[cid + step]; } };
  function sendLoad(st: any) {
    const L = st.live;
    if (!live || !L || !L.loadSt) return;
    queueSend(st.pickup, 'load', () => client.setStatus(L, L.loadSt.id, null));
  }
  // Lossad → Opter, byte för byte som Opter Driver (registerPod + setShipmentStatus i samma synk).
  async function sendUnload(st: any, pod: any) {
    const L = st.live;
    if (!live || !L || !L.unloadSt) return;
    const scale = PixelRatio.get();
    const first = (pod.photos || [])[0];
    const typeId = pod.typeId || (L.podType && L.podType.id) || 0;
    // Position bara om den är färsk (< 10 min), som Opter.
    let pos: any = null;
    try { const l = NativeModules.RuttLocation && (await NativeModules.RuttLocation.getLast()); if (l && l.lat && Date.now() - l.time < 10 * 60000) pos = l; } catch (e) {}
    const podData = typeId ? {
      // Ordern utan egna kvittenstyper: Opter skickar SPT_Id = −DPT_Id. Annars DPT_Id.
      sptId: L.hasSpt ? 0 : -typeId,
      dptId: L.hasSpt ? typeId : 0,
      sptIdSub: !L.hasSpt && pod.subId ? pod.subId : 0,
      dptIdSub: L.hasSpt && pod.subId ? pod.subId : 0,
      name: pod.name || '', remark: pod.comment || '', comment: pod.comment2 || '',
      signature: pod.sig ? P.signatureString(pod.sig.strokes, scale) : '',
      packageCount: pod.kolli != null ? pod.kolli : null,
      lat: pos ? pos.lat : null, lng: pos ? pos.lng : null,
      image: first && first.b64 ? Buffer.from(first.b64, 'base64') : null,
    } : null;
    queueSend(st.drop, 'unload', () => client.setStatus(L, L.unloadSt.id, podData));
  }
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

  function onLoaded(st: any) {
    const cid = st.pickup;
    const prev = ost[cid];
    setOst(o => ({...o, [cid]: {...(o[cid] || {}), loadedAt: Date.now()}}));
    sendLoad(st);
    flash(`Lastad · ${st.who || 'order'}`, () => { cancelSend(cid, 'load'); setOst(o => { const n = {...o}; if (prev) n[cid] = prev; else delete n[cid]; return n; }); });
  }
  // Tillägg / avvikelse / ändrat kolliantal från "Mer".
  function onExtra(cid: string, kind: 'extras' | 'damage' | 'kolli', data: any) {
    setOst(o => {
      const cur = o[cid] || {};
      if (kind === 'extras') return {...o, [cid]: {...cur, extras: data}};
      if (kind === 'damage') return {...o, [cid]: {...cur, damages: [...(cur.damages || []), data]}};
      return {...o, [cid]: {...cur, kolli: data.kolli, kg: data.kg}};
    });
    flash(kind === 'extras' ? 'Tillägg sparat' : kind === 'damage' ? 'Avvikelse sparad' : 'Kollin sparat', null);
  }
  function onAvised(cid: string) { setOst(o => ({...o, [cid]: {...(o[cid] || {}), avisedAt: Date.now()}})); }

  // Lossad: kvittensen sparas, ordern flyttar till Klart, namnet minns till nästa gång.
  function onSigned(st: any, pod: any) {
    const cid = st.drop;
    const prev = ost[cid];
    setSignStop(null);
    setOst(o => ({...o, [cid]: {...(o[cid] || {}), who: st.who, loadedAt: (o[cid] && o[cid].loadedAt) || Date.now(), doneAt: Date.now(), extras: pod.extras || (o[cid] && o[cid].extras), kolli: pod.kolli, pod: {...pod, photos: (pod.photos || []).map((x: any) => ({uri: x.uri}))}}}));
    podMem.current[cid] = pod;
    if (pod.name) setNames(n => { const nn = rememberName(n, st.who, pod.name); saveJSON(NAMES_KEY, nn); return nn; });
    sendUnload(st, pod);
    flash(`Lossad · ${st.who || 'order'}`, () => { cancelSend(cid, 'unload'); setOst(o => { const n = {...o}; if (prev) n[cid] = prev; else delete n[cid]; return n; }); });
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
      const nm = name || (savedLogin.current && savedLogin.current.name) || '';
      setDriverName(nm);
      savedLogin.current = {...(savedLogin.current || {}), resId, name: nm};
      saveJSON(LOGIN_KEY, savedLogin.current);
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
  const navInset = useSafeAreaInsets().bottom;

  async function openChat() {
    setTab('chat');
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


  // Arbetstid → Opter (live). RST-typ + nytt visningsläge.
  async function doWork(rst: number, newState: 'igång' | 'rast' | 'lunch' | 'slut') {
    setWork(newState);
    setWorkSheet(false);
    if (live) { try { await client.workStatus(rst); } catch (e) {} }
  }

  // Live-uppdatering: servern säger till (StartServerInitiatedSync) när nåt ändrats
  // → hämta färska jobb + chatt direkt. Även en lugn backup-poll var 30:e sek.
  useEffect(() => {
    if (step !== 'route') return;
    let alive = true;
    async function refresh() {
      try {
        const {rutt, msgs: fresh} = await client.poll();
        if (!alive) return;
        if (rutt && rutt.stops && rutt.stops.length) setOrders(rutt);
        setMsgs(fresh);
      } catch (e) {}
    }
    client.onPush = refresh;
    const iv = setInterval(refresh, 30000);
    return () => { alive = false; client.onPush = null; clearInterval(iv); };
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
  const hej = hour < 10 ? 'God morgon' : hour < 18 ? 'Hej' : 'God kväll';
  const title = step === 'login' ? (driverName ? `Välkommen ${driverName}` : 'Logga in mot Opter') : step === 'pick' ? 'Välj ditt namn' : tab === 'chat' ? 'Kontoret' : tab === 'last' ? 'Lastplan' : tab === 'klart' ? 'Klart idag' : tab === 'nytt' ? 'Nya order' : (driverName ? `${hej} ${driverName.split(' ')[0]}` : demo ? 'Demo' : 'Dina jobb');

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
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
            <Pressable hitSlop={8} onPress={() => setWorkSheet(true)} style={s.iconBtn}><Bi n="cup-hot-fill" size={16} color={work === 'igång' ? C.dim : C.accentInk} /></Pressable>
          )}
          <Pressable hitSlop={8} onPress={() => setDiag(true)} style={s.iconBtn}><Bi n="gear-fill" size={16} color={C.dim} /></Pressable>
        </View>
        <Text style={s.tag} numberOfLines={1}>{title}</Text>
      </View>

      {busy && <View style={s.busy}><ActivityIndicator color={C.accent} /><Text style={s.busyTxt}>{status}</Text></View>}
      {!!err && <View style={s.errBox}><Bi n="exclamation-circle-fill" size={15} color={C.bad} /><Text style={s.errTxt}>{err}</Text></View>}

      {step === 'login' && !busy && (
        <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
          <View style={s.card}>
            <Text style={s.label}>Serveradress</Text>
            <TextInput style={s.input} value={server} onChangeText={setServer} autoCapitalize="none" />
            <View style={s.row}>
              <View style={{width: 90}}><Text style={s.label}>Port</Text><TextInput style={s.input} value={port} onChangeText={setPort} keyboardType="numeric" /></View>
              <View style={{flex: 1}}><Text style={s.label}>Sökväg</Text><TextInput style={s.input} value={path} onChangeText={setPath} autoCapitalize="none" /></View>
            </View>
            <Text style={s.label}>Användarnamn</Text>
            <TextInput style={s.input} value={user} onChangeText={setUser} autoCapitalize="none" autoCorrect={false} />
            <Text style={s.label}>Lösenord</Text>
            <TextInput style={s.input} value={pass} onChangeText={setPass} secureTextEntry />
            <Pressable style={s.btn} onPress={() => login()}><Text style={s.btnTxt}>Logga in &amp; hämta</Text></Pressable>
          </View>
        </ScrollView>
      )}

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
          {newOrders.length > 0 && tab !== 'nytt' && (
            <Pressable style={s.banner} onPress={() => setTab('nytt')}>
              <Bi n="bell-fill" size={16} color={C.onAccent} />
              <Text style={s.bannerTxt}>{newOrders.length === 1 ? '1 ny order' : `${newOrders.length} nya order`} väntar på svar</Text>
              <Text style={s.bannerGo}>Visa</Text><Bi n="chevron-right" size={14} color={C.onAccent} />
            </Pressable>
          )}
          {work !== 'igång' && (tab === 'plan' || tab === 'last') && (
            <Pressable style={s.workBar} onPress={() => setWorkSheet(true)}>
              <Bi n={work === 'slut' ? 'power' : 'cup-hot-fill'} size={16} color={C.accentInk} />
              <Text style={s.workTxt}>{work === 'rast' ? 'Du har rast' : work === 'lunch' ? 'Du har lunch' : 'Arbetspasset är avslutat'}</Text>
              <Text style={s.workAction}>{work === 'slut' ? 'Återuppta' : 'Avsluta'}</Text>
            </Pressable>
          )}

          {tab === 'klart' && <DoneView done={doneOrders} onRetry={retrySync} />}
          {tab === 'nytt' && <NewOrdersView orders={newOrders} onAccept={(o: any) => setOrderStatus(o, 'accept')} onReject={(o: any) => setOrderStatus(o, 'reject')} />}

          {tab === 'plan' && !orders.stops.length && !demo && (
            <View style={s.emptyBox}>
              <Bi n="inbox-fill" size={30} color={C.faint} />
              <Text style={s.empty}>Inga aktiva jobb just nu.</Text>
              <Pressable style={s.ghost} onPress={() => setDemo(true)}><Text style={s.ghostTxt}>Visa demo så du ser planen</Text></Pressable>
            </View>
          )}

          {tab === 'plan' && route && !(route as any).error && (
            <OrdersView route={route} cargo={src.cargo} ost={ost} allStops={src.stops} onLoaded={onLoaded} onUnload={(st: any) => setSignStop(st)} onExtra={onExtra} onAvised={onAvised} onRetry={retrySync} live={live} later={later} onReorder={saveManual} />
          )}
          {tab === 'last' && src && <LoadView orders={loadOrders} cargo={src.cargo} route={route && !(route as any).error ? route : null} />}
          {tab === 'chat' && <ChatView msgs={chatList} msgText={msgText} setMsgText={setMsgText} onSend={sendMsg} onRetry={deliver} />}
          {(tab === 'plan' || tab === 'last') && route && (route as any).error && <Text style={s.errTxt}>Optimeringsfel: {(route as any).error}</Text>}

          {!kbOpen && (
            <View style={[s.nav, {paddingBottom: 8 + navInset}]}>
              {([['plan', 'Plan', 'signpost-2-fill'], ['chat', 'Kontoret', 'chat-left-text-fill'], ['last', 'Last', 'grid-3x3-gap-fill'], ['klart', 'Klart', 'check2-all']] as const).map(([k, label, icon]) => {
                const on = tab === k;
                const col = on ? C.accentInk : C.faint;
                return (
                  <Pressable key={k} style={s.navBtn} onPress={() => (k === 'chat' ? openChat() : setTab(k as any))}>
                    <View>
                      <Bi n={icon as any} size={21} color={col} />
                      {k === 'chat' && unread > 0 && <View style={s.navDot} />}
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
          <View style={{marginTop: 14, gap: 6}}>
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
        <Text style={s.podLabel}>Felsök</Text>
        <Text style={s.sheetNote}>Skickar Opters rådata för dina jobb (order, adresser, kolli, statustyper, kvittenstyper) så Claude kan läsa den. Den skickas direkt till din server, Claude läser den därifrån.</Text>
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
          <Pressable style={[s.sheetBtn, {alignItems: 'center', marginTop: 16}]} onPress={logout}>
            <Text style={s.sheetBtnTxt}>Logga ut / byt förare</Text>
          </Pressable>
        )}
      </Sheet>

      <WorkSheet open={workSheet} work={work} live={live} onClose={() => setWorkSheet(false)} onPick={doWork} />
      {signStop && (
        <SignScreen
          stop={signStop}
          savedNames={names[companyKey(signStop.who)] || []}
          saved={ost[signStop.drop]}
          onCancel={() => setSignStop(null)}
          onDone={(pod: any) => onSigned(signStop, pod)}
        />
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
                  <Text style={s.bubbleTxt} textBreakStrategy="simple" android_hyphenationFrequency="none">{item.text}</Text>
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

function StatusLine({ok, warn, text, onFix}: {ok: boolean; warn?: boolean; text: string; onFix?: () => void}) {
  const col = ok ? C.accent2 : warn ? C.accentInk : C.bad;
  return (
    <Pressable disabled={!onFix} onPress={onFix} style={s.stLine}>
      <Bi n={ok ? 'check-circle-fill' : warn ? 'arrow-repeat' : 'x-circle-fill'} size={15} color={col} />
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
  toast: {position: 'absolute', left: 14, right: 14, bottom: 28, backgroundColor: C.toast, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, elevation: 8, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: {width: 0, height: 4}},
  toastTxt: {color: '#FFFFFF', fontSize: 15, fontWeight: '700', flex: 1},
  toastUndo: {color: C.accent, fontSize: 15, fontWeight: '900'},
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
  stLine: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3},
  stLineTxt: {color: C.ink, fontSize: 13.5, flex: 1},
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

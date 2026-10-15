/**
 * RUTT – native förar-app.
 * Logga in mot Opter → välj namn → jobb hämtas → optimerad plan + lastplan.
 * (Kör-läge och statusar tillbaka till Opter kommer härnäst.)
 */
import React, {useMemo, useState, useEffect, useRef} from 'react';
import {
  View, StatusBar, StyleSheet, Text, TextInput, Pressable,
  FlatList, ActivityIndicator, ScrollView, Keyboard, Share,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, hhmm} from './src/ui/theme';
import {Sheet} from './src/ui/parts';
import OrdersView from './src/ui/OrdersView';
import SignScreen from './src/ui/SignScreen';
import {loadJSON, saveJSON, ORDERS_KEY, NAMES_KEY, companyKey, rememberName} from './src/store';
import {Buffer} from 'buffer';
import {PixelRatio} from 'react-native';
// @ts-ignore
import P from './src/opter/protocol';
// @ts-ignore
import OpterClient from './src/opter/OpterClient';
// @ts-ignore
import computeRoute, {slotWhere} from './src/opter/optimizer';

const client = new OpterClient();
const START = {lat: 59.2437, lng: 18.2280, label: 'Willys, Tyresö', end: '15:00'};
// Synlig bygg-stämpel så du alltid kan se vilket bygge du kör. Bumpas vid varje leverans.
const BUILD = '15 okt · skarp Lastad/Lossad';
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


export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <AppInner />
    </SafeAreaProvider>
  );
}

function AppInner(): React.JSX.Element {
  const [step, setStep] = useState<'login' | 'pick' | 'route'>('login');
  const [tab, setTab] = useState<'plan' | 'last' | 'chat'>('plan');
  const [msgs, setMsgs] = useState<any[]>([]);
  const [msgText, setMsgText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('');
  const [demo, setDemo] = useState(false);

  // Arbetstid, stopp-status och POD
  const [work, setWork] = useState<'igång' | 'rast' | 'lunch' | 'slut'>('igång');
  const [workSheet, setWorkSheet] = useState(false);
  // Orderstatus per order (cid): {loadedAt, doneAt, pod}. Sparas lokalt per dag.
  const [ost, setOst] = useState<Record<string, any>>({});
  const [names, setNames] = useState<Record<string, string[]>>({}); // sparade mottagarnamn per företag
  const [signStop, setSignStop] = useState<any>(null); // stopp som signeras just nu
  const [toast, setToast] = useState<{text: string; undo: (() => void) | null} | null>(null);
  const toastTimer = useRef<any>(null);
  const [diag, setDiag] = useState(false);
  const [diagBusy, setDiagBusy] = useState(false);
  // Skicka rådata från Opter (via telefonens dela-meny → Gmail till dig själv) så Claude kan läsa den.
  async function sendDump() {
    if (!client.logon) { setErr('Logga in mot Opter först.'); setDiag(false); return; }
    setDiagBusy(true);
    try {
      const d = await client.dump();
      const json = JSON.stringify(d);
      await Share.share({title: 'RUTT orderdata ' + new Date().toLocaleString('sv-SE'), message: 'RUTT-DATA v1\n' + json});
    } catch (e: any) { setErr('Kunde inte ta fram data: ' + String(e?.message || e)); }
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

  const src: any = orders.stops.length ? orders : demo ? DEMO : null;
  // Står ordern redan som Lastad i Opter (t.ex. satt i Opter Driver)?
  const serverLoaded = (s: any) => !!(s.live && s.live.loadSt && s.live.curId === s.live.loadSt.id);
  const route = useMemo(() => {
    if (!src) return null;
    // Klara steg ut ur planeringen; lastat gods räknas som ombord.
    const stops = src.stops.map((s: any) => {
      const o = ost[s.pickup || s.drop] || {};
      return {...s, done: s.pickup ? !!(o.loadedAt || o.doneAt || serverLoaded(s)) : !!o.doneAt};
    });
    // Där du står nu = senast avklarade steg.
    let cur: any = null, last = 0;
    for (const s of src.stops) {
      const o = ost[s.pickup || s.drop] || {};
      const at = s.pickup ? o.loadedAt : o.doneAt;
      if (at && at > last && s.lat != null) { last = at; cur = {lat: s.lat, lng: s.lng}; }
    }
    const anyDone = Object.keys(ost).length > 0;
    const now = src === DEMO && !anyDone ? new Date(new Date().setHours(6, 0, 0, 0)).getTime() : Date.now();
    try {
      return computeRoute(stops, src.cargo, {...START, cur}, now);
    } catch (e: any) {
      return {error: String(e?.message || e)};
    }
  }, [src, ost]);

  // Ladda/spara orderstatus (per dag, demo separat) och sparade namn.
  const ostLoaded = useRef<string | null>(null);
  useEffect(() => { loadJSON(NAMES_KEY, {}).then(n => setNames(n || {})); }, []);
  useEffect(() => {
    if (!src) return;
    const key = ORDERS_KEY(src === DEMO);
    if (ostLoaded.current === key) return;
    ostLoaded.current = key;
    loadJSON(key, {}).then(v => setOst(v || {}));
  }, [src]);
  useEffect(() => { if (ostLoaded.current) saveJSON(ostLoaded.current, ost); }, [ost]);

  function flash(text: string, undo: (() => void) | null) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({text, undo});
    toastTimer.current = setTimeout(() => setToast(null), 6000);
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
    }, 6200);
  }
  const cancelSend = (cid: string, step: string) => { if (sendTimers.current[cid + step]) { clearTimeout(sendTimers.current[cid + step]); delete sendTimers.current[cid + step]; } };
  function sendLoad(st: any) {
    const L = st.live;
    if (!live || !L || !L.loadSt) return;
    queueSend(st.pickup, 'load', () => client.setStatus(L, L.loadSt.id, null));
  }
  function sendUnload(st: any, pod: any) {
    const L = st.live;
    if (!live || !L || !L.unloadSt) return;
    const scale = PixelRatio.get();
    const first = (pod.photos || [])[0];
    const podData = L.podType ? {
      sptId: L.podType && L.podType.kind === 'spt' ? L.podType.id : 0,
      dptId: L.podType && L.podType.kind === 'dpt' ? L.podType.id : 0,
      name: pod.name || '', remark: pod.comment || '',
      signature: pod.sig ? P.signatureString(pod.sig.strokes, scale) : '',
      packageCount: pod.kolli != null ? pod.kolli : null,
      image: first && first.b64 ? Buffer.from(first.b64, 'base64') : null,
    } : null;
    queueSend(st.drop, 'unload', () => client.setStatus(L, L.unloadSt.id, podData));
  }
  function retrySync(cid: string) {
    const o = ost[cid] || {};
    const pick = src && src.stops.find((s: any) => s.pickup === cid);
    const drop = src && src.stops.find((s: any) => s.drop === cid);
    if (o.doneAt && drop) sendUnload(drop, o.pod || {});
    else if (o.loadedAt && pick) sendLoad(pick);
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
    setOst(o => ({...o, [cid]: {...(o[cid] || {}), who: st.who, loadedAt: (o[cid] && o[cid].loadedAt) || Date.now(), doneAt: Date.now(), extras: pod.extras || (o[cid] && o[cid].extras), kolli: pod.kolli, pod: {...pod, photos: (pod.photos || []).map((x: any, i: number) => ({uri: x.uri, b64: i === 0 ? x.b64 : undefined}))}}}));
    if (pod.name) setNames(n => { const nn = rememberName(n, st.who, pod.name); saveJSON(NAMES_KEY, nn); return nn; });
    sendUnload(st, pod);
    flash(`Lossad · ${st.who || 'order'}`, () => { cancelSend(cid, 'unload'); setOst(o => { const n = {...o}; if (prev) n[cid] = prev; else delete n[cid]; return n; }); });
  }

  async function login() {
    setErr(''); setBusy(true); setStatus('Ansluter och loggar in…');
    try {
      await client.connect({server: server.trim(), port: port.trim(), app: path.trim(), https: true});
      const info = await client.doLogon({user: user.trim(), pass});
      if (!info.ok) throw new Error('Inloggning nekad – kolla användarnamn/lösenord');
      setStatus('Hämtar förarlista…');
      await client.syncRef();
      if (info.needChoose) { setResources(client.resources()); setStep('pick'); }
      else await pull(info.resId);
    } catch (e: any) { setErr(String(e?.message || e)); }
    finally { setBusy(false); }
  }
  async function pull(resId: number) {
    setBusy(true); setStatus('Hämtar dina jobb…');
    try { const {rutt} = await client.startWork(resId); setOrders(rutt); setMsgs(client.messages()); setStep('route'); }
    catch (e: any) { setErr(String(e?.message || e)); }
    finally { setBusy(false); }
  }

  const unread = msgs.filter(m => m.received && !m.confirmed).length;

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

  const live = !demo && orders.stops.length > 0; // skarpt läge = riktiga jobb inloggade

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

  const title = step === 'login' ? 'Logga in mot Opter' : step === 'pick' ? 'Välj ditt namn' : (orders.stops.length ? 'Din dag' : demo ? 'Demo' : 'Dina jobb');

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.head}>
        <View style={{flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between'}}>
          <Text style={s.brand}>RUTT</Text>
          <Pressable hitSlop={10} onPress={() => setDiag(true)}><Text style={s.build}>{BUILD}  ⓘ</Text></Pressable>
        </View>
        <Text style={s.tag}>{title}</Text>
      </View>

      {busy && <View style={s.busy}><ActivityIndicator color={C.accent} /><Text style={s.busyTxt}>{status}</Text></View>}
      {!!err && <Text style={s.err}>{err}</Text>}

      {step === 'login' && !busy && (
        <ScrollView contentContainerStyle={s.wrap}>
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
            <Pressable style={s.btn} onPress={login}><Text style={s.btnTxt}>Logga in &amp; hämta</Text></Pressable>
          </View>
        </ScrollView>
      )}

      {step === 'pick' && !busy && (
        <View style={s.wrap}>
          <TextInput style={s.input} value={query} onChangeText={setQuery} placeholder="Sök ditt namn…" placeholderTextColor={C.dim} autoCapitalize="none" />
          <FlatList style={{marginTop: 10}} data={filtered} keyExtractor={r => String(r.resId)}
            renderItem={({item}) => <Pressable style={s.nameRow} onPress={() => pull(item.resId)}><Text style={s.nameTxt}>{item.name}</Text></Pressable>} />
        </View>
      )}

      {step === 'route' && !busy && (
        <View style={{flex: 1}}>
          <View style={s.tabs}>
            <Pressable onPress={() => setTab('plan')} style={[s.tabBtn, tab === 'plan' && s.tabOn]}><Text style={[s.tabTxt, tab === 'plan' && s.tabTxtOn]}>Plan</Text></Pressable>
            <Pressable onPress={() => setTab('last')} style={[s.tabBtn, tab === 'last' && s.tabOn]}><Text style={[s.tabTxt, tab === 'last' && s.tabTxtOn]}>Last</Text></Pressable>
            <Pressable onPress={openChat} style={[s.tabBtn, tab === 'chat' && s.tabOn]}>
              <Text style={[s.tabTxt, tab === 'chat' && s.tabTxtOn]}>Chatt{unread ? `  ${unread}` : ''}</Text>
            </Pressable>
          </View>

          {tab !== 'chat' && (
            <Pressable style={s.workBar} onPress={() => setWorkSheet(true)}>
              <View style={[s.workDot, work === 'igång' ? {backgroundColor: C.accent2} : work === 'slut' ? {backgroundColor: C.dim} : {backgroundColor: C.accent}]} />
              <Text style={s.workTxt}>{work === 'igång' ? 'Arbetspass igång' : work === 'rast' ? 'På rast' : work === 'lunch' ? 'På lunch' : 'Pass avslutat'}</Text>
              <Text style={s.workAction}>Rast / lunch ›</Text>
            </Pressable>
          )}

          {tab !== 'chat' && !orders.stops.length && !demo && (
            <View style={s.emptyBox}>
              <Text style={s.empty}>Inga aktiva jobb just nu.</Text>
              {!demo && <Pressable style={s.ghost} onPress={() => setDemo(true)}><Text style={s.ghostTxt}>Visa demo så du ser planen</Text></Pressable>}
            </View>
          )}

          {tab === 'plan' && route && !(route as any).error && (
            <OrdersView route={route} cargo={src.cargo} ost={ost} allStops={src.stops} onLoaded={onLoaded} onUnload={(st: any) => setSignStop(st)} onExtra={onExtra} onAvised={onAvised} onRetry={retrySync} live={live} />
          )}
          {tab === 'last' && route && !(route as any).error && <LastView route={route} cargo={src.cargo} />}
          {tab === 'chat' && <ChatView msgs={chatList} msgText={msgText} setMsgText={setMsgText} onSend={sendMsg} onRetry={deliver} />}
          {tab !== 'chat' && route && (route as any).error && <Text style={s.err}>Optimeringsfel: {(route as any).error}</Text>}
        </View>
      )}

      <Sheet open={diag} onClose={() => setDiag(false)} title="Felsök" sub={`Bygge: ${BUILD}`}>
        <Text style={s.sheetNote}>Skickar Opters rådata för dina jobb (order, adresser, kolli, statustyper, kvittenstyper) så Claude kan läsa den. Välj Gmail och skicka till dig själv.</Text>
        <Pressable style={[s.primaryBtn, diagBusy && {opacity: 0.5}]} disabled={diagBusy} onPress={sendDump}>
          <Text style={s.primaryBtnTxt}>{diagBusy ? 'Hämtar från Opter…' : 'Skicka orderdata till Claude'}</Text>
        </Pressable>
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
          <Text style={s.toastTxt} numberOfLines={1}>{toast.text}</Text>
          {toast.undo && <Pressable hitSlop={12} onPress={() => { toast.undo && toast.undo(); setToast(null); }}><Text style={s.toastUndo}>Ångra</Text></Pressable>}
        </View>
      )}
    </SafeAreaView>
  );
}

function LastView({route, cargo}: {route: any; cargo: any}) {
  const {slots} = route.load;
  const filled = slots.map((sl: any, i: number) => ({sl, i})).filter((x: any) => x.sl);
  return (
    <ScrollView contentContainerStyle={{padding: 18}}>
      <Text style={s.loadIntro}>
        Lasta i omvänd lossningsordning: det som lossas sist läggs längst in mot hytten,
        det som lossas först närmast dörrarna.
      </Text>
      {filled.length === 0 && <Text style={s.empty}>Inget att lasta.</Text>}
      {filled.map(({sl, i}: any) => (
        <View key={i} style={s.slot}>
          <Text style={s.slotNo}>{i + 1}</Text>
          <View style={{flex: 1}}>
            <Text style={s.slotName}>{(cargo[sl.cid] && cargo[sl.cid].name) || sl.cid}{cargo[sl.cid] && cargo[sl.cid].to ? `  →  ${cargo[sl.cid].to}` : ''}</Text>
            <Text style={s.slotWhere}>{slotWhere(i)}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
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
  const insets = useSafeAreaInsets();
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
                  <Text style={s.bubbleTxt}>{item.text}</Text>
                </View>
                <Text style={[s.bubbleStamp, item.received ? s.stampL : s.stampR, failed && {color: C.bad}]}>
                  {stamp(item)}{status}
                </Text>
              </Pressable>
            );
          }}
        />
      )}
      <View style={[s.sendRow, {paddingBottom: 12 + (kb > 0 ? 0 : insets.bottom)}]}>
        <TextInput style={s.sendInput} value={msgText} onChangeText={setMsgText} placeholder="Skriv ett meddelande…" placeholderTextColor={C.dim} multiline />
        <Pressable style={s.sendBtn} onPress={onSend}><Text style={s.sendBtnTxt}>Skicka</Text></Pressable>
      </View>
    </View>
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

const s = StyleSheet.create({
  toast: {position: 'absolute', left: 14, right: 14, bottom: 28, backgroundColor: '#3a352f', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, elevation: 8, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: {width: 0, height: 4}},
  toastTxt: {color: C.ink, fontSize: 15, fontWeight: '700', flex: 1},
  toastUndo: {color: C.accent, fontSize: 15, fontWeight: '900'},
  safe: {flex: 1, backgroundColor: C.bg},
  head: {paddingHorizontal: 22, paddingTop: 28, paddingBottom: 8},
  brand: {color: C.ink, fontSize: 32, fontWeight: '800', letterSpacing: 2},
  tag: {color: C.dim, fontSize: 15, marginTop: 2},
  build: {color: C.accent, fontSize: 11, opacity: 0.8},
  wrap: {flexGrow: 1, paddingHorizontal: 18, paddingTop: 8},
  card: {backgroundColor: C.panel, borderColor: C.edge, borderWidth: 1, borderRadius: 16, padding: 16},
  label: {color: C.dim, fontSize: 12, marginBottom: 5, marginTop: 10},
  input: {backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 10, color: C.ink, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15},
  row: {flexDirection: 'row', gap: 10},
  btn: {backgroundColor: C.accent, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 18},
  btnTxt: {color: '#2a1d0c', fontSize: 15, fontWeight: '700'},
  ghost: {marginTop: 12, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, alignSelf: 'flex-start'},
  ghostTxt: {color: C.ink, fontSize: 14},
  busy: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 22, paddingVertical: 14},
  busyTxt: {color: C.dim, fontSize: 14},
  err: {color: C.bad, fontSize: 13, paddingHorizontal: 22, paddingVertical: 8},
  nameRow: {paddingVertical: 13, paddingHorizontal: 12, borderRadius: 9},
  nameTxt: {color: C.ink, fontSize: 16},
  emptyBox: {paddingHorizontal: 22, paddingTop: 6},
  empty: {color: C.dim, fontSize: 14},
  tabs: {flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingTop: 4, paddingBottom: 10},
  tabBtn: {paddingVertical: 8, paddingHorizontal: 18, borderRadius: 20, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1},
  tabOn: {backgroundColor: C.accent, borderColor: C.accent},
  tabTxt: {color: C.dim, fontSize: 14, fontWeight: '600'},
  tabTxtOn: {color: '#2a1d0c'},
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
  slotNo: {color: C.accent, fontWeight: '700', width: 26, textAlign: 'center'},
  slotName: {color: C.ink, fontSize: 15},
  slotWhere: {color: C.dim, fontSize: 12, marginTop: 1},
  bubbleWrap: {marginBottom: 12, maxWidth: '82%'},
  bwL: {alignSelf: 'flex-start'},
  bwR: {alignSelf: 'flex-end'},
  bubble: {borderRadius: 16, paddingHorizontal: 13, paddingVertical: 10},
  bubbleIn: {backgroundColor: '#2c2824', borderBottomLeftRadius: 5},
  bubbleOut: {backgroundColor: '#4a3a22', borderBottomRightRadius: 5},
  bubbleTxt: {color: C.ink, fontSize: 15, lineHeight: 21},
  bubbleStamp: {color: C.dim, fontSize: 11, marginTop: 4},
  stampL: {textAlign: 'left', marginLeft: 6},
  stampR: {textAlign: 'right', marginRight: 6},
  sendRow: {flexDirection: 'row', gap: 8, padding: 12, borderTopColor: C.edge, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'flex-end'},
  sendInput: {flex: 1, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 10, color: C.ink, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, maxHeight: 120},
  sendBtn: {backgroundColor: C.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11},
  sendBtnTxt: {color: '#2a1d0c', fontSize: 15, fontWeight: '700'},

  // Arbetstidsrad
  workBar: {flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 18, marginBottom: 10, backgroundColor: C.panel, borderColor: C.edge, borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14},
  workDot: {width: 9, height: 9, borderRadius: 5},
  workTxt: {color: C.ink, fontSize: 14, flex: 1, fontWeight: '600'},
  workAction: {color: C.accent, fontSize: 13, fontWeight: '700'},

  // Status-brickor på stopp
  chip: {color: C.accent2, fontSize: 12, fontWeight: '700', marginLeft: 8},
  chevron: {color: C.dim, fontSize: 20, marginLeft: 8, marginTop: -2},

  // Sheets
  overlay: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)'},
  sheet: {position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 10},
  sheetHandle: {alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.edge, marginBottom: 12},
  sheetTitle: {color: C.ink, fontSize: 18, fontWeight: '800'},
  sheetSub: {color: C.dim, fontSize: 13, marginTop: 2, marginBottom: 2},
  sheetBtn: {backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, marginTop: 10},
  sheetBtnBad: {borderColor: '#5a2f2a'},
  sheetBtnTxt: {color: C.ink, fontSize: 15, fontWeight: '600'},
  sheetDiv: {height: 1, backgroundColor: C.edge, marginVertical: 12, opacity: 0.6},
  sheetNote: {color: C.dim, fontSize: 12, marginTop: 12, lineHeight: 17},
  primaryBtn: {backgroundColor: C.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10},
  primaryBtnTxt: {color: '#2a1d0c', fontSize: 15, fontWeight: '800'},

  // POD
  podLabel: {color: C.dim, fontSize: 12, marginTop: 14, marginBottom: 6, fontWeight: '600'},
  sigPad: {height: 170, backgroundColor: '#26231f', borderColor: C.edge, borderWidth: 1, borderRadius: 12, overflow: 'hidden', justifyContent: 'center', alignItems: 'center'},
  sigHint: {color: C.dim, fontSize: 14},
  sigClear: {alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 4, marginTop: 4},
  sigClearTxt: {color: C.accent, fontSize: 13, fontWeight: '700'},
  chipsWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  rChip: {backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 13},
  rChipOn: {backgroundColor: C.accent, borderColor: C.accent},
  rChipTxt: {color: C.dim, fontSize: 13, fontWeight: '600'},
  rChipTxtOn: {color: '#2a1d0c'},

  // Stor statusknapp (Lastad / Lossad)
  bigBtn: {backgroundColor: C.accent, borderRadius: 16, paddingVertical: 20, paddingHorizontal: 20, marginTop: 14},
  bigBtnTxt: {color: '#2a1d0c', fontSize: 22, fontWeight: '800'},
  bigBtnSub: {color: '#4a3517', fontSize: 13, marginTop: 3, fontWeight: '600'},

  // Foto
  photoRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  photoBox: {width: 84, height: 84, borderRadius: 12, overflow: 'hidden', backgroundColor: C.panel2},
  photoImg: {width: '100%', height: '100%'},
  photoX: {position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(20,18,16,0.8)', alignItems: 'center', justifyContent: 'center'},
  photoXTxt: {color: C.ink, fontSize: 16, lineHeight: 18, fontWeight: '700'},
  photoAdd: {width: 84, height: 84, borderRadius: 12, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  photoAddIco: {color: C.accent, fontSize: 22, fontWeight: '700'},
  photoAddTxt: {color: C.dim, fontSize: 12, marginTop: 2, fontWeight: '600'},
});

/**
 * RUTT – native förar-app.
 * Logga in mot Opter → välj namn → jobb hämtas → optimerad plan + lastplan.
 * (Kör-läge och statusar tillbaka till Opter kommer härnäst.)
 */
import React, {useMemo, useState, useEffect} from 'react';
import {
  View, StatusBar, StyleSheet, Text, TextInput, Pressable,
  FlatList, ActivityIndicator, ScrollView, Keyboard, Modal, PanResponder,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
// @ts-ignore
import OpterClient from './src/opter/OpterClient';
// @ts-ignore
import computeRoute, {slotWhere} from './src/opter/optimizer';

const C = {
  bg: '#1f1d1a', panel: '#272420', panel2: '#2f2b26', edge: '#3a352f',
  ink: '#efe9e0', dim: '#b3a89a', accent: '#e8a24c', accent2: '#7fb08a', bad: '#d2766a',
};
const client = new OpterClient();
const START = {lat: 59.2437, lng: 18.2280, label: 'Willys, Tyresö', end: '15:00'};
// Synlig bygg-stämpel så du alltid kan se vilket bygge du kör. Bumpas vid varje leverans.
const BUILD = '14 okt · status + POD';
// Arbetstids-typer (RST) – matchar protokollet.
const RST = {EndWork: 2, StartLunch: 3, EndLunch: 4, StartBreak: 5, EndBreak: 6};
// Avvikelseorsaker för "extra tid / tidsavvikelse" vid leverans.
const DEV_REASONS = ['Kund ej anträffbar', 'Fick vänta på lastning', 'Trafik/kö', 'Fel/saknad adress', 'Mottagare sen', 'Omlastning', 'Annat'];
const stopKey = (st: any) => `${st.verb}:${st.drop || st.pickup || ''}`;

const DEMO = {
  cargo: {
    A: {name: 'Nordsjö-pall + list', pal: 1, kg: 330, to: 'Klara Södra'},
    B: {name: 'Golvpall', pal: 1, kg: 1160, to: 'Älta'},
    C: {name: 'Sprutmaskin', pal: 0, kg: 60, to: 'Sundbyberg'},
  },
  stops: [
    {verb: 'Hämta', adr: 'Västberga Allé 40', area: 'Hägersten', lat: 59.2939, lng: 18.0129, pickup: 'A', deadline: '14:15', who: 'Nordsjö', note: '1 pall · 330 kg'},
    {verb: 'Hämta', adr: 'Lerkrogsvägen 9', area: 'Hägersten', lat: 59.2918, lng: 18.0045, pickup: 'B', deadline: '15:30', who: 'Golvgrossisten', note: '1 pall · 1160 kg'},
    {verb: 'Hämta', adr: 'Hjärtervägen 17', area: 'Trångsund', lat: 59.2377, lng: 18.1280, pickup: 'C', deadline: null, who: 'Olle', note: 'Sprutmaskin · 60 kg'},
    {verb: 'Lämna', adr: 'Klara Södra Kyrkogata 1', area: 'Stockholm', lat: 59.3302, lng: 18.0618, drop: 'A', deadline: null, who: 'NP Måleri', note: '330 kg'},
    {verb: 'Lämna', adr: 'Järnvägsgatan 11', area: 'Sundbyberg', lat: 59.3662, lng: 17.9522, drop: 'C', deadline: null, who: 'Verkstaden', note: 'Sprutmaskin'},
    {verb: 'Lämna', adr: 'Torvmossevägen 15', area: 'Älta', lat: 59.2660, lng: 18.1780, drop: 'B', deadline: null, who: 'Vasa Golv', note: '1160 kg'},
  ],
};

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

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
  const [stopIx, setStopIx] = useState<number | null>(null); // valt stopp (index i route.order)
  const [stat, setStat] = useState<Record<string, string>>({}); // stopKey -> statusetikett
  const [pod, setPod] = useState<Record<string, any>>({}); // cid -> POD-data

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

  const route = useMemo(() => {
    const src = orders.stops.length ? orders : demo ? DEMO : null;
    if (!src) return null;
    const now = src === DEMO ? new Date(new Date().setHours(6, 0, 0, 0)).getTime() : Date.now();
    try {
      return computeRoute(src.stops, src.cargo, START, now);
    } catch (e: any) {
      return {error: String(e?.message || e)};
    }
  }, [orders, demo]);

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
  async function sendMsg() {
    const t = msgText.trim();
    if (!t) return;
    setMsgText('');
    try { const m = await client.sendMessage(t); setMsgs(m); } catch (e: any) { setErr(String(e?.message || e)); }
  }

  const live = !demo && orders.stops.length > 0; // skarpt läge = riktiga jobb inloggade

  // Arbetstid → Opter (live). RST-typ + nytt visningsläge.
  async function doWork(rst: number, newState: 'igång' | 'rast' | 'lunch' | 'slut') {
    setWork(newState);
    setWorkSheet(false);
    if (live) { try { await client.workStatus(rst); } catch (e) {} }
  }

  // Stopp-status (lokalt nu; skarp uplink slås på efter verifiering mot riktigt jobb).
  function markStop(st: any, label: string) {
    setStat(s => ({...s, [stopKey(st)]: label}));
    setStopIx(null);
  }
  // POD sparad (lokalt nu).
  function savePod(st: any, data: any) {
    const cid = st.drop || st.pickup || '';
    setPod(p => ({...p, [cid]: data}));
    setStat(s => ({...s, [stopKey(st)]: 'Levererad'}));
    setStopIx(null);
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
          <Text style={s.build}>{BUILD}</Text>
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

          {tab !== 'chat' && !orders.stops.length && (
            <View style={s.emptyBox}>
              <Text style={s.empty}>Inga aktiva jobb just nu.</Text>
              {!demo && <Pressable style={s.ghost} onPress={() => setDemo(true)}><Text style={s.ghostTxt}>Visa demo så du ser planen</Text></Pressable>}
            </View>
          )}

          {tab === 'plan' && route && !(route as any).error && <PlanView route={route} stat={stat} onStop={setStopIx} />}
          {tab === 'last' && route && !(route as any).error && <LastView route={route} />}
          {tab === 'chat' && <ChatView msgs={msgs} msgText={msgText} setMsgText={setMsgText} onSend={sendMsg} />}
          {tab !== 'chat' && route && (route as any).error && <Text style={s.err}>Optimeringsfel: {(route as any).error}</Text>}
        </View>
      )}

      <WorkSheet open={workSheet} work={work} live={live} onClose={() => setWorkSheet(false)} onPick={doWork} />
      <StopSheet
        stop={stopIx != null && route && (route as any).order ? (route as any).order[stopIx] : null}
        live={live}
        onClose={() => setStopIx(null)}
        onStatus={markStop}
        onPod={savePod}
      />
    </SafeAreaView>
  );
}

function PlanView({route, stat, onStop}: {route: any; stat: Record<string, string>; onStop: (i: number) => void}) {
  const p = route.plan;
  const rows = route.order.map((st: any, i: number) => ({st, row: p.rows[i]}));
  return (
    <View style={{flex: 1}}>
      <View style={s.statRow}>
        <Stat b={p.end ? hhmm(p.end) : '–'} t="Klar ca" />
        <Stat b={`${Math.round(p.totKm)} km`} t="Totalt" />
        <Stat b={p.minMarg === Infinity ? '∞' : `${Math.round(p.minMarg)} min`} t="Marginal" />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(_, i) => String(i)}
        renderItem={({item, index}) => {
          const {st, row} = item;
          const done = stat[stopKey(st)];
          return (
            <Pressable style={({pressed}) => [s.stop, pressed && {opacity: 0.7}, done && {opacity: 0.85}]} onPress={() => onStop(index)}>
              <Text style={[s.num, done && {backgroundColor: C.accent2, color: '#1f1d1a'}]}>{done ? '✓' : index + 1}</Text>
              <View style={{flex: 1}}>
                <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                  <Text style={[s.verb, {color: st.verb === 'Hämta' ? C.accent : C.accent2, flexShrink: 1}]} numberOfLines={1}>
                    {st.verb} · {st.who || '—'}
                  </Text>
                  {done ? <Text style={s.chip}>{done}</Text> : <Text style={s.chevron}>›</Text>}
                </View>
                <Text style={s.addr}>{[st.adr, st.area].filter(Boolean).join(', ') || '(adress saknas)'}</Text>
                <Text style={s.meta}>
                  {row ? `ca ${hhmm(row.eta)}` : ''}
                  {st.deadline ? `  ·  senast ${st.deadline}` : '  ·  senast ∞'}
                  {row && row.late ? `  ·  ⚠ ${row.late} min sen` : ''}
                  {row && row.early ? `  ·  ⏳ väntar ${row.early} min` : ''}
                  {row ? `  ·  ${row.leg.km.toFixed(1)} km` : ''}
                </Text>
              </View>
            </Pressable>
          );
        }}
        ListFooterComponent={
          <Text style={s.foot}>
            Hem till {START.label} ca {p.end ? hhmm(p.end) : '–'}
            {p.backKm ? ` · ${Math.round(p.backKm)} km sista biten` : ''}
            {p.totWait ? ` · ${Math.round(p.totWait)} min väntan inräknad` : ''}
          </Text>
        }
      />
    </View>
  );
}

function LastView({route}: {route: any}) {
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
            <Text style={s.slotName}>{route && sl.cid}</Text>
            <Text style={s.slotWhere}>{slotWhere(i)}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function ChatView({msgs, msgText, setMsgText, onSend}: any) {
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
          renderItem={({item}) => (
            <View style={[s.bubbleWrap, item.received ? s.bwL : s.bwR]}>
              <View style={[s.bubble, item.received ? s.bubbleIn : s.bubbleOut]}>
                <Text style={s.bubbleTxt}>{item.text}</Text>
              </View>
              <Text style={[s.bubbleStamp, item.received ? s.stampL : s.stampR]}>
                {stamp(item)}
                {!item.received ? (item.confirmed ? '  ✓✓ Läst' : '  ✓ Skickat') : ''}
              </Text>
            </View>
          )}
        />
      )}
      <View style={[s.sendRow, {paddingBottom: 12 + (kb > 0 ? 0 : insets.bottom)}]}>
        <TextInput style={s.sendInput} value={msgText} onChangeText={setMsgText} placeholder="Skriv ett meddelande…" placeholderTextColor={C.dim} multiline />
        <Pressable style={s.sendBtn} onPress={onSend}><Text style={s.sendBtnTxt}>Skicka</Text></Pressable>
      </View>
    </View>
  );
}

function Stat({b, t}: {b: string; t: string}) {
  return <View style={s.stat}><Text style={s.statB}>{b}</Text><Text style={s.statT}>{t}</Text></View>;
}

// ---- Signaturruta (ingen native-dep: PanResponder + segment som roterade vyer) ----
type Pt = {x: number; y: number};
function Segments({stroke}: {stroke: Pt[]}) {
  const out = [];
  for (let i = 1; i < stroke.length; i++) {
    const a = stroke[i - 1], b = stroke[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    out.push(<View key={i} style={{position: 'absolute', left: mx - len / 2, top: my - 1.4, width: len, height: 2.8, borderRadius: 2, backgroundColor: C.ink, transform: [{rotate: `${ang}deg`}]}} />);
  }
  return <>{out}</>;
}
function SignaturePad({onChange}: {onChange: (has: boolean) => void}) {
  const [committed, setCommitted] = useState<Pt[][]>([]);
  const [curr, setCurr] = useState<Pt[]>([]);
  const ref = React.useRef<Pt[]>([]);
  const pan = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => { const p = [{x: e.nativeEvent.locationX, y: e.nativeEvent.locationY}]; ref.current = p; setCurr(p); },
      onPanResponderMove: e => {
        const x = e.nativeEvent.locationX, y = e.nativeEvent.locationY;
        const last = ref.current[ref.current.length - 1];
        if (!last || Math.hypot(x - last.x, y - last.y) > 1.8) { const p = [...ref.current, {x, y}]; ref.current = p; setCurr(p); }
      },
      onPanResponderRelease: () => { if (ref.current.length > 1) { setCommitted(c => [...c, ref.current]); onChange(true); } ref.current = []; setCurr([]); },
    }),
  ).current;
  function clear() { setCommitted([]); setCurr([]); ref.current = []; onChange(false); }
  return (
    <View>
      <View style={s.sigPad} {...pan.panHandlers}>
        {committed.length === 0 && curr.length === 0 && <Text style={s.sigHint}>Skriv under här</Text>}
        {committed.map((st, i) => <Segments key={i} stroke={st} />)}
        <Segments stroke={curr} />
      </View>
      <Pressable onPress={clear} style={s.sigClear}><Text style={s.sigClearTxt}>Rensa</Text></Pressable>
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

// ---- Stopp: status + POD ----
function StopSheet({stop, live, onClose, onStatus, onPod}: any) {
  const [mode, setMode] = useState<'status' | 'pod'>('status');
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [hasSig, setHasSig] = useState(false);
  const [dev, setDev] = useState<string | null>(null);
  const [devMin, setDevMin] = useState<number | null>(null);
  React.useEffect(() => { setMode('status'); setName(''); setComment(''); setHasSig(false); setDev(null); setDevMin(null); }, [stop]);
  if (!stop) return null;
  const pickup = stop.verb === 'Hämta';
  const title = `${stop.verb} · ${stop.who || '—'}`;
  const sub = [stop.adr, stop.area].filter(Boolean).join(', ');

  if (mode === 'pod') {
    const canSave = hasSig || name.trim().length > 0;
    return (
      <Sheet open onClose={onClose} title="Leverans – POD" sub={sub} scroll>
        <Text style={s.podLabel}>Namnteckning</Text>
        <SignaturePad onChange={setHasSig} />
        <Text style={s.podLabel}>Namnförtydligande</Text>
        <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Vem tog emot?" placeholderTextColor={C.dim} />
        <Text style={s.podLabel}>Avvikelse / extra tid (om något drog ut)</Text>
        <View style={s.chipsWrap}>
          {DEV_REASONS.map(r => (
            <Pressable key={r} style={[s.rChip, dev === r && s.rChipOn]} onPress={() => setDev(dev === r ? null : r)}>
              <Text style={[s.rChipTxt, dev === r && s.rChipTxtOn]}>{r}</Text>
            </Pressable>
          ))}
        </View>
        {dev && (
          <View style={s.chipsWrap}>
            {[15, 30, 45, 60].map(m => (
              <Pressable key={m} style={[s.rChip, devMin === m && s.rChipOn]} onPress={() => setDevMin(devMin === m ? null : m)}>
                <Text style={[s.rChipTxt, devMin === m && s.rChipTxtOn]}>+{m} min</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Text style={s.podLabel}>Kommentar</Text>
        <TextInput style={[s.input, {minHeight: 60}]} value={comment} onChangeText={setComment} placeholder="Valfritt" placeholderTextColor={C.dim} multiline />
        {!live && <Text style={s.sheetNote}>Sparas i appen nu. Sändning till Opter slås på efter test mot ett riktigt jobb.</Text>}
        <View style={{flexDirection: 'row', gap: 10, marginTop: 14}}>
          <Pressable style={[s.sheetBtn, {flex: 1}]} onPress={() => setMode('status')}><Text style={s.sheetBtnTxt}>Tillbaka</Text></Pressable>
          <Pressable style={[s.primaryBtn, {flex: 1.4, opacity: canSave ? 1 : 0.4}]} disabled={!canSave} onPress={() => onPod(stop, {name, comment, dev, devMin, hasSig, at: new Date()})}>
            <Text style={s.primaryBtnTxt}>Spara leverans</Text>
          </Pressable>
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title={title} sub={sub}>
      {pickup ? (<>
        <Pressable style={s.sheetBtn} onPress={() => onStatus(stop, 'Lastar')}><Text style={s.sheetBtnTxt}>Lastning påbörjad</Text></Pressable>
        <Pressable style={s.sheetBtn} onPress={() => onStatus(stop, 'Lastat')}><Text style={s.sheetBtnTxt}>Lastat / klar här</Text></Pressable>
      </>) : (<>
        <Pressable style={s.sheetBtn} onPress={() => onStatus(stop, 'Framme')}><Text style={s.sheetBtnTxt}>Framme hos mottagare</Text></Pressable>
        <Pressable style={s.sheetBtn} onPress={() => onStatus(stop, 'Lossar')}><Text style={s.sheetBtnTxt}>Lossning påbörjad</Text></Pressable>
        <Pressable style={s.primaryBtn} onPress={() => setMode('pod')}><Text style={s.primaryBtnTxt}>Signera leverans (POD) ›</Text></Pressable>
      </>)}
      <View style={s.sheetDiv} />
      <Pressable style={s.sheetBtn} onPress={() => onStatus(stop, 'Ankom terminal')}><Text style={s.sheetBtnTxt}>Ankom terminal</Text></Pressable>
      <Pressable style={s.sheetBtn} onPress={() => onStatus(stop, 'Avgick terminal')}><Text style={s.sheetBtnTxt}>Avgick terminal</Text></Pressable>
      {!live && <Text style={s.sheetNote}>Status sparas i appen nu. Sändning till Opter slås på efter test mot ett riktigt jobb.</Text>}
    </Sheet>
  );
}

// Generisk bottensheet
function Sheet({open, onClose, title, sub, scroll, children}: any) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.overlay} onPress={onClose} />
      <View style={[s.sheet, {paddingBottom: 16 + insets.bottom}]}>
        <View style={s.sheetHandle} />
        <Text style={s.sheetTitle}>{title}</Text>
        {sub ? <Text style={s.sheetSub}>{sub}</Text> : null}
        {scroll ? <ScrollView style={{maxHeight: 460}} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={{marginTop: 6}}>{children}</View>}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
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
});

/**
 * RUTT – native förar-app.
 * Logga in mot Opter → välj namn → jobb hämtas → optimerad plan + lastplan.
 * (Kör-läge och statusar tillbaka till Opter kommer härnäst.)
 */
import React, {useMemo, useState} from 'react';
import {
  View, StatusBar, StyleSheet, Text, TextInput, Pressable,
  FlatList, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
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

  const title = step === 'login' ? 'Logga in mot Opter' : step === 'pick' ? 'Välj ditt namn' : (orders.stops.length ? 'Din dag' : demo ? 'Demo' : 'Dina jobb');

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.head}><Text style={s.brand}>RUTT</Text><Text style={s.tag}>{title}</Text></View>

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

          {tab !== 'chat' && !orders.stops.length && (
            <View style={s.emptyBox}>
              <Text style={s.empty}>Inga aktiva jobb just nu.</Text>
              {!demo && <Pressable style={s.ghost} onPress={() => setDemo(true)}><Text style={s.ghostTxt}>Visa demo så du ser planen</Text></Pressable>}
            </View>
          )}

          {tab === 'plan' && route && !(route as any).error && <PlanView route={route} />}
          {tab === 'last' && route && !(route as any).error && <LastView route={route} />}
          {tab === 'chat' && <ChatView msgs={msgs} msgText={msgText} setMsgText={setMsgText} onSend={sendMsg} />}
          {tab !== 'chat' && route && (route as any).error && <Text style={s.err}>Optimeringsfel: {(route as any).error}</Text>}
        </View>
      )}
    </SafeAreaView>
  );
}

function PlanView({route}: {route: any}) {
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
          return (
            <View style={s.stop}>
              <Text style={s.num}>{index + 1}</Text>
              <View style={{flex: 1}}>
                <Text style={[s.verb, {color: st.verb === 'Hämta' ? C.accent : C.accent2}]}>
                  {st.verb} · {st.who || '—'}
                </Text>
                <Text style={s.addr}>{[st.adr, st.area].filter(Boolean).join(', ') || '(adress saknas)'}</Text>
                <Text style={s.meta}>
                  {row ? `ca ${hhmm(row.eta)}` : ''}
                  {st.deadline ? `  ·  senast ${st.deadline}` : '  ·  senast ∞'}
                  {row && row.late ? `  ·  ⚠ ${row.late} min sen` : ''}
                  {row && row.early ? `  ·  ⏳ väntar ${row.early} min` : ''}
                  {row ? `  ·  ${row.leg.km.toFixed(1)} km` : ''}
                </Text>
              </View>
            </View>
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
  return (
    <KeyboardAvoidingView style={{flex: 1}} behavior="padding" keyboardVerticalOffset={0}>
      {msgs.length === 0 ? (
        <View style={{flex: 1, padding: 18}}><Text style={s.empty}>Inga meddelanden.</Text></View>
      ) : (
        <FlatList
          style={{flex: 1}}
          contentContainerStyle={{padding: 14, paddingTop: 18}}
          data={data}
          inverted
          keyExtractor={(_, i) => String(i)}
          renderItem={({item}) => (
            <View style={[s.bubbleWrap, item.received ? s.bwL : s.bwR]}>
              <View style={[s.bubble, item.received ? s.bubbleIn : s.bubbleOut]}>
                <Text style={s.bubbleTxt}>{item.text}</Text>
              </View>
              <Text style={[s.bubbleStamp, item.received ? s.stampL : s.stampR]}>{stamp(item)}</Text>
            </View>
          )}
        />
      )}
      <View style={[s.sendRow, {paddingBottom: 12 + insets.bottom}]}>
        <TextInput style={s.sendInput} value={msgText} onChangeText={setMsgText} placeholder="Skriv ett meddelande…" placeholderTextColor={C.dim} multiline />
        <Pressable style={s.sendBtn} onPress={onSend}><Text style={s.sendBtnTxt}>Skicka</Text></Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Stat({b, t}: {b: string; t: string}) {
  return <View style={s.stat}><Text style={s.statB}>{b}</Text><Text style={s.statT}>{t}</Text></View>;
}

const s = StyleSheet.create({
  safe: {flex: 1, backgroundColor: C.bg},
  head: {paddingHorizontal: 22, paddingTop: 28, paddingBottom: 8},
  brand: {color: C.ink, fontSize: 32, fontWeight: '800', letterSpacing: 2},
  tag: {color: C.dim, fontSize: 15, marginTop: 2},
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
});

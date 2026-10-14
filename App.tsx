/**
 * RUTT – native förar-app.
 * Logga in mot Opter → välj ditt namn → dina jobb hämtas direkt.
 * (Optimizer, lastplan och kör-läge flyttas in härnäst.)
 */
import React, {useMemo, useState} from 'react';
import {
  View,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
// @ts-ignore
import OpterClient from './src/opter/OpterClient';

const C = {
  bg: '#1f1d1a', panel: '#272420', panel2: '#2f2b26', edge: '#3a352f',
  ink: '#efe9e0', dim: '#b3a89a', accent: '#e8a24c', accent2: '#7fb08a', bad: '#d2766a',
};

const client = new OpterClient();

type Stop = {
  verb: string; adr: string; area: string; who: string;
  deadline: string | null; pickup?: string; drop?: string;
};

export default function App(): React.JSX.Element {
  const [step, setStep] = useState<'login' | 'pick' | 'orders'>('login');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('');

  const [server, setServer] = useState('foriase.opter.cloud');
  const [port, setPort] = useState('443');
  const [path, setPath] = useState('mobile');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');

  const [resources, setResources] = useState<{resId: number; name: string}[]>([]);
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState<{cargo: any; stops: Stop[]}>({cargo: {}, stops: []});

  const filtered = useMemo(
    () => (query ? resources.filter(r => r.name.toLowerCase().includes(query.toLowerCase())) : resources),
    [resources, query],
  );

  async function login() {
    setErr(''); setBusy(true); setStatus('Ansluter och loggar in…');
    try {
      await client.connect({server: server.trim(), port: port.trim(), app: path.trim(), https: true});
      const info = await client.doLogon({user: user.trim(), pass});
      if (!info.ok) throw new Error('Inloggning nekad – kolla användarnamn/lösenord');
      setStatus('Hämtar förarlista…');
      await client.syncRef();
      if (info.needChoose) {
        setResources(client.resources());
        setStep('pick');
      } else {
        await pull(info.resId);
      }
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function pull(resId: number) {
    setBusy(true); setStatus('Hämtar dina jobb…');
    try {
      const {rutt} = await client.startWork(resId);
      setOrders(rutt);
      setStep('orders');
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.head}>
        <Text style={s.brand}>RUTT</Text>
        <Text style={s.tag}>
          {step === 'login' ? 'Logga in mot Opter' : step === 'pick' ? 'Välj ditt namn' : 'Dina jobb'}
        </Text>
      </View>

      {busy && (
        <View style={s.busy}>
          <ActivityIndicator color={C.accent} />
          <Text style={s.busyTxt}>{status}</Text>
        </View>
      )}
      {!!err && <Text style={s.err}>{err}</Text>}

      {step === 'login' && !busy && (
        <ScrollView contentContainerStyle={s.wrap}>
          <View style={s.card}>
            <Text style={s.label}>Serveradress</Text>
            <TextInput style={s.input} value={server} onChangeText={setServer} autoCapitalize="none" />
            <View style={s.row}>
              <View style={{width: 90}}>
                <Text style={s.label}>Port</Text>
                <TextInput style={s.input} value={port} onChangeText={setPort} keyboardType="numeric" />
              </View>
              <View style={{flex: 1}}>
                <Text style={s.label}>Sökväg</Text>
                <TextInput style={s.input} value={path} onChangeText={setPath} autoCapitalize="none" />
              </View>
            </View>
            <Text style={s.label}>Användarnamn</Text>
            <TextInput style={s.input} value={user} onChangeText={setUser} autoCapitalize="none" autoCorrect={false} />
            <Text style={s.label}>Lösenord</Text>
            <TextInput style={s.input} value={pass} onChangeText={setPass} secureTextEntry />
            <Pressable style={s.btn} onPress={login}>
              <Text style={s.btnTxt}>Logga in &amp; hämta</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}

      {step === 'pick' && !busy && (
        <View style={s.wrap}>
          <TextInput style={s.input} value={query} onChangeText={setQuery} placeholder="Sök ditt namn…" placeholderTextColor={C.dim} autoCapitalize="none" />
          <FlatList
            style={{marginTop: 10}}
            data={filtered}
            keyExtractor={r => String(r.resId)}
            renderItem={({item}) => (
              <Pressable style={s.nameRow} onPress={() => pull(item.resId)}>
                <Text style={s.nameTxt}>{item.name}</Text>
              </Pressable>
            )}
          />
        </View>
      )}

      {step === 'orders' && !busy && (
        <View style={s.wrap}>
          <Text style={s.count}>
            {orders.stops.length
              ? `${orders.stops.length} stopp · ${Object.keys(orders.cargo).length} ordrar`
              : 'Inga aktiva jobb just nu'}
          </Text>
          <FlatList
            data={orders.stops}
            keyExtractor={(_, i) => String(i)}
            renderItem={({item}) => (
              <View style={s.stop}>
                <Text style={[s.verb, {color: item.verb === 'Hämta' ? C.accent : C.accent2}]}>{item.verb}</Text>
                <View style={{flex: 1}}>
                  <Text style={s.who}>{item.who || '—'}</Text>
                  <Text style={s.addr}>
                    {[item.adr, item.area].filter(Boolean).join(', ') || '(adress saknas)'}
                    {item.deadline ? `  ·  senast ${item.deadline}` : ''}
                  </Text>
                </View>
              </View>
            )}
          />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1, backgroundColor: C.bg},
  head: {paddingHorizontal: 22, paddingTop: 28, paddingBottom: 8},
  brand: {color: C.ink, fontSize: 32, fontWeight: '800', letterSpacing: 2},
  tag: {color: C.dim, fontSize: 15, marginTop: 2},
  wrap: {flex: 1, paddingHorizontal: 18, paddingTop: 8},
  card: {backgroundColor: C.panel, borderColor: C.edge, borderWidth: 1, borderRadius: 16, padding: 16},
  label: {color: C.dim, fontSize: 12, marginBottom: 5, marginTop: 10},
  input: {backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 10, color: C.ink, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15},
  row: {flexDirection: 'row', gap: 10},
  btn: {backgroundColor: C.accent, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 18},
  btnTxt: {color: '#2a1d0c', fontSize: 15, fontWeight: '700'},
  busy: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 22, paddingVertical: 14},
  busyTxt: {color: C.dim, fontSize: 14},
  err: {color: C.bad, fontSize: 13, paddingHorizontal: 22, paddingVertical: 8},
  nameRow: {paddingVertical: 13, paddingHorizontal: 12, borderRadius: 9},
  nameTxt: {color: C.ink, fontSize: 16},
  count: {color: C.dim, fontSize: 13, marginBottom: 10},
  stop: {flexDirection: 'row', gap: 10, paddingVertical: 11, borderTopColor: C.edge, borderTopWidth: StyleSheet.hairlineWidth},
  verb: {width: 58, fontWeight: '700', fontSize: 13},
  who: {color: C.ink, fontSize: 15},
  addr: {color: C.dim, fontSize: 13, marginTop: 2},
});

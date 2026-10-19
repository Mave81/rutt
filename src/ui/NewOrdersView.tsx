/**
 * Nya ordrar – ligger här tills du accepterar, skickar vidare eller nekar dem, precis som Opters "Nytt".
 * Accepterade ordrar flyttar in i körplanen och räknas in i rutten.
 * Kortet används också ovanför rastrutan när en order kommer in under rasten.
 */
import React, {useMemo, useState} from 'react';
import {FlatList, Linking, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, themed, prettyPhone, whenText} from './theme';
import {Sheet} from './parts';
import {Bi} from './Bi';

const dial = (n: string) => Linking.openURL(`tel:${n.replace(/[^0-9+]/g, '')}`).catch(() => {});
const pretty = prettyPhone;

export type NewOrder = {cid: string; pick: any; drop: any; state?: 'sending' | 'failed' | 'forwarding'};
export type Driver = {resId: number; offId?: number; name: string};

/* Ett kort per ny order. compact = rastvyn: samma innehåll, tätare. */
export function NewOrderCard({item, cargo, compact, onAccept, onReject, onForward, extra}: {
  item: NewOrder; cargo?: any; compact?: boolean;
  onAccept: (o: NewOrder) => void; onReject: (o: NewOrder) => void; onForward?: (o: NewOrder) => void;
  extra?: React.ReactNode;
}) {
  const [full, setFull] = useState(false);
  const p = item.pick || {}, d = item.drop || {};
  const info = p.info || d.info || '';
  const busy = item.state === 'sending' || item.state === 'forwarding';
  const tels: any[] = [];
  for (const tl of [...(p.tel || []), ...(d.tel || [])]) if (!tels.some(x => x.num === tl.num)) tels.push(tl);
  const cg = (cargo && cargo[item.cid]) || {};
  const load = [cg.pal ? `${cg.pal} pall` : '', cg.kg || p.kg ? `${cg.kg || p.kg} kg` : '', (p.kolli || d.kolli) ? `${p.kolli || d.kolli} kolli` : ''].filter(Boolean).join(' · ');
  const leg = (verb: string, col: string, s: any) => (
    <View style={n.leg}>
      <View style={[n.dot, {backgroundColor: col}]} />
      <View style={{flex: 1, minWidth: 0}}>
        <Text style={[n.verb, {color: col}]}>{verb}</Text>
        <Text style={[n.who, compact && {fontSize: 16}]} numberOfLines={1}>{s.who || '—'}</Text>
        <Text style={n.adr} numberOfLines={1}>{[s.adr, s.area].filter(Boolean).join(', ')}</Text>
        <Text style={n.time}>{[s.tEarliest && `Tidigast ${whenText(s.tEarliest)}`, s.tLatest && `Senast ${whenText(s.tLatest)}`].filter(Boolean).join('  ·  ') || 'Ingen tid angiven'}</Text>
        {s.tidspass ? <Text style={[n.time, {color: C.accentInk, fontWeight: '900'}]}>TIDSPASSNING{s.tidspass.time ? ` kl ${s.tidspass.time}` : ' – tiden står inte i ordern'}</Text> : null}
      </View>
    </View>
  );
  return (
    <View style={[n.card, compact && n.cardC]}>
      <View style={n.top}>
        <View style={n.badgeBox}><Text style={n.badge}>NY ORDER</Text></View>
        <Text style={n.meta} numberOfLines={1}>{[p.orderNo && `#${p.orderNo}`, p.service].filter(Boolean).join('  ·  ')}</Text>
        {extra}
      </View>
      {load || p.goods ? <Text style={n.load} numberOfLines={2}>{[load, p.goods].filter(Boolean).join('  ·  ')}</Text> : null}
      {(p.customer || p.orderedBy) && !compact ? (
        <Text style={[n.meta, {marginTop: 6}]} numberOfLines={2}>
          {[p.customer && `Kund: ${p.customer}`, p.orderedBy && p.orderedBy !== p.customer && `Beställare: ${p.orderedBy}`].filter(Boolean).join('  ·  ')}
        </Text>
      ) : null}
      {leg('HÄMTA', C.accentInk, p)}
      {leg('LÄMNA', C.accent2, d)}
      {!!info && (
        <Pressable style={n.info} onPress={() => setFull(f => !f)}>
          <Text style={n.infoTxt} numberOfLines={full ? undefined : compact ? 2 : 4}>{info}</Text>
          <Text style={n.more}>{full ? 'Visa mindre' : 'Visa hela'}</Text>
        </Pressable>
      )}
      {tels.length > 0 && !compact && (
        <View style={n.tels}>
          {tels.map((tl: any) => (
            <Pressable key={tl.num} style={n.tel} onPress={() => dial(tl.num)}>
              <Text style={n.telName} numberOfLines={1}>{tl.label}</Text>
              <Text style={n.telNum}>{pretty(tl.num)}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {item.state === 'failed' && <Text style={n.fail}>Opter bekräftade inte – försök igen.</Text>}
      <View style={n.actions}>
        <Pressable style={[n.ghost, {flex: 0.8}, busy && {opacity: 0.4}]} disabled={busy} onPress={() => onReject(item)} android_ripple={{color: C.edge}}>
          <Text style={[n.ghostTxt, {color: C.bad}]} numberOfLines={1}>Neka</Text>
        </Pressable>
        {onForward ? (
          <Pressable style={[n.ghost, {flex: 1.25}, busy && {opacity: 0.4}]} disabled={busy} onPress={() => onForward(item)} android_ripple={{color: C.edge}}>
            <Text style={[n.ghostTxt, {color: C.people}]} numberOfLines={1}>{item.state === 'forwarding' ? 'Skickar…' : 'Skicka vidare'}</Text>
          </Pressable>
        ) : null}
        <Pressable style={[n.accept, busy && {opacity: 0.6}]} disabled={busy} onPress={() => onAccept(item)} android_ripple={{color: C.edge}}>
          <Bi n="check2" size={17} color="#FFFFFF" /><Text style={n.acceptTxt} numberOfLines={1}>{item.state === 'sending' ? 'Skickar…' : 'Acceptera'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* Neka – samma fråga som förut. */
export function RejectSheet({o, onClose, onReject}: {o: NewOrder | null; onClose: () => void; onReject: (o: NewOrder) => void}) {
  return (
    <Sheet open={!!o} onClose={onClose} title="Neka ordern?" sub={o ? `${o.pick?.who || ''} → ${o.drop?.who || ''}` : ''}>
      <Text style={n.sheetTxt}>Ordern skickas tillbaka till kontoret som nekad.</Text>
      <View style={n.actions}>
        <Pressable style={n.ghost} onPress={onClose}><Text style={n.ghostTxt}>Avbryt</Text></Pressable>
        <Pressable style={[n.accept, {backgroundColor: C.bad}]} onPress={() => { const x = o; onClose(); if (x) onReject(x); }}>
          <Text style={n.acceptTxt}>Ja, neka</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

/* Skicka vidare (Opters "Ge bort"): välj förare ur åkeriets lista, bekräfta. */
export function ForwardSheet({o, drivers, onClose, onForward}: {o: NewOrder | null; drivers: Driver[]; onClose: () => void; onForward: (o: NewOrder, d: Driver) => void}) {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<Driver | null>(null);
  const list = useMemo(() => drivers.filter(d => !q.trim() || d.name.toLowerCase().includes(q.trim().toLowerCase())), [drivers, q]);
  const close = () => { setQ(''); setPick(null); onClose(); };
  if (!o) return null;
  return (
    <Sheet open onClose={close} title={pick ? `Skicka till ${pick.name.split(' ')[0]}?` : 'Skicka vidare till'} sub={`${o.pick?.who || ''} → ${o.drop?.who || ''}`} scroll>
      {pick ? (
        <>
          <Text style={n.sheetTxt}>Ordern flyttas till {pick.name} i Opter och försvinner från din lista.</Text>
          <View style={n.actions}>
            <Pressable style={n.ghost} onPress={() => setPick(null)}><Text style={n.ghostTxt}>Tillbaka</Text></Pressable>
            <Pressable style={[n.accept, {backgroundColor: C.people}]} onPress={() => { const d = pick; close(); onForward(o, d); }}>
              <Bi n="send-fill" size={15} color="#FFFFFF" /><Text style={n.acceptTxt}>Skicka</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          {drivers.length > 8 ? <TextInput value={q} onChangeText={setQ} placeholder="Sök förare" placeholderTextColor={C.faint} style={n.search} /> : null}
          {list.map(d => (
            <Pressable key={d.resId} style={n.drv} onPress={() => setPick(d)} android_ripple={{color: C.edge}}>
              <View style={n.av}><Text style={n.avT}>{d.name.split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase()}</Text></View>
              <Text style={n.drvN} numberOfLines={1}>{d.name}</Text>
              <Bi n="chevron-right" size={15} color={C.faint} />
            </Pressable>
          ))}
          {!drivers.length ? <Text style={n.sheetTxt}>Förarlistan från Opter är inte hämtad än.</Text> : null}
        </>
      )}
    </Sheet>
  );
}

export default function NewOrdersView({orders, cargo, onAccept, onReject, onForward}: {orders: NewOrder[]; cargo?: any; onAccept: (o: NewOrder) => void; onReject: (o: NewOrder) => void; onForward?: (o: NewOrder) => void}) {
  const [confirmReject, setConfirmReject] = useState<NewOrder | null>(null);
  const bottom = useSafeAreaInsets().bottom + 40;
  return (
    <View style={{flex: 1}}>
      <FlatList
        data={orders}
        style={{flex: 1}}
        keyExtractor={o => o.cid}
        contentContainerStyle={{paddingHorizontal: 14, paddingBottom: bottom}}
        ListEmptyComponent={<Text style={n.empty}>Inga nya ordrar. Nya uppdrag dyker upp här först.</Text>}
        renderItem={({item}) => <NewOrderCard item={item} cargo={cargo} onAccept={onAccept} onReject={setConfirmReject} onForward={onForward} />}
      />
      <RejectSheet o={confirmReject} onClose={() => setConfirmReject(null)} onReject={onReject} />
    </View>
  );
}

const n = themed(() => StyleSheet.create({
  empty: {color: C.dim, fontSize: 15, textAlign: 'center', marginTop: 30, paddingHorizontal: 20},
  card: {backgroundColor: C.panel, borderColor: C.accent, borderWidth: 1.5, borderRadius: 16, padding: 16, marginBottom: 12},
  cardC: {padding: 14, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: {width: 0, height: 4}, elevation: 6},
  top: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4},
  badgeBox: {backgroundColor: C.accent, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3},
  badge: {color: C.onAccent, fontSize: 11, fontWeight: '900', letterSpacing: 1.5},
  load: {color: C.ink, fontSize: 14, fontWeight: '800', marginTop: 6},
  tels: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10},
  tel: {backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, maxWidth: '100%'},
  telName: {color: C.dim, fontSize: 12, fontWeight: '700'},
  telNum: {color: C.accentInk, fontSize: 15, fontWeight: '800', marginTop: 1},
  meta: {color: C.dim, fontSize: 12, fontWeight: '700', flex: 1},
  leg: {flexDirection: 'row', gap: 10, marginTop: 10},
  dot: {width: 8, height: 8, borderRadius: 4, marginTop: 5},
  verb: {fontSize: 10.5, fontWeight: '900', letterSpacing: 1.5},
  who: {color: C.ink, fontSize: 17, fontWeight: '800', marginTop: 1},
  adr: {color: C.dim, fontSize: 14, marginTop: 1},
  time: {color: C.faint, fontSize: 12, marginTop: 2},
  info: {backgroundColor: C.noteBg, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 11, marginTop: 12},
  infoTxt: {color: C.noteInk, fontSize: 13.5, lineHeight: 19},
  more: {color: C.accentInk, fontSize: 12, fontWeight: '700', marginTop: 5},
  fail: {color: C.bad, fontSize: 13, fontWeight: '700', marginTop: 10},
  actions: {flexDirection: 'row', gap: 8, marginTop: 14},
  ghost: {flex: 1, flexDirection: 'row', gap: 6, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center'},
  ghostTxt: {color: C.ink, fontSize: 14.5, fontWeight: '800'},
  accept: {flex: 1.35, flexDirection: 'row', gap: 6, backgroundColor: C.accent2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center'},
  acceptTxt: {color: '#FFFFFF', fontSize: 15.5, fontWeight: '900'},
  sheetTxt: {color: C.dim, fontSize: 14, marginTop: 8},
  search: {backgroundColor: C.panel2, color: C.ink, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 6},
  drv: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.edge},
  av: {width: 36, height: 36, borderRadius: 18, backgroundColor: C.peopleSoft, alignItems: 'center', justifyContent: 'center'},
  avT: {color: C.people, fontWeight: '900', fontSize: 12.5},
  drvN: {flex: 1, color: C.ink, fontSize: 15, fontWeight: '700'},
}));

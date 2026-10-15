/**
 * Nya ordrar – ligger här tills du accepterar (eller nekar) dem, precis som Opters "Nytt".
 * Accepterade ordrar flyttar in i körplanen och räknas in i rutten.
 */
import React, {useState} from 'react';
import {FlatList, Linking, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, themed, prettyPhone, whenText} from './theme';
import {Sheet} from './parts';

const dial = (n: string) => Linking.openURL(`tel:${n.replace(/[^0-9+]/g, '')}`).catch(() => {});
const pretty = prettyPhone;

export type NewOrder = {cid: string; pick: any; drop: any; state?: 'sending' | 'failed'};

export default function NewOrdersView({orders, onAccept, onReject}: {orders: NewOrder[]; onAccept: (o: NewOrder) => void; onReject: (o: NewOrder) => void}) {
  const [full, setFull] = useState<Record<string, boolean>>({});
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
        renderItem={({item}) => {
          const p = item.pick || {}, d = item.drop || {};
          const info = p.info || d.info || '';
          const busy = item.state === 'sending';
          const tels: any[] = [];
          for (const tl of [...(p.tel || []), ...(d.tel || [])]) if (!tels.some(x => x.num === tl.num)) tels.push(tl);
          return (
            <View style={n.card}>
              <View style={n.top}>
                <View style={n.badgeBox}><Text style={n.badge}>NY ORDER</Text></View>
                <Text style={n.meta}>{[p.orderNo && `#${p.orderNo}`, p.service, (p.kolli || d.kolli) ? `${p.kolli || d.kolli} kollin` : ''].filter(Boolean).join('  ·  ')}</Text>
              </View>
              <View style={n.leg}>
                <Text style={[n.verb, {color: C.accentInk}]}>HÄMTA</Text>
                <View style={{flex: 1}}>
                  <Text style={n.who}>{p.who || '—'}</Text>
                  <Text style={n.adr}>{[p.adr, p.area].filter(Boolean).join(', ')}</Text>
                  <Text style={n.time}>{[p.tEarliest && `Tidigast ${whenText(p.tEarliest)}`, p.tLatest && `Senast ${whenText(p.tLatest)}`].filter(Boolean).join('  ·  ') || 'Ingen tid angiven'}</Text>
                </View>
              </View>
              <View style={n.leg}>
                <Text style={[n.verb, {color: C.accent2}]}>LÄMNA</Text>
                <View style={{flex: 1}}>
                  <Text style={n.who}>{d.who || '—'}</Text>
                  <Text style={n.adr}>{[d.adr, d.area].filter(Boolean).join(', ')}</Text>
                  <Text style={n.time}>{[d.tEarliest && `Tidigast ${whenText(d.tEarliest)}`, d.tLatest && `Senast ${whenText(d.tLatest)}`].filter(Boolean).join('  ·  ') || 'Ingen tid angiven'}</Text>
                </View>
              </View>
              {!!info && (
                <Pressable style={n.info} onPress={() => setFull(f => ({...f, [item.cid]: !f[item.cid]}))}>
                  <Text style={n.infoTxt} numberOfLines={full[item.cid] ? undefined : 4}>{info}</Text>
                  <Text style={n.more}>{full[item.cid] ? 'Visa mindre' : 'Visa hela'}</Text>
                </Pressable>
              )}
              {tels.length > 0 && (
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
                <Pressable style={[n.reject, busy && {opacity: 0.4}]} disabled={busy} onPress={() => setConfirmReject(item)}>
                  <Text style={n.rejectTxt}>Neka</Text>
                </Pressable>
                <Pressable style={[n.accept, busy && {opacity: 0.6}]} disabled={busy} onPress={() => onAccept(item)}>
                  <Text style={n.acceptTxt}>{busy ? 'Skickar…' : 'Acceptera'}</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
      <Sheet open={!!confirmReject} onClose={() => setConfirmReject(null)} title="Neka ordern?" sub={confirmReject ? `${confirmReject.pick?.who || ''} → ${confirmReject.drop?.who || ''}` : ''}>
        <Text style={n.sheetTxt}>Ordern skickas tillbaka till kontoret som nekad.</Text>
        <View style={n.actions}>
          <Pressable style={n.reject} onPress={() => setConfirmReject(null)}><Text style={n.rejectTxt}>Avbryt</Text></Pressable>
          <Pressable style={[n.accept, {backgroundColor: C.bad}]} onPress={() => { const o = confirmReject; setConfirmReject(null); if (o) onReject(o); }}>
            <Text style={n.acceptTxt}>Ja, neka</Text>
          </Pressable>
        </View>
      </Sheet>
    </View>
  );
}

const n = themed(() => StyleSheet.create({
  empty: {color: C.dim, fontSize: 15, textAlign: 'center', marginTop: 30, paddingHorizontal: 20},
  card: {backgroundColor: C.panel, borderColor: C.accent, borderWidth: 1.5, borderRadius: 16, padding: 16, marginBottom: 12},
  top: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6},
  badgeBox: {backgroundColor: C.accent, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3},
  badge: {color: C.onAccent, fontSize: 11, fontWeight: '900', letterSpacing: 1.5},
  tels: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10},
  tel: {backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, maxWidth: '100%'},
  telName: {color: C.dim, fontSize: 12, fontWeight: '700'},
  telNum: {color: C.accentInk, fontSize: 15, fontWeight: '800', marginTop: 1},
  meta: {color: C.dim, fontSize: 12, fontWeight: '700', flex: 1},
  leg: {flexDirection: 'row', gap: 12, marginTop: 12},
  verb: {fontSize: 11, fontWeight: '900', letterSpacing: 1.5, width: 52, marginTop: 4},
  who: {color: C.ink, fontSize: 17, fontWeight: '800'},
  adr: {color: C.dim, fontSize: 14, marginTop: 1},
  time: {color: C.faint, fontSize: 12, marginTop: 3},
  info: {backgroundColor: C.noteBg, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 11, marginTop: 14},
  infoTxt: {color: C.noteInk, fontSize: 13.5, lineHeight: 19},
  more: {color: C.accentInk, fontSize: 12, fontWeight: '700', marginTop: 5},
  fail: {color: C.bad, fontSize: 13, fontWeight: '700', marginTop: 10},
  actions: {flexDirection: 'row', gap: 10, marginTop: 16},
  reject: {flex: 1, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 12, paddingVertical: 15, alignItems: 'center'},
  rejectTxt: {color: C.ink, fontSize: 16, fontWeight: '800'},
  accept: {flex: 2, backgroundColor: C.accent2, borderRadius: 12, paddingVertical: 15, alignItems: 'center'},
  acceptTxt: {color: '#FFFFFF', fontSize: 17, fontWeight: '900'},
  sheetTxt: {color: C.dim, fontSize: 14, marginTop: 8},
}));

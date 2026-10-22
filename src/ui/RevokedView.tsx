/**
 * Återkallade order – som Opter: kontoret drar tillbaka en order (SAS_Revoked), föraren kvitterar (SAS_RevokedConfirmed).
 *  - RevokedBar: röd rad överst i planen tills du kvitterat. Ligger godset i bilen står det så.
 *  - RevokedView: listan under Klart → Återkallade (30 dagar bakåt).
 * Opter skickar INTE vem som återkallade eller när – tiden är när RUTT först såg det. Vi gissar aldrig avsändare.
 */
import React from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, themed, hhmm, FONT, R} from './theme';
import {Bi} from './Bi';

export const REVOKED_KEY = 'rutt.revoked.v1';
export type RevEntry = {
  cid: string; orderNo: string | null; who: string; adr: string; from: string; fromAdr: string;
  at: number; inCar: boolean; open: boolean; confirmedAt: number | null; sending?: boolean; failed?: boolean; msg?: string | null;
};

export function RevokedBar({list, onConfirm, onOpen}: {list: RevEntry[]; onConfirm: (cid: string) => void; onOpen: () => void}) {
  const open = list.filter(e => e.open);
  if (!open.length) return null;
  const show = open.slice(0, 2);
  return (
    <View style={r.barWrap}>
      {show.map(e => (
        <View key={e.cid} style={r.bar}>
          <Bi n="x-octagon-fill" size={17} color={C.bad} />
          <Pressable style={{flex: 1, minWidth: 0}} onPress={onOpen}>
            <Text style={r.barT} numberOfLines={1}>Återkallad{e.orderNo ? ` · ${e.orderNo}` : ''}</Text>
            <Text style={r.barS} numberOfLines={1}>{[e.who, e.adr].filter(Boolean).join(', ')}{e.inCar ? ' · ligger i bilen' : ' · lasta inte'}</Text>
          </Pressable>
          <Pressable disabled={e.sending} style={[r.btn, e.sending && {opacity: 0.5}]} onPress={() => onConfirm(e.cid)}>
            <Text style={r.btnT}>{e.sending ? 'Skickar…' : e.failed ? 'Försök igen' : 'Kvittera'}</Text>
          </Pressable>
        </View>
      ))}
      {open.length > 2 ? <Pressable onPress={onOpen}><Text style={r.more}>+{open.length - 2} till – visa alla</Text></Pressable> : null}
    </View>
  );
}

const day = (t: number) => { const d = new Date(t); const n = new Date(); const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === n.toDateString()) return 'Idag'; if (d.toDateString() === y.toDateString()) return 'Igår';
  return d.toLocaleDateString('sv-SE', {weekday: 'short', day: 'numeric', month: 'short'}); };

export default function RevokedView({list, onConfirm}: {list: RevEntry[]; onConfirm: (cid: string) => void}) {
  const bottom = useSafeAreaInsets().bottom + 24;
  const data = [...list].sort((a, b) => b.at - a.at);
  return (
    <FlatList
      data={data}
      style={{flex: 1}}
      keyExtractor={e => e.cid}
      contentContainerStyle={{paddingHorizontal: 12, paddingBottom: bottom}}
      ListHeaderComponent={data.length ? <Text style={r.hint}>Order som kontoret dragit tillbaka, 30 dagar bakåt. Opter berättar inte vem som återkallade – tiden är när RUTT såg det.</Text> : undefined}
      ListEmptyComponent={<View style={r.empty}><Bi n="check2-all" size={30} color={C.faint} /><Text style={r.emptyT}>Inga återkallade order.</Text></View>}
      renderItem={({item: e, index}) => {
        const newDay = index === 0 || day(data[index - 1].at) !== day(e.at);
        return (
          <View>
            {newDay ? <Text style={r.day}>{day(e.at).toUpperCase()}</Text> : null}
            <View style={r.card}>
              <View style={r.top}>
                <Text style={[r.tag, {color: e.open ? C.bad : C.faint}]}>{e.open ? 'ÅTERKALLAD' : 'KVITTERAD'}</Text>
                <Text style={r.time}>{hhmm(new Date(e.at))}</Text>
                <View style={{flex: 1}} />
                {e.orderNo ? <Text style={r.no}>{e.orderNo}</Text> : null}
              </View>
              <Text style={r.who} numberOfLines={1}>{e.who || '—'}</Text>
              <Text style={r.meta} numberOfLines={1}>{e.adr}</Text>
              {e.from ? <Text style={r.meta} numberOfLines={1}>Från {e.from}{e.fromAdr ? `, ${e.fromAdr}` : ''}</Text> : null}
              <Text style={[r.meta, e.inCar && e.open && {color: C.bad, fontWeight: '700'}]}>{e.inCar ? 'Godset var lastat – ligger i bilen' : 'Godset var inte lastat'}</Text>
              {e.msg ? <Text style={r.msg} numberOfLines={3}>Kontoret: {e.msg}</Text> : null}
              {e.confirmedAt ? <Text style={r.meta}>Kvitterad {hhmm(new Date(e.confirmedAt))}</Text> : null}
              {e.open ? (
                <Pressable disabled={e.sending} style={[r.btnWide, e.sending && {opacity: 0.5}]} onPress={() => onConfirm(e.cid)}>
                  <Text style={r.btnT}>{e.sending ? 'Skickar till Opter…' : e.failed ? 'Opter tog inte emot – försök igen' : 'Kvittera i Opter'}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      }}
    />
  );
}

const r = themed(() => StyleSheet.create({
  barWrap: {marginHorizontal: 12, marginBottom: 6, gap: 4},
  bar: {flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.badSoft, borderRadius: R, paddingVertical: 8, paddingLeft: 10, paddingRight: 8},
  barT: {color: C.bad, fontFamily: FONT.cond, fontSize: 16, fontWeight: '700'},
  barS: {color: C.dim, fontSize: 12.5, marginTop: 1},
  btn: {backgroundColor: C.bad, borderRadius: R, paddingHorizontal: 12, height: 36, alignItems: 'center', justifyContent: 'center'},
  btnT: {color: '#FFFFFF', fontFamily: FONT.cond, fontSize: 15, fontWeight: '700'},
  more: {color: C.bad, fontFamily: FONT.cond, fontSize: 14, fontWeight: '700', paddingHorizontal: 4, paddingVertical: 4},
  hint: {color: C.faint, fontSize: 12.5, lineHeight: 18, marginBottom: 8, marginTop: 2},
  day: {color: C.faint, fontFamily: FONT.cond, fontSize: 12.5, fontWeight: '700', letterSpacing: 1, marginTop: 10, marginBottom: 4},
  card: {backgroundColor: C.panel, borderRadius: R, padding: 12, marginBottom: 6},
  top: {flexDirection: 'row', alignItems: 'center', gap: 8},
  tag: {fontFamily: FONT.cond, fontSize: 12.5, fontWeight: '700', letterSpacing: 1},
  time: {color: C.dim, fontFamily: FONT.cond, fontSize: 14, fontWeight: '600'},
  no: {color: C.faint, fontFamily: FONT.mono, fontSize: 12.5},
  who: {color: C.ink, fontFamily: FONT.cond, fontSize: 18, fontWeight: '700', marginTop: 6},
  meta: {color: C.dim, fontSize: 13, marginTop: 2},
  msg: {color: C.ink, fontSize: 13, marginTop: 6, backgroundColor: C.panel2, borderRadius: R, padding: 8},
  btnWide: {backgroundColor: C.bad, borderRadius: R, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 10},
  empty: {alignItems: 'center', gap: 10, marginTop: 40},
  emptyT: {color: C.dim, fontSize: 15},
}));

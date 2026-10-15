/**
 * Dagens jobb – en rad per order.
 *  - Raden visar nästa sak att göra för ordern: HÄMTA → (Lastad) → samma rad blir LOSSA.
 *  - Ordningen är den optimerade körordningen, räknad om från där du står efter varje steg.
 *  - Översta raden = NÄSTA, alltid utfälld med Ring / Kör dit / huvudknappen.
 *    Övriga rader är kompakta; tryck för att fälla ut (om du vill göra något i annan ordning).
 *  - Klart hamnar i en egen sektion längst ner.
 */
import React, {useMemo, useState} from 'react';
import {FlatList, Linking, Pressable, StyleSheet, Text, View} from 'react-native';
import {C, hhmm} from './theme';
import {Sheet} from './parts';

type Row = {kind: 'pickup' | 'drop'; st: any; cid: string; plan: any; dropLater?: {eta: Date | null; area: string} | null};

function navigate(st: any) {
  const q = st.lat != null && st.lng != null ? `${st.lat},${st.lng}` : encodeURIComponent([st.adr, st.zip, st.area].filter(Boolean).join(', '));
  Linking.openURL(`google.navigation:q=${q}`).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}`).catch(() => {}));
}
const dial = (num: string) => Linking.openURL(`tel:${num}`).catch(() => {});

export default function OrdersView({route, cargo, ost, allStops, onLoaded, onUnload}: {
  route: any; cargo: any; ost: Record<string, any>; allStops: any[];
  onLoaded: (st: any) => void; onUnload: (st: any) => void;
}) {
  const [open, setOpen] = useState<string | null>(null); // utfälld rad (cid) utöver NÄSTA
  const [callStop, setCallStop] = useState<any>(null);
  const [showDone, setShowDone] = useState(false);

  // Bygg raderna ur körordningen: hämtningar alltid; lämningar bara när godset är lastat.
  const rows: Row[] = useMemo(() => {
    const order = route.order || [], prow = route.plan.rows || [];
    const dropAt: Record<string, any> = {};
    order.forEach((s: any, i: number) => { if (s.drop) dropAt[s.drop] = {eta: prow[i] && prow[i].eta, area: s.area || s.adr}; });
    const out: Row[] = [];
    order.forEach((s: any, i: number) => {
      if (s.pickup) out.push({kind: 'pickup', st: s, cid: s.pickup, plan: prow[i], dropLater: dropAt[s.pickup] || null});
      else if (s.drop && ost[s.drop] && ost[s.drop].loadedAt) out.push({kind: 'drop', st: s, cid: s.drop, plan: prow[i]});
    });
    return out;
  }, [route, ost]);

  const done = useMemo(() => {
    return Object.keys(ost)
      .filter(cid => ost[cid] && ost[cid].doneAt)
      .map(cid => ({cid, o: ost[cid], st: allStops.find(s => s.drop === cid) || {}}))
      .sort((a, b) => b.o.doneAt - a.o.doneAt);
  }, [ost, allStops]);

  const p = route.plan;
  const left = rows.length;

  function callFor(st: any) {
    const tel = st.tel || [];
    if (tel.length === 1) dial(tel[0].num);
    else if (tel.length > 1) setCallStop(st);
  }

  const renderRow = ({item, index}: {item: Row; index: number}) => {
    const {st, kind, cid, plan} = item;
    const isNext = index === 0;
    const expanded = isNext || open === cid;
    const c = cargo[cid] || {};
    const pickup = kind === 'pickup';
    const tone = pickup ? C.accent : C.accent2;
    const late = plan && plan.late;
    const goods = [c.pal ? `${c.pal} pall` : '', c.kg ? `${c.kg} kg` : '', c.goods || c.name].filter(Boolean).join(' · ');
    const notes = [st.adrMsg, pickup ? st.msg : st.driverMsg].filter(Boolean);
    const hasTel = (st.tel || []).length > 0;

    return (
      <Pressable
        onPress={() => !isNext && setOpen(open === cid ? null : cid)}
        style={[o.card, isNext && o.cardNext, !expanded && o.cardCompact]}>
        {isNext && <Text style={[o.nextTag, {color: tone}]}>NÄSTA</Text>}

        <View style={o.headRow}>
          <View style={[o.verbPill, {backgroundColor: pickup ? '#3d2e18' : '#22322a'}]}>
            <Text style={[o.verbTxt, {color: tone}]}>{pickup ? 'HÄMTA' : 'LOSSA'}</Text>
          </View>
          <Text style={o.num}>#{index + 1}</Text>
          <View style={{flex: 1}} />
          <Text style={[o.eta, late && {color: C.bad}]}>{plan ? `ca ${hhmm(plan.eta)}` : ''}</Text>
        </View>

        <Text style={[o.who, !expanded && {fontSize: 17}]} numberOfLines={expanded ? 2 : 1}>{st.who || '—'}</Text>
        <Text style={o.adr} numberOfLines={expanded ? 2 : 1}>{[st.adr, st.area].filter(Boolean).join(', ') || 'Adress saknas'}</Text>

        <Text style={o.meta}>
          {st.deadline ? `Senast ${st.deadline}` : 'Ingen sluttid'}
          {late ? `  ·  ${late} min sen` : ''}
          {plan && plan.early ? `  ·  öppnar om ${plan.early} min` : ''}
          {plan && plan.leg && plan.leg.km ? `  ·  ${plan.leg.km.toFixed(1)} km dit` : ''}
        </Text>

        {expanded && (
          <>
            {!!goods && <Text style={o.goods}>{goods}</Text>}
            {(st.contact || st.code || st.ref) ? (
              <View style={o.facts}>
                {!!st.contact && <Text style={o.fact}>Kontakt: <Text style={o.factB}>{st.contact}</Text></Text>}
                {!!st.code && <Text style={o.fact}>Portkod: <Text style={o.factB}>{st.code}</Text></Text>}
                {!!st.ref && <Text style={o.fact}>Ref: <Text style={o.factB}>{st.ref}</Text></Text>}
              </View>
            ) : null}
            {notes.map((n, i) => <View key={i} style={o.note}><Text style={o.noteTxt}>{n}</Text></View>)}
            {pickup && item.dropLater && (
              <Text style={o.later}>Lossas sen i {item.dropLater.area}{item.dropLater.eta ? ` ca ${hhmm(item.dropLater.eta)}` : ''}</Text>
            )}

            <View style={o.actions}>
              <Pressable style={[o.sideBtn, !hasTel && o.sideOff]} disabled={!hasTel} onPress={() => callFor(st)}>
                <Text style={[o.sideTxt, !hasTel && {color: C.faint}]}>{hasTel ? 'Ring kund' : 'Inget nr'}</Text>
              </Pressable>
              <Pressable style={o.sideBtn} onPress={() => navigate(st)}>
                <Text style={o.sideTxt}>Kör dit</Text>
              </Pressable>
              <Pressable style={[o.mainBtn, {backgroundColor: tone}]} onPress={() => (pickup ? onLoaded(st) : onUnload(st))}>
                <Text style={o.mainTxt}>{pickup ? 'Lastad' : 'Lossad'}</Text>
              </Pressable>
            </View>
          </>
        )}
      </Pressable>
    );
  };

  return (
    <View style={{flex: 1}}>
      <View style={o.stats}>
        <Stat b={left ? (p.end ? hhmm(p.end) : '–') : 'Klart'} t="Klar ca" />
        <Stat b={`${left}`} t={left === 1 ? 'stopp kvar' : 'stopp kvar'} />
        <Stat b={`${Math.round(p.totKm)} km`} t="kvar att köra" />
      </View>
      <FlatList
        data={rows}
        keyExtractor={r => r.kind + r.cid}
        renderItem={renderRow}
        contentContainerStyle={{paddingHorizontal: 14, paddingBottom: 30}}
        ListEmptyComponent={<Text style={o.allDone}>Allt är klart för idag. Snyggt jobbat!</Text>}
        ListFooterComponent={
          done.length ? (
            <View style={{marginTop: 10}}>
              <Pressable style={o.doneHead} onPress={() => setShowDone(!showDone)}>
                <Text style={o.doneHeadTxt}>Klart  ·  {done.length}</Text>
                <Text style={o.doneChev}>{showDone ? 'Dölj' : 'Visa'}</Text>
              </Pressable>
              {showDone && done.map(({cid, o: os, st}) => (
                <View key={cid} style={o.doneRow}>
                  <Text style={o.doneCheck}>✓</Text>
                  <View style={{flex: 1}}>
                    <Text style={o.doneWho} numberOfLines={1}>{st.who || cid}</Text>
                    <Text style={o.doneMeta} numberOfLines={1}>
                      Lossad {hhmm(new Date(os.doneAt))}{os.pod && os.pod.name ? `  ·  ${os.pod.name}` : ''}{os.pod && os.pod.photos && os.pod.photos.length ? `  ·  ${os.pod.photos.length} foto` : ''}{os.pod && os.pod.dev ? `  ·  avvikelse` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : undefined
        }
      />

      <Sheet open={!!callStop} onClose={() => setCallStop(null)} title="Ring" sub={callStop ? callStop.who : ''}>
        {callStop && (callStop.tel || []).map((t: any) => (
          <Pressable key={t.num} style={o.callRow} onPress={() => { setCallStop(null); dial(t.num); }}>
            <Text style={o.callLabel}>{t.label}</Text>
            <Text style={o.callNum}>{t.num}</Text>
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

function Stat({b, t}: {b: string; t: string}) {
  return <View style={o.stat}><Text style={o.statB}>{b}</Text><Text style={o.statT}>{t}</Text></View>;
}

const o = StyleSheet.create({
  stats: {flexDirection: 'row', gap: 10, paddingHorizontal: 14, marginBottom: 10},
  stat: {flex: 1, backgroundColor: C.panel, borderColor: C.edge, borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center'},
  statB: {color: C.ink, fontSize: 17, fontWeight: '800'},
  statT: {color: C.dim, fontSize: 11, marginTop: 2},

  card: {backgroundColor: C.panel, borderColor: C.edge, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10},
  cardNext: {borderColor: '#5a4528', borderWidth: 1.5, padding: 16},
  cardCompact: {paddingVertical: 11},
  nextTag: {fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 6},
  headRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  verbPill: {borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3},
  verbTxt: {fontSize: 12, fontWeight: '900', letterSpacing: 1.5},
  num: {color: C.faint, fontSize: 13, fontWeight: '700'},
  eta: {color: C.ink, fontSize: 15, fontWeight: '800'},
  who: {color: C.ink, fontSize: 20, fontWeight: '800', marginTop: 8},
  adr: {color: C.dim, fontSize: 14, marginTop: 2},
  meta: {color: C.faint, fontSize: 12, marginTop: 5},
  goods: {color: C.ink, fontSize: 14, marginTop: 10, fontWeight: '600'},
  facts: {marginTop: 8, gap: 2},
  fact: {color: C.dim, fontSize: 13},
  factB: {color: C.ink, fontWeight: '700'},
  note: {backgroundColor: C.noteBg, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 11, marginTop: 8},
  noteTxt: {color: C.noteInk, fontSize: 13, lineHeight: 18},
  later: {color: C.faint, fontSize: 12, marginTop: 8},
  actions: {flexDirection: 'row', gap: 8, marginTop: 14},
  sideBtn: {flex: 1, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center'},
  sideOff: {opacity: 0.55},
  sideTxt: {color: C.ink, fontSize: 14, fontWeight: '700'},
  mainBtn: {flex: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center'},
  mainTxt: {color: '#1d150a', fontSize: 17, fontWeight: '900'},

  allDone: {color: C.dim, fontSize: 15, textAlign: 'center', marginTop: 30},
  doneHead: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4},
  doneHeadTxt: {color: C.dim, fontSize: 14, fontWeight: '800', letterSpacing: 0.5},
  doneChev: {color: C.accent, fontSize: 13, fontWeight: '700'},
  doneRow: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4, borderTopColor: C.edge, borderTopWidth: StyleSheet.hairlineWidth, opacity: 0.85},
  doneCheck: {color: C.accent2, fontSize: 16, fontWeight: '900', width: 18, textAlign: 'center'},
  doneWho: {color: C.ink, fontSize: 15, fontWeight: '700'},
  doneMeta: {color: C.faint, fontSize: 12, marginTop: 1},

  callRow: {backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, marginTop: 10},
  callLabel: {color: C.dim, fontSize: 12, fontWeight: '600'},
  callNum: {color: C.ink, fontSize: 18, fontWeight: '800', marginTop: 2},
});

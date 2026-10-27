/**
 * Plan · Imorgon (och dagarna efter): RUTT:s förslag i den ordning du kör, med tider.
 * "Ändra ordning" = samma dra-och-släpp som för idag. Din ordning sparas för dagen och blir dagens ordning när den kommer.
 * Ovanför: hur dagen blir – klar ca, sena stopp, och om något måste lastas om.
 */
import React, {useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, themed, hhmm} from './theme';
import {Bi} from './Bi';
import ReorderSheet from './Reorder';
import {simulateLoad} from '../opter/optimizer';

const SHADES = ['#FF9117', '#FFC27A', '#B85F00', '#FFE0B8', '#7A3F00', '#E87A00', '#FFAA45', '#4F2900'];
const INK = ['#000', '#000', '#FFF', '#000', '#FFF', '#000', '#000', '#FFF'];

export default function PlanDay({route, cargo, onReorder, starts = [], startId, onStart, onOpen}: {route: any; cargo: any; onReorder: (keys: string[] | null) => void; starts?: {id: string; label: string}[]; startId?: string; onStart?: (id: string) => void; onOpen?: (s: any) => void}) {
  const bottom = useSafeAreaInsets().bottom + 30;
  const [open, setOpen] = useState(false);
  const order: any[] = (route && route.order) || [];
  const rows: any[] = (route && route.plan && route.plan.rows) || [];
  const items = useMemo(() => order.map((s: any, i: number) => ({key: s.pickup ? 'p' + s.pickup : 'd' + s.drop, kind: s.pickup ? 'pickup' : 'drop', cid: String(s.pickup || s.drop), st: s, plan: rows[i]})), [route]);
  const info = useMemo(() => {
    const cids: string[] = [];
    order.forEach((s: any) => { const c = String(s.pickup || s.drop); if (!cids.includes(c)) cids.push(c); });
    const sim: any = simulateLoad(order, new Set(), cargo);
    const pal = cids.reduce((n, c) => n + (Number((cargo[c] || {}).pal) || 0), 0);
    const peak = (sim.peak || []).filter(Boolean).length;
    const late = (route && route.plan && route.plan.broken) || [];
    const nogeoL = order.filter((s: any) => s.lat == null), nogeo = nogeoL.length;
    const approxL = order.filter((s: any) => s.geoApprox);
    const est = rows.filter((r: any, i: number) => i > 0 && r && r.leg && r.leg.est && !r.nogeo).length;
    const tps = order.map((s: any, i: number) => ({s, r: rows[i]})).filter((x: any) => x.s.tidspass);
    return {cids, pal, peak, blocks: sim.blocks || [], late, end: route && route.plan && route.plan.end, nogeo, nogeoL, approxL, est, tps};
  }, [route, cargo]);
  if (!route || !order.length) return <View style={p.empty}><Bi n="calendar-event" size={30} color={C.faint} /><Text style={p.emptyT}>Inga order för imorgon än.</Text></View>;
  const date = route.day ? new Date(route.day + 'T12:00').toLocaleDateString('sv-SE', {weekday: 'long', day: 'numeric', month: 'long'}) : '';
  const num = (cid: string) => info.cids.indexOf(cid);
  const ok = !info.late.length && !info.blocks.length;
  return (
    <View style={{flex: 1}}>
      <ScrollView contentContainerStyle={{paddingHorizontal: 14, paddingBottom: bottom}}>
        <Text style={p.date}>{date.charAt(0).toUpperCase() + date.slice(1)} · {route.manual ? 'din ordning' : 'RUTT:s förslag'}</Text>
        {starts.length > 1 && onStart ? (
          <View style={p.startRow}>
            <Text style={p.startL}>Startar från</Text>
            {starts.map(x => (
              <Pressable key={x.id} onPress={() => onStart(x.id)} style={[p.chip, x.id === startId && p.chipOn]}>
                <Text style={[p.chipT, x.id === startId && p.chipTOn]}>{x.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={[p.sum, !ok && {backgroundColor: C.badSoft}]}>
          <Text style={p.sumT}>{info.cids.length} order · {info.pal} pall{info.end ? ` · klar ca ${hhmm(new Date(info.end))}` : ''}</Text>
          {info.late.length ? <Text style={[p.sumS, {color: C.bad}]}>{info.late.length} stopp blir sena: {info.late.map((x: any) => `${x.s.who || '—'} (${x.late} min)`).join(', ')}</Text> : null}
          {info.blocks.length ? <Text style={[p.sumS, {color: C.bad}]}>Måste lasta om: {info.blocks.length} gång{info.blocks.length > 1 ? 'er' : ''} – gods står i vägen</Text> : null}
          {ok ? <Text style={p.sumS}>Alla tider hålls · inget behöver lastas om · som mest {info.peak} pall ombord</Text> : null}
          {info.tps.map((x: any) => (
            <View key={'tp' + (x.s.pickup || x.s.drop)} style={p.tp}>
              <Bi n="alarm-fill" size={14} color={C.onAccent} />
              <Text style={p.tpT}>Tidspassning {x.s.who || ''}{x.s.tidspass.time ? ` kl ${x.s.tidspass.time}` : ' – tiden står inte i ordern, kolla med kontoret'}{x.s.tidspass.time && x.r && x.r.eta ? ` · du är där ca ${hhmm(new Date(x.r.eta))}` : ''}</Text>
            </View>
          ))}
          {info.approxL.length ? <Text style={p.sumS}>Ungefärlig plats (gatan finns inte på kartan, postnumret används): {info.approxL.map((x: any) => `${x.who || x.adr} – ${[x.adr, x.area].filter(Boolean).join(', ')}`).join('; ')}</Text> : null}
          {info.nogeo ? <Text style={[p.sumS, {color: C.bad}]}>Hittas inte på kartan: {info.nogeoL.map((x: any) => `${x.who || '—'} (${[x.adr, x.zip, x.area].filter(Boolean).join(' ') || 'adress saknas'})`).join(', ')} – körtiden dit är okänd, ordningen kan bli fel</Text>
            : info.est ? <Text style={p.sumS}>Körtider uppskattade (inget svar från kartan än)</Text>
            : <Text style={p.sumS}>Körtider längs vägarna (OpenStreetMap)</Text>}
        </View>
        {order.map((s: any, i: number) => {
          const cid = String(s.pickup || s.drop), n = num(cid), r = rows[i] || {};
          const pal = Number((cargo[cid] || {}).pal) || 0;
          const sub = s.pickup
            ? `Hämta ${pal ? pal + ' pall' : ''}${s.open ? ` · öppnar ${s.open}` : ''}`
            : `Lämna ${pal ? pal + ' pall' : ''}${s.area ? ` · ${s.area}` : ''}${s.deadline ? ` · senast ${s.deadline}` : ''}`;
          return (
            <Pressable key={(s.pickup ? 'p' : 'd') + cid} style={p.row} onPress={() => onOpen && onOpen(s)} android_ripple={{color: C.edge}} accessibilityLabel={`${s.pickup ? 'Hämta' : 'Lämna'} ${s.who || ''} – visa ordern`}>
              <View style={[p.n, {backgroundColor: SHADES[n % SHADES.length]}]}><Text style={[p.nT, {color: INK[n % INK.length]}]}>{n + 1}</Text></View>
              <Bi n={s.pickup ? 'box-arrow-up-right' : 'check2'} size={15} color={s.pickup ? C.accentInk : C.accent2} />
              <View style={{flex: 1, minWidth: 0}}>
                <Text style={p.who} numberOfLines={1}>{s.who || s.adr || '—'}</Text>
                {s.tidspass ? <Text style={p.tpS} numberOfLines={1}>TIDSPASSNING{s.tidspass.time ? ` kl ${s.tidspass.time}` : ' – tid saknas'}</Text> : null}
                <Text style={p.sub} numberOfLines={1}>{sub}</Text>
              </View>
              <Text style={[p.tm, r.late ? {color: C.bad} : null]}>{r.eta ? `ca ${hhmm(new Date(r.eta))}` : ''}</Text>
              {onOpen ? <Bi n="chevron-right" size={13} color={C.faint} /> : null}
            </Pressable>
          );
        })}
        <Pressable style={p.btn} onPress={() => setOpen(true)} android_ripple={{color: C.edge}}>
          <Bi n="list-ul" size={16} color={C.onAccent} /><Text style={p.btnT}>Ändra ordning – dra och släpp</Text>
        </Pressable>
        {route.manual ? (
          <Pressable style={p.btn2} onPress={() => onReorder(null)}><Bi n="arrow-repeat" size={15} color={C.ink} /><Text style={p.btn2T}>Smart ordning igen</Text></Pressable>
        ) : null}
        <Text style={p.note}>Lastplanen under Last följer den här ordningen. Din ordning blir dagens ordning när dagen kommer.</Text>
      </ScrollView>
      <ReorderSheet open={open} items={items as any} manual={!!route.manual} onClose={() => setOpen(false)} onSave={keys => { setOpen(false); onReorder(keys); }} />
    </View>
  );
}

const p = themed(() => StyleSheet.create({
  empty: {alignItems: 'center', paddingTop: 50, gap: 10},
  emptyT: {color: C.dim, fontSize: 15},
  date: {color: C.dim, fontSize: 13, fontWeight: '700', marginTop: 2, marginBottom: 8, paddingHorizontal: 2},
  sum: {backgroundColor: C.panel, borderRadius: 12, padding: 12, marginBottom: 8, gap: 3},
  sumT: {color: C.ink, fontSize: 15.5, fontWeight: '900'},
  sumS: {color: C.dim, fontSize: 12.5, fontWeight: '600'},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.panel, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 6},
  n: {width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center'},
  nT: {fontSize: 13, fontWeight: '900'},
  who: {color: C.ink, fontSize: 15, fontWeight: '800'},
  sub: {color: C.dim, fontSize: 12, marginTop: 1},
  tm: {color: C.ink, fontSize: 13, fontWeight: '800'},
  btn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.accent, borderRadius: 12, paddingVertical: 14, marginTop: 14},
  btnT: {color: C.onAccent, fontSize: 15, fontWeight: '900'},
  btn2: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.panel2, borderRadius: 12, paddingVertical: 12, marginTop: 8},
  btn2T: {color: C.ink, fontSize: 14, fontWeight: '800'},
  startRow: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 8},
  startL: {color: C.dim, fontSize: 12.5, fontWeight: '700', marginRight: 2},
  chip: {backgroundColor: C.panel, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12},
  chipOn: {backgroundColor: C.accent},
  chipT: {color: C.ink, fontSize: 13, fontWeight: '700'},
  chipTOn: {color: C.onAccent},
  tp: {flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.accent, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10, marginTop: 5},
  tpT: {color: C.onAccent, fontSize: 13, fontWeight: '800', flex: 1},
  tpS: {color: C.accentInk, fontSize: 11.5, fontWeight: '900', letterSpacing: 0.4, marginTop: 1},
  note: {color: C.faint, fontSize: 12, marginTop: 10, paddingHorizontal: 2},
}));

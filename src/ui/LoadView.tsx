/**
 * Last: bilen sedd ovanifrån. Hytten överst, bakgavellyften nederst, 3 platser i bredd × 6 på längden.
 * Du lastar alltid mot hytten: det som lossas SIST står längst fram, det som lossas FÖRST står vid lyften.
 * Siffran i rutan = vilket ställe godset lossas på (1 = först ut). Varje ställe har sin egen orange nyans,
 * så allt som ska av på samma ställe syns direkt – oavsett hur många order det är.
 * Med kommer allt som ska med: det som redan är ombord, dagens hämtningar och kommande dagars order.
 * Platserna räknas fram i den ordning du hämtar (rutten), inte tvärtom: det som hämtas först står längst in.
 * Rutten väljer hämtordning så att inget står i vägen när det ska av; går det inte syns en varning.
 */
import React, {useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, themed, hhmm, whenText, todayYmd} from './theme';
import {Bi} from './Bi';
import {samePlace} from './OrdersView';
import {simulateLoad} from '../opter/optimizer';

// Orange nyanser, en per ställe i lossordning: 1 = starkast. Mörk text på ljusa, vit på mörka.
const SHADES: {bg: string; ink: string}[] = [
  {bg: '#FF9117', ink: '#000000'}, {bg: '#FFC27A', ink: '#000000'}, {bg: '#B85F00', ink: '#FFFFFF'},
  {bg: '#FFE0B8', ink: '#000000'}, {bg: '#7A3F00', ink: '#FFFFFF'}, {bg: '#E87A00', ink: '#000000'},
  {bg: '#FFAA45', ink: '#000000'}, {bg: '#4F2900', ink: '#FFFFFF'},
];
const shade = (n: number) => SHADES[(n - 1) % SHADES.length];

const WIDE = 3, LONG = 6, TOTAL = WIDE * LONG;

type LoadOrder = {cid: string; pick: any; drop: any; onboard: boolean};

export default function LoadView({orders, cargo, route, laterRoute}: {orders: LoadOrder[]; cargo: any; route: any; laterRoute?: any}) {
  const bottom = useSafeAreaInsets().bottom + 24;
  const [step, setStep] = useState<number>(-1); // -1 = fullast

  const plan = useMemo(() => {
    // Hela körningen i ordning: dagens rutt, sen kommande dagars (också optimerad). Samma simulering som optimeraren använder:
    // godset ställs där det faktiskt hamnar när du hämtar i den ordningen, och det som står i vägen syns.
    const want = new Set(orders.filter(o => o.drop).map(o => o.cid));
    const seq = [...((route && route.order) || []), ...((laterRoute && laterRoute.order) || [])].filter((s: any) => want.has(String(s.pickup || s.drop)));
    const onboard = new Set(orders.filter(o => o.onboard && o.drop).map(o => o.cid));
    const sim: any = simulateLoad(seq, onboard, cargo, true);
    const etaDrop: Record<string, any> = {}, etaPick: Record<string, any> = {};
    for (const R of [route, laterRoute]) ((R && R.order) || []).forEach((s: any, i: number) => {
      const eta = R.plan && R.plan.rows && R.plan.rows[i] && R.plan.rows[i].eta;
      if (s.drop) etaDrop[s.drop] = eta; if (s.pickup) etaPick[s.pickup] = eta;
    });
    const dropSeq: string[] = []; seq.forEach((s: any) => { if (s.drop && !dropSeq.includes(String(s.drop))) dropSeq.push(String(s.drop)); });
    for (const o of orders) if (o.drop && !dropSeq.includes(o.cid)) dropSeq.push(o.cid);
    const byCid: Record<string, LoadOrder> = {}; orders.forEach(o => { byCid[o.cid] = o; });
    const list = dropSeq.map(c => byCid[c]).filter(Boolean);
    const pickNo: Record<string, number> = {}; let pn = 0;
    seq.forEach((s: any) => { if (s.pickup && !onboard.has(String(s.pickup))) pickNo[String(s.pickup)] = ++pn; });
    // Samma ställe = samma nummer och färg (t.ex. 14 order till samma mottagare).
    const num: Record<string, number> = {}; const heads: any[] = [];
    list.forEach(o => { let i = heads.findIndex(h => samePlace(h, o.drop)); if (i < 0) { heads.push(o.drop); i = heads.length - 1; } num[o.cid] = i + 1; });
    // Huvudbilden: ALLA order i bilen på en gång, där de ska stå (det som lossas sist längst in mot hytten).
    const dropOnly = list.map(o => ({drop: o.cid}));
    const all: any = simulateLoad(dropOnly, new Set(list.map(o => o.cid)), cargo);
    const rowsOf: Record<string, number[]> = {};
    for (const c of Object.keys(all.at)) rowsOf[c] = all.at[c].map((i: number) => Math.floor(i / WIDE) + 1);
    const slots = all.peak.map((c: any) => (c ? {cid: c, loose: !(Number((cargo[c] || {}).pal) > 0)} : null));
    const pallets = all.peak.filter(Boolean).length;
    const blockOf: Record<string, any> = {}; sim.blocks.forEach((b: any) => { blockOf[b.cid] = b; });
    // Steg för steg: bilen före första stoppet ("Nu") och efter varje stopp, i den ordning du kör (din eller RUTT:s).
    const steps = (sim.steps || []).map((x: any, i: number) => {
      const st = x.stop; const cnt = x.slots.filter(Boolean).length;
      const label = !st ? 'Nu' : `Efter ${String(st.who || (st.pickup ? 'hämtning' : 'lossning')).split(/[\s/,]/)[0]}`;
      return {i, label, stop: st, cnt, slots: x.slots.map((c: any) => (c ? {cid: c, loose: !(Number((cargo[c] || {}).pal) > 0)} : null))};
    });
    const total = list.reduce((n: number, o: any) => n + Math.max(1, Math.round(Number((cargo[o.cid] || {}).pal) || 0) || 1), 0);
    return {list, slots, num, over: all.over, pallets, total, rowsOf, etaDrop, etaPick, pickNo, blockOf, multiPick: pn > 1, steps};
  }, [orders, cargo, route, laterRoute]);

  if (!plan.list.length) {
    return (
      <View style={l.empty}>
        <Bi n="truck" size={34} color={C.faint} />
        <Text style={l.emptyTxt}>Inget att lasta just nu.</Text>
      </View>
    );
  }

  const when = (eta: any, st: any) => (eta ? `ca ${hhmm(new Date(eta))}` : st ? whenText(st.tEarliest || st.tLatest) : '');
  const rowsTxt = (r: number[] = []) => {
    if (!r.length) return '';
    const a = Math.min(...r), b = Math.max(...r);
    const where = b <= 2 ? 'mot hytten' : a >= 5 ? 'vid lyften' : 'mitten';
    return `${a === b ? `rad ${a}` : `rad ${a}–${b}`} · ${where}`;
  };

  // I rutan står vart pallen ska (mottagarens namn, kort) – en ruta = en pallplats.
  const shortWho = (cid: string) => { const o = plan.list.find((x: any) => x.cid === cid); const w = String((o && o.drop && (o.drop.who || o.drop.adr)) || (cargo[cid] || {}).name || '').replace(/\b(AB|HB|KB|i Sverige|Sverige)\b/g, '').trim(); const f = w.split(/[\s/,]+/).filter(Boolean); return f[0] && f[0].length < 4 && f[1] ? f[0] + ' ' + f[1] : f[0] || '—'; };
  const sel = step >= 0 && plan.steps[step] ? plan.steps[step] : null;
  const shown = sel ? sel.slots : plan.slots;
  const stepTxt = sel ? (sel.stop ? `${sel.stop.pickup ? 'Hämtat' : 'Lossat'} hos ${sel.stop.who || '—'}${(plan.etaPick[sel.stop.pickup] || plan.etaDrop[sel.stop.drop]) ? ` · ca ${hhmm(new Date(plan.etaPick[sel.stop.pickup] || plan.etaDrop[sel.stop.drop]))}` : ''}` : 'Så ser bilen ut nu') : null;
  return (
    <ScrollView contentContainerStyle={{paddingHorizontal: 14, paddingBottom: bottom}}>
      {plan.steps.length > 2 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={l.steps}>
          {[{i: -1, label: 'Alla order', cnt: plan.pallets}, ...plan.steps].map((x: any) => (
            <Pressable key={x.i} onPress={() => setStep(x.i)} style={[l.stepChip, step === x.i && l.stepOn]}>
              <Text style={[l.stepTxt, step === x.i && l.stepTxtOn]} numberOfLines={1}>{x.label}</Text>
              <Text style={[l.stepN, step === x.i && l.stepTxtOn]}>{x.cnt} pl</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={l.sumRow}>
        <Text style={l.sum}><Text style={l.sumB}>{Math.min(sel ? sel.cnt : plan.pallets, TOTAL)}</Text> av {TOTAL} pallplatser{sel ? ' i bilen just då' : ' upptagna'}</Text>
        <Text style={l.sumDim}>En ruta = en pall · namnet = vart den ska</Text>
      </View>
      {stepTxt ? <Text style={l.stepInfo}>{stepTxt}</Text> : null}
      {plan.over > 0 && (
        <View style={l.warn}><Bi n="exclamation-triangle-fill" size={15} color={C.bad} /><Text style={l.warnTxt}>{plan.over} pall får inte plats – prata med kontoret.</Text></View>
      )}

      <View style={l.truck}>
        <View style={l.cab}><Bi n="truck" size={15} color={C.dim} /><Text style={l.cabTxt}>Hytt</Text></View>
        <View style={l.grid}>
          {Array.from({length: LONG}).map((_, r) => (
            <View key={r} style={l.gridRow}>
              <Text style={l.rowNo}>{r + 1}</Text>
              {Array.from({length: WIDE}).map((__, c) => {
                const sl = shown[r * WIDE + c];
                if (!sl) return <View key={c} style={[l.cell, l.cellEmpty]} />;
                const n = plan.num[sl.cid];
                const sh = shade(n);
                return (
                  <View key={c} style={[l.cell, {backgroundColor: sh.bg}]}>
                    {sl.loose ? <Bi n="box-seam-fill" size={13} color={sh.ink} /> : null}
                    <Text style={[l.cellNo, {color: sh.ink}]} numberOfLines={1}>{shortWho(sl.cid)}</Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
        <View style={l.lift}><Bi n="chevron-down" size={13} color={C.dim} /><Text style={l.cabTxt}>Bakgavellyft</Text></View>
      </View>

      <Text style={l.head}>Lossas i den här ordningen</Text>
      {plan.list.map(o => {
        const n = plan.num[o.cid];
        const c = cargo[o.cid] || {};
        const pal = Math.max(0, Number(c.pal) || 0);
        return (
          <View key={o.cid} style={l.item}>
            <View style={[l.badge, {backgroundColor: shade(n).bg}]}>
              <Text style={[l.badgeTxt, {color: shade(n).ink}]}>{n}</Text>
            </View>
            <View style={{flex: 1, minWidth: 0}}>
              <Text style={l.who} numberOfLines={1}>{o.drop.who || '—'}</Text>
              <Text style={l.meta} numberOfLines={1}>Lossas {when(plan.etaDrop[o.cid], o.drop)} · {[o.drop.area || o.drop.adr].filter(Boolean).join('')}</Text>
              <View style={l.stRow}>
                {o.onboard
                  ? <><Bi n="check-circle-fill" size={12} color={C.accent2} /><Text style={[l.st, {color: C.accent2}]}>Ombord</Text></>
                  : <><Bi n="box-seam" size={12} color={C.faint} /><Text style={l.st}>{plan.multiPick && plan.pickNo[o.cid] ? <Text style={{color: C.ink, fontWeight: '800'}}>Hämta {plan.pickNo[o.cid] === 1 ? 'först' : `som nr ${plan.pickNo[o.cid]}`} · </Text> : null}{when(plan.etaPick[o.cid], o.pick)}{o.pick && o.pick.who ? ` hos ${o.pick.who}` : ''}</Text></>}
              </View>
              {plan.blockOf[o.cid] ? (
                <View style={l.stRow}><Bi n="exclamation-triangle-fill" size={12} color={C.bad} /><Text style={[l.st, {color: C.bad}]}>{plan.blockOf[o.cid].pal} pall står i vägen – lasta om här</Text></View>
              ) : null}
            </View>
            <View style={{alignItems: 'flex-end'}}>
              <Text style={l.pal}>{pal ? `${pal} pl` : 'lös'}</Text>
              <Text style={l.rows}>{rowsTxt(plan.rowsOf[o.cid])}</Text>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const l = themed(() => StyleSheet.create({
  empty: {flex: 1, alignItems: 'center', paddingTop: 60, gap: 10},
  emptyTxt: {color: C.dim, fontSize: 15},
  sumRow: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 10, rowGap: 2, marginBottom: 10, paddingHorizontal: 2},
  sum: {color: C.dim, fontSize: 14},
  sumB: {color: C.ink, fontSize: 18, fontWeight: '800'},
  sumDim: {color: C.faint, fontSize: 12, fontWeight: '600'},
  warn: {flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.badSoft, borderRadius: 10, padding: 11, marginBottom: 10},
  warnTxt: {color: C.bad, fontSize: 13.5, fontWeight: '700', flex: 1},
  truck: {backgroundColor: C.panel, borderColor: C.edge, borderWidth: 1, borderRadius: 14, padding: 12},
  cab: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.panel2, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, paddingVertical: 9, marginBottom: 8, marginLeft: 22},
  lift: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.panel2, borderRadius: 6, paddingVertical: 7, marginTop: 8, marginLeft: 22},
  cabTxt: {color: C.dim, fontSize: 12, fontWeight: '700', letterSpacing: 0.5},
  grid: {gap: 6},
  gridRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  rowNo: {width: 16, color: C.faint, fontSize: 11, fontWeight: '700', textAlign: 'center'},
  cell: {flex: 1, height: 46, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4},
  cellEmpty: {backgroundColor: C.panel2, opacity: 0.6},
  cellNo: {fontSize: 13.5, fontWeight: '900', paddingHorizontal: 4, flexShrink: 1},
  head: {color: C.ink, fontSize: 15, fontWeight: '800', marginTop: 18, marginBottom: 4, paddingHorizontal: 2},
  item: {flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 12, marginTop: 6},
  badge: {width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center'},
  badgeTxt: {fontSize: 15, fontWeight: '900'},
  who: {color: C.ink, fontSize: 15, fontWeight: '700'},
  meta: {color: C.faint, fontSize: 12, marginTop: 1},
  stRow: {flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4},
  st: {color: C.faint, fontSize: 12, fontWeight: '600', flexShrink: 1},
  pal: {color: C.ink, fontSize: 14, fontWeight: '800'},
  rows: {color: C.faint, fontSize: 11, marginTop: 2},
  steps: {gap: 6, paddingBottom: 10, paddingRight: 8},
  stepChip: {backgroundColor: C.panel, borderColor: C.edge, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center', minWidth: 64},
  stepOn: {backgroundColor: C.accent, borderColor: C.accent},
  stepTxt: {color: C.ink, fontSize: 13, fontWeight: '800'},
  stepN: {color: C.faint, fontSize: 10.5, fontWeight: '700'},
  stepTxtOn: {color: C.onAccent},
  stepInfo: {color: C.ink, fontSize: 13.5, fontWeight: '700', marginBottom: 8, paddingHorizontal: 2},
}));

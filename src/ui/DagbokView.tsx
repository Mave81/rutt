/**
 * Klart · Dagbok – dagen i den ordning det hände (förslag A) + Dagrapport (från C).
 * Överst: dagarna (svep). Sen: order, pall, arbetad tid, rast. Sen: tidslinjen. Tryck på en order → allt om den.
 * Allt läses ur telefonen (dagboken + det RUTT sparade för dagen: kvittens, signatur, om det kom fram till Opter).
 */
import React, {useEffect, useMemo, useState} from 'react';
import {Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, themed, hhmm} from './theme';
import {Bi, BiName} from './Bi';
import {Sheet, SigPreview} from './parts';
import {loadJSON} from '../store';
import * as DB from '../dagbok';

const two = (n: number) => String(n).padStart(2, '0');
// Det RUTT sparade per dag (kvittens, signatur, sändstatus) ligger under en nyckel utan nollor i datumet.
const ostKey = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return `rutt.orders.live.${y}-${m}-${d}`; };
const dur = (m: number) => `${Math.floor(m / 60)}:${two(m % 60)}`;
const SENT_OK = new Set(['ok', 'ok-noimg']);

type Ev = DB.DayEvent;
const EV: Record<string, {i: BiName; t: string; c: 'up' | 'dn' | 'br' | 'wk'}> = {
  start: {i: 'play-circle', t: 'Start', c: 'wk'}, load: {i: 'box-arrow-up-right', t: 'Lastad', c: 'up'}, unload: {i: 'check2-all', t: 'Lossad', c: 'dn'},
  rast: {i: 'cup-hot-fill', t: 'Rast', c: 'br'}, lunch: {i: 'cup-hot-fill', t: 'Lunch', c: 'br'}, 'igång': {i: 'play-circle', t: 'Igång igen', c: 'wk'}, slut: {i: 'power', t: 'Slut för dagen', c: 'wk'},
};

export default function DagbokView({me, onSms}: {me: string; onSms?: (text: string) => void}) {
  const bottom = useSafeAreaInsets().bottom + 30;
  const today = DB.ymdOf();
  const [days, setDays] = useState<string[]>([]);
  const [sel, setSel] = useState(today);
  const [day, setDay] = useState<DB.Day | null>(null);
  const [ost, setOst] = useState<Record<string, any>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [ver, setVer] = useState(0);
  useEffect(() => DB.onChange(() => setVer(v => v + 1)), []);
  useEffect(() => { DB.listDays().then(d => setDays(d.includes(today) ? d : [...d, today])); }, [ver]);
  useEffect(() => {
    let alive = true;
    Promise.all([DB.loadDay(sel), loadJSON(ostKey(sel), {})]).then(([d, o]: any) => { if (!alive) return; setDay(d); setOst(o || {}); setNote(d.note || ''); });
    return () => { alive = false; };
  }, [sel, ver]);
  const sum = useMemo(() => (day ? DB.summary(day) : null), [day]);
  const strip = days.slice(-14).reverse();

  const evRow = (x: Ev, i: number) => {
    const m = EV[x.kind] || EV.start;
    const o = x.cid && day ? day.orders[x.cid] : null;
    const so = x.cid ? ost[x.cid] || {} : {};
    let title = m.t, subLine = '';
    if (x.kind === 'load') { title = `Lastad · ${x.who || (o && o.pickWho) || '—'}`; subLine = [o && o.pickAdr, o && o.pal ? `${o.pal} pall` : '', o && o.orderNo ? `#${o.orderNo}` : ''].filter(Boolean).join(' · '); }
    if (x.kind === 'unload') {
      title = `Lossad · ${x.who || (o && o.dropWho) || '—'}`;
      const sync = so.sync && so.sync.unload;
      subLine = [o && o.dropAdr, o && o.podName ? `kvittens ${o.podName}` : '', sync ? (SENT_OK.has(sync) ? '✓ i Opter' : sync === 'nopod' ? 'kvittensen kom inte med' : 'inte bekräftad') : ''].filter(Boolean).join(' · ');
    }
    if (x.kind === 'rast' || x.kind === 'lunch') {
      const end = day ? day.events.find(e => e.t > x.t && (e.kind === 'igång' || e.kind === 'slut')) : null;
      subLine = end ? `${hhmm(new Date(x.t))}–${hhmm(new Date(end.t))} · ${Math.round((end.t - x.t) / 60000)} min` : 'pågår';
    }
    if (x.kind === 'start') subLine = 'Inloggad i RUTT';
    return (
      <Pressable key={i} style={d.ev} disabled={!x.cid} onPress={() => x.cid && setOpen(x.cid)}>
        <Text style={d.tm}>{hhmm(new Date(x.t))}</Text>
        <View style={d.card}>
          <View style={[d.ic, d[('ic_' + m.c) as 'ic_up']]}><Bi n={m.i} size={14} color={m.c === 'up' ? C.accentInk : m.c === 'dn' ? C.accent2 : m.c === 'br' ? C.bad : C.dim} /></View>
          <View style={{flex: 1, minWidth: 0}}>
            <Text style={d.t1} numberOfLines={1}>{title}</Text>
            {subLine ? <Text style={[d.t2, subLine.includes('✓') && null]} numberOfLines={2}>{subLine}</Text> : null}
          </View>
          {x.cid ? <Bi n="chevron-right" size={13} color={C.faint} /> : null}
        </View>
      </Pressable>
    );
  };

  const o = open && day ? day.orders[open] : null;
  const so = open ? ost[open] || {} : {};
  const report = day ? DB.dayReport(day, me) : '';
  const dateTxt = (ymd: string) => new Date(ymd + 'T12:00').toLocaleDateString('sv-SE', {weekday: 'long', day: 'numeric', month: 'long'});

  return (
    <View style={{flex: 1}}>
      <ScrollView contentContainerStyle={{paddingHorizontal: 14, paddingBottom: bottom}}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 6, paddingBottom: 4}}>
          {strip.map(y => {
            const dt = new Date(y + 'T12:00');
            return (
              <Pressable key={y} style={[d.day, sel === y && d.dayOn]} onPress={() => setSel(y)}>
                <Text style={[d.dayW, sel === y && d.dayOnT]}>{y === today ? 'Idag' : dt.toLocaleDateString('sv-SE', {weekday: 'short'})}</Text>
                <Text style={[d.dayN, sel === y && d.dayOnT]}>{dt.getDate()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={d.date}>{dateTxt(sel).charAt(0).toUpperCase() + dateTxt(sel).slice(1)}</Text>
        {sum ? (
          <View style={d.stats}>
            {[[String(sum.orders), 'order'], [String(sum.pal), 'pall'], [dur(sum.workedMin), 'arbetat'], [`${sum.restMin} min`, 'rast']].map(([v, k]) => (
              <View key={k} style={d.st}><Text style={d.stV}>{v}</Text><Text style={d.stK}>{k.toUpperCase()}</Text></View>
            ))}
          </View>
        ) : null}
        {day && day.events.length ? day.events.map(evRow) : <Text style={d.empty}>Inget sparat den här dagen. Dagboken fylls i när du lastar, lossar och tar rast i RUTT.</Text>}
        <Text style={d.lbl}>Anteckning</Text>
        <TextInput style={d.note} value={note} onChangeText={setNote} onEndEditing={() => DB.saveNote(sel, note)} placeholder="T.ex. tankade, väntade 20 min hos …" placeholderTextColor={C.faint} multiline />
        {day && day.events.length ? (
          <View style={d.btns}>
            {onSms ? <Pressable style={[d.btn, {backgroundColor: C.accent}]} onPress={() => { DB.saveNote(sel, note); onSms(report); }}><Bi n="send-fill" size={15} color={C.onAccent} /><Text style={[d.btnT, {color: C.onAccent}]}>Dagrapport till chefen</Text></Pressable> : null}
            <Pressable style={d.btn} onPress={() => { DB.saveNote(sel, note); Share.share({message: report}).catch(() => {}); }}><Bi n="share-fill" size={15} color={C.ink} /><Text style={d.btnT}>Dela</Text></Pressable>
          </View>
        ) : null}
        <Text style={d.foot}>Sparas bara i din telefon i 90 dagar.</Text>
      </ScrollView>
      <Sheet open={!!o} onClose={() => setOpen(null)} title={o ? (o.orderNo ? `Order ${o.orderNo}` : o.dropWho || 'Order') : ''} sub={o && o.freightBill ? `Fraktsedel ${o.freightBill}` : ''} scroll>
        {o ? (
          <View>
            {[['Hämtad', [o.pickWho, o.pickAdr].filter(Boolean).join(', ')], ['Lämnad', [o.dropWho, o.dropAdr].filter(Boolean).join(', ')], ['Gods', [o.pal ? `${o.pal} pall` : '', o.kg ? `${o.kg} kg` : ''].filter(Boolean).join(' · ')],
              ['Lastad', o.loadedAt ? hhmm(new Date(o.loadedAt)) : ''], ['Lossad', o.doneAt ? hhmm(new Date(o.doneAt)) : ''], ['Kvittens', [o.podName, o.kolli != null ? `${o.kolli} kolli` : ''].filter(Boolean).join(' · ')],
              ['Opter', so.sync && so.sync.unload ? (SENT_OK.has(so.sync.unload) ? '✓ Kom fram' : so.sync.unload === 'nopod' ? 'Lossad, kvittensen kom inte med' : 'Inte bekräftad') : '']]
              .filter(([, v]) => v).map(([k, v]) => (
                <View key={k} style={d.kv}><Text style={d.k}>{k}</Text><Text style={d.v}>{v}</Text></View>
              ))}
            {so.pod && so.pod.sig && so.pod.sig.strokes && so.pod.sig.strokes.length ? (<><Text style={d.lbl}>Signatur</Text><SigPreview data={so.pod.sig} height={110} /></>) : null}
            {(so.edits || []).length ? (<><Text style={d.lbl}>Skickat i efterhand</Text>{so.edits.map((h: any) => <Text key={h.id} style={d.t2}>{hhmm(new Date(h.at))} · {h.label}{h.state === 'ok' ? ' · ✓' : ''}</Text>)}</>) : null}
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

const d = themed(() => StyleSheet.create({
  day: {width: 52, height: 56, borderRadius: 12, backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center'},
  dayOn: {backgroundColor: C.accent},
  dayW: {color: C.dim, fontSize: 11, fontWeight: '700'},
  dayN: {color: C.ink, fontSize: 17, fontWeight: '900'},
  dayOnT: {color: C.onAccent},
  date: {color: C.faint, fontSize: 11, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', marginTop: 12, marginBottom: 6, paddingHorizontal: 2},
  stats: {flexDirection: 'row', gap: 6, marginBottom: 6},
  st: {flex: 1, backgroundColor: C.panel, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 9},
  stV: {color: C.ink, fontSize: 17, fontWeight: '900'},
  stK: {color: C.faint, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6, marginTop: 1},
  ev: {flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 6},
  tm: {width: 42, color: C.ink, fontSize: 13, fontWeight: '900', paddingTop: 12, fontVariant: ['tabular-nums']},
  card: {flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.panel, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 11},
  ic: {width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center'},
  ic_up: {backgroundColor: C.accentSoft}, ic_dn: {backgroundColor: C.okSoft}, ic_br: {backgroundColor: C.badSoft}, ic_wk: {backgroundColor: C.panel2},
  t1: {color: C.ink, fontSize: 14, fontWeight: '800'},
  t2: {color: C.dim, fontSize: 12, marginTop: 1, lineHeight: 16},
  empty: {color: C.dim, fontSize: 14, marginTop: 14, lineHeight: 20},
  lbl: {color: C.faint, fontSize: 11, fontWeight: '900', letterSpacing: 1, marginTop: 16, marginBottom: 6, textTransform: 'uppercase'},
  note: {backgroundColor: C.panel, color: C.ink, borderRadius: 12, padding: 12, fontSize: 14.5, minHeight: 60, textAlignVertical: 'top'},
  btns: {flexDirection: 'row', gap: 8, marginTop: 12},
  btn: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: C.panel2, borderRadius: 12, paddingVertical: 13},
  btnT: {color: C.ink, fontSize: 14, fontWeight: '900'},
  foot: {color: C.faint, fontSize: 11.5, marginTop: 12, textAlign: 'center'},
  kv: {flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.edge},
  k: {color: C.dim, fontSize: 14},
  v: {color: C.ink, fontSize: 14, fontWeight: '800', flex: 1, textAlign: 'right'},
}));

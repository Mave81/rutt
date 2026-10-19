/**
 * Sedel → jobb (förslag A + signering ur C, valt 19 okt).
 *  - Ny: RUTT läser sedeln (bild eller PDF-sida) i telefonen och fyller i Hämta / Lämna / gods / referens.
 *    Osäkert är markerat KOLLA. Du rättar och trycker "Lägg i planen".
 *  - Befintligt eget jobb: ändra, kvittera på sedeln, skicka status till Joel, ta bort.
 */
import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Image, Modal, NativeModules, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, themed} from './theme';
import {Bi} from './Bi';
import {useKeyboardLift} from './parts';
import MediaViewer, {Media} from './MediaViewer';
import {Egen, Place, fromParsed, statusSms} from '../egna';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {parseSedel} = require('../sedel');

const SMS = NativeModules.RuttSms;
const two = (n: number) => String(n).padStart(2, '0');
const ymdOf = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
const dayChoices = () => {
  const out: {d: string; l: string}[] = [];
  for (let i = 0; i < 6; i++) { const d = new Date(); d.setDate(d.getDate() + i); out.push({d: ymdOf(d), l: i === 0 ? 'Idag' : i === 1 ? 'Imorgon' : d.toLocaleDateString('sv-SE', {weekday: 'short', day: 'numeric'})}); }
  return out;
};

function PlaceEdit({label, icon, tint, p, onChange, cands}: {label: string; icon: any; tint: string; p: Place; onChange: (p: Place) => void; cands: Place[]}) {
  const set = (k: keyof Place) => (v: string) => onChange({...p, [k]: v, sure: k === 'adr' || k === 'zip' || k === 'area' ? true : p.sure});
  const other = cands.filter(c => c.adr && c.adr !== p.adr).slice(0, 3);
  return (
    <View style={[f.card, p.sure === false && f.warn]}>
      <View style={f.kh}>
        <View style={[f.ki, {backgroundColor: tint + '22'}]}><Bi n={icon} size={13} color={tint} /></View>
        <Text style={f.k}>{label}</Text>
        {p.sure === false ? <View style={f.wtag}><Text style={f.wtagT}>KOLLA</Text></View> : null}
      </View>
      <TextInput style={f.inBig} value={p.name} onChangeText={set('name')} placeholder="Företag / plats" placeholderTextColor={C.faint} />
      <TextInput style={f.in} value={p.adr} onChangeText={set('adr')} placeholder="Gatuadress" placeholderTextColor={C.faint} />
      <View style={{flexDirection: 'row', gap: 8}}>
        <TextInput style={[f.in, {width: 92}]} value={p.zip} onChangeText={set('zip')} placeholder="Postnr" placeholderTextColor={C.faint} keyboardType="number-pad" />
        <TextInput style={[f.in, {flex: 1}]} value={p.area} onChangeText={set('area')} placeholder="Ort" placeholderTextColor={C.faint} />
      </View>
      <View style={{flexDirection: 'row', gap: 8}}>
        <TextInput style={[f.in, {flex: 1}]} value={p.contact} onChangeText={set('contact')} placeholder="Kontakt" placeholderTextColor={C.faint} />
        <TextInput style={[f.in, {flex: 1}]} value={p.tel} onChangeText={set('tel')} placeholder="Telefon" placeholderTextColor={C.faint} keyboardType="phone-pad" />
      </View>
      {p.code || p.note ? <TextInput style={f.in} value={[p.code ? `Portkod ${p.code}` : '', p.note].filter(Boolean).join(' · ')} editable={false} /> : null}
      {p.sure === false ? <Text style={f.hint}>Sedeln har ingen tydlig gatuadress. Skriv in den, eller välj en nedan.</Text> : null}
      {other.length ? (
        <View style={f.chips}>
          {other.map(c => (
            <Pressable key={c.adr} style={f.chip} onPress={() => onChange({...p, adr: c.adr, zip: c.zip || p.zip, area: c.area || p.area, name: p.name || c.name, sure: true})}>
              <Text style={f.chipT} numberOfLines={1}>{[c.adr, c.area].filter(Boolean).join(', ')}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function SedelSheet({media, job, chefName, me, onSave, onRemove, onClose, onSign, onStatus, onShareSigned}: {
  media?: Media | null; job?: Egen | null; chefName?: string; me?: string;
  onSave: (e: Egen) => void; onRemove?: (id: string) => void; onClose: () => void;
  onSign?: (e: Egen) => void; onStatus?: (e: Egen, what: 'way' | 'here' | 'late') => void; onShareSigned?: (e: Egen) => void;
}) {
  const ins = useSafeAreaInsets();
  const {lift} = useKeyboardLift();
  const open = !!(media || job);
  const [e, setE] = useState<Egen | null>(null);
  const [cands, setCands] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [view, setView] = useState(false);
  const [notMine, setNotMine] = useState('');
  const days = useMemo(dayChoices, [open]);

  useEffect(() => {
    setErr(''); setView(false); setNotMine('');
    if (job) { setE(job); setCands([]); return; }
    if (!media) { setE(null); return; }
    let alive = true;
    setE(null); setBusy(true);
    (async () => {
      const page = media.kind === 'pdf' ? (media.pageUris || [])[0] : media.uri;
      let ocr: any = null;
      try { if (!page) throw new Error('ingen sida'); if (!SMS || !SMS.ocr) throw new Error('saknas i den här versionen'); ocr = await SMS.ocr(page); }
      catch (x: any) { if (alive) setErr('Kunde inte läsa sedeln (' + String((x && x.message) || x) + '). Fyll i själv.'); }
      if (!alive) return;
      const r = parseSedel(ocr || {lines: []}, media.name || '');
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      // Datumet på sedeln om det är idag eller senare, annars idag.
      const d0 = r.date && r.date >= ymdOf(new Date()) && r.kind !== 'inomec-hamt' ? r.date : ymdOf(new Date());
      setE(fromParsed(r, media, ocr, d0));
      setCands(r.candidates || []);
      setNotMine(r.notMine || '');
      setBusy(false);
    })();
    return () => { alive = false; };
  }, [media, job]);

  if (!open) return null;
  const isNew = !job;
  const up = (k: keyof Egen) => (v: any) => setE(x => (x ? {...x, [k]: v} : x));
  const ok = !!(e && (e.pick.adr || e.pick.name) && (e.drop.adr || e.drop.name));
  const smsPreview = e ? statusSms(e, 'load', {me, at: Date.now()}) : '';
  const firstChef = (chefName || '').split(' ')[0];

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[f.root, {paddingTop: ins.top + 4, paddingBottom: lift}]}>
        <View style={f.top}>
          <Pressable hitSlop={12} onPress={onClose}><Text style={f.cancel}>{isNew ? 'Avbryt' : 'Stäng'}</Text></Pressable>
          <Text style={f.topT} numberOfLines={1}>{isNew ? 'Gör till jobb' : 'Eget jobb'}</Text>
          <View style={{width: 60}} />
        </View>
        {busy || !e ? (
          <View style={f.wait}><ActivityIndicator color={C.accent} size="large" /><Text style={f.waitT}>Läser sedeln…</Text><Text style={f.hint}>Allt sker i telefonen, inget skickas iväg.</Text></View>
        ) : (
          <>
            <ScrollView style={{flex: 1}} contentContainerStyle={{padding: 14, paddingBottom: 120}} keyboardShouldPersistTaps="handled">
              <Pressable style={f.hdr} onPress={() => e.media && setView(true)}>
                {e.media ? <Image source={{uri: e.media.kind === 'pdf' ? (e.media.pageUris || [])[0] : e.media.uri}} style={f.thumb} resizeMode="cover" /> : <View style={f.thumb} />}
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={f.hT} numberOfLines={1}>{[e.title, e.ref].filter(Boolean).join(' · ')}</Text>
                  <Text style={f.hS} numberOfLines={2}>{[e.orderNo && (e.kind === 'inomec-hamt' ? `Kundens ordernr ${e.orderNo}` : `Märkt ${e.orderNo}`), e.media ? 'Tryck för att se sedeln' : ''].filter(Boolean).join(' · ')}</Text>
                </View>
                <Bi n="zoom-in" size={16} color={C.dim} />
              </Pressable>
              {err ? <View style={[f.banner, {backgroundColor: C.badSoft}]}><Bi n="exclamation-triangle-fill" size={14} color={C.bad} /><Text style={[f.bannerT, {color: C.bad}]}>{err}</Text></View> : null}
              {notMine ? <View style={[f.banner, {backgroundColor: C.badSoft}]}><Bi n="exclamation-triangle-fill" size={14} color={C.bad} /><Text style={[f.bannerT, {color: C.bad}]}>Leveranssätt: {notMine}. Den här sedeln är troligen inte din – kolla med Joel.</Text></View> : null}
              {e.tidspass ? <View style={[f.banner, {backgroundColor: C.accent}]}><Bi n="alarm-fill" size={14} color={C.onAccent} /><Text style={[f.bannerT, {color: C.onAccent}]}>Tidspassning{e.tidspass.time ? ` kl ${e.tidspass.time}` : ' – tiden står inte på sedeln'}</Text></View> : null}

              <PlaceEdit label="Hämta hos" icon="box-arrow-up-right" tint={C.accentInk} p={e.pick} onChange={up('pick')} cands={cands} />
              <PlaceEdit label="Lämna till" icon="check2" tint={C.accent2} p={e.drop} onChange={up('drop')} cands={cands} />

              <View style={f.card}>
                <View style={f.kh}><View style={[f.ki, {backgroundColor: C.panel2}]}><Bi n="box-seam" size={13} color={C.dim} /></View><Text style={f.k}>Gods</Text></View>
                <TextInput style={[f.in, {minHeight: 60, textAlignVertical: 'top'}]} multiline value={e.goods.join('\n')} onChangeText={t => up('goods')(t.split('\n').filter(x => x.trim()))} placeholder="Vad ska med" placeholderTextColor={C.faint} />
                <View style={f.palRow}>
                  <Text style={f.palL}>Platser i bilen</Text>
                  <Pressable style={f.step} onPress={() => up('pal')(Math.max(0, e.pal - 1))}><Bi n="dash-lg" size={16} color={C.ink} /></Pressable>
                  <Text style={f.palV}>{e.pal} pall</Text>
                  <Pressable style={f.step} onPress={() => up('pal')(Math.min(17, e.pal + 1))}><Bi n="plus-lg" size={16} color={C.ink} /></Pressable>
                </View>
                {e.note ? <TextInput style={[f.in, {minHeight: 80, textAlignVertical: 'top'}]} multiline value={e.note} onChangeText={up('note')} /> : null}
              </View>

              <View style={f.card}>
                <View style={f.kh}><View style={[f.ki, {backgroundColor: C.panel2}]}><Bi n="calendar-event" size={13} color={C.dim} /></View><Text style={f.k}>Dag</Text></View>
                <View style={f.chips}>
                  {days.map(d => (
                    <Pressable key={d.d} style={[f.chip, e.day === d.d && f.chipOn]} onPress={() => up('day')(d.d)}><Text style={[f.chipT, e.day === d.d && f.chipTOn]}>{d.l}</Text></Pressable>
                  ))}
                </View>
              </View>

              <View style={f.card}>
                <View style={[f.kh, {justifyContent: 'space-between'}]}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1}}><View style={[f.ki, {backgroundColor: C.peopleSoft}]}><Bi n="chat-text-fill" size={13} color={C.people} /></View>
                    <Text style={f.k}>{firstChef ? `SMS till ${firstChef}: Lastat ✅ Lossat ✅` : 'SMS till chefen: Lastat ✅ Lossat ✅'}</Text></View>
                  <Switch value={e.sms} onValueChange={up('sms')} trackColor={{true: C.accent2, false: C.edge}} thumbColor="#FFFFFF" />
                </View>
                {!firstChef ? <Text style={f.hint}>Välj chef under Jobbet → Folk så vet RUTT vart det ska.</Text> : null}
                {e.sms ? <View style={f.smsBox}><Text style={f.smsT}>{smsPreview}</Text></View> : null}
              </View>

              {!isNew ? (
                <View style={f.card}>
                  <View style={f.kh}><View style={[f.ki, {backgroundColor: C.peopleSoft}]}><Bi n="send-fill" size={13} color={C.people} /></View><Text style={f.k}>Skicka status nu</Text></View>
                  <View style={f.chips}>
                    {([['way', 'På väg'], ['here', 'Framme'], ['late', 'Försenad 15 min']] as const).map(([w, l]) => (
                      <Pressable key={w} style={f.chip} onPress={() => onStatus && onStatus(e, w)}><Text style={f.chipT}>{l}</Text></Pressable>
                    ))}
                  </View>
                  <View style={{height: 10}} />
                  <Pressable style={f.btnG} onPress={() => onSign && onSign(e)}>
                    <Bi n="pen-fill" size={15} color={C.ink} /><Text style={f.btnGT}>{e.signed ? `Kvitterad av ${e.signed.name || '—'} · gör om` : 'Kvittera på sedeln (kunden skriver på)'}</Text>
                  </Pressable>
                  {e.signed && e.signed.image ? (
                    <Pressable style={[f.btnG, {marginTop: 8}]} onPress={() => onShareSigned && onShareSigned(e)}>
                      <Bi n="image" size={15} color={C.ink} /><Text style={f.btnGT}>Skicka ifylld sedel till {firstChef || 'chefen'}</Text>
                    </Pressable>
                  ) : null}
                  {onRemove ? (
                    <Pressable style={[f.btnG, {marginTop: 8, backgroundColor: C.badSoft}]} onPress={() => onRemove(e.id)}>
                      <Bi n="trash" size={15} color={C.bad} /><Text style={[f.btnGT, {color: C.bad}]}>Ta bort jobbet</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>
            <View style={[f.dock, {paddingBottom: ins.bottom + 12}]}>
              <Pressable style={[f.btnA, !ok && {opacity: 0.45}]} disabled={!ok} onPress={() => e && onSave(e)}>
                <Bi n={isNew ? 'calendar-plus' : 'check2'} size={18} color={C.onAccent} />
                <Text style={f.btnAT}>{isNew ? `Lägg i planen · ${(days.find(d => d.d === e.day) || {l: e.day}).l.toLowerCase()}` : 'Spara'}</Text>
              </Pressable>
            </View>
          </>
        )}
        <MediaViewer media={view && e && e.media ? (e.media as Media) : null} title={e ? [e.title, e.ref].filter(Boolean).join(' · ') : ''} onClose={() => setView(false)} />
      </View>
    </Modal>
  );
}

const f = themed(() => StyleSheet.create({
  root: {flex: 1, backgroundColor: C.bg},
  top: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10},
  cancel: {color: C.accentInk, fontSize: 15, fontWeight: '700', width: 60},
  topT: {flex: 1, textAlign: 'center', color: C.ink, fontSize: 16, fontWeight: '900'},
  wait: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30},
  waitT: {color: C.ink, fontSize: 16, fontWeight: '800'},
  hdr: {flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderRadius: 12, padding: 10},
  thumb: {width: 46, height: 62, borderRadius: 6, backgroundColor: '#FFFFFF'},
  hT: {color: C.ink, fontSize: 15, fontWeight: '900'},
  hS: {color: C.dim, fontSize: 12.5, marginTop: 2},
  banner: {flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, marginTop: 8},
  bannerT: {flex: 1, fontSize: 13, fontWeight: '800'},
  card: {backgroundColor: C.panel, borderRadius: 12, padding: 12, marginTop: 8, gap: 6},
  warn: {borderWidth: 2, borderColor: C.accent},
  kh: {flexDirection: 'row', alignItems: 'center', gap: 8},
  ki: {width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center'},
  k: {color: C.dim, fontSize: 11, fontWeight: '900', letterSpacing: 0.9, textTransform: 'uppercase', flexShrink: 1},
  wtag: {backgroundColor: C.accent, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1},
  wtagT: {color: C.onAccent, fontSize: 10, fontWeight: '900', letterSpacing: 0.6},
  inBig: {backgroundColor: C.panel2, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8, color: C.ink, fontSize: 16, fontWeight: '800'},
  in: {backgroundColor: C.panel2, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8, color: C.ink, fontSize: 14.5, minWidth: 0},
  hint: {color: C.dim, fontSize: 12.5, lineHeight: 17},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  chip: {backgroundColor: C.panel2, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12, maxWidth: '100%'},
  chipOn: {backgroundColor: C.accent},
  chipT: {color: C.ink, fontSize: 13, fontWeight: '700'},
  chipTOn: {color: C.onAccent},
  palRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  palL: {flex: 1, color: C.dim, fontSize: 13, fontWeight: '700'},
  palV: {color: C.ink, fontSize: 15, fontWeight: '900', minWidth: 54, textAlign: 'center'},
  step: {width: 36, height: 36, borderRadius: 18, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center'},
  smsBox: {backgroundColor: C.peopleSoft, borderRadius: 12, padding: 10},
  smsT: {color: C.ink, fontSize: 13, lineHeight: 18},
  btnG: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.panel2, borderRadius: 12, paddingVertical: 12},
  btnGT: {color: C.ink, fontSize: 14, fontWeight: '800'},
  dock: {position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14, paddingTop: 10, backgroundColor: C.bg},
  btnA: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.accent, borderRadius: 12, paddingVertical: 15},
  btnAT: {color: C.onAccent, fontSize: 16, fontWeight: '900'},
}));

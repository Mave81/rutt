/**
 * Kvittens vid lossning – helskärm.
 * Ordning efter hur det går till på plats: mottagaren signerar (stor ruta), skriver
 * eller väljer sitt namn, sen föraren: foto, avvikelse/extra tid, kommentar.
 * Kraven från ordern (signatur/namn/foto/kommentar obligatoriskt) styr "Klar".
 */
import React, {useEffect, useMemo, useState} from 'react';
import {Dimensions, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C} from './theme';
import {MAX_PHOTOS, SigData, SignaturePad, pickPhoto, useKeyboardLift} from './parts';
import {ExtrasEditor} from './OrderExtras';


export default function SignScreen({stop, savedNames, saved, onCancel, onDone}: {stop: any; savedNames: string[]; saved?: any; onCancel: () => void; onDone: (pod: any) => void}) {
  const insets = useSafeAreaInsets();
  const {kb, lift} = useKeyboardLift();
  const [sig, setSig] = useState<SigData | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [name, setName] = useState('');
  const [photos, setPhotos] = useState<any[]>([]);
  const [extOpen, setExtOpen] = useState(false);
  const [extras, setExtras] = useState<Record<string, number>>({});
  const [kolli, setKolli] = useState(0);
  const [comment, setComment] = useState('');
  const [comment2, setComment2] = useState('');
  const [typeId, setTypeId] = useState(0);
  const [subId, setSubId] = useState(0);

  useEffect(() => {
    setSig(null); setName(''); setPhotos([]); setComment(''); setComment2('');
    setTypeId((stop && stop.pod && stop.pod.defaultId) || 0); setSubId(0);
    setExtras((saved && saved.extras) || {}); setExtOpen(!!(saved && saved.extras && Object.keys(saved.extras).length));
    setKolli((saved && saved.kolli) || (stop && stop.kolli) || 0);
  }, [stop, saved]);

  const padH = Math.max(230, Math.min(400, Math.round(Dimensions.get('window').height * 0.36)));
  // Kvittenstyp väljer du själv (som i Opter). Krav = orderns krav OCH typens krav.
  const P = (stop && stop.pod) || null;
  const types: any[] = (P && P.types) || [];
  const type = types.find(t => t.id === typeId) || null;
  const subs: any[] = type && P ? P.subTypes.filter((x: any) => x.mainId === type.id) : [];
  const sub = subs.find(x => x.id === subId) || null;
  const eff = sub || type;
  const sr = (P && P.shipReq) || {};
  const req: any = P ? (eff ? {sig: sr.sig && eff.req.sig, name: sr.name && eff.req.name, pic: sr.pic && eff.req.pic, remark: sr.remark && eff.req.remark, comment: sr.comment && eff.req.comment, sub: !!(type && type.showSub && type.requireSub && subs.length)} : {}) : ((stop && stop.req) || {});
  const fields = (P && P.fields) || {remark: true, comment: false, count: true, pic: true};
  const showComment2 = !!(fields.comment || req.comment);
  // Förslag: Opters egna för ordern först, sen tidigare mottagare hos samma företag.
  const suggestions = useMemo(() => {
    const out: string[] = [];
    for (const n of [...((stop && stop.suggest) || []), ...(savedNames || [])]) {
      const t = String(n || '').trim();
      if (t && !out.some(x => x.toLowerCase() === t.toLowerCase())) out.push(t);
    }
    return out.slice(0, 8);
  }, [stop, savedNames]);

  if (!stop) return null;

  const missing: string[] = [];
  if (req.sig && !sig) missing.push('signatur');
  if (req.name && name.trim().length < 2) missing.push('namnförtydligande');
  if (req.pic && photos.length === 0) missing.push('foto');
  if (req.remark && comment.trim().length === 0) missing.push('anmärkning');
  if (req.comment && comment2.trim().length === 0) missing.push((fields.commentName || 'kommentar').toLowerCase());
  if (req.sub && !sub) missing.push('undertyp');
  const ok = missing.length === 0;

  async function addPhoto(cam: boolean) {
    try { const got = await pickPhoto(cam); if (got.length) setPhotos(p => [...p, ...got].slice(0, MAX_PHOTOS)); } catch (e) {}
  }
  function done() {
    if (!ok) return;
    onDone({name: name.trim(), sig, photos, extras, kolli, comment: comment.trim(), comment2: comment2.trim(), typeId: type ? type.id : 0, subId: sub ? sub.id : 0, typeName: eff ? eff.name : '', at: Date.now()});
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={[st.root, {paddingTop: insets.top + 6, paddingBottom: lift}]}>
        <View style={st.top}>
          <Pressable onPress={onCancel} hitSlop={12}><Text style={st.cancel}>Avbryt</Text></Pressable>
          <Text style={st.topTitle}>Kvittens</Text>
          <View style={{width: 60}} />
        </View>

        <ScrollView style={{flex: 1}} contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 20}} scrollEnabled={!drawing} keyboardShouldPersistTaps="handled">
          <Text style={st.who} numberOfLines={2}>{stop.who || 'Mottagare'}</Text>
          <Text style={st.adr} numberOfLines={2}>{[stop.adr, stop.area].filter(Boolean).join(', ')}{stop.orderNo ? `  ·  Order ${stop.orderNo}` : ''}</Text>

          {types.length > 0 && (
            <>
              <View style={st.secHead}><Text style={st.sec}>Typ av kvittens</Text></View>
              <View style={st.chips}>
                {types.map(t => (
                  <Pressable key={t.id} disabled={P && P.lockMain && t.id !== P.defaultId} style={[st.chip, t.id === typeId && st.chipOn, P && P.lockMain && t.id !== P.defaultId && {opacity: 0.35}]} onPress={() => { setTypeId(t.id); setSubId(0); }}>
                    <Text style={[st.chipTxt, t.id === typeId && st.chipTxtOn]}>{t.name}</Text>
                  </Pressable>
                ))}
              </View>
              {type && type.showSub && subs.length > 0 && (
                <View style={[st.chips, {marginTop: 8}]}>
                  {subs.map(x => (
                    <Pressable key={x.id} style={[st.chip, x.id === subId && st.chipOn]} onPress={() => setSubId(x.id === subId ? 0 : x.id)}>
                      <Text style={[st.chipTxt, x.id === subId && st.chipTxtOn]}>{x.name}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}

          <View style={st.secHead}>
            <Text style={st.sec}>Mottagarens underskrift</Text>
            {req.sig ? <View style={st.reqBox}><Text style={st.reqTag}>KRÄVS</Text></View> : null}
          </View>
          <SignaturePad height={padH} onChange={setSig} onDrawing={setDrawing} hint="Signera på linjen" />

          <View style={st.secHead}>
            <Text style={st.sec}>Namnförtydligande</Text>
            {req.name ? <View style={st.reqBox}><Text style={st.reqTag}>KRÄVS</Text></View> : null}
          </View>
          <TextInput
            style={st.nameInput}
            value={name}
            onChangeText={setName}
            placeholder="Mottagarens namn"
            placeholderTextColor={C.faint}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
          />
          {suggestions.length > 0 && (
            <>
              <Text style={st.sugLabel}>Tidigare mottagare här – tryck för att välja</Text>
              <View style={st.chips}>
                {suggestions.map(n => (
                  <Pressable key={n} style={[st.chip, name.trim().toLowerCase() === n.toLowerCase() && st.chipOn]} onPress={() => setName(n)}>
                    <Text style={[st.chipTxt, name.trim().toLowerCase() === n.toLowerCase() && st.chipTxtOn]}>{n}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <View style={st.secHead}>
            <Text style={st.sec}>Foto{photos.length ? `  ${photos.length}/${MAX_PHOTOS}` : ''}</Text>
            {req.pic ? <View style={st.reqBox}><Text style={st.reqTag}>KRÄVS</Text></View> : null}
          </View>
          <View style={st.photoRow}>
            {photos.map((ph, i) => (
              <View key={i} style={st.photoBox}>
                <Image source={{uri: ph.uri}} style={st.photoImg} />
                <Pressable style={st.photoX} hitSlop={8} onPress={() => setPhotos(x => x.filter((_, j) => j !== i))}><Text style={st.photoXTxt}>×</Text></Pressable>
              </View>
            ))}
            {photos.length < MAX_PHOTOS && (
              <>
                <Pressable style={st.photoAdd} onPress={() => addPhoto(true)}><Text style={st.photoAddIco}>＋</Text><Text style={st.photoAddTxt}>Kamera</Text></Pressable>
                <Pressable style={st.photoAdd} onPress={() => addPhoto(false)}><Text style={st.photoAddIco}>▦</Text><Text style={st.photoAddTxt}>Galleri</Text></Pressable>
              </>
            )}
          </View>

          {fields.count !== false && <><View style={st.secHead}><Text style={st.sec}>Antal kollin</Text>{stop.kolli ? <Text style={st.hint}>Ordern: {stop.kolli}</Text> : null}</View>
          <View style={st.kolliRow}>
            <Pressable style={st.kBtn} onPress={() => setKolli(k => Math.max(0, k - 1))}><Text style={st.kBtnTxt}>−</Text></Pressable>
            <Text style={[st.kVal, stop.kolli && kolli !== stop.kolli ? {color: C.accent} : null]}>{kolli}</Text>
            <Pressable style={st.kBtn} onPress={() => setKolli(k => k + 1)}><Text style={st.kBtnTxt}>+</Text></Pressable>
          </View></>}

          {!extOpen ? (
            <Pressable style={st.devToggle} onPress={() => setExtOpen(true)}>
              <Text style={st.devToggleTxt}>Drog något ut? Lägg till lossningstid, inbärning…</Text>
              <Text style={st.devPlus}>＋</Text>
            </Pressable>
          ) : (
            <>
              <View style={st.secHead}><Text style={st.sec}>Tillägg</Text></View>
              <ExtrasEditor value={extras} onChange={setExtras} only={['Lossningstid', 'Inbärning', 'Bomkörning', 'Lastningstid']} />
            </>
          )}

          <View style={st.secHead}>
            <Text style={st.sec}>Anmärkning</Text>
            {req.remark ? <View style={st.reqBox}><Text style={st.reqTag}>KRÄVS</Text></View> : null}
          </View>
          <TextInput style={st.comment} value={comment} onChangeText={setComment} placeholder="T.ex. ställt vid porten, skadad kartong…" placeholderTextColor={C.faint} multiline />
          {showComment2 && (
            <>
              <View style={st.secHead}>
                <Text style={st.sec}>{fields.commentName || 'Kommentar'}</Text>
                {req.comment ? <View style={st.reqBox}><Text style={st.reqTag}>KRÄVS</Text></View> : null}
              </View>
              <TextInput style={st.comment} value={comment2} onChangeText={setComment2} placeholderTextColor={C.faint} multiline />
            </>
          )}
        </ScrollView>

        <View style={[st.bottom, {paddingBottom: kb > 0 ? 10 : 12 + insets.bottom}]}>
          {!ok && <Text style={st.missing}>Saknas: {missing.join(', ')}</Text>}
          <Pressable style={[st.doneBtn, !ok && {opacity: 0.4}]} disabled={!ok} onPress={done}>
            <Text style={st.doneTxt}>Klar – Lossad ✓</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: {flex: 1, backgroundColor: C.bg},
  top: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8},
  cancel: {color: C.accent, fontSize: 16, fontWeight: '700', width: 60},
  topTitle: {color: C.dim, fontSize: 15, fontWeight: '700', letterSpacing: 1},
  who: {color: C.ink, fontSize: 24, fontWeight: '800', marginTop: 4},
  adr: {color: C.dim, fontSize: 14, marginTop: 3},
  secHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 8},
  sec: {color: C.dim, fontSize: 13, fontWeight: '700', letterSpacing: 0.5},
  reqBox: {backgroundColor: C.accent, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2},
  reqTag: {color: C.onAccent, fontSize: 10, fontWeight: '800', letterSpacing: 1},
  nameInput: {backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 12, color: C.ink, paddingHorizontal: 14, paddingVertical: 13, fontSize: 18, fontWeight: '600'},
  sugLabel: {color: C.faint, fontSize: 12, marginTop: 10, marginBottom: 7},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 18, paddingVertical: 9, paddingHorizontal: 14},
  chipOn: {backgroundColor: C.accent, borderColor: C.accent},
  chipTxt: {color: C.ink, fontSize: 14, fontWeight: '600'},
  chipTxtOn: {color: C.onAccent},
  photoRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  photoBox: {width: 84, height: 84, borderRadius: 12, overflow: 'hidden', backgroundColor: C.panel2},
  photoImg: {width: '100%', height: '100%'},
  photoX: {position: 'absolute', top: 4, right: 4, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(20,18,16,0.85)', alignItems: 'center', justifyContent: 'center'},
  photoXTxt: {color: C.ink, fontSize: 17, lineHeight: 19, fontWeight: '700'},
  photoAdd: {width: 84, height: 84, borderRadius: 12, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  photoAddIco: {color: C.accent, fontSize: 22, fontWeight: '700'},
  photoAddTxt: {color: C.dim, fontSize: 12, marginTop: 2, fontWeight: '600'},
  devToggle: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, backgroundColor: C.panel, borderColor: C.edge, borderWidth: 1, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14},
  devToggleTxt: {color: C.ink, fontSize: 14, fontWeight: '600', flex: 1},
  devPlus: {color: C.accent, fontSize: 18, fontWeight: '800', marginLeft: 8},
  hint: {color: C.faint, fontSize: 12},
  kolliRow: {flexDirection: 'row', alignItems: 'center', gap: 18},
  kBtn: {width: 52, height: 52, borderRadius: 14, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  kBtnTxt: {color: C.accent, fontSize: 26, fontWeight: '800', lineHeight: 28},
  kVal: {color: C.ink, fontSize: 30, fontWeight: '900', minWidth: 54, textAlign: 'center'},
  comment: {backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 12, color: C.ink, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, minHeight: 70, textAlignVertical: 'top'},
  bottom: {paddingHorizontal: 16, paddingTop: 10, backgroundColor: C.bg, borderTopColor: C.edge, borderTopWidth: StyleSheet.hairlineWidth},
  missing: {color: C.bad, fontSize: 13, fontWeight: '600', marginBottom: 8, textAlign: 'center'},
  doneBtn: {backgroundColor: C.accent2, borderRadius: 14, paddingVertical: 17, alignItems: 'center'},
  doneTxt: {color: '#14231a', fontSize: 18, fontWeight: '800'},
});

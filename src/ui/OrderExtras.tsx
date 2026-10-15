/**
 * Det sällsynta för en order, samlat bakom "Mer":
 *  - Tillägg (Opters artiklar): Lastningstid, Lossningstid, Inbärning, Bomkörning …
 *  - Avvikelse: Godsskada, Emballageskada, Felaktigt kolliantal, Bristfälligt emballage (+ bild, kommentar)
 *  - Ändra kollin / vikt
 * Snabbval i stället för formulär: ett tryck väljer, +/- justerar.
 */
import React, {useEffect, useState} from 'react';
import {Image, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {C, themed} from './theme';
import {MAX_PHOTOS, Sheet, pickPhoto} from './parts';

// Artiklar som de heter i Opter hos er (från orderns artikellista). Tid räknas i minuter.
export const ARTICLES: {name: string; unit: 'min' | 'st'; step: number}[] = [
  {name: 'Lastningstid', unit: 'min', step: 15},
  {name: 'Lossningstid', unit: 'min', step: 15},
  {name: 'Inbärning', unit: 'st', step: 1},
  {name: 'Bomkörning', unit: 'st', step: 1},
  {name: 'Express', unit: 'st', step: 1},
  {name: 'OB1', unit: 'st', step: 1},
  {name: 'Budtransport TIM', unit: 'st', step: 1},
];
export const DAMAGE_TYPES = ['Godsskada', 'Emballageskada', 'Felaktigt kolliantal', 'Bristfälligt emballage'];

export const fmtQty = (a: {unit: string}, q: number) => (a.unit === 'min' ? (q >= 60 ? `${Math.floor(q / 60)} h ${q % 60 ? (q % 60) + ' min' : ''}`.trim() : `${q} min`) : `${q} st`);

// Tillägg: lista med +/- per artikel. value = {Artikelnamn: antal}
export function ExtrasEditor({value, onChange, only}: {value: Record<string, number>; onChange: (v: Record<string, number>) => void; only?: string[]}) {
  const list = only ? ARTICLES.filter(a => only.includes(a.name)) : ARTICLES;
  const set = (n: string, q: number) => { const v = {...value}; if (q > 0) v[n] = q; else delete v[n]; onChange(v); };
  return (
    <View style={{gap: 8}}>
      {list.map(a => {
        const q = value[a.name] || 0;
        return (
          <View key={a.name} style={[x.artRow, q > 0 && x.artRowOn]}>
            <Pressable style={{flex: 1}} onPress={() => set(a.name, q > 0 ? 0 : a.step)}>
              <Text style={x.artName}>{a.name}</Text>
              <Text style={x.artQty}>{q > 0 ? fmtQty(a, q) : a.unit === 'min' ? 'Tryck för att lägga till' : 'Tryck för att lägga till'}</Text>
            </Pressable>
            {q > 0 && (
              <View style={x.stepper}>
                <Pressable hitSlop={8} style={x.stepBtn} onPress={() => set(a.name, Math.max(0, q - a.step))}><Text style={x.stepTxt}>−</Text></Pressable>
                <Pressable hitSlop={8} style={x.stepBtn} onPress={() => set(a.name, q + a.step)}><Text style={x.stepTxt}>+</Text></Pressable>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

type Mode = 'menu' | 'extras' | 'damage' | 'kolli';
export function MoreSheet({stop, cargo, saved, onClose, onSave}: {
  stop: any; cargo: any; saved: any; onClose: () => void;
  onSave: (kind: 'extras' | 'damage' | 'kolli', data: any) => void;
}) {
  const [mode, setMode] = useState<Mode>('menu');
  const [extras, setExtras] = useState<Record<string, number>>({});
  const [dType, setDType] = useState<string | null>(null);
  const [dText, setDText] = useState('');
  const [dPhotos, setDPhotos] = useState<any[]>([]);
  const [kolli, setKolli] = useState(0);
  const [kg, setKg] = useState('');
  useEffect(() => {
    setMode('menu');
    setExtras((saved && saved.extras) || {});
    setDType(null); setDText(''); setDPhotos([]);
    setKolli((saved && saved.kolli) || (stop && stop.kolli) || 0);
    setKg(String((saved && saved.kg) || (stop && stop.kg) || ''));
  }, [stop, saved]);
  if (!stop) return null;
  const nDam = (saved && saved.damages && saved.damages.length) || 0;
  const nExt = Object.keys((saved && saved.extras) || {}).length;
  const Item = ({t, s, onPress}: any) => (
    <Pressable style={x.item} onPress={onPress}><Text style={x.itemT}>{t}</Text>{s ? <Text style={x.itemS}>{s}</Text> : null}<Text style={x.chev}>›</Text></Pressable>
  );

  if (mode === 'extras') {
    return (
      <Sheet open onClose={onClose} title="Tillägg" sub="Det som ska faktureras extra – t.ex. väntan vid lastning" scroll>
        <ExtrasEditor value={extras} onChange={setExtras} />
        <Pressable style={x.save} onPress={() => onSave('extras', extras)}><Text style={x.saveTxt}>Spara tillägg</Text></Pressable>
      </Sheet>
    );
  }
  if (mode === 'damage') {
    return (
      <Sheet open onClose={onClose} title="Avvikelse" sub={stop.who} scroll>
        <View style={x.chips}>
          {DAMAGE_TYPES.map(d => (
            <Pressable key={d} style={[x.chip, dType === d && x.chipOn]} onPress={() => setDType(d)}>
              <Text style={[x.chipTxt, dType === d && x.chipTxtOn]}>{d}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput style={x.input} value={dText} onChangeText={setDText} placeholder="Vad har hänt? (valfritt)" placeholderTextColor={C.faint} multiline />
        <View style={x.photoRow}>
          {dPhotos.map((p, i) => (
            <View key={i} style={x.photoBox}><Image source={{uri: p.uri}} style={{width: '100%', height: '100%'}} />
              <Pressable style={x.photoX} onPress={() => setDPhotos(ph => ph.filter((_, j) => j !== i))}><Text style={x.photoXTxt}>×</Text></Pressable></View>
          ))}
          {dPhotos.length < MAX_PHOTOS && (
            <Pressable style={x.photoAdd} onPress={async () => { const g = await pickPhoto(true); if (g.length) setDPhotos(p => [...p, ...g].slice(0, MAX_PHOTOS)); }}>
              <Text style={x.photoIco}>＋</Text><Text style={x.photoAddTxt}>Ta bild</Text>
            </Pressable>
          )}
        </View>
        <Pressable style={[x.save, !dType && {opacity: 0.4}]} disabled={!dType} onPress={() => onSave('damage', {type: dType, text: dText.trim(), photos: dPhotos.map(p => ({uri: p.uri, b64: p.b64})), at: Date.now()})}>
          <Text style={x.saveTxt}>Spara avvikelse</Text>
        </Pressable>
      </Sheet>
    );
  }
  if (mode === 'kolli') {
    return (
      <Sheet open onClose={onClose} title="Ändra kollin / vikt" sub={`Order ${stop.orderNo || ''}`}>
        <Text style={x.lbl}>Antal kollin</Text>
        <View style={x.bigStep}>
          <Pressable style={x.bigBtn} onPress={() => setKolli(k => Math.max(0, k - 1))}><Text style={x.bigBtnTxt}>−</Text></Pressable>
          <Text style={x.bigVal}>{kolli}</Text>
          <Pressable style={x.bigBtn} onPress={() => setKolli(k => k + 1)}><Text style={x.bigBtnTxt}>+</Text></Pressable>
        </View>
        <Text style={x.lbl}>Vikt (kg)</Text>
        <TextInput style={x.input} value={kg} onChangeText={setKg} keyboardType="numeric" placeholder="—" placeholderTextColor={C.faint} />
        <Pressable style={x.save} onPress={() => onSave('kolli', {kolli, kg: Number(kg) || 0})}><Text style={x.saveTxt}>Spara</Text></Pressable>
      </Sheet>
    );
  }
  return (
    <Sheet open onClose={onClose} title={stop.who || 'Order'} sub={[stop.orderNo && `Order ${stop.orderNo}`, stop.freightBill && `Fraktsedel ${stop.freightBill}`].filter(Boolean).join('  ·  ')}>
      <Item t="Tillägg" s={nExt ? `${nExt} tillagt` : 'Lastningstid, lossningstid, inbärning…'} onPress={() => setMode('extras')} />
      <Item t="Avvikelse" s={nDam ? `${nDam} rapporterad` : 'Skada, fel kolliantal, emballage'} onPress={() => setMode('damage')} />
      <Item t="Ändra kollin / vikt" s={`${(saved && saved.kolli) || stop.kolli || 0} kollin${stop.kg ? ` · ${stop.kg} kg` : ''}`} onPress={() => setMode('kolli')} />
    </Sheet>
  );
}

const x = themed(() => StyleSheet.create({
  item: {flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, marginTop: 10, flexWrap: 'wrap'},
  itemT: {color: C.ink, fontSize: 16, fontWeight: '700', flexBasis: '85%'},
  itemS: {color: C.faint, fontSize: 12, marginTop: 2, flexBasis: '85%'},
  chev: {position: 'absolute', right: 14, color: C.dim, fontSize: 22},
  artRow: {flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14},
  artRowOn: {borderColor: C.accent},
  artName: {color: C.ink, fontSize: 15, fontWeight: '700'},
  artQty: {color: C.dim, fontSize: 12, marginTop: 2},
  stepper: {flexDirection: 'row', gap: 8},
  stepBtn: {width: 40, height: 40, borderRadius: 10, backgroundColor: C.panel, borderColor: C.edge, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  stepTxt: {color: C.accentInk, fontSize: 22, fontWeight: '800', lineHeight: 24},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10},
  chip: {backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 18, paddingVertical: 9, paddingHorizontal: 14},
  chipOn: {backgroundColor: C.accent, borderColor: C.accent},
  chipTxt: {color: C.ink, fontSize: 14, fontWeight: '600'},
  chipTxtOn: {color: C.onAccent},
  input: {backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 12, color: C.ink, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, marginTop: 12, minHeight: 48},
  photoRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12},
  photoBox: {width: 78, height: 78, borderRadius: 12, overflow: 'hidden', backgroundColor: C.panel2},
  photoX: {position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(20,18,16,0.85)', alignItems: 'center', justifyContent: 'center'},
  photoXTxt: {color: C.ink, fontSize: 16, lineHeight: 18, fontWeight: '700'},
  photoAdd: {width: 78, height: 78, borderRadius: 12, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  photoIco: {color: C.accentInk, fontSize: 20, fontWeight: '700'},
  photoAddTxt: {color: C.dim, fontSize: 12, marginTop: 2, fontWeight: '600'},
  save: {backgroundColor: C.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 16, marginBottom: 4},
  saveTxt: {color: C.onAccent, fontSize: 16, fontWeight: '800'},
  lbl: {color: C.dim, fontSize: 13, fontWeight: '700', marginTop: 14},
  bigStep: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, marginTop: 8},
  bigBtn: {width: 58, height: 58, borderRadius: 14, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  bigBtnTxt: {color: C.accentInk, fontSize: 28, fontWeight: '800', lineHeight: 30},
  bigVal: {color: C.ink, fontSize: 34, fontWeight: '900', minWidth: 70, textAlign: 'center'},
}));

/**
 * Delade byggstenar: bottenblad, tangentbordslyft, signaturruta, foto.
 */
import React, {useEffect, useRef, useState} from 'react';
import {Dimensions, Keyboard, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import {C, themed} from './theme';

// Tangentbordets höjd. endCoordinates räknar inte med tangentbordets verktygsrad
// på många Android-tangentbord, därför en buffert (samma som chatten, beprövad).
export const KB_BUFFER = 64;
export function useKeyboardLift() {
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', e => setKb(e.endCoordinates?.height || 0));
    const b = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => { a.remove(); b.remove(); };
  }, []);
  return {kb, lift: kb > 0 ? kb + KB_BUFFER : 0};
}

// ---- Bottenblad ----
export function Sheet({open, onClose, title, sub, scroll, scrollEnabled = true, children}: any) {
  const insets = useSafeAreaInsets();
  const {kb, lift} = useKeyboardLift();
  return (
    <Modal visible={!!open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={p.overlay} onPress={onClose} />
      <View style={[p.sheet, {paddingBottom: kb > 0 ? 12 : 16 + insets.bottom, bottom: lift, maxHeight: kb > 0 ? undefined : '88%'}]}>
        <View style={p.handle} />
        {title ? <Text style={p.title}>{title}</Text> : null}
        {sub ? <Text style={p.sub}>{sub}</Text> : null}
        {scroll
          ? <ScrollView style={{flexShrink: 1}} scrollEnabled={scrollEnabled} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{children}</ScrollView>
          : <View style={{marginTop: 6}}>{children}</View>}
      </View>
    </Modal>
  );
}

// ---- Signaturruta (ingen native-dep: PanResponder + segment som roterade vyer) ----
// Papperet är vitt i båda lägena (3.57), så bläcket är alltid mörkt.
const INK = '#0B1220';
type Pt = {x: number; y: number};
function Segments({stroke, w}: {stroke: Pt[]; w: number}) {
  const out = [];
  for (let i = 1; i < stroke.length; i++) {
    const a = stroke[i - 1], b = stroke[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    out.push(<View key={i} pointerEvents="none" style={{position: 'absolute', left: mx - len / 2 - w / 4, top: my - w / 2, width: len + w / 2, height: w, borderRadius: w / 2, backgroundColor: INK, transform: [{rotate: `${ang}deg`}]}} />);
  }
  return <>{out}</>;
}
export type SigData = {strokes: Pt[][]; w: number; h: number};
/**
 * Stor signaturruta. Positionen räknas från sidkoordinater minus rutans ursprung
 * (räknat exakt vid första beröringen), så linjen följer fingret även över gamla streck.
 */
export function SignaturePad({height, onChange, onDrawing, hint = 'Signera här', paper}: {height: number; onChange: (d: SigData | null) => void; onDrawing?: (d: boolean) => void; hint?: string; paper?: boolean}) {
  const [committed, setCommitted] = useState<Pt[][]>([]);
  const [curr, setCurr] = useState<Pt[]>([]);
  const [width, setWidth] = useState(0);
  const ref = useRef<Pt[]>([]);
  const all = useRef<Pt[][]>([]);
  const origin = useRef({x: 0, y: 0});
  const cb = useRef({onChange, onDrawing, width, height});
  cb.current = {onChange, onDrawing, width, height};
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: e => {
        cb.current.onDrawing && cb.current.onDrawing(true);
        const n = e.nativeEvent;
        origin.current = {x: n.pageX - n.locationX, y: n.pageY - n.locationY};
        const q = [{x: n.locationX, y: n.locationY}];
        ref.current = q; setCurr(q);
      },
      onPanResponderMove: e => {
        const q = {x: e.nativeEvent.pageX - origin.current.x, y: e.nativeEvent.pageY - origin.current.y};
        const last = ref.current[ref.current.length - 1];
        if (!last || Math.hypot(q.x - last.x, q.y - last.y) > 1.5) { const nx = [...ref.current, q]; ref.current = nx; setCurr(nx); }
      },
      onPanResponderRelease: () => {
        const st = ref.current.length === 1 ? [ref.current[0], {x: ref.current[0].x + 0.5, y: ref.current[0].y + 0.5}] : ref.current;
        if (st.length > 1) {
          all.current = [...all.current, st];
          setCommitted(all.current);
          cb.current.onChange({strokes: all.current, w: cb.current.width, h: cb.current.height});
        }
        ref.current = []; setCurr([]);
        cb.current.onDrawing && cb.current.onDrawing(false);
      },
      onPanResponderTerminate: () => { ref.current = []; setCurr([]); cb.current.onDrawing && cb.current.onDrawing(false); },
    }),
  ).current;
  function clear() { all.current = []; setCommitted([]); setCurr([]); ref.current = []; onChange(null); }
  const empty = committed.length === 0 && curr.length === 0;
  const lineY = Math.round(height * 0.74);
  return (
    <View>
      <View
        style={[p.pad, {height}, empty ? p.padEmpty : null, paper && p.paper]}
        onLayout={e => setWidth(e.nativeEvent.layout.width)}
        {...pan.panHandlers}>
        {/* Var man ska skriva: linje med kryss, syns direkt */}
        <View pointerEvents="none" style={[p.sigLine, {top: lineY}]} />
        <Text pointerEvents="none" style={[p.sigX, {top: lineY - 34}]}>✕</Text>
        <Text pointerEvents="none" style={[p.sigUnder, {top: lineY + 8}]}>Underskrift</Text>
        {empty && <Text pointerEvents="none" style={[p.sigHint, {top: lineY - 80}]}>{hint}</Text>}
        {committed.map((st, i) => <Segments key={i} stroke={st} w={3.4} />)}
        <Segments stroke={curr} w={3.4} />
      </View>
      {!empty && !paper && <Pressable onPress={clear} hitSlop={10} style={p.clear}><Text style={p.clearTxt}>Rensa signaturen</Text></Pressable>}
    </View>
  );
}

// Förhandsvisning av en signatur (skalad till rutan).
export function SigPreview({data, height = 120}: {data: SigData; height?: number}) {
  const [w, setW] = useState(0);
  const sx = data.w ? w / data.w : 1, sy = data.h ? height / data.h : 1, k = Math.min(sx, sy) || 1;
  const ox = (w - data.w * k) / 2, oy = (height - data.h * k) / 2;
  return (
    <View style={[p.pad, {height}]} onLayout={e => setW(e.nativeEvent.layout.width)} pointerEvents="none">
      {w > 0 && data.strokes.map((st, i) => <Segments key={i} stroke={st.map(q => ({x: q.x * k + ox, y: q.y * k + oy}))} w={2.6} />)}
    </View>
  );
}

// Helskärm: ge telefonen till kunden – hela skärmen är papper, inget scrollar eller flyttar sig.
export function SignFullscreen({open, who, onCancel, onDone}: {open: boolean; who?: string; onCancel: () => void; onDone: (d: SigData) => void}) {
  const insets = useSafeAreaInsets();
  const [d, setD] = useState<SigData | null>(null);
  const [key, setKey] = useState(0);
  useEffect(() => { if (open) { setD(null); setKey(k => k + 1); } }, [open]);
  const h = Math.round(Dimensions.get('window').height - insets.top - insets.bottom - 170);
  return (
    <Modal visible={open} animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={[p.fsRoot, {paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12}]}>
        <View style={p.fsHead}>
          <Pressable hitSlop={10} onPress={onCancel} style={p.fsX} accessibilityLabel="Avbryt"><Text style={p.fsXT}>✕</Text></Pressable>
          <View style={{flex: 1, minWidth: 0}}>
            <Text style={p.fsTitle} numberOfLines={1}>Signera</Text>
            {who ? <Text style={p.fsSub} numberOfLines={1}>{who}</Text> : null}
          </View>
        </View>
        <View style={{flex: 1, marginTop: 10}}>
          <SignaturePad key={key} height={Math.max(300, h)} onChange={setD} hint="Skriv under här" paper />
          <View pointerEvents="none" style={p.lockChip}><Text style={p.lockT}>🔒 Skärmen står still</Text></View>
        </View>
        <View style={p.fsBtns}>
          <Pressable style={p.fsCancel} onPress={() => { setD(null); setKey(k => k + 1); }}><Text style={p.fsCancelTxt}>Rensa</Text></Pressable>
          <Pressable style={[p.fsDone, !d && p.fsDoneOff]} disabled={!d} onPress={() => d && onDone(d)}><Text style={[p.fsDoneTxt, !d && {color: C.faint}]}>Klar</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

// Namnet efteråt: eget blad med förslag (Opter + tidigare här) så ett tryck räcker om det är samma person.
export function NameAsk({open, suggestions, required, title, onSkip, onSave}: {open: boolean; suggestions: string[]; required?: boolean; title?: string; onSkip: () => void; onSave: (n: string) => void}) {
  const [v, setV] = useState('');
  useEffect(() => { if (open) setV(''); }, [open]);
  const ok = v.trim().length >= 2;
  return (
    <Sheet open={open} onClose={onSkip} title={title || 'Vem skrev under?'} sub={required ? 'Namnförtydligande · KRÄVS av kontoret' : 'Namnförtydligande, skickas med kvittensen'}>
      {suggestions.length ? <>
        <Text style={p.naK}>TIDIGARE HÄR</Text>
        <View style={p.naRow}>
          {suggestions.slice(0, 6).map(n => (
            <Pressable key={n} style={p.naChip} onPress={() => onSave(n)}><Text style={p.naChipT}>{n}</Text></Pressable>
          ))}
        </View>
      </> : null}
      <Text style={p.naK}>{suggestions.length ? 'ELLER SKRIV' : 'SKRIV NAMNET'}</Text>
      <TextInput style={p.naIn} value={v} onChangeText={setV} placeholder="Mottagarens namn" placeholderTextColor={C.faint} autoFocus={!suggestions.length} autoCapitalize="words" autoCorrect={false} returnKeyType="done" onSubmitEditing={() => ok && onSave(v.trim())} />
      <View style={p.naBtns}>
        {!required ? <Pressable style={p.naSkip} onPress={onSkip}><Text style={p.naSkipT}>Hoppa över</Text></Pressable> : null}
        <Pressable style={[p.naSave, !ok && p.fsDoneOff]} disabled={!ok} onPress={() => onSave(v.trim())}><Text style={[p.naSaveT, !ok && {color: C.faint}]}>Spara namn</Text></Pressable>
      </View>
    </Sheet>
  );
}

// ---- Stor text: texten i ordern i läsbar storlek (tryck på TEXT I ORDERN). Större/mindre med A−/A+. ----
export function BigText({text, title, onClose}: {text: string | null; title?: string; onClose: () => void}) {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState(28);
  return (
    <Modal visible={!!text} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[p.btRoot, {paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12}]}>
        <View style={p.btTop}>
          <Text style={p.btK}>{title || 'TEXT I ORDERN'}</Text>
          <View style={{flex: 1}} />
          <Pressable hitSlop={8} style={p.btSz} onPress={() => setSize(v => Math.max(20, v - 4))} accessibilityLabel="Mindre text"><Text style={[p.btSzT, {fontSize: 15}]}>A−</Text></Pressable>
          <Pressable hitSlop={8} style={p.btSz} onPress={() => setSize(v => Math.min(44, v + 4))} accessibilityLabel="Större text"><Text style={[p.btSzT, {fontSize: 19}]}>A+</Text></Pressable>
        </View>
        <ScrollView style={{flex: 1}} contentContainerStyle={{paddingVertical: 12}}>
          <Text style={[p.btTxt, {fontSize: size, lineHeight: Math.round(size * 1.35)}]} selectable>{text}</Text>
        </ScrollView>
        <Pressable style={p.btClose} onPress={onClose}><Text style={p.btCloseT}>Stäng</Text></Pressable>
      </View>
    </Modal>
  );
}

// ---- Foto ----
export const MAX_PHOTOS = 6;
export async function pickPhoto(fromCamera: boolean) {
  const opts: any = {mediaType: 'photo', quality: 0.8, maxWidth: 1200, maxHeight: 1200, includeBase64: true, saveToPhotos: false}; // som Opter: max 1200 px
  const res: any = fromCamera ? await launchCamera(opts) : await launchImageLibrary({...opts, selectionLimit: 5});
  if (!res || res.didCancel || res.errorCode) return [];
  return (res.assets || []).filter((a: any) => a.uri).map((a: any) => ({uri: a.uri, b64: a.base64 || null, w: a.width, h: a.height}));
}

const p = themed(() => StyleSheet.create({
  overlay: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.overlay},
  sheet: {position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 10},
  handle: {alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.edge, marginBottom: 12},
  title: {color: C.ink, fontSize: 18, fontWeight: '800'},
  sub: {color: C.dim, fontSize: 13, marginTop: 2, marginBottom: 2},
  pad: {backgroundColor: '#FFFFFF', borderColor: C.edge, borderWidth: 1, borderRadius: 16, overflow: 'hidden'},
  padEmpty: {borderColor: C.accent, borderWidth: 2},
  paper: {borderColor: C.accent, borderWidth: 2, borderBottomWidth: 5, borderBottomColor: C.accentLo, borderRadius: 20},
  sigLine: {position: 'absolute', left: 22, right: 22, height: 2, backgroundColor: '#C9D2DF'},
  sigX: {position: 'absolute', left: 24, color: '#B35300', fontSize: 26, fontWeight: '800'},
  sigUnder: {position: 'absolute', left: 24, color: '#5B6678', fontSize: 12, fontWeight: '600', letterSpacing: 1},
  sigHint: {position: 'absolute', left: 0, right: 0, textAlign: 'center', color: '#8C97A8', fontSize: 22, fontWeight: '700'},
  fsRoot: {flex: 1, backgroundColor: C.bg, paddingHorizontal: 12},
  fsHead: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 2},
  fsX: {width: 44, height: 44, borderRadius: 22, backgroundColor: C.panel, borderColor: C.edge, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  fsXT: {color: C.ink, fontSize: 18, fontWeight: '700'},
  fsTitle: {color: C.ink, fontSize: 24, fontWeight: '800', fontFamily: 'BarlowCond'},
  fsSub: {color: C.dim, fontSize: 14, marginTop: 1},
  lockChip: {position: 'absolute', left: 14, top: 14, backgroundColor: '#EEF2F8', borderRadius: 13, paddingHorizontal: 10, paddingVertical: 4},
  lockT: {color: '#3E4A5C', fontSize: 12, fontWeight: '700'},
  fsBtns: {flexDirection: 'row', gap: 10, marginTop: 12},
  fsCancel: {width: 120, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderBottomWidth: 3, borderBottomColor: C.trkA, borderRadius: 14, height: 56, alignItems: 'center', justifyContent: 'center'},
  fsCancelTxt: {color: C.ink, fontSize: 17, fontWeight: '800'},
  fsDone: {flex: 1, backgroundColor: C.accent, borderRadius: 14, height: 56, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: C.accentLo},
  fsDoneOff: {backgroundColor: C.panel2, borderBottomColor: C.edge},
  fsDoneTxt: {color: '#000000', fontSize: 18, fontWeight: '800'},
  naK: {color: C.faint, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, marginTop: 14, marginBottom: 8},
  naRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  naChip: {height: 46, paddingHorizontal: 16, borderRadius: 12, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderBottomWidth: 3, borderBottomColor: C.trkA, justifyContent: 'center'},
  naChipT: {color: C.ink, fontSize: 16, fontWeight: '700'},
  naIn: {height: 52, borderRadius: 12, backgroundColor: C.panel2, borderColor: C.accent, borderWidth: 2, paddingHorizontal: 14, color: C.ink, fontSize: 17},
  naBtns: {flexDirection: 'row', gap: 8, marginTop: 14},
  naSkip: {width: 130, height: 54, borderRadius: 14, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  naSkipT: {color: C.ink, fontSize: 16, fontWeight: '800'},
  naSave: {flex: 1, height: 54, borderRadius: 14, backgroundColor: C.accent, borderBottomWidth: 3, borderBottomColor: C.accentLo, alignItems: 'center', justifyContent: 'center'},
  naSaveT: {color: '#000000', fontSize: 17, fontWeight: '800'},
  btRoot: {flex: 1, backgroundColor: C.bg, paddingHorizontal: 18},
  btTop: {flexDirection: 'row', alignItems: 'center', gap: 8},
  btK: {color: C.faint, fontSize: 13, fontWeight: '800', letterSpacing: 1.2},
  btSz: {width: 52, height: 44, borderRadius: 12, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  btSzT: {color: C.ink, fontWeight: '800'},
  btTxt: {color: C.ink, fontWeight: '600'},
  btClose: {height: 56, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: C.accentLo},
  btCloseT: {color: '#000000', fontSize: 18, fontWeight: '800'},
  clear: {alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 4},
  clearTxt: {color: C.accentInk, fontSize: 14, fontWeight: '700'},
}));

/**
 * Delade byggstenar: bottenblad, tangentbordslyft, signaturruta, foto.
 */
import React, {useEffect, useRef, useState} from 'react';
import {Keyboard, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import {C} from './theme';

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
type Pt = {x: number; y: number};
function Segments({stroke, w}: {stroke: Pt[]; w: number}) {
  const out = [];
  for (let i = 1; i < stroke.length; i++) {
    const a = stroke[i - 1], b = stroke[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    out.push(<View key={i} pointerEvents="none" style={{position: 'absolute', left: mx - len / 2 - w / 4, top: my - w / 2, width: len + w / 2, height: w, borderRadius: w / 2, backgroundColor: C.ink, transform: [{rotate: `${ang}deg`}]}} />);
  }
  return <>{out}</>;
}
export type SigData = {strokes: Pt[][]; w: number; h: number};
/**
 * Stor signaturruta. Positionen räknas från sidkoordinater minus rutans ursprung
 * (räknat exakt vid första beröringen), så linjen följer fingret även över gamla streck.
 */
export function SignaturePad({height, onChange, onDrawing, hint = 'Signera här'}: {height: number; onChange: (d: SigData | null) => void; onDrawing?: (d: boolean) => void; hint?: string}) {
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
        style={[p.pad, {height}, empty ? p.padEmpty : null]}
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
      {!empty && <Pressable onPress={clear} hitSlop={10} style={p.clear}><Text style={p.clearTxt}>Rensa signaturen</Text></Pressable>}
    </View>
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

const p = StyleSheet.create({
  overlay: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)'},
  sheet: {position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 10},
  handle: {alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.edge, marginBottom: 12},
  title: {color: C.ink, fontSize: 18, fontWeight: '800'},
  sub: {color: C.dim, fontSize: 13, marginTop: 2, marginBottom: 2},
  pad: {backgroundColor: '#2a2622', borderColor: C.edge, borderWidth: 1, borderRadius: 16, overflow: 'hidden'},
  padEmpty: {borderColor: C.accent, borderWidth: 2},
  sigLine: {position: 'absolute', left: 22, right: 22, height: 2, backgroundColor: '#6b6157'},
  sigX: {position: 'absolute', left: 24, color: C.accent, fontSize: 26, fontWeight: '800'},
  sigUnder: {position: 'absolute', left: 24, color: C.faint, fontSize: 12, fontWeight: '600', letterSpacing: 1},
  sigHint: {position: 'absolute', left: 0, right: 0, textAlign: 'center', color: C.dim, fontSize: 20, fontWeight: '700'},
  clear: {alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 4},
  clearTxt: {color: C.accent, fontSize: 14, fontWeight: '700'},
});

/**
 * Hjul för tider – som väckarklockan: scrolla siffrorna, de tonar ut uppåt och nedåt så hjulet ser runt ut.
 * Tryck på mittensiffran för att skriva in den i stället. Hjulet går runt (59 → 00).
 */
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {C, themed, FONT, R} from './theme';
import {Sheet} from './parts';

export const ITEM = 46;
const VIS = 5; // synliga rader – mitten är vald
const COPIES = 5; // hjulet går runt: listan finns flera gånger, vi håller oss i mitten
const two = (n: number) => String(n).padStart(2, '0');

export function Wheel({values, value, onChange, width = 76, size = 30, fmt = two, bg, testID}: {
  values: number[]; value: number; onChange: (v: number) => void; width?: number; size?: number; fmt?: (v: number) => string; bg?: string; testID?: string;
}) {
  const n = values.length;
  const data = useMemo(() => Array.from({length: n * COPIES}, (_, i) => values[i % n]), [values]);
  const base = Math.floor(COPIES / 2) * n;
  const idxOf = (v: number) => { const i = values.indexOf(v); return i < 0 ? 0 : i; };
  const y = useRef(new Animated.Value((base + idxOf(value)) * ITEM)).current;
  const ref = useRef<any>(null);
  const cur = useRef(base + idxOf(value));
  const inited = useRef(false); // första läget sätts när listan mätts (contentOffset räcker inte överallt)
  const [typing, setTyping] = useState(false);
  const [txt, setTxt] = useState('');

  const go = (i: number, animated: boolean) => { cur.current = i; ref.current && ref.current.scrollTo({y: i * ITEM, animated}); };
  // Ändras värdet utifrån (t.ex. "Nu") → hjulet snurrar dit.
  useEffect(() => { if (data[cur.current] !== value) go(base + idxOf(value), true); }, [value]);

  const settle = (off: number) => {
    let i = Math.round(off / ITEM);
    i = Math.max(0, Math.min(data.length - 1, i));
    const v = data[i];
    // Långt ut mot kanten → hoppa tyst tillbaka till mittenkopian (samma siffra) så hjulet aldrig tar slut.
    if (i < n || i >= data.length - n) { const j = base + (i % n); setTimeout(() => go(j, false), 0); cur.current = j; } else cur.current = i;
    if (v !== value) onChange(v);
  };
  const endTimer = useRef<any>(null);
  const commit = () => {
    setTyping(false);
    const k = parseInt(txt.replace(/\D/g, ''), 10);
    if (!Number.isFinite(k)) return;
    const v = values.reduce((b, x) => (Math.abs(x - k) < Math.abs(b - k) ? x : b), values[0]);
    go(base + idxOf(v), true); if (v !== value) onChange(v);
  };

  const H = ITEM * VIS;
  return (
    <View style={{width, height: H}} testID={testID}>
      <Animated.ScrollView ref={ref} showsVerticalScrollIndicator={false} snapToInterval={ITEM} decelerationRate="fast"
        contentOffset={{x: 0, y: (base + idxOf(value)) * ITEM}} contentContainerStyle={{paddingVertical: ITEM * 2}}
        onScroll={Animated.event([{nativeEvent: {contentOffset: {y}}}], {useNativeDriver: true})} scrollEventThrottle={16}
        onContentSizeChange={() => { if (!inited.current) { inited.current = true; ref.current && ref.current.scrollTo({y: cur.current * ITEM, animated: false}); } }}
        onScrollBeginDrag={() => { if (endTimer.current) clearTimeout(endTimer.current); }}
        onScrollEndDrag={e => { const off = e.nativeEvent.contentOffset.y; if (endTimer.current) clearTimeout(endTimer.current); endTimer.current = setTimeout(() => settle(off), 180); }}
        onMomentumScrollBegin={() => { if (endTimer.current) clearTimeout(endTimer.current); }}
        onMomentumScrollEnd={e => settle(e.nativeEvent.contentOffset.y)}>
        {data.map((v, i) => {
          const r = [(i - 2) * ITEM, (i - 1) * ITEM, i * ITEM, (i + 1) * ITEM, (i + 2) * ITEM];
          const opacity = y.interpolate({inputRange: r, outputRange: [0.12, 0.42, 1, 0.42, 0.12], extrapolate: 'clamp'});
          const rotateX = y.interpolate({inputRange: r, outputRange: ['58deg', '32deg', '0deg', '-32deg', '-58deg'], extrapolate: 'clamp'});
          const scale = y.interpolate({inputRange: r, outputRange: [0.78, 0.9, 1, 0.9, 0.78], extrapolate: 'clamp'});
          return (
            <Pressable key={i} style={{height: ITEM, alignItems: 'center', justifyContent: 'center'}}
              onPress={() => { if (i === cur.current) { setTxt(fmt(v)); setTyping(true); } else { go(i, true); settle(i * ITEM); } }}>
              <Animated.Text style={[w.num, {fontSize: size, opacity, transform: [{perspective: 500}, {rotateX}, {scale}]}]}>{fmt(v)}</Animated.Text>
            </Pressable>
          );
        })}
      </Animated.ScrollView>
      {/* Toning uppe och nere: lager av bakgrundsfärg så siffrorna försvinner runt hjulet */}
      {bg ? [0, 1].map(side => (
        <View key={side} pointerEvents="none" style={[w.fade, side ? {bottom: 0} : {top: 0}]}>
          {[0.85, 0.6, 0.38, 0.2, 0.08].map((a, k) => <View key={k} style={{flex: 1, backgroundColor: bg, opacity: side ? [0.08, 0.2, 0.38, 0.6, 0.85][k] : a}} />)}
        </View>
      )) : null}
      {typing ? (
        <View style={[w.typeBox, {top: ITEM * 2}]}>
          <TextInput autoFocus style={[w.typeIn, {fontSize: size}]} value={txt} onChangeText={setTxt} keyboardType="number-pad" maxLength={2} selectTextOnFocus
            onSubmitEditing={commit} onBlur={commit} />
        </View>
      ) : null}
    </View>
  );
}

const HOURS = Array.from({length: 24}, (_, i) => i);
const MINS = Array.from({length: 60}, (_, i) => i);

/** Klockslag: timmar : minuter. value/onChange i minuter efter midnatt. */
export function TimeWheel({value, onChange, bg, size = 34}: {value: number; onChange: (m: number) => void; bg?: string; size?: number}) {
  const h = Math.floor(value / 60) % 24, m = value % 60;
  return (
    <View style={w.row}>
      <View style={[w.band, {top: ITEM * 2}]} pointerEvents="none" />
      <Wheel values={HOURS} value={h} onChange={x => onChange(x * 60 + m)} size={size} bg={bg} testID="wheel-h" />
      <Text style={[w.colon, {fontSize: size}]}>:</Text>
      <Wheel values={MINS} value={m} onChange={x => onChange(h * 60 + x)} size={size} bg={bg} testID="wheel-m" />
    </View>
  );
}

/** Tid som varaktighet: timmar + minuter (för "Timmar och minuter"). */
export function DurationWheel({value, onChange, bg}: {value: number; onChange: (m: number) => void; bg?: string}) {
  const h = Math.min(23, Math.floor(value / 60)), m = value % 60;
  return (
    <View style={w.row}>
      <View style={[w.band, {top: ITEM * 2}]} pointerEvents="none" />
      <Wheel values={HOURS} value={h} onChange={x => onChange(x * 60 + m)} size={30} bg={bg} width={70} testID="wheel-dh" />
      <Text style={w.unit}>tim</Text>
      <Wheel values={MINS} value={m} onChange={x => onChange(h * 60 + x)} size={30} bg={bg} width={70} testID="wheel-dm" />
      <Text style={w.unit}>min</Text>
    </View>
  );
}

const mOf = (t: number | null) => { const d = t ? new Date(t) : new Date(); return d.getHours() * 60 + d.getMinutes(); };
const toDay = (m: number, ref?: number | null) => { const d = ref ? new Date(ref) : new Date(); d.setHours(Math.floor(m / 60), m % 60, 0, 0); return d.getTime(); };

/** Bladet med hjulet: "Starttid" / "Sluttid" → Nu · Klar. Svarar med en tidpunkt idag (ms). */
export function TimeSheet({open, title, value, onClose, onDone}: {open: boolean; title: string; value: number | null; onClose: () => void; onDone: (t: number) => void}) {
  const [m, setM] = useState(mOf(value));
  useEffect(() => { if (open) setM(mOf(value)); }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title={title} sub="Scrolla, eller tryck på siffran och skriv">
      <View style={{alignItems: 'center', paddingVertical: 8}}>
        <TimeWheel value={m} onChange={setM} bg={C.panel} size={38} />
      </View>
      <View style={w.btns}>
        <Pressable style={[w.btn, {backgroundColor: C.panel2}]} onPress={() => setM(mOf(Date.now()))}><Text style={w.btnT}>Nu</Text></Pressable>
        <Pressable style={[w.btn, {backgroundColor: C.accent, flex: 2}]} onPress={() => onDone(toDay(m, value))}><Text style={[w.btnT, {color: '#000000'}]}>Klar · {two(Math.floor(m / 60))}:{two(m % 60)}</Text></Pressable>
      </View>
    </Sheet>
  );
}

const w = themed(() => StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'center'},
  band: {position: 'absolute', left: -10, right: -10, height: ITEM, borderRadius: R, backgroundColor: C.panel2},
  num: {color: C.ink, fontFamily: FONT.cond, fontWeight: '700', fontVariant: ['tabular-nums']},
  colon: {color: C.ink, fontFamily: FONT.cond, fontWeight: '700', marginHorizontal: 6, marginTop: -4},
  unit: {color: C.dim, fontFamily: FONT.cond, fontSize: 15, fontWeight: '600', marginRight: 8},
  fade: {position: 'absolute', left: 0, right: 0, height: ITEM * 2},
  typeBox: {position: 'absolute', left: 4, right: 4, height: ITEM, borderRadius: R, backgroundColor: C.accentSoft, borderWidth: 1, borderColor: C.accent, justifyContent: 'center'},
  typeIn: {color: C.ink, fontFamily: FONT.cond, fontWeight: '700', textAlign: 'center', padding: 0},
  btns: {flexDirection: 'row', gap: 8, marginTop: 8},
  btn: {flex: 1, height: 50, borderRadius: R, alignItems: 'center', justifyContent: 'center'},
  btnT: {color: C.ink, fontFamily: FONT.cond, fontSize: 18, fontWeight: '700'},
}));

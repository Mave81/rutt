// Dra för Lastad / Lossad – ett drag i stället för ett tryck, så det aldrig blir fel i fickan.
// Klart när knoppen passerat ~85 % av spåret. Släpps den tidigare glider den tillbaka.
// 3.57: 3D-knopp (ljus kant upptill, hård skugga nertill, trycks ner), ränder i det gröna medan du drar,
// och en effekt när det går igenom. Tre varianter (Inställningar → Utseende):
//   A Cel 3D: ränder + LOSSAD! med liten stjärnsmäll.  B Fartlinjer: fartstreck + efterbilder, knoppen lutar.
//   C Smäll: stor smäll, reglaget skakar, splitter. Minska rörelse i telefonen stänger av rörelserna.
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {AccessibilityInfo, Animated, Easing, PanResponder, StyleSheet, Text, Vibration, View} from 'react-native';
import {C, FONT, themed} from './theme';
import {Bi} from './Bi';
import {useLook} from './look';

const KNOB = 46, PAD = 4, H = KNOB + PAD * 2 + 2, EDGE = 2;

function useReduceMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (alive) setR(!!v); }).catch(() => {});
    const sub: any = AccessibilityInfo.addEventListener && AccessibilityInfo.addEventListener('reduceMotionChanged', (v: boolean) => setR(!!v));
    return () => { alive = false; sub && sub.remove && sub.remove(); };
  }, []);
  return r;
}

// Stjärnsmäll av strålar (inga native-beroenden): gula långa, vita korta, mörk kontur.
function Burst({v, big}: {v: Animated.Value; big: boolean}) {
  const n = big ? 14 : 11, R1 = big ? 64 : 44, R2 = big ? 40 : 28;
  const rays = [];
  for (let i = 0; i < n; i++) {
    const a = (360 / n) * i + (i % 2 ? 9 : 0);
    const len = (i % 3 === 0 ? R1 : R1 * 0.78), wy = big ? 14 : 11, ww = big ? 8 : 6;
    rays.push(<View key={'y' + i} style={[b.hub, {transform: [{rotate: `${a}deg`}]}]}><View style={[b.ray, {left: -wy / 2, top: -len, width: wy, height: len, backgroundColor: '#FFC933'}]} /></View>);
    rays.push(<View key={'w' + i} style={[b.hub, {transform: [{rotate: `${a + 13}deg`}]}]}><View style={[b.ray, {left: -ww / 2, top: -R2, width: ww, height: R2, backgroundColor: '#FFFFFF'}]} /></View>);
  }
  const scale = v.interpolate({inputRange: [0, 0.6, 1], outputRange: [0.2, 1.05, 1.2]});
  const opacity = v.interpolate({inputRange: [0, 0.7, 1], outputRange: [1, 1, 0]});
  return (
    <Animated.View pointerEvents="none" style={[b.burst, {opacity, transform: [{scale}]}]}>
      {rays}
      <View style={[b.core, {width: R2 * 1.1, height: R2 * 1.1, borderRadius: R2 * 0.55, marginLeft: -R2 * 0.55, marginTop: -R2 * 0.55}]} />
    </Animated.View>
  );
}

export default function Slider({label, tone, onDone, style}: {label: string; tone: 'go' | 'ok'; onDone: () => void; style?: any}) {
  const look = useLook();
  const v = look.slide;
  const reduce = useReduceMotion();
  const x = useRef(new Animated.Value(0)).current;        // knoppens läge (JS)
  const tilt = useRef(new Animated.Value(0)).current;     // lutning i grader (JS)
  const press = useRef(new Animated.Value(0)).current;    // nertryckt 0/1 (JS)
  const g1 = useRef(new Animated.Value(0)).current, g2 = useRef(new Animated.Value(0)).current; // efterbilder
  const gOp = useRef(new Animated.Value(0)).current;
  const done = useRef(new Animated.Value(0)).current;     // klar-läget 0→1 (JS)
  const boom = useRef(new Animated.Value(0)).current;     // smällen (native)
  const shake = useRef(new Animated.Value(0)).current;    // skak (native)
  const run = useRef(new Animated.Value(0)).current;      // ränder/streck rullar (native)
  const wave = useRef(new Animated.Value(0)).current;     // pilarna (native)
  const [w, setW] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const max = Math.max(1, w - KNOB - PAD * 2);
  const maxRef = useRef(max); maxRef.current = max;
  const doneRef = useRef(onDone); doneRef.current = onDone;
  const vRef = useRef(v); vRef.current = v;
  const redRef = useRef(reduce); redRef.current = reduce;
  const last = useRef({dx: 0, t: 0});
  const shards = useRef(Array.from({length: 12}, () => new Animated.Value(0))).current;
  const ok = tone === 'ok';
  const face = ok ? {hi: C.okHi, mid: C.accent2, lo: C.okLo, line: C.okLine, ink: '#FFFFFF'} : {hi: C.accentHi, mid: C.accent, lo: C.accentLo, line: '#7A3600', ink: '#000000'};

  useEffect(() => {
    const a = Animated.loop(Animated.timing(run, {toValue: 1, duration: 520, easing: Easing.linear, useNativeDriver: true}));
    const b2 = Animated.loop(Animated.timing(wave, {toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true}));
    if (!reduce) { a.start(); b2.start(); }
    return () => { a.stop(); b2.stop(); };
  }, [run, wave, reduce]);

  function complete() {
    setIsDone(true);
    try { Vibration.vibrate(30); } catch (e) {}
    Animated.timing(x, {toValue: maxRef.current, duration: 110, useNativeDriver: false}).start();
    Animated.spring(done, {toValue: 1, useNativeDriver: false, speed: 18, bounciness: 12}).start();
    boom.setValue(0);
    Animated.timing(boom, {toValue: 1, duration: 560, easing: Easing.out(Easing.quad), useNativeDriver: true}).start();
    if (vRef.current === 'C' && !redRef.current) {
      shake.setValue(0);
      Animated.timing(shake, {toValue: 1, duration: 320, easing: Easing.linear, useNativeDriver: true}).start();
      shards.forEach((s, i) => { s.setValue(0); Animated.timing(s, {toValue: 1, duration: 600 + (i % 4) * 90, easing: Easing.out(Easing.cubic), useNativeDriver: true}).start(); });
    }
    setTimeout(() => doneRef.current(), 140);
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(done, {toValue: 0, duration: 200, useNativeDriver: false}),
        Animated.timing(x, {toValue: 0, duration: 260, useNativeDriver: false}),
      ]).start(() => setIsDone(false));
    }, 1100);
  }

  const pr = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 4,
    onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { last.current = {dx: 0, t: Date.now()}; Animated.timing(press, {toValue: 1, duration: 60, useNativeDriver: false}).start(); },
    onPanResponderMove: (_e, g) => {
      const nx = Math.max(0, Math.min(maxRef.current, g.dx));
      x.setValue(nx);
      const t = Date.now(), vel = (g.dx - last.current.dx) / Math.max(1, t - last.current.t); last.current = {dx: g.dx, t};
      if (!redRef.current && vRef.current !== 'C') tilt.setValue(Math.max(-9, Math.min(9, vel * 10)));
      if (vRef.current === 'B') {
        Animated.spring(g1, {toValue: nx, useNativeDriver: false, speed: 30, bounciness: 0}).start();
        Animated.spring(g2, {toValue: nx, useNativeDriver: false, speed: 16, bounciness: 0}).start();
        gOp.setValue(Math.min(1, Math.abs(vel) * 1.6));
      }
    },
    onPanResponderRelease: (_e, g) => {
      Animated.timing(press, {toValue: 0, duration: 80, useNativeDriver: false}).start();
      Animated.spring(tilt, {toValue: 0, useNativeDriver: false}).start();
      Animated.timing(gOp, {toValue: 0, duration: 160, useNativeDriver: false}).start();
      if (g.dx >= maxRef.current * 0.85) complete();
      else { Animated.spring(x, {toValue: 0, useNativeDriver: false, bounciness: 8}).start(); g1.setValue(0); g2.setValue(0); }
    },
    onPanResponderTerminate: () => { press.setValue(0); tilt.setValue(0); gOp.setValue(0); Animated.spring(x, {toValue: 0, useNativeDriver: false}).start(); },
  }), [x, press, tilt, g1, g2, gOp]);

  const fade = x.interpolate({inputRange: [0, max * 0.55], outputRange: [1, 0], extrapolate: 'clamp'});
  const prog = x.interpolate({inputRange: [0, max], outputRange: [0, 1], extrapolate: 'clamp'});
  const fillW = Animated.add(x, new Animated.Value(KNOB + PAD + 4));
  const fillOp = prog.interpolate({inputRange: [0, 1], outputRange: [0.45, 1]});
  const rot = tilt.interpolate({inputRange: [-10, 10], outputRange: ['-10deg', '10deg']});
  const pressY = press.interpolate({inputRange: [0, 1], outputRange: [0, 2]});
  const knobOp = done.interpolate({inputRange: [0, 0.4], outputRange: [1, 0], extrapolate: 'clamp'});
  const doneScale = done.interpolate({inputRange: [0, 1], outputRange: [0.4, 1]});
  const stripeX = run.interpolate({inputRange: [0, 1], outputRange: [0, 44]});
  const streakX = run.interpolate({inputRange: [0, 1], outputRange: [0, -460]});
  const shakeX = shake.interpolate({inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: [0, -5, 5, -3, 2, 0]});
  const word = ok ? 'LOSSAD!' : 'LASTAD!';
  const stripes = [];
  for (let i = 0; i < 14; i++) stripes.push(<View key={i} style={[sl.stripe, {left: i * 44 - 60}]} />);

  return (
    <Animated.View style={[{marginTop: 8, transform: [{translateX: shakeX}]}, style]}>
      <View style={sl.track} onLayout={e => setW(e.nativeEvent.layout.width)}>
        <View style={sl.inset} />
        {/* Grön/orange fyllning med rullande ränder */}
        <Animated.View style={[sl.fill, {width: isDone ? undefined : fillW, right: isDone ? 0 : undefined, opacity: isDone ? 1 : fillOp, backgroundColor: face.mid}]}>
          <View style={[sl.fillHi, {backgroundColor: face.hi}]} />
          <View style={[sl.fillLo, {backgroundColor: face.lo}]} />
          <Animated.View style={[StyleSheet.absoluteFill, {transform: [{translateX: stripeX}]}]}>{stripes}</Animated.View>
        </Animated.View>
        {/* B: fartstreck */}
        {v === 'B' && !reduce ? (
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {opacity: prog}]}>
            <Animated.View style={[StyleSheet.absoluteFill, {transform: [{translateX: streakX}]}]}>
              {[[14, 90, 40], [26, 140, 160], [40, 70, 300], [52, 120, 220], [62, 80, 380]].map(([t, w2, l], i) => <View key={i} style={[sl.streak, {top: t, width: w2, left: (w || 360) + l - 120}]} />)}
            </Animated.View>
          </Animated.View>
        ) : null}
        <Animated.Text style={[sl.label, {opacity: fade}]} numberOfLines={1}>{label}</Animated.Text>
        {!reduce ? (
          <Animated.View pointerEvents="none" style={[sl.chevs, {opacity: fade}]}>
            {[0, 1, 2].map(i => <Animated.View key={i} style={{opacity: wave.interpolate({inputRange: [0, 0.5, 1], outputRange: i === 1 ? [0.6, 1, 0.6] : i === 0 ? [1, 0.4, 1] : [0.3, 0.7, 0.3]})}}><Bi n="chevron-right" size={14} color={C.faint} /></Animated.View>)}
          </Animated.View>
        ) : null}
        {/* B: efterbilder */}
        {v === 'B' ? [g2, g1].map((g, i) => <Animated.View key={i} pointerEvents="none" style={[sl.ghost, {backgroundColor: face.mid, opacity: Animated.multiply(gOp, i ? 0.3 : 0.15), transform: [{translateX: g}]}]} />) : null}
        {/* Knoppen: 3D-kant under, ljus överdel, blank fläck */}
        <Animated.View {...pr.panHandlers} style={[sl.knobWrap, {opacity: knobOp, transform: [{translateX: x}, {rotate: rot}]}]}>
          <View style={[sl.edge, {backgroundColor: face.line}]} />
          <Animated.View style={[sl.face, {borderColor: face.line, backgroundColor: face.lo, transform: [{translateY: pressY}]}]}>
            <View style={[sl.faceTop, {backgroundColor: face.mid}]} />
            <View style={[sl.faceHi, {backgroundColor: face.hi}]} />
            <View style={sl.gloss} />
            <Bi n="chevron-double-right" size={21} color={face.ink} />
          </Animated.View>
        </Animated.View>
        {/* Klart: ord med kontur */}
        {isDone ? (
          <Animated.View pointerEvents="none" style={[sl.done, {opacity: done, transform: [{scale: doneScale}]}]}>
            <Bi n="check-circle-fill" size={22} color={ok ? '#FFFFFF' : '#000000'} />
            <View>
              {[[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1]].map(([dx, dy], i) => <Text key={i} style={[sl.word, {position: 'absolute', left: dx, top: dy, color: face.line}]}>{word}</Text>)}
              <Text style={[sl.word, {color: ok ? '#FFFFFF' : '#000000'}]}>{word}</Text>
            </View>
          </Animated.View>
        ) : null}
      </View>
      {isDone && !reduce ? <View pointerEvents="none" style={[sl.burstAt, v === 'C' && {right: -40}]}><Burst v={boom} big={v === 'C'} /></View> : null}
      {isDone && v === 'C' && !reduce ? shards.map((s, i) => {
        const a = (Math.PI * 2 * i) / shards.length + 0.3, d = 60 + (i % 3) * 35;
        const cols = [C.accent, '#FFC933', C.accent2, C.people, '#FFFFFF'];
        return <Animated.View key={i} pointerEvents="none" style={[sl.shard, {backgroundColor: cols[i % cols.length], opacity: s.interpolate({inputRange: [0, 0.8, 1], outputRange: [1, 1, 0]}), transform: [{translateX: s.interpolate({inputRange: [0, 1], outputRange: [0, Math.cos(a) * d]})}, {translateY: s.interpolate({inputRange: [0, 1], outputRange: [0, Math.sin(a) * d - 18]})}, {rotate: s.interpolate({inputRange: [0, 1], outputRange: ['0deg', `${200 + i * 37}deg`]})}]}]} />;
      }) : null}
    </Animated.View>
  );
}

const b = StyleSheet.create({
  burst: {position: 'absolute', left: 0, top: 0, width: 0, height: 0},
  hub: {position: 'absolute', left: 0, top: 0, width: 0, height: 0},
  ray: {position: 'absolute', borderRadius: 3, borderWidth: 1, borderColor: '#1A1206'},
  core: {position: 'absolute', left: 0, top: 0, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#1A1206'},
});

const sl = themed(() => StyleSheet.create({
  track: {height: H, borderRadius: 14, backgroundColor: C.trkB, borderColor: C.edge, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', justifyContent: 'center'},
  inset: {position: 'absolute', left: 0, right: 0, top: 0, height: 1, backgroundColor: C.mode === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(11,18,32,0.12)'},
  fill: {position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 13, overflow: 'hidden'},
  fillHi: {position: 'absolute', left: 0, right: 0, top: 0, height: 1, opacity: 0.8},
  fillLo: {position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%', opacity: 0.35},
  stripe: {position: 'absolute', top: -20, bottom: -20, width: 8, backgroundColor: 'rgba(255,255,255,0.16)', transform: [{rotate: '28deg'}]},
  streak: {position: 'absolute', height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.75)'},
  label: {position: 'absolute', left: 0, right: 0, color: C.ink, fontFamily: FONT.cond, fontSize: 17, fontWeight: '700', textAlign: 'center', paddingLeft: KNOB + 10, letterSpacing: 0.4},
  chevs: {position: 'absolute', left: KNOB + PAD + 16, flexDirection: 'row', gap: 1},
  ghost: {position: 'absolute', left: PAD + 1, top: PAD, width: KNOB, height: KNOB, borderRadius: 11},
  knobWrap: {position: 'absolute', left: PAD + 1, top: PAD - 1, width: KNOB, height: KNOB + EDGE},
  edge: {position: 'absolute', left: 0, right: 0, top: EDGE, bottom: 0, borderRadius: 11},
  face: {position: 'absolute', left: 0, right: 0, top: 0, height: KNOB, borderRadius: 11, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center'},
  faceTop: {position: 'absolute', left: 0, right: 0, top: 0, height: '50%'},
  faceHi: {position: 'absolute', left: 0, right: 0, top: 0, height: 1, opacity: 0.9},
  gloss: {position: 'absolute', left: 7, top: 5, width: 15, height: 7, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.55)', transform: [{rotate: '-12deg'}]},
  done: {position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10},
  word: {fontFamily: FONT.cond, fontSize: 22, fontWeight: '700', fontStyle: 'italic', letterSpacing: 1},
  burstAt: {position: 'absolute', right: 10, top: H / 2, width: 0, height: 0},
  shard: {position: 'absolute', right: 40, top: H / 2, width: 10, height: 10, borderRadius: 2},
}));

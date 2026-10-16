// Dra för Lastad / Lossad – ett drag i stället för ett tryck, så det aldrig blir fel i fickan.
// Klart när knoppen passerat ~85 % av spåret. Släpps den tidigare glider den tillbaka.
import React, {useMemo, useRef, useState} from 'react';
import {Animated, PanResponder, StyleSheet, Text, View} from 'react-native';
import {C, themed} from './theme';
import {Bi} from './Bi';

const KNOB = 58, PAD = 5;

export default function Slider({label, tone, onDone, style}: {label: string; tone: 'go' | 'ok'; onDone: () => void; style?: any}) {
  const x = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);
  const max = Math.max(1, w - KNOB - PAD * 2);
  const maxRef = useRef(max); maxRef.current = max;
  const doneRef = useRef(onDone); doneRef.current = onDone;
  const pr = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 4,
    onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_e, g) => x.setValue(Math.max(0, Math.min(maxRef.current, g.dx))),
    onPanResponderRelease: (_e, g) => {
      if (g.dx >= maxRef.current * 0.85) {
        Animated.timing(x, {toValue: maxRef.current, duration: 120, useNativeDriver: true}).start(() => {
          doneRef.current();
          setTimeout(() => x.setValue(0), 400);
        });
      } else Animated.spring(x, {toValue: 0, useNativeDriver: true, bounciness: 6}).start();
    },
    onPanResponderTerminate: () => Animated.spring(x, {toValue: 0, useNativeDriver: true}).start(),
  }), [x]);
  const fill = tone === 'go' ? C.accent : C.accent2;
  const onFill = tone === 'go' ? C.onAccent : '#FFFFFF';
  const fade = x.interpolate({inputRange: [0, max * 0.6], outputRange: [1, 0], extrapolate: 'clamp'});
  const grow = x.interpolate({inputRange: [0, max], outputRange: [KNOB, max + KNOB], extrapolate: 'clamp'});
  return (
    <View style={[sl.track, style]} onLayout={e => setW(e.nativeEvent.layout.width)}>
      <Animated.View style={[sl.fill, {backgroundColor: fill, width: grow}]} />
      <Animated.Text style={[sl.label, {opacity: fade}]} numberOfLines={1}>{label}</Animated.Text>
      <Animated.View {...pr.panHandlers} style={[sl.knob, {backgroundColor: fill, transform: [{translateX: x}]}]}>
        <Bi n="chevron-double-right" size={24} color={onFill} />
      </Animated.View>
    </View>
  );
}

const sl = themed(() => StyleSheet.create({
  track: {height: KNOB + PAD * 2, borderRadius: 14, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, justifyContent: 'center', overflow: 'hidden', marginTop: 12},
  fill: {position: 'absolute', left: PAD, top: PAD, bottom: PAD, borderRadius: 10, opacity: 0.22},
  label: {color: C.ink, fontSize: 18, fontWeight: '800', textAlign: 'center', paddingLeft: KNOB, letterSpacing: 0.3},
  knob: {position: 'absolute', left: PAD, top: PAD, width: KNOB, height: KNOB, borderRadius: 10, alignItems: 'center', justifyContent: 'center'},
}));

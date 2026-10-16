/**
 * Ändra körordningen med handen: håll i greppet till höger och dra raden upp eller ner.
 * Lossningar kan inte läggas före sin egen hämtning – då flyttas de till direkt efter.
 * "Smart ordning" lämnar tillbaka ordningen till optimeraren.
 */
import React, {useEffect, useRef, useState} from 'react';
import {Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, themed, whenText} from './theme';
import {Bi} from './Bi';

const H = 62, GAP = 6, SLOT = H + GAP;
type Item = {key: string; kind: 'pickup' | 'drop'; cid: string; st: any; plan: any};

// Lossning före sin hämtning → flytta den direkt efter hämtningen.
export function repair(list: Item[]): {list: Item[]; moved: boolean} {
  const out = [...list]; let moved = false;
  for (const it of [...out]) {
    if (it.kind !== 'drop') continue;
    const di = out.indexOf(it), pi = out.findIndex(x => x.kind === 'pickup' && x.cid === it.cid);
    if (pi > di) { out.splice(di, 1); out.splice(pi, 0, it); moved = true; }
  }
  return {list: out, moved};
}

function DragRow({it, n, index, drag, target, onStart, onMove, onEnd}: any) {
  const dy = useRef(new Animated.Value(0)).current;
  const shift = useRef(new Animated.Value(0)).current;
  const cb = useRef({onStart, onMove, onEnd, index}); cb.current = {onStart, onMove, onEnd, index};
  const pr = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: () => { dy.setValue(0); cb.current.onStart(cb.current.index); },
    onPanResponderMove: (_e, g) => { dy.setValue(g.dy); cb.current.onMove(g.dy); },
    onPanResponderRelease: (_e, g) => { cb.current.onEnd(g.dy); dy.setValue(0); },
    onPanResponderTerminate: (_e, g) => { cb.current.onEnd(g.dy); dy.setValue(0); },
  })).current;
  const me = drag === index;
  // Övriga rader glider undan för den som dras.
  let off = 0;
  if (drag >= 0 && !me) { if (drag < target && index > drag && index <= target) off = -SLOT; if (drag > target && index >= target && index < drag) off = SLOT; }
  useEffect(() => { Animated.timing(shift, {toValue: off, duration: 120, useNativeDriver: true}).start(); }, [off, shift]);
  const pickup = it.kind === 'pickup';
  return (
    <Animated.View style={[r.row, me && r.rowLift, {transform: [{translateY: me ? dy : shift}], zIndex: me ? 10 : 0}]}>
      <Text style={r.n}>{n}</Text>
      <View style={[r.ico, {backgroundColor: pickup ? C.accentSoft : C.okSoft}]}>
        <Bi n={pickup ? 'box-seam-fill' : 'check-circle-fill'} size={13} color={pickup ? C.accentInk : C.accent2} />
      </View>
      <View style={{flex: 1, minWidth: 0}}>
        <Text style={r.who} numberOfLines={1}>{it.st.who || '—'}</Text>
        <Text style={r.meta} numberOfLines={1}>{pickup ? 'Hämta' : 'Lossa'} · {it.st.area || it.st.adr || ''}{it.st.tLatest ? ` · senast ${whenText(it.st.tLatest)}` : ''}</Text>
      </View>
      <View {...pr.panHandlers} style={r.grip} hitSlop={{top: 8, bottom: 8, left: 14, right: 8}}>
        <Bi n="list-ul" size={20} color={C.dim} />
      </View>
    </Animated.View>
  );
}

export default function ReorderSheet({open, items, manual, onClose, onSave}: {open: boolean; items: Item[]; manual: boolean; onClose: () => void; onSave: (keys: string[] | null) => void}) {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<Item[]>(items);
  const [drag, setDrag] = useState(-1);
  const [target, setTarget] = useState(-1);
  const [note, setNote] = useState('');
  useEffect(() => { if (open) { setList(items); setNote(''); } }, [open, items]);
  const len = useRef(0); len.current = list.length;
  const start = useRef(-1);
  const onStart = (i: number) => { start.current = i; setDrag(i); setTarget(i); };
  const onMove = (d: number) => { const t = Math.max(0, Math.min(len.current - 1, start.current + Math.round(d / SLOT))); setTarget(t); };
  const onEnd = (d: number) => {
    const from = start.current, to = Math.max(0, Math.min(len.current - 1, from + Math.round(d / SLOT)));
    setDrag(-1); setTarget(-1); start.current = -1;
    if (from < 0 || from === to) return;
    setList(cur => {
      const next = [...cur]; const [it] = next.splice(from, 1); next.splice(to, 0, it);
      const fixed = repair(next);
      setNote(fixed.moved ? 'En lossning kan inte ligga före sin hämtning – den lades direkt efter.' : '');
      return fixed.list;
    });
  };
  if (!open) return null;
  return (
    <View style={[r.root, {paddingTop: insets.top + 8, paddingBottom: insets.bottom + 10}]}>
      <View style={r.top}>
        <Pressable hitSlop={12} onPress={onClose}><Text style={r.cancel}>Avbryt</Text></Pressable>
        <Text style={r.title}>Ändra ordning</Text>
        <Pressable hitSlop={12} onPress={() => onSave(list.map(x => x.key))}><Text style={r.save}>Spara</Text></Pressable>
      </View>
      <Text style={r.help}>Håll i <Bi n="list-ul" size={13} color={C.dim} /> och dra. Översta raden blir nästa stopp.</Text>
      {!!note && <Text style={r.note}>{note}</Text>}
      <ScrollView scrollEnabled={drag < 0} contentContainerStyle={{paddingHorizontal: 14, paddingBottom: 20}}>
        {list.map((it, i) => (
          <DragRow key={it.key} it={it} n={i + 1} index={i} drag={drag} target={target} onStart={onStart} onMove={onMove} onEnd={onEnd} />
        ))}
      </ScrollView>
      {manual && (
        <Pressable style={r.smart} onPress={() => onSave(null)}>
          <Bi n="arrow-repeat" size={16} color={C.ink} />
          <Text style={r.smartTxt}>Smart ordning igen</Text>
        </Pressable>
      )}
    </View>
  );
}

const r = themed(() => StyleSheet.create({
  root: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, zIndex: 50, elevation: 50},
  top: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 6},
  cancel: {color: C.dim, fontSize: 16, fontWeight: '700'},
  title: {color: C.ink, fontSize: 17, fontWeight: '800'},
  save: {color: C.accentInk, fontSize: 16, fontWeight: '800'},
  help: {color: C.faint, fontSize: 13, paddingHorizontal: 16, marginTop: 4, marginBottom: 10},
  note: {color: C.accentInk, fontSize: 12.5, fontWeight: '700', paddingHorizontal: 16, marginBottom: 8},
  row: {height: H, marginBottom: GAP, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.panel, borderRadius: 10, paddingLeft: 12},
  rowLift: {backgroundColor: C.panel2, elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: {width: 0, height: 3}},
  n: {width: 18, color: C.faint, fontSize: 13, fontWeight: '800', textAlign: 'center'},
  ico: {width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center'},
  who: {color: C.ink, fontSize: 15, fontWeight: '700'},
  meta: {color: C.faint, fontSize: 12, marginTop: 1},
  grip: {width: 52, height: H, alignItems: 'center', justifyContent: 'center'},
  smart: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 14, backgroundColor: C.panel2, borderRadius: 12, paddingVertical: 14},
  smartTxt: {color: C.ink, fontSize: 15, fontWeight: '700'},
}));

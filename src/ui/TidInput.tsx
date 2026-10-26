/**
 * Tid på en order – som Opters "Tid" (timmar + minuter, skickas som minuter totalt).
 *  - Timmar och minuter: två snabba räknare + snabbval.
 *  - Timjobb: starttid och sluttid (och ev. rast) → RUTT räknar ut tiden.
 */
import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {C, themed} from './theme';

const two = (n: number) => String(n).padStart(2, '0');
const hmOf = (t: number) => { const d = new Date(t); return `${two(d.getHours())}:${two(d.getMinutes())}`; };
// "730" "7.30" "07:30" "7" → minuter efter midnatt
export function parseClock(s: string): number | null {
  const t = String(s || '').trim().replace(/[.,;]/g, ':');
  let m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m && /^\d{3,4}$/.test(t)) m = [t, t.slice(0, -2), t.slice(-2)] as any;
  if (!m && /^\d{1,2}$/.test(t)) m = [t, t, '00'] as any;
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}
export const fmtMin = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`);

function Step({v, set, step, max, unit}: {v: number; set: (n: number) => void; step: number; max: number; unit: string}) {
  return (
    <View style={t.stepBox}>
      <Pressable hitSlop={6} style={t.btn} onPress={() => set(Math.max(0, v - step))}><Text style={t.btnT}>−</Text></Pressable>
      <View style={{alignItems: 'center', minWidth: 54}}>
        <TextInput style={t.num} value={String(v)} keyboardType="number-pad" selectTextOnFocus
          onChangeText={x => { const n = parseInt(x.replace(/\D/g, ''), 10); set(Number.isFinite(n) ? Math.min(max, n) : 0); }} />
        <Text style={t.unit}>{unit}</Text>
      </View>
      <Pressable hitSlop={6} style={t.btn} onPress={() => set(Math.min(max, v + step))}><Text style={t.btnT}>+</Text></Pressable>
    </View>
  );
}

export default function TidInput({minutes, onChange, start, initial = 'hm'}: {minutes: number | null; onChange: (m: number | null) => void; start?: number | null; initial?: 'hm' | 'span'}) {
  const [mode, setMode] = useState<'hm' | 'span'>(initial);
  const [h, setH] = useState(minutes != null ? Math.floor(minutes / 60) : 0);
  const [m, setM] = useState(minutes != null ? minutes % 60 : 0);
  const [from, setFrom] = useState(start ? hmOf(start) : '');
  const [to, setTo] = useState(hmOf(Date.now()));
  const [rest, setRest] = useState(0);

  const a = parseClock(from), b = parseClock(to);
  const spanMin = a != null && b != null ? Math.max(0, ((b - a + 1440) % 1440) - rest) : null;
  useEffect(() => {
    if (mode === 'hm') onChange(h * 60 + m > 0 ? h * 60 + m : null);
    else onChange(spanMin && spanMin > 0 ? spanMin : null);
  }, [mode, h, m, spanMin]);


  return (
    <View>
      <View style={t.seg}>
        {([['hm', 'Timmar och minuter'], ['span', 'Timjobb: start – slut']] as const).map(([k, l]) => (
          <Pressable key={k} style={[t.segB, mode === k && t.segOn]} onPress={() => setMode(k)}><Text style={[t.segT, mode === k && t.segTOn]}>{l}</Text></Pressable>
        ))}
      </View>
      {mode === 'hm' ? (
        <>
          <View style={t.row}>
            <Step v={h} set={setH} step={1} max={99} unit="timmar" />
            <Step v={m} set={x => setM(Math.min(59, x))} step={5} max={59} unit="minuter" />
          </View>
          <View style={t.chips}>
            {[15, 30, 45, 60, 90, 120].map(q => (
              <Pressable key={q} style={[t.chip, h * 60 + m === q && t.chipOn]} onPress={() => { setH(Math.floor(q / 60)); setM(q % 60); }}><Text style={[t.chipT, h * 60 + m === q && t.chipTOn]}>{fmtMin(q)}</Text></Pressable>
            ))}
          </View>
        </>
      ) : (
        <>
          <View style={t.row}>
            <View style={{flex: 1}}>
              <Text style={t.lbl}>Start</Text>
              <TextInput style={[t.clock, a == null && from ? t.bad : null]} value={from} onChangeText={setFrom} placeholder="07:00" placeholderTextColor={C.faint} keyboardType="numbers-and-punctuation" />
            </View>
            <View style={{flex: 1}}>
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                <Text style={t.lbl}>Slut</Text>
                <Pressable hitSlop={8} onPress={() => setTo(hmOf(Date.now()))}><Text style={t.now}>Nu</Text></Pressable>
              </View>
              <TextInput style={[t.clock, b == null && to ? t.bad : null]} value={to} onChangeText={setTo} placeholder="15:30" placeholderTextColor={C.faint} keyboardType="numbers-and-punctuation" />
            </View>
          </View>
          <Text style={[t.lbl, {marginTop: 10}]}>Rast som inte räknas</Text>
          <View style={t.chips}>
            {[0, 15, 30, 45, 60].map(q => (
              <Pressable key={q} style={[t.chip, rest === q && t.chipOn]} onPress={() => setRest(q)}><Text style={[t.chipT, rest === q && t.chipTOn]}>{q ? fmtMin(q) : 'Ingen'}</Text></Pressable>
            ))}
          </View>
        </>
      )}
      <Text style={t.sum}>{(mode === 'hm' ? h * 60 + m : spanMin || 0) > 0 ? `= ${fmtMin(mode === 'hm' ? h * 60 + m : spanMin || 0)}` : mode === 'span' ? 'Skriv start och slut, t.ex. 7:00 och 15:30' : 'Välj tid'}</Text>
    </View>
  );
}

const t = themed(() => StyleSheet.create({
  seg: {flexDirection: 'row', gap: 4, backgroundColor: C.panel2, borderRadius: 12, padding: 4},
  segB: {flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center'},
  segOn: {backgroundColor: C.accent},
  segT: {color: C.dim, fontSize: 13, fontWeight: '800'},
  segTOn: {color: C.onAccent},
  row: {flexDirection: 'row', gap: 10, marginTop: 12},
  stepBox: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.panel2, borderRadius: 12, padding: 8},
  btn: {width: 42, height: 42, borderRadius: 21, backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center'},
  btnT: {color: C.ink, fontSize: 22, fontWeight: '800', marginTop: -2},
  num: {color: C.ink, fontSize: 26, fontWeight: '900', textAlign: 'center', padding: 0, width: 64},
  unit: {color: C.dim, fontSize: 11.5, fontWeight: '700'},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10},
  chip: {backgroundColor: C.panel2, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12},
  chipOn: {backgroundColor: C.accent},
  chipT: {color: C.ink, fontSize: 13, fontWeight: '700'},
  chipTOn: {color: C.onAccent},
  lbl: {color: C.dim, fontSize: 12, fontWeight: '800', marginBottom: 4},
  clock: {backgroundColor: C.panel2, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, color: C.ink, fontSize: 24, fontWeight: '900', textAlign: 'center'},
  bad: {borderWidth: 2, borderColor: C.bad},
  now: {color: C.accentInk, fontSize: 13, fontWeight: '900', marginBottom: 4},
  sum: {color: C.ink, fontSize: 15, fontWeight: '900', marginTop: 12},
}));

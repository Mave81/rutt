/**
 * Tid på en order – som Opters "Tid" (timmar + minuter, skickas som minuter totalt).
 *  - Timmar och minuter: två snabba räknare + snabbval.
 *  - Timjobb: starttid och sluttid (och ev. rast) → RUTT räknar ut tiden.
 */
import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {C, themed, FONT, R} from './theme';
import {DurationWheel, TimeSheet} from './Wheel';

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

export default function TidInput({minutes, onChange, start, end, initial = 'hm', bg}: {minutes: number | null; onChange: (m: number | null) => void; start?: number | null; end?: number | null; initial?: 'hm' | 'span'; bg?: string}) {
  const [mode, setMode] = useState<'hm' | 'span'>(initial);
  const [h, setH] = useState(minutes != null ? Math.floor(minutes / 60) : 0);
  const [m, setM] = useState(minutes != null ? minutes % 60 : 0);
  const [from, setFrom] = useState(start ? hmOf(start) : '');
  const [to, setTo] = useState(hmOf(end || Date.now()));
  const [rest, setRest] = useState(0);

  const a = parseClock(from), b = parseClock(to);
  const spanMin = a != null && b != null ? Math.max(0, ((b - a + 1440) % 1440) - rest) : null;
  useEffect(() => {
    if (mode === 'hm') onChange(h * 60 + m > 0 ? h * 60 + m : null);
    else onChange(spanMin && spanMin > 0 ? spanMin : null);
  }, [mode, h, m, spanMin]);


  const [sheet, setSheet] = useState<null | 'from' | 'to'>(null);
  const msOf = (hm: string) => { const x = parseClock(hm); if (x == null) return null; const d = new Date(); d.setHours(Math.floor(x / 60), x % 60, 0, 0); return d.getTime(); };
  return (
    <View>
      <View style={t.seg}>
        {([['hm', 'Timmar och minuter'], ['span', 'Timjobb: start – slut']] as const).map(([k, l]) => (
          <Pressable key={k} style={[t.segB, mode === k && t.segOn]} onPress={() => setMode(k)}><Text style={[t.segT, mode === k && t.segTOn]}>{l}</Text></Pressable>
        ))}
      </View>
      {mode === 'hm' ? (
        <>
          {/* Hjul som väckarklockan: scrolla timmar och minuter, eller tryck på siffran och skriv */}
          <View style={{marginTop: 10}}><DurationWheel value={h * 60 + m} onChange={x => { setH(Math.floor(x / 60)); setM(x % 60); }} bg={bg} /></View>
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
              <View style={t.lblRow}>
                <Text style={t.lbl}>Start</Text>
                <Pressable hitSlop={8} onPress={() => setFrom(hmOf(Date.now()))}><Text style={t.now}>Nu</Text></Pressable>
              </View>
              <Pressable style={t.clock} onPress={() => setSheet('from')} accessibilityLabel="Starttid, tryck för att ändra"><Text style={[t.clockT, !from && {color: C.faint}]}>{from || '--:--'}</Text></Pressable>
            </View>
            <View style={{flex: 1}}>
              <View style={t.lblRow}>
                <Text style={t.lbl}>Slut</Text>
                <Pressable hitSlop={8} onPress={() => setTo(hmOf(Date.now()))}><Text style={t.now}>Nu</Text></Pressable>
              </View>
              <Pressable style={t.clock} onPress={() => setSheet('to')} accessibilityLabel="Sluttid, tryck för att ändra"><Text style={[t.clockT, !to && {color: C.faint}]}>{to || '--:--'}</Text></Pressable>
            </View>
          </View>
          <Text style={[t.lbl, {marginTop: 12}]}>Rast som inte räknas</Text>
          <View style={t.chips}>
            {[0, 15, 30, 45, 60].map(q => (
              <Pressable key={q} style={[t.chip, rest === q && t.chipOn]} onPress={() => setRest(q)}><Text style={[t.chipT, rest === q && t.chipTOn]}>{q ? fmtMin(q) : 'Ingen'}</Text></Pressable>
            ))}
          </View>
          <TimeSheet open={!!sheet} title={sheet === 'from' ? 'Starttid' : 'Sluttid'} value={sheet === 'from' ? msOf(from) : msOf(to)} onClose={() => setSheet(null)}
            onDone={x => { const v = hmOf(x); if (sheet === 'from') setFrom(v); else setTo(v); setSheet(null); }} />
        </>
      )}
      <Text style={t.sum}>{(mode === 'hm' ? h * 60 + m : spanMin || 0) > 0 ? `= ${fmtMin(mode === 'hm' ? h * 60 + m : spanMin || 0)}` : mode === 'span' ? 'Tryck på Start och Slut och välj tiden' : 'Välj tid'}</Text>
    </View>
  );
}

const t = themed(() => StyleSheet.create({
  seg: {flexDirection: 'row', gap: 4, backgroundColor: C.panel2, borderRadius: R, padding: 3},
  segB: {flex: 1, paddingVertical: 9, borderRadius: 4, alignItems: 'center'},
  segOn: {backgroundColor: C.accent},
  segT: {color: C.dim, fontFamily: FONT.cond, fontSize: 15, fontWeight: '700'},
  segTOn: {color: C.onAccent},
  row: {flexDirection: 'row', gap: 10, marginTop: 12},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10},
  chip: {backgroundColor: C.panel2, borderRadius: R, paddingVertical: 8, paddingHorizontal: 12},
  chipOn: {backgroundColor: C.accent},
  chipT: {color: C.ink, fontFamily: FONT.cond, fontSize: 15, fontWeight: '600'},
  chipTOn: {color: C.onAccent},
  lblRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4},
  lbl: {color: C.dim, fontSize: 12.5, fontWeight: '700'},
  clock: {backgroundColor: C.panel2, borderRadius: R, height: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.edge},
  clockT: {color: C.ink, fontFamily: FONT.cond, fontSize: 26, fontWeight: '700'},
  now: {color: C.accentInk, fontFamily: FONT.cond, fontSize: 14.5, fontWeight: '700'},
  sum: {color: C.ink, fontFamily: FONT.cond, fontSize: 17, fontWeight: '700', marginTop: 12},
}));

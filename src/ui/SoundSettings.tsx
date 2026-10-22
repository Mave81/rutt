/**
 * Inställningar → Notisljud. Ett ljud per händelse, ▶ spelar upp, "Eget ljud" öppnar telefonens ljudväljare.
 */
import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {C, themed, FONT, R} from './theme';
import {Bi} from './Bi';
import {Sheet} from './parts';
import * as SND from '../sounds';

export default function SoundSettings() {
  const [, setVer] = useState(0);
  const [open, setOpen] = useState<SND.SoundEvent | null>(null);
  const cur = SND.allSounds();
  const ev = SND.SOUND_EVENTS.find(e => e.k === open);
  return (
    <View>
      {SND.SOUND_EVENTS.map(e => (
        <Pressable key={e.k} style={st.row} onPress={() => setOpen(e.k)} android_ripple={{color: C.edge}}>
          <View style={{flex: 1, minWidth: 0}}>
            <Text style={st.t}>{e.label}</Text>
            <Text style={st.s} numberOfLines={1}>{e.sub}</Text>
          </View>
          <Text style={st.v} numberOfLines={1}>{SND.soundLabel(cur[e.k] || SND.DEFAULT_SOUNDS[e.k])}</Text>
          <Bi n="chevron-right" size={13} color={C.faint} />
        </Pressable>
      ))}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={ev ? `Ljud – ${ev.label}` : ''} sub="Tryck på ▶ för att lyssna" scroll>
        {open ? SND.SOUNDS.map(snd => {
          const on = (cur[open] || SND.DEFAULT_SOUNDS[open]) === snd.k;
          return (
            <View key={snd.k} style={[st.opt, on && {backgroundColor: C.accentSoft}]}>
              <Pressable style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48}} onPress={() => { SND.setSound(open, snd.k); setVer(v => v + 1); SND.playSound(snd.k); }}>
                <View style={[st.radio, on && st.radioOn]}>{on ? <Bi n="check2" size={13} color="#000000" /> : null}</View>
                <Text style={st.optT}>{snd.label}</Text>
              </Pressable>
              {snd.k !== 'tyst' ? <Pressable hitSlop={8} style={st.play} onPress={() => SND.playSound(snd.k)}><Bi n="play-circle" size={20} color={C.ink} /></Pressable> : null}
            </View>
          );
        }) : null}
        {open ? (
          <Pressable style={st.opt} onPress={() => { const e = open; SND.pickCustom(e).then(k => { if (k) { setVer(v => v + 1); SND.playSound(k); } }); }}>
            <View style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48}}>
              <View style={[st.radio, (cur[open] || '').startsWith('custom:') && st.radioOn]}>{(cur[open] || '').startsWith('custom:') ? <Bi n="check2" size={13} color="#000000" /> : null}</View>
              <View style={{flex: 1}}>
                <Text style={st.optT}>Eget ljud från telefonen…</Text>
                {(cur[open] || '').startsWith('custom:') ? <Text style={st.s}>{SND.soundLabel(cur[open])}</Text> : null}
              </View>
            </View>
          </Pressable>
        ) : null}
        <Text style={st.note}>Android sparar ljudet per notiskanal. Varje ljud har därför en egen kanal ("RUTT · Pling" osv.) i telefonens inställningar för RUTT.</Text>
      </Sheet>
    </View>
  );
}

const st = themed(() => StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.edge},
  t: {color: C.ink, fontFamily: FONT.cond, fontSize: 16.5, fontWeight: '600'},
  s: {color: C.dim, fontSize: 12.5, marginTop: 1},
  v: {color: C.accentInk, fontFamily: FONT.cond, fontSize: 15, fontWeight: '700', maxWidth: 130},
  opt: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, borderRadius: R, marginTop: 2},
  radio: {width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.faint, alignItems: 'center', justifyContent: 'center'},
  radioOn: {backgroundColor: C.accent, borderColor: C.accent},
  optT: {color: C.ink, fontFamily: FONT.cond, fontSize: 17, fontWeight: '600'},
  play: {width: 44, height: 44, borderRadius: R, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center'},
  note: {color: C.faint, fontSize: 12, lineHeight: 17, marginTop: 12},
}));

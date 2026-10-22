/**
 * Opter-chatten.
 *  - Nummer i ett meddelande blir blå: tryck = ring.
 *  - Håll in ett meddelande: kopiera text, kopiera/ring/spara numret (namnförslag ur texten), lägg numret på jobbet.
 *  - Snabbsvar ovanför skrivrutan. Smileys tas bort innan det skickas – Opter-chatten visar dem inte.
 *  - Meddelanden som hör till en order (FTM_SHI_Id) får ordernumret under bubblan.
 */
import React, {useEffect, useState} from 'react';
import {FlatList, Keyboard, Linking, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {C, themed, hhmm, prettyPhone, slack, FONT, R} from './theme';
import {Bi} from './Bi';
import {Sheet} from './parts';
import {copyText, addContact} from '../sounds';

import {QUICK, stripEmoji, hasEmoji, splitPhones, nameFor} from '../chat';
export {QUICK, stripEmoji, hasEmoji, splitPhones, nameFor};

type Order = {cid: string; orderNo: string; who: string; shiId?: number};
export default function ChatView({msgs, msgText, setMsgText, onSend, onRetry, orders = [], onAddNum, onFlash}: {
  msgs: any[]; msgText: string; setMsgText: (t: string) => void; onSend: () => void; onRetry: (m: any) => void;
  orders?: Order[]; onAddNum?: (cid: string, c: {label: string; num: string}) => void; onFlash?: (t: string) => void;
}) {
  const stamp = (m: any) => {
    const t = m.created ? hhmm(m.created) : '';
    const sameDay = m.created && new Date().toDateString() === m.created.toDateString();
    const d = m.created && !sameDay ? `${String(m.created.getDate()).padStart(2, '0')}/${m.created.getMonth() + 1} ` : '';
    return m.received ? `${m.from || ''}${m.from ? ' · ' : ''}${d}${t}` : `${d}${t}`;
  };
  const data = [...msgs].reverse();
  const [kb, setKb] = useState(0);
  const [held, setHeld] = useState<any>(null);
  const [save, setSave] = useState<{num: string; name: string; text: string} | null>(null);
  const [pickJob, setPickJob] = useState<{num: string; name: string} | null>(null);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => setKb(e.endCoordinates?.height || 0));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const lift = kb > 0 ? kb + 64 : 0;
  const flash = (t: string) => onFlash && onFlash(t);
  const orderOf = (m: any) => (m && m.shiId ? orders.find(o => o.shiId === m.shiId) || null : null);
  const nums = held ? splitPhones(held.text).filter(x => x.num) : [];
  const putOnJob = (num: string, name: string, m: any) => {
    const o = orderOf(m);
    if (o && onAddNum) { onAddNum(o.cid, {label: name || 'Nummer', num}); return; }
    setPickJob({num, name});
  };
  const emojiWarn = hasEmoji(msgText);

  return (
    <View style={{flex: 1, paddingBottom: lift}}>
      {msgs.length === 0 ? (
        <View style={{flex: 1, padding: 18}}><Text style={c.empty}>Inga meddelanden.</Text></View>
      ) : (
        <FlatList
          style={{flex: 1}}
          contentContainerStyle={{padding: 12, paddingTop: 16}}
          data={data}
          inverted
          keyboardShouldPersistTaps="handled"
          keyExtractor={(_, i) => String(i)}
          renderItem={({item}) => {
            const failed = item.local && item.state === 'failed';
            const status = item.received ? '' : item.local
              ? (item.state === 'sending' ? '  Skickar…' : failed ? '  Ej skickat – tryck för att försöka igen' : item.state === 'stored' ? '  ✓ Mottaget av Opter' : '  Skickat – väntar på kvitto')
              : (item.confirmed ? '  ✓✓ Läst' : item.serverId ? '  ✓ Mottaget av Opter' : '  ✓ Skickat');
            const o = orderOf(item);
            return (
              <Pressable onPress={() => failed && onRetry(item)} onLongPress={() => setHeld(item)} delayLongPress={350} style={[c.wrap, item.received ? c.wL : c.wR]}>
                <View style={[c.bub, item.received ? c.bIn : c.bOut, item.local && item.state === 'sending' && {opacity: 0.6}, failed && {borderWidth: 1, borderColor: C.bad}, held === item && c.held]}>
                  <Text style={c.txt} textBreakStrategy="simple" android_hyphenationFrequency="none">
                    {splitPhones(slack(item.text)).map((sg, i) => (sg.num
                      ? <Text key={i} style={c.tel} onPress={() => Linking.openURL(`tel:${sg.num}`).catch(() => {})} onLongPress={() => setHeld(item)}>{sg.t}</Text>
                      : <Text key={i}>{sg.t}</Text>))}
                  </Text>
                </View>
                <Text style={[c.stamp, item.received ? {marginLeft: 4} : {textAlign: 'right', marginRight: 4}, failed && {color: C.bad}]}>
                  {stamp(item)}{o ? <Text style={c.ord}>{'  ·  order '}{o.orderNo}</Text> : null}{status}
                </Text>
              </Pressable>
            );
          }}
        />
      )}
      <View style={c.quick}>
        {QUICK.map(q => (
          <Pressable key={q} style={c.qb} onPress={() => setMsgText(msgText.trim() ? `${msgText.trim()} ${q}` : q)} android_ripple={{color: C.edge}}>
            <Text style={c.qt}>{q}</Text>
          </Pressable>
        ))}
      </View>
      {emojiWarn ? <Text style={c.warn}>Smileys syns inte i Opter – de tas bort när du skickar.</Text> : null}
      <View style={c.row}>
        <TextInput style={c.input} value={msgText} onChangeText={setMsgText} placeholder="Skriv till kontoret…" placeholderTextColor={C.faint} multiline />
        <Pressable style={c.send} onPress={onSend}><Bi n="send-fill" size={18} color="#000000" /></Pressable>
      </View>

      <Sheet open={!!held} onClose={() => setHeld(null)}>
        {held ? (
          <View>
            <Text style={c.preview} numberOfLines={3}>{held.text}</Text>
            <Item icon="copy" t="Kopiera text" go={() => { const t = held.text; setHeld(null); copyText(t).then(ok => flash(ok ? 'Kopierat' : 'Kunde inte kopiera')); }} />
            {nums.map(n => {
              const name = nameFor(held.text, n.num!);
              return (
                <View key={n.num}>
                  <Text style={c.numHead}>{prettyPhone(n.num!)}{name ? `  ·  ${name}` : ''}</Text>
                  <Item icon="telephone-fill" t="Ring" go={() => { setHeld(null); Linking.openURL(`tel:${n.num}`).catch(() => {}); }} />
                  <Item icon="copy" t="Kopiera numret" go={() => { setHeld(null); copyText(prettyPhone(n.num!)).then(ok => flash(ok ? 'Numret kopierat' : 'Kunde inte kopiera')); }} />
                  <Item icon="person-plus-fill" t="Spara i telefonboken" s={name ? `Namnförslag: ${name}` : 'Du skriver namnet'} go={() => { const t = held.text; setHeld(null); setSave({num: n.num!, name, text: t}); }} />
                  {onAddNum ? <Item icon="telephone-plus-fill" t="Lägg numret på jobbet" s={orderOf(held) ? `Order ${orderOf(held)!.orderNo} · syns under Ring` : 'Välj order'} go={() => { const m = held; setHeld(null); putOnJob(n.num!, name, m); }} /> : null}
                </View>
              );
            })}
          </View>
        ) : null}
      </Sheet>

      <Sheet open={!!save} onClose={() => setSave(null)} title="Spara i telefonboken" sub="Telefonens egen Ny kontakt öppnas med namn och nummer ifyllda">
        {save ? (
          <View style={{gap: 8, marginTop: 4}}>
            <TextInput style={c.field} value={save.name} onChangeText={t => setSave({...save, name: t})} placeholder="Namn" placeholderTextColor={C.faint} autoFocus={!save.name} />
            <Text style={c.fieldNum}>{prettyPhone(save.num)}</Text>
            <Pressable style={[c.big, !save.name.trim() && {opacity: 0.4}]} disabled={!save.name.trim()} onPress={() => { const x = save; setSave(null); addContact(x.name.trim(), x.num, 'Sparat från RUTT').then(ok => { if (!ok) flash('Kunde inte öppna kontakter'); }).catch(() => flash('Kunde inte öppna kontakter')); }}>
              <Text style={c.bigT}>Öppna Ny kontakt</Text>
            </Pressable>
          </View>
        ) : null}
      </Sheet>

      <Sheet open={!!pickJob} onClose={() => setPickJob(null)} title="Vilket jobb?" sub={pickJob ? `${prettyPhone(pickJob.num)}${pickJob.name ? ' · ' + pickJob.name : ''}` : ''} scroll>
        {orders.length === 0 ? <Text style={c.empty}>Inga jobb idag.</Text> : null}
        {orders.map(o => (
          <Pressable key={o.cid} style={c.jobRow} onPress={() => { const p = pickJob!; setPickJob(null); onAddNum && onAddNum(o.cid, {label: p.name || 'Nummer', num: p.num}); }}>
            <Text style={c.jobNo}>{o.orderNo}</Text>
            <Text style={c.jobWho} numberOfLines={1}>{o.who}</Text>
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

function Item({icon, t, s, go}: {icon: any; t: string; s?: string; go: () => void}) {
  return (
    <Pressable style={c.item} onPress={go} android_ripple={{color: C.edge}}>
      <Bi n={icon} size={17} color={C.dim} />
      <View style={{flex: 1}}><Text style={c.itemT}>{t}</Text>{s ? <Text style={c.itemS}>{s}</Text> : null}</View>
    </Pressable>
  );
}

const c = themed(() => StyleSheet.create({
  empty: {color: C.dim, fontSize: 15},
  wrap: {marginBottom: 10, maxWidth: '84%'},
  wL: {alignSelf: 'flex-start'},
  wR: {alignSelf: 'flex-end'},
  bub: {borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9},
  bIn: {backgroundColor: C.bubbleIn, borderBottomLeftRadius: 3},
  bOut: {backgroundColor: C.bubbleOut, borderBottomRightRadius: 3},
  held: {borderWidth: 2, borderColor: C.accent},
  txt: {color: C.ink, fontSize: 15.5, lineHeight: 21},
  tel: {color: C.people, fontFamily: FONT.mono, fontSize: 14.5, fontWeight: '600', textDecorationLine: 'underline'},
  stamp: {color: C.faint, fontSize: 11.5, marginTop: 3},
  ord: {color: C.faint, fontFamily: FONT.mono, fontSize: 11.5},
  quick: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingTop: 8},
  qb: {backgroundColor: C.panel, borderRadius: R, paddingHorizontal: 11, height: 34, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: C.edge},
  qt: {color: C.ink, fontFamily: FONT.cond, fontSize: 15, fontWeight: '600'},
  warn: {color: C.accentInk, fontSize: 12.5, paddingHorizontal: 14, paddingTop: 6},
  row: {flexDirection: 'row', gap: 8, padding: 12, alignItems: 'flex-end'},
  input: {flex: 1, backgroundColor: C.panel, borderColor: C.edge, borderWidth: 1, borderRadius: R, color: C.ink, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, maxHeight: 120},
  send: {backgroundColor: C.accent, borderRadius: R, width: 46, height: 46, alignItems: 'center', justifyContent: 'center'},
  preview: {color: C.dim, fontSize: 14, lineHeight: 19, marginBottom: 6, backgroundColor: C.panel2, borderRadius: R, padding: 10},
  numHead: {color: C.faint, fontFamily: FONT.cond, fontSize: 13, fontWeight: '700', letterSpacing: 0.8, marginTop: 12, marginBottom: 2},
  item: {flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.edge},
  itemT: {color: C.ink, fontFamily: FONT.cond, fontSize: 17, fontWeight: '600'},
  itemS: {color: C.dim, fontSize: 13, marginTop: 1},
  field: {backgroundColor: C.panel2, color: C.ink, borderRadius: R, paddingHorizontal: 12, height: 48, fontSize: 17},
  fieldNum: {color: C.ink, fontFamily: FONT.mono, fontSize: 17, paddingHorizontal: 4},
  big: {height: 50, borderRadius: R, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4},
  bigT: {color: '#000000', fontFamily: FONT.cond, fontSize: 17, fontWeight: '700'},
  jobRow: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.edge},
  jobNo: {color: C.faint, fontFamily: FONT.mono, fontSize: 13, width: 70},
  jobWho: {flex: 1, color: C.ink, fontFamily: FONT.cond, fontSize: 16.5, fontWeight: '600'},
}));

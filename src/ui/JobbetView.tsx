/**
 * Jobbet (förslag C+, valt 17 okt): Kontoret-fliken blir Jobbet.
 *  - Överst alltid: Ring trafikledningen och Ring chefen (Joel).
 *  - Chatt: Kontoret (Opter-chatten, som förut) överst, under den SMS-trådar med förare och egna kontakter.
 *  - Folk: Lägg till kontakt · Egna (verkstad, lager, kunder …) · Förare från Opter (aktiva förare, samma lista som "Ge bort").
 * Förarnas nummer finns inte i Opter – du lägger in dem en gång (skriv eller välj ur kontakterna). Allt sparas i telefonen.
 * SMS: vanliga SMS via telefonen (RuttSms). Opter-meddelanden är orange, SMS blå, så det syns vilken väg det går.
 * Chattmeddelanden (RCS) och bilder (MMS) syns inte här – "Öppna i SMS-appen" finns alltid.
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AppState, DeviceEventEmitter, FlatList, Linking, NativeModules, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {C, themed, hhmm, prettyPhone, slack} from './theme';
import {Sheet, useKeyboardLift} from './parts';
import {Bi} from './Bi';
import {loadJSON, saveJSON} from '../store';

const SMS = NativeModules.RuttSms;
const BOOK_KEY = 'rutt.jobbet.v1';
export const numKey = (n: any) => { const d = String(n || '').replace(/\D/g, ''); return d.length > 9 ? d.slice(-9) : d; };
const ini = (s: string) => String(s || '').replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const shortName = (s: string) => String(s || '').replace(/\s*\(.*?\)/g, '').trim();
const KINDS = ['Verkstad', 'Lager', 'Kund', 'Kollega', 'Annat'];
const KIND_ICON: Record<string, any> = {Verkstad: 'wrench', Lager: 'box-seam', Kund: 'building', Kollega: 'person-fill', Annat: 'person-fill'};
const QUICK = ['Var är du?', 'Ring mig när du kan', 'Kan du ta en order åt mig?'];

type Book = {nums: Record<string, string>; own: {id: string; name: string; kind: string; num: string}[]; chef: string | null; tl: string; seen: Record<string, number>; smsAsked?: boolean; smsOpened?: number};
const EMPTY: Book = {nums: {}, own: [], chef: null, tl: '', seen: {}};
export type Contact = {name: string; num: string; kind: 'driver' | 'own' | 'tl'; sub?: string; ownId?: string};

/* ---- Tillståndet bor i App så olästa SMS syns i menyn även på andra flikar ---- */
export function useJobbet({team, me, enabled}: {team: {drivers: {name: string}[]; dispatchPhone: string}; me: string; enabled: boolean}) {
  const [book, setBook] = useState<Book>(EMPTY);
  const loaded = useRef(false);
  useEffect(() => { loadJSON(BOOK_KEY, EMPTY).then((v: any) => { setBook({...EMPTY, ...(v || {})}); loaded.current = true; }); }, []);
  const save = (f: (b: Book) => Book) => setBook(b => { const n = f(b); if (loaded.current) saveJSON(BOOK_KEY, n); return n; });

  const [perm, setPerm] = useState<'?' | 'ja' | 'nej'>('?');
  const [msgs, setMsgs] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const drivers = useMemo(() => team.drivers.filter(d => d.name && d.name !== me), [team, me]);
  // Chef: det du valt, annars Joel om han finns i Opters lista (Joel är chef).
  const chef = book.chef !== null ? book.chef : (drivers.find(d => /^joel\b/i.test(d.name)) || {name: ''}).name || '';
  const tl = book.tl || team.dispatchPhone || '';
  const tlFromOpter = !book.tl && !!team.dispatchPhone;
  const contacts: Contact[] = useMemo(() => [
    ...book.own.map(o => ({name: o.name, num: o.num, kind: 'own' as const, sub: o.kind, ownId: o.id})),
    ...drivers.map(d => ({name: d.name, num: book.nums[d.name] || '', kind: 'driver' as const})),
  ], [book, drivers]);
  const withNum = contacts.filter(c => numKey(c.num).length >= 6);

  const checkPerm = useCallback(async () => {
    if (Platform.OS !== 'android' || !SMS) { setPerm('nej'); return false; }
    try {
      const r = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
      const s = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.SEND_SMS);
      setPerm(r && s ? 'ja' : '?');
      return r && s;
    } catch (e) { return false; }
  }, []);
  // Tillbaka från telefonens inställningar → kolla igen direkt.
  useEffect(() => { checkPerm(); const sub = AppState.addEventListener('change', st => { if (st === 'active') checkPerm(); }); return () => sub.remove(); }, [checkPerm]);
  const askPerm = async () => {
    save(b => ({...b, smsAsked: true}));
    if (Platform.OS !== 'android' || !SMS) { setPerm('nej'); return false; }
    try {
      const r = await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.SEND_SMS, PermissionsAndroid.PERMISSIONS.READ_SMS, PermissionsAndroid.PERMISSIONS.RECEIVE_SMS]);
      const ok = r[PermissionsAndroid.PERMISSIONS.SEND_SMS] === 'granted' && r[PermissionsAndroid.PERMISSIONS.READ_SMS] === 'granted';
      setPerm(ok ? 'ja' : 'nej');
      return ok;
    } catch (e) { setPerm('nej'); return false; }
  };

  const numsKey = withNum.map(c => numKey(c.num)).sort().join(',');
  const refresh = useCallback(async () => {
    if (perm !== 'ja' || !SMS || !numsKey) return;
    try { const list = await SMS.read(numsKey.split(','), 1500); setMsgs(list || []); } catch (e) {}
  }, [perm, numsKey]);
  useEffect(() => {
    if (perm !== 'ja' || !enabled) return;
    SMS && SMS.listen().catch(() => {});
    refresh();
    const sub = DeviceEventEmitter.addListener('ruttSms', (ev: any) => {
      if (ev.type === 'in') setTimeout(refresh, 900); // Android har sparat SMS:et strax efter
      else if (ev.type === 'sent' || ev.type === 'delivered') {
        const id = String(ev.id || '').split('#')[0];
        setPending(p => p.map(x => (x.id === id ? {...x, state: ev.type === 'delivered' ? 'delivered' : ev.ok ? 'sent' : 'failed'} : x)));
        if (ev.type === 'sent') setTimeout(refresh, 700);
      }
    });
    const t = setInterval(refresh, 30000);
    return () => { sub.remove(); clearInterval(t); };
  }, [perm, enabled, refresh]);

  // Trådar per nummer: telefonens SMS + det som skickas just nu (tills telefonens egen kopia finns).
  const threads = useMemo(() => {
    const by: Record<string, any[]> = {};
    for (const m of msgs) (by[m.key] = by[m.key] || []).push({id: m.id, body: m.body, date: m.date, out: m.type !== 1, failed: m.type === 5, read: m.read});
    for (const p of pending) {
      const list = by[p.key] || [];
      const dup = list.some(m => m.out && m.body === p.body && Math.abs(m.date - p.date) < 5 * 60000);
      if (!dup || p.state === 'failed') (by[p.key] = list).push({id: p.id, body: p.body, date: p.date, out: true, state: p.state, local: true});
      else { const m = list.find(x => x.out && x.body === p.body && Math.abs(x.date - p.date) < 5 * 60000); if (m && p.state === 'delivered') m.state = 'delivered'; }
    }
    for (const k of Object.keys(by)) by[k].sort((a, b) => a.date - b.date);
    return by;
  }, [msgs, pending]);
  const unreadOf = (key: string) => (threads[key] || []).filter(m => !m.out && m.date > (book.seen[key] || 0)).length;
  const smsUnread = withNum.reduce((n, c) => n + unreadOf(numKey(c.num)), 0);
  const markSeen = (key: string) => save(b => ({...b, seen: {...b.seen, [key]: Date.now()}}));

  async function send(c: Contact, text: string) {
    const body = text.trim(); if (!body) return;
    const key = numKey(c.num);
    if (perm !== 'ja' || !SMS) { Linking.openURL(`sms:${c.num}?body=${encodeURIComponent(body)}`).catch(() => {}); return; }
    const id = 'r' + Date.now() + Math.random().toString(36).slice(2, 6);
    setPending(p => [...p, {id, key, body, date: Date.now(), state: 'sending'}]);
    try { await SMS.send(c.num, body, id); } catch (e) { setPending(p => p.map(x => (x.id === id ? {...x, state: 'failed'} : x))); }
  }
  return {book, save, perm, askPerm, contacts, withNum, drivers, chef, tl, tlFromOpter, threads, unreadOf, smsUnread, markSeen, send, refresh};
}

/* ---- Fliken ---- */
export default function JobbetView({j, opterView, opterUnread, opterLast, onOpenOpter, live}: {
  j: ReturnType<typeof useJobbet>; opterView: React.ReactNode; opterUnread: number; opterLast: any; onOpenOpter: () => void; live: boolean;
}) {
  const [seg, setSeg] = useState<'chatt' | 'folk'>('chatt');
  const [open, setOpen] = useState<null | 'opter' | Contact>(null);
  const [numFor, setNumFor] = useState<Contact | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [menu, setMenu] = useState<Contact | null>(null);
  const [setup, setSetup] = useState(false);
  const dial = (n: string) => Linking.openURL(`tel:${n}`).catch(() => {});
  const chefC = j.contacts.find(c => c.name === j.chef) || null;
  const tlC: Contact = {name: 'Trafikledningen', num: j.tl, kind: 'tl'};

  const strip = (
    <View style={x.strip}>
      <Pressable style={x.stripBtn} onPress={() => (j.tl ? dial(j.tl) : setNumFor(tlC))} onLongPress={() => setNumFor(tlC)}>
        <View style={[x.stripIco, {backgroundColor: C.accent}]}><Bi n="headset" size={16} color={C.onAccent} /></View>
        <View style={{flex: 1, minWidth: 0}}><Text style={x.stripT} numberOfLines={1}>Trafikledningen</Text><Text style={x.stripS} numberOfLines={1}>{j.tl ? prettyPhone(j.tl) : 'Lägg till nummer'}</Text></View>
      </Pressable>
      <Pressable style={x.stripBtn} onPress={() => (chefC && chefC.num ? dial(chefC.num) : chefC ? setNumFor(chefC) : setSeg('folk'))} onLongPress={() => chefC && setMenu(chefC)}>
        <View style={[x.stripIco, {backgroundColor: C.peopleSoft}]}><Bi n="star-fill" size={15} color={C.people} /></View>
        <View style={{flex: 1, minWidth: 0}}><Text style={x.stripT} numberOfLines={1}>{chefC ? `${shortName(chefC.name).split(' ')[0]} · chef` : 'Chef'}</Text><Text style={x.stripS} numberOfLines={1}>{chefC ? (chefC.num ? prettyPhone(chefC.num) : 'Lägg till nummer') : 'Välj under Folk'}</Text></View>
      </Pressable>
    </View>
  );

  // ---- Öppen tråd ----
  if (open === 'opter') {
    return (
      <View style={{flex: 1}}>
        <View style={x.chd}>
          <Pressable hitSlop={12} onPress={() => setOpen(null)}><Bi n="chevron-left" size={18} color={C.dim} /></Pressable>
          <View style={[x.av, {backgroundColor: C.accentSoft}]}><Bi n="building" size={16} color={C.accentInk} /></View>
          <View style={{flex: 1}}><Text style={x.pn}>Kontoret</Text><View style={[x.via, {backgroundColor: C.accentSoft}]}><Text style={[x.viaT, {color: C.accentInk}]}>VIA OPTER</Text></View></View>
        </View>
        {opterView}
      </View>
    );
  }
  if (setup && j.perm !== 'ja') return (
    <View style={{flex: 1}}>
      <View style={x.chd}><Pressable hitSlop={12} onPress={() => setSetup(false)}><Bi n="chevron-left" size={18} color={C.dim} /></Pressable><Text style={x.pn}>SMS i RUTT</Text></View>
      <SmsSetup j={j} />
    </View>
  );
  if (open) return <SmsThread j={j} c={open} onBack={() => setOpen(null)} onDial={dial} />;

  const tagRow = (c: Contact, onPress: () => void) => {
    const key = numKey(c.num), th = j.threads[key] || [], last = th[th.length - 1], un = j.unreadOf(key);
    return (
      <Pressable key={c.kind + c.name} style={x.row} onPress={onPress}>
        <Avatar c={c} chef={c.name === j.chef} />
        <View style={{flex: 1, minWidth: 0}}>
          <View style={x.rowTop}><Text style={x.pn} numberOfLines={1}>{shortName(c.name)}</Text><View style={[x.via, {backgroundColor: C.peopleSoft}]}><Text style={[x.viaT, {color: C.people}]}>SMS</Text></View><View style={{flex: 1}} /><Text style={x.when}>{last ? whenShort(last.date) : ''}</Text></View>
          <Text style={[x.ps, un ? {color: C.ink, fontWeight: '800'} : null]} numberOfLines={1}>{last ? (last.out ? 'Du: ' : '') + last.body : 'Inga SMS än – tryck för att skriva'}</Text>
        </View>
        {un ? <View style={x.badge}><Text style={x.badgeT}>{un}</Text></View> : null}
      </Pressable>
    );
  };

  const chatt = () => {
    const list = [...j.withNum].map(c => { const th = j.threads[numKey(c.num)] || []; return {c, at: th.length ? th[th.length - 1].date : 0}; })
      .sort((a, b) => b.at - a.at || a.c.name.localeCompare(b.c.name, 'sv'));
    return (
      <>
        <Pressable style={x.row} onPress={() => { onOpenOpter(); setOpen('opter'); }}>
          <View style={[x.av, {backgroundColor: C.accentSoft}]}><Bi n="building" size={16} color={C.accentInk} /></View>
          <View style={{flex: 1, minWidth: 0}}>
            <View style={x.rowTop}><Text style={x.pn}>Kontoret</Text><View style={[x.via, {backgroundColor: C.accentSoft}]}><Text style={[x.viaT, {color: C.accentInk}]}>OPTER</Text></View><View style={{flex: 1}} /><Text style={x.when}>{opterLast && opterLast.created ? whenShort(opterLast.created.getTime()) : ''}</Text></View>
            <Text style={[x.ps, opterUnread ? {color: C.ink, fontWeight: '800'} : null]} numberOfLines={1}>{opterLast ? (opterLast.received ? '' : 'Du: ') + opterLast.text : live ? 'Chatten med kontoret i Opter' : 'Logga in mot Opter för att chatta'}</Text>
          </View>
          {opterUnread ? <View style={x.badge}><Text style={x.badgeT}>{opterUnread}</Text></View> : null}
        </Pressable>
        <Text style={x.secl}>SMS med förare och egna kontakter</Text>
        {list.length ? list.map(({c}) => tagRow(c, () => { j.markSeen(numKey(c.num)); setOpen(c); }))
          : <View style={x.note}><Text style={x.noteT}>Här hamnar SMS med de du har nummer till. Lägg till nummer under Folk.</Text><Pressable onPress={() => setSeg('folk')}><Text style={x.link}>Till Folk</Text></Pressable></View>}
        {j.perm !== 'ja' && j.withNum.length ? <Pressable style={x.note} onPress={() => setSetup(true)}><Text style={x.noteT}>SMS är inte påslaget i RUTT än.</Text><Text style={x.link}>Slå på SMS – 3 steg</Text></Pressable> : null}
      </>
    );
  };

  const personRow = (c: Contact) => {
    const has = numKey(c.num).length >= 6;
    return (
      <Pressable key={c.kind + c.name + (c.ownId || '')} style={x.row} onLongPress={() => setMenu(c)} onPress={() => (has ? setMenu(c) : setNumFor(c))}>
        <Avatar c={c} chef={c.name === j.chef} />
        <View style={{flex: 1, minWidth: 0}}>
          <Text style={x.pn} numberOfLines={1}>{shortName(c.name)}</Text>
          <Text style={x.ps} numberOfLines={1}>{[c.name === j.chef ? 'Chef' : c.sub, has ? prettyPhone(c.num) : 'Inget nummer än'].filter(Boolean).join(' · ')}</Text>
        </View>
        {has ? (
          <>
            <Pressable hitSlop={6} style={x.cb} onPress={() => { j.markSeen(numKey(c.num)); setOpen(c); }}><Bi n="chat-dots-fill" size={17} color={C.people} /></Pressable>
            <Pressable hitSlop={6} style={x.cb} onPress={() => dial(c.num)}><Bi n="telephone-fill" size={17} color={C.people} /></Pressable>
          </>
        ) : (
          <Pressable hitSlop={6} style={x.addn} onPress={() => setNumFor(c)}><Text style={x.addnT}>Lägg till nummer</Text></Pressable>
        )}
      </Pressable>
    );
  };
  const folk = () => {
    const own = j.contacts.filter(c => c.kind === 'own'), drv = j.contacts.filter(c => c.kind === 'driver');
    return (
      <>
        <Pressable style={x.addBtn} onPress={() => setAddOpen(true)}><Bi n="person-plus-fill" size={16} color={C.accentInk} /><Text style={x.addBtnT}>Lägg till kontakt</Text></Pressable>
        <Text style={x.secl}>Egna · {own.length}</Text>
        {own.length ? own.map(personRow) : <Text style={x.hint}>Verkstad, lager, kunder du ringer ofta – allt som har med jobbet att göra.</Text>}
        <Text style={x.secl}>Förare från Opter · {drv.length}</Text>
        {drv.length ? drv.map(personRow) : <Text style={x.hint}>{live ? 'Opter skickade ingen förarlista.' : 'Förarlistan kommer från Opter när du är inloggad.'}</Text>}
        <Text style={[x.hint, {marginTop: 14}]}>Håll inne på någon för att ändra nummer eller välja chef. Numren sparas bara i din telefon.</Text>
      </>
    );
  };

  return (
    <View style={{flex: 1}}>
      <ScrollView contentContainerStyle={{paddingHorizontal: 14, paddingBottom: 28}} keyboardShouldPersistTaps="handled">
        {strip}
        <View style={x.seg}>
          {(['chatt', 'folk'] as const).map(k => (
            <Pressable key={k} style={[x.segB, seg === k && x.segOn]} onPress={() => setSeg(k)}>
              <Text style={[x.segT, seg === k && {color: C.ink}]}>{k === 'chatt' ? 'Chatt' : `Folk · ${j.contacts.length}`}</Text>
              {k === 'chatt' && opterUnread + j.smsUnread > 0 && seg !== 'chatt' ? <View style={x.dot} /> : null}
            </Pressable>
          ))}
        </View>
        {seg === 'chatt' ? chatt() : folk()}
      </ScrollView>
      <NumberSheet c={numFor} tlFromOpter={j.tlFromOpter} onClose={() => setNumFor(null)} onSave={(num, name) => {
        const c = numFor!; setNumFor(null);
        if (c.kind === 'tl') j.save(b => ({...b, tl: num}));
        else if (c.kind === 'own') j.save(b => ({...b, own: b.own.map(o => (o.id === c.ownId ? {...o, num, name: name || o.name} : o))}));
        else j.save(b => ({...b, nums: {...b.nums, [c.name]: num}}));
      }} />
      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} onSave={(o) => { setAddOpen(false); j.save(b => ({...b, own: [...b.own, {id: 'o' + Date.now(), ...o}]})); }} />
      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu ? shortName(menu.name) : ''} sub={menu ? [menu.sub || (menu.kind === 'driver' ? 'Förare i Opter' : ''), menu.num ? prettyPhone(menu.num) : ''].filter(Boolean).join(' · ') : ''}>
        {menu && numKey(menu.num).length >= 6 ? <MenuRow icon="chat-dots-fill" t="Skriv SMS" onPress={() => { const c = menu; setMenu(null); j.markSeen(numKey(c.num)); setOpen(c); }} /> : null}
        {menu && numKey(menu.num).length >= 6 ? <MenuRow icon="telephone-fill" t="Ring" onPress={() => { const c = menu; setMenu(null); dial(c.num); }} /> : null}
        <MenuRow icon="pencil-square" t={menu && menu.num ? 'Ändra nummer' : 'Lägg till nummer'} onPress={() => { const c = menu; setMenu(null); setNumFor(c); }} />
        {menu && menu.kind === 'driver' ? <MenuRow icon="star-fill" t={menu.name === j.chef ? 'Inte chef längre' : 'Gör till chef'} onPress={() => { const c = menu; setMenu(null); j.save(b => ({...b, chef: c.name === j.chef ? '' : c.name})); }} /> : null}
        {menu && menu.kind === 'own' ? <MenuRow icon="x-circle-fill" t="Ta bort kontakten" bad onPress={() => { const c = menu; setMenu(null); j.save(b => ({...b, own: b.own.filter(o => o.id !== c.ownId)})); }} /> : null}
      </Sheet>
    </View>
  );
}

function whenShort(ms: number) {
  const d = new Date(ms), now = new Date();
  if (d.toDateString() === now.toDateString()) return hhmm(d) || '';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'igår';
  return `${d.getDate()}/${d.getMonth() + 1}`;
}
function Avatar({c, chef}: {c: Contact; chef?: boolean}) {
  if (chef) return <View style={[x.av, {backgroundColor: C.accentSoft}]}><Bi n="star-fill" size={15} color={C.accentInk} /></View>;
  if (c.kind === 'own') return <View style={[x.av, {backgroundColor: C.panel2}]}><Bi n={KIND_ICON[c.sub || 'Annat'] || 'person-fill'} size={15} color={C.dim} /></View>;
  return <View style={x.av}><Text style={x.avT}>{ini(c.name)}</Text></View>;
}
function MenuRow({icon, t, onPress, bad}: {icon: any; t: string; onPress: () => void; bad?: boolean}) {
  return <Pressable style={x.menuRow} onPress={onPress}><Bi n={icon} size={17} color={bad ? C.bad : C.people} /><Text style={[x.menuT, bad && {color: C.bad}]}>{t}</Text></Pressable>;
}

function NumberSheet({c, tlFromOpter, onClose, onSave}: {c: Contact | null; tlFromOpter: boolean; onClose: () => void; onSave: (num: string, name?: string) => void}) {
  const [v, setV] = useState('');
  useEffect(() => { setV(c ? c.num || '' : ''); }, [c]);
  if (!c) return null;
  const ok = numKey(v).length >= 6 || v.trim() === '';
  const pick = async () => { try { const r = SMS && (await SMS.pickContact()); if (r && r.num) setV(r.num); } catch (e) {} };
  return (
    <Sheet open onClose={onClose} title={c.kind === 'tl' ? 'Trafikledningens nummer' : `Nummer till ${shortName(c.name)}`}
      sub={c.kind === 'tl' ? (tlFromOpter ? 'Numret kom från Opter. Ändrar du det gäller ditt.' : 'Opter skickade inget nummer – skriv in det en gång.') : c.kind === 'driver' ? 'Namnet kommer från Opter – numret finns inte där. Sparas bara i din telefon.' : 'Sparas bara i din telefon.'}>
      <TextInput style={x.input} value={v} onChangeText={setV} keyboardType="phone-pad" placeholder="07x-xxx xx xx" placeholderTextColor={C.faint} autoFocus />
      <Pressable style={[x.save, !ok && {opacity: 0.4}]} disabled={!ok} onPress={() => onSave(v.trim())}><Bi n="check2" size={18} color={C.onAccent} /><Text style={x.saveT}>Spara</Text></Pressable>
      <Pressable style={x.ghost} onPress={pick}><Bi n="person-lines-fill" size={16} color={C.ink} /><Text style={x.ghostT}>Välj ur telefonens kontakter</Text></Pressable>
    </Sheet>
  );
}

function AddSheet({open, onClose, onSave}: {open: boolean; onClose: () => void; onSave: (o: {name: string; num: string; kind: string}) => void}) {
  const [name, setName] = useState(''), [num, setNum] = useState(''), [kind, setKind] = useState('Verkstad');
  useEffect(() => { if (open) { setName(''); setNum(''); setKind('Verkstad'); } }, [open]);
  const pick = async () => { try { const r = SMS && (await SMS.pickContact()); if (r) { if (r.name) setName(r.name); if (r.num) setNum(r.num); } } catch (e) {} };
  const ok = name.trim() && numKey(num).length >= 6;
  return (
    <Sheet open={open} onClose={onClose} title="Ny kontakt" sub="Någon som har med jobbet att göra. Sparas bara i din telefon." scroll>
      <Pressable style={x.ghost} onPress={pick}><Bi n="person-lines-fill" size={16} color={C.ink} /><Text style={x.ghostT}>Välj ur telefonens kontakter</Text></Pressable>
      <Text style={x.lbl}>Namn</Text>
      <TextInput style={x.input} value={name} onChangeText={setName} placeholder="T.ex. Verkstaden Tyresö" placeholderTextColor={C.faint} />
      <Text style={x.lbl}>Nummer</Text>
      <TextInput style={x.input} value={num} onChangeText={setNum} keyboardType="phone-pad" placeholder="07x-xxx xx xx" placeholderTextColor={C.faint} />
      <Text style={x.lbl}>Vad är det?</Text>
      <View style={x.chips}>{KINDS.map(k => <Pressable key={k} style={[x.chip, kind === k && {backgroundColor: C.accent}]} onPress={() => setKind(k)}><Text style={[x.chipT, kind === k && {color: C.onAccent}]}>{k}</Text></Pressable>)}</View>
      <Pressable style={[x.save, !ok && {opacity: 0.4}]} disabled={!ok} onPress={() => onSave({name: name.trim(), num: num.trim(), kind})}><Bi n="check2" size={18} color={C.onAccent} /><Text style={x.saveT}>Spara</Text></Pressable>
    </Sheet>
  );
}

/* ---- En SMS-tråd ---- */
function SmsThread({j, c, onBack, onDial}: {j: ReturnType<typeof useJobbet>; c: Contact; onBack: () => void; onDial: (n: string) => void}) {
  const [text, setText] = useState('');
  const {lift} = useKeyboardLift();
  const key = numKey(c.num);
  const list = j.threads[key] || [];
  useEffect(() => { j.markSeen(key); }, [list.length]);
  const openApp = () => Linking.openURL(`sms:${c.num}`).catch(() => {});
  const send = (t: string) => { j.send(c, t); setText(''); };
  const status = (m: any) => (m.state === 'sending' ? '  Skickar…' : m.state === 'failed' || m.failed ? '  Inte skickat' : m.state === 'delivered' ? '  Levererat' : m.out ? '  Skickat' : '');
  const first = shortName(c.name).split(' ')[0];
  return (
    <View style={{flex: 1, paddingBottom: lift}}>
      <View style={x.chd}>
        <Pressable hitSlop={12} onPress={onBack}><Bi n="chevron-left" size={18} color={C.dim} /></Pressable>
        <Avatar c={c} chef={c.name === j.chef} />
        <View style={{flex: 1, minWidth: 0}}>
          <Text style={x.pn} numberOfLines={1}>{shortName(c.name)}</Text>
          <View style={[x.via, {backgroundColor: C.peopleSoft}]}><Text style={[x.viaT, {color: C.people}]}>SMS · {prettyPhone(c.num)}</Text></View>
        </View>
        <Pressable hitSlop={6} style={x.cb} onPress={() => onDial(c.num)}><Bi n="telephone-fill" size={17} color={C.people} /></Pressable>
        <Pressable hitSlop={6} style={[x.cb, {backgroundColor: C.panel2}]} onPress={openApp}><Bi n="box-arrow-up-right" size={16} color={C.dim} /></Pressable>
      </View>
      {j.perm !== 'ja' ? (
        <SmsSetup j={j} first={first} onUseApp={openApp} />
      ) : (
        <>
          <FlatList
            style={{flex: 1}}
            inverted
            data={[...list].reverse()}
            keyExtractor={m => String(m.id)}
            contentContainerStyle={{padding: 14, paddingTop: 10}}
            ListEmptyComponent={<Text style={[x.hint, {textAlign: 'center', marginTop: 40, transform: [{scaleY: -1}]}]}>Inga SMS med {first} än. Skriv det första nedan.</Text>}
            renderItem={({item: m}) => (
              <Pressable disabled={!(m.local && m.state === 'failed')} onPress={() => send(m.body)} style={[x.bw, m.out ? {alignSelf: 'flex-end'} : {alignSelf: 'flex-start'}]}>
                <View style={[x.bb, m.out ? x.bbSms : x.bbIn, (m.state === 'failed' || m.failed) && {borderWidth: 1, borderColor: C.bad}, m.state === 'sending' && {opacity: 0.6}]}>
                  <Text style={x.bbT} textBreakStrategy="simple">{slack(m.body)}</Text>
                </View>
                <Text style={[x.bst, m.out ? {textAlign: 'right', marginRight: 6} : {marginLeft: 6}, (m.state === 'failed' || m.failed) && {color: C.bad}]}>
                  {m.out ? '' : `${first} · `}{whenShort(m.date)}{status(m)}{m.local && m.state === 'failed' ? ' – tryck för att försöka igen' : ''}
                </Text>
              </Pressable>
            )}
          />
          <View style={x.quick}>{QUICK.map(q => <Pressable key={q} style={x.qBtn} onPress={() => send(q)}><Text style={x.qT}>{q}</Text></Pressable>)}</View>
          <View style={x.sendRow}>
            <TextInput style={x.sendIn} value={text} onChangeText={setText} placeholder={`Skriv SMS till ${first}…`} placeholderTextColor={C.dim} multiline />
            <Pressable style={[x.sendB, !text.trim() && {opacity: 0.5}]} disabled={!text.trim()} onPress={() => send(text)}><Bi n="send-fill" size={18} color="#FFFFFF" /></Pressable>
          </View>
        </>
      )}
    </View>
  );
}

/* ---- Slå på SMS: guidad, steg för steg, bockas av själv ----
 * Android 15 spärrar SMS-behörighet för appar som inte kommer från Play Store ("begränsade inställningar").
 * Ordningen som fungerar: 1) RUTT frågar (då låser Android och lägger in menyvalet), 2) Appinformation → ⋮ →
 * Tillåt begränsade inställningar, 3) Behörigheter → SMS → Tillåt. Samsungs Automatisk blockering kan dölja steg 2.
 * RUTT kollar igen varje gång du kommer tillbaka och går vidare själv när det är klart. */
export function SmsSetup({j, first, onUseApp}: {j: ReturnType<typeof useJobbet>; first?: string; onUseApp?: () => void}) {
  const asked = !!j.book.smsAsked;
  const opened = j.book.smsOpened || 0;
  const [help, setHelp] = useState(false);
  const openInfo = () => { j.save(b => ({...b, smsOpened: (b.smsOpened || 0) + 1})); Linking.openSettings().catch(() => {}); };
  const openSecurity = () => { (Linking as any).sendIntent ? (Linking as any).sendIntent('android.settings.SECURITY_SETTINGS').catch(() => Linking.openSettings()) : Linking.openSettings(); };
  const step = !asked ? 1 : 2; // steg 2 och 3 görs på samma sida i inställningarna
  const Step = ({n, t, sub, done, on, children}: any) => (
    <View style={[x.sCard, on && {borderColor: C.accent}]}>
      <View style={x.sTop}>
        <View style={[x.stepNo, done && {backgroundColor: C.accent2}, !done && !on && {backgroundColor: C.panel2}]}>{done ? <Bi n="check2" size={14} color="#FFFFFF" /> : <Text style={[x.stepNoT, !on && {color: C.dim}]}>{n}</Text>}</View>
        <Text style={[x.sT, !on && !done && {color: C.dim}]}>{t}</Text>
      </View>
      {sub ? <Text style={x.sSub}>{sub}</Text> : null}
      {on ? children : null}
    </View>
  );
  return (
    <ScrollView contentContainerStyle={{padding: 18, paddingBottom: 30}}>
      <Text style={x.permH}>Slå på SMS i RUTT</Text>
      <Text style={x.permP}>Tre steg, ungefär en minut. Görs en gång. RUTT visar bara SMS med de nummer du lagt in under Folk – inget annat – och allt stannar i telefonen.</Text>
      <Step n={1} t="Fråga Android" done={asked} on={step === 1} sub={asked ? 'Klart – Android har spärrat RUTT, det är väntat.' : 'Android säger troligen nej direkt. Det är meningen – då dyker valet i steg 2 upp.'}>
        <Pressable style={x.save} onPress={() => j.askPerm()}><Text style={x.saveT}>Fråga</Text></Pressable>
      </Step>
      <Step n={2} t="Lås upp RUTT" on={step === 2} sub="På RUTT:s sida i inställningarna:">
        <View style={x.mock}>
          <View style={x.mockBar}><Text style={x.mockTitle}>Appinformation</Text><View style={x.mockDots}><Text style={x.mockDotsT}>⋮</Text></View></View>
          <View style={x.mockMenu}><Text style={x.mockItem}>Tillåt begränsade inställningar</Text></View>
        </View>
        <Text style={x.sSub}>Tryck <Text style={{color: C.ink, fontWeight: '900'}}>⋮</Text> uppe till höger → <Text style={{color: C.ink, fontWeight: '900'}}>Tillåt begränsade inställningar</Text> → bekräfta med PIN eller fingeravtryck.</Text>
        <Pressable style={x.save} onPress={openInfo}><Bi n="gear-fill" size={16} color={C.onAccent} /><Text style={x.saveT}>Öppna RUTT i inställningar</Text></Pressable>
      </Step>
      <Step n={3} t="Tillåt SMS" on={step === 2} sub="Samma sida: Behörigheter → SMS → Tillåt. Tryck sen tillbaka till RUTT – den ser det själv och öppnar SMS:en." />
      {step === 2 ? (
        <Pressable style={x.helpBtn} onPress={() => setHelp(h => !h)}>
          <Bi n={help || opened >= 2 ? 'chevron-down' : 'chevron-right'} size={13} color={C.accentInk} />
          <Text style={x.link}>Finns inte "Tillåt begränsade inställningar" under ⋮?</Text>
        </Pressable>
      ) : null}
      {step === 2 && (help || opened >= 2) ? (
        <View style={x.sCard}>
          <Text style={x.sSub}>Då har Samsungs <Text style={{color: C.ink, fontWeight: '800'}}>Automatisk blockering</Text> spärrat det. Stäng av den en stund:</Text>
          {['Säkerhet och integritet → Automatisk blockering → Av.', 'Gör steg 2 och 3 ovan.', 'Slå på Automatisk blockering igen om du vill – RUTT behåller SMS.'].map((t, i) => (
            <View key={i} style={[x.stepRow, {marginTop: 8}]}><View style={[x.stepNo, {backgroundColor: C.panel2}]}><Text style={[x.stepNoT, {color: C.dim}]}>{i + 1}</Text></View><Text style={x.stepT}>{t}</Text></View>
          ))}
          <Pressable style={x.ghost} onPress={openSecurity}><Bi n="shield-lock" size={16} color={C.ink} /><Text style={x.ghostT}>Öppna Säkerhet och integritet</Text></Pressable>
        </View>
      ) : null}
      {onUseApp ? <Pressable style={[x.ghost, {marginTop: 14}]} onPress={onUseApp}><Text style={x.ghostT}>Skriv till {first || 'personen'} i SMS-appen i stället</Text></Pressable> : null}
    </ScrollView>
  );
}

const x = themed(() => StyleSheet.create({
  strip: {flexDirection: 'row', gap: 8, marginTop: 4},
  stripBtn: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.panel, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 10},
  stripIco: {width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center'},
  stripT: {color: C.ink, fontSize: 13.5, fontWeight: '800'},
  stripS: {color: C.dim, fontSize: 12, marginTop: 1},
  seg: {flexDirection: 'row', gap: 4, backgroundColor: C.panel, borderRadius: 12, padding: 4, marginTop: 10},
  segB: {flex: 1, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6},
  segOn: {backgroundColor: C.panel2},
  segT: {color: C.dim, fontSize: 13.5, fontWeight: '800'},
  dot: {width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent},
  secl: {color: C.faint, fontSize: 11, fontWeight: '900', letterSpacing: 1, marginTop: 18, marginBottom: 2, textTransform: 'uppercase'},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomColor: C.edge, borderBottomWidth: StyleSheet.hairlineWidth},
  rowTop: {flexDirection: 'row', alignItems: 'center', gap: 6},
  av: {width: 38, height: 38, borderRadius: 19, backgroundColor: C.peopleSoft, alignItems: 'center', justifyContent: 'center'},
  avT: {color: C.people, fontSize: 13, fontWeight: '900'},
  pn: {color: C.ink, fontSize: 15, fontWeight: '800', flexShrink: 1},
  ps: {color: C.dim, fontSize: 12.5, marginTop: 2},
  when: {color: C.faint, fontSize: 12},
  via: {alignSelf: 'flex-start', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1, marginTop: 2},
  viaT: {fontSize: 10, fontWeight: '900', letterSpacing: 0.8},
  badge: {minWidth: 20, height: 20, borderRadius: 10, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5},
  badgeT: {color: C.onAccent, fontSize: 11, fontWeight: '900'},
  note: {backgroundColor: C.panel, borderRadius: 12, padding: 12, marginTop: 6, gap: 6},
  noteT: {color: C.dim, fontSize: 13, lineHeight: 18},
  link: {color: C.accentInk, fontSize: 13.5, fontWeight: '800'},
  hint: {color: C.faint, fontSize: 12.5, lineHeight: 18, marginTop: 6},
  cb: {width: 40, height: 40, borderRadius: 20, backgroundColor: C.peopleSoft, alignItems: 'center', justifyContent: 'center'},
  addn: {backgroundColor: C.accentSoft, borderRadius: 16, paddingHorizontal: 10, height: 32, justifyContent: 'center'},
  addnT: {color: C.accentInk, fontSize: 12, fontWeight: '800'},
  addBtn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.accentSoft, borderRadius: 12, height: 46, marginTop: 12},
  addBtnT: {color: C.accentInk, fontSize: 14.5, fontWeight: '800'},
  menuRow: {flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel2, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14, marginTop: 8},
  menuT: {color: C.ink, fontSize: 15.5, fontWeight: '700'},
  input: {backgroundColor: C.panel2, borderRadius: 12, color: C.ink, paddingHorizontal: 14, height: 50, fontSize: 17, fontWeight: '700', marginTop: 8},
  lbl: {color: C.faint, fontSize: 11, fontWeight: '900', letterSpacing: 1, marginTop: 14, textTransform: 'uppercase'},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8},
  chip: {backgroundColor: C.panel2, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 8},
  chipT: {color: C.ink, fontSize: 13.5, fontWeight: '700'},
  save: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.accent, borderRadius: 14, height: 54, marginTop: 16},
  saveT: {color: C.onAccent, fontSize: 16, fontWeight: '900'},
  ghost: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.panel2, borderRadius: 12, height: 46, marginTop: 8},
  ghostT: {color: C.ink, fontSize: 14, fontWeight: '800'},
  chd: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 10, borderBottomColor: C.edge, borderBottomWidth: StyleSheet.hairlineWidth},
  bw: {maxWidth: '82%', marginBottom: 12},
  bb: {borderRadius: 16, paddingHorizontal: 13, paddingVertical: 10},
  bbIn: {backgroundColor: C.bubbleIn, borderBottomLeftRadius: 5},
  bbSms: {backgroundColor: C.peopleSoft, borderBottomRightRadius: 5},
  bbT: {color: C.ink, fontSize: 15, lineHeight: 21},
  bst: {color: C.dim, fontSize: 11, marginTop: 4},
  quick: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingBottom: 6},
  qBtn: {backgroundColor: C.panel2, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 7},
  qT: {color: C.ink, fontSize: 12.5, fontWeight: '700'},
  sendRow: {flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 12, borderTopColor: C.edge, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'flex-end'},
  sendIn: {flex: 1, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 10, color: C.ink, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, maxHeight: 120},
  sendB: {backgroundColor: C.people, borderRadius: 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  steps: {alignSelf: 'stretch', backgroundColor: C.panel, borderRadius: 12, padding: 14, marginTop: 14, gap: 10},
  stepsH: {color: C.ink, fontSize: 14, fontWeight: '700', lineHeight: 20},
  stepRow: {flexDirection: 'row', alignItems: 'flex-start', gap: 10},
  stepNo: {width: 24, height: 24, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center'},
  stepNoT: {color: C.onAccent, fontSize: 13, fontWeight: '900'},
  stepT: {color: C.ink, fontSize: 14, lineHeight: 20, flex: 1},
  sCard: {backgroundColor: C.panel, borderRadius: 14, padding: 14, marginTop: 12, borderWidth: 2, borderColor: 'transparent'},
  sTop: {flexDirection: 'row', alignItems: 'center', gap: 10},
  sT: {color: C.ink, fontSize: 16, fontWeight: '900'},
  sSub: {color: C.dim, fontSize: 13.5, lineHeight: 19, marginTop: 8},
  mock: {backgroundColor: C.panel2, borderRadius: 10, padding: 10, marginTop: 10},
  mockBar: {flexDirection: 'row', alignItems: 'center'},
  mockTitle: {color: C.ink, fontSize: 14, fontWeight: '800', flex: 1},
  mockDots: {width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: C.accent, alignItems: 'center', justifyContent: 'center'},
  mockDotsT: {color: C.ink, fontSize: 18, fontWeight: '900', lineHeight: 20},
  mockMenu: {alignSelf: 'flex-end', backgroundColor: C.panel, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12, marginTop: 6, borderWidth: 2, borderColor: C.accent},
  mockItem: {color: C.ink, fontSize: 13, fontWeight: '700'},
  helpBtn: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingVertical: 4},
  permIco: {width: 64, height: 64, borderRadius: 32, backgroundColor: C.peopleSoft, alignItems: 'center', justifyContent: 'center', marginTop: 20},
  permH: {color: C.ink, fontSize: 20, fontWeight: '900', marginTop: 14},
  permP: {color: C.dim, fontSize: 14, lineHeight: 20, marginTop: 10, alignSelf: 'stretch'},
}));

/**
 * Skanna – fota en sedel så läser RUTT av den.
 *  - Bevego turleveranslista (en eller flera sidor): varje kund blir ett stopp, sidor till samma kund slås ihop.
 *    Stoppen kopplas till Opter-ordern som bara säger "Distribution" (t.ex. 234014): hämtningen och Lossad går till Opter.
 *  - Annan sedel (Inomec, Cramo, följesedel): lämnas vidare till "Gör till jobb" (SedelSheet).
 * Allt läses i telefonen (ML Kit), inget skickas iväg.
 */
import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Image, Modal, NativeModules, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import {C, themed, FONT, R, prettyPhone} from './theme';
import {Bi} from './Bi';
import {useKeyboardLift} from './parts';
import {TurStop, mergeTur, countsText, SCAN_KINDS, matchOpter, stopKey} from '../tur';
import {readPage} from '../ocr';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {parseSedel} = require('../sedel');

const SMS = NativeModules.RuttSms;
export type TurParent = {cid: string; orderNo: string; pick: any; drop: any};
type Page = {uri: string; state: 'busy' | 'ok' | 'other' | 'err'; r?: any; msg?: string};

async function shoot(camera: boolean): Promise<{uri: string; name?: string}[]> {
  // Hög upplösning för att texten ska gå att läsa – ingen base64, bilden stannar i telefonen.
  const opts: any = {mediaType: 'photo', quality: 0.9, maxWidth: 2600, maxHeight: 2600, includeBase64: false, saveToPhotos: false};
  const res: any = camera ? await launchCamera(opts) : await launchImageLibrary({...opts, selectionLimit: 10});
  if (!res || res.didCancel || res.errorCode) return [];
  return (res.assets || []).filter((a: any) => a.uri).map((a: any) => ({uri: a.uri, name: a.fileName}));
}

export default function TurScan({open, start, initial, parents, opterDrops = [], onAdd, onOther, onClose}: {
  open: boolean; start: 'camera' | 'gallery' | null; initial?: {uri: string; name?: string}[] | null; parents: TurParent[];
  opterDrops?: any[];
  onAdd: (stops: TurStop[], parent: TurParent | null) => void;
  onOther: (media: {kind: 'image'; uri: string; name?: string}) => void;
  onClose: () => void;
}) {
  const ins = useSafeAreaInsets();
  const {lift} = useKeyboardLift();
  const [pages, setPages] = useState<Page[]>([]);
  const [stops, setStops] = useState<TurStop[]>([]);
  const [gone, setGone] = useState<Record<string, boolean>>({});
  const [edit, setEdit] = useState<Record<string, boolean>>({});
  const [conf, setConf] = useState<Record<string, boolean>>({});
  const [par, setPar] = useState<string | null | undefined>(undefined);

  const read = async (shots: {uri: string; name?: string}[], first: boolean) => {
    if (!shots.length) return; // avbröt kameran/galleriet: valen ligger kvar
    setPages(p => [...p, ...shots.map(s => ({uri: s.uri, state: 'busy' as const}))]);
    const kinds: string[] = [];
    for (const s of shots) {
      let r: any = null, msg = '';
      try { const o = await readPage(s.uri); r = parseSedel(o, s.name || ''); r.pageUri = o.uri || s.uri; }
      catch (x: any) { msg = String((x && x.message) || x); }
      // Första sidan är varken turlista eller fraktsedel → vanlig sedel: "Gör till jobb".
      if (first && shots.length === 1 && r && !SCAN_KINDS.includes(r.kind)) { setPages([]); onOther({kind: 'image', uri: s.uri, name: s.name}); return; }
      kinds.push(r ? r.kind : 'err');
      setPages(p => p.map(x => (x.uri === s.uri ? {...x, state: !r ? 'err' : SCAN_KINDS.includes(r.kind) ? 'ok' : 'other', r, msg} : x)));
    }
    // Flera bilder men ingen lista/fraktsedel bland dem → första sedeln blir ett vanligt jobb.
    if (first && !kinds.some(k => SCAN_KINDS.includes(k))) { const i = kinds.findIndex(k => k !== 'err'); if (i >= 0) { setPages([]); onOther({kind: 'image', uri: shots[i].uri, name: shots[i].name}); } }
  };
  const more = async (camera: boolean, first = false) => read(await shoot(camera), first);
  // Ta om bilden för ett stopp: dess sidor bort, ny bild läses in.
  const retake = async (st: TurStop) => {
    const sh = await shoot(true); if (!sh.length) return;
    setPages(p => p.filter(x => !(x.r && pageKey(x.r) === st.key)));
    setConf(c => ({...c, [st.key]: false})); setEdit(e => ({...e, [st.key]: false}));
    read(sh, false);
  };

  useEffect(() => {
    if (!open) { setPages([]); setStops([]); setGone({}); setEdit({}); setConf({}); setPar(undefined); return; }
    if (initial && initial.length) read(initial, true);
    else if (start) more(start === 'camera', true);
  }, [open]);
  // Nya sidor lästa → slå ihop igen men behåll det du rättat för hand.
  useEffect(() => {
    const m = mergeTur(pages.filter(p => p.state === 'ok').map(p => p.r));
    setStops(old => m.map(s => { const o: any = old.find(x => x.key === s.key); return o && o.edited ? {...s, ...pick(o)} : s; }));
  }, [pages]);

  if (!open) return null;
  const busy = pages.some(p => p.state === 'busy');
  const keep = stops.filter(s => !gone[s.key]);
  const kind = (keep[0] && keep[0].kind) || 'bevego-tur';
  const bdx = kind === 'bdx-frakt';
  // Opter-ordrar utan adress ("Distribution") som papperen kan höra till – bäst träff först för den här sortens papper.
  const word = bdx ? /\bbdx\b/i : /bevego/i;
  const pars = [...parents].filter(p => !p.drop || !p.drop.adr || /distribution/i.test(String(p.drop.who)) || word.test([p.pick.who, p.pick.customer, p.pick.service].join(' ')))
    .sort((a, b) => Number(word.test([b.pick.who, b.pick.customer, b.pick.service].join(' '))) - Number(word.test([a.pick.who, a.pick.customer, a.pick.service].join(' '))));
  const parSel = par === undefined ? (pars[0] && (word.test([pars[0].pick.who, pars[0].pick.customer, pars[0].pick.service].join(' '))) ? pars[0].cid : null) : par;
  const parent = pars.find(p => p.cid === parSel) || null;
  const matchOf = (s: TurStop) => (parent ? null : matchOpter(s, opterDrops));
  const upd = (key: string, k: keyof TurStop, v: string) => setStops(l => l.map(s => (s.key === key ? {...s, [k]: v, edited: true, sure: !!((k === 'adr' ? v : s.adr) && (k === 'zip' ? v : s.zip))} as any : s)));
  const tour = (stops[0] && stops[0].tour) || '';
  const nKolli = keep.reduce((n, s) => n + s.kolli.length, 0);
  const nConf = keep.filter(s => conf[s.key]).length;
  const allConf = keep.length > 0 && nConf === keep.length;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[z.root, {paddingTop: ins.top + 4, paddingBottom: lift}]}>
        <View style={z.top}>
          <Pressable hitSlop={12} onPress={onClose}><Text style={z.cancel}>Avbryt</Text></Pressable>
          <Text style={z.topT} numberOfLines={1}>{!keep.length ? 'Skanna' : bdx ? (keep.length > 1 ? 'Fraktsedlar' : 'Fraktsedel') : 'Turleveranslista'}</Text>
          <View style={{width: 60}} />
        </View>
        <ScrollView style={{flex: 1}} contentContainerStyle={{padding: 12, paddingBottom: 24}} keyboardShouldPersistTaps="handled">
          {!pages.length ? (
            <View style={{gap: 10, marginTop: 6}}>
              <Text style={z.lead}>Fota sedeln eller turlistan – eller välj bilder du redan tagit. Flera sidor går bra.</Text>
              <Pressable style={z.choice} onPress={() => more(true, true)}><Bi n="camera-fill" size={24} color="#000000" /><View style={{flex: 1}}><Text style={z.choiceT}>Kamera</Text><Text style={z.choiceS}>Fota en sida i taget</Text></View></Pressable>
              <Pressable style={[z.choice, {backgroundColor: C.panel}]} onPress={() => more(false, true)}><Bi n="images" size={24} color={C.ink} /><View style={{flex: 1}}><Text style={[z.choiceT, {color: C.ink}]}>Bilder</Text><Text style={[z.choiceS, {color: C.dim}]}>Välj en eller flera ur galleriet</Text></View></Pressable>
              <Text style={z.hint}>Turleveranslista (Bevego) och BDX-fraktsedel → stopp, adressen bekräftar du. Annan sedel (Inomec, Cramo, följesedel) → ett jobb. Allt läses i telefonen.</Text>
            </View>
          ) : null}
          {/* Sidorna */}
          {pages.length ? <View style={z.pages}>
            {pages.map((p, i) => (
              <View key={p.uri} style={z.page}>
                <Image source={{uri: (p.r && p.r.pageUri) || p.uri}} style={z.thumb} resizeMode="cover" />
                <View style={[z.pState, p.state === 'ok' ? {backgroundColor: C.accent2} : p.state === 'busy' ? {backgroundColor: C.panel2} : {backgroundColor: C.bad}]}>
                  {p.state === 'busy' ? <ActivityIndicator size="small" color={C.ink} /> : <Bi n={p.state === 'ok' ? 'check2' : 'x-lg'} size={11} color="#FFFFFF" />}
                </View>
                <Text style={z.pNo}>{i + 1}</Text>
              </View>
            ))}
            <Pressable style={[z.page, z.addPage]} onPress={() => more(true)}><Bi n="camera-fill" size={20} color={C.ink} /><Text style={z.addPageT}>Fota sida</Text></Pressable>
            <Pressable style={[z.page, z.addPage]} onPress={() => more(false)}><Bi n="images" size={20} color={C.ink} /><Text style={z.addPageT}>Bilder</Text></Pressable>
          </View> : null}
          {pages.some(p => p.state === 'other' || p.state === 'err') ? (
            <Text style={z.warn}>{pages.filter(p => p.state === 'other' || p.state === 'err').length} sida gick inte att läsa – fota den rakt ovanifrån i bra ljus, eller hoppa över den.</Text>
          ) : null}
          {busy ? <Text style={z.hint}>Läser… allt sker i telefonen.</Text> : null}

          {/* Kopplingen till Opter */}
          {keep.length && (pars.length || !bdx) ? (
            <View style={z.card}>
              <Text style={z.k}>HÖR TILL OPTER-ORDERN</Text>
              {pars.map(p => (
                <Pressable key={p.cid} style={z.opt} onPress={() => setPar(p.cid)}>
                  <View style={[z.radio, parSel === p.cid && z.radioOn]}>{parSel === p.cid ? <Bi n="check2" size={12} color="#000000" /> : null}</View>
                  <View style={{flex: 1, minWidth: 0}}>
                    <Text style={z.optT} numberOfLines={1}>{p.orderNo} · {p.pick.who}</Text>
                    <Text style={z.optS} numberOfLines={1}>{[p.pick.service, p.drop ? `lämna: ${p.drop.who || 'adress saknas'}` : ''].filter(Boolean).join(' · ')}</Text>
                  </View>
                </Pressable>
              ))}
              <Pressable style={z.opt} onPress={() => setPar(null)}>
                <View style={[z.radio, parSel === null && z.radioOn]}>{parSel === null ? <Bi n="check2" size={12} color="#000000" /> : null}</View>
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={z.optT}>Ingen Opter-order</Text>
                  <Text style={z.optS}>{bdx ? 'Egna stopp – godset är redan i bilen' : 'Stoppen blir egna jobb, hämtas på Bevego Älvsjö'}</Text>
                </View>
              </Pressable>
              {parent ? <Text style={z.hint}>Lastad på stoppen = Lastad på {parent.orderNo} i Opter. Lossad på sista stoppet = Lossad på {parent.orderNo}.</Text> : null}
            </View>
          ) : null}

          {/* Stoppen */}
          {keep.length ? <Text style={z.sec}>{keep.length} STOPP{tour ? `  ·  TUR ${tour}` : ''}{nKolli ? `  ·  ${nKolli} KOLLI` : ''}</Text> : null}
          {keep.map((s, i) => {
            const ed = edit[s.key];
            const ok = conf[s.key];
            const m = matchOf(s);
            const short = s.total && s.kolli.length < s.total;
            const adrTxt = [s.adr, [s.zip, s.area].filter(Boolean).join(' ')].filter(Boolean).join(', ');
            return (
              <View key={s.key} style={[z.card, !ok && !s.sure && z.cardWarn]}>
                <View style={z.head}>
                  <Text style={z.ix}>{i + 1}</Text>
                  <View style={{flex: 1, minWidth: 0}}>
                    <Text style={z.name}>{s.name || 'Mottagare saknas'}</Text>
                    {ok && !ed ? <View style={z.okRow}><Bi n="check-circle-fill" size={13} color={C.accent2} /><Text style={z.okT}>{adrTxt}</Text></View> : null}
                  </View>
                  <Pressable hitSlop={10} onPress={() => setGone(g => ({...g, [s.key]: true}))}><Bi n="x-lg" size={15} color={C.faint} /></Pressable>
                </View>
                {/* Stämmer adressen? Ja / Ändra / Ta om bild */}
                {!ok && !ed ? (
                  <View style={[z.ask, !s.sure && {borderColor: C.bad}]}>
                    <Text style={z.askK}>{s.sure ? 'STÄMMER ADRESSEN?' : 'ADRESSEN GICK INTE ATT LÄSA SÄKERT – KOLLA'}</Text>
                    <Text style={[z.askAdr, !s.adr && {color: C.bad}]}>{s.adr || 'Gatuadress saknas'}</Text>
                    <Text style={z.askZip}>{[s.zip, s.area].filter(Boolean).join(' ') || 'Postnr/ort saknas'}</Text>
                    <View style={z.askBtns}>
                      <Pressable disabled={!s.adr || !s.zip} style={[z.askB, {backgroundColor: C.accent2, flex: 1.2}, (!s.adr || !s.zip) && {opacity: 0.35}]} onPress={() => setConf(c => ({...c, [s.key]: true}))}><Text style={[z.askBT, {color: '#FFFFFF'}]}>Ja, stämmer</Text></Pressable>
                      <Pressable style={z.askB} onPress={() => setEdit(x => ({...x, [s.key]: true}))}><Text style={z.askBT}>Ändra</Text></Pressable>
                      <Pressable style={z.askB} onPress={() => retake(s)}><Text style={z.askBT}>Ta om bild</Text></Pressable>
                    </View>
                  </View>
                ) : null}
                {ed ? (
                  <View style={{gap: 6, marginTop: 8}}>
                    <TextInput style={z.in} value={s.name} onChangeText={v => upd(s.key, 'name', v)} placeholder="Företag" placeholderTextColor={C.faint} />
                    <TextInput style={z.in} value={s.adr} onChangeText={v => upd(s.key, 'adr', v)} placeholder="Gatuadress" placeholderTextColor={C.faint} />
                    <View style={{flexDirection: 'row', gap: 6}}>
                      <TextInput style={[z.in, {width: 90}]} value={s.zip} onChangeText={v => upd(s.key, 'zip', v)} placeholder="Postnr" placeholderTextColor={C.faint} keyboardType="number-pad" />
                      <TextInput style={[z.in, {flex: 1}]} value={s.area} onChangeText={v => upd(s.key, 'area', v)} placeholder="Ort" placeholderTextColor={C.faint} />
                    </View>
                    <View style={{flexDirection: 'row', gap: 6}}>
                      <TextInput style={[z.in, {flex: 1}]} value={s.contact} onChangeText={v => upd(s.key, 'contact', v)} placeholder="Kontakt" placeholderTextColor={C.faint} />
                      <TextInput style={[z.in, {flex: 1}]} value={s.tel} onChangeText={v => upd(s.key, 'tel', v)} placeholder="Telefon" placeholderTextColor={C.faint} keyboardType="phone-pad" />
                    </View>
                    <View style={z.askBtns}>
                      <Pressable disabled={!s.adr || !s.zip} style={[z.askB, {backgroundColor: C.accent2, flex: 1.4}, (!s.adr || !s.zip) && {opacity: 0.35}]} onPress={() => { setEdit(x => ({...x, [s.key]: false})); setConf(c => ({...c, [s.key]: true})); }}><Text style={[z.askBT, {color: '#FFFFFF'}]}>Spara adressen</Text></Pressable>
                      <Pressable style={z.askB} onPress={() => retake(s)}><Text style={z.askBT}>Ta om bild</Text></Pressable>
                    </View>
                  </View>
                ) : null}
                {m ? <View style={z.match}><Bi n="link-45deg" size={15} color={C.accentInk} /><Text style={z.matchT}>Finns i Opter: order {m.orderNo} ({m.how}). Sedeln läggs på den ordern – inget nytt stopp.</Text></View> : null}
                {s.sendNo ? <View style={z.kv}><Text style={z.kvK}>Sändning</Text><Text style={[z.kvV, z.mono]}>{fmtSend(s.sendNo)}</Text></View> : null}
                <View style={z.kv}>
                  <Text style={z.kvK}>Gods</Text><Text style={z.kvV}>{countsText(s.counts) || '—'}{s.total ? `  ·  ${s.kolli.length} av ${s.total} kolli` : ''}{s.kg ? `  ·  ${s.kg} kg` : ''}</Text>
                </View>
                {short ? <Text style={[z.warn, {paddingLeft: 28}]}>Bara {s.kolli.length} av {s.total} kolli gick att läsa – ta om bilden om du vill ha alla.</Text> : null}
                {s.orders.length ? <View style={z.kv}><Text style={z.kvK}>Order</Text><Text style={[z.kvV, z.mono]}>{s.orders.join(', ')}</Text></View> : null}
                {s.ref ? <View style={z.kv}><Text style={z.kvK}>Mott. ref</Text><Text style={[z.kvV, z.mono]}>{s.ref}</Text></View> : null}
                {s.contact || s.tel ? <View style={z.kv}><Text style={z.kvK}>Kontakt</Text><Text style={z.kvV}>{[s.contact, [s.tel, s.tel2].filter(Boolean).map(prettyPhone).join(' / ')].filter(Boolean).join(' · ')}</Text></View> : null}
                {s.sender && s.sender.name ? <View style={z.kv}><Text style={z.kvK}>Avsändare</Text><Text style={z.kvV}>{[s.sender.name, [s.sender.zip, s.sender.area].filter(Boolean).join(' '), s.sender.ref ? `ref ${s.sender.ref}` : ''].filter(Boolean).join(', ')}</Text></View> : null}
                {s.note ? <View style={z.kv}><Text style={z.kvK}>Info</Text><Text style={z.kvV}>{s.note}</Text></View> : null}
                {s.goods.filter(g => !/^\d+ /.test(g)).length ? <View style={z.kv}><Text style={z.kvK}>Artiklar</Text><Text style={z.kvV} numberOfLines={3}>{s.goods.filter(g => !/^\d+ /.test(g)).join(', ')}</Text></View> : null}
                {s.pageOf && s.pages < s.pageOf ? <Text style={[z.hint, {paddingLeft: 28}]}>{s.pages} av {s.pageOf} sidor lästa. Övriga sidor har mer information (Övrig information) – fota dem också så kommer allt med.</Text> : null}
                {ok && !ed ? <Pressable hitSlop={6} onPress={() => { setConf(c => ({...c, [s.key]: false})); setEdit(x => ({...x, [s.key]: true})); }}><Text style={z.link}>Ändra</Text></Pressable> : null}
              </View>
            );
          })}
          {!busy && pages.length && !keep.length ? <Text style={z.hint}>Inga stopp lästa än.</Text> : null}
        </ScrollView>
        <View style={[z.foot, {paddingBottom: ins.bottom + 10}]}>
          <Pressable disabled={busy || !allConf} style={[z.go, (busy || !allConf) && {opacity: 0.4}]} onPress={() => onAdd(keep.map(s => ({...s, match: matchOf(s)})), parent)}>
            <Text style={z.goT}>{!keep.length ? 'Lägg i planen' : allConf ? `Lägg i planen · ${keep.length} stopp` : `Bekräfta adresserna · ${nConf} av ${keep.length}`}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
const fmtSend = (n: string) => String(n).replace(/^(\d{3})(\d{3})(\d{3})(\d)$/, '$1 $2 $3 $4');
const pageKey = (r: any) => (r.sendNo ? 'S' + r.sendNo : stopKey(r.drop || {}));
const pick = (o: any) => ({name: o.name, adr: o.adr, zip: o.zip, area: o.area, contact: o.contact, tel: o.tel, sure: o.sure, edited: true});

const z = themed(() => StyleSheet.create({
  root: {flex: 1, backgroundColor: C.bg},
  top: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, height: 48},
  cancel: {color: C.accentInk, fontFamily: FONT.cond, fontSize: 17, fontWeight: '600', width: 60},
  topT: {color: C.ink, fontFamily: FONT.cond, fontSize: 19, fontWeight: '700'},
  pages: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  page: {width: 72, height: 96, borderRadius: R, backgroundColor: C.panel, overflow: 'hidden'},
  thumb: {width: '100%', height: '100%'},
  pState: {position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center'},
  pNo: {position: 'absolute', left: 4, bottom: 3, color: '#FFFFFF', fontFamily: FONT.mono, fontSize: 12, textShadowColor: '#000000', textShadowRadius: 3},
  addPage: {alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: C.edge, borderStyle: 'dashed', backgroundColor: 'transparent'},
  addPageT: {color: C.dim, fontFamily: FONT.cond, fontSize: 13, fontWeight: '600'},
  lead: {color: C.dim, fontSize: 14.5, lineHeight: 20},
  choice: {flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.accent, borderRadius: R, paddingHorizontal: 16, height: 72},
  choiceT: {color: '#000000', fontFamily: FONT.cond, fontSize: 20, fontWeight: '700'},
  choiceS: {color: '#000000', fontSize: 13, opacity: 0.75},
  warn: {color: C.bad, fontSize: 13, marginTop: 8, lineHeight: 18},
  hint: {color: C.faint, fontSize: 12.5, marginTop: 8, lineHeight: 17},
  sec: {color: C.faint, fontFamily: FONT.cond, fontSize: 12.5, fontWeight: '700', letterSpacing: 1, marginTop: 16, marginBottom: 2},
  card: {backgroundColor: C.panel, borderRadius: R, padding: 12, marginTop: 8},
  cardWarn: {borderWidth: 1, borderColor: C.bad},
  k: {color: C.faint, fontFamily: FONT.cond, fontSize: 12.5, fontWeight: '700', letterSpacing: 1, marginBottom: 4},
  opt: {flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48},
  radio: {width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.faint, alignItems: 'center', justifyContent: 'center'},
  radioOn: {backgroundColor: C.accent, borderColor: C.accent},
  optT: {color: C.ink, fontFamily: FONT.cond, fontSize: 16.5, fontWeight: '700'},
  optS: {color: C.dim, fontSize: 12.5, marginTop: 1},
  head: {flexDirection: 'row', alignItems: 'flex-start', gap: 10},
  ix: {color: C.dim, fontFamily: FONT.mono, fontSize: 14, width: 18, marginTop: 2},
  name: {color: C.ink, fontFamily: FONT.cond, fontSize: 18, fontWeight: '700'},
  adr: {color: C.dim, fontSize: 14, marginTop: 1},
  tag: {backgroundColor: C.bad, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2},
  tagT: {color: '#FFFFFF', fontFamily: FONT.cond, fontSize: 12, fontWeight: '700', letterSpacing: 0.5},
  in: {backgroundColor: C.panel2, borderRadius: R, paddingHorizontal: 10, paddingVertical: 8, color: C.ink, fontSize: 15, minWidth: 0},
  kv: {flexDirection: 'row', gap: 10, marginTop: 6, paddingLeft: 28},
  kvK: {color: C.faint, fontSize: 13, width: 64},
  kvV: {color: C.ink, fontSize: 13.5, flex: 1},
  mono: {fontFamily: FONT.mono, fontSize: 13},
  okRow: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2},
  okT: {color: C.dim, fontSize: 14, flex: 1},
  ask: {marginTop: 10, borderWidth: 1, borderColor: C.edge, borderRadius: R, padding: 10},
  askK: {color: C.faint, fontFamily: FONT.cond, fontSize: 12.5, fontWeight: '700', letterSpacing: 1},
  askAdr: {color: C.ink, fontFamily: FONT.cond, fontSize: 21, fontWeight: '700', marginTop: 4},
  askZip: {color: C.ink, fontSize: 15.5, marginTop: 1},
  askBtns: {flexDirection: 'row', gap: 6, marginTop: 10},
  askB: {flex: 1, height: 44, borderRadius: R, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6},
  askBT: {color: C.ink, fontFamily: FONT.cond, fontSize: 16, fontWeight: '700'},
  match: {flexDirection: 'row', gap: 8, backgroundColor: C.accentSoft, borderRadius: R, padding: 9, marginTop: 8},
  matchT: {color: C.ink, fontSize: 13, lineHeight: 18, flex: 1},
  link: {color: C.accentInk, fontFamily: FONT.cond, fontSize: 15, fontWeight: '700', marginTop: 8, paddingLeft: 28},
  foot: {paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.edge, backgroundColor: C.bg},
  go: {backgroundColor: C.accent, borderRadius: R, height: 52, alignItems: 'center', justifyContent: 'center'},
  goT: {color: '#000000', fontFamily: FONT.cond, fontSize: 18, fontWeight: '700'},
}));

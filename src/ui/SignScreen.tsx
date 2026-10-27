/**
 * Kvittens vid lossning – helskärm.
 * Ordning efter hur det går till på plats: mottagaren signerar (stor ruta), skriver
 * eller väljer sitt namn, sen föraren: foto, avvikelse/extra tid, kommentar.
 * Kraven från ordern (signatur/namn/foto/kommentar obligatoriskt) styr "Klar".
 */
import React, {useEffect, useMemo, useState} from 'react';
import {Dimensions, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, themed, R} from './theme';
import {MAX_PHOTOS, SigData, SignaturePad, SigPreview, SignFullscreen, pickPhoto, useKeyboardLift} from './parts';
import {Bi} from './Bi';
import TidInput, {fmtMin} from './TidInput';
import StatusExtras, {Extras, ExtrasValue} from './StatusExtras';


export default function SignScreen({stop, savedNames, saved, onCancel, onDone, addOk = true, timeOk = false, start = null, end = null, delay = null, timjobb = false, extras = null}: {extras?: Extras | null; timjobb?: boolean; end?: number | null; delay?: {needs: {cid: string; who: string; orderNo?: string; reason: boolean; damage: boolean; late?: string}[]; reasons: {id: number; name: string; descr?: string}[]; damageTypes: any[]} | null; stop: any; savedNames: string[]; saved?: any; onCancel: () => void; onDone: (pod: any) => void; addOk?: boolean; timeOk?: boolean; start?: number | null}) {
  const insets = useSafeAreaInsets();
  const {kb, lift} = useKeyboardLift();
  const [sig, setSig] = useState<SigData | null>(null);
  const [drawing, setDrawing] = useState(false);
  // Hur kvitteras det? Signatur är standard. Bara namn, eller foto när kunden inte är på plats.
  const [mode, setMode] = useState<'sig' | 'namn' | 'foto'>('sig');
  const [fs, setFs] = useState(false); // helskärm för kunden
  const [fsSig, setFsSig] = useState(false); // signaturen kom från helskärm
  const [padKey, setPadKey] = useState(0);
  const [name, setName] = useState('');
  const [photos, setPhotos] = useState<any[]>([]);
  const [extOpen, setExtOpen] = useState(false);
  const [adds, setAdds] = useState<Record<number, string>>({}); // valda tillägg (orderns egna från kontoret) → antal
  const [kolli, setKolli] = useState(0);
  const [comment, setComment] = useState('');
  const [comment2, setComment2] = useState('');
  const [typeId, setTypeId] = useState(0);
  const [tidOpen, setTidOpen] = useState(false);
  const [exV, setExV] = useState<ExtrasValue | null>(null);
  const [tid, setTid] = useState<number | null>(null);
  const [subId, setSubId] = useState(0);
  // Försening (som Opter): orsak + kommentar, och avvikelse om kunden kräver det.
  const [tfr, setTfr] = useState(0);
  const [tfText, setTfText] = useState('');
  const [dmgT, setDmgT] = useState(0);
  const [dmgE, setDmgE] = useState(0);
  const [dmgR, setDmgR] = useState(0);

  useEffect(() => {
    setSig(null); setFsSig(false); setTidOpen(!!timjobb); setTid(null); setMode('sig'); setName(''); setPhotos([]); setComment(''); setComment2('');
    setTypeId((stop && stop.pod && stop.pod.defaultId) || 0); setSubId(0);
    setAdds({}); setExtOpen(false); setTfr(0); setTfText(''); setDmgT(0); setDmgE(0); setDmgR(0);
    setKolli((saved && saved.kolli) || (stop && stop.kolli) || 0);
  }, [stop, saved]);

  const padH = Math.max(230, Math.min(400, Math.round(Dimensions.get('window').height * 0.36)));
  // Kvittenstyp väljer du själv (som i Opter). Krav = orderns krav OCH typens krav.
  const P = (stop && stop.pod) || null;
  // Tilläggen som kontoret lagt på ordern (Opter: ShipmentAddServiceType). Demo: exempel.
  const addTypes: any[] = !addOk ? [] : stop && stop.live && stop.live.edit ? stop.live.edit.addTypes : stop && !stop.live && !stop.own && !stop.ownSign ? [{id: 1, name: 'Väntetid'}, {id: 2, name: 'Inbärning'}, {id: 3, name: 'Bomkörning'}] : [];
  const types: any[] = (P && P.types) || [];
  const type = types.find(t => t.id === typeId) || null;
  const subs: any[] = type && P ? P.subTypes.filter((x: any) => x.mainId === type.id) : [];
  const sub = subs.find(x => x.id === subId) || null;
  const eff = sub || type;
  const sr = (P && P.shipReq) || {};
  const req: any = P ? (eff ? {sig: sr.sig && eff.req.sig, name: sr.name && eff.req.name, pic: sr.pic && eff.req.pic, remark: sr.remark && eff.req.remark, comment: sr.comment && eff.req.comment, sub: !!(type && type.showSub && type.requireSub && subs.length)} : {}) : ((stop && stop.req) || {});
  const fields = (P && P.fields) || {remark: true, comment: false, count: true, pic: true};
  const showComment2 = !!(fields.comment || req.comment);
  // Förslag: Opters egna för ordern först, sen tidigare mottagare hos samma företag.
  const suggestions = useMemo(() => {
    const out: string[] = [];
    // Som Opter: förslagen från alla order som lossas på stället.
    const fromOpter = [stop, ...((stop && stop.group) || [])].flatMap((x: any) => (x && x.suggest) || []);
    for (const n of [...fromOpter, ...(savedNames || [])]) {
      const t = String(n || '').trim();
      if (t && !out.some(x => x.toLowerCase() === t.toLowerCase())) out.push(t);
    }
    return out.slice(0, 8);
  }, [stop, savedNames]);

  if (!stop) return null;

  const group: any[] = (stop.group && stop.group.length > 1) ? stop.group : [];
  const officeSig = !!req.sig || group.some((g: any) => g.req && g.req.sig); // kontoret kräver signatur (på någon av orderna) → bara signatur går, som Opter
  const missing: string[] = [];
  if ((mode === 'sig' || officeSig) && !sig) missing.push(officeSig && mode !== 'sig' ? 'signatur (kontoret kräver)' : 'signatur');
  if ((req.name || mode === 'namn') && name.trim().length < 2) missing.push('namnförtydligande');
  if (mode === 'foto' && name.trim().length < 2) missing.push('vem som bad om fotot');
  if ((req.pic || mode === 'foto') && photos.length === 0) missing.push('foto');
  if (req.remark && comment.trim().length === 0) missing.push('anmärkning');
  if (req.comment && comment2.trim().length === 0) missing.push((fields.commentName || 'kommentar').toLowerCase());
  if (req.sub && !sub) missing.push('undertyp');
  const dNeeds = (delay && delay.needs) || [];
  const needReason = dNeeds.some(n => n.reason), needDmg = dNeeds.some(n => n.damage);
  const dReasons = (delay && delay.reasons) || [];
  const dTypes: any[] = (delay && delay.damageTypes) || [];
  const dType = dTypes.find(t => t.id === dmgT) || null;
  const dEv = dType ? (dType.events || []).find((e: any) => e.id === dmgE) || null : null;
  const dRs = dEv ? (dEv.reasons || []).find((r: any) => r.id === dmgR) || null : null;
  if (needReason) {
    if (!tfr) missing.push(dReasons.length ? 'förseningsorsak' : 'förseningsorsak (Opter har inga orsaker för mobilen – ring kontoret)');
    if (tfText.trim().length === 0) missing.push('kommentar till förseningen');
  }
  if (needDmg) {
    if (!dType) missing.push('avvikelse (kunden kräver vid försening)');
    else {
      if (dType.forceEvent && !dEv) missing.push('händelse på avvikelsen');
      if (dEv && dEv.forceReason && (dEv.reasons || []).length && !dRs) missing.push('orsak på avvikelsen');
      if (dType.forceComment && tfText.trim().length === 0 && comment.trim().length === 0) missing.push('kommentar på avvikelsen');
      if (dType.forcePicture && photos.length === 0) missing.push('foto på avvikelsen');
    }
  }
  if (exV) missing.push(...exV.missing);
  const ok = missing.length === 0;

  async function addPhoto(cam: boolean) {
    try { const got = await pickPhoto(cam); if (got.length) setPhotos(p => [...p, ...got].slice(0, MAX_PHOTOS)); } catch (e) {}
  }
  function done() {
    if (!ok) return;
    const autoNote = mode === 'foto' ? `Kund ej på plats – foto taget på begäran av ${name.trim()}` : '';
    const cm = comment.trim() || autoNote;
    onDone({mode, name: name.trim(), sig: mode === 'sig' || officeSig ? sig : null, photos, adds: Object.entries(adds).map(([id, n]) => ({satId: Number(id), number: String(n || '').trim(), name: (addTypes.find((t: any) => String(t.id) === id) || {}).name || 'Tillägg'})), kolli: group.length ? null : kolli, comment: cm, comment2: comment2.trim(), typeId: type ? type.id : 0, subId: sub ? sub.id : 0, typeName: eff ? eff.name : '', timeMin: tidOpen && tid ? tid : null, at: Date.now(), answers: exV ? exV.answers : [], xChanges: exV ? exV.changes : [], xLabels: exV ? exV.labels : [],
      delay: dNeeds.length ? {needs: dNeeds, tfrId: tfr, tfrName: (dReasons.find(r => r.id === tfr) || {name: ''}).name, comment: tfText.trim(),
        damage: needDmg && dType ? {ddtId: dType.id, daeId: dEv ? dEv.id : 0, darId: dRs ? dRs.id : 0, name: dType.name, comment: tfText.trim() || cm} : null} : null});
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={[st.root, {paddingTop: insets.top + 6, paddingBottom: lift}]}>
        <View style={st.top}>
          <Pressable onPress={onCancel} hitSlop={12}><Text style={st.cancel}>Avbryt</Text></Pressable>
          <Text style={st.topTitle}>{stop.repod ? 'Ny kvittens' : 'Kvittens'}</Text>
          <View style={{width: 60}} />
        </View>

        <ScrollView style={{flex: 1}} contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 20}} scrollEnabled={!drawing} keyboardShouldPersistTaps="handled">
          <Text style={st.who} numberOfLines={2}>{stop.who || 'Mottagare'}</Text>
          <Text style={st.adr} numberOfLines={2}>{[stop.adr, stop.area].filter(Boolean).join(', ')}{stop.orderNo ? `  ·  Order ${stop.orderNo}` : ''}</Text>

          {types.length > 0 && (
            <>
              <View style={st.secHead}><Text style={st.sec}>Typ av kvittens</Text></View>
              <View style={st.chips}>
                {types.map(t => (
                  <Pressable key={t.id} disabled={P && P.lockMain && t.id !== P.defaultId} style={[st.chip, t.id === typeId && st.chipOn, P && P.lockMain && t.id !== P.defaultId && {opacity: 0.35}]} onPress={() => { setTypeId(t.id); setSubId(0); }}>
                    <Text style={[st.chipTxt, t.id === typeId && st.chipTxtOn]}>{t.name}</Text>
                  </Pressable>
                ))}
              </View>
              {type && type.showSub && subs.length > 0 && (
                <View style={[st.chips, {marginTop: 8}]}>
                  {subs.map(x => (
                    <Pressable key={x.id} style={[st.chip, x.id === subId && st.chipOn]} onPress={() => setSubId(x.id === subId ? 0 : x.id)}>
                      <Text style={[st.chipTxt, x.id === subId && st.chipTxtOn]}>{x.name}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}

          {group.length > 0 && (
            <View style={st.grp}>
              <Text style={st.grpHead}>Samma kvittens för {group.length} order</Text>
              {group.map((g: any) => <Text key={g.drop} style={st.grpTxt} numberOfLines={1}>• {[g.who, g.orderNo && `Order ${g.orderNo}`, g.kolli && `${g.kolli} kolli`].filter(Boolean).join(' · ') || g.who}</Text>)}
              {new Set(group.map((g: any) => String(g.who || '').toLowerCase())).size > 1 ? (
                <Text style={[st.grpTxt, {color: C.dim, marginTop: 6}]}>Olika adresser ({[...new Set(group.map((g: any) => g.who))].join(', ')}) – samma kvittens sparas på alla, precis som när du bockar flera i Opter.</Text>
              ) : null}
            </View>
          )}

          {!stop.repod && dNeeds.length > 0 && (
            <View style={st.lateBox}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                <Bi n="alarm-fill" size={18} color={C.bad} />
                <Text style={st.lateHead}>{dNeeds.length > 1 ? `${dNeeds.length} order är försenade` : 'Ordern är försenad'}</Text>
              </View>
              <Text style={st.lateSub}>{dNeeds.map(n => [n.who, n.orderNo ? '#' + n.orderNo : '', n.late ? 'senast ' + n.late : ''].filter(Boolean).join(' · ')).join('\n')}</Text>
              <Text style={st.lateSub}>Kunden kräver {needReason ? 'en förseningsorsak' : ''}{needReason && needDmg ? ' och ' : ''}{needDmg ? 'en avvikelse' : ''} – precis som Opter frågar.</Text>
              {needReason && (
                <>
                  <View style={st.secHead}><Text style={st.sec}>Förseningsorsak</Text><View style={st.reqBox}><Text style={st.reqTag}>KRÄVS</Text></View></View>
                  <View style={st.chips}>
                    {dReasons.map(r => (
                      <Pressable key={r.id} style={[st.chip, tfr === r.id && st.chipOn]} onPress={() => setTfr(r.id)}><Text style={[st.chipTxt, tfr === r.id && st.chipTxtOn]}>{r.name}</Text></Pressable>
                    ))}
                  </View>
                </>
              )}
              {needDmg && (
                <>
                  <View style={st.secHead}><Text style={st.sec}>Avvikelse</Text><View style={st.reqBox}><Text style={st.reqTag}>KRÄVS</Text></View></View>
                  <View style={st.chips}>
                    {dTypes.map((t: any) => (
                      <Pressable key={t.id} style={[st.chip, dmgT === t.id && st.chipOn]} onPress={() => { setDmgT(t.id); setDmgE(0); setDmgR(0); }}><Text style={[st.chipTxt, dmgT === t.id && st.chipTxtOn]}>{t.name}</Text></Pressable>
                    ))}
                  </View>
                  {dType && (dType.events || []).length > 0 && (
                    <View style={[st.chips, {marginTop: 8}]}>
                      {dType.events.map((e: any) => (
                        <Pressable key={e.id} style={[st.chip, dmgE === e.id && st.chipOn]} onPress={() => { setDmgE(e.id); setDmgR(0); }}><Text style={[st.chipTxt, dmgE === e.id && st.chipTxtOn]}>{e.name}</Text></Pressable>
                      ))}
                    </View>
                  )}
                  {dEv && (dEv.reasons || []).length > 0 && (
                    <View style={[st.chips, {marginTop: 8}]}>
                      {dEv.reasons.map((r: any) => (
                        <Pressable key={r.id} style={[st.chip, dmgR === r.id && st.chipOn]} onPress={() => setDmgR(r.id)}><Text style={[st.chipTxt, dmgR === r.id && st.chipTxtOn]}>{r.name}</Text></Pressable>
                      ))}
                    </View>
                  )}
                </>
              )}
              <View style={st.secHead}><Text style={st.sec}>Varför blev det sent?</Text>{needReason ? <View style={st.reqBox}><Text style={st.reqTag}>KRÄVS</Text></View> : null}</View>
              <TextInput style={st.comment} value={tfText} onChangeText={setTfText} placeholder="T.ex. kö på Essingeleden, väntade på lastning…" placeholderTextColor={C.faint} multiline />
            </View>
          )}

          <View style={st.secHead}><Text style={st.sec}>Hur kvitteras det?</Text></View>
          <View style={st.modes}>
            {([['sig', 'Signatur', 'pen-fill'], ['namn', 'Bara namn', 'input-cursor-text'], ['foto', 'Kund ej på plats', 'camera-fill']] as const).map(([k, label, icon]) => {
              const off = officeSig && k !== 'sig';
              return (
                <Pressable key={k} disabled={off} style={[st.mode, mode === k && st.modeOn, off && {opacity: 0.35}]} onPress={() => setMode(k)}>
                  <Bi n={icon} size={16} color={mode === k ? C.onAccent : C.dim} />
                  <Text style={[st.modeTxt, mode === k && {color: C.onAccent}]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          {officeSig && <Text style={st.hint2}>Kontoret kräver signatur på den här ordern.</Text>}

          {mode === 'foto' && (
            <>
              <Pressable style={st.bigCam} onPress={() => addPhoto(true)}>
                <Bi n="camera-fill" size={26} color={C.onAccent} />
                <Text style={st.bigCamTxt}>{photos.length ? `Ta ett till foto  (${photos.length})` : 'Ta foto på godset'}</Text>
              </Pressable>
              {photos.length > 0 && (
                <View style={[st.photoRow, {marginTop: 10}]}>
                  {photos.map((ph, i) => (
                    <View key={i} style={st.photoBox}>
                      <Image source={{uri: ph.uri}} style={st.photoImg} />
                      <Pressable style={st.photoX} hitSlop={8} onPress={() => setPhotos(x => x.filter((_, j) => j !== i))}><Text style={st.photoXTxt}>×</Text></Pressable>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          {mode === 'sig' && <>
          <View style={st.secHead}>
            <Text style={st.sec}>Mottagarens underskrift</Text>
            <View style={st.reqBox}><Text style={st.reqTag}>KRÄVS</Text></View>
          </View>
          <Pressable style={st.fsBtn} onPress={() => setFs(true)}>
            <Bi n="pen-fill" size={16} color={C.people} />
            <Text style={st.fsTxt}>Ge telefonen till kunden – signera i helskärm</Text>
          </Pressable>
          {fsSig && sig ? (
            <>
              <SigPreview data={sig} height={140} />
              <Pressable hitSlop={10} style={{alignSelf: 'flex-end', paddingVertical: 8}} onPress={() => { setSig(null); setFsSig(false); setPadKey(k => k + 1); }}>
                <Text style={st.redo}>Signera om</Text>
              </Pressable>
            </>
          ) : (
            <SignaturePad key={padKey} height={padH} onChange={setSig} onDrawing={setDrawing} hint="Signera på linjen" />
          )}
          </>}

          <View style={st.secHead}>
            <Text style={st.sec}>{mode === 'foto' ? 'Vem bad om fotot?' : 'Namnförtydligande'}</Text>
            {req.name || mode !== 'sig' ? <View style={st.reqBox}><Text style={st.reqTag}>KRÄVS</Text></View> : null}
          </View>
          <TextInput
            style={st.nameInput}
            value={name}
            onChangeText={setName}
            placeholder={mode === 'foto' ? 'Namn på den som bad om foto' : 'Mottagarens namn'}
            placeholderTextColor={C.faint}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
          />
          {suggestions.length > 0 && (
            <>
              <Text style={st.sugLabel}>Tidigare mottagare här – tryck för att välja</Text>
              <View style={st.chips}>
                {suggestions.map(n => (
                  <Pressable key={n} style={[st.chip, name.trim().toLowerCase() === n.toLowerCase() && st.chipOn]} onPress={() => setName(n)}>
                    <Text style={[st.chipTxt, name.trim().toLowerCase() === n.toLowerCase() && st.chipTxtOn]}>{n}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {mode !== 'foto' && <>
          <View style={st.secHead}>
            <Text style={st.sec}>Foto{photos.length ? `  ${photos.length}/${MAX_PHOTOS}` : ''}</Text>
            {req.pic ? <View style={st.reqBox}><Text style={st.reqTag}>KRÄVS</Text></View> : null}
          </View>
          <View style={st.photoRow}>
            {photos.map((ph, i) => (
              <View key={i} style={st.photoBox}>
                <Image source={{uri: ph.uri}} style={st.photoImg} />
                <Pressable style={st.photoX} hitSlop={8} onPress={() => setPhotos(x => x.filter((_, j) => j !== i))}><Text style={st.photoXTxt}>×</Text></Pressable>
              </View>
            ))}
            {photos.length < MAX_PHOTOS && (
              <>
                <Pressable style={st.photoAdd} onPress={() => addPhoto(true)}><Text style={st.photoAddIco}>＋</Text><Text style={st.photoAddTxt}>Kamera</Text></Pressable>
                <Pressable style={st.photoAdd} onPress={() => addPhoto(false)}><Text style={st.photoAddIco}>▦</Text><Text style={st.photoAddTxt}>Galleri</Text></Pressable>
              </>
            )}
          </View>
          </>}

          {fields.count !== false && !group.length && <><View style={st.secHead}><Text style={st.sec}>Antal kollin</Text>{stop.kolli ? <Text style={st.hint}>Ordern: {stop.kolli}</Text> : null}</View>
          <View style={st.kolliRow}>
            <Pressable style={st.kBtn} onPress={() => setKolli(k => Math.max(0, k - 1))}><Text style={st.kBtnTxt}>−</Text></Pressable>
            <Text style={[st.kVal, stop.kolli && kolli !== stop.kolli ? {color: C.accentInk} : null]}>{kolli}</Text>
            <Pressable style={st.kBtn} onPress={() => setKolli(k => k + 1)}><Text style={st.kBtnTxt}>+</Text></Pressable>
          </View></>}

          {!stop.repod && addTypes.length > 0 && (!extOpen ? (
            <Pressable style={st.devToggle} onPress={() => setExtOpen(true)}>
              <Text style={st.devToggleTxt}>Drog något ut? Lägg till {addTypes.slice(0, 2).map((t: any) => t.name.toLowerCase()).join(', ')}…</Text>
              <Text style={st.devPlus}>＋</Text>
            </Pressable>
          ) : (
            <>
              <View style={st.secHead}><Text style={st.sec}>Tillägg</Text><Text style={st.hint}>skickas till Opter</Text></View>
              {addTypes.map((t: any) => {
                const on = adds[t.id] != null;
                return (
                  <View key={t.id} style={[st.addRow, on && {borderColor: C.accent}]}>
                    <Pressable style={{flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12}} onPress={() => setAdds(a => { const n = {...a}; if (on) delete n[t.id]; else n[t.id] = ''; return n; })}>
                      <View style={[st.addCk, on && {backgroundColor: C.accent2, borderColor: C.accent2}]}>{on ? <Bi n="check2" size={14} color="#FFFFFF" /> : null}</View>
                      <Text style={st.addName}>{t.name}</Text>
                    </Pressable>
                    {on ? <TextInput style={st.addNum} value={adds[t.id]} onChangeText={x => setAdds(a => ({...a, [t.id]: x}))} keyboardType="decimal-pad" placeholder="Antal" placeholderTextColor={C.faint} /> : null}
                  </View>
                );
              })}
            </>
          ))}

          {!stop.repod ? <StatusExtras x={extras} onChange={v => setExV(o => (JSON.stringify(o) === JSON.stringify(v) ? o : v))} many={group.length > 1} /> : null}

          {!stop.repod && timeOk && (!tidOpen ? (
            <Pressable style={st.devToggle} onPress={() => setTidOpen(true)}>
              <Text style={st.devToggleTxt}>Timjobb eller tid som ska debiteras? Lägg till tid</Text>
              <Text style={st.devPlus}>＋</Text>
            </Pressable>
          ) : (
            <>
              <View style={st.secHead}><Text style={st.sec}>Tid</Text><Text style={st.hint}>{timjobb ? 'Timjobb · ' : ''}{tid ? fmtMin(tid) + ' · ' : ''}skickas till Opter</Text></View>
              <TidInput minutes={null} onChange={setTid} start={start} end={end} initial={timjobb ? 'span' : 'hm'} bg={C.bg} />
            </>
          ))}

          <View style={st.secHead}>
            <Text style={st.sec}>Anmärkning</Text>
            {req.remark ? <View style={st.reqBox}><Text style={st.reqTag}>KRÄVS</Text></View> : null}
          </View>
          <TextInput style={st.comment} value={comment} onChangeText={setComment} placeholder="T.ex. ställt vid porten, skadad kartong…" placeholderTextColor={C.faint} multiline />
          {showComment2 && (
            <>
              <View style={st.secHead}>
                <Text style={st.sec}>{fields.commentName || 'Kommentar'}</Text>
                {req.comment ? <View style={st.reqBox}><Text style={st.reqTag}>KRÄVS</Text></View> : null}
              </View>
              <TextInput style={st.comment} value={comment2} onChangeText={setComment2} placeholderTextColor={C.faint} multiline />
            </>
          )}
        </ScrollView>

        <View style={[st.bottom, {paddingBottom: kb > 0 ? 10 : 12 + insets.bottom}]}>
          {!ok && <Text style={st.missing}>Saknas: {missing.join(', ')}</Text>}
          <Pressable style={[st.doneBtn, !ok && {opacity: 0.4}]} disabled={!ok} onPress={done}>
            <Text style={st.doneTxt}>{stop.repod ? 'Skicka kvittens' : 'Klar – Lossad ✓'}</Text>
          </Pressable>
        </View>
      </View>
      <SignFullscreen open={fs} who={stop.who} onCancel={() => setFs(false)} onDone={d => { setSig(d); setFsSig(true); setFs(false); }} />
    </Modal>
  );
}

const st = themed(() => StyleSheet.create({
  root: {flex: 1, backgroundColor: C.bg},
  top: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8},
  cancel: {color: C.accentInk, fontSize: 16, fontWeight: '700', width: 60},
  topTitle: {color: C.dim, fontSize: 15, fontWeight: '700', letterSpacing: 1},
  who: {color: C.ink, fontSize: 24, fontWeight: '800', marginTop: 4},
  adr: {color: C.dim, fontSize: 14, marginTop: 3},
  secHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 8},
  sec: {color: C.dim, fontSize: 13, fontWeight: '700', letterSpacing: 0.5},
  reqBox: {backgroundColor: C.accent, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2},
  reqTag: {color: C.onAccent, fontSize: 10, fontWeight: '800', letterSpacing: 1},
  nameInput: {backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 12, color: C.ink, paddingHorizontal: 14, paddingVertical: 13, fontSize: 18, fontWeight: '600'},
  sugLabel: {color: C.faint, fontSize: 12, marginTop: 10, marginBottom: 7},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  lateBox: {backgroundColor: C.badSoft, borderColor: C.bad, borderWidth: 1.5, borderRadius: 14, padding: 14, marginTop: 4, marginBottom: 6, gap: 6},
  lateHead: {color: C.bad, fontSize: 16, fontWeight: '900'},
  lateSub: {color: C.ink, fontSize: 13.5, lineHeight: 19},
  chip: {backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 18, paddingVertical: 9, paddingHorizontal: 14},
  chipOn: {backgroundColor: C.accent, borderColor: C.accent},
  chipTxt: {color: C.ink, fontSize: 14, fontWeight: '600'},
  chipTxtOn: {color: C.onAccent},
  photoRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
  photoBox: {width: 84, height: 84, borderRadius: 12, overflow: 'hidden', backgroundColor: C.panel2},
  photoImg: {width: '100%', height: '100%'},
  photoX: {position: 'absolute', top: 4, right: 4, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(20,18,16,0.85)', alignItems: 'center', justifyContent: 'center'},
  photoXTxt: {color: C.ink, fontSize: 17, lineHeight: 19, fontWeight: '700'},
  photoAdd: {width: 84, height: 84, borderRadius: 12, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  photoAddIco: {color: C.accentInk, fontSize: 22, fontWeight: '700'},
  photoAddTxt: {color: C.dim, fontSize: 12, marginTop: 2, fontWeight: '600'},
  devToggle: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, backgroundColor: C.panel, borderRadius: R, height: 48, paddingHorizontal: 12},
  devToggleTxt: {color: C.ink, fontSize: 14.5, flex: 1},
  devPlus: {color: C.accentInk, fontSize: 20, fontWeight: '700', marginLeft: 8},
  hint: {color: C.faint, fontSize: 12},
  kolliRow: {flexDirection: 'row', alignItems: 'center', gap: 18},
  kBtn: {width: 52, height: 52, borderRadius: 14, backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  kBtnTxt: {color: C.accentInk, fontSize: 26, fontWeight: '800', lineHeight: 28},
  kVal: {color: C.ink, fontSize: 30, fontWeight: '900', minWidth: 54, textAlign: 'center'},
  comment: {backgroundColor: C.panel2, borderColor: C.edge, borderWidth: 1, borderRadius: 12, color: C.ink, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, minHeight: 70, textAlignVertical: 'top'},
  bottom: {paddingHorizontal: 16, paddingTop: 10, backgroundColor: C.bg, borderTopColor: C.edge, borderTopWidth: StyleSheet.hairlineWidth},
  missing: {color: C.bad, fontSize: 13, fontWeight: '600', marginBottom: 8, textAlign: 'center'},
  grp: {marginTop: 14, backgroundColor: C.panel, borderRadius: 12, padding: 12, gap: 4},
  grpHead: {color: C.ink, fontSize: 14, fontWeight: '800', marginBottom: 2},
  grpTxt: {color: C.dim, fontSize: 13},
  modes: {flexDirection: 'row', gap: 6},
  mode: {flex: 1, alignItems: 'center', gap: 4, backgroundColor: C.panel2, borderRadius: 10, paddingVertical: 11},
  modeOn: {backgroundColor: C.accent},
  modeTxt: {color: C.dim, fontSize: 12.5, fontWeight: '700'},
  hint2: {color: C.faint, fontSize: 12, marginTop: 6},
  bigCam: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 14, backgroundColor: C.accent, borderRadius: 14, paddingVertical: 20},
  bigCamTxt: {color: C.onAccent, fontSize: 17, fontWeight: '800'},
  fsBtn: {flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.peopleSoft, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10},
  fsTxt: {color: C.people, fontSize: 14.5, fontWeight: '800', flex: 1},
  redo: {color: C.accentInk, fontSize: 14, fontWeight: '700'},
  doneBtn: {backgroundColor: C.accent2, borderRadius: 14, paddingVertical: 17, alignItems: 'center'},
  doneTxt: {color: '#FFFFFF', fontSize: 18, fontWeight: '800'},
  addRow: {flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.panel2, borderRadius: 12, borderWidth: 2, borderColor: 'transparent', paddingVertical: 10, paddingHorizontal: 12, marginTop: 8},
  addCk: {width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: C.edge, alignItems: 'center', justifyContent: 'center', backgroundColor: C.panel},
  addName: {color: C.ink, fontSize: 15.5, fontWeight: '700', flexShrink: 1},
  addNum: {width: 90, height: 42, borderRadius: 10, backgroundColor: C.panel, color: C.ink, fontSize: 17, fontWeight: '800', textAlign: 'center'},
}));

/**
 * Ändra en order – samma val som Opter Driver har i menyn på en order (ShipmentDetailViewPager),
 * fast som stora knappar och ett tryck i taget:
 *   Ändra status · Ny kvittens · Lägg till bild · Tillägg · Ändring · Avvikelse
 * Allt skickas till Opter med Opters egna rader (se protocol.encodeShipmentEdit).
 * Vad som syns styrs av kontoret: behörigheter, tilläggstyper på ordern, avvikelsetyper och fält.
 * Klarmarkerad av kontoret (Completed) = låst, precis som i Opter.
 */
import React, {useEffect, useState} from 'react';
import {Image, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {C, themed, hhmm} from './theme';
import {MAX_PHOTOS, Sheet, pickPhoto} from './parts';
import {Bi, BiName} from './Bi';
import TidInput, {fmtMin} from './TidInput';

export type Edit = {statusId?: number; addServices?: any[]; damages?: any[]; changes?: any[]; images?: any[]};
type Screen = 'menu' | 'status' | 'image' | 'add' | 'change' | 'damage' | 'time';

// Demo: så det går att prova utan Opter. Märks som demo i appen och skickas aldrig.
export const DEMO_OPTS = {
  perm: {pod: true, addService: true, changes: true, damages: true, addImage: true, status: true, statusDone: true, pickup: true, delivery: true},
  fields: [
    {cet: 40, cetName: 'SHI_Packages', kind: 'int', col: 'packages', label: 'Kolli'},
    {cet: 39, cetName: 'SHI_Weight', kind: 'dec', col: 'weight', label: 'Vikt (kg)'},
    {cet: 34, cetName: 'SHI_TimeMinutes', kind: 'dec', col: 'timeMinutes', label: 'Tid (min)'},
    {cet: 42, cetName: 'SHI_Message', kind: 'str', col: 'message', label: 'Internt meddelande'},
  ],
  damageTypes: [
    {id: 1, name: 'Godsskada', forceComment: true, forceEvent: false, forcePicture: true, events: []},
    {id: 2, name: 'Emballageskada', forceComment: false, forceEvent: false, forcePicture: false, events: []},
    {id: 3, name: 'Fel kolliantal', forceComment: true, forceEvent: false, forcePicture: false, events: []},
  ],
};
const DEMO_ADD = [{id: 1, name: 'Väntetid'}, {id: 2, name: 'Inbärning'}, {id: 3, name: 'Bomkörning'}];
const DEMO_STATUS = [{id: 11, name: 'Lastad', userOption: true, pickup: true}, {id: 12, name: 'Lossad', userOption: true, delivery: true}];

const numOk = (v: string) => /^\d+([.,]\d+)?$/.test(String(v).trim());

export default function EditSheet({item, opts, history, onClose, onSend, onRepod, saved, onResend, onDump}: {
  item: {cid: string; st: any; done: boolean; start?: number | null} | null;
  opts: any; history: any[];
  onClose: () => void;
  onSend: (edit: Edit, label: string) => void;
  onRepod?: () => void;
  saved?: {name?: string; hasSig?: boolean} | null; // kvittensen från lossningen, sparad i telefonen
  onResend?: () => void;
  onDump?: () => void; // skicka orderns data till Claude (felsökning)
}) {
  const [scr, setScr] = useState<Screen>('menu');
  const [statusId, setStatusId] = useState<number | null>(null);
  const [img, setImg] = useState<any[]>([]);
  const [imgTxt, setImgTxt] = useState('');
  const [adds, setAdds] = useState<Record<number, {n: string; d: string}>>({});
  const [vals, setVals] = useState<Record<string, string>>({});
  const [dType, setDType] = useState<any>(null);
  const [dEv, setDEv] = useState<any>(null);
  const [dRs, setDRs] = useState<any>(null);
  const [dTxt, setDTxt] = useState('');
  const [dImg, setDImg] = useState<any[]>([]);
  const [tid, setTid] = useState<number | null>(null);
  useEffect(() => {
    setScr('menu'); setTid(null); setStatusId(null); setImg([]); setImgTxt(''); setAdds({}); setVals({});
    setDType(null); setDEv(null); setDRs(null); setDTxt(''); setDImg([]);
  }, [item && item.cid]);
  if (!item) return null;
  const st = item.st || {};
  const L = st.live || null;
  const E = (L && L.edit) || null;
  const O = opts || DEMO_OPTS;
  const perm = O.perm || DEMO_OPTS.perm;
  const gone = !!(st.gone || (L && L.gone)); // finns inte längre hos Opter (klarmarkerad) – visas bara
  const locked = gone || !!(L && (L.locked || (E && E.completed)));
  const addTypes = E ? E.addTypes : DEMO_ADD;
  const statuses = (E ? E.statuses : DEMO_STATUS);
  const curId = L ? L.curId : item.done ? 12 : 0; // demo: Klart står som Lossad
  // Opter: Välj status = alla statusar kontoret låter föraren välja (UserOption), hämtning/leverans bara med behörighet.
  const pickable = statuses.filter((s: any) => s.userOption && s.id !== curId && !(s.pickup && !perm.pickup) && !(s.delivery && !s.pickup && !perm.delivery));
  const values = (E && E.values) || {packages: st.kolli || 0, weight: st.kg || 0, timeMinutes: st.minutes || 0, message: ''};
  const title = st.who || 'Order';
  const sub = [st.orderNo && `Order ${st.orderNo}`, L && L.cur ? `Står som ${L.cur}` : item.done ? 'Lossad' : ''].filter(Boolean).join('  ·  ');
  const back = <Pressable hitSlop={10} onPress={() => setScr('menu')} style={e.back}><Bi n="chevron-left" size={15} color={C.dim} /><Text style={e.backTxt}>Tillbaka</Text></Pressable>;
  const SendBtn = ({ok, label, edit, why}: {ok: boolean; label: string; edit: () => Edit; why?: string}) => (
    <View>
      {!ok && why ? <Text style={e.why}>{why}</Text> : null}
      <Pressable disabled={!ok} style={[e.send, !ok && {opacity: 0.35}]} onPress={() => { onSend(edit(), label); onClose(); }}>
        <Bi n="send-fill" size={16} color={C.onAccent} /><Text style={e.sendTxt}>Skicka till Opter</Text>
      </Pressable>
    </View>
  );
  const Photos = ({list, set, max = MAX_PHOTOS}: {list: any[]; set: (f: (p: any[]) => any[]) => void; max?: number}) => (
    <View style={e.photoRow}>
      {list.map((p, i) => (
        <View key={i} style={e.photoBox}><Image source={{uri: p.uri}} style={{width: '100%', height: '100%'}} />
          <Pressable style={e.photoX} hitSlop={6} onPress={() => set(ph => ph.filter((_, j) => j !== i))}><Bi n="x-lg" size={12} color="#FFFFFF" /></Pressable></View>
      ))}
      {list.length < max && (
        <>
          <Pressable style={e.photoAdd} onPress={async () => { const g = await pickPhoto(true); if (g.length) set(p => [...p, ...g].slice(0, max)); }}>
            <Bi n="camera-fill" size={20} color={C.accentInk} /><Text style={e.photoAddTxt}>Kamera</Text>
          </Pressable>
          <Pressable style={e.photoAdd} onPress={async () => { const g = await pickPhoto(false); if (g.length) set(p => [...p, ...g].slice(0, max)); }}>
            <Bi n="images" size={20} color={C.dim} /><Text style={e.photoAddTxt}>Galleri</Text>
          </Pressable>
        </>
      )}
    </View>
  );

  // ---- Ändra status ----
  if (scr === 'status') {
    const s = pickable.find((x: any) => x.id === statusId);
    return (
      <Sheet open onClose={onClose} scroll>
        {back}
        <Text style={e.h}>Ändra status</Text>
        <Text style={e.p}>Tryckte du fel, eller ska ordern tillbaka? Välj vad den ska stå som. Nu: <Text style={{color: C.ink, fontWeight: '800'}}>{(L && L.cur) || (item.done ? 'Lossad' : '—')}</Text></Text>
        {pickable.map((x: any) => (
          <Pressable key={x.id} style={[e.opt, statusId === x.id && e.optOn]} onPress={() => setStatusId(x.id)}>
            <View style={[e.radio, statusId === x.id && e.radioOn]}>{statusId === x.id ? <View style={e.radioDot} /> : null}</View>
            <Text style={e.optT}>{x.name}</Text>
          </Pressable>
        ))}
        {!pickable.length ? <Text style={e.p}>Kontoret har inga statusar du får välja på den här ordern.</Text> : null}
        <SendBtn ok={!!s} label={s ? `Status → ${s.name}` : ''} edit={() => ({statusId: s!.id, _status: s} as any)} />
      </Sheet>
    );
  }
  // ---- Lägg till bild ----
  if (scr === 'image') {
    return (
      <Sheet open onClose={onClose} scroll>
        {back}
        <Text style={e.h}>Lägg till bild</Text>
        <Text style={e.p}>Bilden hamnar på ordern i Opter. Ingen ny kvittens behövs.</Text>
        <Photos list={img} set={setImg} max={4} />
        <TextInput style={e.input} value={imgTxt} onChangeText={setImgTxt} placeholder="Kommentar (valfritt) – t.ex. ställt vid port 3" placeholderTextColor={C.faint} multiline />
        <SendBtn ok={img.length > 0 && img.every(p => p.b64)} label={`${img.length} bild${img.length > 1 ? 'er' : ''}`} why="Ta minst en bild."
          edit={() => ({images: img.map(p => ({b64: p.b64, comment: imgTxt.trim(), orderId: (E && E.orderId) || st.orderNo}))})} />
      </Sheet>
    );
  }
  // ---- Tillägg (orderns egna tilläggstyper från kontoret) ----
  if (scr === 'add') {
    const chosen = Object.entries(adds).filter(([, v]) => v);
    const bad = chosen.some(([, v]) => v.n !== '' && !numOk(v.n));
    return (
      <Sheet open onClose={onClose} scroll>
        {back}
        <Text style={e.h}>Tillägg</Text>
        <Text style={e.p}>Det som ska debiteras extra. Tryck på det som gäller, skriv antal om det behövs.</Text>
        {E && E.addDone && E.addDone.length ? <Text style={e.had}>Redan på ordern: {E.addDone.map((a: any) => a.name + (a.number ? ` ${a.number}` : '')).join(', ')}</Text> : null}
        {addTypes.map((t: any) => {
          const v = adds[t.id];
          return (
            <View key={t.id} style={[e.opt, v && e.optOn, {flexDirection: 'column', alignItems: 'stretch'}]}>
              <Pressable style={{flexDirection: 'row', alignItems: 'center', gap: 12}} onPress={() => setAdds(a => { const n = {...a}; if (n[t.id]) delete n[t.id]; else n[t.id] = {n: '', d: ''}; return n; })}>
                <View style={[e.ck, v && e.ckOn]}>{v ? <Bi n="check2" size={14} color="#FFFFFF" /> : null}</View>
                <View style={{flex: 1}}><Text style={e.optT}>{t.name}</Text>{t.descr ? <Text style={e.optS}>{t.descr}</Text> : null}</View>
              </Pressable>
              {v ? (
                <View style={{flexDirection: 'row', gap: 8, marginTop: 10}}>
                  <View style={e.stepWrap}>
                    <Pressable hitSlop={6} style={e.stepBtn} onPress={() => setAdds(a => ({...a, [t.id]: {...a[t.id], n: String(Math.max(0, (parseFloat(String(a[t.id].n).replace(',', '.')) || 0) - 1))}}))}><Text style={e.stepTxt}>−</Text></Pressable>
                    <TextInput style={e.num} value={v.n} onChangeText={x => setAdds(a => ({...a, [t.id]: {...a[t.id], n: x}}))} keyboardType="decimal-pad" placeholder="Antal" placeholderTextColor={C.faint} />
                    <Pressable hitSlop={6} style={e.stepBtn} onPress={() => setAdds(a => ({...a, [t.id]: {...a[t.id], n: String((parseFloat(String(a[t.id].n).replace(',', '.')) || 0) + 1)}}))}><Text style={e.stepTxt}>+</Text></Pressable>
                  </View>
                  <TextInput style={[e.input, {flex: 1, minWidth: 0, marginTop: 0, minHeight: 44}]} value={v.d} onChangeText={x => setAdds(a => ({...a, [t.id]: {...a[t.id], d: x}}))} placeholder="Notering" placeholderTextColor={C.faint} />
                </View>
              ) : null}
            </View>
          );
        })}
        {!addTypes.length ? <Text style={e.p}>Kontoret har inte lagt några tillägg på den här ordern. Skriv till kontoret i chatten om något ska debiteras.</Text> : null}
        <SendBtn ok={chosen.length > 0 && !bad} why={bad ? 'Antal ska vara ett tal, t.ex. 30 eller 1,5.' : 'Välj minst ett tillägg.'}
          label={chosen.map(([id, v]) => `${(addTypes.find((t: any) => String(t.id) === id) || {}).name}${v.n ? ' ' + v.n : ''}`).join(', ')}
          edit={() => ({addServices: chosen.map(([id, v]) => ({satId: Number(id), number: v.n.trim(), descr: v.d.trim()}))})} />
      </Sheet>
    );
  }
  // ---- Tid (Opters "Tid": timmar + minuter, skickas som minuter totalt) ----
  const timeField = (O.fields || []).find((f: any) => f.cetName === 'SHI_TimeMinutes');
  if (scr === 'time' && timeField) {
    const cur = Number(values.timeMinutes) || 0;
    return (
      <Sheet open onClose={onClose} scroll>
        {back}
        <Text style={e.h}>{String(timeField.label || 'Tid').replace(/\s*\(.*\)/, '')}</Text>
        <Text style={e.p}>{cur ? `Nu på ordern: ${fmtMin(cur)}. ` : ''}Går till Opter som en ändring på ordern, samma som Tid i Opter Driver.</Text>
        <TidInput minutes={cur || null} onChange={setTid} start={item.start || null} />
        <SendBtn ok={tid != null && tid > 0 && tid !== cur} why={tid === cur ? 'Samma tid som redan står på ordern.' : 'Välj tid.'}
          label={`Tid ${tid ? fmtMin(tid) : ''}`}
          edit={() => ({changes: [{cet: timeField.cet, kind: 'dec', value: String(tid)}]})} />
      </Sheet>
    );
  }
  // ---- Ändring (fälten kontoret tillåter: kolli, vikt, tid …) ----
  if (scr === 'change') {
    const fields = (O.fields || []).filter((f: any) => f.cetName !== 'SHI_TimeMinutes');
    const changed = fields.filter((f: any) => vals[f.col] != null && String(vals[f.col]) !== String(values[f.col] == null ? '' : values[f.col]));
    const bad = changed.some((f: any) => f.kind !== 'str' && !(f.kind === 'int' ? /^\d+$/.test(vals[f.col]) : numOk(vals[f.col])));
    return (
      <Sheet open onClose={onClose} scroll>
        {back}
        <Text style={e.h}>Ändring</Text>
        <Text style={e.p}>Stämmer något inte på ordern? Ändra bara det som är fel – kontoret ser vad du ändrat.</Text>
        {fields.map((f: any) => {
          const cur = values[f.col] == null ? '' : String(values[f.col]);
          const v = vals[f.col] != null ? vals[f.col] : cur;
          const isNum = f.kind !== 'str';
          const dirty = vals[f.col] != null && vals[f.col] !== cur;
          return (
            <View key={f.cet} style={[e.field, dirty && e.optOn]}>
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <Text style={[e.optT, {flex: 1}]}>{f.label}</Text>
                {dirty ? <Text style={e.was}>var {cur || '—'}</Text> : null}
              </View>
              {isNum ? (
                <View style={[e.stepWrap, {marginTop: 8, alignSelf: 'flex-start'}]}>
                  <Pressable hitSlop={6} style={e.stepBtn} onPress={() => setVals(x => ({...x, [f.col]: String(Math.max(0, (parseFloat(String(v).replace(',', '.')) || 0) - 1))}))}><Text style={e.stepTxt}>−</Text></Pressable>
                  <TextInput style={[e.num, {width: 110}]} value={v} onChangeText={t => setVals(x => ({...x, [f.col]: t}))} keyboardType={f.kind === 'int' ? 'number-pad' : 'decimal-pad'} />
                  <Pressable hitSlop={6} style={e.stepBtn} onPress={() => setVals(x => ({...x, [f.col]: String((parseFloat(String(v).replace(',', '.')) || 0) + 1)}))}><Text style={e.stepTxt}>+</Text></Pressable>
                </View>
              ) : (
                <TextInput style={[e.input, {marginTop: 8}]} value={v} onChangeText={t => setVals(x => ({...x, [f.col]: t}))} multiline placeholder="—" placeholderTextColor={C.faint} />
              )}
            </View>
          );
        })}
        {!fields.length ? <Text style={e.p}>Kontoret låter dig inte ändra några fält på ordrar.</Text> : null}
        <SendBtn ok={changed.length > 0 && !bad} why={bad ? 'Skriv ett tal (kolli i hela tal).' : 'Ändra minst ett fält.'}
          label={changed.map((f: any) => `${f.label} ${vals[f.col] || '—'}`).join(', ')}
          edit={() => ({changes: changed.map((f: any) => ({cet: f.cet, kind: f.kind, value: String(vals[f.col]).trim()}))})} />
      </Sheet>
    );
  }
  // ---- Avvikelse ----
  if (scr === 'damage') {
    const types = O.damageTypes || [];
    const evs = dType ? dType.events || [] : [];
    const rsns = dEv ? dEv.reasons || [] : [];
    const need: string[] = [];
    if (!dType) need.push('typ');
    if (dType && dType.forceEvent && !dEv) need.push('vad som hänt');
    if (dEv && dEv.forceReason && rsns.length && !dRs) need.push('orsak');
    if (dType && dType.forceComment && !dTxt.trim()) need.push('kommentar');
    if (dType && dType.forcePicture && !dImg.length) need.push('bild');
    return (
      <Sheet open onClose={onClose} scroll>
        {back}
        <Text style={e.h}>Avvikelse</Text>
        <Text style={e.p}>Skada, fel antal eller något annat som inte stämde. Det som kontoret kräver är märkt.</Text>
        {E && E.dmgDone && E.dmgDone.length ? <Text style={e.had}>Redan rapporterat: {E.dmgDone.map((d: any) => d.name).join(', ')}</Text> : null}
        <Text style={e.lbl}>Vad är det?</Text>
        <View style={e.chips}>
          {types.map((t: any) => (
            <Pressable key={t.id} style={[e.chip, dType && dType.id === t.id && e.chipOn]} onPress={() => { setDType(t); setDEv(null); setDRs(null); }}>
              <Text style={[e.chipTxt, dType && dType.id === t.id && {color: C.onAccent}]}>{t.name}</Text>
            </Pressable>
          ))}
        </View>
        {evs.length > 0 && <>
          <Text style={e.lbl}>Vad har hänt?{dType.forceEvent ? <Text style={e.req}>  KRÄVS</Text> : null}</Text>
          <View style={e.chips}>{evs.map((x: any) => (
            <Pressable key={x.id} style={[e.chip, dEv && dEv.id === x.id && e.chipOn]} onPress={() => { setDEv(x); setDRs(null); }}><Text style={[e.chipTxt, dEv && dEv.id === x.id && {color: C.onAccent}]}>{x.name}</Text></Pressable>
          ))}</View>
        </>}
        {rsns.length > 0 && <>
          <Text style={e.lbl}>Orsak{dEv.forceReason ? <Text style={e.req}>  KRÄVS</Text> : null}</Text>
          <View style={e.chips}>{rsns.map((x: any) => (
            <Pressable key={x.id} style={[e.chip, dRs && dRs.id === x.id && e.chipOn]} onPress={() => setDRs(x)}><Text style={[e.chipTxt, dRs && dRs.id === x.id && {color: C.onAccent}]}>{x.name}</Text></Pressable>
          ))}</View>
        </>}
        <Text style={e.lbl}>Kommentar{dType && dType.forceComment ? <Text style={e.req}>  KRÄVS</Text> : null}</Text>
        <TextInput style={e.input} value={dTxt} onChangeText={setDTxt} placeholder="Vad såg du? T.ex. hörnet krossat på pall 2" placeholderTextColor={C.faint} multiline />
        <Text style={e.lbl}>Bild{dType && dType.forcePicture ? <Text style={e.req}>  KRÄVS</Text> : null}</Text>
        <Photos list={dImg} set={setDImg} max={4} />
        {!types.length ? <Text style={e.p}>Kontoret har inga avvikelsetyper inlagda.</Text> : null}
        <SendBtn ok={!need.length} why={`Saknas: ${need.join(', ')}.`} label={dType ? dType.name + (dEv ? ` – ${dEv.name}` : '') : ''}
          edit={() => ({damages: [{ddtId: dType.id, daeId: dEv ? dEv.id : 0, darId: dRs ? dRs.id : 0, comment: dTxt.trim(), images: dImg.map((p, i) => ({b64: p.b64, name: `IMG_${Date.now()}_${i + 1}.jpg`}))}]})} />
      </Sheet>
    );
  }

  // ---- Menyn ----
  const Item = ({icon, t, s, on, go, tint}: {icon: BiName; t: string; s: string; on: boolean; go: () => void; tint?: string}) => on ? (
    <Pressable style={e.item} onPress={locked ? undefined : go} disabled={locked}>
      <View style={e.itemIco}><Bi n={icon} size={18} color={tint || C.ink} /></View>
      <View style={{flex: 1, minWidth: 0}}><Text style={e.itemT}>{t}</Text><Text style={e.itemS} numberOfLines={1}>{s}</Text></View>
      <Bi n="chevron-right" size={14} color={C.faint} />
    </Pressable>
  ) : null;
  const canStatus = perm.status && (!item.done || perm.statusDone) && pickable.length > 0;
  return (
    <Sheet open onClose={onClose} title={title} sub={sub} scroll>
      {locked ? (
        <View style={e.lock}><Bi n="lock-fill" size={14} color={C.dim} /><Text style={e.lockTxt}>Klarmarkerad av kontoret – kan inte ändras (samma som i Opter).</Text></View>
      ) : null}
      <View style={locked ? {opacity: 0.4} : null} pointerEvents={locked ? 'none' : 'auto'}>
        <Item on={canStatus} icon="arrow-counterclockwise" t="Ändra status" s={`T.ex. tillbaka till ${(pickable.find((x: any) => x.pickup) || pickable[0] || {}).name || 'Lastad'}`} go={() => setScr('status')} />
        <Item on={item.done && perm.pod && !!onResend && !!saved && (!!saved.hasSig || !!saved.name)} icon="cloud-arrow-up-fill" t="Skicka sparad kvittens" s={[saved && saved.hasSig ? 'Signaturen' : '', saved && saved.name ? (saved.hasSig ? 'och ' : '') + 'namnet ' + saved.name : ''].filter(Boolean).join(' ') + ' från lossningen, till Opter igen'} go={() => { onClose(); onResend && onResend(); }} tint={C.accent2} />
        <Item on={item.done && perm.pod && !!onRepod} icon="pen-fill" t="Ny kvittens" s="Signatur, namn eller foto igen" go={() => { onClose(); onRepod && onRepod(); }} />
        <Item on={perm.addImage} icon="camera-fill" t="Lägg till bild" s="Bild på ordern, utan ny kvittens" go={() => setScr('image')} />
        <Item on={perm.addService} icon="plus-circle-fill" t="Tillägg" s={addTypes.length ? addTypes.slice(0, 3).map((a: any) => a.name).join(', ') + (addTypes.length > 3 ? '…' : '') : 'Väntetid, inbärning …'} go={() => setScr('add')} tint={C.accentInk} />
        <Item on={perm.changes && !!timeField} icon="clock-fill" t="Tid" s="Timmar och minuter, eller timjobb med start och slut" go={() => setScr('time')} tint={C.accentInk} />
        <Item on={perm.changes} icon="input-cursor-text" t="Ändring" s={(O.fields || []).slice(0, 4).map((f: any) => f.label.replace(/\s*\(.*\)/, '')).join(', ') || 'Kolli, vikt …'} go={() => setScr('change')} />
        <Item on={perm.damages} icon="exclamation-triangle-fill" t="Avvikelse" s="Skada, fel antal, saknas …" go={() => setScr('damage')} tint={C.bad} />
      </View>
      {onDump ? <Item on icon="send-fill" t="Skicka orderdata till Claude" s="Vad RUTT skickade, Opters svar och orderns rader i Opter" go={() => { onClose(); onDump(); }} /> : null}
      {history && history.length ? (
        <View style={{marginTop: 16}}>
          <Text style={e.lbl}>SKICKAT PÅ ORDERN</Text>
          {history.slice().reverse().map((h: any) => {
            const ok = h.state === 'ok', bad = h.state === 'failed' || h.state === 'unconfirmed';
            return (
              <View key={h.id} style={e.hist}>
                <Bi n={ok ? 'cloud-check-fill' : bad ? 'cloud-slash-fill' : h.state === 'demo' ? 'eye-fill' : 'arrow-repeat'} size={14} color={ok ? C.accent2 : bad ? C.bad : C.faint} />
                <Text style={e.histT} numberOfLines={2}>{h.label}</Text>
                <Text style={e.histS}>{h.state === 'demo' ? 'demo' : ok ? hhmm(new Date(h.at)) : bad ? 'ej bekräftad' : 'skickar…'}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </Sheet>
  );
}

const e = themed(() => StyleSheet.create({
  back: {flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4},
  backTxt: {color: C.dim, fontSize: 13.5, fontWeight: '700'},
  h: {color: C.ink, fontSize: 22, fontWeight: '800', marginTop: 6},
  p: {color: C.dim, fontSize: 14, lineHeight: 20, marginTop: 4},
  had: {color: C.faint, fontSize: 12.5, marginTop: 8},
  lbl: {color: C.faint, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 16, textTransform: 'uppercase'},
  req: {color: C.accentInk, fontSize: 10.5, fontWeight: '900', letterSpacing: 0.8},
  why: {color: C.faint, fontSize: 12.5, textAlign: 'center', marginTop: 16},
  send: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.accent, borderRadius: 14, height: 56, marginTop: 10, marginBottom: 4},
  sendTxt: {color: C.onAccent, fontSize: 17, fontWeight: '900'},
  item: {flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.panel2, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, marginTop: 8},
  itemIco: {width: 38, height: 38, borderRadius: 19, backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center'},
  itemT: {color: C.ink, fontSize: 16, fontWeight: '800'},
  itemS: {color: C.faint, fontSize: 12.5, marginTop: 1},
  lock: {flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.panel2, borderRadius: 10, padding: 12, marginTop: 8},
  lockTxt: {color: C.dim, fontSize: 13, flex: 1},
  opt: {flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel2, borderRadius: 12, borderWidth: 2, borderColor: 'transparent', paddingVertical: 13, paddingHorizontal: 14, marginTop: 8},
  optOn: {borderColor: C.accent},
  optT: {color: C.ink, fontSize: 15.5, fontWeight: '700'},
  optS: {color: C.faint, fontSize: 12, marginTop: 1},
  radio: {width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.edge, alignItems: 'center', justifyContent: 'center'},
  radioOn: {borderColor: C.accent},
  radioDot: {width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent},
  ck: {width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: C.edge, alignItems: 'center', justifyContent: 'center', backgroundColor: C.panel},
  ckOn: {backgroundColor: C.accent2, borderColor: C.accent2},
  field: {backgroundColor: C.panel2, borderRadius: 12, borderWidth: 2, borderColor: 'transparent', paddingVertical: 11, paddingHorizontal: 14, marginTop: 8},
  was: {color: C.faint, fontSize: 12, fontWeight: '600'},
  stepWrap: {flexDirection: 'row', alignItems: 'center', gap: 6},
  stepBtn: {width: 44, height: 44, borderRadius: 10, backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center'},
  stepTxt: {color: C.accentInk, fontSize: 22, fontWeight: '800', lineHeight: 24},
  num: {width: 84, height: 44, borderRadius: 10, backgroundColor: C.panel, color: C.ink, fontSize: 18, fontWeight: '800', textAlign: 'center', paddingHorizontal: 8},
  input: {backgroundColor: C.panel2, borderRadius: 12, color: C.ink, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, marginTop: 10, minHeight: 48},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8},
  chip: {backgroundColor: C.panel2, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 15},
  chipOn: {backgroundColor: C.accent},
  chipTxt: {color: C.ink, fontSize: 14, fontWeight: '700'},
  photoRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10},
  photoBox: {width: 78, height: 78, borderRadius: 12, overflow: 'hidden', backgroundColor: C.panel2},
  photoX: {position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center'},
  photoAdd: {width: 78, height: 78, borderRadius: 12, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center', gap: 4},
  photoAddTxt: {color: C.dim, fontSize: 12, fontWeight: '700'},
  hist: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8},
  histT: {color: C.ink, fontSize: 13.5, flex: 1},
  histS: {color: C.faint, fontSize: 12, fontWeight: '600'},
}));

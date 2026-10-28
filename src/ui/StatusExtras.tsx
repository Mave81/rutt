/**
 * Det Opter Driver frågar efter när du sätter Lastad/Lossad (statusdialogen i Opter):
 *   Frågor   – kontorets frågor vid hämtning/lämning (ja/nej eller text). Krävs, som i Opter.
 *   Artiklar – t.ex. Budtransport TIM, Lastningstid (valfritt).
 *   Ändringar – Kolli, Vikt, Fraktsedel … (öppen direkt när statusen kräver ändringar).
 *   Fraktsedel – kontroll av fraktsedelsnumret när kunden kräver det (Opter: Kontrollera fraktsedelsnummer). Krävs.
 * Allt skickas i samma veva som statusen, före den – precis som Opter.
 */
import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {C, themed, FONT, R} from './theme';
import {Bi} from './Bi';
import P from '../opter/protocol';

export type Q = {cid: string; who?: string; id: number; key: any; hdr: any; question: string; isBool: boolean};
export type FB = {cid: string; who?: string; current: string; force: boolean; len: number; cdc: number};
export type Extras = {queries: Q[]; articles: any[]; fields: any[]; values: any; requireChanges: boolean; fb?: FB[]; loose?: 'force' | 'opt' | null};
export type ExtrasValue = {answers: {cid: string; key: any; hdr: any; bool?: boolean | null; text?: string | null; question: string}[]; changes: any[]; labels: string[]; missing: string[]};

const numOk = (v: string) => /^\d+([.,]\d+)?$/.test(String(v).trim());

export default function StatusExtras({x, onChange, many = false, hasOther = false}: {x: Extras | null; onChange: (v: ExtrasValue) => void; many?: boolean; hasOther?: boolean}) {
  const [ans, setAns] = useState<Record<string, {bool?: boolean | null; text?: string}>>({});
  const [artOpen, setArtOpen] = useState(false);
  const [art, setArt] = useState<{sarId: number; q1: string; d: string} | null>(null);
  const [chgOpen, setChgOpen] = useState(!!(x && x.requireChanges));
  const [vals, setVals] = useState<Record<string, string>>({});
  // Fraktsedel per order: värdet (förifyllt om kunden inte tvingar fram inmatning) och om föraren bekräftat det (Opter: OK).
  const [fbv, setFbv] = useState<Record<string, {v: string; ok: boolean}>>({});
  const fbs = (x && x.fb) || [];
  const fbOf = (f: FB) => fbv[f.cid] || {v: f.force ? '' : f.current, ok: false};
  const qs = (x && x.queries) || [], arts = (x && x.articles) || [], fields = (x && x.fields) || [], values = (x && x.values) || {};

  useEffect(() => {
    const missing: string[] = [], labels: string[] = [];
    const answers = qs.map(q => {
      const a = ans[q.cid + ':' + q.id] || {};
      const has = q.isBool ? a.bool != null : !!(a.text && a.text.trim());
      if (!has) missing.push(`svar: ${q.question}`);
      return has ? {cid: q.cid, key: q.key, hdr: q.hdr, question: q.question, ...(q.isBool ? {bool: !!a.bool} : {text: String(a.text).trim()})} : null;
    }).filter(Boolean) as ExtrasValue['answers'];
    const changes: any[] = [];
    if (art && art.sarId) {
      if (art.q1 && !numOk(art.q1)) missing.push('antal på artikeln (ett tal)');
      changes.push(...(P as any).articleChanges({sarId: art.sarId, q1: art.q1 || null, descr: art.d || null}));
      const a = arts.find((y: any) => y.id === art.sarId);
      labels.push(`Artikel: ${a ? a.name : ''}${art.q1 ? ' ' + art.q1 + (a && a.unit1 ? ' ' + String(a.unit1).toLowerCase() : '') : ''}`);
    }
    for (const f of fields) {
      const v = vals[f.col]; if (v == null) continue;
      const cur = values[f.col] == null ? '' : String(values[f.col]);
      if (String(v) === cur) continue;
      if (f.kind !== 'str' && !(f.kind === 'int' ? /^\d+$/.test(v) : numOk(v))) { missing.push(`${f.label} (ett tal)`); continue; }
      changes.push({cet: f.cet, kind: f.kind, value: f.kind === 'str' ? v : String(v).replace(',', '.')});
      labels.push(`${String(f.label).replace(/\s*\(.*\)/, '')}: ${v}`);
    }
    for (const f of fbs) {
      const o = fbOf(f), err = (P as any).freightBillError(o.v, f);
      if (err || !o.ok) { missing.push(`fraktsedel${many && f.who ? ' (' + f.who + ')' : ''}: ${err || 'tryck Stämmer'}`); continue; }
      // Opter: skickas bara när numret skiljer sig (equalsIgnoreCase) – som ändring av SHI_FreightBill.
      if (o.v.toLowerCase() !== String(f.current || '').toLowerCase()) { changes.push({cid: f.cid, cet: (P as any).CET.SHI_FreightBill, kind: 'str', value: o.v}); labels.push(`Fraktsedel: ${o.v}`); }
    }
    // Opter (ChangesList): kräver statusen ändringar (SHS_Changes) går det bara vidare när minst ett fält ändrats. Tid räknas (hasOther).
    if (x && x.requireChanges && fields.length && !hasOther && !changes.some((c: any) => fields.some((f: any) => f.cet === c.cet))) missing.push('minst en ändring (kontoret kräver)');
    onChange({answers, changes, labels, missing});
  }, [ans, art, vals, fbv, x, hasOther]);

  if (!x || (!qs.length && !arts.length && !fields.length && !fbs.length && !x.loose)) return null;
  return (
    <View>
      {x.loose ? (
        <View style={[s.q, {marginTop: 10, flexDirection: 'row', gap: 10, alignItems: 'center'}]}>
          <Bi n="exclamation-triangle-fill" size={16} color={C.accentInk} />
          <Text style={[s.hint, {flex: 1, color: C.dim}]}>{x.loose === 'force' ? 'Kontoret vill ha lösa artiklar (t.ex. pallar in/ut) vid den här statusen. Det finns inte i RUTT än – säg till så bygger vi det.' : 'Kontoret har lösa artiklar påslaget. Det finns inte i RUTT än.'}</Text>
        </View>
      ) : null}
      {fbs.length ? (
        <>
          <View style={s.secHead}><Text style={s.sec}>Fraktsedel</Text><View style={s.req}><Text style={s.reqT}>KRÄVS</Text></View></View>
          {fbs.map(f => {
            const o = fbOf(f), err = (P as any).freightBillError(o.v, f);
            return (
              <View key={f.cid} style={s.q}>
                <Text style={s.qT}>{f.force ? 'Skriv fraktsedelsnumret' : 'Stämmer fraktsedelsnumret?'}</Text>
                {many && f.who ? <Text style={s.qW}>{f.who}</Text> : null}
                <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}>
                  <TextInput testID={'fb-' + f.cid} style={[s.in, {flex: 1, fontFamily: FONT.mono}]} value={o.v} autoCapitalize="characters"
                    keyboardType={f.cdc === 1 ? 'number-pad' : 'default'} placeholder={f.len ? `${f.len} tecken` : 'Fraktsedel'} placeholderTextColor={C.faint}
                    onChangeText={t => setFbv(m => ({...m, [f.cid]: {v: t.trim(), ok: false}}))} />
                  <Pressable disabled={!!err} style={[s.okB, o.ok && s.segY, !!err && {opacity: 0.4}]} onPress={() => setFbv(m => ({...m, [f.cid]: {v: o.v, ok: !o.ok}}))}>
                    <Text style={[s.segT, o.ok && {color: '#000000'}]}>{o.ok ? 'Stämmer ✓' : 'Stämmer'}</Text>
                  </Pressable>
                </View>
                {err && o.v ? <Text style={s.err}>{err}</Text> : null}
              </View>
            );
          })}
        </>
      ) : null}
      {qs.length ? (
        <>
          <View style={s.secHead}><Text style={s.sec}>Frågor från kontoret</Text><View style={s.req}><Text style={s.reqT}>KRÄVS</Text></View></View>
          {qs.map(q => {
            const k = q.cid + ':' + q.id, a = ans[k] || {};
            return (
              <View key={k} style={s.q}>
                <Text style={s.qT}>{q.question}</Text>
                {many && q.who ? <Text style={s.qW}>{q.who}</Text> : null}
                {q.isBool ? (
                  <View style={s.seg}>
                    {[true, false].map(v => (
                      <Pressable key={String(v)} style={[s.segB, a.bool === v && (v ? s.segY : s.segN)]} onPress={() => setAns(m => ({...m, [k]: {bool: v}}))}>
                        <Text style={[s.segT, a.bool === v && {color: v ? '#000000' : C.ink}]}>{v ? 'Ja' : 'Nej'}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <TextInput style={s.in} value={a.text || ''} onChangeText={t => setAns(m => ({...m, [k]: {text: t}}))} placeholder="Svar" placeholderTextColor={C.faint} />
                )}
              </View>
            );
          })}
        </>
      ) : null}

      {arts.length ? (!artOpen ? (
        <Pressable style={s.toggle} onPress={() => setArtOpen(true)}>
          <Bi n="receipt" size={16} color={C.accentInk} />
          <Text style={s.toggleT} numberOfLines={1}>Artikel? {arts.slice(0, 3).map((a: any) => a.name).join(', ')}</Text>
          <Text style={s.plus}>＋</Text>
        </Pressable>
      ) : (
        <>
          <View style={s.secHead}><Text style={s.sec}>Artikel</Text><Text style={s.hint}>valfritt · går till Opter</Text></View>
          {arts.map((a: any) => {
            const on = art && art.sarId === a.id;
            return (
              <Pressable key={a.id} style={[s.opt, on && s.optOn]} onPress={() => setArt(on ? null : {sarId: a.id, q1: '', d: ''})}>
                <View style={[s.radio, on && s.radioOn]}>{on ? <Bi n="check2" size={12} color="#000000" /> : null}</View>
                <Text style={[s.optT, {flex: 1}]}>{a.name}</Text>
                {a.unit1 ? <Text style={s.optS}>{a.unit1}</Text> : null}
              </Pressable>
            );
          })}
          {art ? (() => { const a = arts.find((y: any) => y.id === art.sarId) || {}; return (
            <View style={{flexDirection: 'row', gap: 8, marginTop: 6}}>
              <TextInput style={[s.in, {flex: 1}]} value={art.q1} onChangeText={v => setArt({...art, q1: v})} keyboardType="decimal-pad" placeholder={a.unit1 ? `Antal ${String(a.unit1).toLowerCase()}` : 'Antal'} placeholderTextColor={C.faint} />
              <TextInput style={[s.in, {flex: 1.4}]} value={art.d} onChangeText={v => setArt({...art, d: v})} placeholder="Beskrivning (valfritt)" placeholderTextColor={C.faint} />
            </View>
          ); })() : null}
        </>
      )) : null}

      {fields.length ? (!chgOpen ? (
        <Pressable style={s.toggle} onPress={() => setChgOpen(true)}>
          <Bi n="input-cursor-text" size={16} color={C.dim} />
          <Text style={s.toggleT} numberOfLines={1}>Ändra {fields.slice(0, 3).map((f: any) => String(f.label).replace(/\s*\(.*\)/, '').toLowerCase()).join(', ')}?</Text>
          <Text style={s.plus}>＋</Text>
        </Pressable>
      ) : (
        <>
          <View style={s.secHead}><Text style={s.sec}>Ändringar</Text>{x.requireChanges ? <Text style={[s.hint, {color: C.accentInk}]}>kontoret kräver minst en ändring</Text> : <Text style={s.hint}>ändra bara det som inte stämmer</Text>}</View>
          {fields.map((f: any) => (
            <View key={f.col} style={s.fRow}>
              <Text style={s.fL}>{String(f.label)}</Text>
              <TextInput style={[s.in, {flex: 1}]} value={vals[f.col] != null ? vals[f.col] : (values[f.col] == null ? '' : String(values[f.col]))}
                onChangeText={v => setVals(m => ({...m, [f.col]: v}))} keyboardType={f.kind === 'str' ? 'default' : 'decimal-pad'} placeholder="—" placeholderTextColor={C.faint} />
            </View>
          ))}
        </>
      )) : null}
    </View>
  );
}

/** Vad statusen kräver/erbjuder för en order (Opter: statusdialogen). kind = 'load' | 'unload'. */
export function extrasFor(sts: any[], kind: 'load' | 'unload', opts: any): Extras | null {
  const opter = sts.filter(x => x && x.live && !x.own);
  if (!opter.length) return null;
  const first = opter[0].live;
  const stOf = (L: any) => (kind === 'load' ? L.loadSt : L.unloadSt) || {};
  const perm = (opts && opts.perm) || {};
  const queries: Q[] = [];
  for (const x of opter) {
    const L = x.live, S = stOf(L);
    if (!S.queries) continue;
    for (const q of (L.edit && L.edit.queries) || []) if ((kind === 'load' ? q.onPickup : q.onDelivery) && !q.answer) queries.push({cid: String(x.drop || x.pickup), who: x.who, id: q.id, key: q.key, hdr: q.hdr, question: q.question, isBool: q.isBool});
  }
  const articles = perm.articles !== false ? ((first.edit && first.edit.articles) || []) : [];
  const requireChanges = !!stOf(first).changes;
  const fb: FB[] = [];
  for (const x of opter) {
    const c = kind === 'load' ? x.live.fbLoad : x.live.fbUnload;
    if (c) fb.push({cid: String(x.drop || x.pickup), who: x.who, current: x.live.freightBill || '', force: !!c.force, len: Number(c.len) || 0, cdc: Number(c.cdc) || 0});
  }
  const fields = perm.changes !== false && (requireChanges || kind === 'unload') ? ((opts && opts.fields) || []).filter((f: any) => f.cetName !== 'SHI_TimeMinutes' && !(fb.length && f.cet === (P as any).CET.SHI_FreightBill)) : []; // fraktsedeln har egen kontroll ovan
  const loose = perm.looseItems ? (perm.looseForce ? 'force' : 'opt') : null;
  return {queries, articles, fields, values: (first.edit && first.edit.values) || {}, requireChanges, fb, loose};
}

const s = themed(() => StyleSheet.create({
  secHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 6},
  sec: {color: C.ink, fontFamily: FONT.cond, fontSize: 17, fontWeight: '700'},
  hint: {color: C.faint, fontSize: 12.5},
  req: {backgroundColor: C.accent, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2},
  reqT: {color: '#000000', fontFamily: FONT.cond, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.5},
  q: {backgroundColor: C.panel, borderRadius: R, padding: 10, marginBottom: 6},
  qT: {color: C.ink, fontSize: 15, fontWeight: '600'},
  qW: {color: C.faint, fontSize: 12.5, marginTop: 1},
  seg: {flexDirection: 'row', gap: 6, marginTop: 8},
  segB: {flex: 1, height: 42, borderRadius: R, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center'},
  segY: {backgroundColor: C.accent}, segN: {backgroundColor: C.edge},
  segT: {color: C.dim, fontFamily: FONT.cond, fontSize: 17, fontWeight: '700'},
  in: {backgroundColor: C.panel2, borderRadius: R, paddingHorizontal: 10, paddingVertical: 9, color: C.ink, fontSize: 15, minWidth: 0, marginTop: 6},
  toggle: {flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.panel, borderRadius: R, paddingHorizontal: 12, height: 48, marginTop: 10},
  toggleT: {flex: 1, color: C.ink, fontSize: 14.5},
  plus: {color: C.accentInk, fontSize: 20, fontWeight: '700'},
  opt: {flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 10, borderRadius: R, backgroundColor: C.panel, marginBottom: 4},
  optOn: {borderWidth: 1, borderColor: C.accent},
  radio: {width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.faint, alignItems: 'center', justifyContent: 'center'},
  radioOn: {backgroundColor: C.accent, borderColor: C.accent},
  optT: {color: C.ink, fontSize: 15, fontWeight: '600'},
  optS: {color: C.faint, fontSize: 12.5},
  fRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  fL: {color: C.dim, fontSize: 14, width: 110, marginTop: 6},
  okB: {height: 42, paddingHorizontal: 14, borderRadius: R, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center', marginTop: 6},
  err: {color: C.bad, fontSize: 13, marginTop: 4},
}));

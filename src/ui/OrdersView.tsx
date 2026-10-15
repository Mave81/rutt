/**
 * Plan (förslag A): ett stopp i taget.
 *  - Överst NÄSTA som ett stort kort: vem, var, portkod/senast/kollin, kontoret/kundens info,
 *    personerna med Ring och SMS, Navigera och "Dra för Lastad/Lossad".
 *  - Under: "Sedan" – resten av körordningen, kompakt. Tryck på en rad för att göra den stoppet nu.
 *  - Kör-läge: rullar bilen (≥ 10 km/h) visas bara nästa stopp, minuter kvar, Navigera och Ring.
 *    SMS är låst medan du kör.
 */
import React, {useMemo, useState} from 'react';
import {FlatList, Linking, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {C, themed, hhmm, prettyPhone, whenText} from './theme';
import {Sheet} from './parts';
import {MoreSheet} from './OrderExtras';
import {Bi} from './Bi';
import Slider from './Slider';

type Row = {kind: 'pickup' | 'drop'; st: any; cid: string; plan: any; dropLater?: {eta: Date | null; area: string} | null};

export function navigate(st: any) {
  const q = st.lat != null && st.lng != null ? `${st.lat},${st.lng}` : encodeURIComponent([st.adr, st.zip, st.area].filter(Boolean).join(', '));
  Linking.openURL(`google.navigation:q=${q}`).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}`).catch(() => {}));
}
export const dial = (num: string) => Linking.openURL(`tel:${num}`).catch(() => {});
// Bara mobilnummer kan ta emot SMS (07x / +467x / 00467x).
export const isMobile = (num: string) => /^(07|\+467|00467|467)\d{7,8}$/.test(String(num || '').replace(/[^0-9+]/g, ''));
const GENERIC = /^(nummer|kund|referens|avsändare|mottagare|växel|kontor)/i;
function Face({label}: {label: string}) {
  return <View style={o.avatar}>{GENERIC.test(String(label || '')) ? <Bi n="building" size={15} color={C.people} /> : <Text style={o.avatarTxt}>{initials(label)}</Text>}</View>;
}
const initials = (s: string) => String(s || '').replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

// Hur långt sändningen till Opter kommit.
const SYNC_TXT: Record<string, string> = {
  waiting: 'Skickas till Opter om några sekunder…', sending: 'Skickar till Opter…',
  ok: 'Uppdaterad i Opter', 'ok-noimg': 'Uppdaterad i Opter (bilden kom inte med)',
  unconfirmed: 'Opter har inte bekräftat – tryck för att försöka igen', failed: 'Kunde inte nå Opter – tryck för att försöka igen',
};
function SyncLine({state, label, onRetry}: {state?: string; label: string; onRetry: () => void}) {
  if (!state) return null;
  const bad = state === 'unconfirmed' || state === 'failed';
  const ok = state === 'ok' || state === 'ok-noimg';
  const col = ok ? C.accent2 : bad ? C.bad : C.faint;
  return (
    <Pressable disabled={!bad} onPress={onRetry} hitSlop={6} style={o.syncRow}>
      <Bi n={ok ? 'cloud-check-fill' : bad ? 'cloud-slash-fill' : 'arrow-repeat'} size={14} color={col} />
      <Text style={[o.sync, {color: col}]}>{label}: {SYNC_TXT[state] || state}</Text>
    </Pressable>
  );
}

// ---- SMS: färdiga texter, du trycker bara skicka i telefonens SMS-app ----
const MINS = [5, 10, 15, 20, 30];
function SmsSheet({to, onClose}: {to: {name: string; num: string; who: string} | null; onClose: () => void}) {
  const [min, setMin] = useState(10);
  if (!to) return null;
  const T = [
    `Hej! Jag är hos er om ca ${min} min med leveransen${to.who ? ` till ${to.who}` : ''}.`,
    'Hej! Jag står utanför nu med er leverans.',
    'Hej! Jag är framme men kommer inte in – kan någon möta mig?',
  ];
  const send = (t: string) => { onClose(); Linking.openURL(`sms:${to.num}${t ? `?body=${encodeURIComponent(t)}` : ''}`).catch(() => {}); };
  return (
    <Sheet open onClose={onClose} title={`SMS till ${to.name}`} sub={prettyPhone(to.num)}>
      <Text style={o.sheetLbl}>Om</Text>
      <View style={o.minRow}>
        {MINS.map(m => (
          <Pressable key={m} onPress={() => setMin(m)} style={[o.minChip, m === min && o.minOn]}>
            <Text style={[o.minTxt, m === min && {color: C.onAccent}]}>{m} min</Text>
          </Pressable>
        ))}
      </View>
      {T.map((t, i) => (
        <Pressable key={i} style={o.tmpl} onPress={() => send(t)}>
          <Text style={o.tmplTxt}>{t}</Text>
          <Bi n="send-fill" size={16} color={C.people} />
        </Pressable>
      ))}
      <Pressable style={o.tmplOpen} onPress={() => send('')}>
        <Text style={o.tmplOpenTxt}>Skriv eget i SMS-appen</Text>
      </Pressable>
    </Sheet>
  );
}

export default function OrdersView({route, cargo, ost, allStops, onLoaded, onUnload, onExtra, onAvised, onRetry, live, later = [], speed = 0}: {
  route: any; cargo: any; ost: Record<string, any>; allStops: any[];
  onLoaded: (st: any) => void; onUnload: (st: any) => void;
  onExtra: (cid: string, kind: 'extras' | 'damage' | 'kolli', data: any) => void;
  onAvised: (cid: string) => void;
  onRetry: (cid: string) => void; live: boolean; later?: any[]; speed?: number;
}) {
  const [focus, setFocus] = useState<string | null>(null); // annat stopp än NÄSTA valt som "nu"
  const [callStop, setCallStop] = useState<any>(null);
  const [sms, setSms] = useState<any>(null);
  const [more, setMore] = useState<{st: any; cid: string} | null>(null);
  const [fullInfo, setFullInfo] = useState<Record<string, boolean>>({});
  const [peek, setPeek] = useState(false);
  const [planned, setPlanned] = useState<any>(null); // order för senare dag, visas som kort i ett blad // visa planen fast bilen rullar
  const now = Date.now();
  const bottom = useSafeAreaInsets().bottom + 24;

  // Bygg raderna ur körordningen: hämtningar alltid; lämningar bara när godset är lastat.
  const rows: Row[] = useMemo(() => {
    const order = route.order || [], prow = route.plan.rows || [];
    const dropAt: Record<string, any> = {};
    order.forEach((s: any, i: number) => { if (s.drop) dropAt[s.drop] = {eta: prow[i] && prow[i].eta, area: s.area || s.adr}; });
    const out: Row[] = [];
    const pendingPick = new Set(order.filter((s: any) => s.pickup).map((s: any) => String(s.pickup)));
    order.forEach((s: any, i: number) => {
      if (s.pickup) out.push({kind: 'pickup', st: s, cid: s.pickup, plan: prow[i], dropLater: dropAt[s.pickup] || null});
      else if (s.drop && !pendingPick.has(String(s.drop))) out.push({kind: 'drop', st: s, cid: s.drop, plan: prow[i]});
    });
    return out;
  }, [route, ost]);

  const p = route.plan;
  const heroIdx = Math.max(0, focus ? rows.findIndex(r => r.kind + r.cid === focus) : 0);
  const hero = rows[heroIdx];
  const rest = rows.filter((_, i) => i !== heroIdx);
  const driving = speed >= 10 && !peek && !!hero;

  function callFor(st: any) {
    const tel = st.tel || [];
    if (tel.length === 1) dial(tel[0].num);
    else if (tel.length > 1) setCallStop(st);
  }

  // ---- Kör-läge ----
  if (driving) {
    const {st, kind, plan} = hero;
    const today = new Date(); const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const lat = st.tLatest && st.tLatest.hhmm && !(st.tLatest.date && st.tLatest.date !== ymd) ? st.tLatest.hhmm : null;
    let mins: number | null = null;
    if (lat) { const [h, m] = lat.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); mins = Math.round((d.getTime() - now) / 60000); }
    const etaMin = plan && plan.eta ? Math.max(0, Math.round((new Date(plan.eta).getTime() - now) / 60000)) : null;
    const tel = (st.tel || [])[0];
    return (
      <View style={[o.drive, {paddingBottom: bottom}]}>
        <View style={o.driveTop}>
          <View style={o.chip}><Bi n="speedometer2" size={13} color={C.ink} /><Text style={o.chipTxt}>KÖR · {Math.round(speed)} km/h</Text></View>
          <Text style={o.driveSub}>{kind === 'pickup' ? 'Hämta' : 'Lossa'} · {rows.length} kvar</Text>
        </View>
        <Text style={o.driveWho} numberOfLines={2}>{st.who || '—'}</Text>
        <Text style={o.driveAdr} numberOfLines={1}>{[st.adr, st.area].filter(Boolean).join(', ')}</Text>
        <View style={{flex: 1}} />
        {mins != null ? (
          <View style={o.driveBigRow}>
            <Text style={[o.driveBig, mins < 0 && {color: C.bad}]}>{Math.abs(mins)}</Text>
            <Text style={o.driveBigTxt}>{mins < 0 ? 'min sen mot\n' : 'min till\n'}senast <Text style={{fontWeight: '900'}}>{lat}</Text></Text>
          </View>
        ) : etaMin != null ? (
          <View style={o.driveBigRow}>
            <Text style={o.driveBig}>{etaMin}</Text>
            <Text style={o.driveBigTxt}>{'min dit\n'}framme ca <Text style={{fontWeight: '900'}}>{hhmm(plan.eta)}</Text></Text>
          </View>
        ) : null}
        <View style={o.driveBtns}>
          <Pressable style={[o.driveBtn, {backgroundColor: C.accent}]} onPress={() => navigate(st)}>
            <Bi n="cursor-fill" size={24} color={C.onAccent} /><Text style={[o.driveBtnTxt, {color: C.onAccent}]}>Navigera</Text>
          </Pressable>
          <Pressable style={[o.driveBtn, o.driveBtnGhost, !tel && {opacity: 0.4}]} disabled={!tel} onPress={() => callFor(st)}>
            <Bi n="telephone-fill" size={22} color={C.people} /><Text style={o.driveBtnTxt} numberOfLines={1}>{tel ? `Ring ${String(tel.label).split(' ')[0]}` : 'Inget nr'}</Text>
          </Pressable>
        </View>
        <Pressable hitSlop={10} onPress={() => setPeek(true)} style={{alignSelf: 'center', marginTop: 14}}>
          <Text style={o.link}>Visa hela planen</Text>
        </Pressable>
        <CallSheet st={callStop} onClose={() => setCallStop(null)} />
      </View>
    );
  }

  // ---- Stoppkortet ----
  const heroCard = (item: Row, planned?: boolean) => {
    const {st, kind, cid, plan} = item;
    const c = cargo[cid] || {};
    const pickup = kind === 'pickup';
    const late = plan && plan.late;
    const os = ost[cid] || {};
    const dropStop = pickup ? allStops.find((s: any) => s.drop === cid) : st;
    const av = dropStop && dropStop.avise;
    const dropEta = pickup ? item.dropLater && item.dropLater.eta : plan && plan.eta;
    const aviseAt = av && dropEta ? new Date(new Date(dropEta).getTime() - av.min * 60000) : null;
    const aviseDue = aviseAt && !os.avisedAt && now >= aviseAt.getTime();
    const kolli = os.kolli || st.kolli;
    const extrasN = Object.keys(os.extras || {}).length + ((os.damages && os.damages.length) || 0);
    const orderLine = [st.orderNo && `Order ${st.orderNo}`, st.freightBill && st.freightBill !== st.orderNo && `Fraktsedel ${st.freightBill}`, st.ref && `Ref ${st.ref}`, st.service].filter(Boolean).join('  ·  ');
    const gName = c.goods || c.name || '';
    const goods = [c.pal ? `${c.pal} pall` : '', c.kg ? `${c.kg} kg` : '', /^order\b/i.test(gName) ? '' : gName].filter(Boolean).join(' · ');
    const tel = (st.tel || []).slice(0, 3);
    const notes = [st.adrMsg, st.info].filter(Boolean);
    return (
      <View style={o.hero}>
        <View style={o.headRow}>
          <View style={[o.verb, {backgroundColor: pickup ? C.accentSoft : C.okSoft}]}>
            <Bi n={pickup ? 'box-seam-fill' : 'check-circle-fill'} size={12} color={pickup ? C.accentInk : C.accent2} />
            <Text style={[o.verbTxt, {color: pickup ? C.accentInk : C.accent2}]}>{pickup ? 'HÄMTA' : 'LOSSA'}</Text>
          </View>
          <Text style={o.num}>{planned ? ['Planerad', whenText(st.tEarliest || st.tLatest)].filter(Boolean).join(' · ') : focus ? 'Valt stopp' : `Nästa · ${rows.length} kvar`}</Text>
          {!!late && <View style={o.lateTag}><Text style={o.lateTxt}>{late} min sen</Text></View>}
          <View style={{flex: 1}} />
          {!planned && <Pressable hitSlop={10} style={o.moreBtn} onPress={() => setMore({st, cid})}>
            <Bi n="three-dots" size={16} color={C.dim} />{extrasN ? <Text style={o.moreN}>{extrasN}</Text> : null}
          </Pressable>}
        </View>

        <Text style={o.who} numberOfLines={2}>{st.who || '—'}</Text>
        <View style={o.adrRow}>
          <Bi n="geo-alt-fill" size={13} color={C.faint} />
          <Text style={o.adr} numberOfLines={2}>{[st.adr, st.area].filter(Boolean).join(', ') || 'Adress saknas'}</Text>
        </View>

        <View style={o.facts}>
          {!!st.code && (
            <View style={[o.fact, o.factHot]}>
              <Text style={[o.factK, {color: C.onAccent, opacity: 0.7}]}>Portkod</Text>
              <Text style={[o.factV, {color: C.onAccent, letterSpacing: 1}]} numberOfLines={1}>{st.code}</Text>
            </View>
          )}
          {st.tLatest ? (
            <View style={o.fact}>
              <Text style={o.factK}>Senast</Text>
              <Text style={[o.factV, late && {color: C.bad}]} numberOfLines={1}>{whenText(st.tLatest)}</Text>
            </View>
          ) : null}
          {kolli || c.pal ? (
            <View style={o.fact}>
              <Text style={o.factK}>{kolli ? 'Kollin' : 'Pallplatser'}</Text>
              <Text style={o.factV} numberOfLines={1}>{kolli || c.pal}</Text>
            </View>
          ) : null}
          {plan && plan.eta ? (
            <View style={o.fact}>
              <Text style={o.factK}>Framme</Text>
              <Text style={o.factV} numberOfLines={1}>{hhmm(plan.eta)}</Text>
            </View>
          ) : null}
        </View>

        {!pickup && <SyncLine state={os.sync && os.sync.load} label="Lastad" onRetry={() => onRetry(cid)} />}
        {!pickup && !(os.sync && os.sync.load) && st.live && st.live.cur && /lastad/i.test(st.live.cur) && (
          <View style={o.syncRow}><Bi n="cloud-check-fill" size={14} color={C.accent2} /><Text style={[o.sync, {color: C.accent2}]}>Lastad i Opter</Text></View>
        )}
        {plan && plan.early ? <Text style={o.meta}>Öppnar om {plan.early} min{st.tEarliest && st.tEarliest.hhmm ? ` (tidigast ${whenText(st.tEarliest)})` : ''}</Text> : null}

        {aviseAt && !os.avisedAt && (
          <Pressable style={[o.avise, aviseDue && o.aviseDue]} onPress={() => { if (av.who) dial(av.who.num); onAvised(cid); }}>
            <Bi n="bell-fill" size={18} color={aviseDue ? C.onAccent : C.accentInk} />
            <View style={{flex: 1}}>
              <Text style={[o.aviseT, aviseDue && {color: C.onAccent}]}>{aviseDue ? 'Dags att avisera nu' : `Avisera kl ${hhmm(aviseAt)}`}</Text>
              <Text style={[o.aviseS, aviseDue && {color: C.onAccent, opacity: 0.75}]}>{av.who ? `${av.who.label} · ${prettyPhone(av.who.num)}` : 'Kunden'} · {av.min >= 60 ? `${av.min / 60} h` : `${av.min} min`} före ankomst</Text>
            </View>
            <Text style={[o.aviseCall, aviseDue && {color: C.onAccent}]}>{av.who ? 'Ring' : 'Klar'}</Text>
          </Pressable>
        )}
        {os.avisedAt && av ? <View style={o.syncRow}><Bi n="check2" size={14} color={C.accent2} /><Text style={[o.sync, {color: C.accent2}]}>Aviserad {hhmm(new Date(os.avisedAt))}</Text></View> : null}

        {notes.length > 0 && (
          <Pressable onPress={() => setFullInfo(f => ({...f, [cid]: !f[cid]}))} style={o.info}>
            <Bi n="info-circle" size={15} color={C.dim} style={{marginTop: 1}} />
            <Text style={o.infoTxt} numberOfLines={fullInfo[cid] ? undefined : 3}>{notes.join('\n')}</Text>
          </Pressable>
        )}
        {(!!goods || !!orderLine) && <Text style={o.orderLine} numberOfLines={2}>{[goods, orderLine].filter(Boolean).join('  ·  ')}</Text>}
        {pickup && item.dropLater && (
          <Text style={o.meta}>Lossas sen i {item.dropLater.area}{item.dropLater.eta ? ` ca ${hhmm(item.dropLater.eta)}` : ''}</Text>
        )}

        {tel.length > 0 && (
          <View style={o.people}>
            {tel.map((t: any) => (
              <View key={t.num} style={o.person}>
                <Face label={t.label} />
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={o.pName} numberOfLines={1}>{String(t.label).replace(/\s*\(mobil\)/i, '')}</Text>
                  <Text style={o.pNum}>{/\(mobil\)/i.test(t.label) ? 'Mobil · ' : ''}{prettyPhone(t.num)}</Text>
                </View>
                {isMobile(t.num) && (
                  <Pressable hitSlop={6} style={o.pBtn} onPress={() => setSms({name: String(t.label).replace(/\s*\(mobil\)/, ''), num: t.num, who: st.who})}>
                    <Bi n="chat-dots-fill" size={18} color={C.people} />
                  </Pressable>
                )}
                <Pressable hitSlop={6} style={o.pBtn} onPress={() => dial(t.num)}>
                  <Bi n="telephone-fill" size={18} color={C.people} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Pressable style={o.navBtn} onPress={() => navigate(st)}>
          <Bi n="cursor-fill" size={16} color={C.ink} />
          <Text style={o.navTxt}>Navigera{plan && plan.leg && plan.leg.km ? `  ·  ${plan.leg.km.toFixed(1)} km` : ''}</Text>
        </Pressable>
        {!planned && <Slider key={kind + cid} label={pickup ? 'Dra för Lastad' : 'Dra för Lossad'} tone={pickup ? 'go' : 'ok'} onDone={() => { setFocus(null); if (pickup) onLoaded(st); else onUnload(st); }} />}
        {focus && !planned ? (
          <Pressable hitSlop={10} onPress={() => setFocus(null)} style={{alignSelf: 'center', marginTop: 12}}>
            <Text style={o.link}>Tillbaka till nästa i ordningen</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const renderRest = ({item}: {item: Row}) => {
    const {st, kind, plan} = item;
    const pickup = kind === 'pickup';
    return (
      <Pressable style={o.row} onPress={() => setFocus(kind + item.cid)}>
        <View style={[o.rowIco, {backgroundColor: pickup ? C.accentSoft : C.okSoft}]}>
          <Bi n={pickup ? 'box-seam-fill' : 'check-circle-fill'} size={14} color={pickup ? C.accentInk : C.accent2} />
        </View>
        <View style={{flex: 1, minWidth: 0}}>
          <Text style={o.rowWho} numberOfLines={1}>{st.who || '—'}</Text>
          <Text style={o.rowMeta} numberOfLines={1}>{pickup ? 'Hämta' : 'Lossa'} · {st.area || st.adr || ''}{st.tLatest ? ` · senast ${whenText(st.tLatest)}` : ''}</Text>
        </View>
        <Text style={[o.rowEta, plan && plan.late && {color: C.bad}]}>{plan ? hhmm(plan.eta) : ''}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{flex: 1}}>
      <FlatList
        data={rest}
        keyExtractor={r => r.kind + r.cid}
        renderItem={renderRest}
        style={{flex: 1}}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{paddingHorizontal: 14, paddingBottom: bottom}}
        ListHeaderComponent={
          hero ? (
            <>
              {speed >= 10 && peek ? (
                <Pressable onPress={() => setPeek(false)} style={o.backDrive}><Bi n="speedometer2" size={14} color={C.dim} /><Text style={o.backDriveTxt}>Tillbaka till kör-läget</Text></Pressable>
              ) : null}
              {heroCard(hero)}
              {rest.length > 0 && (
                <View style={o.restHead}>
                  <Text style={o.restTitle}>Sedan</Text>
                  <Text style={o.restSum}>{rows.length} stopp · klar ca {p.end ? hhmm(p.end) : '–'} · {Math.round(p.totKm)} km</Text>
                </View>
              )}
            </>
          ) : undefined
        }
        ListEmptyComponent={hero ? undefined : (
          <View style={o.allDoneBox}>
            <Bi n="check2-all" size={34} color={C.accent2} />
            <Text style={o.allDone}>Allt är klart för idag. Snyggt jobbat!</Text>
          </View>
        )}
        ListFooterComponent={
          later.length ? (
            <View style={{marginTop: 18}}>
              <View style={o.restHead}><Text style={o.restTitle}>Senare dagar</Text><Text style={o.restSum}>{later.length}</Text></View>
              {later.map((st: any, i: number) => (
                <Pressable key={i} style={o.row} onPress={() => setPlanned(st)}>
                  <View style={[o.rowIco, {backgroundColor: C.panel2}]}><Bi n="calendar-event" size={14} color={C.dim} /></View>
                  <View style={{flex: 1, minWidth: 0}}>
                    <Text style={o.rowWho} numberOfLines={1}>{st.who || '—'}</Text>
                    <Text style={o.rowMeta} numberOfLines={1}>{st.pickup ? 'Hämta' : 'Lämna'} · {[st.adr, st.area].filter(Boolean).join(', ')}</Text>
                  </View>
                  <Text style={o.rowEta}>{whenText(st.tEarliest || st.tLatest)}</Text>
                  <Bi n="chevron-right" size={14} color={C.faint} />
                </Pressable>
              ))}
            </View>
          ) : undefined
        }
      />

      <MoreSheet
        stop={more && more.st}
        cargo={cargo}
        saved={more ? ost[more.cid] : null}
        onClose={() => setMore(null)}
        onSave={(kind, data) => { if (more) onExtra(more.cid, kind, data); setMore(null); }}
      />
      <CallSheet st={callStop} onClose={() => setCallStop(null)} />
      <SmsSheet to={sms} onClose={() => setSms(null)} />
      <Sheet open={!!planned} onClose={() => setPlanned(null)} scroll>
        {planned ? heroCard({kind: planned.pickup ? 'pickup' : 'drop', st: planned, cid: planned.pickup || planned.drop, plan: null}, true) : null}
        {planned ? <Text style={o.plannedNote}>Syns i planen {whenText(planned.tEarliest || planned.tLatest) || 'den dagen'}. Ring, SMS och Navigera fungerar redan nu.</Text> : null}
      </Sheet>
    </View>
  );
}

function CallSheet({st, onClose}: {st: any; onClose: () => void}) {
  return (
    <Sheet open={!!st} onClose={onClose} title="Ring" sub={st ? st.who : ''}>
      {st && (st.tel || []).map((t: any) => (
        <Pressable key={t.num} style={o.callRow} onPress={() => { onClose(); dial(t.num); }}>
          <Face label={t.label} />
          <View style={{flex: 1}}>
            <Text style={o.callLabel}>{t.label}</Text>
            <Text style={o.callNum}>{prettyPhone(t.num)}</Text>
          </View>
          <Bi n="telephone-fill" size={20} color={C.people} />
        </Pressable>
      ))}
    </Sheet>
  );
}

const o = themed(() => StyleSheet.create({
  hero: {backgroundColor: C.panel, borderColor: C.edge, borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 6},
  headRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  verb: {flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4},
  verbTxt: {fontSize: 11.5, fontWeight: '900', letterSpacing: 1.2},
  num: {color: C.faint, fontSize: 12.5, fontWeight: '700'},
  lateTag: {backgroundColor: C.badSoft, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3},
  lateTxt: {color: C.bad, fontSize: 11.5, fontWeight: '800'},
  moreBtn: {flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.panel2, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 9},
  moreN: {color: C.accentInk, fontSize: 12, fontWeight: '800'},
  who: {color: C.ink, fontSize: 24, fontWeight: '800', marginTop: 10, letterSpacing: -0.2},
  adrRow: {flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3},
  adr: {color: C.dim, fontSize: 14.5, flex: 1},
  facts: {flexDirection: 'row', gap: 6, marginTop: 14},
  fact: {flex: 1, backgroundColor: C.panel2, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 10, minWidth: 0},
  factHot: {backgroundColor: C.accent},
  factK: {color: C.faint, fontSize: 11, fontWeight: '600'},
  factV: {color: C.ink, fontSize: 19, fontWeight: '800', marginTop: 2},
  meta: {color: C.faint, fontSize: 12, marginTop: 8},
  syncRow: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8},
  sync: {fontSize: 12, fontWeight: '700', flexShrink: 1},
  avise: {flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, backgroundColor: C.accentSoft, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12},
  aviseDue: {backgroundColor: C.accent},
  aviseT: {color: C.accentInk, fontSize: 15, fontWeight: '800'},
  aviseS: {color: C.dim, fontSize: 12, marginTop: 2},
  aviseCall: {color: C.accentInk, fontSize: 15, fontWeight: '900'},
  info: {flexDirection: 'row', gap: 8, backgroundColor: C.noteBg, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 11, marginTop: 12},
  infoTxt: {color: C.noteInk, fontSize: 13.5, lineHeight: 19, flex: 1},
  orderLine: {color: C.faint, fontSize: 12, marginTop: 10, fontWeight: '600'},
  people: {marginTop: 14, gap: 8},
  person: {flexDirection: 'row', alignItems: 'center', gap: 10},
  avatar: {width: 36, height: 36, borderRadius: 18, backgroundColor: C.peopleSoft, alignItems: 'center', justifyContent: 'center'},
  avatarTxt: {color: C.people, fontSize: 13, fontWeight: '800'},
  pName: {color: C.ink, fontSize: 14.5, fontWeight: '700'},
  pNum: {color: C.faint, fontSize: 12, marginTop: 1},
  pBtn: {width: 42, height: 42, borderRadius: 21, backgroundColor: C.peopleSoft, alignItems: 'center', justifyContent: 'center'},
  navBtn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, backgroundColor: C.panel2, borderRadius: 10, paddingVertical: 13},
  navTxt: {color: C.ink, fontSize: 15, fontWeight: '700'},
  link: {color: C.accentInk, fontSize: 13.5, fontWeight: '700'},
  restHead: {flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 16, paddingBottom: 6, paddingHorizontal: 2},
  restTitle: {color: C.ink, fontSize: 15, fontWeight: '800'},
  restSum: {color: C.faint, fontSize: 12, fontWeight: '600'},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 12, marginTop: 6},
  rowIco: {width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center'},
  rowWho: {color: C.ink, fontSize: 15, fontWeight: '700'},
  rowMeta: {color: C.faint, fontSize: 12, marginTop: 1},
  rowEta: {color: C.dim, fontSize: 14, fontWeight: '800'},
  allDoneBox: {alignItems: 'center', gap: 10, marginTop: 40},
  allDone: {color: C.dim, fontSize: 15, textAlign: 'center'},
  plannedNote: {color: C.faint, fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 6, lineHeight: 17},
  backDrive: {flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingVertical: 8, marginBottom: 4},
  backDriveTxt: {color: C.dim, fontSize: 13, fontWeight: '700'},
  // SMS
  sheetLbl: {color: C.dim, fontSize: 12, fontWeight: '600', marginTop: 6},
  minRow: {flexDirection: 'row', gap: 6, marginTop: 8, marginBottom: 6},
  minChip: {flex: 1, alignItems: 'center', backgroundColor: C.panel2, borderRadius: 8, paddingVertical: 9},
  minOn: {backgroundColor: C.accent},
  minTxt: {color: C.ink, fontSize: 13, fontWeight: '700'},
  tmpl: {flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel2, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 14, marginTop: 8},
  tmplTxt: {color: C.ink, fontSize: 14.5, flex: 1, lineHeight: 20},
  tmplOpen: {alignItems: 'center', paddingVertical: 14},
  tmplOpenTxt: {color: C.people, fontSize: 14, fontWeight: '700'},
  // Ring
  callRow: {flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.panel2, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 12, marginTop: 8},
  callLabel: {color: C.dim, fontSize: 12, fontWeight: '600'},
  callNum: {color: C.ink, fontSize: 17, fontWeight: '800', marginTop: 1},
  // Kör-läge
  drive: {flex: 1, paddingHorizontal: 20, paddingTop: 8},
  driveTop: {flexDirection: 'row', alignItems: 'center', gap: 10},
  chip: {flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.panel2, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5},
  chipTxt: {color: C.ink, fontSize: 12, fontWeight: '800', letterSpacing: 0.8},
  driveSub: {color: C.faint, fontSize: 13, fontWeight: '600'},
  driveWho: {color: C.ink, fontSize: 34, fontWeight: '800', marginTop: 18, letterSpacing: -0.3},
  driveAdr: {color: C.dim, fontSize: 18, marginTop: 4},
  driveBigRow: {flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginBottom: 20},
  driveBig: {color: C.accentInk, fontSize: 112, fontWeight: '800', lineHeight: 112, letterSpacing: -2, includeFontPadding: false},
  driveBigTxt: {color: C.ink, fontSize: 19, lineHeight: 26, marginBottom: 12},
  driveBtns: {gap: 10},
  driveBtn: {flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 14, paddingVertical: 20, paddingHorizontal: 20},
  driveBtnGhost: {backgroundColor: C.panel, borderColor: C.edge, borderWidth: 1},
  driveBtnTxt: {color: C.ink, fontSize: 21, fontWeight: '800', flexShrink: 1},
  // Klart
  doneCard: {backgroundColor: C.panel, borderRadius: 12, padding: 14, marginBottom: 8},
  doneTop: {flexDirection: 'row', alignItems: 'center', gap: 8},
  doneTag: {fontSize: 11.5, fontWeight: '900', letterSpacing: 1.2},
  doneTime: {color: C.dim, fontSize: 14, fontWeight: '800'},
  doneWho2: {color: C.ink, fontSize: 17, fontWeight: '800', marginTop: 8},
  doneMeta: {color: C.faint, fontSize: 12, marginTop: 2},
}));


/* ---- Klart: allt som är lossat (i RUTT eller i Opter) ---- */
export function DoneView({done, onRetry}: {done: any[]; onRetry: (cid: string) => void}) {
  const bottom = useSafeAreaInsets().bottom + 24;
  return (
    <FlatList
      data={done}
      style={{flex: 1}}
      keyExtractor={d => String(d.cid)}
      contentContainerStyle={{paddingHorizontal: 14, paddingBottom: bottom}}
      ListEmptyComponent={<View style={o.allDoneBox}><Bi n="inbox-fill" size={30} color={C.faint} /><Text style={o.allDone}>Inget klart än idag.</Text></View>}
      renderItem={({item: d}) => (
        <View style={o.doneCard}>
          <View style={o.doneTop}>
            <Bi n={d.rejected ? 'x-circle-fill' : 'check-circle-fill'} size={16} color={d.rejected ? C.bad : C.accent2} />
            <Text style={[o.doneTag, {color: d.rejected ? C.bad : C.accent2}]}>{d.rejected ? 'NEKAD' : 'LOSSAD'}</Text>
            <View style={{flex: 1}} />
            <Text style={o.doneTime}>{d.doneAt ? hhmm(new Date(d.doneAt)) : ''}</Text>
          </View>
          <Text style={o.doneWho2} numberOfLines={1}>{d.who || '—'}</Text>
          <Text style={o.doneMeta} numberOfLines={1}>{[d.adr, d.area].filter(Boolean).join(', ')}{d.orderNo ? `  ·  Order ${d.orderNo}` : ''}</Text>
          {(d.pod && (d.pod.name || (d.pod.photos && d.pod.photos.length))) ? (
            <Text style={o.doneMeta}>{d.pod.name ? `Mottagare: ${d.pod.name}` : ''}{d.pod.photos && d.pod.photos.length ? `  ·  ${d.pod.photos.length} foto` : ''}{d.damages ? '  ·  avvikelse' : ''}</Text>
          ) : null}
          {d.byOpter && <Text style={o.doneMeta}>Klarmarkerad i Opter</Text>}
          <SyncLine state={d.sync} label="Lossad" onRetry={() => onRetry(d.cid)} />
        </View>
      )}
    />
  );
}

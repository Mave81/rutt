'use strict';
const {Buffer} = require('buffer');
/*
 * RUTT ↔ Opter — protokoll (läst ur Opter Driver 2.1.12).
 * Little-endian hela vägen. Allt här är verifierat mot en riktig synk.
 *
 * Flöde: Logon → (välj förare ur Resource-listan) → StartWork skickas upp i en
 * Synchronize → servern lämnar ut dina shipments.
 */
const CHARSET = 'utf8';

const MessageType = {
  NoData: 0, Corrupt: 1, NotLoggedOn: 2, Logon: 3, VerifyLogon: 4,
  Synchronize: 5, Disconnect: 19, GetEmployees: 25, GetVehicles: 26,
  ServerNotificationPush: 16,
};

const Table = [
  'None', 'Address', 'Customer', 'DefaultDamageType', 'DefaultPodType',
  'DefaultStatusType', 'FreeTextMessage', 'Hub', 'LogData', 'Position',
  'Resource', 'ResourceStatusLog', 'Shipment', 'ShipmentAddService',
  'ShipmentAddServiceType', 'ShipmentArticle', 'ShipmentChange',
  'ShipmentChangeValue', 'ShipmentDamage', 'ShipmentPackage',
  'ShipmentPackagePod', 'ShipmentPackageScan', 'ShipmentPod',
  'ShipmentPodSuggestion', 'ShipmentPodType', 'ShipmentPriceItem', 'ShipmentScan',
  'ShipmentStatus', 'ShipmentStatusLog', 'UnknownPackageScan', 'UnknownShipmentScan',
  'Vehicle', 'DataChange', 'Setting', 'ShipmentProject', 'ShipmentQuery', 'ShipmentAnswer',
  'MaterialSite', 'Attachment', 'MaterialSitePriceCollectionCalculation', 'DamageEvent',
  'DamageReason', 'DamageTypeEvent', 'DamageEventReason', 'ContainerItem', 'LooseItem',
  'LooseItemType', 'TimeFailureReason', 'TimeFailureExplanation', 'ScanDamage', 'Lock',
  'DamageAttachment', 'ShipmentDamagePackage', 'ShipmentCustomer', 'Query', 'ScanQueryAnswer',
  'Office',
];
const TableOrd = Object.fromEntries(Table.map((n, i) => [n, i]));

const DT = {
  None: 0, StartTable: 1, EndTable: 2, EndData: 3, String: 4, Int32: 5,
  DateTime: 6, Bool: 7, DecimalNull: 8, Int32Null: 9, BoolNull: 10,
  DateTimeNull: 11, DecimalInt16Decimals: 12, DecimalInt16NoDecimals: 13,
  DecimalInt32Decimals: 14, DecimalInt32NoDecimals: 15,
  DecimalInt64Decimals: 16, DecimalInt64NoDecimals: 17, StringNull: 18,
};

const RST = { None: 0, StartWork: 1, EndWork: 2, StartLunch: 3, EndLunch: 4, StartBreak: 5, EndBreak: 6, ChangeSecondaryResource: 7 };

/* Fältnummer (ordinal i varje entitets PropertyNumber-enum) */
const F = {
  Address: { 2: 'line1', 3: 'line2', 4: 'line3', 5: 'company', 6: 'street', 7: 'streetNo', 8: 'zip', 9: 'city', 11: 'entreCode', 12: 'phone', 16: 'driverMessage', 17: 'info', 18: 'lng', 19: 'lat' },
  Resource: { 1: 'name', 2: 'shortName', 3: 'code', 4: 'defVehicle', 251: 'resId' },
  Shipment: {
    2: 'adrFrom', 3: 'adrTo', 16: 'earliestPickup', 17: 'latestPickup',
    18: 'earliestDelivery', 19: 'latestDelivery', 20: 'customer',
    24: 'serviceType', 43: 'weight', 51: 'packages', 53: 'message',
    55: 'driverMessage', 58: 'shipmentId', 59: 'orderId',
    21: 'customerId', 23: 'customerRef', 34: 'senderRef', 35: 'receiverRef', 36: 'timeMinutes',
    61: 'podNameReq', 62: 'podSigReq', 63: 'podRemarkReq', 71: 'orderReceiver', 73: 'customerPhone1',
    117: 'podPicReq', 119: 'customerRefPhone', 120: 'customerRefMobile', 121: 'podCommentReq', 123: 'customerPhone2',
  },
  ShipmentPodSuggestion: { 1: 'shiId', 2: 'name', 3: 'revoked' },
  ShipmentPackage: { 1: 'shiId', 2: 'quantity', 3: 'weight', 14: 'text', 15: 'packageType' },
  FreeTextMessage: { 1: 'resId', 2: 'vhcId', 3: 'shiId', 4: 'outgoing', 5: 'confirmed', 6: 'text', 7: 'created', 8: 'externalId', 9: 'fromName' },
};

/* ---- byte-läsare ---- */
const i16 = (b, p) => b.readInt16LE(p);
const i32 = (b, p) => b.readInt32LE(p);
const i64 = (b, p) => b.readBigInt64LE(p);

/* C#-DateTime: fält = 4-byte sekunder sedan 2000-01-01 (UTC). EndData = 8-byte ticks. */
const EPOCH2000 = Date.UTC(2000, 0, 1);
const secs2000ToDate = (s) => (s === -2147483648 ? null : new Date(EPOCH2000 + s * 1000));
const ticksToDate = (t) => (!t || t === 0n ? null : new Date(Number(t / 10000n) - 62135596800000));
const dateToSecs2000 = (d) => Math.round((d.getTime() - EPOCH2000) / 1000);
const dateToTicks = (d) => BigInt(d.getTime() + 62135596800000) * 10000n;

/* ---- ram: @ + typ + längd(4,LE) + payload + @ → base64 ---- */
function frame(messageType, payload) {
  const body = payload || Buffer.alloc(0);
  const buf = Buffer.alloc(6 + body.length + 1);
  buf[0] = 0x40; buf[1] = messageType & 0xff;
  buf.writeInt32LE(body.length, 2);
  body.copy(buf, 6);
  buf[6 + body.length] = 0x40;
  return buf.toString('base64');
}
function unframe(b64) {
  if (!b64) return { type: MessageType.NoData, payload: Buffer.alloc(0) };
  const b = Buffer.from(b64, 'base64');
  if (b.length < 7 || b[0] !== 0x40) return { type: MessageType.NoData, payload: Buffer.alloc(0), raw: b };
  const len = b.readInt32LE(2);
  return { type: b[1], payload: b.subarray(6, 6 + len), raw: b };
}

/* ---- avkodning (verifierad) ---- */
function readValue(dt, b, pos) {
  const prop = b[pos.i++];
  let value = null, raw = null;
  switch (dt) {
    case DT.String: { const len = i16(b, pos.i); pos.i += 2; value = b.toString(CHARSET, pos.i, pos.i + len); pos.i += len; break; }
    case DT.StringNull: break;
    case DT.Int32: value = i32(b, pos.i); pos.i += 4; break;
    case DT.Int32Null: break;
    case DT.Bool: value = b[pos.i] === 1; pos.i += 1; break;
    case DT.BoolNull: break;
    case DT.DateTime: { raw = i32(b, pos.i); pos.i += 4; value = secs2000ToDate(raw); break; }
    case DT.DateTimeNull: break;
    case DT.DecimalNull: break;
    case DT.DecimalInt16Decimals: { const s = b[pos.i++]; const v = i16(b, pos.i); pos.i += 2; value = v / 10 ** s; break; }
    case DT.DecimalInt16NoDecimals: { value = i16(b, pos.i); pos.i += 2; break; }
    case DT.DecimalInt32Decimals: { const s = b[pos.i++]; const v = i32(b, pos.i); pos.i += 4; value = v / 10 ** s; break; }
    case DT.DecimalInt32NoDecimals: { value = i32(b, pos.i); pos.i += 4; break; }
    case DT.DecimalInt64Decimals: { const s = b[pos.i++]; const v = i64(b, pos.i); pos.i += 8; value = Number(v) / 10 ** s; break; }
    case DT.DecimalInt64NoDecimals: { value = Number(i64(b, pos.i)); pos.i += 8; break; }
    default: throw new Error('okänd datatyp ' + dt + ' @ ' + (pos.i - 1));
  }
  return [prop, value, raw];
}
function readTableHeader(b, pos) {
  const i = pos.i;
  const table = Table[b[i]] || ('Table' + b[i]);
  const headerLen = b[i + 1];
  const row = { table, key: { identityId: i32(b, i + 2), offId: i32(b, i + 6), xxxId: i32(b, i + 10) }, columns: {}, raw: {} };
  pos.i += headerLen + 2;
  return row;
}
function decodeSync(payload) {
  const b = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const pos = { i: 0 }; const rows = []; let syncTimes = null;
  function walk(parent) {
    while (pos.i < b.length) {
      const dt = b[pos.i++];
      if (dt === DT.StartTable) { const row = readTableHeader(b, pos); rows.push(row); walk(row); }
      else if (dt === DT.EndTable) { pos.i += 1; return; }
      else if (dt === DT.EndData) { const d = i64(b, pos.i); pos.i += 8; const f = i64(b, pos.i); pos.i += 8; syncTimes = { dynamic: ticksToDate(d), fixed: ticksToDate(f) }; return; }
      else { const [prop, value, raw] = readValue(dt, b, pos); if (parent) { const name = (F[parent.table] && F[parent.table][prop]) || ('p' + prop); parent.columns[name] = value; parent.raw[prop] = raw != null ? raw : value; } }
    }
  }
  try { walk(null); } catch (e) { return { rows, syncTimes, error: String(e), decodedBytes: pos.i, totalBytes: b.length }; }
  return { rows, syncTimes, decodedBytes: pos.i, totalBytes: b.length };
}

/* ---- byte-skrivare (för uppladdning) ---- */
function W() { return { parts: [], push(b) { this.parts.push(b); }, build() { return Buffer.concat(this.parts); } }; }
const wB = (w, n) => w.push(Buffer.from([n & 0xff]));
const wI16 = (w, n) => { const b = Buffer.alloc(2); b.writeInt16LE(n); w.push(b); };
const wI32 = (w, n) => { const b = Buffer.alloc(4); b.writeInt32LE(n); w.push(b); };
const wI64 = (w, n) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(n)); w.push(b); };
function wInt(w, prop, val) { if (val == null) { wB(w, DT.Int32Null); wB(w, prop); } else { wB(w, DT.Int32); wB(w, prop); wI32(w, val); } }
function wBool(w, prop, val) { if (val == null) { wB(w, DT.BoolNull); wB(w, prop); } else { wB(w, DT.Bool); wB(w, prop); wB(w, val ? 1 : 0); } }
function wStr(w, prop, val) { if (val == null || val === '') { wB(w, DT.StringNull); wB(w, prop); } else { wB(w, DT.String); wB(w, prop); const s = Buffer.from(val, CHARSET); wI16(w, s.length); w.push(s); } }
function wDate(w, prop, val) { if (val == null) { wB(w, DT.DateTimeNull); wB(w, prop); } else { wB(w, DT.DateTime); wB(w, prop); wI32(w, dateToSecs2000(val)); } }
function wStartTable(w, tableName, key) { wB(w, DT.StartTable); wB(w, TableOrd[tableName]); wB(w, 14); wI32(w, key.identityId || 0); wI32(w, key.offId || 0); wI32(w, key.xxxId || 0); wB(w, 0); wB(w, 0); }
/* Nya rader: Opter ger varje nyskapad rad ett eget löpnummer (identityId) och
 * kontors-id (OFF_Id) i radhuvudet; XXX_Id = 0 tills servern tilldelat ett.
 * Löpnumret startar från klockan så det inte krockar efter omstart. */
let __ident = (Math.floor(Date.now() / 1000) % 1000000000) + 1;
const nextIdentity = () => (__ident = __ident >= 2147483000 ? 1 : __ident + 1);
const lastIdentity = () => __ident;
function wNewRow(w, tableName, offId) { wStartTable(w, tableName, { identityId: nextIdentity(), offId: offId || 0, xxxId: 0 }); }
function wEndTable(w, tableName) { wB(w, DT.EndTable); wB(w, TableOrd[tableName]); }
function wEndData(w, dyn, fix) { wB(w, DT.EndData); wI64(w, dyn ? dateToTicks(dyn) : 0); wI64(w, fix ? dateToTicks(fix) : 0); }

/* StartWork-uppladdning: en ResourceStatusLog-post + EndData(0,0) för full hämtning. */
function wResourceStatus(w, { offId, resId, vhcId, rstType }) {
  wNewRow(w, 'ResourceStatusLog', offId);
  if (resId) wInt(w, 1, resId);     // RSL_RES_Id
  if (rstType) wInt(w, 2, rstType); // RSL_RST_Id
  if (vhcId) wInt(w, 3, vhcId);     // RSL_VHC_Id
  // RSL_Outgoing=false och tomt telefonnr = standard → skrivs inte (som Opter)
  wDate(w, 10, new Date());         // RSL_LogTime
  wEndTable(w, 'ResourceStatusLog');
}
function encodeStartWork({ offId, resId, vhcId }) {
  const w = W();
  wResourceStatus(w, { offId, resId, vhcId, rstType: RST.StartWork });
  wEndData(w, null, null);    // 0,0 = full synk tillbaka
  return w.build();
}

/* Arbetstidsstatus (rast/lunch/avsluta dag) – samma ResourceStatusLog-mekanism
 * som StartWork, bara annan RST-typ. Verifierad shape. */
function encodeWorkStatus({ offId, rstType, resId, vhcId }) {
  const w = W();
  wResourceStatus(w, { offId, resId, vhcId, rstType });
  wEndData(w, null, null);
  return w.build();
}

/* Tom uppladdning som ber om full synk tillbaka (EndData 0,0). */
function encodeFullSync() { const w = W(); wEndData(w, null, null); return w.build(); }

/* ---- inloggning ---- */
function logonPayload({ user, pass, major = 2, minor = 1, build = 12, sysInfo = 'rutt', deviceId }) {
  return Buffer.from([user, pass, major, minor, build, sysInfo, deviceId].join('\n'), CHARSET);
}
/* Logon-svar (\n-delat), index enligt appens logon-parser */
function parseLogon(payload) {
  const t = Buffer.from(payload).toString(CHARSET);
  const p = t.split('\n');
  const num = (x) => (x == null || x === '' ? 0 : parseInt(x, 10) || 0);
  const info = {
    acdOffId: num(p[0]), resId: num(p[1]), name: p[2] || '', guid: p[3] || '',
    vhcId: num(p[4]), chooseVehicle: /^true$/i.test(p[5] || ''), number: p[11] || '',
    fields: p,
  };
  info.ok = info.guid.length > 0;       // giltig session = vi fick ett guid
  info.needChoose = info.resId === 0;   // RES_Id 0 → välj förare
  return info;
}

/* Meddelanden (chatt) ur en synk → sorterade bubblor */
function messageList(decoded) {
  const out = [];
  const seen = new Set();
  for (const r of decoded.rows) {
    if (r.table !== 'FreeTextMessage') continue;
    const c = r.columns;
    // Samma rad = samma serverid (XXX_Id) när det finns, annars samma löpnummer (som Opter).
    const sig = r.key.xxxId > 0 ? 'x' + r.key.xxxId : 'i' + r.key.identityId + '|' + (c.text || '');
    if (seen.has(sig)) continue;
    seen.add(sig);
    const received = c.fromName ? true : c.outgoing === true; // Outgoing=true = från kontoret
    out.push({
      key: r.key,
      text: c.text || '',
      from: c.fromName || '',
      created: c.created instanceof Date ? c.created : (typeof c.created === 'string' ? new Date(c.created) : null),
      received,                       // true = Mottaget (från kontoret), false = Skickat (av dig)
      confirmed: c.confirmed === true,
      serverId: r.key.xxxId > 0 ? r.key.xxxId : 0, // > 0 = sparat i Opter
    });
  }
  out.sort((a, b) => (a.created ? a.created.getTime() : 0) - (b.created ? b.created.getTime() : 0));
  return out;
}

/* Markera mottagna meddelanden lästa (FTM_Confirmed = true) → synka upp */
function encodeMarkRead(keys) {
  const w = W();
  for (const key of keys) {
    wStartTable(w, 'FreeTextMessage', key);
    wBool(w, 5, true);              // FTM_Confirmed
    wEndTable(w, 'FreeTextMessage');
  }
  wEndData(w, null, null);
  return w.build();
}

/* Skicka ett nytt meddelande (FTM_Outgoing = true) → synka upp */
/* I Opter betyder FTM_Outgoing=true "från kontoret". Förarens meddelande är
 * Outgoing=false (standard → skrivs inte), precis som Opter Driver gör. */
function encodeSendMessage({offId, resId, vhcId, shiId, text}) {
  const w = W();
  wNewRow(w, 'FreeTextMessage', offId);
  if (resId) wInt(w, 1, resId);    // FTM_RES_Id
  if (vhcId) wInt(w, 2, vhcId);    // FTM_VHC_Id
  if (shiId) wInt(w, 3, shiId);    // FTM_SHI_Id (valfritt: kopplat till en order)
  wStr(w, 6, text);                // FTM_Text
  wDate(w, 7, new Date());         // FTM_Created
  wEndTable(w, 'FreeTextMessage');
  wEndData(w, null, null);
  return w.build();
}

/* Resource-listan ur en synk → [{resId, name}] (för namnvalet) */
function resourceList(decoded) {
  const out = [];
  for (const r of decoded.rows) {
    if (r.table !== 'Resource') continue;
    const resId = r.columns.resId != null ? r.columns.resId : r.key.xxxId;
    const name = r.columns.name || r.columns.shortName || ('Resurs ' + resId);
    if (resId) out.push({ resId, name });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  return out;
}

/* ---- Opter-rader → rutt {cargo, stops} ---- */
const hhmm = (d) => d ? new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' }).format(d) : null;
function toRutt(decoded) {
  const addresses = {};
  for (const r of decoded.rows) if (r.table === 'Address') for (const id of [r.key.identityId, r.key.xxxId]) if (id) addresses[id] = r.columns;
  const pkgBy = {};
  for (const r of decoded.rows) if (r.table === 'ShipmentPackage') { const k = r.columns.shiId; (pkgBy[k] = pkgBy[k] || []).push(r.columns); }

  const sugBy = {};
  for (const r of decoded.rows) if (r.table === 'ShipmentPodSuggestion' && !r.columns.revoked && r.columns.name) { const k = r.columns.shiId; (sugBy[k] = sugBy[k] || []).push(String(r.columns.name).trim()); }

  const cargo = {}; const stops = []; let n = 0;
  const line = (a) => a ? [a.street, a.streetNo].filter(Boolean).join(' ') : '';
  // Alla nummer som går att ringa för stoppet: adressens + orderns (kund/referens), utan dubbletter.
  const phones = (a, c, side) => {
    const out = []; const seen = new Set();
    const add = (label, num) => { const d = String(num || '').replace(/[^0-9+]/g, ''); if (d.length >= 5 && !seen.has(d)) { seen.add(d); out.push({label, num: d}); } };
    if (a) add([a.line1, a.company].filter(Boolean)[0] || (side === 'from' ? 'Avsändare' : 'Mottagare'), a.phone);
    if (c.customerRef) { add(c.customerRef + ' (mobil)', c.customerRefMobile); add(c.customerRef, c.customerRefPhone); }
    else { add('Referens (mobil)', c.customerRefMobile); add('Referens', c.customerRefPhone); }
    add('Kund', c.customerPhone1); add('Kund', c.customerPhone2);
    return out;
  };
  const contact = (a) => a ? [a.line1, a.line2].filter(x => x && x !== a.company).join(', ') : '';
  for (const r of decoded.rows) {
    if (r.table !== 'Shipment') continue;
    const c = r.columns;
    const from = addresses[c.adrFrom] || null, to = addresses[c.adrTo] || null;
    const cid = String(c.orderId || c.shipmentId || r.key.xxxId || ++n);
    const pkgs = pkgBy[r.key.xxxId] || pkgBy[c.shipmentId] || [];
    const pal = pkgs.reduce((s, p) => s + (Number(p.quantity) || 0), 0) || 1;
    const kg = Number(c.weight) || pkgs.reduce((s, p) => s + (Number(p.weight) || 0), 0) || 0;
    const shiId = r.key.xxxId;
    const pkgText = pkgs.map(p => [p.quantity ? p.quantity + ' st' : '', p.packageType, p.text].filter(Boolean).join(' ')).filter(Boolean).join(', ');
    cargo[cid] = { name: c.customer || c.serviceType || ('Order ' + cid), pal, kg, to: to && to.city ? to.city : '', goods: pkgText };
    const req = { name: !!c.podNameReq, sig: !!c.podSigReq, pic: !!c.podPicReq, comment: !!(c.podCommentReq || c.podRemarkReq) };
    const common = { shiId, orderNo: c.orderId || c.shipmentId || null, customer: c.customer || '', service: c.serviceType || '', kg, pal, goods: pkgText, msg: c.message || '', driverMsg: c.driverMessage || '' };
    stops.push({ ...common, verb: 'Hämta', adr: line(from), area: from && from.city ? from.city : '', zip: from && from.zip || '', lat: from && from.lat != null ? Number(from.lat) : null, lng: from && from.lng != null ? Number(from.lng) : null, pickup: cid, deadline: hhmm(c.latestPickup), earliest: hhmm(c.earliestPickup), who: (from && from.company) || c.customer || '', contact: contact(from), tel: phones(from, c, 'from'), code: from && from.entreCode || '', adrMsg: [from && from.driverMessage, from && from.info].filter(Boolean).join(' · '), ref: c.senderRef || '', note: [c.serviceType, kg ? kg + ' kg' : '', c.message].filter(Boolean).join(' · ') });
    stops.push({ ...common, verb: 'Lämna', adr: line(to), area: to && to.city ? to.city : '', zip: to && to.zip || '', lat: to && to.lat != null ? Number(to.lat) : null, lng: to && to.lng != null ? Number(to.lng) : null, drop: cid, deadline: hhmm(c.latestDelivery), earliest: hhmm(c.earliestDelivery), who: (to && to.company) || c.orderReceiver || c.customer || '', contact: contact(to), tel: phones(to, c, 'to'), code: to && to.entreCode || '', adrMsg: [to && to.driverMessage, to && to.info].filter(Boolean).join(' · '), ref: c.receiverRef || '', req, suggest: [...new Set(sugBy[shiId] || [])], note: [kg ? kg + ' kg' : '', c.driverMessage].filter(Boolean).join(' · ') });
  }
  return { cargo, stops };
}

module.exports = {
  MessageType, Table, DT, RST, F, frame, unframe, decodeSync, ticksToDate,
  logonPayload, parseLogon, resourceList, encodeStartWork, encodeWorkStatus, toRutt,
  messageList, encodeMarkRead, encodeSendMessage, lastIdentity, encodeFullSync,
};

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
  DecimalInt64Decimals: 16, DecimalInt64NoDecimals: 17, StringNull: 18, ByteArray: 19,
};

const RST = { None: 0, StartWork: 1, EndWork: 2, StartLunch: 3, EndLunch: 4, StartBreak: 5, EndBreak: 6, ChangeSecondaryResource: 7 };

/* Fältnummer (ordinal i varje entitets PropertyNumber-enum) */
const F = {
  Address: { 2: 'line1', 3: 'line2', 4: 'line3', 5: 'company', 6: 'street', 7: 'streetNo', 8: 'zip', 9: 'city', 11: 'entreCode', 12: 'phone', 16: 'driverMessage', 17: 'info', 18: 'lng', 19: 'lat' },
  Resource: { 1: 'name', 2: 'shortId', 3: 'externalId', 4: 'supplierId', 5: 'active', 8: 'driver' },
  Office: { 1: 'emailDispatch', 2: 'phoneDispatch' },
  Shipment: {
    1: 'consignmentParent', 14: 'orderDate', 15: 'shipmentDate', 60: 'locked', 66: 'revoked', 67: 'revokedConfirmed', 80: 'isConsignment',
    124: 'latestDelDT', 125: 'latestDelDateTTY', 126: 'latestDelTimeTTY', 127: 'earliestDelDT', 128: 'earliestDelDateTTY', 129: 'earliestDelTimeTTY',
    130: 'latestPickDT', 131: 'latestPickDateTTY', 132: 'latestPickTimeTTY', 133: 'earliestPickDT', 134: 'earliestPickDateTTY', 135: 'earliestPickTimeTTY',
    2: 'adrFrom', 3: 'adrTo', 11: 'shsId', 16: 'earliestPickup', 17: 'latestPickup',
    18: 'earliestDelivery', 19: 'latestDelivery', 20: 'customer',
    24: 'serviceType', 43: 'weight', 51: 'packages', 53: 'message',
    55: 'driverMessage', 58: 'shipmentId', 59: 'orderId',
    30: 'freightBill', 33: 'goodsType', 37: 'distanceKm', 40: 'volume', 41: 'area', 42: 'loadMeter', 52: 'extMessage', 54: 'senderInstr',
    21: 'customerId', 23: 'customerRef', 34: 'senderRef', 35: 'receiverRef', 36: 'timeMinutes',
    56: 'externalId', 101: 'customerDefaultPOT', 138: 'podLockMainType',
    61: 'podNameReq', 62: 'podSigReq', 63: 'podRemarkReq', 71: 'orderReceiver', 73: 'customerPhone1',
    117: 'podPicReq', 119: 'customerRefPhone', 120: 'customerRefMobile', 121: 'podCommentReq', 123: 'customerPhone2',
  },
  ShipmentPodSuggestion: { 1: 'shiId', 2: 'name', 3: 'revoked' },
  Setting: { 1: 'name', 2: 'value', 3: 'descr', 5: 'active' },
  Position: { 1: 'resId', 2: 'vhcId', 3: 'lng', 4: 'lat', 5: 'alt', 6: 'dir', 7: 'speed', 8: 'time' },
  ShipmentStatus: { 1: 'shiId', 2: 'dstId', 3: 'arrived', 4: 'accepted', 5: 'rejected', 6: 'pickup', 7: 'delivery', 8: 'completed', 10: 'userOption', 11: 'msgRequired', 14: 'pod', 15: 'code', 16: 'name', 21: 'order' },
  ShipmentStatusLog: { 1: 'shiId', 2: 'shsId', 3: 'deleted', 4: 'logTime' },
  ShipmentPodType: { 1: 'shiId', 2: 'nameReq', 3: 'sigReq', 4: 'remarkReq', 5: 'name', 6: 'descr', 7: 'revoked', 8: 'externalId', 9: 'isDefault', 10: 'mainId', 11: 'showSub', 12: 'requireSub', 13: 'externalIdMain', 14: 'commentReq', 15: 'scanCommentReq', 16: 'picReq' },
  DefaultPodType: { 1: 'nameReq', 2: 'sigReq', 3: 'remarkReq', 4: 'name', 5: 'descr', 6: 'externalId', 7: 'isDefault', 8: 'active', 9: 'mainId', 10: 'showSub', 11: 'requireSub', 12: 'externalIdMain', 13: 'commentReq', 14: 'scanCommentReq', 15: 'picReq', 16: 'allowBeforePickup', 17: 'allowAfterPickup' },
  ShipmentPod: { 1: 'shiId', 2: 'sptId', 3: 'dptId', 4: 'date', 5: 'time', 6: 'name', 7: 'descr', 8: 'signature', 9: 'packageCount', 10: 'sptIdSub', 11: 'dptIdSub', 12: 'lat', 13: 'lng', 14: 'comment' },
  ShipmentPackagePod: { 1: 'spaId' },
  ShipmentPackage: { 1: 'shiId', 2: 'quantity', 3: 'weight', 14: 'text', 15: 'packageType' },
  ShipmentAddServiceType: { 1: 'shiId', 2: 'name', 3: 'descr', 4: 'externalId', 5: 'revoked' },
  ShipmentAddService: { 1: 'shiId', 2: 'satId', 3: 'number', 4: 'code', 5: 'descr', 6: 'externalId', 8: 'active' },
  DefaultDamageType: { 1: 'name', 2: 'descr', 3: 'externalId', 4: 'order', 5: 'active', 6: 'id', 7: 'forceComment', 8: 'isDefault', 9: 'forceEvent', 10: 'forcePicture', 11: 'inMobile' },
  DamageEvent: { 1: 'name', 2: 'descr', 3: 'order', 4: 'active', 5: 'id', 6: 'forceReason' },
  DamageReason: { 1: 'id', 2: 'name', 3: 'descr', 4: 'order', 5: 'active' },
  DamageTypeEvent: { 1: 'id', 2: 'datId', 3: 'daeId' },
  DamageEventReason: { 1: 'id', 2: 'daeId', 3: 'darId' },
  ShipmentDamage: { 1: 'shiId', 2: 'spaId', 4: 'ddtId', 9: 'comment', 13: 'active', 16: 'daeId', 17: 'darId' },
  Attachment: { 1: 'delId', 2: 'filename', 3: 'comment', 4: 'revoked', 6: 'fftId' },
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
    case DT.ByteArray: { const len = i32(b, pos.i); pos.i += 4; value = {bytes: len}; pos.i += len; break; }
    default: throw new Error('okänd datatyp ' + dt + ' @ ' + (pos.i - 1));
  }
  return [prop, value, raw];
}
function readTableHeader(b, pos) {
  const i = pos.i;
  const table = Table[b[i]] || ('Table' + b[i]);
  const headerLen = b[i + 1];
  const row = { table, key: { identityId: i32(b, i + 2), offId: i32(b, i + 6), xxxId: i32(b, i + 10) }, columns: {}, raw: {},
    // extra/bekräftad-byten i huvudet – skickas tillbaka oförändrade vid uppdatering
    hdr: { extra: headerLen > 12 ? b[i + 14] : 0, conf: headerLen > 13 ? b[i + 15] : 0 }, parent: null };
  pos.i += headerLen + 2;
  return row;
}
function decodeSync(payload) {
  const b = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const pos = { i: 0 }; const rows = []; let syncTimes = null;
  function walk(parent) {
    while (pos.i < b.length) {
      const dt = b[pos.i++];
      if (dt === DT.StartTable) { const row = readTableHeader(b, pos); if (parent) row.parent = {table: parent.table, key: parent.key}; rows.push(row); walk(row); }
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
function wNewRow(w, tableName, offId) {
  const off = offId || 0;
  wStartTable(w, tableName, { identityId: nextIdentity(), offId: off, xxxId: 0 });
  if (off !== 1) wInt(w, 250, off); // OFF_Id som data (Opter skriver den när den skiljer sig från 1)
}
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

/* ---- Statusbyte (+ ev. leveransbevis) – exakt som Opter Driver ----
 * Befintlig order: StartTable(Shipment, serverns nyckel) + SHI_SHS_Id (fält 11)
 *   └ ny ShipmentStatusLog: SSL_SHI_Id, SSL_SHS_Id, SSL_LogTime
 *   └ ny ShipmentPod (vid kvittens): typ, datum, tid, namn, anmärkning, kommentar, signatur, antal kollin, bild
 * Signatur = "x,y,x,y,…" i pixlar, "-1,-1" före varje nytt streck (Opters FingerPaint-format).
 */
function wBytes(w, prop, buf) { if (!buf || !buf.length) return; wB(w, DT.ByteArray); wB(w, prop); wI32(w, buf.length); w.push(buf); }
function signatureString(strokes, scale) {
  const out = [];
  for (const st of strokes || []) {
    if (!st || st.length < 1) continue;
    out.push(-1, -1);
    for (const p of st) out.push(Math.round(p.x * scale), Math.round(p.y * scale));
  }
  return out.join(',');
}
function encodeShipmentStatus({ live, statusId, pod }) {
  // Exakt som Opter Driver: (registerPod + setShipmentStatus) i samma synk.
  //  Shipment: 11 SHI_SHS_Id (+ 56 SHI_ExternalId som String när en kvittens följer med).
  //  Underrader i ordning: ShipmentStatusLog, ShipmentPod (med ShipmentPackagePod per kolli).
  //  Nya underrader har OFF_Id 0 (huvud + 250 = 0), XXX_Id 0.
  const w = W();
  const k = live.key;
  wB(w, DT.StartTable); wB(w, TableOrd.Shipment); wB(w, 14);
  wI32(w, k.identityId || 0); wI32(w, k.offId || 0); wI32(w, k.xxxId || 0);
  wB(w, (live.hdr && live.hdr.extra) || 0); wB(w, (live.hdr && live.hdr.conf) || 0);
  wInt(w, 11, statusId);                                  // SHI_SHS_Id
  if (pod) { const ext = String(live.externalId || ''); wB(w, DT.String); wB(w, 56); const b = Buffer.from(ext, CHARSET); wI16(w, b.length); if (b.length) w.push(b); }
  wNewRow(w, 'ShipmentStatusLog', 0);
  wInt(w, 1, live.shiId);                                 // SSL_SHI_Id
  wInt(w, 2, statusId);                                   // SSL_SHS_Id
  wDate(w, 4, new Date());                                // SSL_LogTime
  wEndTable(w, 'ShipmentStatusLog');
  if (pod) {
    const now = new Date();
    wNewRow(w, 'ShipmentPod', 0);
    for (const spaId of (live.packageIds || [])) {        // en ShipmentPackagePod per kolli
      wNewRow(w, 'ShipmentPackagePod', 0);
      wInt(w, 1, spaId);
      wEndTable(w, 'ShipmentPackagePod');
    }
    if (pod.sptId) wInt(w, 2, pod.sptId);                 // SHP_SPT_Id (−DPT_Id när ordern saknar egna typer)
    if (pod.dptId) wInt(w, 3, pod.dptId);                 // SHP_DPT_Id
    wDate(w, 4, now); wDate(w, 5, now);                   // SHP_Date, SHP_Time
    if (pod.name) wStr(w, 6, pod.name);                   // SHP_Name
    if (pod.remark) wStr(w, 7, pod.remark);               // SHP_Descr (anmärkning)
    if (pod.comment) wStr(w, 14, pod.comment);            // SHP_Comment
    if (pod.signature) wStr(w, 8, pod.signature);         // SHP_Signature
    if (pod.packageCount != null) wInt(w, 9, pod.packageCount); // SHP_PackageCount
    if (pod.sptIdSub) wInt(w, 10, pod.sptIdSub);
    if (pod.dptIdSub) wInt(w, 11, pod.dptIdSub);
    if (pod.lng != null) wDec(w, 13, pod.lng);            // SHP_Longitude
    if (pod.lat != null) wDec(w, 12, pod.lat);            // SHP_Latitude
    if (pod.image) wBytes(w, 15, pod.image);              // bild (jpeg)
    wEndTable(w, 'ShipmentPod');
  }
  wEndTable(w, 'Shipment');
  wEndData(w, null, null);
  return w.build();
}

/* ---- Ändra en order i efterhand – exakt som Opter Driver (ShipmentDetailViewPager) ----
 * Allt läggs som nya underrader i orderns Shipment-block och skickas i en synk, i Opters ordning:
 *   ShipmentAddService → ShipmentDamage → ShipmentStatusLog → ShipmentChange → ShipmentPod → Attachment
 *  - status:    SHI_SHS_Id (11) + ShipmentStatusLog (Välj status)
 *  - pod:       SHI_ExternalId (56) + ShipmentPod (Kvittens)
 *  - addServices [{satId, number, descr}]                     (Tilläggstjänster: SHA_SAT_Id 2, SHA_Number 3, SHA_Descr 5)
 *  - damages    [{ddtId, daeId, darId, comment, images:[{name, bytes}]}]  (Avvikelse: DamageAttachment-barn först, sen SDA 4/16/17/9)
 *  - changes    [{cet, kind:'dec'|'int'|'str', value}]       (Ändringar: en ShipmentChange med ett ShipmentChangeValue per fält)
 *  - images     [{bytes, comment, orderId}]                   (Lägg till bild: Attachment DEA 1,2,3,6,5)
 * Nya rader: OFF_Id 0 i huvudet + fält 250 = 0, XXX_Id 0 – som Opter gör för rader skapade i telefonen.
 */
function wDecExact(w, prop, value) {
  // BigDecimal utan avrundning (SCV_Value / SHA_Number): skala = antal decimaler som skrivits.
  let s = String(value).trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error('ogiltigt tal: ' + value);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  const neg = s.startsWith('-'); if (neg) s = s.slice(1);
  const dot = s.indexOf('.');
  const scale = dot < 0 ? 0 : s.length - dot - 1;
  const unscaled = BigInt(s.replace('.', '')) * (neg ? -1n : 1n);
  const n = Number(unscaled);
  if (n >= -32768 && n <= 32767) {
    if (scale > 0) { wB(w, DT.DecimalInt16Decimals); wB(w, prop); wB(w, scale); wI16(w, n); }
    else { wB(w, DT.DecimalInt16NoDecimals); wB(w, prop); wI16(w, n); }
  } else if (n >= -2147483648 && n <= 2147483647) {
    if (scale > 0) { wB(w, DT.DecimalInt32Decimals); wB(w, prop); wB(w, scale); wI32(w, n); }
    else { wB(w, DT.DecimalInt32NoDecimals); wB(w, prop); wI32(w, n); }
  } else {
    if (scale > 0) { wB(w, DT.DecimalInt64Decimals); wB(w, prop); wB(w, scale); wI64(w, unscaled); }
    else { wB(w, DT.DecimalInt64NoDecimals); wB(w, prop); wI64(w, unscaled); }
  }
}
function wStrAlways(w, prop, val) { const b = Buffer.from(String(val == null ? '' : val), CHARSET); wB(w, DT.String); wB(w, prop); wI16(w, b.length); if (b.length) w.push(b); }
const CET = {
  SHI_CustomerReference: 23, SHI_FreightBill: 30, SHI_GoodsType: 33, SHI_TimeMinutes: 34, SHI_DistanceKM: 35, SHI_Volume: 36,
  SHI_Area: 37, SHI_LoadMeter: 38, SHI_Weight: 39, SHI_Packages: 40, SHI_ExternalMessage: 41, SHI_Message: 42, SHI_DriverMessage: 43,
  SHI_SenderReference: 69, SHI_ReceiverReference: 70, SHI_TimeFailureComment: 106, SHI_TFR_Id: 107,
};
function encodeShipmentEdit({ live, statusId, pod, addServices, damages, changes, images }) {
  const w = W();
  const k = live.key;
  wB(w, DT.StartTable); wB(w, TableOrd.Shipment); wB(w, 14);
  wI32(w, k.identityId || 0); wI32(w, k.offId || 0); wI32(w, k.xxxId || 0);
  wB(w, (live.hdr && live.hdr.extra) || 0); wB(w, (live.hdr && live.hdr.conf) || 0);
  if (statusId) wInt(w, 11, statusId);                                   // SHI_SHS_Id
  if (pod) wStrAlways(w, 56, live.externalId || '');                    // SHI_ExternalId (följer med en kvittens)
  for (const a of addServices || []) {
    wNewRow(w, 'ShipmentAddService', 0);
    wInt(w, 2, a.satId);                                                 // SHA_SAT_Id
    if (a.number != null && String(a.number) !== '' && Number(String(a.number).replace(',', '.')) !== 0) wDecExact(w, 3, a.number); // SHA_Number (0 = standard → skrivs inte)
    if (a.descr) wStr(w, 5, a.descr);                                    // SHA_Descr
    wEndTable(w, 'ShipmentAddService');
  }
  for (const d of damages || []) {
    wNewRow(w, 'ShipmentDamage', 0);
    for (const im of d.images || []) {                                    // DamageAttachment: filnamn + bild
      wNewRow(w, 'DamageAttachment', 0);
      if (im.name) wStr(w, 3, im.name);
      wBytes(w, 4, im.bytes);
      wEndTable(w, 'DamageAttachment');
    }
    if (d.ddtId) wInt(w, 4, d.ddtId);                                    // SDA_DDT_Id
    if (d.daeId) wInt(w, 16, d.daeId);                                   // SDA_DAE_Id
    if (d.darId) wInt(w, 17, d.darId);                                   // SDA_DAR_Id
    if (d.comment) wStr(w, 9, d.comment);                                // SDA_Comment
    wEndTable(w, 'ShipmentDamage');
  }
  if (statusId) {
    wNewRow(w, 'ShipmentStatusLog', 0);
    wInt(w, 1, live.shiId);
    wInt(w, 2, statusId);
    wDate(w, 4, new Date());
    wEndTable(w, 'ShipmentStatusLog');
  }
  if (changes && changes.length) {
    wNewRow(w, 'ShipmentChange', 0);
    for (const c of changes) {
      wNewRow(w, 'ShipmentChangeValue', 0);
      wInt(w, 2, c.cet);                                                 // SCV_CET_Id
      if (c.kind === 'int') wInt(w, 5, parseInt(c.value, 10) || 0);      // SCV_Value (Integer, skrivs alltid)
      else if (c.kind === 'dec') wDecExact(w, 5, c.value === '' || c.value == null ? '0' : c.value);
      else wStrAlways(w, 5, c.value);
      wEndTable(w, 'ShipmentChangeValue');
    }
    wEndTable(w, 'ShipmentChange');
  }
  if (pod) {
    const now = new Date();
    wNewRow(w, 'ShipmentPod', 0);
    for (const spaId of (live.packageIds || [])) { wNewRow(w, 'ShipmentPackagePod', 0); wInt(w, 1, spaId); wEndTable(w, 'ShipmentPackagePod'); }
    if (pod.sptId) wInt(w, 2, pod.sptId);
    if (pod.dptId) wInt(w, 3, pod.dptId);
    wDate(w, 4, now); wDate(w, 5, now);
    if (pod.name) wStr(w, 6, pod.name);
    if (pod.remark) wStr(w, 7, pod.remark);
    if (pod.comment) wStr(w, 14, pod.comment);
    if (pod.signature) wStr(w, 8, pod.signature);
    if (pod.packageCount != null) wInt(w, 9, pod.packageCount);
    if (pod.sptIdSub) wInt(w, 10, pod.sptIdSub);
    if (pod.dptIdSub) wInt(w, 11, pod.dptIdSub);
    if (pod.lng != null) wDec(w, 13, pod.lng);
    if (pod.lat != null) wDec(w, 12, pod.lat);
    if (pod.image) wBytes(w, 15, pod.image);
    wEndTable(w, 'ShipmentPod');
  }
  for (const im of images || []) {
    wNewRow(w, 'Attachment', 0);
    const del = parseInt(im.orderId, 10);
    if (del) wInt(w, 1, del);                                            // DEA_DEL_Id = orderns nummer
    wStr(w, 2, 'image');                                                 // DEA_Filename
    if (im.comment) wStr(w, 3, im.comment);                              // DEA_Comment
    wInt(w, 6, 7);                                                       // DEA_FFT_Id = Image
    wBytes(w, 5, im.bytes);                                              // DEA_AttachmentData
    wEndTable(w, 'Attachment');
  }
  wEndTable(w, 'Shipment');
  wEndData(w, null, null);
  return w.build();
}

/* Vad kontoret låter dig göra i efterhand + valen (läst ur synken, som Opter Driver). */
const CHANGE_FIELDS = [
  // [CET-namn, typ, standard när kontoret inte satt några SHI-behörigheter, fältnamn i ordern, svensk etikett]
  ['SHI_Packages', 'int', 'z', 'packages', 'Kolli'],
  ['SHI_Weight', 'dec', 'z', 'weight', 'Vikt (kg)'],
  ['SHI_Volume', 'dec', 'z', 'volume', 'Volym'],
  ['SHI_LoadMeter', 'dec', 'z', 'loadMeter', 'Flakmeter'],
  ['SHI_Area', 'dec', 'z', 'area', 'Yta'],
  ['SHI_TimeMinutes', 'dec', 'z', 'timeMinutes', 'Tid (min)'],
  ['SHI_DistanceKM', 'dec', 'z', 'distanceKm', 'Sträcka (km)'],
  ['SHI_FreightBill', 'str', 'z', 'freightBill', 'Fraktsedel'],
  ['SHI_SenderReference', 'str', 'z', 'senderRef', 'Avsändarens referens'],
  ['SHI_ReceiverReference', 'str', 'z', 'receiverRef', 'Mottagarens referens'],
  ['SHI_Message', 'str', 'z', 'message', 'Internt meddelande'],
  ['SHI_ExternalMessage', 'str', 'z', 'extMessage', 'Externt meddelande'],
  ['SHI_GoodsType', 'str', true, 'goodsType', 'Godstyp'],
  ['SHI_DriverMessage', 'str', false, 'driverMessage', 'Förarmeddelande'],
];
function editOptions(decoded) {
  const rows = (decoded && decoded.rows) || [];
  const truthy = (v) => /^(true|1|ja|yes)$/i.test(String(v));
  const sGet = (name) => { const r = rows.find(x => x.table === 'Setting' && String(x.columns.name || '').toLowerCase() === name.toLowerCase()); return r ? r.columns.value : undefined; };
  const sBool = (name, def) => { const v = sGet(name); return v == null || v === '' ? def : truthy(v); };
  const anySHI = rows.some(x => x.table === 'Setting' && /^SHI_.+Permission$/i.test(String(x.columns.name || '')));
  const fields = CHANGE_FIELDS.map(([cetName, kind, def, col, label]) => ({
    cet: CET[cetName], cetName, kind, col,
    label: String(sGet(cetName + 'Name') || label),
    order: parseInt(sGet(cetName + 'Order'), 10) || 99,
    on: sBool(cetName + 'Permission', def === 'z' ? !anySHI : def),
  })).filter(f => f.on).sort((a, b) => a.order - b.order);
  const byOrder = (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.name).localeCompare(String(b.name), 'sv');
  const evs = rows.filter(r => r.table === 'DamageEvent').map(r => ({id: r.key.xxxId, name: String(r.columns.name || ''), order: r.columns.order, forceReason: !!r.columns.forceReason}));
  const rsn = rows.filter(r => r.table === 'DamageReason').map(r => ({id: r.key.xxxId, name: String(r.columns.name || ''), order: r.columns.order}));
  const dte = rows.filter(r => r.table === 'DamageTypeEvent').map(r => r.columns);
  const der = rows.filter(r => r.table === 'DamageEventReason').map(r => r.columns);
  const evPerm = sBool('DAM_DAE_IdPermission', true), rsPerm = sBool('DAM_DAR_IdPermission', true);
  const damageTypes = rows.filter(r => r.table === 'DefaultDamageType' && r.columns.active !== false).map(r => {
    const id = r.key.xxxId, c = r.columns;
    const events = evPerm ? dte.filter(x => x.datId === id).map(x => evs.find(e => e.id === x.daeId)).filter(Boolean).sort(byOrder).map(e => ({
      ...e, reasons: rsPerm ? der.filter(x => x.daeId === e.id).map(x => rsn.find(q => q.id === x.darId)).filter(Boolean).sort(byOrder) : [],
    })) : [];
    return {id, name: String(c.name || 'Avvikelse'), order: c.order, isDefault: !!c.isDefault, forceComment: !!c.forceComment, forceEvent: !!c.forceEvent && events.length > 0, forcePicture: !!c.forcePicture, events};
  }).sort(byOrder);
  return {
    perm: {
      pod: sBool('ProofOfDeliveryPermission', true), addService: sBool('AddServicePermission', true),
      changes: sBool('ChangesPermission', true), damages: sBool('DamagesPermission', true),
      addImage: sBool('AddImagePermission', true), status: sBool('SetArbitraryStatusPermission', true),
      statusDone: sBool('SetArbitraryStatusDoneTabPermission', true),
      pickup: sBool('ManualStatusChangePickUpPermission', true), delivery: sBool('ManualStatusChangeDeliveryPermission', true),
    },
    fields, damageTypes,
  };
}

/* Decimaltal som Opter: avrundat till 6 värdesiffror (BigDecimal.round(MathContext(6))),
 * minsta heltalstyp som rymmer det oskalade värdet. 0 skrivs inte (standardvärde). */
function wDec(w, prop, value) {
  if (value == null || !isFinite(value) || value === 0) return;
  let s = Number(value).toPrecision(6);
  if (/e/i.test(s)) s = Number(s).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  const neg = s.startsWith('-'); if (neg) s = s.slice(1);
  const dot = s.indexOf('.');
  const scale = dot < 0 ? 0 : s.length - dot - 1;
  let unscaled = parseInt(s.replace('.', ''), 10) * (neg ? -1 : 1);
  if (!unscaled) return;
  if (unscaled >= -32768 && unscaled <= 32767) {
    if (scale > 0) { wB(w, DT.DecimalInt16Decimals); wB(w, prop); wB(w, scale); wI16(w, unscaled); }
    else { wB(w, DT.DecimalInt16NoDecimals); wB(w, prop); wI16(w, unscaled); }
  } else if (unscaled >= -2147483648 && unscaled <= 2147483647) {
    if (scale > 0) { wB(w, DT.DecimalInt32Decimals); wB(w, prop); wB(w, scale); wI32(w, unscaled); }
    else { wB(w, DT.DecimalInt32NoDecimals); wB(w, prop); wI32(w, unscaled); }
  } else {
    if (scale > 0) { wB(w, DT.DecimalInt64Decimals); wB(w, prop); wB(w, scale); wI64(w, unscaled); }
    else { wB(w, DT.DecimalInt64NoDecimals); wB(w, prop); wI64(w, unscaled); }
  }
}
/* GPS-position som Opter Driver (registerGpsPosition): lng, lat, höjd, riktning, fart km/h, tid. */
function encodePosition({ lat, lng, alt, bearing, speedKmh, time }) {
  const w = W();
  wNewRow(w, 'Position', 0);
  wDec(w, 3, lng);
  wDec(w, 4, lat);
  wDec(w, 5, alt);
  wDec(w, 6, bearing);
  wDec(w, 7, speedKmh);
  wDate(w, 8, time ? new Date(time) : new Date());
  wEndTable(w, 'Position');
  wEndData(w, null, null);
  return w.build();
}
/* Serverinställning (Setting-tabellen), t.ex. PositionUpdateInterval. */
function setting(decoded, name, fallback) {
  const r = (decoded && decoded.rows || []).find(x => x.table === 'Setting' && String(x.columns.name || '').toLowerCase() === name.toLowerCase());
  if (!r) return fallback;
  const v = r.columns.value;
  return v == null || v === '' ? fallback : v;
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
    const resId = r.key.xxxId;
    const name = r.columns.name || r.columns.shortId || ('Resurs ' + resId);
    if (resId) out.push({ resId, name });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  return out;
}

/* Folket på jobbet (Opter: samma lista som "Ge bort" – aktiva förare, Resources.giveAwayShipmentChooser)
 * + trafikledningens nummer om kontoret lagt in det (Office.OFF_PhoneNoDispatch). Inga telefonnummer finns för förarna. */
function team(decoded) {
  const rows = (decoded && decoded.rows) || [];
  const seen = new Set(), drivers = [];
  for (const r of rows) {
    if (r.table !== 'Resource') continue;
    const c = r.columns, id = r.key.xxxId;
    // Standard i Opter: aktiv = sant, förare = sant (skickas bara när det är falskt) → hoppa över de som är avstängda / inte förare.
    if (!id || seen.has(id) || c.active === false || c.driver === false || !c.name) continue;
    seen.add(id); drivers.push({resId: id, name: String(c.name).trim()});
  }
  drivers.sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  const off = rows.find(r => r.table === 'Office' && (r.columns.phoneDispatch || r.columns.emailDispatch));
  return {drivers, dispatchPhone: off ? String(off.columns.phoneDispatch || '').trim() : '', dispatchEmail: off ? String(off.columns.emailDispatch || '').trim() : ''};
}

/* ---- Smart läsning av fritext ----
 * Telefonnummer i texten ("Ring Katta på stena 010 445 72 71", "Johannes 08 518 332 62")
 * plockas ut med namnet framför och ev. företag efter "på".
 */
const STOP = new Set(['ring', 'ringa', 'på', 'till', 'och', 'tel', 'telefon', 'nr', 'nummer', 'mobil', 'kontakt', 'kontakta', 'meddela', 'avisera', 'kund', 'eller', 'vid', 'om', 'via', 'se', 'samt']);
function extractPhones(text) {
  const out = [];
  if (!text) return out;
  const re = /(?:\+46[\s-]?|\b0)\d{1,3}(?:[\s-]?\d){5,9}\b/g;
  let m;
  while ((m = re.exec(text))) {
    const num = m[0].replace(/[^0-9+]/g, '').replace(/^\+46/, '0');
    if (num.length < 8 || num.length > 11) continue;
    const before = text.slice(Math.max(0, m.index - 48), m.index).replace(/\s+/g, ' ');
    const words = before.split(/[\s,:;()\/]+/).filter(Boolean);
    let name = '', firm = '';
    for (let i = words.length - 1; i >= 0; i--) {
      const w = words[i], lw = w.toLowerCase().replace(/[^a-zåäöé]/g, '');
      if (/^\d/.test(w)) break;            // ett husnummer/siffra – leta aldrig förbi den
      if (!lw) continue;
      if (STOP.has(lw)) { continue; }
      if (/^[A-ZÅÄÖ]/.test(w)) { name = w.replace(/[^A-Za-zÅÄÖåäöé-]/g, '');
        // flerordsnamn: "Edströms Logistik", "Cafe Nero"
        for (let k = i - 1, n = 0; k >= 0 && n < 2; k--, n++) {
          const pw = words[k], plw = pw.toLowerCase().replace(/[^a-zåäöé]/g, '');
          if (!/^[A-ZÅÄÖ]/.test(pw) || STOP.has(plw) || /[.!?:;]$/.test(pw)) break;
          name = pw.replace(/[^A-Za-zÅÄÖåäöé-]/g, '') + ' ' + name;
        }

        const pi = words.slice(i + 1).findIndex(x => x.toLowerCase() === 'på');
        if (pi >= 0 && words[i + 2 + pi]) firm = words[i + 2 + pi].replace(/[^A-Za-zÅÄÖåäöé-]/g, '');
        break; }
      if (i < words.length - 3) break;
    }
    const label = name ? (firm ? `${name} (${firm.charAt(0).toUpperCase() + firm.slice(1)})` : name) : 'Nummer i ordern';
    if (!out.some(x => x.num === num)) out.push({label, num, at: m.index});
  }
  return out;
}
/* "Avisera ... 1 timma innan ankomst" / "ring 30 min innan" → minuter före ankomst */
function avisering(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  const re = /(avisera|ring|meddela)[^.\n]{0,60}?(\d+|en|ett|halv)\s*(timm?a?r?|tim|h|min(?:uter)?)\s*(innan|före)/g;
  const hits = [];
  let m;
  while ((m = re.exec(t))) {
    const n = m[2] === 'en' || m[2] === 'ett' ? 1 : m[2] === 'halv' ? 0.5 : Number(m[2]);
    hits.push({min: /^min/.test(m[3]) ? n : Math.round(n * 60), at: m.index});
  }
  if (!hits.length) { const i = t.indexOf('avisera'); if (i < 0) return null; hits.push({min: 60, at: i}); }
  // Vem ska aviseras: numret som står närmast den sista "avisera"-raden.
  const h = hits[hits.length - 1];
  const phones = extractPhones(text);
  let who = null, best = Infinity;
  for (const p of phones) { const d = Math.abs(p.at - h.at); if (d < best) { best = d; who = p; } }
  return {min: h.min, who: who ? {label: who.label, num: who.num} : null};
}

/* ---- Tider som Opter visar dem ----
 * Datum+tid-fältet gäller bara om dess tidstyp (TTY) inte är 0 (Fallback = inte satt).
 * Returnerar {hhmm, date:'YYYY-MM-DD'|null, ms} eller null.
 */
const ymd = (d) => { const p = new Intl.DateTimeFormat('sv-SE', {year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Stockholm'}).formatToParts(d); const g = (k) => (p.find(x => x.type === k) || {}).value; return `${g('year')}-${g('month')}-${g('day')}`; };
function optTime(dt, dateTTY, timeTTY) {
  if (!(dt instanceof Date) || isNaN(dt)) return null;
  const hasDate = !!dateTTY, hasTime = !!timeTTY;
  if (!hasDate && !hasTime) return null;
  return {hhmm: hasTime ? hhmm(dt) : null, date: ymd(dt), hasDate, ms: dt.getTime()};
}

/* Antal pallar som står i fritext: "4 pall", "2 st pallar", "3 helpall", "1 halvpall", "2 EUR-pall". Största talet gäller. */
function palFromText(text) {
  let best = 0; const re = /(\d{1,2})\s*(?:st\.?\s*)?(?:hel|halv|eur?o?|eng[åa]ngs|eng)?[-\s]?pall(?:ar|en|arna)?\b/gi; let m;
  while ((m = re.exec(String(text || '')))) { const n = parseInt(m[1], 10); if (n > best && n <= 36) best = n; }
  return best;
}
/* ---- Opter-rader → rutt {cargo, stops} ---- */
const hhmm = (d) => d ? new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' }).format(d) : null;
function toRutt(decoded) {
  const addresses = {};
  for (const r of decoded.rows) if (r.table === 'Address') for (const id of [r.key.identityId, r.key.xxxId]) if (id) addresses[id] = r.columns;
  const pkgBy = {};
  for (const r of decoded.rows) if (r.table === 'ShipmentPackage') { const k = r.columns.shiId || (r.parent && r.parent.key && r.parent.key.xxxId); (pkgBy[k] = pkgBy[k] || []).push({...r.columns, _id: r.key.xxxId}); }

  const sugBy = {};
  for (const r of decoded.rows) if (r.table === 'ShipmentPodSuggestion' && !r.columns.revoked && r.columns.name) { const k = r.columns.shiId; (sugBy[k] = sugBy[k] || []).push(String(r.columns.name).trim()); }

  // Orderns egna statusar och kvittenstyper (ligger som underrader i orderns block).
  const belongs = (r, shiId) => (r.columns.shiId === shiId) || (r.parent && r.parent.table === 'Shipment' && r.parent.key.xxxId === shiId);
  const defPods = decoded.rows.filter(r => r.table === 'DefaultPodType' && r.columns.active !== false).map(r => ({id: r.key.xxxId, ...r.columns}));
  const podTypesFor = (beforePickup) => {
    const ok = defPods.filter(d => beforePickup ? d.allowBeforePickup : d.allowAfterPickup);
    return {main: ok.filter(d => !d.mainId), sub: ok.filter(d => d.mainId)};
  };
  const sBool = (name, def) => /^(true|1|ja|yes)$/i.test(String(setting(decoded, name, def ? 'true' : 'false')));
  const podFields = { remark: sBool('PodRemarkEnabled', true), comment: sBool('PodCommentEnabled', false), count: sBool('PodPackageCountEnabled', true), pic: sBool('PodPictureEnabled', false), commentName: String(setting(decoded, 'PodCommentName', '') || '') };

  // Serverinställningar som styr vilka ordrar Opter Driver visar.
  const sTrue = (name) => /^(true|1|ja|yes)$/i.test(String(setting(decoded, name, 'false')));
  const showCons = sTrue('IncludeConsignments'), showConsChildren = sTrue('IncludeConsignmentChildren');

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
  // Platsens namn som Opter Driver visar det under Avsändare/Mottagare: adressens eget namn.
  // Aldrig kunden/beställaren (det gav "Stena Recycling AB"/"Christer Wigström" i stället för "Distribution"/"Stena Återvinning Rosersberg").
  const placeName = (a) => (a ? a.company || a.line1 || '' : '');
  for (const r of decoded.rows) {
    if (r.table !== 'Shipment') continue;
    const c = r.columns;
    const from = addresses[c.adrFrom] || null, to = addresses[c.adrTo] || null;
    const cid = String(c.orderId || c.shipmentId || r.key.xxxId || ++n);
    const pkgs = pkgBy[r.key.xxxId] || pkgBy[c.shipmentId] || [];
    // Pallar: kollinas antal i Opter, men står det fler i ordertexten ("4 pall 2265 kg") gäller texten –
    // kontoret lägger ofta in en kollirad med antal 1 och skriver det riktiga antalet i meddelandet.
    const pkgPal = pkgs.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
    const pal = Math.max(pkgPal, palFromText([c.message, c.extMessage, c.driverMessage, c.senderInstr, c.goodsType, ...pkgs.map(p => [p.quantity, p.packageType, p.text].filter(Boolean).join(' '))].join('\n'))) || 1;
    const kg = Number(c.weight) || pkgs.reduce((s, p) => s + (Number(p.weight) || 0), 0) || 0;
    const shiId = r.key.xxxId;
    const statuses = decoded.rows.filter(x => x.table === 'ShipmentStatus' && belongs(x, shiId))
      .map(x => ({id: x.key.xxxId, ...x.columns})).sort((a, b) => (a.order || 0) - (b.order || 0));
    const byName = (re) => statuses.find(s => re.test(String(s.name || '')));
    const loadSt = byName(/^lastad$/i) || statuses.find(s => s.pickup && !s.delivery) || null;
    const unloadSt = byName(/^lossad$/i) || statuses.find(s => s.delivery || s.completed) || null;
    const curSt = statuses.find(s => s.id === c.shsId) || null;
    // Exakt som Opter (Shipment.isUserAttentionRequired / ShipmentListFragment):
    //  ingen aktuell status → visas inte som ny; ny = aktuell status saknar accepterad/hämtning/leverans/klar/nekad.
    const revoked = !!c.revoked, revokedOpen = revoked && !c.revokedConfirmed;
    const isNew = !!curSt && !revoked && !(curSt.accepted || curSt.pickup || curSt.delivery || curSt.completed || curSt.rejected);
    const tab = !curSt ? 'hidden' : revokedOpen ? 'revoked' : isNew ? 'new' : revoked ? 'hidden'
      : (curSt.delivery || curSt.rejected || curSt.completed) ? 'done' : (curSt.accepted || curSt.pickup) ? 'todo' : 'hidden';
    // Samlingsordrar och deras delordrar döljs som i Opter (om inte servern säger annat).
    const consHidden = (c.isConsignment && !showCons) || (c.consignmentParent && !showConsChildren);
    const tabF = consHidden ? 'hidden' : tab;
    const acceptSt = statuses.find(s => s.accepted && !s.rejected) || byName(/bekräftad|accepterad/i) || null;
    const rejectSt = statuses.find(s => s.rejected) || byName(/nekad/i) || null;
    const serverDone = !!(curSt && (curSt.completed || (curSt.delivery && !curSt.pickup)));
    // Kvittenstyper exakt som Opter (ProofOfDelivery.loadDefaultPodTypes): bara DefaultPodType,
    // aktiva, tillåtna efter hämtning; förvald = kundens standardtyp, annars standard, annars första.
    const hasSpt = decoded.rows.some(x => x.table === 'ShipmentPodType' && belongs(x, shiId));
    const pts = podTypesFor(false);
    const mk = (d) => ({id: d.id, name: String(d.name || 'Kvittens'), descr: d.descr || '', mainId: d.mainId || 0,
      req: {name: !!d.nameReq, sig: !!d.sigReq, remark: !!d.remarkReq, comment: !!d.commentReq, pic: !!d.picReq},
      showSub: !!d.showSub, requireSub: !!d.requireSub});
    const podTypes = pts.main.map(mk), podSubTypes = pts.sub.map(mk);
    const defPod = podTypes.find(t => c.customerDefaultPOT && t.id === c.customerDefaultPOT) || podTypes.find((t, i) => pts.main[i].isDefault) || podTypes[0] || null;
    const podType = defPod;
    // Det som går att ändra i efterhand (Opter Driver: menyn på ordern, så länge den inte är klarmarkerad).
    const addTypes = decoded.rows.filter(x => x.table === 'ShipmentAddServiceType' && belongs(x, shiId) && !x.columns.revoked)
      .map(x => ({id: x.key.xxxId, name: String(x.columns.name || 'Tillägg'), descr: x.columns.descr || ''})).filter(t => t.id);
    const nameOfSat = (id) => { const t = addTypes.find(a => a.id === id); return t ? t.name : 'Tillägg'; };
    const addDone = decoded.rows.filter(x => x.table === 'ShipmentAddService' && belongs(x, shiId) && x.columns.active !== false)
      .map(x => ({id: x.key.xxxId, name: nameOfSat(x.columns.satId), number: x.columns.number != null ? x.columns.number : null, descr: x.columns.descr || ''}));
    const ddtName = (id) => { const t = decoded.rows.find(x => x.table === 'DefaultDamageType' && x.key.xxxId === id); return t ? String(t.columns.name || 'Avvikelse') : 'Avvikelse'; };
    const dmgDone = decoded.rows.filter(x => x.table === 'ShipmentDamage' && belongs(x, shiId) && x.columns.active !== false)
      .map(x => ({id: x.key.xxxId, name: ddtName(x.columns.ddtId), comment: x.columns.comment || ''}));
    const attDone = decoded.rows.filter(x => x.table === 'Attachment' && x.parent && x.parent.table === 'Shipment' && x.parent.key.xxxId === shiId && !x.columns.revoked).length;
    const values = {}; for (const f of CHANGE_FIELDS) values[f[3]] = c[f[3]] != null ? c[f[3]] : null;
    const edit = { addTypes, addDone, dmgDone, attDone, values, orderId: c.orderId || null, completed: !!(curSt && curSt.completed),
      statuses: statuses.map(s => ({id: s.id, name: String(s.name || ''), userOption: !!s.userOption, accepted: !!s.accepted, pickup: !!s.pickup, delivery: !!s.delivery, completed: !!s.completed, pod: !!s.pod, rejected: !!s.rejected})) };
    const live = { key: r.key, hdr: r.hdr, shiId, offId: r.key.offId, edit, statuses: statuses.map(s => ({id: s.id, name: s.name})), cur: curSt ? curSt.name : null, curId: c.shsId || 0,
      isNew: isNew && !consHidden, tab: tabF, revoked: revokedOpen, consignment: !!c.isConsignment || !!c.consignmentParent, locked: !!c.locked,
      shipDate: (c.shipmentDate instanceof Date && c.shipmentDate.getFullYear() > 2001) ? ymd(c.shipmentDate) : (c.orderDate instanceof Date && c.orderDate.getFullYear() > 2001 ? ymd(c.orderDate) : null),
      doneAt: (() => { const logs = decoded.rows.filter(x => x.table === 'ShipmentStatusLog' && belongs(x, shiId) && x.columns.shsId === c.shsId && x.columns.logTime instanceof Date); return logs.length ? Math.max(...logs.map(x => x.columns.logTime.getTime())) : null; })(),
      serverDone, acceptSt: acceptSt ? {id: acceptSt.id, name: acceptSt.name} : null, rejectSt: rejectSt ? {id: rejectSt.id, name: rejectSt.name} : null,
      loadSt: loadSt ? {id: loadSt.id, name: loadSt.name} : null, unloadSt: unloadSt ? {id: unloadSt.id, name: unloadSt.name, pod: !!unloadSt.pod} : null,
      podType: podType ? {id: podType.id, name: podType.name} : null, hasSpt, externalId: c.externalId || '',
      packageIds: pkgs.map(p => p._id).filter(Boolean) };
    const pkgText = pkgs.map(p => [p.quantity ? p.quantity + ' st' : '', p.packageType, p.text].filter(Boolean).join(' ')).filter(Boolean).join(', ');
    cargo[cid] = { name: c.customer || c.serviceType || ('Order ' + cid), pal, kg, to: to && to.city ? to.city : '', goods: pkgText };
    // Krav som Opter: ett fält krävs bara om BÅDE ordern och den valda kvittenstypen kräver det.
    const shipReq = { name: !!c.podNameReq, sig: !!c.podSigReq, remark: !!c.podRemarkReq, comment: !!c.podCommentReq, pic: !!c.podPicReq };
    const req = podType ? { name: shipReq.name && podType.req.name, sig: shipReq.sig && podType.req.sig, remark: shipReq.remark && podType.req.remark, comment: shipReq.comment && podType.req.comment, pic: shipReq.pic && podType.req.pic } : {};
    const pod = { types: podTypes, subTypes: podSubTypes, defaultId: podType ? podType.id : 0, shipReq, fields: podFields, lockMain: !!c.podLockMainType };
    // All fritext för ordern, i den ordning Opter visar den, utan dubbletter.
    // Fritext: utan rader som bara är fraktsedel-/ordernumret och utan upprepade rader.
    const junk = new Set([String(c.freightBill || ''), String(c.shipmentId || ''), String(c.orderId || '')].filter(Boolean));
    const seenL = new Set();
    const info = [c.extMessage, c.message, c.senderInstr, c.driverMessage].map(x => String(x || '')).join('\n')
      .split('\n').map(l => l.replace(/\s+$/, '')).filter(l => { const k = l.trim(); if (!k) return true; if (junk.has(k)) return false; if (seenL.has(k)) return false; seenL.add(k); return true; })
      .join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const tEP = optTime(c.earliestPickDT, c.earliestPickDateTTY, c.earliestPickTimeTTY);
    const tLP = optTime(c.latestPickDT, c.latestPickDateTTY, c.latestPickTimeTTY);
    const tED = optTime(c.earliestDelDT, c.earliestDelDateTTY, c.earliestDelTimeTTY);
    const tLD = optTime(c.latestDelDT, c.latestDelDateTTY, c.latestDelTimeTTY);
    const textTel = extractPhones(info);
    const kolli = Number(c.packages) || pkgs.reduce((s, p) => s + (Number(p.quantity) || 0), 0) || 0;
    const common = { live, shiId, orderNo: c.orderId || null, freightBill: c.freightBill || c.shipmentId || null, customer: c.customer || '', service: c.serviceType || '', kg, pal, kolli, goods: pkgText, info, km: Number(c.distanceKm) || null, minutes: Number(c.timeMinutes) || null, msg: '', driverMsg: '' };
    const merge = (a, b) => { const seen = new Set(a.map(x => x.num)); return [...a, ...b.filter(x => !seen.has(x.num) && seen.add(x.num))]; };
    stops.push({ ...common, verb: 'Hämta', adr: line(from), area: from && from.city ? from.city : '', zip: from && from.zip || '', lat: from && from.lat != null ? Number(from.lat) : null, lng: from && from.lng != null ? Number(from.lng) : null, pickup: cid, deadline: tLP && tLP.hhmm, dlDate: tLP && tLP.date, earliest: tEP && tEP.hhmm, openDate: tEP && tEP.date, tEarliest: tEP, tLatest: tLP, who: placeName(from) || c.customer || '', customer: c.customer || '', orderedBy: c.orderReceiver || '', contact: contact(from), tel: merge(phones(from, c, 'from'), textTel), code: from && from.entreCode || '', adrMsg: [from && from.driverMessage, from && from.info].filter(Boolean).join(' · '), ref: c.senderRef || '', note: [c.serviceType, kg ? kg + ' kg' : '', c.message].filter(Boolean).join(' · ') });
    stops.push({ ...common, verb: 'Lämna', adr: line(to), area: to && to.city ? to.city : '', zip: to && to.zip || '', lat: to && to.lat != null ? Number(to.lat) : null, lng: to && to.lng != null ? Number(to.lng) : null, drop: cid, deadline: tLD && tLD.hhmm, dlDate: tLD && tLD.date, earliest: tED && tED.hhmm, openDate: tED && tED.date, tEarliest: tED, tLatest: tLD, who: placeName(to) || c.customer || '', customer: c.customer || '', orderedBy: c.orderReceiver || '', contact: contact(to), tel: merge(phones(to, c, 'to'), textTel), avise: avisering(info), code: to && to.entreCode || '', adrMsg: [to && to.driverMessage, to && to.info].filter(Boolean).join(' · '), ref: c.receiverRef || '', req, pod, suggest: [...new Set(sugBy[shiId] || [])], note: [kg ? kg + ' kg' : '', c.driverMessage].filter(Boolean).join(' · ') });
  }
  // Kontorets behörigheter för flera order samtidigt (Opter Driver: Setting.Permission + "Permission", standard true).
  const perm = {
    multi: sBool('SetMultipleStatusPermission', true),
    pickup: sBool('ManualStatusChangePickUpPermission', true),
    delivery: sBool('ManualStatusChangeDeliveryPermission', true),
  };
  return { cargo, stops, perm, opts: editOptions(decoded) };
}

module.exports = {
  MessageType, Table, DT, RST, F, frame, unframe, decodeSync, ticksToDate,
  logonPayload, parseLogon, resourceList, encodeStartWork, encodeWorkStatus, toRutt,
  messageList, encodeMarkRead, optTime, ymd, encodeSendMessage, lastIdentity, encodeFullSync, extractPhones, avisering, palFromText, team, encodeShipmentStatus, encodeShipmentEdit, editOptions, CET, CHANGE_FIELDS, signatureString, encodePosition, setting,
};

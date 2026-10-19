'use strict';
/*
 * Opter-klient för RUTT (React Native).
 * Samma flöde som Opter Driver: Logon -> välj förare -> StartWork -> hämta jobb.
 * Nätverket går via RN:s native lager (ingen CORS, till skillnad från WebView).
 *
 * Tålig mot döda sessioner: dör anslutningen eller svarar servern "inte inloggad"
 * (t.ex. efter natten) loggar klienten in igen i bakgrunden och försöker en gång till.
 */
import * as signalR from '@microsoft/signalr';
import {Buffer} from 'buffer';
import P from './protocol';

function connectionString({server, port, https = true, app = ''}) {
  if (/^https?:\/\//i.test(server)) return server.endsWith('/') ? server : server + '/';
  const scheme = https ? 'https://' : 'http://';
  const host = String(server).replace(/\s/g, '');
  const p = port && Number(port) > 0 ? ':' + port : '';
  const a = '/' + String(app).replace(/\s/g, '').replace(/^\//, '');
  const url = scheme + host + p + a;
  return url.endsWith('/') ? url : url + '/';
}

function deviceId() {
  // stabilt per installation
  return 'rutt-' + (global.__ruttDev || (global.__ruttDev = Math.random().toString(16).slice(2, 18)));
}

// Opters nyckelregel: har båda ett serverid (XXX_Id > 0) jämförs det, annars löpnumret.
const sameRow = (a, b) => (a.xxxId > 0 && b.xxxId > 0 ? a.xxxId === b.xxxId : a.identityId === b.identityId && a.identityId !== 0);

export default class OpterClient {
  constructor() {
    this.conn = null;
    this.connected = false;
    this.logon = null;
    this.lastDecoded = null;
    this.onPush = null;
    this.cfg = null;
    this.creds = null;
    this.resId = null;
    this.msgRows = []; // samlad chatthistorik över alla synkar (en post per meddelande)
    this._relogin = null;
    this.log = [];      // sändlogg: vad RUTT skickade och vad Opter svarade (följer med i Skicka orderdata)
    this.onLog = null;  // appen sparar loggen i telefonen
  }
  _log(e) {
    this.log = [...this.log, {at: new Date().toISOString(), ...e}].slice(-80);
    try { this.onLog && this.onLog(this.log); } catch (x) {}
  }
  _podInfo(pod) {
    if (!pod) return null;
    return {spt: pod.sptId || 0, dpt: pod.dptId || 0, sptSub: pod.sptIdSub || 0, dptSub: pod.dptIdSub || 0, name: pod.name ? pod.name.length : 0,
      sig: pod.signature ? Buffer.byteLength(pod.signature) : 0, remark: pod.remark ? pod.remark.length : 0, comment: pod.comment ? pod.comment.length : 0,
      kolli: pod.packageCount, img: pod.image ? pod.image.length : 0, pos: pod.lat != null};
  }
  _podsOf(shiId) { return this._count('ShipmentPod', shiId); }

  async connect(cfg) {
    this.cfg = cfg;
    const url = connectionString(cfg);
    this.conn = new signalR.HubConnectionBuilder()
      .withUrl(url, {withCredentials: false})
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();
    this.conn.on('StartServerInitiatedSync', () => {
      if (this.onPush) this.onPush();
    });
    this.conn.onclose(() => { this.connected = false; });
    await this.conn.start();
    this.connected = true;
    return url;
  }

  _alive() {
    return this.conn && this.conn.state === signalR.HubConnectionState.Connected;
  }

  async _rawSend(type, payloadBuffer) {
    const resp = await this.conn.invoke('SendToServer2', P.frame(type, payloadBuffer || Buffer.alloc(0)));
    return P.unframe(resp);
  }

  // Logga in igen och ställ in samma förare (en åt gången).
  async relogin() {
    if (!this.cfg || !this.creds) throw new Error('inte inloggad');
    if (this._relogin) return this._relogin;
    this._relogin = (async () => {
      try { if (this.conn) await this.conn.stop(); } catch (e) {}
      await this.connect(this.cfg);
      const res = await this._rawSend(P.MessageType.Logon, P.logonPayload({...this.creds, deviceId: deviceId()}));
      this.logon = P.parseLogon(res.payload);
      if (!this.logon.ok) throw new Error('Kunde inte logga in igen');
      if (this.resId) {
        const sw = await this._rawSend(P.MessageType.Synchronize, P.encodeStartWork({offId: this.logon.acdOffId, resId: this.resId, vhcId: this.logon.vhcId}));
        this._take(P.decodeSync(sw.payload));
      }
    })();
    try { await this._relogin; } finally { this._relogin = null; }
  }

  /*
   * Skicka. Är sessionen död loggar vi in först (då har inget skickats än).
   * once=true: rader som skapar något nytt (meddelanden m.m.) skickas ALDRIG om
   * blint efter ett avbrott mitt i – de kan redan ha kommit fram. Då kastas felet
   * och anroparen kontrollerar mot servern först.
   */
  async send(type, payloadBuffer, {retry = true, once = false} = {}) {
    const isLogon = type === P.MessageType.Logon;
    if (!isLogon && retry && !this._alive()) await this.relogin();
    let res;
    try {
      res = await this._rawSend(type, payloadBuffer);
    } catch (e) {
      if (isLogon || !retry || once) throw e;
      await this.relogin();
      return await this._rawSend(type, payloadBuffer);
    }
    if (!isLogon && retry && res.type === P.MessageType.NotLoggedOn) {
      // servern avvisade utan att spara → säkert att skicka om efter inloggning
      await this.relogin();
      return await this._rawSend(type, payloadBuffer);
    }
    return res;
  }

  // Spara ett synksvar: senaste helbild + samlad chatthistorik.
  _take(decoded) {
    this.lastDecoded = decoded;
    for (const r of decoded.rows || []) {
      if (r.table !== 'FreeTextMessage') continue;
      const i = this.msgRows.findIndex(x => sameRow(x.key, r.key));
      if (i < 0) { this.msgRows.push(r); continue; }
      const prev = this.msgRows[i];
      // slå ihop; behåll serverid när det väl tilldelats
      const key = {...prev.key, ...r.key, xxxId: r.key.xxxId > 0 ? r.key.xxxId : prev.key.xxxId};
      this.msgRows[i] = {...prev, key, columns: {...prev.columns, ...r.columns}};
    }
    return decoded;
  }

  async doLogon({user, pass}) {
    this.creds = {user, pass};
    const res = await this.send(P.MessageType.Logon, P.logonPayload({user, pass, deviceId: deviceId()}));
    this.logon = P.parseLogon(res.payload);
    return this.logon;
  }

  async syncRef() {
    const res = await this.send(P.MessageType.Synchronize, Buffer.alloc(0));
    return this._take(P.decodeSync(res.payload));
  }

  resources() {
    return this.lastDecoded ? P.resourceList(this.lastDecoded, this.logon) : [];
  }

  async startWork(resId) {
    this.resId = resId;
    const payload = P.encodeStartWork({
      offId: this.logon.acdOffId,
      resId,
      vhcId: this.logon.vhcId,
    });
    const res = await this.send(P.MessageType.Synchronize, payload);
    const decoded = this._take(P.decodeSync(res.payload));
    return {rutt: P.toRutt(decoded), decoded};
  }

  // Arbetstidsstatus (rast/lunch/avsluta dag) → Opter.
  async workStatus(rstType) {
    const payload = P.encodeWorkStatus({offId: this.logon.acdOffId, rstType, resId: this.resId, vhcId: this.logon.vhcId});
    const res = await this.send(P.MessageType.Synchronize, payload);
    this._take(P.decodeSync(res.payload));
    return true;
  }

  // Hämta färsk data (jobb + chatt) – används vid server-push och periodiskt.
  async poll() {
    await this.syncRef();
    return {rutt: P.toRutt(this.lastDecoded), msgs: this.messages()};
  }

  // ---- chatt ----
  messages() {
    return P.messageList({rows: this.msgRows});
  }
  async markRead(keys) {
    if (!keys || !keys.length) return;
    const res = await this.send(P.MessageType.Synchronize, P.encodeMarkRead(keys));
    // markera lokalt direkt, oavsett hur mycket servern skickar tillbaka
    this.msgRows = this.msgRows.map(r => (keys.some(k => sameRow(k, r.key)) ? {...r, columns: {...r.columns, confirmed: true}} : r));
    this._take(P.decodeSync(res.payload));
  }
  /*
   * Skicka chattmeddelande, exakt en gång.
   * Returnerar {msgs, stored}: stored = Opter har gett meddelandet ett eget id (sparat hos dem).
   */
  _stored(identity, text, after) {
    return this.msgRows.some(r => {
      const c = r.columns || {};
      if (!(r.key.xxxId > 0)) return false;
      if (r.key.identityId === identity) return true;
      // fullsynk kan komma utan vårt löpnummer → känn igen på text + tid + att det är förarens
      const t = c.created instanceof Date ? c.created.getTime() : 0;
      return !c.fromName && c.outgoing !== true && (c.text || '') === text && t >= after - 120000;
    });
  }
  async sendMessage(text) {
    if (!this.logon) throw new Error('inte inloggad');
    const started = Date.now();
    const payload = P.encodeSendMessage({offId: this.logon.acdOffId, resId: this.resId, vhcId: this.logon.vhcId, text});
    const myId = P.lastIdentity();
    let midFlightError = null;
    try {
      const res = await this.send(P.MessageType.Synchronize, payload, {once: true});
      if (res.type === P.MessageType.Corrupt) throw new Error('Servern kunde inte läsa meddelandet');
      this._take(P.decodeSync(res.payload));
    } catch (e) {
      midFlightError = e;
      try { await this.relogin(); } catch (e2) { throw e; }
    }
    // Kolla mot servern att det faktiskt sparats innan vi säger "mottaget".
    if (!this._stored(myId, text, started)) { try { await this.syncRef(); } catch (e) {} }
    let stored = this._stored(myId, text, started);
    if (!stored && midFlightError) {
      // Kom aldrig fram → nu (och bara nu) skickar vi en gång till.
      const again = P.encodeSendMessage({offId: this.logon.acdOffId, resId: this.resId, vhcId: this.logon.vhcId, text});
      const againId = P.lastIdentity();
      const res2 = await this.send(P.MessageType.Synchronize, again, {once: true});
      this._take(P.decodeSync(res2.payload));
      if (!this._stored(againId, text, started)) { try { await this.syncRef(); } catch (e) {} }
      stored = this._stored(againId, text, started);
    }
    return {msgs: this.messages(), stored};
  }

  /*
   * Sätt orderstatus (Lastad/Lossad) och ev. leveransbevis – exakt en gång.
   * Efteråt full synk: bekräftat först när Opter själv visar den nya statusen.
   * Returnerar {confirmed, imageDropped}.
   */
  _statusOf(shiId) {
    const r = (this.lastDecoded && this.lastDecoded.rows || []).find(x => x.table === 'Shipment' && x.key.xxxId === shiId);
    return r ? (r.columns.shsId || 0) : null; // null = ordern finns inte längre i listan (t.ex. klar)
  }
  async _fullSync() {
    const res = await this.send(P.MessageType.Synchronize, P.encodeFullSync());
    return this._take(P.decodeSync(res.payload));
  }
  async setStatus(live, statusId, pod) {
    if (!this.logon) throw new Error('inte inloggad');
    const entry = {kind: 'status', shiId: live.shiId, statusId, from: this._statusOf(live.shiId), pod: this._podInfo(pod), podsBefore: this._podsOf(live.shiId), tries: []};
    const attempt = async (podData, label) => {
      let payload;
      try { payload = P.encodeShipmentStatus({live, statusId, pod: podData}); }
      catch (e) { entry.tries.push({label, err: 'bygga: ' + String(e && e.message || e)}); throw e; }
      try {
        const res = await this.send(P.MessageType.Synchronize, payload, {once: true});
        entry.tries.push({label, bytes: payload.length, resp: res.type, respBytes: res.payload ? res.payload.length : 0});
        if (res.type === P.MessageType.Corrupt) throw new Error('Opter kunde inte läsa uppdateringen');
        this._take(P.decodeSync(res.payload));
        return true;
      } catch (e) {
        if (!entry.tries.length || entry.tries[entry.tries.length - 1].label !== label) entry.tries.push({label, bytes: payload.length, err: String(e && e.message || e)});
        else entry.tries[entry.tries.length - 1].err = String(e && e.message || e);
        try { await this.relogin(); } catch (e2) {}
        return false; // kan ha kommit fram – kontrolleras nedan
      }
    };
    const check = async () => { try { await this._fullSync(); } catch (e) {} const cur = this._statusOf(live.shiId); return {cur, ok: cur === statusId || cur === null}; };
    let imageDropped = false, sent = false, c;
    try {
      sent = await attempt(pod, 'kvittens');
      c = await check();
      if (!c.ok && pod && pod.image) {
        // stor bild kan ha stoppat sändningen → samma kvittens utan bild
        imageDropped = true;
        sent = await attempt({...pod, image: null}, 'utan bild');
        c = await check();
      }
      if (!c.ok && pod) {
        // Opter tog inte statusen tillsammans med kvittensen → statusen först, kvittensen för sig (som Ny kvittens i Opter).
        sent = await attempt(null, 'bara status');
        c = await check();
        if (c.ok) {
          try {
            const r2 = await this.send(P.MessageType.Synchronize, P.encodeShipmentEdit({live, pod: imageDropped ? {...pod, image: null} : pod}), {once: true});
            entry.tries.push({label: 'kvittens för sig', resp: r2.type});
            if (r2.type !== P.MessageType.Corrupt) this._take(P.decodeSync(r2.payload));
          } catch (e) { entry.tries.push({label: 'kvittens för sig', err: String(e && e.message || e)}); }
          try { await this._fullSync(); } catch (e) {}
        }
      } else if (!c.ok && !sent) {
        sent = await attempt(pod, 'igen');
        c = await check();
      }
    } catch (e) {
      // Paketet gick inte att bygga (ska aldrig hända) → statusen ska ändå fram.
      if (pod) { try { sent = await attempt(null, 'bara status (reserv)'); } catch (e2) {} }
      c = await check();
    }
    entry.to = c.cur; entry.confirmed = c.ok; entry.podsAfter = this._podsOf(live.shiId);
    this._log(entry);
    return {confirmed: c.ok, imageDropped, podSeen: entry.podsAfter > entry.podsBefore, rutt: P.toRutt(this.lastDecoded)};
  }

  _count(table, shiId) {
    return (this.lastDecoded && this.lastDecoded.rows || []).filter(x => x.table === table && (x.columns.shiId === shiId || (x.parent && x.parent.table === 'Shipment' && x.parent.key.xxxId === shiId))).length;
  }
  async editShipment(live, edit) {
    if (!this.logon) throw new Error('inte inloggad');
    const before = {sa: this._count('ShipmentAddService', live.shiId), sd: this._count('ShipmentDamage', live.shiId)};
    const send = async (e) => {
      const res = await this.send(P.MessageType.Synchronize, P.encodeShipmentEdit({live, ...e}), {once: true});
      if (res.type === P.MessageType.Corrupt) throw new Error('Opter kunde inte läsa ändringen');
      this._take(P.decodeSync(res.payload));
    };
    let sent = false, err = null, imageDropped = false;
    try { await send(edit); sent = true; } catch (e) { err = e; try { await this.relogin(); } catch (e2) {} }
    try { await this._fullSync(); } catch (e) {}
    const nSa = (edit.addServices || []).length, nSd = (edit.damages || []).length;
    const okStatus = !edit.statusId || this._statusOf(live.shiId) === edit.statusId || this._statusOf(live.shiId) === null;
    const okSa = !nSa || this._count('ShipmentAddService', live.shiId) >= before.sa + nSa;
    const okSd = !nSd || this._count('ShipmentDamage', live.shiId) >= before.sd + nSd;
    // Tillägg och avvikelser skickas tillbaka av Opter först när kontoret tagit emot dem – kom synken fram räknas det som skickat.
    const confirmed = okStatus && (sent || (okSa && okSd && (nSa || nSd || edit.statusId)));
    // En stor bild i en kvittens kan stoppa sändningen → samma kvittens utan bild, en gång (bara när inget kom fram).
    if (!sent && !confirmed && edit.pod && edit.pod.image && !nSa && !nSd && !(edit.images || []).length && !(edit.changes || []).length) {
      imageDropped = true;
      try { await send({...edit, pod: {...edit.pod, image: null}}); sent = true; } catch (e) { err = e; }
      try { await this._fullSync(); } catch (e) {}
    }
    const ok2 = !edit.statusId || this._statusOf(live.shiId) === edit.statusId || this._statusOf(live.shiId) === null;
    this._log({kind: 'ändring', shiId: live.shiId, statusId: edit.statusId || 0, pod: this._podInfo(edit.pod), adds: nSa, damages: nSd, changes: (edit.changes || []).length, images: (edit.images || []).length,
      sent, imageDropped, err: err ? String(err.message || err) : null, to: this._statusOf(live.shiId), confirmed: (sent || confirmed) && ok2});
    return {confirmed: (sent || confirmed) && ok2, sent, imageDropped, error: err ? String(err.message || err) : null, rutt: P.toRutt(this.lastDecoded)};
  }

  // GPS-position → Opter (som Opter Driver). Skickas utan full synk tillbaka (lätt anrop).
  async sendPosition(loc) {
    if (!this.logon) return false;
    const res = await this.send(P.MessageType.Synchronize, P.encodePosition(loc), {once: true});
    if (res && res.payload && res.payload.length) this._take(P.decodeSync(res.payload));
    return true;
  }
  positionInterval() {
    const v = parseInt(P.setting(this.lastDecoded, 'PositionUpdateInterval', 60), 10);
    return isFinite(v) && v >= 5 ? v : 60;
  }

  // Felsökning: färsk full synk, allt utom förarlista/loggar, som JSON-vänligt objekt.
  async dump() {
    let d = this.lastDecoded || {rows: []}, note = 'senaste synk';
    try {
      const res = await this.send(P.MessageType.Synchronize, P.encodeFullSync());
      d = P.decodeSync(res.payload); note = 'färsk full synk (svarstyp ' + res.type + ')';
    } catch (e) { note = 'full synk misslyckades: ' + String(e && e.message || e); }
    const SKIP = new Set(['Resource', 'LogData', 'Position', 'DataChange']);
    const counts = {}, rows = [];
    for (const r of d.rows || []) {
      counts[r.table] = (counts[r.table] || 0) + 1;
      if (SKIP.has(r.table)) continue;
      rows.push({t: r.table, k: [r.key.identityId, r.key.offId, r.key.xxxId], c: r.columns});
    }
    return {
      app: 'RUTT', at: new Date().toISOString(), note,
      logon: this.logon ? {acdOffId: this.logon.acdOffId, resId: this.resId, vhcId: this.logon.vhcId, name: this.logon.name} : null,
      decoded: (d.decodedBytes || 0) + '/' + (d.totalBytes || 0), error: d.error || null,
      syncTimes: d.syncTimes || null, counts, rows, sendLog: this.log,
    };
  }

  async disconnect() {
    try {
      await this.send(P.MessageType.Disconnect, Buffer.alloc(0), {retry: false});
    } catch (e) {}
    try {
      await this.conn.stop();
    } catch (e) {}
    this.connected = false;
  }
}

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
  }

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
    return this.lastDecoded ? P.resourceList(this.lastDecoded) : [];
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
      syncTimes: d.syncTimes || null, counts, rows,
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

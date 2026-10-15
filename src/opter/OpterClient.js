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

const msgKey = r => `${r.key.identityId}|${r.key.offId}|${r.key.xxxId}`;

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
    this.msgRows = new Map(); // samlad chatthistorik över alla synkar
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

  async send(type, payloadBuffer, {retry = true} = {}) {
    const isLogon = type === P.MessageType.Logon;
    try {
      if (!isLogon && !this._alive() && retry) await this.relogin();
      const res = await this._rawSend(type, payloadBuffer);
      if (!isLogon && retry && res.type === P.MessageType.NotLoggedOn) {
        await this.relogin();
        return await this._rawSend(type, payloadBuffer);
      }
      return res;
    } catch (e) {
      if (isLogon || !retry) throw e;
      await this.relogin();
      return await this._rawSend(type, payloadBuffer);
    }
  }

  // Spara ett synksvar: senaste helbild + samlad chatthistorik.
  _take(decoded) {
    this.lastDecoded = decoded;
    for (const r of decoded.rows || []) {
      if (r.table !== 'FreeTextMessage') continue;
      const k = msgKey(r);
      const prev = this.msgRows.get(k);
      this.msgRows.set(k, prev ? {...prev, columns: {...prev.columns, ...r.columns}} : r);
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
    return P.messageList({rows: [...this.msgRows.values()]});
  }
  async markRead(keys) {
    if (!keys || !keys.length) return;
    const res = await this.send(P.MessageType.Synchronize, P.encodeMarkRead(keys));
    // markera lokalt direkt, oavsett hur mycket servern skickar tillbaka
    for (const key of keys) {
      const k = `${key.identityId}|${key.offId}|${key.xxxId}`;
      const r = this.msgRows.get(k);
      if (r) this.msgRows.set(k, {...r, columns: {...r.columns, confirmed: true}});
    }
    this._take(P.decodeSync(res.payload));
  }
  async sendMessage(text) {
    if (!this.logon) throw new Error('inte inloggad');
    const payload = P.encodeSendMessage({offId: this.logon.acdOffId, resId: this.resId, vhcId: this.logon.vhcId, text});
    const res = await this.send(P.MessageType.Synchronize, payload);
    if (res.type === P.MessageType.Corrupt || res.type === P.MessageType.NotLoggedOn) {
      throw new Error('Servern tog inte emot meddelandet');
    }
    this._take(P.decodeSync(res.payload));
    return this.messages();
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

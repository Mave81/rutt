'use strict';
/*
 * Opter-klient för RUTT (React Native).
 * Samma flöde som Opter Driver: Logon -> välj förare -> StartWork -> hämta jobb.
 * Nätverket går via RN:s native lager (ingen CORS, till skillnad från WebView).
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

export default class OpterClient {
  constructor() {
    this.conn = null;
    this.connected = false;
    this.logon = null;
    this.lastDecoded = null;
    this.onPush = null;
  }

  async connect(cfg) {
    const url = connectionString(cfg);
    this.conn = new signalR.HubConnectionBuilder()
      .withUrl(url, {withCredentials: false})
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();
    this.conn.on('StartServerInitiatedSync', () => {
      if (this.onPush) this.onPush();
    });
    await this.conn.start();
    this.connected = true;
    return url;
  }

  async send(type, payloadBuffer) {
    if (!this.connected) throw new Error('inte ansluten');
    const resp = await this.conn.invoke('SendToServer2', P.frame(type, payloadBuffer || Buffer.alloc(0)));
    return P.unframe(resp);
  }

  async doLogon({user, pass}) {
    const res = await this.send(P.MessageType.Logon, P.logonPayload({user, pass, deviceId: deviceId()}));
    this.logon = P.parseLogon(res.payload);
    return this.logon;
  }

  async syncRef() {
    const res = await this.send(P.MessageType.Synchronize, Buffer.alloc(0));
    this.lastDecoded = P.decodeSync(res.payload);
    return this.lastDecoded;
  }

  resources() {
    return this.lastDecoded ? P.resourceList(this.lastDecoded) : [];
  }

  async startWork(resId) {
    const payload = P.encodeStartWork({
      offId: this.logon.acdOffId,
      resId,
      vhcId: this.logon.vhcId,
    });
    const res = await this.send(P.MessageType.Synchronize, payload);
    const decoded = P.decodeSync(res.payload);
    this.lastDecoded = decoded;
    return {rutt: P.toRutt(decoded), decoded};
  }

  async disconnect() {
    try {
      await this.send(P.MessageType.Disconnect, Buffer.alloc(0));
    } catch (e) {}
    try {
      await this.conn.stop();
    } catch (e) {}
    this.connected = false;
  }
}

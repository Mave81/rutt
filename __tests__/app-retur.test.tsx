import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text, NativeModules} from 'react-native';
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('react-native-image-picker', () => ({launchCamera: jest.fn(async () => ({assets: [{uri: 'file:///bdx-ncc.jpg'}]})), launchImageLibrary: jest.fn(async () => ({assets: ['bdx-moby-mlkit', 'bdx-ncc'].map(n => ({uri: 'file:///' + n + '.jpg', fileName: n + '.jpg'}))}))}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const P = require('../src/opter/protocol');
const {Buffer} = require('buffer');
const mockMsg = {v: 'Lastgods: 3 pall'};
function mockPayload() {
  const i32 = (n: number) => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; };
  const st = (tbl: string, xxx: number) => Buffer.concat([Buffer.from([1, P.Table.indexOf(tbl), 14]), i32(0), i32(7), i32(xxx), Buffer.from([0, 1])]);
  const en = (tbl: string) => Buffer.from([2, P.Table.indexOf(tbl)]);
  const S = (p: number, s: string) => { const x = Buffer.from(s); const h = Buffer.alloc(4); h[0] = 4; h[1] = p; h.writeInt16LE(x.length, 2); return Buffer.concat([h, x]); };
  const I = (p: number, n: number) => Buffer.concat([Buffer.from([5, p]), i32(n)]);
  const Bo = (p: number, v: boolean) => Buffer.from([7, p, v ? 1 : 0]);
  const status = (id: number, name: string, o: number, flags: any[]) => Buffer.concat([st('ShipmentStatus', id), S(16, name), I(21, o), ...flags, en('ShipmentStatus')]);
  const adr = (id: number, co: string, street: string, city: string) => Buffer.concat([st('Address', id), S(5, co), ...(street ? [S(6, street)] : []), S(9, city), en('Address')]);
  const q = (id: number, text: string, isBool: boolean, pick: boolean, del: boolean) => Buffer.concat([st('ShipmentQuery', id), S(2, text), I(3, isBool ? 1 : 0), Bo(4, pick), Bo(5, del), en('ShipmentQuery')]);
  const ship = (xxx: number, cur: number, a: number, b: number) => Buffer.concat([st('Shipment', xxx), I(59, xxx), I(2, a), I(3, b), I(11, cur), S(53, mockMsg.v),
    status(600, 'Meddelad', 1, []), status(601, 'Bekräftad', 2, [Bo(4, true), Bo(10, true)]), status(602, 'Nekad', 3, [Bo(5, true), Bo(10, true)]),
    status(603, 'Lastad', 4, [Bo(6, true), Bo(14, true)]), status(604, 'Lossad', 5, [Bo(7, true), Bo(8, true), Bo(14, true)]), en('Shipment')]);
  const dpt = Buffer.concat([st('DefaultPodType', 9), S(4, 'Kvittens'), Bo(7, true), Bo(17, true), en('DefaultPodType')]);
  return Buffer.concat([dpt, adr(21, 'BYGG-OLLE', 'Värmdövägen 754', 'SALTSJÖ-BOO'), adr(22, 'xxxxx', 'Norra Fiskartorpsvägen 2', 'Stockholm'), ship(239995, 603, 21, 22), Buffer.from([3]), Buffer.alloc(16)]);
}
const mockRutt = P.toRutt(P.decodeSync(mockPayload()));
const mockSet = jest.fn(async () => ({confirmed: true, rutt: mockRutt}));
const mockEdit = jest.fn(async () => ({confirmed: true, sent: true, changesSeen: {total: 1, seen: 1, missing: []}, rutt: mockRutt}));
jest.mock('../src/opter/OpterClient', () => jest.fn().mockImplementation(() => ({
  logon: {acdOffId: 7, vhcId: 1, ok: true},
  connect: jest.fn(async () => {}), doLogon: jest.fn(async () => ({ok: true, needChoose: false, resId: 5, name: 'Kenneth Andersson'})),
  syncRef: jest.fn(async () => ({rows: []})), resources: () => [], startWork: jest.fn(async () => ({rutt: mockRutt})),
  messages: () => [], poll: jest.fn(async () => ({rutt: require('../src/opter/protocol').toRutt(require('../src/opter/protocol').decodeSync(mockPayload())), msgs: []})), markRead: jest.fn(), setStatus: mockSet, editShipment: mockEdit,
  disconnect: jest.fn(), dump: jest.fn(), workStatus: jest.fn(), sendChat: jest.fn(async () => ({ok: true})), chat: jest.fn(async () => ({ok: true})),
})));
const App = require('../App').default;
const OrdersView = require('../src/ui/OrdersView').default;
const SignScreen = require('../src/ui/SignScreen').default;
const texts = (r: any) => r.root.findAll((n: any) => n.type === Text).map((n: any) => [].concat(n.props.children).map((x: any) => (typeof x === 'string' || typeof x === 'number' ? x : '')).join('')).join(' | ');
const tick = async (ms = 50) => { for (let i = 0; i < 6; i++) await ReactTestRenderer.act(async () => { await Promise.resolve(); jest.advanceTimersByTime(ms); }); };

test('3.69: retur → lämningen flyttas till BYGG-OLLE och Lossad där går till Opter på order 239995 med kvittensen', async () => {
  jest.useFakeTimers();
  let r: any;
  await ReactTestRenderer.act(async () => { r = ReactTestRenderer.create(<App />); });
  const ti = r.root.findAllByType(require('react-native').TextInput);
  await ReactTestRenderer.act(async () => { ti[0].props.onChangeText('3111'); ti[1].props.onChangeText('hemligt'); });
  const tn = r.root.findAll((c: any) => c.type === Text && /^Logga in$/.test([].concat(c.props.children).join('')))[0];
  let n = tn; while (n && !(n.props && n.props.onPress)) n = n.parent;
  await ReactTestRenderer.act(async () => { await n.props.onPress(); });
  await tick();
  let ov = r.root.findByType(OrdersView);
  const drop = ov.props.route.order.find((s: any) => String(s.drop) === '239995');
  expect(drop.who).toBe('xxxxx');
  await ReactTestRenderer.act(async () => { ov.props.onRetur('239995', drop, '', {mode: 'avs'}); });
  await tick();
  ov = r.root.findByType(OrdersView);
  const back = ov.props.route.order.find((s: any) => String(s.drop) === '239995');
  expect(back.who).toBe('Retur · BYGG-OLLE');
  expect(back.adr).toContain('Värmdövägen 754');
  expect(texts(r)).toContain('Retur · BYGG-OLLE');
  // Lossa hos BYGG-OLLE med kvittens (Christian Lundin) → Opter får Lossad på 239995 med kvittensen
  await ReactTestRenderer.act(async () => { ov.props.onUnload(back); });
  await tick();
  const ss = r.root.findByType(SignScreen);
  mockSet.mockClear();
  await ReactTestRenderer.act(async () => { ss.props.onDone({name: 'Christian Lundin', sig: {strokes: [[{x: 1, y: 1}, {x: 30, y: 20}]], w: 300, h: 200}, photos: []}); });
  await tick(2000); await tick(5000);
  const calls: any[] = mockSet.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const last = calls[calls.length - 1];
  expect(last[0].shiId).toBe(239995);
  expect(last[1]).toBe(604);              // Lossad
  expect(last[2]).toBeTruthy();           // med kvittens
  expect(last[2].name).toBe('Christian Lundin');
  expect(last[2].signature.length).toBeGreaterThan(5);
  jest.useRealTimers();
});

test('3.69: internt meddelande från kontoret syns på kortet och i ordern', async () => {
  const {default: OV} = require('../src/ui/OrdersView');
  const computeRoute = require('../src/opter/optimizer').default;
  mockMsg.v = 'BOM kunden hade redan fått cement - troligtvis dubbelbokat.';
  const rr = P.toRutt(P.decodeSync(mockPayload()));
  const d = rr.stops.find((s: any) => s.drop);
  expect(d.officeMsg).toBe('BOM kunden hade redan fått cement - troligtvis dubbelbokat.');
  const route = computeRoute(rr.stops.map((s: any) => (s.pickup ? {...s, done: true} : s)), rr.cargo, {lat: 59.3, lng: 18.0, end: '15:00'}, Date.now());
  const seen = jest.fn();
  let r: any;
  const M = {frame: {x: 0, y: 0, width: 390, height: 800}, insets: {top: 0, left: 0, right: 0, bottom: 0}};
  const {SafeAreaProvider} = require('react-native-safe-area-context');
  ReactTestRenderer.act(() => { r = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={M}><OV route={route} cargo={rr.cargo} ost={{}} allStops={rr.stops} onLoaded={() => {}} onUnload={() => {}} onEdit={() => {}} onAvised={() => {}} onRetry={() => {}} live onMsgSeen={seen} /></SafeAreaProvider>); });
  expect(texts(r)).toContain('Kontoret: BOM kunden hade redan fått cement');
  const cards = r.root.findAll((x: any) => x.props && x.props.onLongPress && x.props.onPress);
  ReactTestRenderer.act(() => { cards[0].props.onPress(); });
  expect(texts(r)).toContain('INTERNT MEDDELANDE · KONTORET');
  expect(seen).toHaveBeenCalledWith('239995', 'BOM kunden hade redan fått cement - troligtvis dubbelbokat.');
});

test('3.69: retur som lossades i 3.68 (eget stopp) → Klart: Skicka Lossad till Opter med Christian Lundins kvittens', async () => {
  const AS = require('@react-native-async-storage/async-storage');
  const {ORDERS_KEY} = require('../src/store');
  const {EGNA_KEY, fromParsed} = require('../src/egna');
  const DB = require('../src/dagbok');
  const now = Date.now();
  const e = fromParsed({kind: 'retur', title: 'Retur', from: 'RETUR', ref: '239995', pick: {name: 'xxxxx'}, drop: {name: 'BYGG-OLLE', adr: 'Värmdövägen 754', area: 'SALTSJÖ-BOO'}, goods: []}, null, null, DB.ymdOf());
  Object.assign(e, {id: 'E1', returOf: '239995', loadedAt: now - 3600000, doneAt: now - 600000, sms: false, pal: 3});
  await AS.setItem(EGNA_KEY, JSON.stringify([e]));
  await AS.setItem(ORDERS_KEY(false), JSON.stringify({'239995': {returAt: now - 7200000, who: 'xxxxx', orderNo: 239995}, E1: {loadedAt: now - 3600000, doneAt: now - 600000, pod: {name: 'Christian Lundin', sig: {strokes: [[{x: 1, y: 1}, {x: 40, y: 30}]], w: 300, h: 200}}}}));
  jest.useFakeTimers();
  let r: any;
  await ReactTestRenderer.act(async () => { r = ReactTestRenderer.create(<App />); });
  await tick();
  const ti = r.root.findAllByType(require('react-native').TextInput);
  if (ti.length >= 2) {
    await ReactTestRenderer.act(async () => { ti[0].props.onChangeText('3111'); ti[1].props.onChangeText('hemligt'); });
    const tn = r.root.findAll((c: any) => c.type === Text && /^Logga in$/.test([].concat(c.props.children).join('')))[0];
    let n = tn; while (n && !(n.props && n.props.onPress)) n = n.parent;
    await ReactTestRenderer.act(async () => { await n.props.onPress(); });
  }
  await tick();
  const {DoneView} = require('../src/ui/OrdersView');
  // Klart-fliken
  const kl = r.root.findAll((c: any) => c.type === Text && /^Klart/.test([].concat(c.props.children).join('')))[0];
  let k = kl; while (k && !(k.props && k.props.onPress)) k = k.parent;
  await ReactTestRenderer.act(async () => { await k.props.onPress(); });
  await tick();
  const dv = r.root.findByType(DoneView);
  const ret = dv.props.declined.find((d: any) => d.cid === '239995');
  expect(ret.old && ret.old.name).toBe('Christian Lundin');
  expect(texts(r)).toContain('Skicka Lossad till Opter · Christian Lundin');
  mockSet.mockClear();
  await ReactTestRenderer.act(async () => { dv.props.onOldRetur('239995'); });
  await tick(2000); await tick(5000);
  const calls: any[] = mockSet.mock.calls;
  const last = calls[calls.length - 1];
  expect(last[0].shiId).toBe(239995);
  expect(last[1]).toBe(604);
  expect(last[2].name).toBe('Christian Lundin');
  jest.useRealTimers();
});

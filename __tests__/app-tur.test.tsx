/* Turleveranslista ända in i appen: Skanna → Bilder → 3 stopp kopplade till Opter-ordern 234014 → Lastad når Opter → sista Lossad tar med 234014. */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text, NativeModules} from 'react-native';
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('react-native-image-picker', () => ({launchCamera: jest.fn(async () => ({assets: [{uri: 'file:///taby-platteknik.jpg'}]})), launchImageLibrary: jest.fn(async () => ({assets: ['opejra-pall', 'opejra-kartong', 'taby-platteknik', 'hnorr'].map(n => ({uri: 'file:///' + n + '.jpg', fileName: n + '.jpg'}))}))}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const P = require('../src/opter/protocol');
const {Buffer} = require('buffer');
function payload() {
  const i32 = (n: number) => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; };
  const st = (tbl: string, xxx: number) => Buffer.concat([Buffer.from([1, P.Table.indexOf(tbl), 14]), i32(0), i32(7), i32(xxx), Buffer.from([0, 1])]);
  const en = (tbl: string) => Buffer.from([2, P.Table.indexOf(tbl)]);
  const S = (p: number, s: string) => { const x = Buffer.from(s); const h = Buffer.alloc(4); h[0] = 4; h[1] = p; h.writeInt16LE(x.length, 2); return Buffer.concat([h, x]); };
  const I = (p: number, n: number) => Buffer.concat([Buffer.from([5, p]), i32(n)]);
  const Bo = (p: number, v: boolean) => Buffer.from([7, p, v ? 1 : 0]);
  const status = (id: number, name: string, o: number, flags: any[]) => Buffer.concat([st('ShipmentStatus', id), S(16, name), I(21, o), ...flags, en('ShipmentStatus')]);
  const adr = (id: number, co: string, street: string, city: string) => Buffer.concat([st('Address', id), S(5, co), ...(street ? [S(6, street)] : []), S(9, city), en('Address')]);
  const ship = (xxx: number, cur: number, a: number, b: number) => Buffer.concat([st('Shipment', xxx), I(59, xxx), I(2, a), I(3, b), I(11, cur), S(53, 'skriv timmar'),
    status(600, 'Meddelad', 1, []), status(601, 'Bekräftad', 2, [Bo(4, true), Bo(10, true)]), status(602, 'Nekad', 3, [Bo(5, true), Bo(10, true)]),
    status(603, 'Lastad', 4, [Bo(6, true)]), status(604, 'Lossad', 5, [Bo(7, true), Bo(8, true)]), en('Shipment')]);
  return Buffer.concat([adr(21, 'Bevego Älvsjö', 'Konsumentvägen 17', 'Älvsjö'), adr(22, 'Distribution', '', ''), ship(234014, 601, 21, 22), Buffer.from([3]), Buffer.alloc(16)]);
}
const mockRutt = P.toRutt(P.decodeSync(payload()));
const mockSet = jest.fn(async () => ({confirmed: true, rutt: mockRutt}));
jest.mock('../src/opter/OpterClient', () => jest.fn().mockImplementation(() => ({
  logon: {acdOffId: 7, vhcId: 1, ok: true},
  connect: jest.fn(async () => {}), doLogon: jest.fn(async () => ({ok: true, needChoose: false, resId: 5, name: 'Kenneth Andersson'})),
  syncRef: jest.fn(async () => ({rows: []})), resources: () => [], startWork: jest.fn(async () => ({rutt: mockRutt})),
  messages: () => [], poll: jest.fn(async () => ({rutt: mockRutt, msgs: []})), markRead: jest.fn(), setStatus: mockSet,
  disconnect: jest.fn(), dump: jest.fn(), workStatus: jest.fn(),
})));
(NativeModules as any).RuttSms = {ocr: jest.fn(async (uri: string) => { const n = uri.replace(/^file:\/\/\//, '').replace(/\.jpg$/, ''); return require('./fixtures/' + (/^(inomec|cramo)/.test(n) ? n : 'bevego-' + n) + '.json'); })};
const App = require('../App').default;
const OrdersView = require('../src/ui/OrdersView').default;
const SignScreen = require('../src/ui/SignScreen').default;
const texts = (r: any) => r.root.findAll((n: any) => n.type === Text).map((n: any) => [].concat(n.props.children).map((x: any) => (typeof x === 'string' || typeof x === 'number' ? x : '')).join('')).join(' | ');
const press = async (r: any, label: RegExp) => {
  const tn = r.root.findAll((c: any) => c.type === Text && label.test([].concat(c.props.children).map((x: any) => (typeof x === 'string' || typeof x === 'number' ? x : '')).join('')))[0];
  if (!tn) throw new Error('hittar inte text ' + label);
  let n = tn; while (n && !(n.props && n.props.onPress)) n = n.parent;
  await ReactTestRenderer.act(async () => { await n.props.onPress(); });
};
const tick = async (ms = 50) => { for (let i = 0; i < 6; i++) await ReactTestRenderer.act(async () => { await Promise.resolve(); jest.advanceTimersByTime(ms); }); };

test('turlista via Bilder → stopp kopplade till 234014, Lastad når Opter, sista Lossad tar med Opter-ordern (timjobb)', async () => {
  jest.useFakeTimers();
  let r: any;
  await ReactTestRenderer.act(async () => { r = ReactTestRenderer.create(<App />); });
  const ins = r.root.findAll((n: any) => n.props && n.props.onChangeText && n.props.secureTextEntry !== undefined || (n.props && n.props.onChangeText && n.props.placeholder)).filter((n: any) => typeof n.type !== 'string');
  const ti = r.root.findAllByType(require('react-native').TextInput);
  await ReactTestRenderer.act(async () => { ti[0].props.onChangeText('3111'); ti[1].props.onChangeText('hemligt'); });
  await press(r, /^Logga in$/);
  await tick();
  expect(texts(r)).toContain('Distribution'); // före: Opter säger bara "Distribution"

  await press(r, /^Skanna$/);
  expect(texts(r)).toContain('Kamera');
  expect(texts(r)).toContain('Bilder');
  await press(r, /^Bilder$/);
  await tick();
  const t = texts(r);
  expect(t).toContain('Turleveranslista');
  expect(t).toContain('3 STOPP');
  expect(t).toContain('2 pall + 1 kartong');
  expect(t).toMatch(/234014 · Bevego Älvsjö/);
  await press(r, /^Lägg i planen · 3 stopp$/);
  await tick();

  const ov = r.root.findByType(OrdersView);
  const order = ov.props.route.order;
  expect(order.filter((s: any) => s.pickup).map((s: any) => s.own ? s.own.drop.name : 'OPTER ' + s.pickup).sort()).toEqual(['H Norr Plat AB', 'OPTER 234014', 'Opejra Taby AB', 'Taby Platteknik AB']);
  expect(order.some((s: any) => String(s.drop) === '234014')).toBe(false); // "Distribution" göms – stoppen tar över
  const plan = texts(r);
  expect(plan).toContain('Opejra Taby AB');

  // Bladet för stoppet: hela körningen + Opter-ordern + timjobb
  await press(r, /^Opejra Taby AB$/);
  const sh = texts(r);
  expect(sh).toContain('KÖRNINGEN');
  expect(sh).toContain('Opter-order');
  expect(sh).toContain('Fogdevagen 7, 183 64');
  await press(r, /^Lastad$/);
  await tick(3000);
  // Lastad på ett stopp = hela familjen lastad, och Opter-ordern får Lastad
  expect(mockSet.mock.calls.some((c: any) => c[0] && c[0].shiId === 234014)).toBe(true);

  // Lossa alla tre stoppen på en gång → Opter-orderns lämning följer med i samma kvittens
  const ov2 = r.root.findByType(OrdersView);
  const drops = ov2.props.route.order.filter((s: any) => s.drop && s.own);
  expect(drops.length).toBe(3);
  // På timme: ordern säger "skriv timmar" → Ja från början. Du kan välja Nej innan Lossad – och Ja igen.
  expect(ov2.props.timOf(drops[0]).on).toBe(true);
  expect(texts(r)).toContain('På timme');
  await ReactTestRenderer.act(async () => { ov2.props.onSetTim(drops, false); });
  await ReactTestRenderer.act(async () => { r.root.findByType(OrdersView).props.onUnload(drops[0], drops.slice(1)); });
  expect(r.root.findByType(SignScreen).props.timjobb).toBe(false);
  await ReactTestRenderer.act(async () => { r.root.findByType(SignScreen).props.onCancel(); });
  await ReactTestRenderer.act(async () => { r.root.findByType(OrdersView).props.onSetTim(drops, true); });
  await ReactTestRenderer.act(async () => { r.root.findByType(OrdersView).props.onUnload(drops[0], drops.slice(1)); });
  const sg = r.root.findByType(SignScreen);
  expect(sg.props.stop.group.map((x: any) => String(x.drop))).toContain('234014');
  expect(sg.props.timjobb).toBe(true);
  expect(typeof sg.props.start).toBe('number');
  jest.useRealTimers();
});

test('Kamera: turlista blir stopp, en Inomec-sedel går vidare till "Gör till jobb"', async () => {
  jest.useFakeTimers();
  const IP = require('react-native-image-picker');
  await require('@react-native-async-storage/async-storage').clear();
  let r: any;
  await ReactTestRenderer.act(async () => { r = ReactTestRenderer.create(<App />); });
  const ti = r.root.findAllByType(require('react-native').TextInput);
  await ReactTestRenderer.act(async () => { ti[0].props.onChangeText('3111'); ti[1].props.onChangeText('hemligt'); });
  await press(r, /^Logga in$/);
  await tick();
  // Tryck på NÄSTA (en order på stoppet) → hela ordern direkt: texten och vart det ska
  await press(r, /^visa ›$/);
  const o1 = texts(r);
  expect(o1).toContain('KÖRNINGEN');
  expect(o1).toContain('TEXT I ORDERN');
  expect(o1).toContain('skriv timmar');
  expect(o1).toContain('Adressen saknas i ordern');
  expect(o1).toContain('Läs in turleveranslistan');
  await press(r, /^Läs in turleveranslistan$/);
  await press(r, /^Kamera$/);
  await tick();
  expect(texts(r)).toContain('1 STOPP');
  expect(texts(r)).toContain('Taby Platteknik AB');
  await press(r, /^Avbryt$/);
  await tick();
  IP.launchCamera.mockImplementationOnce(async () => ({assets: [{uri: 'file:///inomec-hamt.jpg'}]}));
  await press(r, /^Skanna$/);
  await press(r, /^Kamera$/);
  await tick();
  expect(texts(r)).toContain('Gör till jobb');
  jest.useRealTimers();
});

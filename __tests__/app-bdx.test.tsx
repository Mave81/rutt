/* BDX-fraktsedlar i appen: Skanna → två sedlar → bekräfta adresserna → den som redan finns i Opter får sedeln, den andra blir ett stopp. */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text, NativeModules} from 'react-native';
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('react-native-image-picker', () => ({launchCamera: jest.fn(async () => ({assets: [{uri: 'file:///bdx-ncc.jpg'}]})), launchImageLibrary: jest.fn(async () => ({assets: ['bdx-moby-mlkit', 'bdx-ncc'].map(n => ({uri: 'file:///' + n + '.jpg', fileName: n + '.jpg'}))}))}));
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
  const ship = (xxx: number, cur: number, a: number, b: number) => Buffer.concat([st('Shipment', xxx), I(59, xxx), I(2, a), I(3, b), I(11, cur), S(53, 'Bud BDX'),
    status(600, 'Meddelad', 1, []), status(601, 'Bekräftad', 2, [Bo(4, true), Bo(10, true)]), status(602, 'Nekad', 3, [Bo(5, true), Bo(10, true)]),
    status(603, 'Lastad', 4, [Bo(6, true)]), status(604, 'Lossad', 5, [Bo(7, true), Bo(8, true)]), en('Shipment')]);
  return Buffer.concat([adr(21, 'BDX Terminal Årsta', 'Transportvägen 9', 'Stockholm'), adr(22, 'Moby Modulärt byggande AB', 'Vårbergsvägen 69', 'Skärholmen'), ship(234100, 601, 21, 22), Buffer.from([3]), Buffer.alloc(16)]);
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
(NativeModules as any).RuttSms = {ocr: jest.fn(async (uri: string) => require('./fixtures/' + uri.replace(/^file:\/\/\//, '').replace(/\.jpg$/, '') + '.json'))};
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
const pressLast = async (r: any, label: RegExp) => {
  const all = r.root.findAll((c: any) => c.type === Text && label.test([].concat(c.props.children).map((x: any) => (typeof x === 'string' || typeof x === 'number' ? x : '')).join('')));
  let n = all[all.length - 1]; while (n && !(n.props && n.props.onPress)) n = n.parent;
  await ReactTestRenderer.act(async () => { await n.props.onPress(); });
};
const tick = async (ms = 50) => { for (let i = 0; i < 6; i++) await ReactTestRenderer.act(async () => { await Promise.resolve(); jest.advanceTimersByTime(ms); }); };

test('två BDX-sedlar: adressen bekräftas, Moby läggs på Opter-order 234100, NCC blir eget stopp (godset i bilen)', async () => {
  jest.useFakeTimers();
  let r: any;
  await ReactTestRenderer.act(async () => { r = ReactTestRenderer.create(<App />); });
  const ti = r.root.findAllByType(require('react-native').TextInput);
  await ReactTestRenderer.act(async () => { ti[0].props.onChangeText('3111'); ti[1].props.onChangeText('hemligt'); });
  await press(r, /^Logga in$/);
  await tick();
  await press(r, /^Skanna$/);
  await press(r, /^Bilder$/);
  await tick();
  const t = texts(r);
  expect(t).toContain('Fraktsedlar');
  expect(t).toContain('2 STOPP');
  expect(t).toContain('Moby Modulärt byggande AB');
  expect(t).toContain('Vårbergsvägen 69');
  expect(t).toContain('127 43 Skärholmen');
  expect(t).toContain('026 559 874 8');
  expect(t).toMatch(/10 av 10 kolli/);
  expect(t).toContain('155 kg');
  expect(t).toContain('AHLSELL AB, 694 35 Hallsberg, ref 6407618');
  expect(t).toContain('AO20127');
  expect(t).toMatch(/1 av 5 sidor lästa/);
  expect(t).toMatch(/Finns i Opter: order 234100 \(samma adress\)/);
  expect(t).toContain('Bogsätravägen 12');
  expect(t).toContain('Kristoffer Jendré');
  expect(t).toContain('Bekräfta adresserna · 0 av 2');
  await press(r, /^Ja, stämmer$/);
  await press(r, /^Ja, stämmer$/);
  await press(r, /^Lägg i planen · 2 stopp$/);
  await tick();
  const ov = r.root.findByType(OrdersView);
  const order = ov.props.route.order;
  // NCC: eget stopp, redan lastat → bara lämningen kvar. Moby: ingen ny – sedeln ligger på 234100.
  expect(order.filter((s: any) => s.own).map((s: any) => (s.drop ? 'L ' : 'H ') + s.who)).toEqual(['L NCC Bogsätravägen 12 / NCC']);
  expect(ov.props.sedelOf('234100')).toMatchObject({sendNo: '0265598748', total: 10, kg: 155});
  // Ordern 234100 (lämna Moby) visar den inlästa sedeln
  const drop = order.find((s: any) => String(s.drop) === '234100');
  expect(drop).toBeTruthy();
  await ReactTestRenderer.act(async () => {});
  const dr = r.root.findAll((n: any) => n.type === Text && [].concat(n.props.children).join('') === 'Moby Modulärt byggande AB');
  let n = dr[dr.length - 1]; while (n && !(n.props && n.props.onPress)) n = n.parent;
  await ReactTestRenderer.act(async () => { n.props.onPress(); });
  const sh = texts(r);
  expect(sh).toContain('FRAKTSEDEL (INLÄST)');
  expect(sh).toContain('373217102323515100  Europapall  61 kg');
  expect(sh).toMatch(/7 kartong/);
  jest.useRealTimers();
});

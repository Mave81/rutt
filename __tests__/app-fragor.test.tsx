/* Frågor från kontoret (Opter: Frågor) vid Lastad och Lossad – som Opters statusdialog. */
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
  const q = (id: number, text: string, isBool: boolean, pick: boolean, del: boolean) => Buffer.concat([st('ShipmentQuery', id), S(2, text), I(3, isBool ? 1 : 0), Bo(4, pick), Bo(5, del), en('ShipmentQuery')]);
  const ship = (xxx: number, cur: number, a: number, b: number) => Buffer.concat([st('Shipment', xxx), I(59, xxx), I(2, a), I(3, b), I(11, cur), S(53, 'Bud BDX'),
    status(600, 'Meddelad', 1, []), status(601, 'Bekräftad', 2, [Bo(4, true), Bo(10, true)]), status(602, 'Nekad', 3, [Bo(5, true), Bo(10, true)]),
    status(603, 'Lastad', 4, [Bo(6, true), Bo(22, true)]), status(604, 'Lossad', 5, [Bo(7, true), Bo(8, true), Bo(22, true)]),
    q(31, 'Antal pallar tillbaka?', false, true, false), q(32, 'Är godset oskadat?', true, false, true), en('Shipment')]);
  return Buffer.concat([adr(21, 'BDX Terminal Årsta', 'Transportvägen 9', 'Stockholm'), adr(22, 'Moby Modulärt byggande AB', 'Vårbergsvägen 69', 'Skärholmen'), ship(234100, 601, 21, 22), Buffer.from([3]), Buffer.alloc(16)]);
}
const mockRutt = P.toRutt(P.decodeSync(payload()));
const mockSet = jest.fn(async () => ({confirmed: true, rutt: mockRutt}));
const mockEdit = jest.fn(async () => ({confirmed: true, sent: true, changesSeen: {total: 1, seen: 1, missing: []}, rutt: mockRutt}));
jest.mock('../src/opter/OpterClient', () => jest.fn().mockImplementation(() => ({
  logon: {acdOffId: 7, vhcId: 1, ok: true},
  connect: jest.fn(async () => {}), doLogon: jest.fn(async () => ({ok: true, needChoose: false, resId: 5, name: 'Kenneth Andersson'})),
  syncRef: jest.fn(async () => ({rows: []})), resources: () => [], startWork: jest.fn(async () => ({rutt: mockRutt})),
  messages: () => [], poll: jest.fn(async () => ({rutt: mockRutt, msgs: []})), markRead: jest.fn(), setStatus: mockSet, editShipment: mockEdit,
  disconnect: jest.fn(), dump: jest.fn(), workStatus: jest.fn(),
})));
(NativeModules as any).RuttSms = {ocr: jest.fn(async (uri: string) => require('./fixtures/' + uri.replace(/^file:\/\/\//, '').replace(/\.jpg$/, '') + '.json'))};
const App = require('../App').default;
const OrdersView = require('../src/ui/OrdersView').default;
const SignScreen = require('../src/ui/SignScreen').default;
const {TimeSheet} = require('../src/ui/Wheel');
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

test('frågor vid hämtning frågas innan Lastad, svaren går före statusen; frågan vid lämning krävs i kvittensen', async () => {
  jest.useFakeTimers();
  let r: any;
  await ReactTestRenderer.act(async () => { r = ReactTestRenderer.create(<App />); });
  const ti = r.root.findAllByType(require('react-native').TextInput);
  await ReactTestRenderer.act(async () => { ti[0].props.onChangeText('3111'); ti[1].props.onChangeText('hemligt'); });
  await press(r, /^Logga in$/);
  await tick();
  const ov = r.root.findByType(OrdersView);
  const pick = ov.props.route.order.find((s: any) => String(s.pickup) === '234100');
  await ReactTestRenderer.act(async () => { ov.props.onLoaded(pick); });
  let t = texts(r);
  expect(t).toContain('Innan du lastar');
  expect(t).toContain('Antal pallar tillbaka?');
  expect(t).toContain('Saknas: svar: Antal pallar tillbaka?');
  const inp = r.root.findAll((n: any) => n.props && n.props.placeholder === 'Svar' && n.props.onChangeText)[0];
  await ReactTestRenderer.act(async () => { inp.props.onChangeText('2'); });
  mockEdit.mockClear(); mockSet.mockClear();
  await pressLast(r, /^Lastad$/);
  await tick(2000);
  expect(mockEdit).toHaveBeenCalledTimes(1);
  const ans = (mockEdit.mock.calls[0] as any)[1].answers;
  expect(ans.map((a: any) => [a.key.xxxId, a.text])).toEqual([[31, '2']]);
  expect(mockEdit.mock.invocationCallOrder[0]).toBeLessThan(mockSet.mock.invocationCallOrder[0]);
  // Lossad: frågan vid lämning krävs
  const drop = r.root.findByType(OrdersView).props.route.order.find((s: any) => String(s.drop) === '234100');
  await ReactTestRenderer.act(async () => { r.root.findByType(OrdersView).props.onUnload(drop); });
  t = texts(r);
  expect(t).toContain('Frågor från kontoret');
  expect(t).toContain('Är godset oskadat?');
  expect(t).toMatch(/Saknas:.*svar: Är godset oskadat\?/);
  jest.useRealTimers();
});

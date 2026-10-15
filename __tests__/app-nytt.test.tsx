import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text, Pressable} from 'react-native';
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('react-native-image-picker', () => ({launchCamera: jest.fn(), launchImageLibrary: jest.fn()}));
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
  const adr = (id: number, co: string, street: string, city: string) => Buffer.concat([st('Address', id), S(5, co), S(6, street), S(9, city), en('Address')]);
  const ship = (xxx: number, cur: number, a: number, b: number) => Buffer.concat([st('Shipment', xxx), I(59, xxx), I(2, a), I(3, b), I(11, cur), S(53, 'inbärning Nytorgsgatan 33. Ring 08 518 332 62'),
    status(600, 'Meddelad', 1, []), status(601, 'Bekräftad', 2, [Bo(4, true), Bo(10, true)]), status(602, 'Nekad', 3, [Bo(5, true), Bo(10, true)]),
    status(603, 'Lastad', 4, [Bo(6, true)]), status(604, 'Lossad', 5, [Bo(7, true), Bo(8, true)]), en('Shipment')]);
  return Buffer.concat([adr(11, 'BDX', 'Transportvägen 7', 'STOCKHOLM'), adr(12, '""', 'Nytorgsgatan 33', 'Stockholm'), adr(13, 'Stena', 'Metallvägen 60', 'Rosersberg'), adr(14, 'Distribution', 'Rudsjöterassen', 'Haninge'),
    ship(226825, 600, 11, 12), ship(226815, 601, 13, 14), ship(226188, 604, 13, 14), Buffer.from([3]), Buffer.alloc(16)]);
}
const mockRutt = P.toRutt(P.decodeSync(payload()));
jest.mock('../src/opter/OpterClient', () => jest.fn().mockImplementation(() => ({
  logon: {acdOffId: 7, vhcId: 1, ok: true},
  connect: jest.fn(async () => {}), doLogon: jest.fn(async () => ({ok: true, needChoose: false, resId: 5, name: 'Kenneth Andersson'})),
  syncRef: jest.fn(async () => ({rows: []})), resources: () => [], startWork: jest.fn(async () => ({rutt: mockRutt})),
  messages: () => [], poll: jest.fn(async () => ({rutt: mockRutt, msgs: []})), markRead: jest.fn(), setStatus: jest.fn(async () => ({confirmed: true, rutt: mockRutt})),
  disconnect: jest.fn(), dump: jest.fn(), workStatus: jest.fn(),
})));
import App from '../App';

const press = async (r: any, label: RegExp) => {
  const tn = r.root.findAll((c: any) => c.type === Text && label.test([].concat(c.props.children).map((x: any) => (typeof x === 'string' || typeof x === 'number' ? x : '')).join('')))[0];
  if (!tn) throw new Error('hittar inte text ' + label);
  let n = tn; while (n && !(n.props && n.props.onPress)) n = n.parent;
  if (!n) throw new Error('ingen tryckbar förälder för ' + label);
  await ReactTestRenderer.act(async () => { n.props.onPress(); });
};
const texts = (r: any) => r.root.findAll((n: any) => n.type === Text).map((n: any) => [].concat(n.props.children).join('')).join(' | ');

test('logga in → tryck Nytt → acceptera', async () => {
  jest.useFakeTimers();
  let r: any;
  await ReactTestRenderer.act(async () => { r = ReactTestRenderer.create(<App />); });
  console.log('START:', texts(r).slice(0, 500), '| JSON:', JSON.stringify(r.toJSON()).slice(0, 300));
  await press(r, /Logga in & hämta/);
  await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(50); });
  console.log('EFTER LOGIN:', texts(r).slice(0, 400));
  await press(r, /väntar på svar/);
  console.log('NYTT-FLIKEN:', texts(r).slice(0, 600));
  await press(r, /^Acceptera$/);
  console.log('EFTER ACCEPT:', texts(r).slice(0, 300));
  await press(r, /^Klart/);
  console.log('KLART-FLIKEN:', texts(r).slice(0, 300));
  await press(r, /^Plan$/);
  await press(r, /^Last$/);
  await press(r, /^Kontoret/);
  await press(r, /^Plan$/);
  console.log('PLAN:', texts(r).slice(0, 700));
});

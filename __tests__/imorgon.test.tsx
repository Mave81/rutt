// Imorgon-planen: tryck på en order → samma blad som idag (hela körningen, texten, navigera).
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text} from 'react-native';
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('react-native-image-picker', () => ({launchCamera: jest.fn(), launchImageLibrary: jest.fn()}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const computeRoute = require('../src/opter/optimizer').default;
const PlanDay = require('../src/ui/PlanDay').default;
const OrdersView = require('../src/ui/OrdersView').default;
const texts = (r: any) => r.root.findAll((n: any) => n.type === Text).map((n: any) => [].concat(n.props.children).map((x: any) => (typeof x === 'string' || typeof x === 'number' ? x : '')).join('')).join(' | ');
const d = new Date(Date.now() + 86400000), day = d.toISOString().slice(0, 10);
const stops = [
  {pickup: '234769', who: 'Flugger haninge', adr: 'Nynäsvägen 3J', zip: '13647', area: 'Haninge', lat: 59.17, lng: 18.14, orderNo: '234769', service: 'Bud Flugger', info: 'Vikt: ca 1100 kg 1 helpall + 10st burkar löst', tEarliest: {date: day, hhmm: '07:30'}, tel: []},
  {drop: '234769', who: 'Lyckås måleri', adr: 'klockelundsvägen', zip: '12363', area: 'Farsta', lat: 59.24, lng: 18.1, orderNo: '234769', service: 'Bud Flugger', info: 'Vikt: ca 1100 kg 1 helpall + 10st burkar löst', contact: 'Niklas', tel: [{label: 'Niklas', num: '0735263714'}]},
];
const cargo = {'234769': {pal: 1, kg: 1100}};
test('rad i Imorgon går att trycka på och öppnar hela ordern', async () => {
  const route = {...computeRoute(stops, cargo, {lat: 59.27, lng: 18.0}, new Date(day + 'T06:00').getTime(), null), day};
  const onOpen = jest.fn();
  let r: any;
  await ReactTestRenderer.act(async () => { r = ReactTestRenderer.create(<PlanDay route={route} cargo={cargo} onReorder={() => {}} onOpen={onOpen} />); });
  const row = r.root.findAll((n: any) => n.props && n.props.accessibilityLabel === 'Lämna Lyckås måleri – visa ordern')[0];
  await ReactTestRenderer.act(async () => { row.props.onPress(); });
  expect(onOpen.mock.calls[0][0]).toMatchObject({drop: '234769', who: 'Lyckås måleri'});
  let v: any;
  await ReactTestRenderer.act(async () => { v = ReactTestRenderer.create(<OrdersView sheetOnly openReq={{key: 1, cid: '234769', kind: 'drop'}} route={route} cargo={cargo} ost={{}} allStops={stops} onLoaded={() => {}} onUnload={() => {}} onEdit={() => {}} onAvised={() => {}} onRetry={() => {}} live />); });
  const t = texts(v);
  expect(t).toContain('KÖRNINGEN');
  expect(t).toContain('Flugger haninge');
  expect(t).toContain('Lyckås måleri');
  expect(t).toContain('Vikt: ca 1100 kg 1 helpall + 10st burkar löst');
  expect(t).not.toContain('ORDER KVAR'); // bara bladet, inte listan
});

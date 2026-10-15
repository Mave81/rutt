import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
jest.mock('react-native-image-picker', () => ({launchCamera: jest.fn(), launchImageLibrary: jest.fn()}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import {SafeAreaProvider} from 'react-native-safe-area-context';
import NewOrdersView from '../src/ui/NewOrdersView';
const M = {frame: {x: 0, y: 0, width: 390, height: 800}, insets: {top: 0, left: 0, right: 0, bottom: 0}};
const W = (el: any) => <SafeAreaProvider initialMetrics={M}>{el}</SafeAreaProvider>;
import OrdersView from '../src/ui/OrdersView';
// @ts-ignore
import computeRoute from '../src/opter/optimizer';

const info = 'Ring Katta på stena 010 445 72 71 och meddela\nJohannes 08 518 332 62 Avisera kund Ca 1 timma innan ankomst';
const pick = {verb: 'Hämta', pickup: 'X', who: 'BDX', adr: 'Transportvägen 7', area: 'STOCKHOLM', info, orderNo: 226825, service: 'Bud', kolli: 0, live: {isNew: true}};
const drop = {verb: 'Lämna', drop: 'X', who: '""', adr: 'Nytorgsgatan 33', area: 'Stockholm', info, orderNo: 226825, live: {isNew: true}};

test('Nytt med en order renderas', () => {
  let r: any;
  ReactTestRenderer.act(() => { r = ReactTestRenderer.create(W(<NewOrdersView orders={[{cid: 'X', pick, drop}]} onAccept={() => {}} onReject={() => {}} />)); });
  expect(r.toJSON()).toBeTruthy();
});
test('Nytt tom renderas', () => {
  let r: any;
  ReactTestRenderer.act(() => { r = ReactTestRenderer.create(W(<NewOrdersView orders={[]} onAccept={() => {}} onReject={() => {}} />)); });
  expect(r.toJSON()).toBeTruthy();
});
test('Plan med riktig orderdata renderas', () => {
  const stops = [{...pick, lat: 59.3, lng: 18.0}, {...drop, lat: 59.31, lng: 18.08}];
  const route = computeRoute(stops, {X: {name: 'Bud', pal: 1, kg: 0}}, {lat: 59.24, lng: 18.22, end: '15:00'}, Date.now());
  let r: any;
  ReactTestRenderer.act(() => { r = ReactTestRenderer.create(W(<OrdersView route={route} cargo={{X: {pal: 1}}} ost={{}} allStops={stops} onLoaded={() => {}} onUnload={() => {}} onExtra={() => {}} onAvised={() => {}} onRetry={() => {}} live={false} />)); });
  expect(r.toJSON()).toBeTruthy();
});

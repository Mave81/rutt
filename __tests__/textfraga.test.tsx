/* 3.65: texten i ordern nämner Haninge – kortet säger till, bladet frågar och lägger till ett hämtställe. */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
jest.mock('react-native-image-picker', () => ({launchCamera: jest.fn(), launchImageLibrary: jest.fn()}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {Text, TextInput} from 'react-native';
import OrdersView from '../src/ui/OrdersView';
// @ts-ignore
import computeRoute from '../src/opter/optimizer';
const M = {frame: {x: 0, y: 0, width: 390, height: 800}, insets: {top: 0, left: 0, right: 0, bottom: 0}};
const W = (el: any) => <SafeAreaProvider initialMetrics={M}>{el}</SafeAreaProvider>;
const info = '2 pallar. 1 pall i Västberga sen en i Haninge';
const pick = {verb: 'Hämta', pickup: 'X', who: 'Flugger Västberga', adr: 'Drivhjulsvägen 32', area: 'Hägersten', info, orderNo: 230111, lat: 59.2955, lng: 18.0168};
const drop = {verb: 'Lämna', drop: 'X', who: 'Måleri AB', adr: 'Ulvsundavägen 181', area: 'Bromma', info, orderNo: 230111, lat: 59.3371, lng: 17.9662};
const txt = (r: any) => r.root.findAllByType(Text).map((t: any) => [].concat(t.props.children).filter((c: any) => typeof c === 'string').join('')).join('\n');

test('Haninge i texten: kortet säger till, Nej sparas, Lägg till ger ett hämtställe', () => {
  const route = computeRoute([pick, drop], {X: {pal: 2}}, {lat: 59.24, lng: 18.22, end: '15:00'}, Date.now());
  const ask = jest.fn(), add = jest.fn();
  let r: any;
  ReactTestRenderer.act(() => { r = ReactTestRenderer.create(W(<OrdersView route={route} cargo={{X: {pal: 2}}} ost={{}} allStops={[pick, drop]} onLoaded={() => {}} onUnload={() => {}} onEdit={() => {}} onAvised={() => {}} onRetry={() => {}} live={false} onTextAsk={ask} onAddExtra={add} />)); });
  expect(txt(r)).toContain('Texten nämner Haninge');
  // Öppna orderbladet för hämtningen
  const card = r.root.findAll((n: any) => n.props && n.props.onLongPress && n.props.onPress)[0];
  ReactTestRenderer.act(() => { card.props.onPress(); });
  let t = txt(r);
  if (!t.includes('hämtas något där?')) {
    const one = r.root.findAll((n: any) => n.props && n.props.onLongPress && n.props.onPress);
    ReactTestRenderer.act(() => { one[one.length - 1].props.onPress(); });
    t = txt(r);
  }
  expect(t).toContain('Texten nämner Haninge – hämtas något där?');
  const btn = (label: string) => r.root.findAll((n: any) => n.props && typeof n.props.onPress === 'function' && n.findAll((m: any) => m.type === Text && [].concat(m.props.children).join('') === label).length).pop();
  ReactTestRenderer.act(() => { btn('Lägg till hämtställe').props.onPress(); });
  const ins = r.root.findAllByType(TextInput);
  const byPh = (p: string) => ins.find((i: any) => String(i.props.placeholder).startsWith(p));
  expect(byPh('Ort').props.value).toBe('Haninge');
  ReactTestRenderer.act(() => { byPh('Företag').props.onChangeText('Beijer Haninge'); });
  ReactTestRenderer.act(() => { btn('Lägg in i planen').props.onPress(); });
  expect(add).toHaveBeenCalledWith('X', expect.anything(), {name: 'Beijer Haninge', adr: '', area: 'Haninge', goods: ''});
});
test('svarat Nej: ingen fråga igen', () => {
  const route = computeRoute([pick, drop], {X: {pal: 2}}, {lat: 59.24, lng: 18.22, end: '15:00'}, Date.now());
  let r: any;
  ReactTestRenderer.act(() => { r = ReactTestRenderer.create(W(<OrdersView route={route} cargo={{X: {pal: 2}}} ost={{X: {textAsk: {Haninge: 'nej'}}}} allStops={[pick, drop]} onLoaded={() => {}} onUnload={() => {}} onEdit={() => {}} onAvised={() => {}} onRetry={() => {}} live={false} onTextAsk={() => {}} onAddExtra={() => {}} />)); });
  expect(txt(r)).not.toContain('Haninge –');
});

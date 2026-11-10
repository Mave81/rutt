/* 3.67: retur – kunden hade redan fått godset → Bomkörning. Lämna-bladet har knappen, Klart visar returen med Ångra. */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
jest.mock('react-native-image-picker', () => ({launchCamera: jest.fn(), launchImageLibrary: jest.fn()}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {Text, TextInput} from 'react-native';
import OrdersView, {DoneView} from '../src/ui/OrdersView';
// @ts-ignore
import computeRoute from '../src/opter/optimizer';
const M = {frame: {x: 0, y: 0, width: 390, height: 800}, insets: {top: 0, left: 0, right: 0, bottom: 0}};
const W = (el: any) => <SafeAreaProvider initialMetrics={M}>{el}</SafeAreaProvider>;
const txt = (r: any) => r.root.findAllByType(Text).map((t: any) => [].concat(t.props.children).filter((c: any) => typeof c === 'string').join('')).join('\n');
const btn = (r: any, label: string) => r.root.findAll((n: any) => n.props && typeof n.props.onPress === 'function' && n.findAll((m: any) => m.type === Text && [].concat(m.props.children).join('') === label).length).pop();
const pick = {verb: 'Hämta', pickup: 'X', who: 'Alcro Länna', adr: 'Nyckelvägen 1', area: 'Skogås', orderNo: 239995, lat: 59.22, lng: 18.15};
const drop = {verb: 'Lämna', drop: 'X', who: 'Måleri AB', adr: 'Norra Fiskartorpsvägen 2', area: 'Stockholm', orderNo: 239995, lat: 59.35, lng: 18.08};

test('lämna-bladet: Retur → bekräfta → onRetur med kommentar', () => {
  const route = computeRoute([{...pick, done: true}, drop], {X: {pal: 3}}, {lat: 59.3, lng: 18.0, end: '15:00'}, Date.now());
  const ret = jest.fn();
  let r: any;
  ReactTestRenderer.act(() => { r = ReactTestRenderer.create(W(<OrdersView route={route} cargo={{X: {pal: 3}}} ost={{X: {loadedAt: Date.now()}}} allStops={[pick, drop]} onLoaded={() => {}} onUnload={() => {}} onEdit={() => {}} onAvised={() => {}} onRetry={() => {}} live={false} onRetur={ret} />)); });
  const cards = r.root.findAll((n: any) => n.props && n.props.onLongPress && n.props.onPress);
  ReactTestRenderer.act(() => { cards[0].props.onPress(); });
  ReactTestRenderer.act(() => { btn(r, 'Retur – kunden har redan fått godset').props.onPress(); });
  expect(txt(r)).toContain('Tillbaka till Alcro Länna');
  expect(txt(r)).toContain('Ligger kvar i bilen');
  const inp = r.root.findAllByType(TextInput).find((i: any) => i.props.placeholder === 'Kommentar (valfritt)');
  ReactTestRenderer.act(() => { inp.props.onChangeText('Levererat i fredags'); });
  ReactTestRenderer.act(() => { btn(r, 'Markera retur').props.onPress(); });
  expect(ret).toHaveBeenCalledWith('X', expect.objectContaining({drop: 'X'}), 'Levererat i fredags', expect.objectContaining({mode: 'avs'}));
});
test('hämta-bladet har ingen returknapp', () => {
  const route = computeRoute([pick, drop], {X: {pal: 3}}, {lat: 59.3, lng: 18.0, end: '15:00'}, Date.now());
  let r: any;
  ReactTestRenderer.act(() => { r = ReactTestRenderer.create(W(<OrdersView route={route} cargo={{X: {pal: 3}}} ost={{}} allStops={[pick, drop]} onLoaded={() => {}} onUnload={() => {}} onEdit={() => {}} onAvised={() => {}} onRetry={() => {}} live={false} onRetur={() => {}} />)); });
  const cards = r.root.findAll((n: any) => n.props && n.props.onLongPress && n.props.onPress);
  ReactTestRenderer.act(() => { cards[0].props.onPress(); });
  expect(txt(r)).toContain('Alcro Länna');
  expect(txt(r)).not.toContain('Retur – kunden har redan fått godset');
});
test('Klart: returen syns med Ångra', () => {
  const undo = jest.fn();
  let r: any;
  ReactTestRenderer.act(() => { r = ReactTestRenderer.create(W(<DoneView done={[]} onRetry={() => {}} onOpen={() => {}} declined={[{cid: 'X', who: 'Måleri AB', orderNo: 239995, at: Date.now(), kind: 'retur'}]} onUndoRetur={undo} />)); });
  const t = txt(r);
  expect(t).toContain('RETUR – BOMKÖRNING');
  expect(t).toContain('godset ligger i bilen');
  ReactTestRenderer.act(() => { btn(r, 'Ångra – tillbaka i planen').props.onPress(); });
  expect(undo).toHaveBeenCalledWith('X');
});

test('Klart: retur utan stopp kan köras tillbaka till avsändaren', () => {
  const back = jest.fn();
  let r: any;
  ReactTestRenderer.act(() => { r = ReactTestRenderer.create(W(<DoneView done={[]} onRetry={() => {}} onOpen={() => {}} declined={[{cid: 'X', who: 'xxxxx', orderNo: 239995, at: Date.now(), kind: 'retur', back: null, sender: {who: 'BYGG-OLLE'}}]} onReturBack={back} />)); });
  ReactTestRenderer.act(() => { btn(r, 'Kör tillbaka till BYGG-OLLE').props.onPress(); });
  expect(back).toHaveBeenCalledWith('X');
});

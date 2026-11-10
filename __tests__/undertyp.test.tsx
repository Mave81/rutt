/* 3.70: undertyp på kvittensen – som Opter Driver (ProofOfDelivery: synlig = ShowSub, krävs = RequireSub). Syns med rubrik och KRÄVS, och "Saknas" leder dit. */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text} from 'react-native';
jest.mock('react-native-image-picker', () => ({launchCamera: jest.fn(), launchImageLibrary: jest.fn()}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import {SafeAreaProvider} from 'react-native-safe-area-context';
import SignScreen from '../src/ui/SignScreen';
const M = {frame: {x: 0, y: 0, width: 390, height: 800}, insets: {top: 0, left: 0, right: 0, bottom: 0}};
const texts = (r: any) => r.root.findAll((n: any) => n.type === Text).map((n: any) => [].concat(n.props.children).map((x: any) => (typeof x === 'string' ? x : '')).join('')).join(' | ');
const main = {id: 5, name: 'Kvittens', mainId: 0, req: {name: true, sig: true}, showSub: true, requireSub: true};
const sub = (id: number, name: string) => ({id, name, mainId: 5, req: {name: true, sig: true}, showSub: false, requireSub: false});
const stopWith = (subs: any[]) => ({drop: '1', who: 'Kund AB', adr: 'Gatan 1', orderNo: 240200, live: {shiId: 240200},
  pod: {types: [main], subTypes: subs, defaultId: 5, shipReq: {sig: true, name: true}, fields: {remark: true, count: true}, lockMain: false}});
const render = (stop: any, onDone = jest.fn()) => {
  let r: any;
  ReactTestRenderer.act(() => { r = ReactTestRenderer.create(<SafeAreaProvider initialMetrics={M}><SignScreen stop={stop} savedNames={[]} saved={null} onCancel={() => {}} onDone={onDone} /></SafeAreaProvider>); });
  return r;
};
test('två undertyper: rubrik Undertyp + KRÄVS, saknas tills man valt', () => {
  const r = render(stopWith([sub(51, 'Avställt'), sub(52, 'Mottaget')]));
  const t = texts(r);
  expect(t).toContain('Undertyp');
  expect(t).toMatch(/Saknas: .*undertyp – tryck här/);
  const chip = r.root.findAll((n: any) => n.props && n.props.testID === 'undertyp-52' && typeof n.props.onPress === 'function')[0];
  ReactTestRenderer.act(() => { chip.props.onPress(); });
  expect(texts(r)).not.toMatch(/undertyp/);
});
test('en enda undertyp väljs direkt', () => {
  const r = render(stopWith([sub(51, 'Mottaget')]));
  expect(texts(r)).not.toMatch(/Saknas: .*undertyp/);
});

test('3.71: BDX – sista egna stoppet + Opter-ordern: Opters undertyp syns och kan väljas', () => {
  const opter = stopWith([sub(51, 'Avställt'), sub(52, 'Mottaget')]);
  const kid = {drop: 'E1', who: 'Moby Modulärt', adr: 'Vårbergsvägen 69', own: {kind: 'bdx-frakt'}, parent: '240200', req: {}};
  const r = render({...kid, group: [kid, opter]});
  expect(texts(r)).toContain('Undertyp');
  const chip = r.root.findAll((n: any) => n.props && n.props.testID === 'undertyp-51' && typeof n.props.onPress === 'function')[0];
  ReactTestRenderer.act(() => { chip.props.onPress(); });
  expect(texts(r)).not.toMatch(/Saknas: .*undertyp/);
});
test('3.71: valet ligger kvar när ordern uppdateras i bakgrunden', () => {
  const stop = stopWith([sub(51, 'Avställt'), sub(52, 'Mottaget')]);
  const M2 = {frame: {x: 0, y: 0, width: 390, height: 800}, insets: {top: 0, left: 0, right: 0, bottom: 0}};
  const el = (saved: any) => <SafeAreaProvider initialMetrics={M2}><SignScreen stop={stop} savedNames={[]} saved={saved} onCancel={() => {}} onDone={() => {}} /></SafeAreaProvider>;
  let r: any;
  ReactTestRenderer.act(() => { r = ReactTestRenderer.create(el({loadedAt: 1})); });
  const chip = r.root.findAll((n: any) => n.props && n.props.testID === 'undertyp-52' && typeof n.props.onPress === 'function')[0];
  ReactTestRenderer.act(() => { chip.props.onPress(); });
  ReactTestRenderer.act(() => { r.update(el({loadedAt: 1, sync: {load: 'ok'}})); }); // synken skriver på ordern
  expect(texts(r)).not.toMatch(/Saknas: .*undertyp/);
});

// Tidshjulet (som väckarklockan): scrolla eller tryck på mittensiffran och skriv.
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {TextInput} from 'react-native';
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('react-native-image-picker', () => ({launchCamera: jest.fn(), launchImageLibrary: jest.fn()}));
const {TimeWheel, DurationWheel, ITEM} = require('../src/ui/Wheel');
const wheels = (r: any) => r.root.findAll((n: any) => n.props && /^wheel-/.test(n.props.testID || '') && typeof n.type !== 'string').filter((n: any, i: number, a: any[]) => a.findIndex((x: any) => x.props.testID === n.props.testID) === i)
  .map((w: any) => w.findAll((n: any) => n.props && n.props.onMomentumScrollEnd)[0]);
test('scrolla timmar och minuter: 09:45 → 12:45 → 12:30, och hjulet går runt (59 → 00)', async () => {
  const on = jest.fn();
  let r: any;
  await ReactTestRenderer.act(async () => { r = ReactTestRenderer.create(<TimeWheel value={9 * 60 + 45} onChange={on} />); });
  const [hw, mw] = wheels(r);
  await ReactTestRenderer.act(async () => { hw.props.onMomentumScrollEnd({nativeEvent: {contentOffset: {y: (2 * 24 + 12) * ITEM}}}); });
  expect(on).toHaveBeenLastCalledWith(12 * 60 + 45);
  await ReactTestRenderer.act(async () => { mw.props.onMomentumScrollEnd({nativeEvent: {contentOffset: {y: (2 * 60 + 30) * ITEM}}}); });
  expect(on).toHaveBeenLastCalledWith(9 * 60 + 30);
  // Tre steg nedåt från 59 i nästa varv = 02
  await ReactTestRenderer.act(async () => { mw.props.onMomentumScrollEnd({nativeEvent: {contentOffset: {y: (3 * 60 + 2) * ITEM}}}); });
  expect(on).toHaveBeenLastCalledWith(9 * 60 + 2);
});
test('tryck på mittensiffran och skriv in timmen', async () => {
  const on = jest.fn();
  let r: any;
  await ReactTestRenderer.act(async () => { r = ReactTestRenderer.create(<TimeWheel value={9 * 60 + 45} onChange={on} />); });
  const hw = r.root.findAll((n: any) => n.props && n.props.testID === 'wheel-h')[0];
  const nines = hw.findAll((n: any) => n.props && n.props.onPress && n.findAll((c: any) => c.props && c.props.children === '09').length > 0 && !n.findAll((c: any) => c.props && c.props.children === '10').length);
  const center = nines.filter((n: any, i: number, a: any[]) => !a.some((x: any) => x !== n && x.findAll((c: any) => c === n).length))[2]; // mittenvarvet
  await ReactTestRenderer.act(async () => { center.props.onPress(); });
  const inp = r.root.findByType(TextInput);
  await ReactTestRenderer.act(async () => { inp.props.onChangeText('7'); });
  await ReactTestRenderer.act(async () => { inp.props.onSubmitEditing(); });
  expect(on).toHaveBeenLastCalledWith(7 * 60 + 45);
});
test('timmar och minuter som varaktighet', async () => {
  const on = jest.fn();
  let r: any;
  await ReactTestRenderer.act(async () => { r = ReactTestRenderer.create(<DurationWheel value={135} onChange={on} />); });
  const [hw] = wheels(r);
  await ReactTestRenderer.act(async () => { hw.props.onMomentumScrollEnd({nativeEvent: {contentOffset: {y: (2 * 24 + 3) * ITEM}}}); });
  expect(on).toHaveBeenLastCalledWith(3 * 60 + 15);
});

/* 3.68: signaturen – bara fingret som började strecket ritar, och linjen rundas av. */
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('react-native-image-picker', () => ({launchCamera: jest.fn(), launchImageLibrary: jest.fn()}));
import {touchOf, smooth} from '../src/ui/parts';
test('annat finger/handflata ger ingen punkt i strecket', () => {
  const ev = {pageX: 900, pageY: 900, touches: [{identifier: 1, pageX: 900, pageY: 900}, {identifier: 0, pageX: 120, pageY: 80}]};
  expect(touchOf(ev, 0)).toEqual({identifier: 0, pageX: 120, pageY: 80});
  expect(touchOf({touches: [{identifier: 1, pageX: 5, pageY: 5}]}, 0)).toBe(null); // fingret borta → ignoreras
  expect(touchOf({pageX: 3, pageY: 4}, null)).toEqual({pageX: 3, pageY: 4});     // utan touches (äldre händelse) → som förut
});
test('linjen rundas av men börjar och slutar där fingret var', () => {
  const st = [{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 10}];
  const s = smooth(st);
  expect(s[0]).toEqual({x: 0, y: 0});
  expect(s[s.length - 1]).toEqual({x: 10, y: 10});
  expect(s.some(q => q.x === 10 && q.y === 0)).toBe(false); // det vassa hörnet är borta
});

jest.mock('react-native', () => ({StyleSheet: {create: x => x}, Pressable: 'P', Text: 'T', TextInput: 'I', View: 'V', Appearance: {getColorScheme: () => 'dark'}, useColorScheme: () => 'dark'}));
jest.mock('../src/ui/Wheel', () => ({DurationWheel: 'DW', TimeSheet: 'TS'}));
const {parseClock, fmtMin} = require('../src/ui/TidInput');
test('klockslag och tid som Opter (minuter totalt)', () => {
  expect(parseClock('7:00')).toBe(420); expect(parseClock('730')).toBe(450); expect(parseClock('15.30')).toBe(930); expect(parseClock('7')).toBe(420);
  expect(parseClock('25:00')).toBeNull(); expect(parseClock('x')).toBeNull();
  expect(fmtMin(135)).toBe('2 h 15 min'); expect(fmtMin(60)).toBe('1 h'); expect(fmtMin(45)).toBe('45 min');
});

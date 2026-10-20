jest.mock('react-native', () => ({Linking: {openURL: jest.fn(() => Promise.resolve())}, StyleSheet: {create: x => x}, Platform: {OS: 'android'}}), {virtual: false});
test('GPS går till adressen i ordern, inte koordinaterna (Morabergsvägen 25, inte 7)', () => {
  const {Linking} = require('react-native');
  const src = require('fs').readFileSync(require.resolve('../src/ui/OrdersView.tsx'), 'utf8');
  const fn = src.slice(src.indexOf('export function navigate'), src.indexOf('\n}\n', src.indexOf('export function navigate')) + 2)
    .replace('export function navigate(st: any, app: NavApp | \'map\' = NAV)', 'function navigate(st, app = "google")');
  const navigate = new Function('Linking', fn + '; return navigate;')(Linking);
  navigate({adr: 'Morabergsvägen 25', zip: '15242', area: 'Södertälje', lat: 59.2, lng: 17.6});
  expect(Linking.openURL.mock.calls[0][0]).toBe('google.navigation:q=' + encodeURIComponent('Morabergsvägen 25, 15242, Södertälje'));
  navigate({adr: 'Distribution', lat: 59.3, lng: 18.2});
  expect(Linking.openURL.mock.calls[1][0]).toBe('google.navigation:q=59.3,18.2');
});

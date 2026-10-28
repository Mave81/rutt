jest.mock('react-native', () => ({Linking: {openURL: jest.fn(() => Promise.resolve())}, StyleSheet: {create: x => x}, Platform: {OS: 'android'}}), {virtual: false});
// GPS exakt som Opter Driver (XmlParser.getLayout): Opters koordinater på adressen om de finns, annars adressen som text.
// Adresstext som Opters Address.toStringForGoogleMaps(): "Gata Nr, Postnr Ort".
// RUTT:s egna uppslagna koordinater (geo: true) används aldrig för navigering.
const load = () => {
  const {Linking} = require('react-native');
  const src = require('fs').readFileSync(require.resolve('../src/ui/OrdersView.tsx'), 'utf8');
  const fn = src.slice(src.indexOf('export function navigate'), src.indexOf('\n}\n', src.indexOf('export function navigate')) + 2)
    .replace('export function navigate(st: any, app: NavApp | \'map\' = NAV)', 'function navigate(st, app = "google")');
  return {Linking, navigate: new Function('Linking', fn + '; return navigate;')(Linking)};
};
test('Döbelnsgatan 44 (order 234723): Opters koordinater används, som i Opter – inte adresstexten (blev 73)', () => {
  const {Linking, navigate} = load();
  navigate({who: 'EMB plattsättning', adr: 'Döbelnsgatan 44', zip: '11352', area: 'Stockholm', lat: 59.3439, lng: 18.0512});
  expect(Linking.openURL.mock.calls[0][0]).toBe('google.navigation:q=59.3439,18.0512');
});
test('Morabergsvägen 25: koordinater som RUTT slagit upp själv (kartans gissning) används inte – adressen gäller', () => {
  const {Linking, navigate} = load();
  Linking.openURL.mockClear();
  navigate({adr: 'Morabergsvägen 25', zip: '15242', area: 'Södertälje', lat: 59.2, lng: 17.6, geo: true});
  expect(Linking.openURL.mock.calls[0][0]).toBe('google.navigation:q=' + encodeURIComponent('Morabergsvägen 25, 15242 Södertälje'));
  navigate({adr: 'klockelundsvägen', zip: '12363', area: 'Farsta', lat: 59.24, lng: 18.1, geo: true, geoApprox: 'postnr'});
  expect(Linking.openURL.mock.calls[1][0]).toBe('google.navigation:q=' + encodeURIComponent('klockelundsvägen, 12363 Farsta'));
  navigate({adr: 'Distribution', lat: 59.3, lng: 18.2});
  expect(Linking.openURL.mock.calls[2][0]).toBe('google.navigation:q=59.3,18.2');
});

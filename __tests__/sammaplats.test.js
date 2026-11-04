/* 3.61: One Nordic AB (Källängsvägen 10) hamnade under Källängsvägen 5 – olika husnummer får aldrig bli ett stopp. */
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('react-native-image-picker', () => ({launchCamera: jest.fn(), launchImageLibrary: jest.fn()}));
const {samePlace} = require('../src/ui/OrdersView');
test('olika husnummer på samma gata = olika stopp, även nära varandra', () => {
  const t5 = {adr: 'Källängsvägen 5', zip: '14171', area: 'SEGELTORP', lat: 59.2869, lng: 17.9531};
  const o10 = {adr: 'Källängsvägen 10', zip: '14171', area: 'SEGELTORP', lat: 59.2871, lng: 17.9536};
  expect(samePlace(t5, o10)).toBe(false);
});
test('samma adress = samma stopp, även med olika stavning av mellanslag och bokstav', () => {
  expect(samePlace({adr: 'DIALOGGATAN 1 B', zip: '14175'}, {adr: 'Dialoggatan 1B', zip: '14175'})).toBe(true);
});
test('ungefärlig kartträff (mitt på gatan) slår aldrig ihop två olika adresser', () => {
  const a = {adr: 'Paradistorget 4', zip: '14147', lat: 59.2343, lng: 17.9809, geoApprox: 'gata'};
  const b = {adr: 'Paradistorget 2', zip: '14147', lat: 59.2343, lng: 17.9809};
  expect(samePlace(a, b)).toBe(false);
  const c = {adr: 'Sjödalsvägen 1', zip: '14147', lat: 59.2343, lng: 17.9809, geoApprox: 'gata'};
  expect(samePlace(a, c)).toBe(false);
});
test('exakta koordinater på samma plats men olika gatunamn (hörnhus) = samma stopp', () => {
  expect(samePlace({adr: 'Storgatan 1', lat: 59.3, lng: 18.0, opterLL: true}, {adr: 'Kyrkgatan 2', lat: 59.3001, lng: 18.0001, opterLL: true})).toBe(true);
});

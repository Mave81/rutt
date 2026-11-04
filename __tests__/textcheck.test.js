/* 3.65: texten i ordern – annan ort (två hämtställen) och annat husnummer. */
const T = require('../src/opter/textcheck');
const pick = {who: 'Nordsjö Västberga', adr: 'Västberga Allé 40', area: 'Hägersten'};
const drop = {who: 'Timblads', adr: 'Klädesvägen 4', area: 'Ekerö'};
test('"1 pall i Västberga sen en i Haninge" → frågar om Haninge, inte om Västberga', () => {
  const r = T.placesIn('1 pall i Västberga sen en i Haninge', pick, drop);
  expect(r.map(x => x.place)).toEqual(['Haninge']);
});
test('orderns egna orter och vanlig text ger ingen fråga', () => {
  expect(T.placesIn('1 pall 243 kg', pick, drop)).toEqual([]);
  expect(T.placesIn('Lossa godset ASAP hos HÅJ transport. Lasta hos Mycare övriga Sverige godset AVG efter 14:00', {area: 'Tumba'}, {area: 'Jordbro'})).toEqual([]);
  expect(T.placesIn('Leverans till Ekerö, ring Johan', pick, drop)).toEqual([]);
});
test('två ställen utan ort', () => {
  expect(T.twoPlaces('Hämtas på två ställen, ring innan')).toBe(true);
  expect(T.twoPlaces('2 pall')).toBe(false);
});
test('annat husnummer i texten än i Opter (One Nordic, Källängsvägen)', () => {
  expect(T.houseMismatch('Lämnas på Källängsvägen 10, port B', {adr: 'Källängsvägen 5'})).toEqual({street: 'Källängsvägen', textNo: '10', opterNo: '5'});
  expect(T.houseMismatch('Källängsvägen 5 baksidan', {adr: 'Källängsvägen 5'})).toBeNull();
  expect(T.houseMismatch('Dialoggatan 1B', {adr: 'DIALOGGATAN 1 B'})).toBeNull();
  expect(T.houseMismatch('ring 070-123 45 67', {adr: 'Källängsvägen 5'})).toBeNull();
});

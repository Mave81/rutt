import computeRoute from '../src/opter/optimizer';
const cargo = {A: {pal: 1}, B: {pal: 1}};
const stops = [
  {pickup: 'A', lat: 59.29, lng: 18.01, who: 'PA'}, {drop: 'A', lat: 59.33, lng: 18.06, who: 'DA'},
  {pickup: 'B', lat: 59.29, lng: 18.00, who: 'PB'}, {drop: 'B', lat: 59.26, lng: 18.17, who: 'DB'},
];
const key = s => (s.pickup ? 'p' + s.pickup : 'd' + s.drop);
test('egen ordning följs', () => {
  const r = computeRoute(stops, cargo, {lat: 59.24, lng: 18.22}, Date.now(), ['pB', 'dB', 'pA', 'dA']);
  expect(r.order.map(key)).toEqual(['pB', 'dB', 'pA', 'dA']);
  expect(r.manual).toBe(true);
});
test('lossning före hämtning flyttas efter', () => {
  const r = computeRoute(stops, cargo, {lat: 59.24, lng: 18.22}, Date.now(), ['dA', 'pA', 'pB', 'dB']);
  expect(r.order.map(key)).toEqual(['pA', 'dA', 'pB', 'dB']);
});
test('saknade stopp läggs in efter sin hämtning', () => {
  const r = computeRoute(stops, cargo, {lat: 59.24, lng: 18.22}, Date.now(), ['pB', 'pA']);
  const k = r.order.map(key);
  expect(k.length).toBe(4);
  expect(k.indexOf('dA')).toBeGreaterThan(k.indexOf('pA'));
  expect(k.indexOf('dB')).toBeGreaterThan(k.indexOf('pB'));
  expect(k.indexOf('pB')).toBeLessThan(k.indexOf('pA'));
});

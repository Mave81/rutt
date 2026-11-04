/* 3.65: extra hämtställe ur ordertexten ("1 pall i Västberga sen en i Haninge"): lämningen väntar på båda hämtningarna. */
import computeRoute from '../src/opter/optimizer';
const cargo = {A: {pal: 2}, EX1: {pal: 0}};
// Start i Haninge-hållet, lämning i Västberga-närhet: utan regeln vore det frestande att lämna innan Haninge.
const stops = [
  {pickup: 'A', who: 'Flugger Västberga', adr: 'Drivhjulsvägen 32', area: 'Hägersten', lat: 59.2955, lng: 18.0168},
  {drop: 'A', who: 'Kund Liljeholmen', adr: 'Liljeholmsvägen 1', area: 'Stockholm', lat: 59.310, lng: 18.023, after: ['EX1']},
  {pickup: 'EX1', own: {}, who: 'Beijer Haninge', adr: 'Ribbingsvägen 1', area: 'Haninge', lat: 59.168, lng: 18.140},
];
test('Opter-lämningen kommer efter det extra hämtstället', () => {
  const r = computeRoute(stops, cargo, {lat: 59.2955, lng: 18.0168}, new Date(2026, 10, 4, 6, 0).getTime());
  const k = r.order.map(s => (s.pickup ? 'p' : 'd') + (s.pickup || s.drop));
  expect(k.indexOf('pEX1')).toBeLessThan(k.indexOf('dA'));
  expect(k.indexOf('pA')).toBeLessThan(k.indexOf('dA'));
});
test('egen ordning flyttar lämningen efter extra hämtningen', () => {
  const r = computeRoute(stops, cargo, {lat: 59.2955, lng: 18.0168}, new Date(2026, 10, 4, 6, 0).getTime(), ['pA', 'dA', 'pEX1']);
  const k = r.order.map(s => (s.pickup ? 'p' : 'd') + (s.pickup || s.drop));
  expect(k.indexOf('pEX1')).toBeLessThan(k.indexOf('dA'));
});

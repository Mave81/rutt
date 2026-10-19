import computeRoute, {simulateLoad} from '../src/opter/optimizer';
// Kentas måndag: två hämtningar i Västberga samma tid, lossas i Vällingby och Sundbyberg.
const cargo = {N: {pal: 2}, F: {pal: 4}};
const stops = [
  {pickup: 'N', lat: 59.2965, lng: 18.0045, who: 'Nordsjö Västberga'}, {drop: 'N', lat: 59.3637, lng: 17.8723, who: 'Vällingbyskolan'},
  {pickup: 'F', lat: 59.2989, lng: 17.9962, who: 'Flugger Västberga'}, {drop: 'F', lat: 59.3612, lng: 17.9717, who: 'STIL MÅLERI'},
];
const key = s => (s.pickup ? 'p' + s.pickup : 'd' + s.drop);
test('det som lossas sist hämtas först – ingen omlastning', () => {
  const r = computeRoute(stops, cargo, {lat: 59.2437, lng: 18.2280}, new Date(2026, 9, 19, 6, 0).getTime());
  const k = r.order.map(key);
  const firstDrop = k.find(x => x[0] === 'd').slice(1);
  expect(k.indexOf('p' + firstDrop)).toBeGreaterThan(k.indexOf('p' + (firstDrop === 'N' ? 'F' : 'N'))); // den som lossas först hämtas sist
  expect(simulateLoad(r.order, new Set(), cargo).blockPal).toBe(0);
});
test('simuleringen ser när godset står i vägen', () => {
  const bad = [stops[0], stops[2], stops[1], stops[3]]; // N in först (mot hytten), F bakom, men N ska av först
  const sim = simulateLoad(bad, new Set(), cargo);
  expect(sim.blockPal).toBe(3); // en F-pall står bredvid N i rad 1, tre står bakom
  expect(sim.blocks[0]).toMatchObject({cid: 'N', by: ['F']});
  expect(sim.at.N).toEqual([0, 1]);
});

test('tiden som visas är när du kan börja (efter väntan på öppning), inte när du rullar in', () => {
  const {computeRoute} = require('../src/opter/optimizer');
  const d = '2026-10-20';
  const stops = [{pickup: 'A', lat: 59.33, lng: 18.06, open: '06:30', openDate: d, who: 'Alcro'}, {drop: 'A', lat: 59.34, lng: 18.05, who: 'Fräsen'}];
  const r = computeRoute(stops, {A: {pal: 2}}, {lat: 59.33, lng: 18.06}, new Date(d + 'T06:00').getTime(), null);
  const first = r.plan.rows[0];
  expect(first.eta.getHours() * 60 + first.eta.getMinutes()).toBe(6 * 60 + 30);
  expect(first.arrive.getHours() * 60 + first.arrive.getMinutes()).toBeLessThan(6 * 60 + 30);
});

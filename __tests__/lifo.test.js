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
test('simuleringen ser när godset står i vägen – och ställer godset i en fri fil när det går', () => {
  const bad = [stops[0], stops[2], stops[1], stops[3]]; // N in först (mot hytten), sen F, men N ska av först
  const sim = simulateLoad(bad, new Set(), cargo);
  expect(sim.blockPal).toBe(0); // F:s 4 pall i tredje filen, N:s fil fri
  expect(sim.at.N).toEqual([0, 1]);
  expect(sim.at.F).toEqual([2, 5, 8, 11]);
  const big = {N: {pal: 2}, F: {pal: 8}}; // 8 pall: tredje filen räcker inte (6), 2 hamnar framför N
  const sim2 = simulateLoad(bad, new Set(), big);
  expect(sim2.blockPal).toBe(2);
  expect(sim2.blocks[0]).toMatchObject({cid: 'N', by: ['F']});
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

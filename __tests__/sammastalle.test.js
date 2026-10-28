/* 3.58: två order till samma ställe (Timblads, Klädesvägen 4, Ekerö) = ett stopp: läggs efter varandra, ingen ny framkörning. */
import computeRoute, {servOf, sameSpot} from '../src/opter/optimizer';
const cargo = {A: {pal: 1}, B: {pal: 1}, H: {pal: 1}};
const tim = {adr: 'Klädesvägen 4', zip: '17837', area: 'Ekerö', who: 'Timblads', lat: 59.2732, lng: 17.7840};
const stops = [
  {pickup: 'A', who: 'Flugger Västberga', adr: 'Drivhjulsvägen 32', area: 'Hägersten', lat: 59.2955, lng: 18.0168},
  {pickup: 'B', who: 'Nordsjö Västberga', adr: 'Västberga Allé 40', area: 'Hägersten', lat: 59.2965, lng: 18.0045},
  {pickup: 'H', who: 'Alcro Studio Bromma', adr: 'Karlsbodavägen 13C', area: 'Bromma', lat: 59.3543, lng: 17.9592},
  {drop: 'A', ...tim}, {drop: 'B', ...tim},
  {drop: 'H', who: 'Hagman & Hübinette', adr: 'Ulvsundavägen 181', area: 'Bromma', lat: 59.3371, lng: 17.9662},
];
test('samma adress känns igen, även utan koordinater', () => {
  expect(sameSpot({adr: 'Klädesvägen 4', area: 'Ekerö'}, {adr: 'klädesvägen 4 ', area: 'EKERÖ'})).toBe(true);
  expect(sameSpot({adr: 'Klädesvägen 4', area: 'Ekerö'}, {adr: 'Klädesvägen 6', area: 'Ekerö'})).toBe(false);
});
test('lämningarna hos Timblads hamnar efter varandra och andra kostar bara godset', () => {
  const r = computeRoute(stops, cargo, {lat: 59.2437, lng: 18.2280}, new Date(2026, 9, 29, 6, 0).getTime());
  const k = r.order.map(s => (s.pickup ? 'p' : 'd') + (s.pickup || s.drop));
  const ia = k.indexOf('dA'), ib = k.indexOf('dB');
  expect(Math.abs(ia - ib)).toBe(1);
  const second = Math.max(ia, ib);
  expect(r.plan.rows[second].same).toBe(true);
  expect(r.plan.rows[second].serv).toBe(servOf(r.order[second], r.order[second - 1]));
  expect(r.plan.rows[second].serv).toBeLessThan(servOf(r.order[second]));
  const gap = (new Date(r.plan.rows[second].eta).getTime() - new Date(r.plan.rows[second - 1].eta).getTime()) / 60000;
  expect(gap).toBe(r.plan.rows[second - 1].serv); // ingen körtid emellan, bara godset på första
});

test('3.60: utan kartan (inga koordinater) grupperas ändå Västberga, Bromma och Ekerö', () => {
  const bare = stops.map(({lat, lng, ...x}) => x);
  const z = {A: '12600', B: '12630', H: '16867'};
  bare.forEach(x => { if (x.pickup) x.zip = z[x.pickup]; else if (x.drop === 'H') x.zip = '16733'; else x.zip = '17837'; });
  const r = computeRoute(bare, cargo, {lat: 59.2437, lng: 18.2280}, new Date(2026, 9, 29, 6, 0).getTime());
  const area = r.order.map(s => s.area);
  // Inga hopp fram och tillbaka: varje ort kommer i ett enda block
  const blocks = area.filter((a, i) => i === 0 || a !== area[i - 1]);
  expect(new Set(blocks).size).toBe(blocks.length);
});

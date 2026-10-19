/** Riktiga körtider (OSRM-tabell) och att RUTT lär sig av dina tider. */
const T = require('../src/opter/travel');
const {computeRoute} = require('../src/opter/optimizer');

beforeEach(() => T._reset());

test('hämtar tabellen en gång, sparar par åt båda hållen, används i rutten', async () => {
  const A = {lat: 59.3, lng: 18.0}, B = {lat: 59.4, lng: 18.1};
  let url = '';
  const fake = async (u) => { url = u; return {json: async () => ({code: 'Ok', durations: [[0, 1200], [1500, 0]], distances: [[0, 15000], [16000, 0]]})}; };
  expect(await T.ensure([A, B], fake)).toBe(true);
  expect(url).toContain('/table/v1/driving/18.00000,59.30000;18.10000,59.40000?annotations=duration,distance');
  expect(T.travel(A, B)).toEqual({min: 20, km: 15});
  expect(T.travel(B, A)).toEqual({min: 25, km: 16});
  expect(await T.ensure([A, B], async () => { throw new Error('ska inte anropas'); })).toBe(false); // redan sparat
  const r = computeRoute([{pickup: 'X', ...A}, {drop: 'X', ...B}], {X: {pal: 1}}, {lat: 59.3, lng: 18.0}, new Date('2026-10-20T07:00').getTime(), null);
  const leg = r.plan.rows[1].leg;
  expect(leg.est).toBe(false); expect(leg.min).toBe(20); expect(leg.km).toBe(15);
});

test('utan nät: ingen krasch, rutten använder uppskattningen', async () => {
  expect(await T.ensure([{lat: 59.3, lng: 18.0}, {lat: 59.31, lng: 18.2}], async () => { throw new Error('offline'); })).toBe(false);
  const r = computeRoute([{pickup: 'X', lat: 59.3, lng: 18.0}, {drop: 'X', lat: 59.31, lng: 18.2}], {X: {pal: 1}}, {lat: 59.3, lng: 18.0}, Date.now(), null);
  expect(r.plan.rows[1].leg.est).toBe(true);
});

test('lär sig: kör du snabbare än gissningen blir faktorn under 1 (minst 5 resor, median, gränser)', () => {
  const pred = () => 30;
  const legs = n => Array.from({length: n}, () => ({from: {}, to: {}, actualMin: 34, servMin: 10})); // 24 min körning mot gissade 30
  expect(T.learn(legs(4), pred)).toEqual({factor: 1, samples: 4});      // för få
  expect(T.learn(legs(6), pred).factor).toBeCloseTo(0.8);
  expect(T.learn([...legs(6), {from: {}, to: {}, actualMin: 300, servMin: 10}], pred).samples).toBe(6); // rast/glömt räknas inte
  const r = computeRoute([{pickup: 'X', lat: 59.3, lng: 18.0}, {drop: 'X', lat: 59.4, lng: 18.1}], {X: {pal: 1}}, {lat: 59.3, lng: 18.0}, Date.now(), null);
  T.learn([], pred); // faktor 1 igen
  const r1 = computeRoute([{pickup: 'X', lat: 59.3, lng: 18.0}, {drop: 'X', lat: 59.4, lng: 18.1}], {X: {pal: 1}}, {lat: 59.3, lng: 18.0}, Date.now(), null);
  expect(r.plan.rows[1].leg.min / r1.plan.rows[1].leg.min).toBeCloseTo(0.8);
});

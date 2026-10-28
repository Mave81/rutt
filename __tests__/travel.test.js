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

test('adress utan koordinater slås upp och används i rutten; okänd adress sparas som miss', async () => {
  const calls = [];
  const fake = async (u) => { calls.push(u); return {json: async () => (u.includes('L%C3%A4nna') || u.includes('Lännavägen') ? [{lat: '59.2299', lon: '18.1312'}] : [])}; };
  const stops = [{pickup: 'A', adr: 'Lännavägen 1', zip: '142 50', area: 'Länna'}, {drop: 'A', adr: 'Okändgatan 9', zip: '', area: 'Ingenstans'}];
  const n = await T.geocode(stops, fake);
  expect(n).toBe(1);
  expect(calls[0]).toContain('nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=se&street=L%C3%A4nnav%C3%A4gen%201&postalcode=14250&city=L%C3%A4nna');
  const g = T.withGeo(stops);
  expect(g[0]).toMatchObject({lat: 59.2299, lng: 18.1312, geo: true});
  expect(g[1].lat).toBeUndefined();
  expect(await T.geocode(stops, async () => { throw new Error('ska inte anropas igen'); })).toBe(0); // båda sparade
}, 15000);

test('gatan finns inte på kartan (Lyckås måleri, "klockelundsvägen", 12363 Farsta) → postnumret ger ungefärlig plats', async () => {
  const calls = [];
  const fake = async (u) => { calls.push(u); return {json: async () => (/[?&]postalcode=12363$/.test(u) ? [{lat: '59.2425', lon: '18.0989'}] : [])}; };
  const stops = [{drop: 'L', who: 'Lyckås måleri', adr: 'klockelundsvägen', zip: '12363', area: 'Farsta'}];
  expect(await T.geocode(stops, fake)).toBe(1);
  expect(calls.length).toBe(4); // gata+postnr+ort, fritext, gata+ort, postnr
  expect(T.withGeo(stops)[0]).toMatchObject({lat: 59.2425, lng: 18.0989, geo: true, geoApprox: 'postnr'});
}, 15000);

test('husnumret saknas på kartan (Höganäshuset, Harpsundsvägen 211) → gatan utan nummer, inte bara postnumret', async () => {
  const calls = [];
  const fake = async (u) => { calls.push(u); return {json: async () => (/street=Harpsundsv%C3%A4gen&city=/.test(u) ? [{lat: '59.2697', lon: '18.0498'}] : [])}; };
  const stops = [{pickup: 'H', who: 'Höganäshuset AB', adr: 'Harpsundsvägen 211', zip: '12459', area: 'BANDHAGEN'}];
  expect(await T.geocode(stops, fake)).toBe(1);
  expect(calls.length).toBe(4);
  expect(T.withGeo(stops)[0]).toMatchObject({lat: 59.2697, geoApprox: 'gata'});
}, 15000);

test('Paradistorget 4: kartan svarar med gatan (inte huset) → räknas som ungefärlig, aldrig som exakt', async () => {
  const fake = async () => ({json: async () => [{lat: '59.2343342', lon: '17.9808972', category: 'highway', type: 'residential', addresstype: 'residential', name: 'Paradistorget'}]});
  const stops = [{drop: 'P', who: 'Sjödalsgymnasiet', adr: 'Paradistorget 4', zip: '14147', area: 'Huddinge'}];
  expect(await T.geocode(stops, fake)).toBe(1);
  expect(T.withGeo(stops)[0]).toMatchObject({lat: 59.2343342, geo: true, geoApprox: 'gata'});
}, 15000);

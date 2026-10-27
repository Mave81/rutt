// BDX Företagen fraktsedlar (foton 27 okt): Moby Skärholmen (sida 1 av 5) och NCC Bogsätravägen (fotad på tvären).
const {parseSedel} = require('../src/sedel');
const {mergeTur, matchOpter} = require('../src/tur');
const F = n => parseSedel(require('./fixtures/' + n + '.json'), '');
test('Moby: allt på mottagarens exemplar läses (som ML Kit lämnar raderna)', () => {
  const r = F('bdx-moby-mlkit');
  expect(r.kind).toBe('bdx-frakt');
  expect(r.sendNo).toBe('0265598748');
  expect(r.date).toBe('2026-10-27');
  expect([r.page, r.pages]).toEqual([1, 5]);
  expect(r.drop).toMatchObject({name: 'Moby Modulärt byggande AB', adr: 'Vårbergsvägen 69', zip: '127 43', area: 'Skärholmen', contact: 'David Erixell', ref: 'AO20127', sure: true});
  expect(r.sender).toEqual({name: 'AHLSELL AB', adr: 'Terminalgatan', zip: '694 35', area: 'Hallsberg', ref: '6407618'});
  expect(r.kolli.length).toBe(10);
  expect(r.total).toBe(10);
  expect(r.kg).toBe(155);
  expect(r.counts).toEqual({Kartong: 7, 'Ospecificerat kolli': 1, 'Engångspall': 1, Europapall: 1});
  expect(r.kolli.map(k => k.kg)).toEqual([2, 5, 18, 40, 9, 4, 4, 6, 6, 61]);
  expect(r.kolli[0]).toEqual({no: '373217102323281197', code: 'CT', type: 'Kartong', kg: 2});
  expect(r.orders).toEqual(['56774799']);
});
test('Moby, riktigt foto lästa med sämre läsare: siffrorna kommer med, adressen markeras osäker', () => {
  const r = F('bdx-moby');
  expect(r.kind).toBe('bdx-frakt');
  expect(r.sendNo).toBe('0265598748');
  expect(r.drop).toMatchObject({zip: '127 43', area: 'Skärholmen', contact: 'David Erixell', sure: false});
  expect(r.kolli.length).toBe(10); expect(r.total).toBe(10); expect(r.kg).toBe(155);
  expect(r.orders).toEqual(['56774799']);
  expect(r.drop.note).not.toMatch(/AVSÄNDARE|Terminalgatan/); // kvittensdelen läses inte
});
test('NCC (fotad på tvären, vriden): mottagare, telefon, kontakt, 3 kolli', () => {
  const r = F('bdx-ncc');
  expect(r.kind).toBe('bdx-frakt');
  expect(r.sendNo).toBe('0265589143');
  expect(r.drop).toMatchObject({name: 'NCC Bogsätravägen 12 / NCC', adr: 'Bogsätravägen 12', zip: '127 37', tel: '0722052120', contact: 'Kristoffer Jendré'});
  expect(r.sender).toMatchObject({name: 'AHLSELL AB', zip: '694 35', area: 'Hallsberg', ref: '6210213'});
  expect(r.total).toBe(3); expect(r.kolli.length).toBe(3); expect(r.kg).toBe(154);
  expect(r.counts).toEqual({Kartong: 1, Europapall: 1, 'Ospecificerat kolli': 1});
  expect(r.orders).toEqual(['56750160']);
});
test('två fraktsedlar → två stopp per sändningsnr, samma sedel två gånger blir ett', () => {
  const st = mergeTur([F('bdx-moby-mlkit'), F('bdx-ncc'), F('bdx-moby')]);
  expect(st.map(s => s.sendNo)).toEqual(['0265598748', '0265589143']);
  expect(st[0]).toMatchObject({name: 'Moby Modulärt byggande AB', adr: 'Vårbergsvägen 69', kg: 155, total: 10, ref: 'AO20127', pageOf: 5});
  expect(st[0].kolli.length).toBe(10);
});
test('finns redan som Opter-order: samma sändningsnr eller samma gata+nummer', () => {
  const [moby] = mergeTur([F('bdx-moby-mlkit')]);
  expect(matchOpter(moby, [{drop: '9', orderNo: '9', freightBill: '026 559 874 8', adr: 'X 1'}])).toMatchObject({cid: '9', how: 'samma nummer'});
  expect(matchOpter(moby, [{drop: '7', orderNo: '234500', adr: 'Vårbergsvägen 69', zip: '12743', area: 'Skärholmen'}])).toMatchObject({cid: '7', how: 'samma adress'});
  expect(matchOpter(moby, [{drop: '8', orderNo: '1', adr: 'Vårbergsvägen 6', zip: '12743'}])).toBe(null);
  expect(matchOpter(moby, [{drop: '8', orderNo: '1', adr: 'Vårbergsvägen 69', zip: '11122'}])).toBe(null);
});
test('sidan ligger på tvären → RUTT vrider tills texten blir rader', async () => {
  const {ocrScore, readPage} = require('../src/ocr');
  const good = require('./fixtures/bdx-ncc.json');
  const side = {w: 2212, h: 1659, lines: [{t: 'a', x: 1, y: 1, w: 10, h: 300}, {t: 'S P', x: 1, y: 1, w: 12, h: 80}]};
  expect(ocrScore(good)).toBeGreaterThan(25);
  expect(ocrScore(side)).toBeLessThan(5);
  const RN = require('react-native');
  RN.NativeModules.RuttSms = {ocr: jest.fn(async () => side), ocrRot: jest.fn(async (u, d) => (d === 90 ? {...good, uri: 'file:///rot90.jpg'} : side))};
  const o = await readPage('file:///ncc.jpg');
  expect(o.uri).toBe('file:///rot90.jpg');
  expect(parseSedel(o, '').sendNo).toBe('0265589143');
});

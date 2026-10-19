// Kentas riktiga sedlar (skärmbilder 19 okt), lästa med textigenkänning → fixtures/*.json.
const {parseSedel} = require('../src/sedel');
const fx = f => require('./fixtures/' + f + '.json');

test('Inomec hämtsedel: hämta hos Zengun (osäker adress), lämna på Inomec Västberga', () => {
  const r = parseSedel(fx('inomec-hamt'), 'Account Collection Note 01-023933.pdf');
  expect(r.kind).toBe('inomec-hamt');
  expect(r.ref).toBe('01-023933');
  expect(r.orderNo).toBe('648785-4090');
  expect(r.pick).toMatchObject({name: 'Zengun AB', adr: 'Gallerian', zip: '113 21', tel: '0703246523', contact: 'Jeppe Nilsson', note: 'Ring Jeppe', sure: false});
  expect(r.drop).toMatchObject({name: 'Inomec Stockholm Västberga', adr: 'Västberga Allé 60', zip: '126 30', area: 'Hägersten', sure: true});
  expect(r.goods).toEqual(['2 × Fallskyddsblock 10 m vajer, Sharp Edge']);
  expect(r.fleet).toEqual(['7718100', '7718700']);
});
test('Inomec följesedel: Inomec → Hercules, Rosersberg, med gods', () => {
  const r = parseSedel(fx('inomec-folj'), 'tmpADD8.tmp.pdf');
  expect(r.kind).toBe('inomec-folj');
  expect(r.ref).toBe('01-023957');
  expect(r.date).toBe('2026-10-15');
  expect(r.notMine).toBe('');
  expect(r.pick.adr).toBe('Västberga Allé 60');
  expect(r.drop).toMatchObject({adr: 'Strém 111 - 114', zip: '195 95', area: 'Rosersberg', tel: '0702075990', sure: true});
  expect(r.drop.name).toMatch(/^Hercules Grundl/);
  expect(r.goods.length).toBeGreaterThanOrEqual(4);
  expect(r.goods.some(g => /Adapter hane/.test(g))).toBe(true);
  expect(r.goods.some(g => /Frakt/i.test(g))).toBe(false);
});
test('Inomec följesedel med Schenker: inte din', () => {
  const r = parseSedel(fx('inomec-folj-schenker'), 'tmp23C1.tmp.pdf');
  expect(r.notMine).toBe('Schenker');
  expect(r.drop).toMatchObject({name: 'Andritz Hydro AB', zip: '821 94', tel: '073 835 48 08'});
});
test('Cramo-uppdrag (skärmbild): Västberga Cramo → Veidekke Solna, portkod, tidspasning 06;50', () => {
  const r = parseSedel(fx('cramo-veidekke'), '');
  expect(r.kind).toBe('opter');
  expect(r.pick).toMatchObject({name: 'Vastberga Cramo 54248', adr: 'Vretensborgsvagen 13', zip: '126 30', tel: '08-619 81 60'});
  expect(r.drop).toMatchObject({name: 'VEIDEKKE ENTREPRENAD AB', adr: 'Strakvagen 7', zip: '169 35', area: 'Solna', tel: '0702760370', code: 'ANNA'});
  expect(r.tidspass).toEqual({time: '06:50'});
  expect(r.note).toMatch(/foto pa retursedel/);
  expect(r.ref).toBe('12505959');
});
test('Cramo-uppdrag: Vårby → Willys Nynäshamn, märk ordern', () => {
  const r = parseSedel(fx('cramo-willys'), '');
  expect(r.pick).toMatchObject({adr: 'Hamnvagen 3', zip: '143 30', tel: '08-560 247 80'});
  expect(r.drop).toMatchObject({name: 'Willys AB', adr: 'Nynasvagen 44', zip: '149 40', area: 'Nynashamn', tel: '0736435158'});
  expect(r.orderNo).toBe('4501473726 - 54523');
  expect(r.date).toBe('2026-10-01');
});
test('okänd text: adresserna som hittas blir förslag', () => {
  const r = parseSedel({w: 1000, lines: [{t: 'Byggfirman AB', x: 10, y: 10, w: 300, h: 20}, {t: 'Sockenvägen 289, 120 40 Årsta', x: 10, y: 40, w: 400, h: 20}]}, 'bild.jpg');
  expect(r.kind).toBe('okand');
  expect(r.pick).toMatchObject({name: 'Byggfirman AB', adr: 'Sockenvägen 289', zip: '120 40', area: 'Årsta'});
});

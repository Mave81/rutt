const {parseSedel} = require('../src/sedel');
const {mergeTur, turToEgen, countsText} = require('../src/tur');
const {toStops} = require('../src/egna');
const F = n => parseSedel(require('./fixtures/' + n + '.json'), '');
test('Bevego turleveranslista läses (riktiga sidor 26 okt, tur 050_01_A4)', () => {
  const t = F('bevego-taby-platteknik');
  expect(t.kind).toBe('bevego-tur');
  expect(t.ref).toBe('64499');
  expect(t.date).toBe('2026-10-26');
  expect(t.drop).toMatchObject({name: 'Taby Platteknik AB', adr: 'Angsvagen 13', zip: '187 75', area: 'Taby', contact: 'Richard', tel: '0720925965', tel2: '0851014020', sure: true});
  expect(t.drop.note).toMatch(/K.res 26\/10/i);
  expect(t.counts).toEqual({KLOVE: 6});
  expect(t.orders).toEqual(['30212995']);
  const o = F('bevego-opejra-pall');
  expect(o.drop).toMatchObject({name: 'Opejra Taby AB', adr: 'Fogdevagen 7', zip: '183 64', contact: 'Fredrik', tel: '0704290745'});
  expect(o.counts).toEqual({PALL: 2});
  const k = F('bevego-opejra-kartong');
  expect(k.drop.note).toBe('Avisering 0760969910');
  expect(k.counts).toEqual({KARTONG: 1});
  const h = F('bevego-hnorr');
  expect(h.drop).toMatchObject({name: 'H Norr Plat AB', zip: '184 40', area: 'Akersberga', tel: '0704854573'});
  expect(h.counts).toEqual({KLOVE: 1, 'STÄLL': 1, KARTONG: 1});
});
test('sidor till samma kund blir ett stopp (Opejra: 2 pall + 1 kartong)', () => {
  const st = mergeTur(['bevego-taby-platteknik', 'bevego-opejra-pall', 'bevego-opejra-kartong', 'bevego-hnorr'].map(F));
  expect(st.map(s => s.name)).toEqual(['Taby Platteknik AB', 'Opejra Taby AB', 'H Norr Plat AB']);
  const op = st[1];
  expect(op.pages).toBe(2);
  expect(countsText(op.counts)).toBe('2 pall + 1 kartong');
  expect(op.orders).toEqual(['30219989', '30198658']);
  expect(op.note).toBe('Avisering 0760969910');
  expect(op.pal).toBe(2);
});
test('stopp → eget jobb kopplat till Opter-ordern (hämtas på Bevego, Opter-ordern 234014)', () => {
  const st = mergeTur([F('bevego-opejra-pall'), F('bevego-opejra-kartong')]);
  const pick = {name: 'Bevego Älvsjö', adr: 'Konsumentvägen 17', zip: '12530', area: 'Älvsjö', tel: '', contact: '', lat: 59.27, lng: 18.0};
  const e = turToEgen(st[0], pick, '234014', '2026-10-26');
  expect(e.parent).toBe('234014');
  const [p, d] = toStops(e);
  expect(p.parent).toBe('234014'); expect(d.parent).toBe('234014');
  expect(p.who).toBe('Bevego Älvsjö'); expect(p.lat).toBe(59.27);
  expect(d.who).toBe('Opejra Taby AB'); expect(d.adr).toBe('Fogdevagen 7');
  expect(d.orderNo).toBe('30219989, 30198658');
  expect(d.tel.map(t => t.num)).toEqual(['0704290745']);
});
test('turlistan kopplas till Opter-ordern som saknar adress, timjobb känns igen', () => {
  const {turParents, isTimjobb} = require('../src/tur');
  const stops = [
    {pickup: '234014', who: 'Bevego Älvsjö', adr: 'Konsumentvägen 17', orderNo: '234014', info: 'skriv timmar', service: 'Bud Zon-Zon (Bevego)'},
    {drop: '234014', who: 'Distribution', adr: '', info: 'skriv timmar'},
    {pickup: '232309', who: 'Proplatt', adr: 'Kvarnvägen 1', orderNo: '232309'},
    {drop: '232309', who: 'Höganäshuset', adr: 'Bryggvägen 3'},
  ];
  const p = turParents(stops);
  expect(p.map(x => x.cid)).toEqual(['234014']);
  expect(isTimjobb(stops[0])).toBe(true);
  expect(isTimjobb({info: 'Skriv tid på fraktsedeln'})).toBe(true);
  expect(isTimjobb(stops[3])).toBe(false);
  expect(isTimjobb({info: 'Ring 30 min innan'})).toBe(false);
});
test('ändring syns i Opter: Tid (CET 34) jämförs mot orderns timeMinutes efter synk', () => {
  const P = require('../src/opter/protocol');
  const ch = [{cet: 34, kind: 'dec', value: '95'}];
  expect(P.CET.SHI_TimeMinutes).toBe(34);
  expect(P.changesSeen({timeMinutes: 95}, ch)).toEqual({total: 1, seen: 1, missing: []});
  expect(P.changesSeen({timeMinutes: '95,0'}, ch).seen).toBe(1);
  expect(P.changesSeen({timeMinutes: 0}, ch)).toEqual({total: 1, seen: 0, missing: ['Tid (min)']});
  expect(P.changesSeen(null, ch).seen).toBe(0);
});

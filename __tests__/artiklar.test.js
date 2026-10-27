// Artiklar som i Opter Driver (menyn Artiklar): ShipmentArticle = vad som får läggas till, ShipmentPriceItem = det som ligger på ordern.
const P = require('../src/opter/protocol');
const {Buffer} = require('buffer');
const live = {key: {identityId: 0, offId: 1, xxxId: 5501}, hdr: {extra: 0, conf: 1}, shiId: 5501};
test('ny artikel: SAR_Id + Enhet 1 (timmar) – SCV_SPI_Id utelämnas (0), som Opter', () => {
  const ch = P.articleChanges({sarId: 77, q1: '3,5', descr: 'Väntade på lastning'});
  expect(ch).toEqual([{cet: 68, kind: 'int', value: '77', spiId: 0}, {cet: 45, kind: 'dec', value: '3.5', spiId: 0}, {cet: 59, kind: 'str', value: 'Väntade på lastning', spiId: 0}]);
  const d = P.decodeSync(P.encodeShipmentEdit({live, changes: ch}));
  expect(d.decodedBytes).toBe(d.totalBytes);
  const v = d.rows.filter(r => r.table === 'ShipmentChangeValue').map(r => { const {p250, ...c} = r.columns; return c; });
  expect(v).toEqual([{cet: 68, value: 77}, {cet: 45, value: 3.5}, {cet: 59, value: 'Väntade på lastning'}]);
});
test('ändra antal på befintlig artikelrad: SCV_SPI_Id = raden', () => {
  const ch = P.articleChanges({spiId: 9001, q1: 2});
  const d = P.decodeSync(P.encodeShipmentEdit({live, changes: ch}));
  expect(d.rows.filter(r => r.table === 'ShipmentChangeValue').map(r => { const {p250, ...c} = r.columns; return c; })).toEqual([{cet: 45, spiId: 9001, value: 2}]);
  expect(P.articleChanges({spiId: 9001, remove: true, name: 'Bomkörning'})).toEqual([{cet: 97, kind: 'str', value: 'Bomkörning', spiId: 9001}]);
});
test('ordern visar artiklar som går att välja och de som redan ligger på den', () => {
  const i32 = n => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; };
  const st = (tbl, xxx) => Buffer.concat([Buffer.from([1, P.Table.indexOf(tbl), 14]), i32(0), i32(7), i32(xxx), Buffer.from([0, 1])]);
  const en = tbl => Buffer.from([2, P.Table.indexOf(tbl)]);
  const S = (p, s) => { const x = Buffer.from(s); const h = Buffer.alloc(4); h[0] = 4; h[1] = p; h.writeInt16LE(x.length, 2); return Buffer.concat([h, x]); };
  const I = (p, n) => Buffer.concat([Buffer.from([5, p]), i32(n)]);
  const Bo = (p, v) => Buffer.from([7, p, v ? 1 : 0]);
  const art = (id, name, u1, rev) => Buffer.concat([st('ShipmentArticle', id), S(3, name), S(4, u1), ...(rev ? [Bo(7, true)] : []), en('ShipmentArticle')]);
  const spi = (id, sar, name) => Buffer.concat([st('ShipmentPriceItem', id), I(2, sar), S(17, name), Bo(21, true), en('ShipmentPriceItem')]);
  const status = (id, name, o, f) => Buffer.concat([st('ShipmentStatus', id), S(16, name), I(21, o), ...f, en('ShipmentStatus')]);
  const ship = Buffer.concat([st('Shipment', 7001), I(59, 7001), I(11, 601),
    status(601, 'Bekräftad', 2, [Bo(4, true), Bo(10, true)]), status(603, 'Lastad', 4, [Bo(6, true)]), status(604, 'Lossad', 5, [Bo(7, true), Bo(8, true)]),
    art(77, 'Budtransport TIM', 'Timmar', false), art(78, 'Lastningstid', 'Minuter', false), art(79, 'Gammal', '', true), spi(9001, 78, 'Lastningstid'), en('Shipment')]);
  const R = P.toRutt(P.decodeSync(Buffer.concat([ship, Buffer.from([3]), Buffer.alloc(16)])));
  const e = R.stops.find(s => s.drop).live.edit;
  expect(e.articles.map(a => [a.id, a.name, a.unit1])).toEqual([[77, 'Budtransport TIM', 'Timmar'], [78, 'Lastningstid', 'Minuter']]);
  expect(e.priceItems.map(x => [x.id, x.sarId, x.name, x.unit1])).toEqual([[9001, 78, 'Lastningstid', 'Minuter']]);
});

test('frågor (Opter: Frågor vid hämtning/lämning) läses, och svaret skickas som ShipmentAnswer under frågan', () => {
  const i32 = n => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; };
  const st = (tbl, xxx) => Buffer.concat([Buffer.from([1, P.Table.indexOf(tbl), 14]), i32(0), i32(7), i32(xxx), Buffer.from([0, 1])]);
  const en = tbl => Buffer.from([2, P.Table.indexOf(tbl)]);
  const S = (p, s) => { const x = Buffer.from(s); const h = Buffer.alloc(4); h[0] = 4; h[1] = p; h.writeInt16LE(x.length, 2); return Buffer.concat([h, x]); };
  const I = (p, n) => Buffer.concat([Buffer.from([5, p]), i32(n)]);
  const Bo = (p, v) => Buffer.from([7, p, v ? 1 : 0]);
  const status = (id, name, o, f) => Buffer.concat([st('ShipmentStatus', id), S(16, name), I(21, o), ...f, en('ShipmentStatus')]);
  const q = (id, text, isBool, pick, del) => Buffer.concat([st('ShipmentQuery', id), S(2, text), I(3, isBool ? 1 : 0), Bo(4, pick), Bo(5, del), en('ShipmentQuery')]);
  const ship = Buffer.concat([st('Shipment', 7002), I(59, 7002), I(11, 601),
    status(601, 'Bekräftad', 2, [Bo(4, true), Bo(10, true)]), status(603, 'Lastad', 4, [Bo(6, true), Bo(22, true)]), status(604, 'Lossad', 5, [Bo(7, true), Bo(8, true), Bo(12, true), Bo(22, true)]),
    q(31, 'Är godset oskadat?', true, false, true), q(32, 'Antal pallar tillbaka', false, true, false), en('Shipment')]);
  const R = P.toRutt(P.decodeSync(Buffer.concat([ship, Buffer.from([3]), Buffer.alloc(16)])));
  const L = R.stops.find(s => s.drop).live;
  expect(L.unloadSt).toMatchObject({name: 'Lossad', changes: true, queries: true});
  expect(L.loadSt).toMatchObject({name: 'Lastad', changes: false, queries: true});
  expect(L.edit.queries.map(x => [x.id, x.question, x.isBool, x.onPickup, x.onDelivery, x.answer])).toEqual([[31, 'Är godset oskadat?', true, false, true, null], [32, 'Antal pallar tillbaka', false, true, false, null]]);
  const qq = L.edit.queries[0];
  const d = P.decodeSync(P.encodeShipmentEdit({live: L, answers: [{key: qq.key, hdr: qq.hdr, bool: true, lat: 59.27, lng: 18.0036}]}));
  expect(d.decodedBytes).toBe(d.totalBytes);
  expect(d.rows.map(r => r.table)).toEqual(['Shipment', 'ShipmentQuery', 'ShipmentAnswer']);
  const {p250, ...a} = d.rows[2].columns;
  expect(a).toEqual({shiId: 7002, shqId: 31, bool: true, lat: 59.27, lng: 18.0036});
  expect(d.rows[1].key.xxxId).toBe(31);
});

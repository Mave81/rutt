/** Fraktsedelskontroll exakt som Opter (ShipmentDetailViewPager ~1013, shipment/FreightbillCheck). */
const P = require('../src/opter/protocol.js');
const row = (table, xxx, columns, parent) => ({table, key: {identityId: xxx, offId: 1, xxxId: xxx}, hdr: {}, columns, parent});

test('kontroll av numret: längd, Modulus10 (Luhn), tomt utan krav går igenom – som Opters OK-knapp', () => {
  expect(P.freightBillError('79927398713', {cdc: 1})).toBe('');
  expect(P.freightBillError('79927398710', {cdc: 1})).toMatch(/kontrollsiffra/);
  expect(P.freightBillError('12A4', {cdc: 1})).toMatch(/siffror/);
  expect(P.freightBillError('1234', {len: 6})).toMatch(/kort/);
  expect(P.freightBillError('1234567', {len: 6})).toMatch(/långt/);
  expect(P.freightBillError('ABC123', {len: 6})).toBe('');
  expect(P.freightBillError('', {})).toBe('');           // Opter: ingen längd + ingen kontrollsiffra → OK direkt
  expect(P.freightBillError('', {cdc: 1})).toBe('');     // tom sträng är "bara siffror" och summan 0
  expect(P.freightBillError('123', {cdc: 2})).toMatch(/stöds inte/); // Opter stänger rutan → aldrig klar
});

test('ordertyp som Opter: terminaladress (ADR_HUB_Id) avgör', () => {
  expect(P.shipmentType({}, {})).toBe('p2p');
  expect(P.shipmentType(null, {})).toBe('p2p');
  expect(P.shipmentType({hubId: 3}, {hubId: 4})).toBe('line');
  expect(P.shipmentType({hubId: 3}, {})).toBe('delivery');
  expect(P.shipmentType({}, {hubId: 4})).toBe('pickup');
});

test('när kontrollen krävs: kundens flaggor × statusens hämtning/lämning × ordertyp (eller inställningen för alla)', () => {
  const lastad = {pickup: true}, lossad = {delivery: true};
  const cus = {fbPick: true, fbDelForce: true, fbCdc: 1, fbLen: 8};
  expect(P.freightBillCheckFor(lastad, 'p2p', cus, false)).toEqual({force: false, check: true, cdc: 1, len: 8});
  expect(P.freightBillCheckFor(lossad, 'p2p', cus, false)).toEqual({force: true, check: false, cdc: 1, len: 8});
  expect(P.freightBillCheckFor(lossad, 'pickup', cus, false)).toBeNull();      // hämtorder: inte vid lämning
  expect(P.freightBillCheckFor(lossad, 'pickup', cus, true)).not.toBeNull();   // CheckFreightBillAtAllPickUpAndDelivery
  expect(P.freightBillCheckFor(lastad, 'line', cus, false)).toBeNull();
  expect(P.freightBillCheckFor(lastad, 'p2p', {fbDel: true}, false)).toBeNull();
  expect(P.freightBillCheckFor(lastad, 'p2p', null, false)).toBeNull();
});

test('toRutt: kunden hittas på SHI_CustomerId (utan hänsyn till versaler), kontrollen hamnar på Lastad/Lossad', () => {
  const ship = row('Shipment', 100, {orderId: 555, adrFrom: 1, adrTo: 2, shsId: 12, customerId: 'bdx01', freightBill: '79927398713'});
  const rows = [row('Address', 1, {company: 'A'}), row('Address', 2, {company: 'B', hubId: 9}), ship,
    row('ShipmentCustomer', 7, {customerId: 'BDX01', fbPick: true, fbDelForce: true, fbCdc: 1}),
    row('ShipmentStatus', 12, {name: 'Bekräftad', accepted: true, order: 1}, ship),
    row('ShipmentStatus', 14, {name: 'Lastad', pickup: true, order: 2}, ship),
    row('ShipmentStatus', 13, {name: 'Lossad', delivery: true, order: 3}, ship)];
  const L = P.toRutt({rows}).stops.find(s => s.drop).live;
  expect(L.freightBill).toBe('79927398713');
  expect(L.fbLoad).toEqual({force: false, check: true, cdc: 1, len: 0});
  expect(L.fbUnload).toBeNull(); // till terminal = hämtorder → bara vid hämtning
  const rows2 = rows.concat([row('Setting', 50, {name: 'CheckFreightBillAtAllPickUpAndDelivery', value: 'True'})]);
  expect(P.toRutt({rows: rows2}).stops.find(s => s.drop).live.fbUnload).toEqual({force: true, check: false, cdc: 1, len: 0});
});

test('ändrat nummer skickas som ändring av SHI_FreightBill (CET 30), som Opter', () => {
  const live = {key: {identityId: 5, offId: 7, xxxId: 9001}, hdr: {}, shiId: 9001};
  const d = P.decodeSync(P.encodeShipmentEdit({live, changes: [{cet: P.CET.SHI_FreightBill, kind: 'str', value: '12345674'}]}));
  const v = d.rows.find(r => r.table === 'ShipmentChangeValue');
  expect(v.columns.cet).toBe(30);
  expect(v.columns.value).toBe('12345674');
});

const P = require('../src/opter/protocol');
const live = {key: {identityId: 0, offId: 1, xxxId: 5501}, hdr: {extra: 0, conf: 1}, shiId: 5501, externalId: 'X1', packageIds: [77]};
const T = (s) => new Date(s).getTime();
test('sen som Opter: tid → jämför tid, bara datum → jämför dagen, inget → aldrig sen', () => {
  const ld = {ms: T('2026-10-21T10:00:00+02:00'), date: '2026-10-21', hasTime: true};
  expect(P.isLateDelivery(ld, T('2026-10-21T09:59:00+02:00'))).toBe(false);
  expect(P.isLateDelivery(ld, T('2026-10-21T10:01:00+02:00'))).toBe(true);
  const dOnly = {ms: T('2026-10-21T00:00:00+02:00'), date: '2026-10-21', hasTime: false};
  expect(P.isLateDelivery(dOnly, T('2026-10-21T23:00:00+02:00'))).toBe(false);
  expect(P.isLateDelivery(dOnly, T('2026-10-22T07:00:00+02:00'))).toBe(true);
  expect(P.isLateDelivery(null)).toBe(false);
});
test('bara order där kunden kräver orsak/avvikelse och som saknar orsak', () => {
  const late = {ms: T('2026-10-21T08:00:00+02:00'), date: '2026-10-21', hasTime: true};
  const now = T('2026-10-21T11:00:00+02:00');
  const st = (drop, l) => ({drop, live: {unloadSt: {id: 4}, latestDel: late, tfrId: 0, forceDelay: false, forceDamageDelay: false, ...l}});
  const n = P.delayNeeds([st(1, {forceDelay: true}), st(2, {}), st(3, {forceDelay: true, tfrId: 7}), st(4, {forceDamageDelay: true}), st(5, {forceDelay: true, latestDel: null})], now);
  expect(n).toEqual([{cid: '1', reason: true, damage: false}, {cid: '4', reason: false, damage: true}]);
});
test('Shipment-fälten 105–108 och förseningsorsaker från kontoret', () => {
  expect(P.F.Shipment[105]).toBe('tfrId'); expect(P.F.Shipment[106]).toBe('tfComment');
  expect(P.F.Shipment[107]).toBe('forceDelayReason'); expect(P.F.Shipment[108]).toBe('forceDamageOnDelay');
  const o = P.editOptions({rows: [
    {table: 'TimeFailureReason', key: {xxxId: 3}, columns: {id: 3, name: 'Trafik', active: true, inMobile: true}},
    {table: 'TimeFailureReason', key: {xxxId: 4}, columns: {id: 4, name: 'Kunden ej på plats', active: true, inMobile: false}},
    {table: 'TimeFailureReason', key: {xxxId: 5}, columns: {id: 5, name: 'Gammal', active: false, inMobile: true}},
    {table: 'TimeFailureReason', key: {xxxId: 6}, columns: {id: 6, name: 'Lastning drog ut', active: true, inMobile: true}},
  ]});
  expect(o.delayReasons.map(r => r.name)).toEqual(['Lastning drog ut', 'Trafik']);
});
test('orsaken skickas som Opter: en ShipmentChange med kommentar (106) och orsak (107)', () => {
  const d = P.decodeSync(P.encodeShipmentEdit({live, changes: [{cet: 106, kind: 'str', value: 'Kö på Essingeleden'}, {cet: 107, kind: 'int', value: '3'}]}));
  expect(d.decodedBytes).toBe(d.totalBytes);
  expect(d.rows.map(r => r.table)).toEqual(['Shipment', 'ShipmentChange', 'ShipmentChangeValue', 'ShipmentChangeValue']);
  expect(d.rows[2].columns).toMatchObject({cet: 106, value: 'Kö på Essingeleden'});
  expect(d.rows[3].columns).toMatchObject({cet: 107, value: 3});
});

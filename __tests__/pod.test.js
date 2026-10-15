/** Lossad + kvittens ska skrivas exakt som Opter Driver (registerPod + setShipmentStatus). */
const P = require('../src/opter/protocol.js');
const row = (table, xxx, columns, parent) => ({table, key: {identityId: xxx, offId: 1, xxxId: xxx}, hdr: {}, columns, parent});

test('krav = orderns krav OCH kvittenstypens krav; typer från DefaultPodType', () => {
  const ship = row('Shipment', 100, {orderId: 555, adrFrom: 1, adrTo: 2, shsId: 12, podSigReq: true, podRemarkReq: true, externalId: 'X1'});
  const rows = [row('Address', 1, {company: 'A'}), row('Address', 2, {company: 'B'}), ship,
    row('ShipmentStatus', 12, {name: 'Bekräftad', accepted: true, order: 1}, ship),
    row('ShipmentStatus', 13, {name: 'Lossad', delivery: true, pod: true, order: 3}, ship),
    row('ShipmentPackage', 501, {quantity: 3}, ship),
    row('DefaultPodType', 3, {name: 'Signatur', sigReq: true, picReq: true, commentReq: true, isDefault: true, active: true, allowAfterPickup: true}),
    row('DefaultPodType', 4, {name: 'Foto', picReq: true, active: true, allowAfterPickup: true}),
    row('DefaultPodType', 5, {name: 'Före hämtning', active: true, allowBeforePickup: true})];
  const drop = P.toRutt({rows}).stops.find(s => s.drop);
  expect(drop.req).toEqual({name: false, sig: true, remark: false, comment: false, pic: false});
  expect(drop.pod.types.map(t => t.name)).toEqual(['Signatur', 'Foto']);
  expect(drop.pod.defaultId).toBe(3);
  expect(drop.live.hasSpt).toBe(false);
  expect(drop.live.packageIds).toEqual([501]);
  expect(drop.live.externalId).toBe('X1');
});

test('Lossad-paketet: status + logg + kvittens + kollikvittenser, nya rader med OFF_Id 0', () => {
  const live = {key: {identityId: 5, offId: 7, xxxId: 9001}, hdr: {}, shiId: 9001, externalId: '', packageIds: [501, 502]};
  const d = P.decodeSync(P.encodeShipmentStatus({live, statusId: 44, pod: {sptId: -3, dptId: 0, name: 'Anna', signature: '-1,-1,1,2', lat: 59.33, lng: 18.06}}));
  const t = d.rows.map(r => r.table);
  expect(t).toEqual(['Shipment', 'ShipmentStatusLog', 'ShipmentPod', 'ShipmentPackagePod', 'ShipmentPackagePod']);
  const [sh, log, pod, pp] = d.rows;
  expect(sh.columns).toEqual({shsId: 44, externalId: ''});
  expect(log.key.offId).toBe(0); expect(log.columns.p250).toBe(0);
  expect(log.columns.shiId).toBe(9001); expect(log.columns.shsId).toBe(44);
  expect(pod.columns.sptId).toBe(-3); expect(pod.columns.dptId).toBeUndefined();
  expect(pod.columns.shiId).toBeUndefined();
  expect(pod.columns.lat).toBeCloseTo(59.33); expect(pod.columns.lng).toBeCloseTo(18.06);
  expect(pp.columns.spaId).toBe(501); expect(pp.parent.table).toBe('ShipmentPod');
});

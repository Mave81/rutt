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
    row('DefaultPodType', 5, {name: 'Före hämtning', active: true, allowBeforePickup: true, allowAfterPickup: false})];
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

test('kvittenstyp utan "tillåt efter hämtning"-fält räknas som tillåten (Opters standard = sant)', () => {
  // Servern skickar bara fält som skiljer sig från standard – så ser det ut på riktigt.
  const ship = row('Shipment', 100, {orderId: 555, adrFrom: 1, adrTo: 2, shsId: 12, podSigReq: true, podNameReq: true});
  const rows = [row('Address', 1, {company: 'A'}), row('Address', 2, {company: 'B'}), ship,
    row('ShipmentStatus', 12, {name: 'Bekräftad', accepted: true, order: 1}, ship),
    row('ShipmentStatus', 13, {name: 'Lossad', delivery: true, pod: true, order: 3}, ship),
    row('DefaultPodType', 7, {name: 'Kvittens', sigReq: true, nameReq: true, isDefault: true})];
  const drop = P.toRutt({rows}).stops.find(s => s.drop);
  expect(drop.pod.types.map(t => t.name)).toEqual(['Kvittens']);
  expect(drop.live.podType).toEqual({id: 7, name: 'Kvittens'});
  expect(drop.req.sig).toBe(true); expect(drop.req.name).toBe(true);
});

test('namnförslag: rader under ordern utan SPS_SHI_Id räknas till ordern, återkallade och dubbletter bort', () => {
  const ship = row('Shipment', 100, {orderId: 555, adrFrom: 1, adrTo: 2, shsId: 12});
  const rows = [row('Address', 1, {company: 'A'}), row('Address', 2, {company: 'B'}), ship,
    row('ShipmentStatus', 12, {name: 'Bekräftad', accepted: true, order: 1}, ship),
    row('ShipmentStatus', 13, {name: 'Lossad', delivery: true, pod: true, order: 3}, ship),
    row('ShipmentPodSuggestion', 1, {name: 'Anna Berg'}, ship), row('ShipmentPodSuggestion', 2, {name: 'Per Ö'}, ship),
    row('ShipmentPodSuggestion', 3, {name: 'Gammal', revoked: true}, ship), row('ShipmentPodSuggestion', 4, {name: 'Anna Berg'}, ship),
    row('ShipmentPodSuggestion', 5, {name: 'Lisa'}, ship), row('ShipmentPodSuggestion', 6, {name: 'Kim'}, ship)];
  const drop = P.toRutt({rows}).stops.find(s => s.drop);
  expect(drop.suggest).toEqual(['Anna Berg', 'Per Ö', 'Lisa', 'Kim']);
});

test('signatur: aldrig över Opters gräns (Int16-längd), streckstarter kvar, inga negativa koordinater', () => {
  const st = []; for (let s = 0; s < 12; s++) { const a = []; for (let i = 0; i < 900; i++) a.push({x: -3 + i * 0.7, y: 60 + Math.sin(i / 4) * 50}); st.push(a); }
  const sig = P.signatureString(st, 3);
  expect(Buffer.byteLength(sig)).toBeLessThanOrEqual(30000);
  const n = sig.split(',').map(Number);
  expect(n.filter((v, i) => i % 2 === 0 && v === -1).length).toBe(12);  // 12 streck
  expect(n.every(v => v >= -1)).toBe(true);
  const live = {key: {identityId: 5, offId: 7, xxxId: 9001}, hdr: {}, shiId: 9001, externalId: '', packageIds: []};
  const d = P.decodeSync(P.encodeShipmentStatus({live, statusId: 44, pod: {sptId: -3, name: 'Åsa', signature: sig}}));
  expect(d.error).toBeUndefined();
  expect(d.rows[2].columns.signature).toBe(sig);
  // vanlig signatur: oförändrad täthet (Opters 4 px)
  const small = P.signatureString([[{x: 0, y: 0}, {x: 1, y: 0}, {x: 2, y: 0}, {x: 10, y: 0}]], 1);
  expect(small).toBe('-1,-1,0,0,10,0');
});

test('kvittens vid hämtning: Lastad med SHS_Pod → krävs, bara typer med "tillåt före hämtning" (som Opter)', () => {
  const ship = row('Shipment', 100, {orderId: 555, adrFrom: 1, adrTo: 2, shsId: 12});
  const rows = [row('Address', 1, {company: 'A'}), row('Address', 2, {company: 'B'}), ship,
    row('ShipmentStatus', 12, {name: 'Bekräftad', accepted: true, order: 1}, ship),
    row('ShipmentStatus', 14, {name: 'Lastad', pickup: true, pod: true, order: 2}, ship),
    row('ShipmentStatus', 13, {name: 'Lossad', delivery: true, pod: true, order: 3}, ship),
    row('DefaultPodType', 3, {name: 'Signatur', isDefault: true, allowBeforePickup: false}),
    row('DefaultPodType', 5, {name: 'Hämtkvitto', allowAfterPickup: false})];
  const s = P.toRutt({rows}).stops;
  const pick = s.find(x => x.pickup && !x.drop), drop = s.find(x => x.drop);
  expect(pick.live.loadSt.pod).toBe(true);
  expect(pick.pod.types.map(t => t.name)).toEqual(['Hämtkvitto']);
  expect(drop.pod.types.map(t => t.name)).toEqual(['Signatur']);
});

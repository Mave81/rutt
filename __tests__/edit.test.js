const P = require('../src/opter/protocol');
const live = {key: {identityId: 0, offId: 1, xxxId: 5501}, hdr: {extra: 0, conf: 1}, shiId: 5501, externalId: 'X1', packageIds: [77]};
const strip = (b) => { // nollställ löpnummer i radhuvuden så två kodningar kan jämföras
  const d = P.decodeSync(b); return JSON.stringify(d.rows.map(r => ({t: r.table, off: r.key.offId, x: r.key.xxxId, c: r.columns, p: r.parent && r.parent.table})));
};
test('status + kvittens: samma som befintliga (verifierade) kodningen', () => {
  const pod = {sptId: -3, name: 'Anna', signature: '-1,-1,1,2', packageCount: 2, lat: 59.3, lng: 18.1};
  expect(strip(P.encodeShipmentEdit({live, statusId: 12, pod}))).toBe(strip(P.encodeShipmentStatus({live, statusId: 12, pod})));
});
test('tillägg, avvikelse, ändring och bild avkodas tillbaka rätt och i Opters ordning', () => {
  const b = P.encodeShipmentEdit({live,
    addServices: [{satId: 40, number: '30', descr: 'väntade'}],
    damages: [{ddtId: 3, daeId: 8, darId: 0, comment: 'trasig pall', images: [{name: 'IMG_1.jpg', bytes: Buffer.from([1, 2, 3])}]}],
    changes: [{cet: P.CET.SHI_Packages, kind: 'int', value: '4'}, {cet: P.CET.SHI_Weight, kind: 'dec', value: '12,5'}, {cet: P.CET.SHI_Message, kind: 'str', value: ''}],
    images: [{bytes: Buffer.from([9, 9]), comment: 'lossat vid port', orderId: '226815'}]});
  const d = P.decodeSync(b);
  expect(d.error).toBeUndefined();
  expect(d.decodedBytes).toBe(d.totalBytes);
  expect(d.rows.map(r => r.table)).toEqual(['Shipment', 'ShipmentAddService', 'ShipmentDamage', 'DamageAttachment', 'ShipmentChange', 'ShipmentChangeValue', 'ShipmentChangeValue', 'ShipmentChangeValue', 'Attachment']);
  const [sh, sa, sd, da, sc, v1, v2, v3, at] = d.rows;
  expect(sh.key.xxxId).toBe(5501);
  expect(Object.keys(sh.columns)).toEqual([]); // ordern själv ändras inte
  expect(sa.columns).toMatchObject({satId: 40, number: 30, descr: 'väntade'});
  expect(sa.raw[250]).toBe(0);
  expect(sd.columns).toMatchObject({ddtId: 3, daeId: 8, comment: 'trasig pall'});
  expect(da.parent.table).toBe('ShipmentDamage');
  expect(da.columns.p3).toBe('IMG_1.jpg');
  expect(v1.columns).toMatchObject({p2: 40, p5: 4});
  expect(v2.columns).toMatchObject({p2: 39, p5: 12.5});
  expect(v3.columns).toMatchObject({p2: 42, p5: ''});
  expect(at.columns).toMatchObject({delId: 226815, filename: 'image', comment: 'lossat vid port', fftId: 7});
});
test('bara status: ingen kvittens, inget externt id', () => {
  const d = P.decodeSync(P.encodeShipmentEdit({live, statusId: 9}));
  expect(d.rows.map(r => r.table)).toEqual(['Shipment', 'ShipmentStatusLog']);
  expect(d.rows[0].columns).toEqual({shsId: 9});
});
test('editOptions läser kontorets val', () => {
  const rows = [
    {table: 'Setting', key: {}, columns: {name: 'SHI_WeightPermission', value: 'true'}},
    {table: 'Setting', key: {}, columns: {name: 'DamagesPermission', value: 'false'}},
    {table: 'DefaultDamageType', key: {xxxId: 3}, columns: {name: 'Godsskada', forceComment: true, forceEvent: true}},
    {table: 'DamageEvent', key: {xxxId: 8}, columns: {name: 'Krossad'}},
    {table: 'DamageTypeEvent', key: {xxxId: 1}, columns: {datId: 3, daeId: 8}},
  ];
  const o = P.editOptions({rows});
  expect(o.fields.map(f => f.cetName)).toEqual(['SHI_Weight', 'SHI_GoodsType']); // någon SHI-behörighet finns → bara de uttryckligen tillåtna + standard-true
  expect(o.perm.damages).toBe(false);
  expect(o.damageTypes[0]).toMatchObject({id: 3, name: 'Godsskada', forceComment: true, forceEvent: true});
  expect(o.damageTypes[0].events[0].name).toBe('Krossad');
});
test('folket på jobbet: aktiva förare + trafikledningens nummer', () => {
  const rows = [
    {table: 'Resource', key: {xxxId: 1}, columns: {name: 'Joel Henriksson'}},
    {table: 'Resource', key: {xxxId: 2}, columns: {name: 'Tony Rösth'}},
    {table: 'Resource', key: {xxxId: 3}, columns: {name: 'Slutat', active: false}},
    {table: 'Resource', key: {xxxId: 4}, columns: {name: 'Kontorist', driver: false}},
    {table: 'Office', key: {xxxId: 1}, columns: {phoneDispatch: '08-123 456'}},
  ];
  const t = P.team({rows});
  expect(t.drivers.map(d => d.name)).toEqual(['Joel Henriksson', 'Tony Rösth']);
  expect(t.dispatchPhone).toBe('08-123 456');
});
test('bara ditt åkeris förare – som Opters Ge bort-lista', () => {
  const rows = [
    {table: 'Resource', key: {xxxId: 1}, columns: {name: 'Joel Henriksson', supplierId: 55}},
    {table: 'Resource', key: {xxxId: 2}, columns: {name: 'Kenneth Andersson', supplierId: 55}},
    {table: 'Resource', key: {xxxId: 3}, columns: {name: 'Annat åkeri', supplierId: 77}},
    {table: 'Resource', key: {xxxId: 4}, columns: {name: 'Kontorets egen förare'}},
  ];
  const logon = P.parseLogon(Buffer.from(['7', '2', 'Kenneth Andersson', 'guid', '0', 'false', '2', '1', '12', 'false', 'true', '3111', '55', 'false', 'false', 'false'].join('\n')));
  expect(logon.showOnlySupplier).toBe(true);
  expect(logon.supplierId).toBe(55);
  expect(P.team({rows}, logon).drivers.map(d => d.name)).toEqual(['Joel Henriksson']);
  expect(P.resourceList({rows}, logon).map(d => d.name)).toEqual(['Joel Henriksson', 'Kenneth Andersson']);
});

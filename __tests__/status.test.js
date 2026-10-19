/** Lossad ska alltid komma fram – även om Opter inte tar kvittensen i samma paket. */
jest.mock('@microsoft/signalr', () => ({}), {virtual: true});
const P = require('../src/opter/protocol.js');
const OpterClient = require('../src/opter/OpterClient.js').default;

function fake(rule) {
  // rule(decodedRequest) → true = servern sparar statusen
  const c = new OpterClient();
  c.logon = {acdOffId: 1};
  let shs = 12; const sent = [];
  c.send = async (type, buf) => {
    const d = P.decodeSync(buf); sent.push(d.rows.map(r => r.table));
    const sh = d.rows.find(r => r.table === 'Shipment');
    if (sh && sh.columns.shsId && rule(d)) shs = sh.columns.shsId;
    return {type: 5, payload: Buffer.alloc(0)};
  };
  c._take = (d) => d;
  c._fullSync = async () => { c.lastDecoded = {rows: [{table: 'Shipment', key: {xxxId: 9001}, columns: {shsId: shs}}]}; };
  c.relogin = async () => {};
  return {c, sent};
}
const live = {key: {identityId: 5, offId: 1, xxxId: 9001}, hdr: {}, shiId: 9001, externalId: '', packageIds: [501]};
const pod = {sptId: -3, name: 'Anna', signature: '-1,-1,1,2,3,4'};

test('Opter tar status + kvittens i ett paket (som Opter Driver)', async () => {
  const {c, sent} = fake(() => true);
  const r = await c.setStatus(live, 44, pod);
  expect(r.confirmed).toBe(true);
  expect(sent).toEqual([['Shipment', 'ShipmentStatusLog', 'ShipmentPod', 'ShipmentPackagePod']]);
  expect(c.log[0].confirmed).toBe(true); expect(c.log[0].pod.name).toBe(4);
});

test('Opter vägrar paketet med kvittens → status för sig, sen kvittensen för sig', async () => {
  const {c, sent} = fake(d => !d.rows.some(r => r.table === 'ShipmentPod'));
  const r = await c.setStatus(live, 44, pod);
  expect(r.confirmed).toBe(true);
  expect(sent[1]).toEqual(['Shipment', 'ShipmentStatusLog']);
  expect(sent[2]).toEqual(['Shipment', 'ShipmentPod', 'ShipmentPackagePod']);
  expect(c.log[0].tries.map(t => t.label)).toEqual(['kvittens', 'bara status', 'kvittens för sig']);
});

test('kvittensen går inte att bygga → statusen skickas ändå', async () => {
  const {c, sent} = fake(() => true);
  const r = await c.setStatus(live, 44, {...pod, packageCount: BigInt(3)});
  expect(c.log[0].tries[0].err).toMatch(/^bygga/);
  expect(r.confirmed).toBe(true);
  expect(sent[sent.length - 1]).toContain('ShipmentStatusLog');
});

test('anslutningen bryts mitt i → skickas igen och bekräftas mot servern', async () => {
  const {c, sent} = fake(() => true);
  let n = 0; const orig = c.send;
  c.send = async (...a) => { if (n++ === 0) throw new Error('avbrott'); return orig(...a); };
  const r = await c.setStatus(live, 44, pod);
  expect(r.confirmed).toBe(true);
  expect(c.log[0].tries[0].err).toBe('avbrott');
});

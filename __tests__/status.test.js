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

test('Skicka vidare: samma text som Opters Ge bort, "1" = klart', async () => {
  expect(P.encodeGiveAway({offId: 1, shiId: 9001, toOffId: 1, toResId: 77, vhcOffId: 1}).toString('utf8')).toBe('1\n9001\n1\n77\n1\n0');
  const c = new OpterClient(); c.logon = {acdOffId: 1, vhcId: 5};
  let got = null;
  c.send = async (type, buf) => { got = {type, txt: buf.toString('utf8')}; return {type: 7, payload: Buffer.from('1')}; };
  c._fullSync = async () => { c.lastDecoded = {rows: []}; };
  const r = await c.giveAway(live, {resId: 77, name: 'Joel'});
  expect(got).toEqual({type: 7, txt: '1\n9001\n1\n77\n1\n0'});
  expect(r.confirmed).toBe(true);
});

test('förarlistan har kontor (OFF_Id) för Skicka vidare', () => {
  const rows = [{table: 'Resource', key: {identityId: 1, offId: 3, xxxId: 77}, columns: {name: 'Joel A'}}];
  expect(P.team({rows}, {resId: 1, supplierId: 0}).drivers).toEqual([{resId: 77, offId: 3, name: 'Joel A'}]);
});

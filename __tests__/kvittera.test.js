/* 3.61: kvittera återkallad – exakt som Opter Driver (ServerProxy.setRevokedConfirmed): bara fält 67 = sant, radhuvud 0/0.
   Räknas som kvitterad bara när en felfri synk efteråt visar det. */
const P = require('../src/opter/protocol');
const OpterClient = require('../src/opter/OpterClient').default;
const {Buffer} = require('buffer');
const i32 = n => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; };
const shipRow = (xxx, flags) => Buffer.concat([Buffer.from([1, P.Table.indexOf('Shipment'), 14]), i32(0), i32(7), i32(xxx), Buffer.from([5, 1]),
  Buffer.concat([Buffer.from([5, 59]), i32(xxx)]), ...flags, Buffer.from([2, P.Table.indexOf('Shipment')])]);
const sync = rows => Buffer.concat([...rows, Buffer.from([3]), Buffer.alloc(16)]);
const live = {key: {identityId: 0, offId: 7, xxxId: 226815}, shiId: 226815, hdr: {extra: 5, conf: 1}};
function client(fullAfter) {
  const c = new OpterClient();
  c.logon = {acdOffId: 7, vhcId: 1};
  c.lastDecoded = P.decodeSync(sync([shipRow(226815, [Buffer.from([7, 66, 1])])]));
  c.sent = [];
  c.send = async (type, payload) => { c.sent.push(Buffer.from(payload)); return c.sent.length === 1 ? {type: P.MessageType.Synchronize, payload: sync([])} : fullAfter(); };
  c.relogin = async () => {};
  c._log = () => {};
  return c;
}
test('skickar bara fält 67 = sant med radhuvud 0/0, som Opter Driver', async () => {
  const c = client(() => ({type: P.MessageType.Synchronize, payload: sync([shipRow(226815, [Buffer.from([7, 66, 1]), Buffer.from([7, 67, 1])])])}));
  const r = await c.confirmRevoked(live);
  const b = c.sent[0];
  expect(b[0]).toBe(1); expect(b[1]).toBe(P.Table.indexOf('Shipment'));
  expect(b[2 + 1 + 12]).toBe(0); expect(b[2 + 1 + 13]).toBe(0);      // extra, conf = 0 (inte serverns 5/1)
  expect(b.includes(Buffer.from([7, 67, 1]))).toBe(true);
  expect(r.confirmed).toBe(true);
});
test('synken efteråt misslyckas → INTE kvitterad (förut: ordern syns inte = klart)', async () => {
  const c = client(() => { throw new Error('nätet borta'); });
  const r = await c.confirmRevoked(live);
  expect(r.sent).toBe(true);
  expect(r.confirmed).toBe(false);
});
test('ordern ligger kvar utan kvittens-flaggan → INTE kvitterad', async () => {
  const c = client(() => ({type: P.MessageType.Synchronize, payload: sync([shipRow(226815, [Buffer.from([7, 66, 1])])])}));
  expect((await c.confirmRevoked(live)).confirmed).toBe(false);
});
test('ordern fanns före och är borta i en felfri synk → kvitterad (kontoret tog bort den)', async () => {
  const c = client(() => ({type: P.MessageType.Synchronize, payload: sync([])}));
  expect((await c.confirmRevoked(live)).confirmed).toBe(true);
});

test('3.66: kvitterad i Opter-appen känns igen i RUTT', () => {
  const c = new OpterClient();
  c.lastDecoded = P.decodeSync(sync([shipRow(226815, [Buffer.from([7, 66, 1]), Buffer.from([7, 67, 1])]), shipRow(226900, [])]));
  expect(c.revokedState(226815)).toBe('kvitterad');
  c.lastDecoded = P.decodeSync(sync([shipRow(226815, [Buffer.from([7, 66, 1])])]));
  expect(c.revokedState(226815)).toBe('kvar');
  c.lastDecoded = P.decodeSync(sync([shipRow(226900, [])]));
  expect(c.revokedState(226815)).toBe('borta');
  // tom lista eller trasig synk: går inte att lita på
  c.lastDecoded = P.decodeSync(sync([]));
  expect(c.revokedState(226815)).toBe(null);
  c.lastDecoded = {rows: [], error: 'x'};
  expect(c.revokedState(226815)).toBe(null);
});

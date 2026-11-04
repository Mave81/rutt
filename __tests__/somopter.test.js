/* 3.65: det RUTT skickar ska se ut som Opter Driver (genomgång mot Opters egen kod 4 nov). */
const P = require('../src/opter/protocol');
const OpterClient = require('../src/opter/OpterClient').default;
const live = {key: {identityId: 0, offId: 7, xxxId: 234982}, shiId: 234982, hdr: {extra: 5, conf: 1}, externalId: ''};
const hdrOf = b => [b[15], b[16]]; // StartTable(1) tabell(1) längd(1) id(4) off(4) xxx(4) → extra, conf
test('status och ändringar: radhuvudet 0/0 som Opter, inte serverns ekade byten', () => {
  expect(hdrOf(P.encodeShipmentStatus({live, statusId: 604, pod: null}))).toEqual([0, 0]);
  expect(hdrOf(P.encodeShipmentEdit({live, changes: [{cet: 34, kind: 'dec', value: '30'}]}))).toEqual([0, 0]);
});
test('radordning som Opter: ändring och kvittens före svar på frågor, bilagor sist', () => {
  const b = P.encodeShipmentEdit({live, changes: [{cet: 34, kind: 'dec', value: '30'}], answers: [{key: {offId: 7, xxxId: 99}, text: 'Ja'}], images: [{orderId: '234982', bytes: Buffer.from([1, 2, 3])}]});
  const at = t => b.indexOf(Buffer.from([P.DT ? P.DT.StartTable || 1 : 1, P.Table.indexOf(t)]));
  expect(at('ShipmentChange')).toBeGreaterThan(0);
  expect(at('ShipmentQuery')).toBeGreaterThan(at('ShipmentChange'));
  expect(at('Attachment')).toBeGreaterThan(at('ShipmentQuery'));
});
test('kolli ändras som decimaltal (Opter ChangesList)', () => {
  expect((P.CHANGE_FIELDS || []).find(f => f[0] === 'SHI_Packages')[1]).toBe('dec');
});
test('tappat nät under rasten: efter ny inloggning skickas rasten igen, så kontoret inte ser dig i tjänst', async () => {
  const c = new OpterClient();
  c.cfg = {}; c.creds = {user: '3111', pass: 'x'}; c.resId = 5; c.workRst = 5;
  c.connect = async () => {};
  const sent = [];
  c._rawSend = async (type, payload) => { sent.push({type, payload: Buffer.from(payload || [])}); if (type === P.MessageType.Logon) return {payload: Buffer.from('1\n7\n5\n1\nKenneth Andersson\n0\n')}; return {payload: Buffer.concat([Buffer.from([3]), Buffer.alloc(16)])}; };
  P.parseLogon = (orig => b => ({...orig(b), ok: true, acdOffId: 7, vhcId: 1}))(P.parseLogon);
  c._log = () => {};
  await c.relogin();
  const syncs = sent.filter(x => x.type === P.MessageType.Synchronize).map(x => x.payload);
  expect(syncs.length).toBe(2); // StartWork + rasten igen
  expect(syncs[1].length).toBe(P.encodeWorkStatus({offId: 7, rstType: 5, resId: 5, vhcId: 1}).length); // arbetstidsraden (tiden skiljer)
});

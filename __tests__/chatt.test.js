const {splitPhones, nameFor, stripEmoji, hasEmoji} = require('../src/chat');
const P = require('../src/opter/protocol');
const TXT = 'Kärl hämtas och lämnar på Stena i Rosersberg, kör ingenting över våg. Ring Katta på stena 010 445 72 71 och meddela vilka fraktioner/ antal kärlen innehåller';
test('nummer i chatten blir egna bitar (riktig text från order 226815)', () => {
  const s = splitPhones(TXT);
  expect(s.map(x => x.t).join('')).toBe(TXT);
  expect(s.filter(x => x.num).map(x => x.num)).toEqual(['0104457271']);
  expect(splitPhones('Ring 070-779 41 57 eller +46733372823').filter(x => x.num).map(x => x.num)).toEqual(['0707794157', '0733372823']);
  expect(splitPhones('Order 232245, 7 kli').filter(x => x.num)).toEqual([]);
});
test('namnförslag ur texten', () => {
  expect(nameFor(TXT, '0104457271')).toBe('Katta Stena');
  expect(nameFor('Ring 0707794157', '0707794157')).toBe('');
});
test('smileys tas bort innan Opter', () => {
  expect(stripEmoji('På väg 👍')).toBe('På väg');
  expect(stripEmoji('Klart ✅ tack')).toBe('Klart tack');
  expect(hasEmoji('På väg 👍')).toBe(true);
  expect(hasEmoji('På väg')).toBe(false);
  expect(hasEmoji('På väg')).toBe(false);
});
test('kvittera återkallad: bara fält 67 = sant (som Opter)', () => {
  const live = {key: {identityId: 0, offId: 1, xxxId: 5501}, hdr: {extra: 0, conf: 1}, shiId: 5501};
  const d = P.decodeSync(P.encodeShipmentEdit({live, revokedConfirmed: true}));
  expect(d.decodedBytes).toBe(d.totalBytes);
  expect(d.rows.map(r => r.table)).toEqual(['Shipment']);
  expect(d.rows[0].columns).toEqual({revokedConfirmed: true});
});
test('chattmeddelande vet vilken order det hör till (FTM_SHI_Id)', () => {
  const m = P.messageList({rows: [{table: 'FreeTextMessage', key: {xxxId: 9, identityId: 0}, columns: {text: 'Hej', fromName: 'Kontoret', shiId: 226815}}]});
  expect(m[0].shiId).toBe(226815);
});
test('två nummer i samma fält delas (Proplatt, order 232309: "072-856 06 49 / 073-597 13 31")', () => {
  expect(P.splitNums('072-856 06 49 / 073-597 13 31')).toEqual(['0728560649', '0735971331']);
  expect(P.splitNums('08-556 212 80')).toEqual(['085562128' + '0']);
  expect(P.splitNums('0728560649 0735971331')).toEqual(['0728560649', '0735971331']);
  expect(P.splitNums('+46733372823')).toEqual(['+46733372823']);
  expect(P.splitNums('070-1234567, 08-6236800')).toEqual(['0701234567', '086236800']);
  expect(P.splitNums('')).toEqual([]);
});

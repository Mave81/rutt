// Kontorets inställningar läses exakt som Opter Driver (syncdata/Setting.java).
const P = require('../src/opter/protocol');
const row = (name, value, active) => ({table: 'Setting', key: {xxxId: 1}, columns: {name, value, ...(active === false ? {active: false} : {})}});
test('sista aktiva raden gäller, bara "true" är ja, namnet är skiftlägeskänsligt', () => {
  const d = {rows: [row('ArticlesPermission', 'true'), row('ArticlesPermission', 'false'), row('ChangesPermission', '1'), row('DamagesPermission', 'TRUE'),
    row('AddImagePermission', 'false'), row('AddImagePermission', 'true', false), row('giveawaypermission', 'false'), row('PositionUpdateInterval', 'x')]};
  expect(P.settingBool(d, 'ArticlesPermission', true)).toBe(false);   // sista raden
  expect(P.settingBool(d, 'ChangesPermission', true)).toBe(false);    // "1" är inte "true"
  expect(P.settingBool(d, 'DamagesPermission', false)).toBe(true);    // versaler spelar ingen roll i värdet
  expect(P.settingBool(d, 'AddImagePermission', true)).toBe(false);   // inaktiv rad räknas inte
  expect(P.settingBool(d, 'GiveAwayPermission', true)).toBe(true);    // fel skiftläge i namnet = saknas → standard
  expect(P.settingInt(d, 'PositionUpdateInterval', 60)).toBe(60);     // går inte att läsa som tal → standard
  const o = P.editOptions(d);
  expect(o.perm).toMatchObject({articles: false, changes: false, damages: true, addImage: false, giveAway: true});
});
test('nästa status exakt som Opter: lägsta ordning över nuvarande, UserOption, inte Nekad – och kedjan dit', () => {
  const st = [{id: 1, name: 'Meddelad', order: 1}, {id: 2, name: 'Bekräftad', order: 2, userOption: true, accepted: true}, {id: 3, name: 'Nekad', order: 3, userOption: true, rejected: true},
    {id: 9, name: 'Framme', order: 4, userOption: true}, {id: 4, name: 'Lastad', order: 5, userOption: true, pickup: true}, {id: 5, name: 'Lossad', order: 6, userOption: true, delivery: true, completed: true}];
  expect(P.nextStatusOf(st, st[1]).name).toBe('Framme');
  expect(P.nextStatusOf(st, st[5])).toBe(null);
  const live = {curId: 2, statuses: st};
  expect(P.statusChain(live, 4).map(x => x.name)).toEqual(['Framme']);
  expect(P.statusChain({curId: 9, statuses: st}, 4)).toEqual([]);
  expect(P.statusChain({curId: 2, statuses: st.filter(x => x.id !== 9)}, 4)).toEqual([]);
});

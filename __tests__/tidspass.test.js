const {tidspass} = require('../src/opter/protocol');
test('tidspassning hittas i Opters produktrad och i fritext', () => {
  expect(tidspass(['Trängselavgift, Tidspassning'], ['2 pall + 2 lister 1100 kg'])).toEqual({time: null});
  expect(tidspass(['Trängselavgift, Tidspassning'], [], {hhmm: '09:30'})).toEqual({time: '09:30'});
  expect(tidspass([], ['2 pall + 2 lister 1100 kg, tidspassning 09:00'])).toEqual({time: '09:00'});
  expect(tidspass([], ['Tidspass kl 8 vid porten'])).toEqual({time: '08:00'});
  expect(tidspass(['Trängselavgift'], ['lossa 1100 kg'])).toBeNull();
});
test('felstavat och semikolon som i Cramo-ordern', () => {
  expect(tidspass([], ['6st fodervagn, 2st dörrlyft\n\ntidspasning 06;50'])).toEqual({time: '06:50'});
  expect(tidspass([], ['Tidspassning'])).toEqual({time: null}); // tjänsten heter Tidspassning
});

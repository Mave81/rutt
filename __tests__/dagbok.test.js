jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const D = require('../src/dagbok');

test('händelser sparas per dag, Ångra tar bort, summering räknar rast och arbetad tid', async () => {
  const t = (h, m) => new Date(2026, 9, 20, h, m).getTime();
  await D.logEvent({t: t(6, 30), kind: 'start'});
  await D.logEvent({t: t(7, 0), kind: 'load', cid: 'A', lat: 59.3, lng: 18.0, pal: 2});
  await D.logEvent({t: t(7, 40), kind: 'unload', cid: 'A', lat: 59.4, lng: 18.1, pal: 2});
  await D.logEvent({t: t(12, 5), kind: 'rast'});
  await D.logEvent({t: t(12, 30), kind: 'igång'});
  await D.logEvent({t: t(13, 0), kind: 'load', cid: 'B', lat: 59.3, lng: 18.0});
  await D.unlogEvent('B', 'load', t(13, 0));
  await D.logEvent({t: t(15, 0), kind: 'slut'});
  await D.saveOrder('2026-10-20', {cid: 'A', dropWho: 'K3gruppen/Axel', orderNo: '228030', pal: 2, doneAt: t(7, 40), podName: 'Ilxom'});
  const d = await D.loadDay('2026-10-20');
  expect(d.events.map(e => e.kind)).toEqual(['start', 'load', 'unload', 'rast', 'igång', 'slut']);
  const s = D.summary(d);
  expect(s).toMatchObject({orders: 1, pal: 2, restMin: 25, workedMin: 8 * 60 + 30 - 25, ended: true});
  expect(await D.listDays()).toEqual(['2026-10-20']);
  const rep = D.dayReport(d, 'Kenneth Andersson');
  expect(rep).toContain('07:40 K3gruppen/Axel #228030 · 2 pall · Ilxom');
  expect(rep).toContain('Totalt 1 order · 2 pall');
  const legs = D.legsFrom([d], pal => 8 + 2 * pal);
  expect(legs).toEqual([{from: {lat: 59.3, lng: 18.0}, to: {lat: 59.4, lng: 18.1}, actualMin: 40, servMin: 12}]);
});

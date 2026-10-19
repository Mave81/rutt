import {computeRoute, simulateLoad} from '../src/opter/optimizer';
const P = {
  alcro: {lat: 59.2262, lng: 18.1300}, frasen: {lat: 59.3138, lng: 18.0720}, kakel: {lat: 59.2800, lng: 18.0700},
  teg: {lat: 59.3415, lng: 18.1050}, screen: {lat: 59.2965, lng: 18.0090}, foto: {lat: 59.3178, lng: 18.0855},
};
const day = '2026-10-20';
const stops = [
  {pickup: 'A', who: 'Alcro Länna', ...P.alcro, open: '06:30'}, {drop: 'A', who: 'Fräsens Måleri', ...P.frasen},
  {pickup: 'K', who: 'Kakelspecialisten', ...P.kakel, open: '07:00'}, {drop: 'K', who: 'Tegeluddsvägen', ...P.teg},
  {pickup: 'S', who: 'Screenbolaget', ...P.screen, open: '07:00'}, {drop: 'S', who: 'Fotografiska', ...P.foto},
].map(s => ({...s, openDate: day}));
const cargo = {A: {pal: 2}, K: {pal: 1}, S: {pal: 1}};
const t0 = new Date(day + 'T06:00').getTime();
const key = s => (s.pickup ? 'p' + s.pickup : 'd' + s.drop);
// Kentas tisdag 20 okt (ungefärliga koordinater). Med körtider ska RUTT hämta allt först: Alcro öppnar 06:30, de andra 07:00.
test('20 okt: hämta allt först, sen Söder → Stadsgården → Gärdet, utan omlastning', () => {
  for (const st of [{lat: 59.2940, lng: 18.0100}, {lat: 59.2437, lng: 18.2280}]) {
    const r = computeRoute(stops, cargo, {...st, cur: null}, t0);
    expect(r.order.map(key)).toEqual(['pA', 'pK', 'pS', 'dA', 'dS', 'dK']);
    expect(simulateLoad(r.order, new Set(), cargo).blockPal).toBe(0);
  }
});

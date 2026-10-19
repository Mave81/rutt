/*
 * Riktiga körtider och sträckor längs vägarna (OpenStreetMap via OSRM:s tabelltjänst).
 *  GET https://router.project-osrm.org/table/v1/driving/{lng,lat;lng,lat…}?annotations=duration,distance
 *  → durations[i][j] i sekunder, distances[i][j] i meter (null = ingen väg).
 * Ett anrop per ny uppsättning adresser, sparas i telefonen. Utan nät: optimeraren använder sin uppskattning.
 *
 * Lärande: RUTT jämför sin gissade körtid med den riktiga tiden mellan två av dina stopp
 * (Lastad/Lossad-tider i dagboken) och räknar ut din egen faktor (median, minst 5 resor).
 */
const URL0 = 'https://router.project-osrm.org/table/v1/driving/';
const MAX_POINTS = 40;
const pairs = new Map(); // "lat,lng|lat,lng" → {min, km}
let store = null; // {load, save} – sätts av appen
let lastCall = 0;
let factor = 1, samples = 0;

const ptCache = new WeakMap();
const pt = p => { if (p && typeof p === 'object') { const c = ptCache.get(p); if (c && c.lat === p.lat && c.lng === p.lng) return c.k; const k = `${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`; ptCache.set(p, {lat: p.lat, lng: p.lng, k}); return k; } return ''; };
const keyOf = (a, b) => pt(a) + '|' + pt(b);
const valid = p => p && p.lat != null && p.lng != null && isFinite(p.lat) && isFinite(p.lng);

function travel(a, b) {
  if (!valid(a) || !valid(b)) return null;
  if (pt(a) === pt(b)) return {min: 0, km: 0};
  return pairs.get(keyOf(a, b)) || null;
}

async function init(st) {
  store = st;
  try {
    const v = await store.load('rutt.travel.v1', null);
    if (v && v.p) for (const [k, x] of v.p) pairs.set(k, x);
  } catch (e) {}
}
function persist() {
  if (!store) return;
  const all = [...pairs.entries()];
  store.save('rutt.travel.v1', {p: all.slice(-6000)});
}

/* Ser till att körtider finns mellan alla punkterna. Returnerar true om något nytt hämtades. */
async function ensure(points, fetchImpl) {
  const uniq = [];
  const seen = new Set();
  for (const p of points) { if (!valid(p)) continue; const k = pt(p); if (!seen.has(k)) { seen.add(k); uniq.push({lat: Number(p.lat), lng: Number(p.lng)}); } }
  if (uniq.length < 2) return false;
  const missing = uniq.some(a => uniq.some(b => pt(a) !== pt(b) && !pairs.has(keyOf(a, b))));
  if (!missing) return false;
  const list = uniq.slice(0, MAX_POINTS);
  // Demoservern: högst ett anrop per sekund.
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCall = Date.now();
  const url = URL0 + list.map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';') + '?annotations=duration,distance';
  const f = fetchImpl || fetch;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const to = setTimeout(() => { try { ctrl && ctrl.abort(); } catch (e) {} }, 9000);
  try {
    const r = await f(url, {headers: {'User-Agent': 'RUTT/1 (forre.nu)'}, signal: ctrl ? ctrl.signal : undefined});
    const j = await r.json();
    if (!j || j.code !== 'Ok' || !j.durations) return false;
    for (let i = 0; i < list.length; i++) for (let k = 0; k < list.length; k++) {
      if (i === k) continue;
      const d = j.durations[i] && j.durations[i][k], m = j.distances && j.distances[i] && j.distances[i][k];
      if (d == null) continue;
      pairs.set(keyOf(list[i], list[k]), {min: d / 60, km: m != null ? m / 1000 : null});
    }
    persist();
    return true;
  } catch (e) {
    return false;
  } finally { clearTimeout(to); }
}

/*
 * Lär av riktiga tider. legs = [{from:{lat,lng}, to:{lat,lng}, actualMin, servMin}] – tid mellan två
 * händelser (Lastad/Lossad) minus tiden på första stället. predicted = vad RUTT hade gissat för körningen.
 */
function learn(legs, predict) {
  const r = [];
  for (const g of legs || []) {
    const pred = predict(g.from, g.to);
    if (!pred || pred < 4) continue;              // korta hopp säger inget
    const drive = g.actualMin - (g.servMin || 0);
    if (!(drive > 2) || g.actualMin > 180) continue; // rast/väntan/glömt trycka → räknas inte
    const q = drive / pred;
    if (q > 0.4 && q < 3) r.push(q);
  }
  samples = r.length;
  if (r.length < 5) { factor = 1; return {factor, samples}; }
  r.sort((a, b) => a - b);
  const med = r.length % 2 ? r[(r.length - 1) / 2] : (r[r.length / 2 - 1] + r[r.length / 2]) / 2;
  factor = Math.min(1.8, Math.max(0.6, med));
  return {factor, samples};
}
const getFactor = () => factor;
const learned = () => ({factor, samples});
const _reset = () => { pairs.clear(); factor = 1; samples = 0; lastCall = 0; };

module.exports = {travel, ensure, init, learn, getFactor, learned, _reset};

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
const _reset0 = () => { pairs.clear(); factor = 1; samples = 0; lastCall = 0; };

/*
 * Adresser utan koordinater (Opter skickar inte alltid lat/lng): slå upp gata + postnr + ort i
 * OpenStreetMaps adressök (Nominatim). Högst ett anrop per sekund, svaret sparas i telefonen – även "hittades inte".
 *  GET https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=se&street=…&postalcode=…&city=…
 */
const NOMI = 'https://nominatim.openstreetmap.org/search';
const geo = new Map(); // adressnyckel → {lat,lng} | {miss:true, at}
let lastGeo = 0;
const geoKey = s => [s.adr, s.zip, s.area].map(x => String(x || '').trim().toLowerCase().replace(/\s+/g, ' ')).join('|');
function geoOf(s) {
  if (!s) return null;
  const g = geo.get(geoKey(s));
  return g && !g.miss ? g : null;
}
// 3.58: EN kö i taget. Förut startade varje synk (var 30:e s) en ny uppslagning bredvid den gamla → två–tre anrop per
// sekund till kartan, som då spärrar en stund. Svaren blev fel och adresser stod som "hittas inte" fast de aldrig slogs upp.
let chain = Promise.resolve(0);
let blockedAt = 0, retryT = null;
// Kartan svarar inte (inget nät, eller spärrad en stund) → nytt försök om en minut, utan att vänta på nästa synk.
function retryLater(stops, fetchImpl) {
  if (retryT || typeof setTimeout !== 'function') return;
  retryT = setTimeout(() => { retryT = null; geocode(stops, fetchImpl).then(n => { if (n && onFound) try { onFound(); } catch (e) {} }); }, 60000);
  if (retryT && retryT.unref) retryT.unref();
}
const geoBlocked = () => blockedAt > 0;
let onFound = null;
function setOnFound(f) { onFound = f; }
function geocode(stops, fetchImpl) {
  const run = chain.then(() => geocodeRun(stops, fetchImpl), () => geocodeRun(stops, fetchImpl));
  chain = run.catch(() => 0);
  return run;
}
async function geocodeRun(stops, fetchImpl) {
  const f = fetchImpl || fetch;
  let found = 0;
  const todo = [];
  for (const s of stops || []) {
    if (!s || (s.lat != null && s.lng != null) || !(s.adr || s.zip)) continue;
    const k = geoKey(s); if (todo.some(x => geoKey(x) === k)) continue;
    const g = geo.get(k);
    if (g && (!g.miss || Date.now() - g.at < 7 * 86400000)) continue; // "hittades inte" provas igen efter en vecka
    todo.push(s);
  }
  for (const s of todo.slice(0, 80)) {
    // Exakt först. Hittas inte gatan (nybyggt, saknar husnummer, felstavat) → postnumret, sist orten – ungefärlig plats
    // är bättre än ingen: då blir körordningen ändå rimlig, och RUTT säger att platsen är ungefärlig.
    const zip = String(s.zip || '').replace(/\s/g, '');
    const tries = [
      [`street=${encodeURIComponent(s.adr || '')}&postalcode=${encodeURIComponent(zip)}&city=${encodeURIComponent(s.area || '')}`, null],
      [`q=${encodeURIComponent([s.adr, [String(s.zip || '').trim(), s.area].filter(Boolean).join(' ')].filter(Boolean).join(', '))}`, null],
      [`q=${encodeURIComponent([s.adr, s.area].filter(Boolean).join(', '))}`, null],
      // Husnumret saknas på kartan (vanligt) → gatan utan nummer: hamnar på rätt gata, nära nog
      ...(/\d/.test(String(s.adr || '')) ? [[`street=${encodeURIComponent(String(s.adr).replace(/\s*\d+\s*[A-Za-z]?(\s*-\s*\d+)?\s*$/, ''))}&city=${encodeURIComponent(s.area || '')}`, 'gata']] : []),
      ...(zip ? [[`postalcode=${encodeURIComponent(zip)}`, 'postnr']] : []),
      ...(s.area ? [[`city=${encodeURIComponent(s.area)}`, 'ort']] : []),
    ].filter((t) => s.adr || t[1] === 'postnr' || t[1] === 'ort'); // utan gata: bara postnummer/ort
    let hit = null, broken = false;
    for (const [qs, approx] of tries) {
      let j = null;
      for (let attempt = 0; attempt < 2 && j === null; attempt++) {
        const wait = lastGeo + (attempt ? 4000 : 1100) - Date.now();
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        lastGeo = Date.now();
        try {
          const r = await f(`${NOMI}?format=jsonv2&limit=1&countrycodes=se&${qs}`, {headers: {'User-Agent': 'RUTT/1 (forre.nu)', 'Accept-Language': 'sv'}});
          if (r && r.ok === false) throw new Error('http ' + r.status); // spärrad/överbelastad – inte "finns inte"
          const v = await r.json();
          j = Array.isArray(v) ? v : [];
        } catch (e) { j = null; }
      }
      if (j === null) { broken = true; break; } // inget nät eller spärrat → inget sparas, provas nästa gång
      // Kartan svarar ibland med GATAN när husnumret saknas där (Paradistorget 4 → gatans mitt = nr 2). Det är ungefärligt, inte exakt.
      const streetOnly = !approx && /\d/.test(String(s.adr || '')) && j[0] && (j[0].category === 'highway' || /^(road|street|residential)$/.test(String(j[0].addresstype || '')));
      const ap = approx || (streetOnly ? 'gata' : null);
      if (j[0] && j[0].lat) { hit = {lat: Number(j[0].lat), lng: Number(j[0].lon), v: 4, ...(ap ? {approx: ap} : {})}; break; }
    }
    if (broken) { blockedAt = Date.now(); retryLater(stops, fetchImpl); break; }
    blockedAt = 0;
    geo.set(geoKey(s), hit || {miss: true, at: Date.now(), v3: true});
    if (hit) { found++; if (onFound) try { onFound(); } catch (e) {} }
  }
  if (todo.length && store) store.save('rutt.geo.v1', [...geo.entries()].slice(-3000));
  return found;
}
// Läget för en adress: 'ok' (Opter eller kartan), 'approx' (gata/postnr/ort), 'pending' (inte uppslagen än), 'miss' (finns inte ens orten).
function geoState(s) {
  if (!s) return 'miss';
  if (s.lat != null && s.lng != null && !s.geo) return 'ok';
  const g = geo.get(geoKey(s));
  if (!g) return 'pending';
  if (g.miss) return 'miss';
  return g.approx ? 'approx' : 'ok';
}
// "Hittades inte" från före 3.53 provas igen direkt (nu finns reserv på postnummer/ort).
// v4: gatuträffar räknas som ungefärliga – äldre sparade träffar slås upp igen.
async function initGeo() { if (!store) return; try { const v = await store.load('rutt.geo.v1', null); if (Array.isArray(v)) for (const [k, x] of v) if (x && (x.miss ? x.v3 : x.v === 4)) geo.set(k, x); } catch (e) {} }
// Stoppen med koordinater ifyllda där Opter saknade dem. geo:true = uppslagen adress.
const withGeo = stops => (stops || []).map(s => { if (!s || (s.lat != null && s.lng != null)) return s; const g = geoOf(s); return g ? {...s, lat: g.lat, lng: g.lng, geo: true, ...(g.approx ? {geoApprox: g.approx} : {})} : s; });

module.exports = {travel, ensure, init, learn, getFactor, learned, geocode, initGeo, withGeo, geoState, setOnFound, geoBlocked, _reset: () => { _reset0(); geo.clear(); lastGeo = 0; chain = Promise.resolve(0); blockedAt = 0; if (retryT) clearTimeout(retryT); retryT = null; }};

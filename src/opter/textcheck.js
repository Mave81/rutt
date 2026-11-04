'use strict';
/*
 * 3.65: RUTT läser texten i ordern och säger till när den inte stämmer med Opters fält.
 *  - placesIn(): texten nämner en annan ort än orderns hämt-/lämningsort ("1 pall i Västberga sen en i Haninge")
 *    → RUTT frågar om något ska hämtas där, och lägger in det som ett eget stopp.
 *  - houseMismatch(): texten säger ett annat husnummer på samma gata ("Källängsvägen 10" när Opter säger 5).
 * Bara orter i Stockholmsområdet och närliggande, så vanliga ord aldrig blir en "ort".
 */
const PLACES = [
  'Akalla', 'Alby', 'Arlanda', 'Arninge', 'Barkarby', 'Bandhagen', 'Bollmora', 'Botkyrka', 'Brandbergen', 'Bromma', 'Bålsta', 'Danderyd',
  'Ekerö', 'Enskede', 'Enköping', 'Farsta', 'Fittja', 'Flemingsberg', 'Globen', 'Gnesta', 'Gubbängen', 'Gustavsberg', 'Hallunda', 'Hammarby',
  'Handen', 'Haninge', 'Hägersten', 'Hässelby', 'Högdalen', 'Hölö', 'Huddinge', 'Häggvik', 'Jakobsberg', 'Johanneshov', 'Jordbro', 'Järfälla',
  'Järna', 'Kallhäll', 'Kista', 'Kungens kurva', 'Kungsholmen', 'Kungsängen', 'Liljeholmen', 'Lidingö', 'Länna', 'Märsta', 'Nacka', 'Norrtälje',
  'Norsborg', 'Nykvarn', 'Nynäshamn', 'Rinkeby', 'Rosersberg', 'Rotebro', 'Rönninge', 'Saltsjöbaden', 'Salem', 'Segeltorp', 'Sickla', 'Sigtuna',
  'Skogås', 'Skärholmen', 'Sköndal', 'Sollentuna', 'Solna', 'Spånga', 'Stenhamra', 'Sundbyberg', 'Södermalm', 'Södertälje', 'Tensta', 'Trångsund',
  'Tullinge', 'Tumba', 'Tyresö', 'Täby', 'Ulvsunda', 'Upplands Väsby', 'Upplands-Bro', 'Uppsala', 'Vallentuna', 'Vårby', 'Vällingby', 'Värmdö',
  'Västberga', 'Västerhaninge', 'Västerås', 'Åkersberga', 'Älvsjö', 'Årsta', 'Östermalm', 'Kungens Kurva', 'Bredäng', 'Mälarhöjden', 'Fruängen',
  'Västertorp', 'Sätra', 'Skarpnäck', 'Hagsätra', 'Rågsved', 'Kärrtorp', 'Björkhagen', 'Nackademin', 'Orminge', 'Fisksätra', 'Kungsör', 'Strängnäs',
];
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
// Samma område? (Västberga ligger i Hägersten, Kungens kurva i Segeltorp/Huddinge m.m.)
const SAME = [['vastberga', 'hagersten'], ['kungens kurva', 'segeltorp', 'huddinge'], ['handen', 'haninge'], ['jordbro', 'haninge'], ['tumba', 'botkyrka'], ['alby', 'botkyrka'],
  ['hallunda', 'botkyrka'], ['norsborg', 'botkyrka'], ['flemingsberg', 'huddinge'], ['ulvsunda', 'bromma'], ['barkarby', 'jarfalla'], ['jakobsberg', 'jarfalla'], ['kista', 'spanga'],
  ['sickla', 'nacka'], ['globen', 'johanneshov'], ['arsta', 'johanneshov']];
const sameArea = (a, b) => a === b || SAME.some(g => g.includes(a) && g.includes(b));
const placeOf = st => (st ? [st.area, st.adr, st.who, st.zipArea].map(norm).join(' ') : '');

// Orter i texten som inte är orderns egna (och inte samma område). Ger [{place, hint}] – hint = en bit av texten runt.
function placesIn(text, pick, drop) {
  const t = String(text || ''); if (!t.trim()) return [];
  const nt = ' ' + norm(t) + ' ';
  const own = [placeOf(pick), placeOf(drop)].join(' ');
  const ownAreas = [pick && pick.area, drop && drop.area].map(norm).filter(Boolean);
  const out = [];
  for (const p of PLACES) {
    const np = norm(p);
    if (!nt.includes(' ' + np + ' ')) continue;
    if ((' ' + own + ' ').includes(' ' + np + ' ')) continue;
    if (ownAreas.some(a => sameArea(a, np))) continue;
    if (out.some(x => norm(x.place) === np)) continue;
    // Bara när texten pratar om gods eller en hämtning nära orten – inte "kör via Haninge".
    const i = nt.indexOf(' ' + np + ' ');
    const near = nt.slice(Math.max(0, i - 60), i + np.length + 40);
    if (!/\b(pall|pallar|kolli|kli|kartong|bunt|st|hamta|hamtas|hamtning|lasta|lastas|sen|ocksa|aven|plus|stallen|en|ett|tva|1|2|3)\b/.test(near)) continue;
    const ri = t.toLowerCase().indexOf(p.toLowerCase());
    out.push({place: p, hint: t.slice(Math.max(0, ri - 40), ri + p.length + 20).trim()});
  }
  return out;
}
// "två ställen" / "2 ställen" / "hämtas på två adresser" utan att orten står.
const twoPlaces = text => /\b(tv[aå]|2)\s+(st[aä]llen|adresser|h[aä]mtst[aä]llen)\b/i.test(String(text || ''));

// Annat husnummer på samma gata i texten än i Opters adress.
function houseMismatch(text, st) {
  if (!st || !st.adr) return null;
  const m = String(st.adr).match(/^\s*([^\d,]+?)\s*(\d+)\s*([A-Za-z])?\b/);
  if (!m) return null;
  const street = m[1].trim(), no = (m[2] + (m[3] || '')).toLowerCase();
  const esc = street.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(esc + '\\s*(\\d+)\\s*([A-Za-z])?\\b', 'ig');
  let x;
  while ((x = re.exec(String(text || '')))) {
    const tno = (x[1] + (x[2] && !/^(st|kg|kli)$/i.test(x[2]) ? x[2] : '')).toLowerCase();
    if (tno !== no && tno.replace(/[a-z]$/, '') !== no.replace(/[a-z]$/, '')) return {street, textNo: x[1] + (x[2] || ''), opterNo: m[2] + (m[3] || '')};
  }
  return null;
}
module.exports = {placesIn, twoPlaces, houseMismatch, PLACES};

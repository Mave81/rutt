'use strict';
/*
 * Sedel → jobb. Läser texten som telefonen hittat i en bild eller PDF-sida (rader med rutor) och plockar fram
 * Hämta / Lämna / kontakt / gods / referenser. Känner igen:
 *  - Inomec hämtsedel ("Account Collection Note"): hämta hos kunden (LEVERANSADRESS), lämna på Inomecs depå.
 *  - Inomec följesedel: hämta på Inomecs depå, lämna på Leveransadress. Leveranssätt annat än Transportpunkten = inte din.
 *  - Uppdrag ur Opter/Cramo (skärmbild): första adressen = hämtning, andra = leverans.
 *  - Allt annat: adresserna som hittas, du väljer.
 * Allt är förslag – det som är osäkert markeras (sure:false) så du får kolla det innan det blir stopp.
 */
const {tidspass, extractPhones} = require('./opter/protocol');

// Inomecs depå, som den står på sedlarna (sidfot och Depot-rutan).
const INOMEC_DEPOT = {name: 'Inomec Stockholm Västberga', adr: 'Västberga Allé 60', zip: '126 30', area: 'Hägersten', tel: '08-531 860 45', sure: true};

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9/ .:,+-]/g, '').replace(/\s+/g, ' ').trim();
function lev(a, b) {
  if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
  let p = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const c = [i];
    for (let j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    p = c;
  }
  return p[b.length];
}
// Rad som börjar med (ungefär) etiketten. OCR läser ofta fel på en bokstav eller två ("Loveransadress").
function isLabel(line, label, tol) {
  const t = norm(line).replace(/[:.]$/, ''), l = norm(label);
  if (!t) return false;
  const head = t.slice(0, l.length);
  const d = lev(head, l);
  return d <= (tol != null ? tol : Math.max(1, Math.floor(l.length / 5)));
}
const PHONE_RE = /(?:\+46|0046|\b0)\s*\d[\d \-]{6,12}\d/;
const DATE_RE = /\b(20\d\d)-(\d\d)-(\d\d)\b|\b(\d\d)-(\d\d)-(20\d\d)\b/;
const ZIP_RE = /\b(\d{3})\s?(\d{2})\b/;
const STREET_RE = /([A-Za-zÅÄÖåäöéÉüÜ][A-Za-zÅÄÖåäöéÉüÜ.\- ]{1,40}?)\s+(\d{1,4}[A-Za-z]?(?:\s*-\s*\d{1,4})?)\b/;
const tidy = s => String(s || '').replace(/\s+/g, ' ').replace(/^[^A-Za-zÅÄÖåäö0-9]+/, '').trim();
const ymd = m => (m ? (m[1] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[6]}-${m[5]}-${m[4]}`) : null);
const prettyTel = s => String(s || '').replace(/[^\d+]/g, '');

function prep(ocr) {
  const W = (ocr && ocr.w) || 1000;
  const L = ((ocr && ocr.lines) || []).filter(l => l && String(l.t || '').trim()).map(l => ({...l, t: String(l.t).trim(), n: norm(l.t)}));
  L.sort((a, b) => (Math.abs(a.y - b.y) < Math.max(a.h, b.h) * 0.5 ? a.x - b.x : a.y - b.y));
  const lh = L.length ? L.map(l => l.h).sort((a, b) => a - b)[Math.floor(L.length / 2)] : 20;
  return {W, L, lh};
}
// Raderna under en etikett i samma kolumn, tills det blir ett glapp eller en ny etikett.
function below(P, lab, {max = 6, stop = [], tolX} = {}) {
  const out = []; let lastY = lab.y + lab.h;
  const tx = tolX != null ? tolX : P.W * 0.08;
  for (const l of P.L) {
    if (l === lab || l.y <= lab.y + lab.h * 0.5) continue;
    if (Math.abs(l.x - lab.x) > tx) continue;
    if (l.y - lastY > P.lh * 2.6) break;
    if (stop.some(s => isLabel(l.t, s))) break;
    out.push(l); lastY = l.y + l.h;
    if (out.length >= max) break;
  }
  return out;
}
// Första raden under etiketten i samma kolumn (även om OCR lagt den nästan i höjd med etiketten).
function valueBelow(P, lab) {
  if (!lab) return null;
  const c = P.L.filter(l => l !== lab && l.y >= lab.y - 2 && l.y < lab.y + lab.h + P.lh * 3 && Math.abs(l.x - lab.x) < P.W * 0.06 && l.h >= lab.h * 0.8 || (l !== lab && l.y > lab.y + 1 && l.y < lab.y + lab.h + P.lh * 3 && Math.abs(l.x - lab.x) < P.W * 0.06)).sort((a, b) => a.y - b.y);
  return c[0] || null;
}
const findLabel = (P, label, tol, from) => P.L.find(l => (!from || l.y > from.y) && isLabel(l.t, label, tol)) || null;
// Värdet till höger om eller under en etikett ("Kundens Ordernr: 648785-4090").
function valueOf(P, label, tol) {
  const lab = findLabel(P, label, tol); if (!lab) return null;
  const rest = lab.t.replace(/^[^:]*:\s*/, '');
  if (rest && rest !== lab.t) return rest.trim();
  const right = P.L.find(l => l !== lab && Math.abs(l.y - lab.y) < P.lh * 0.7 && l.x > lab.x + lab.w);
  if (right) return right.t;
  const dn = below(P, lab, {max: 1}); return dn[0] ? dn[0].t : null;
}

// En adress ur några rader: namn, gata, postnr + ort, telefon, kontakt.
function addressFrom(lines, {nameFirst = true} = {}) {
  const a = {name: '', adr: '', zip: '', area: '', tel: '', contact: '', note: '', sure: false};
  const rest = [];
  for (const raw of lines) {
    let t = tidy(raw.t || raw);
    if (!t) continue;
    const ph = t.match(PHONE_RE);
    if (ph && prettyTel(ph[0]).length >= 8) { if (!a.tel) a.tel = ph[0].trim(); t = tidy(t.replace(ph[0], ' ')); }
    const kn = t.match(/kontakt(?:namn)?\s*:?\s*(.+)$/i); if (kn) { a.contact = tidy(kn[1]); continue; }
    if (!t || /^(lev\s*)?(kontakt|telefon|telefonnr)\b/i.test(t)) continue;
    rest.push(t);
  }
  for (let t of rest) {
    t = t.replace(/^(?:[A-Za-z¥]{1,2})\s+(?=[A-ZÅÄÖ][a-zåäöé]+\S*\s+\d)/, ''); // GPS-pilen läses som "W" eller "¥"
    // "Vretensborgsvägen 13, 12630 Hägersten" eller "Ström 111 - 114, Rosersberg"
    const parts = t.split(/\s*,\s*/);
    const zipOnly = /^\d{3}\s?\d{2}$/.test(t);
    const zipCity = t.match(/^(\d{3}\s?\d{2})\s+([A-Za-zÅÄÖåäöé][\wÅÄÖåäöé .\-]*)$/);
    if (zipCity) { a.zip = a.zip || zipCity[1]; a.area = a.area || city(zipCity[2]); continue; }
    if (zipOnly) { a.zip = a.zip || t; continue; }
    const st = !a.adr && parts[0].match(STREET_RE);
    if (st && (a.name || !nameFirst) && !/^box\b/i.test(parts[0])) {
      a.adr = tidy(parts[0]);
      for (const p of parts.slice(1)) {
        const zc = p.match(/^(\d{3}\s?\d{2})\s*(.*)$/);
        if (zc) { a.zip = zc[1]; if (zc[2]) a.area = city(zc[2]); } else if (!a.area && /^[A-ZÅÄÖa-zåäö]/.test(p)) a.area = tidy(p);
      }
      continue;
    }
    if (!a.name) { a.name = t; continue; }
    if (!a.adr && !a.note) a.note = t; // t.ex. "Gallerian Ring Jeppe"
  }
  // "Gallerian Ring Jeppe" = plats + "ring Jeppe" – ingen gata. Platsen blir adress, men osäker.
  if (!a.adr && a.note) {
    const m = a.note.match(/^(.*?)\s+ring\s+(.+)$/i);
    a.adr = tidy(m ? m[1] : a.note);
    if (m) a.note = 'Ring ' + tidy(m[2]); else a.note = '';
  }
  a.sure = !!(a.adr && STREET_RE.test(a.adr) && (a.zip || a.area));
  if (!a.area && a.zip && /^1\d\d/.test(a.zip.replace(/\s/g, ''))) a.area = 'Stockholm';
  return a;
}
// "Bollnäs Dönje Kraftverk – Google Maps" → "Bollnäs"
function city(s) { const t = tidy(String(s || '').split(/\s[–—-]\s/)[0]); const w = t.split(' '); return w.length > 2 ? w[0] : t; }
const fmtZip = z => { const d = String(z || '').replace(/\D/g, ''); return d.length === 5 ? d.slice(0, 3) + ' ' + d.slice(3) : String(z || ''); };

function inomecHamt(P, name) {
  const lab = findLabel(P, 'LEVERANSADRESS', 2);
  const blk = lab ? below(P, lab, {max: 7, stop: ['FLOTTA', 'Telefonnr', 'BESKRIVNING']}) : [];
  const kn = valueOf(P, 'Lev Kontaktnamn', 3);
  const pick = addressFrom(blk);
  if (kn && !pick.contact) pick.contact = tidy(kn);
  // Gods: raderna under BESKRIVNING (en rad per sak; "ej debiterad" hör till raden ovan).
  const fl = findLabel(P, 'FLOTTA', 2);
  const h = P.L.find(l => isLabel(l.t, 'BESKRIVNING', 2) && (!fl || Math.abs(l.y - fl.y) < P.lh * 1.5)) || null;
  const goods = [];
  if (h) {
    for (const l of P.L) {
      if (l.y <= h.y + h.h * 0.5 || Math.abs(l.x - h.x) > P.W * 0.05) continue;
      if (/^(artikel|signatur|namnf)/i.test(l.n)) break;
      if (/^debiterad$/i.test(l.n) && goods.length) continue;
      if (l.y - h.y > P.lh * 30) break;
      goods.push(tidy(l.t.replace(/,?\s*ej\s*$/i, '').replace(/,?\s*ej debiterad\s*$/i, '')));
    }
  }
  const fleet = P.L.filter(l => /^\d{7}$/.test(l.n) && h && l.y > h.y).map(l => l.n);
  return {
    kind: 'inomec-hamt', title: 'Inomec hämtsedel', from: 'Inomec',
    ref: (P.L.map(l => l.t.match(/\b0\d-\d{6}\b/)).find(Boolean) || [])[0] || (String(name || '').match(/\b0\d-\d{6}\b/) || [])[0] || '',
    orderNo: valueOf(P, 'Kundens Ordernr', 3), date: ymd((valueOf(P, 'Meddelat datum', 3) || '').match(DATE_RE)),
    pick, drop: {...INOMEC_DEPOT}, goods: group(goods), fleet, note: '',
    sign: true, // kunden kvitterar på sedeln (Signatur, Namnförtydligande, Datum, Tid, Hämtad av)
  };
}
function inomecFolj(P) {
  const lab = findLabel(P, 'Leveransadress', 3);
  const drop = addressFrom(lab ? below(P, lab, {max: 6, stop: ['Leveransvillkor', 'Adress']}) : []);
  const val = l => { const v = valueBelow(P, l); return v ? v.t : ''; };
  const via = val(findLabel(P, 'Leveranssätt', 3));
  const ref = val(findLabel(P, 'Er referens', 2));
  const ldate = ymd(val(findLabel(P, 'Leveransdatum', 3)).match(DATE_RE));
  const mark = val(P.L.find(x => /^mark/.test(x.n) && x.n.length < 18));
  const avtal = (P.L.map(l => l.t.match(/\b0\d-\d{6}\b/)).find(Boolean) || [])[0] || '';
  // Gods: raderna under rubriken Benämning som börjar med ett antal. Frakt räknas inte.
  const hd = P.L.find(l => /(^|\s)ant(\s|$)|ben[a-z]{0,2}mning/.test(l.n));
  const stopAt = P.L.find(l => /^vi har depa|^handhavande/.test(l.n));
  const goods = [];
  if (hd) for (const l of P.L) {
    if (l.y <= hd.y + hd.h * 0.5 || (stopAt && l.y >= stopAt.y)) continue;
    if (l.x < hd.x - P.W * 0.03) continue; // artikelnummer-kolumnen
    if (DATE_RE.test(l.t) && l.t.replace(DATE_RE, '').trim().length < 3) continue;
    const m = l.t.replace(DATE_RE, '').trim().match(/^(\d{1,3})\.?\s+(.+)$/);
    if (m) { if (!/^frakt/i.test(norm(m[2]))) goods.push([Number(m[1]), tidy(m[2]).replace(/,\s*$/, '')]); }
  }
  // Samma sak flera rader (4 slangar) → en rad med antal.
  const gm = new Map(); for (const [n, t] of goods) { const k = norm(t); const g = gm.get(k); if (g) g[0] += n; else gm.set(k, [n, t]); }
  const goodsOut = [...gm.values()].map(([n, t]) => `${n} × ${t}`);
  const mine = !via || /transpor/i.test(norm(via));
  return {kind: 'inomec-folj', title: 'Inomec följesedel', from: 'Inomec', ref: avtal, orderNo: mark, date: ldate, contactRef: ref, via,
    pick: {...INOMEC_DEPOT}, drop, goods: goodsOut, notMine: mine ? '' : via, note: ''};
}
function opterShot(P) {
  // Adressrader: "Gata 13, 12630 Ort" (med eller utan postnr).
  const adrs = P.L.filter(l => { const p = l.t.split(','); return p.length >= 2 && STREET_RE.test(p[0]) && /[A-Za-zÅÄÖåäö]{3}/.test(p[p.length - 1]); });
  const take = (al, nextY) => {
    const idx = P.L.indexOf(al);
    const nameL = [...P.L.slice(0, idx)].reverse().find(l => l.y < al.y - P.lh * 0.3 && Math.abs(l.x - al.x) < P.W * 0.08 && !/^(kontakt|status|portkod)/.test(l.n));
    const a = addressFrom([{t: (nameL ? nameL.t : '')}, {t: al.t.replace(/^[^A-Za-zÅÄÖåäö0-9]+\s*/, '')}]);
    if (nameL) a.name = tidy(nameL.t.replace(/\s+(hamtning|leverans|mening|lial|kund)\b.*$/i, '').replace(/[“”"*]+/g, ''));
    // Kontakt och portkod mellan den här adressen och nästa.
    const zone = P.L.filter(l => l.y > al.y && l.y < nextY);
    for (const l of zone) { const ph = l.t.match(PHONE_RE); if (ph && !a.tel) a.tel = ph[0].trim(); }
    const pk = zone.find(l => /portkod/.test(l.n));
    if (pk) {
      const v = zone.find(l => l.y > pk.y && Math.abs(l.y - pk.y) < P.lh * 4 && !PHONE_RE.test(l.t) && l.x > pk.x - P.W * 0.05)
        || zone.find(l => l.y > pk.y && Math.abs(l.y - pk.y) < P.lh * 4 && PHONE_RE.test(l.t) && l.t.replace(PHONE_RE, '').trim());
      if (v) a.code = tidy(v.t.replace(PHONE_RE, ''));
    }
    a.sure = !!(a.adr && (a.zip || a.area));
    return a;
  };
  const pickL = adrs[0], dropL = adrs[1];
  const pick = pickL ? take(pickL, dropL ? dropL.y - P.lh : 1e9) : null;
  const kundL = P.L.find(l => /^kund$/.test(l.n));
  const drop = dropL ? take(dropL, kundL ? kundL.y : 1e9) : null;
  // Meddelanden från trafikledningen (allt ovanför första adressens namn).
  const topY = pickL ? pickL.y - P.lh * 3 : 0;
 const msg = P.L.filter(l => l.y < topY && !/[<>]/.test(l.t) && !(/^[a-zåäö]{1,7}$/.test(l.t.trim())) && !/^(forarmeddelande|ext\. meddelande|ext meddelande|bekraftad|meddelad|status|fran trafikledningen)/.test(l.n) && l.t.length > 3 && !/^[\W\d\s]+$/.test(l.t) && !/^(se |o a)/.test(l.n))
    .map(l => l.t.replace(/\s*(fran trafikledningen|från trafikledningen)\s*}?\s*$/i, '').replace(/\s*status$/i, '')).filter(t => t.trim().length > 3);
  const proj = (P.L.find(l => /projektnr/.test(l.n)) || {t: ''}).t.replace(/projektnr/i, '').replace(/\s/g, '');
  const mark = (msg.join('\n').match(/m[aä]rk ordern med\s+([\d][\d\- ]*\d)/i) || [])[1];
  const date = ymd((P.L.find(l => DATE_RE.test(l.t) && (!dropL || l.y > dropL.y)) || {t: ''}).t.match(DATE_RE));
  const tj = (P.L.find(l => /^tjanst\b/.test(l.n)) || {t: ''}).t.replace(/^tj[aä]nst\s*/i, '');
  const cramo = !!(pick && /cramo/i.test(pick.name));
  return {kind: 'opter', title: cramo ? 'Cramo-uppdrag' : 'Uppdrag', from: cramo ? 'Cramo' : '', ref: proj, orderNo: mark ? tidy(mark) : '', date, service: tj,
    pick: pick || emptyA(), drop: drop || emptyA(), goods: [], note: msg.join('\n'), tidspass: tidspass([tj], msg)};
}

/* ---- Bevego turleveranslista (en sida per kund, "Leveransnummer 64499 Älvsjö - Måndag Norrtälje", tur 050_01_A4) ----
 * Hämtas på Bevego Älvsjö (Opter-ordern säger bara "Distribution"). Sidan har kundens namn, kontakt, telefon, adress,
 * kollin (18-siffrigt kollinummer, typ, märkning, ordernr, vikt) och artiklar. Läses med regler på hela texten, inte rutornas
 * läge – telefonens OCR och kameran lägger ibland två kolumner på samma rad. */
const BEVEGO_ALVSJO = {name: 'Bevego Älvsjö', adr: 'Konsumentvägen 17', zip: '125 30', area: 'Älvsjö', tel: '', contact: '', note: '', sure: true};
const KTYPES = 'KLOVE|PALL|EUR-PALL|KARTONG|ST[AÄ]LL|PAKET|RULLE|BUNT|L[AÅ]DA|BOX|S[AÄ]CK|HINK|FAT';
const STREETW = '(?:V[AÄ]GEN|GATAN|GR[AÄ]ND|ALL[EÉ]N?|PLAN|STIGEN|TORG(?:ET)?|BACKEN|LEDEN|V[AÄ]G|GATA|SV[AÄ]NGEN|BRINKEN|RINGEN|SLINGAN|LIDEN|H[OÖ]JDEN|PARKEN|STRAND(?:EN)?|KAJEN|BRON|PLATSEN|G[AÅ]NGEN|HAMNEN|V[AÄ]GEN)';
// "ÄNGSVÄGEN 13" → "Ängsvägen 13", "TÄBY PLÅTTEKNIK AB" → "Täby Plåtteknik AB"
const titleCase = s => String(s || '').toLowerCase().replace(/(^|[\s\-\/])([a-zåäöé])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(Ab|Hb|Kb|Ek)\b/g, x => x.toUpperCase());
function bevegoTur(P) {
  const lines = P.L.map(l => l.t);
  const txt = lines.join('\n');
  const up = txt.normalize('NFC');
  // Leveransnummer + namn på turen ("64499 Älvsjö - Måndag Norrtälje")
  const lev = up.match(/\b(\d{5})\s+([A-ZÅÄÖ][a-zåäöé0-9]+\s*-\s*[A-ZÅÄÖ][a-zåäöé]+(?:\s+[A-ZÅÄÖ][a-zåäöé]+)?)/);
  const tur = (up.match(/\b\d{3}_\d{2}_[A-Z0-9]{2}\b/) || [''])[0];
  const dates = [...up.matchAll(/\b(\d\d)-(\d\d)-(\d\d)\b/g)].map(m => `20${m[1]}-${m[2]}-${m[3]}`).filter(d => /^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d)).sort();
  const date = dates.length ? dates[dates.length - 1] : null; // Avs.datum (utskriften är tidigare)
  // Kunden: namn som slutar på AB/HB/KB/Aktiebolag (versaler).
  const nm = up.match(/\b([A-ZÅÄÖ](?:[A-ZÅÄÖ0-9&.\-]|\s(?=[A-ZÅÄÖ0-9&]))*?\s(?:AB|HB|KB|AKTIEBOLAG))\b/);
  // Adress: gata med vägord + nummer, sen postnr + ort (sista förekomsten före kollilistan).
  const head = up.split(/kol+[il]nummer|kollityp/i)[0] || up;
  const stM = [...head.matchAll(new RegExp('([A-ZÅÄÖ][A-ZÅÄÖa-zåäöé\\-]*' + STREETW + ')\\s+(\\d{1,4}\\s?[A-Z]?)\\b', 'gi'))].pop();
  const zipM = [...head.matchAll(/\b(1\d{2}|[2-9]\d{2})\s?(\d{2})\s+([A-ZÅÄÖ][A-ZÅÄÖ\-]{2,})\b/g)].pop();
  // Kontakt: förnamn + telefon ("Richard 072-092 59 65 08510 140 20", "Fredrik" på raden över "070-429 07 45")
  const PH = /(?:\+46|\b0)[\d][\d\s\-]{6,13}\d/;
  let contact = '', tels = [];
  const pm = head.match(/(?:\+46|\b0)\d[\d \t\-]{6,30}\d/);
  if (pm) {
    tels = splitTels(pm[0]);
    // Kontakten = sista förnamnet (Versal + gemener) före numret, inom raden eller raden över.
    const back = head.slice(Math.max(0, pm.index - 70), pm.index);
    const ws = [...back.matchAll(/\b([A-ZÅÄÖ][a-zåäöé]{2,})\b/g)].map(m => m[1]).filter(w => !/^(Leveransnummer|Kund|Dest|Tur|Sverige|Avs|Sida|Utskr|M[aå]ndag|Tisdag|Onsdag|Torsdag|Fredag|Norrt[aä]lje|[AÄ]lvsj[oö])$/i.test(w));
    const tourW = (lev ? lev[2] : 'Älvsjö Måndag Norrtälje').toLowerCase().split(/[^a-zåäöé0-9]+/).filter(Boolean).map(w => w.slice(0, 4));
    const ok = ws.filter(w => !tourW.includes(w.toLowerCase().slice(0, 4)));
    if (ok.length) contact = ok[ok.length - 1];
  }
  const avis = (up.match(/avisering\s*:?\s*((?:\+46|0)[\d\s\-]{7,12}\d)/i) || [])[1];
  const note = ((head.match(/\bK[ÖO]RES\b[^\n]*/i) || [])[0] || '').trim();
  // Kollin: "311111109005533574 KLOVE nya lagret 30212995 300,00000". Kolumnerna kan komma som egna rader –
  // allt på samma höjd som kollinumret (bilden kan luta lite) hör till raden. Bara tabellen överst (före "Antal kollin").
  const kolli = [];
  const antal = P.L.find(l => /antal kol|al kollin/.test(l.n));
  const KN = /\b(3\d{5})\s?(\d{12})\b/;
  for (const k of P.L) {
    const km = k.t.match(KN); if (!km) continue;
    if (antal && k.y > antal.y) continue;
    const band = P.L.filter(l => l !== k && Math.abs(l.y - k.y) < Math.max(k.h, P.lh) * 0.9 && l.x > k.x && !KN.test(l.t)).sort((a2, b2) => a2.x - b2.x);
    const row = [k.t.slice(k.t.indexOf(km[0]) + km[0].length), ...band.map(l => l.t)].join(' ');
    const t = row.toUpperCase().match(new RegExp('\\b(' + KTYPES + ')\\b'));
    const ord = (row.match(/\b(30\d{6})\b/) || [])[1] || '';
    const kg = (row.match(/\b(\d{1,5}),(\d{3,5})\b/) || [])[0] || '';
    const after = t ? row.slice(row.toUpperCase().indexOf(t[1]) + t[1].length) : '';
    const mark = after.replace(/\b30\d{6}\b.*$/, '').replace(/\b\d{1,5},\d+\b.*$/, '').replace(/[^A-Za-zÅÄÖåäö0-9\- ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
    kolli.push({no: km[1] + km[2], type: t ? t[1].replace('STALL', 'STÄLL') : '', mark, order: ord, kg: kg ? Number(kg.replace(',', '.')) : 0});
  }
  const orders = [...new Set([...kolli.map(k => k.order).filter(Boolean), ...[...up.matchAll(/\b(30\d{6})\b/g)].map(m => m[1])])];
  const counts = {}; kolli.forEach(k => { const t = k.type || 'KOLLI'; counts[t] = (counts[t] || 0) + 1; });
  // Artiklar: beskrivningsraderna (versaler, mått), inte emballage, kollinummer, adress eller anteckning.
  const goods = [];
  const artH = P.L.find(l => /^artikel|ordernummer/.test(l.n));
  for (const l of P.L) {
    if (artH && l.y < artH.y) continue;
    const t = l.t.trim();
    const letters = t.replace(/[^A-Za-zÅÄÖåäö]/g, ''), uppers = t.replace(/[^A-ZÅÄÖ]/g, '');
    if (letters.length < 8 || uppers.length / letters.length < 0.8) continue;
    if (/\d{9,}/.test(t) || /\b\d{3}\s?\d{2}\s+[A-ZÅÄÖ]{3,}/.test(t) || /^(KVM|KG|ST|MM)\b/i.test(t) || /K[OÖ]RES/i.test(t)) continue;
    if (/\b(TURLEVERANS|LEVERANSNUMMER|KOLLINUMMER|ANTAL KOLLIN|SVERIGE|ORDERNUMMER|ARTIKEL|KVANTITET)\b/i.test(t)) continue;
    if (/^(PALL KLOVE|EUR-?PALL|PALL\b)/i.test(t)) continue;
    if ((t.match(/[A-Za-zÅÄÖåäö]{3,}/g) || []).length < 2) continue;
    goods.push(titleCase(t).replace(/(\d+)x(\d+)/gi, '$1×$2').replace(/(\d)x(\d)/gi, '$1×$2').replace(/\bMm\b/g, 'mm'));
  }
  const drop = {
    name: nm ? titleCase(nm[1].replace(/\s+/g, ' ')) : '',
    adr: stM ? titleCase(stM[1]) + ' ' + stM[2].replace(/\s/g, '') : '',
    zip: zipM ? `${zipM[1]} ${zipM[2]}` : '',
    area: zipM ? titleCase(zipM[3]) : '',
    tel: tels[0] || '', tel2: tels[1] || '', contact, code: '', note: [note ? titleCase(note).replace(/^Köres/i, 'Köres') : '', avis ? `Avisering ${avis.replace(/\s/g, '')}` : ''].filter(Boolean).join(' · '), sure: false,
  };
  drop.sure = !!(drop.name && drop.adr && drop.zip);
  const cnt = Object.entries(counts).map(([t, n]) => `${n} ${titleCase(t).toLowerCase()}`);
  return {kind: 'bevego-tur', title: 'Bevego turleveranslista', from: 'Bevego', ref: lev ? lev[1] : '', tour: lev ? `${lev[1]} ${lev[2]}`.trim() : '', tur, orderNo: orders.join(', '), orders, date,
    pick: {...BEVEGO_ALVSJO}, drop, kolli, counts, goods: [...cnt, ...goods.slice(0, 8)], pal: kolli.filter(k => /KLOVE|PALL|ST[AÄ]LL/.test(k.type)).length, avis: avis ? avis.replace(/\s/g, '') : '', note: drop.note};
}
// "072-092 59 65 08510 140 20" → ["0720925965", "0851014020"]
function splitTels(s) {
  const out = []; let cur = '';
  for (const tok of String(s || '').trim().split(/\s+/)) {
    const t = tok.replace(/[^0-9+]/g, ''); if (!t) continue;
    if (cur.length >= 8 && /^(0|\+)/.test(t)) { out.push(cur); cur = ''; }
    cur += t;
  }
  if (cur) out.push(cur);
  return out.filter(x => x.length >= 8 && x.length <= 12);
}
const emptyA = () => ({name: '', adr: '', zip: '', area: '', tel: '', contact: '', note: '', sure: false});
function group(list) {
  const m = new Map(); for (const g of list) if (g) m.set(g, (m.get(g) || 0) + 1);
  return [...m.entries()].map(([t, n]) => `${n} × ${t}`);
}
// Alla adresser som går att hitta (för okända sedlar – och som val när något är osäkert).
function candidates(P) {
  const out = [];
  P.L.forEach((l, i) => {
    const p = l.t.split(',');
    if (!STREET_RE.test(p[0]) || /^\d/.test(l.n) || /^box\b/i.test(l.n) || /\d{4}-\d\d-\d\d/.test(l.t)) return;
    const nxt = P.L[i + 1];
    const a = addressFrom([{t: (P.L[i - 1] || {t: ''}).t}, {t: l.t}, ...(nxt && ZIP_RE.test(nxt.t) && !STREET_RE.test(nxt.t.split(',')[0]) ? [{t: nxt.t}] : [])]);
    if (a.adr && (a.zip || a.area)) out.push(a);
  });
  const seen = new Set(); return out.filter(a => { const k = norm(a.adr); if (seen.has(k)) return false; seen.add(k); return true; });
}

function parseSedel(ocr, name) {
  const P = prep(ocr);
  const all = P.L.map(l => l.n).join('\n') + '\n' + norm(name);
  const isInomec = /inomec|lyftuthyrning/.test(all);
  let r;
  if (/turleverans/.test(all)) r = bevegoTur(P);
  else if (isInomec && (/collection|hamtsedel|hyrstoppsref|flotta|signatur for/.test(all))) r = inomecHamt(P, name);
  else if (isInomec && /foljesedel|leveransvillkor|handhavande|leveransadress/.test(all.replace(/ove[rt]/g, 'ever'))) r = inomecFolj(P);
  else if (/kontakt/.test(all) && /orderinfo|fordonstyp|projektnr|hamtning|leverans/.test(all)) r = opterShot(P);
  else r = {kind: 'okand', title: 'Okänd sedel', from: '', ref: '', orderNo: '', date: null, pick: emptyA(), drop: emptyA(), goods: [], note: ''};
  const cand = candidates(P);
  if (r.kind === 'okand') { if (cand[0]) r.pick = cand[0]; if (cand[1]) r.drop = cand[1]; }
  if (r.kind === 'bevego-tur' && !r.drop.adr && cand[0]) r.drop = {...cand[0], name: r.drop.name || cand[0].name, tel: r.drop.tel, contact: r.drop.contact, note: r.drop.note};
  for (const k of ['pick', 'drop']) if (r[k] && r[k].zip) r[k].zip = fmtZip(r[k].zip);
  if (!r.tidspass) r.tidspass = tidspass([], P.L.map(l => l.t));
  r.candidates = cand;
  r.text = P.L.map(l => l.t).join('\n');
  return r;
}

module.exports = {parseSedel, INOMEC_DEPOT, BEVEGO_ALVSJO, splitTels, _t: {norm, lev, isLabel, addressFrom}};

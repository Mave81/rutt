'use strict';
/*
 * RUTT optimizer — ordagrann port av Kentas tunade logik ur app.js.
 * Ren JS, ingen DOM. Avstånd via fågelväg × ROUTE_FACTOR (Google-matrisen
 * var en reserv i webbversionen; läggs in senare via proxy).
 *
 * Ett läge: bestOrder() letar lägst poäng (scoreOrder) med fyra sorters flyttar,
 * lastvillkoret (CAP_SLOTS), rast, nålsöga (GRACE_MIN) och väntetid inräknad.
 */

const SERVICE_MIN = 8, PAL_MIN = 1.9;
const REST_MIN = 45, REST_BY_H = 12;
const OVER_COST = 2.0, SPEED_KMH = 30, ROUTE_FACTOR = 1.35;
const SLOTS_WIDE = 3, SLOTS_LONG = 6, TOTAL_SLOTS = SLOTS_WIDE * SLOTS_LONG, CAP_SLOTS = TOTAL_SLOTS - 1;
const OPT_MS = 140, TIGHT_MIN = 15, GRACE_MIN = 5, NICK_COST = 4, WAIT_COST = 0.8, MAX_WAIT = 240;

let CARGO = {}, START = {}, NOW = Date.now(), STOPS = [];

const km = (a, b) => {
  if (!a || !b || a.lat == null || b.lat == null) return 0;
  const R = 6371, dLa = (b.lat - a.lat) * Math.PI / 180, dLo = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x)) * ROUTE_FACTOR;
};
const driveMin = d => d / SPEED_KMH * 60;
const driveInfo = (a, b) => {
  if (!a || !b || a.lat == null || b.lat == null) return {km: 0, min: 0, est: true};
  const d = km(a, b);
  return {km: d, min: driveMin(d), est: true};
};

const activeStops = () => STOPS.filter(s => !s.done);
function preOnboard() {
  const set = new Set();
  for (const cid of Object.keys(CARGO)) if (!STOPS.some(s => s.pickup === cid && !s.done)) set.add(cid);
  return set;
}
function servOf(s) {
  if (s && s.serv != null) return s.serv;
  const cid = s && (s.pickup || s.drop);
  const pal = (cid && CARGO[cid]) ? (CARGO[cid].pal || 0) : 0;
  return SERVICE_MIN + Math.round(PAL_MIN * pal);
}
function planStart() {
  // START.cur = där föraren står nu (senast avklarade stopp); annars startadressen.
  const c = START.cur;
  if (c && c.lat != null) return {pos: {lat: c.lat, lng: c.lng}, t0: new Date(NOW), src: 'senaste stopp'};
  const pos = (START.lat != null) ? {lat: START.lat, lng: START.lng} : {lat: 59.2437, lng: 18.2280};
  return {pos, t0: new Date(NOW), src: START.lat != null ? 'startadress' : 'gissad'};
}
function stopTime(hhmmStr, dateStr, t0) {
  const [h, m] = hhmmStr.split(':').map(Number);
  const d = dateStr ? new Date(dateStr + 'T00:00') : new Date(t0);
  d.setHours(h, m, 0, 0);
  return d;
}

function restIndex(order, s0) {
  const by = new Date(s0.t0); by.setHours(REST_BY_H, 0, 0, 0);
  let t = new Date(s0.t0), pos = s0.pos, best = -1;
  for (let i = 0; i < order.length; i++) {
    if (t.getTime() + REST_MIN * 60000 <= by.getTime()) best = i;
    const s = order[i];
    t = new Date(t.getTime() + driveInfo(pos, s).min * 60000);
    if (s.open) { const op = stopTime(s.open, s.openDate || s.dlDate, s0.t0); if (t < op) t = new Date(Math.min(op.getTime(), t.getTime() + MAX_WAIT * 60000)); }
    t = new Date(t.getTime() + servOf(s) * 60000);
    if (s.lat != null) pos = s;
  }
  if (t.getTime() + REST_MIN * 60000 <= by.getTime()) best = order.length;
  return best;
}

function plan(order) {
  const s0 = planStart();
  let t = new Date(s0.t0), pos = s0.pos, totKm = 0, minMarg = Infinity, broken = [];
  let totWait = 0, free = 0;
  const restAt = order.length ? restIndex(order, s0) : -1;
  let restTime = null;
  const rows = order.map((s, idx) => {
    if (idx === restAt) { restTime = new Date(t); t = new Date(t.getTime() + REST_MIN * 60000); }
    const nogeo = s.lat == null;
    const leg = driveInfo(pos, s); totKm += leg.km;
    t = new Date(t.getTime() + leg.min * 60000);
    const eta = new Date(t);
    let late = null, early = null;
    if (s.deadline) {
      const dl = stopTime(s.deadline, s.dlDate, s0.t0);
      const marg = (dl - eta) / 60000;
      if (marg < minMarg) minMarg = marg;
      if (marg < 0) { late = Math.round(-marg); broken.push({s, late}); }
    } else free++;
    let waitCap = false;
    if (s.open) {
      const op = stopTime(s.open, s.openDate || s.dlDate, s0.t0);
      if (eta < op) { early = Math.round((op - eta) / 60000); const w = Math.min(early, MAX_WAIT); waitCap = early > MAX_WAIT; totWait += w; t = new Date(t.getTime() + w * 60000); }
    }
    t = new Date(t.getTime() + servOf(s) * 60000);
    if (!nogeo) pos = s;
    return {s, eta, late, early, waitCap, nogeo, leg, rest: idx === restAt, serv: servOf(s)};
  });
  if (order.length && (restAt < 0 || restAt >= order.length)) { restTime = new Date(t); t = new Date(t.getTime() + REST_MIN * 60000); }
  let end = t, backKm = 0, back = null;
  if (order.length && START.lat != null) {
    back = driveInfo(pos, {lat: START.lat, lng: START.lng});
    backKm = back.km; totKm += backKm;
    end = new Date(t.getTime() + back.min * 60000);
  }
  return {rows, totKm, minMarg, broken, end, backKm, totWait, free,
          rest: {at: restAt, time: restTime, late: order.length > 0 && restAt < 0, min: order.length ? REST_MIN : 0}};
}

function optCtx(list) {
  const s0 = planStart(), t0 = s0.t0.getTime(), dl = new Map(), op = new Map();
  for (const s of list) {
    dl.set(s, s.deadline ? (stopTime(s.deadline, s.dlDate, s0.t0).getTime() - t0) / 60000 : null);
    op.set(s, s.open ? (stopTime(s.open, s.openDate || s.dlDate, s0.t0).getTime() - t0) / 60000 : null);
  }
  let endMin = null;
  if (START.end) { const e = new Date(s0.t0), hm = START.end.split(':').map(Number); e.setHours(hm[0], hm[1], 0, 0); endMin = (e.getTime() - t0) / 60000 - REST_MIN; }
  return {startPos: s0.pos, homePos: START.lat != null ? {lat: START.lat, lng: START.lng} : null, onboard: preOnboard(), cargoIds: Object.keys(CARGO), endMin, dl, op};
}
const freeCtx = ctx => ({...ctx, dl: new Map(), free: true});

function scoreOrder(order, ctx) {
  let t = 0, pos = ctx.startPos, drive = 0, broken = 0, late = 0, nick = 0, tight = 0, wait = 0;
  for (let i = 0; i < order.length; i++) {
    const s = order[i];
    if (s.lat != null) { const m = driveInfo(pos, s).min; drive += m; t += m; pos = s; }
    const d = ctx.dl.get(s);
    if (d != null) { const marg = d - t; if (marg < -GRACE_MIN) { broken++; late -= marg; } else if (marg < 0) nick -= marg; else if (marg < TIGHT_MIN) tight += TIGHT_MIN - marg; }
    const o = ctx.op != null ? ctx.op.get(s) : null;
    if (o != null && t < o) { const w = Math.min(o - t, MAX_WAIT); wait += w; t += w; }
    t += servOf(s);
  }
  let over = 0;
  if (order.length && ctx.homePos) { const h = driveInfo(pos, ctx.homePos).min; drive += h; t += h; }
  if (ctx.endMin != null && t > ctx.endMin) over = t - ctx.endMin;
  if (late > 1000) late = 1000;
  return broken * 1e6 + late * 3 + nick * NICK_COST + drive + wait * WAIT_COST + tight * 0.3 + over * OVER_COST;
}

function okOrder(order, onboard) {
  let seen = null, pal = 0;
  for (const cid of onboard) if (CARGO[cid]) pal += CARGO[cid].pal || 0;
  for (let i = 0; i < order.length; i++) {
    const s = order[i];
    if (s.drop && !onboard.has(s.drop) && !(seen && seen.has(s.drop))) return false;
    if (s.pickup) { if (!seen) seen = new Set(); seen.add(s.pickup); pal += (CARGO[s.pickup] && CARGO[s.pickup].pal) || 0; if (pal > CAP_SLOTS) return false; }
    if (s.drop) pal -= (CARGO[s.drop] && CARGO[s.drop].pal) || 0;
  }
  return true;
}

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

function seedDeadline(list, ctx) {
  const act = [...list].sort((a, b) => (ctx.dl.get(a) ?? 1e9) - (ctx.dl.get(b) ?? 1e9));
  const seen = new Set(ctx.onboard), out = [], q = [...act];
  while (q.length) { let i = q.findIndex(s => !s.drop || seen.has(s.drop)); if (i === -1) i = 0; const s = q.splice(i, 1)[0]; if (s.pickup) seen.add(s.pickup); out.push(s); }
  return out;
}
function seedGreedy(list, ctx, urgency) {
  const left = [...list], out = [], seen = new Set(ctx.onboard);
  let pos = ctx.startPos, t = 0, pal = 0;
  for (const cid of ctx.onboard) if (CARGO[cid]) pal += CARGO[cid].pal || 0;
  while (left.length) {
    let bi = -1, bv = Infinity;
    for (let i = 0; i < left.length; i++) {
      const s = left[i];
      if (s.drop && !seen.has(s.drop)) continue;
      if (s.pickup && pal + ((CARGO[s.pickup] && CARGO[s.pickup].pal) || 0) > CAP_SLOTS) continue;
      const d = s.lat != null ? driveInfo(pos, s).min : 0;
      let v = d; const dl = ctx.dl.get(s);
      if (urgency && dl != null) { const slack = dl - (t + d); if (slack < 60) v -= (60 - Math.max(slack, -60)) * urgency; }
      if (v < bv) { bv = v; bi = i; }
    }
    if (bi === -1) bi = 0;
    const s = left.splice(bi, 1)[0];
    if (s.lat != null) { t += driveInfo(pos, s).min; pos = s; }
    t += servOf(s);
    if (s.pickup) { seen.add(s.pickup); pal += (CARGO[s.pickup] && CARGO[s.pickup].pal) || 0; }
    if (s.drop) pal -= (CARGO[s.drop] && CARGO[s.drop].pal) || 0;
    out.push(s);
  }
  return out;
}
function seedInsert(list, ctx) {
  const rest = [...list].sort((a, b) => (ctx.dl.get(a) ?? 1e9) - (ctx.dl.get(b) ?? 1e9)), out = [];
  for (const s of rest) {
    let bi = out.length, bv = Infinity;
    for (let i = 0; i <= out.length; i++) { const cand = [...out.slice(0, i), s, ...out.slice(i)]; if (!okOrder(cand, ctx.onboard)) continue; const v = scoreOrder(cand, ctx); if (v < bv) { bv = v; bi = i; } }
    out.splice(bi, 0, s);
  }
  return out;
}
function improveOrder(order, ctx, until) {
  let best = order, bestV = scoreOrder(order, ctx), round = 0;
  for (;;) {
    if (++round > 40 || Date.now() > until) break;
    let moved = false;
    for (let len = 1; len <= 3 && len <= best.length; len++) {
      for (let i = 0; i + len <= best.length; i++) {
        const blk = best.slice(i, i + len), rem = [...best.slice(0, i), ...best.slice(i + len)];
        for (let j = 0; j <= rem.length; j++) { if (j === i) continue; const cand = [...rem.slice(0, j), ...blk, ...rem.slice(j)]; if (!okOrder(cand, ctx.onboard)) continue; const v = scoreOrder(cand, ctx); if (v < bestV - 1e-6) { best = cand; bestV = v; moved = true; } }
      }
      if (Date.now() > until) break;
    }
    for (const cid of ctx.cargoIds) {
      const pu = best.find(s => s.pickup === cid), dr = best.find(s => s.drop === cid);
      if (!pu || !dr) continue;
      const rest = best.filter(s => s !== pu && s !== dr);
      for (let a = 0; a <= rest.length; a++) for (let b = a; b <= rest.length; b++) { const cand = [...rest.slice(0, a), pu, ...rest.slice(a, b), dr, ...rest.slice(b)]; if (!okOrder(cand, ctx.onboard)) continue; const v = scoreOrder(cand, ctx); if (v < bestV - 1e-6) { best = cand; bestV = v; moved = true; } }
      if (Date.now() > until) break;
    }
    for (let i = 0; i < best.length - 1; i++) for (let j = i + 1; j < best.length; j++) { const cand = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)]; if (!okOrder(cand, ctx.onboard)) continue; const v = scoreOrder(cand, ctx); if (v < bestV - 1e-6) { best = cand; bestV = v; moved = true; } }
    for (let i = 0; i < best.length - 1; i++) for (let j = i + 1; j < best.length; j++) { const cand = [...best]; cand[i] = best[j]; cand[j] = best[i]; if (!okOrder(cand, ctx.onboard)) continue; const v = scoreOrder(cand, ctx); if (v < bestV - 1e-6) { best = cand; bestV = v; moved = true; } }
    if (!moved) break;
  }
  return {order: best, val: bestV};
}
function kickOrder(order, rand) {
  const n = order.length;
  if (n < 5) { const c = [...order], i = Math.floor(rand() * n), j = Math.floor(rand() * n); const t = c[i]; c[i] = c[j]; c[j] = t; return c; }
  const a = 1 + Math.floor(rand() * (n - 3)), b = a + 1 + Math.floor(rand() * (n - a - 2)), c = b + 1 + Math.floor(rand() * (n - b - 1));
  return [...order.slice(0, a), ...order.slice(b, c), ...order.slice(a, b), ...order.slice(c)];
}
function bestOrder(ctxIn) {
  const list = activeStops();
  if (list.length < 2) return [...list];
  const ctx = ctxIn || optCtx(list);
  const until = Date.now() + OPT_MS;
  let seeds = [seedDeadline(list, ctx), seedGreedy(list, ctx, 0), seedGreedy(list, ctx, 0.35), seedInsert(list, ctx), [...list]].filter(o => okOrder(o, ctx.onboard));
  if (!seeds.length) { const si = seedInsert(list, ctx); if (okOrder(si, ctx.onboard)) seeds.push(si); }
  let best = null, bestV = Infinity;
  for (const s of seeds) { const r = improveOrder(s, ctx, until); if (r.val < bestV) { best = r.order; bestV = r.val; } if (Date.now() > until) break; }
  if (!best) best = seeds[0] || [...list];
  const rand = rng(list.reduce((a, s) => (a + (s.id || 0) * 2654435761) >>> 0, list.length));
  let guard = 0;
  while (Date.now() < until && guard++ < 60) { const k = kickOrder(best, rand); if (!okOrder(k, ctx.onboard)) continue; const r = improveOrder(k, ctx, until); if (r.val < bestV - 1e-6) { best = r.order; bestV = r.val; } }
  return best;
}

function loadPlan(order) {
  const drops = order.filter(s => s.drop && CARGO[s.drop]).map(s => s.drop);
  const slots = Array(TOTAL_SLOTS).fill(null);
  let slot = 0;
  [...drops].reverse().forEach(cid => {
    const c = CARGO[cid];
    for (let i = 0; i < Math.max(c.pal, 0); i++) if (slot < TOTAL_SLOTS) slots[slot++] = {cid, part: i};
    if (c.pal === 0) if (slot < TOTAL_SLOTS) slots[slot++] = {cid, loose: true};
  });
  return {slots, drops};
}
function slotWhere(idx) {
  const rad = Math.floor(idx / SLOTS_WIDE) + 1;
  const grov = rad <= 2 ? 'längst in mot hytten' : rad <= 4 ? 'mitt i skåpet' : 'längst bak vid dörrarna';
  return `${grov} — rad ${rad} av ${SLOTS_LONG}`;
}

/* Entry: ta Opter-stoppen (toRutt) + cargo + start, ge optimerad plan. */
function computeRoute(stops, cargo, start, now) {
  CARGO = cargo || {};
  START = start || {};
  NOW = now || Date.now();
  // normalisera: id + open (Tidigast)
  STOPS = (stops || []).map((s, i) => ({...s, id: s.id != null ? s.id : i + 1, open: s.open || s.earliest || null}));
  const order = bestOrder();
  const p = plan(order);
  const load = loadPlan(order);
  return {order, plan: p, load, slotWhere, TOTAL_SLOTS, SLOTS_LONG, SLOTS_WIDE, CAP_SLOTS};
}

export {computeRoute, slotWhere, TOTAL_SLOTS, SLOTS_LONG, CAP_SLOTS};
export default computeRoute;

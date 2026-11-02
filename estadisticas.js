// AlexBet · estadísticas reales por partido de fútbol (para el gráfico de barras por equipo, v37).
// Lee de ESPN los partidos terminados de cada liga y guarda por partido: goles, córners, tiros al arco,
// tiros, amarillas, rojas, faltas y posesión de cada equipo. Solo pide los partidos nuevos (usa lo ya guardado).
'use strict';
const fs = require('fs');
const FILE = 'stats-futbol.json', DAYS = 540;
const LG = {ecuador: 'ecu.1', ucl: 'uefa.champions', uel: 'uefa.europa', uecl: 'uefa.europa.conf', bra: 'bra.1', laliga: 'esp.1', epl: 'eng.1', seriea: 'ita.1', bundes: 'ger.1', bundes2: 'ger.2', champ: 'eng.2', ligue1: 'fra.1', portugal: 'por.1', turkey: 'tur.1', netherlands: 'ned.1', lib: 'conmebol.libertadores', sud: 'conmebol.sudamericana', arg: 'arg.1', col: 'col.1', mex: 'mex.1', mls: 'usa.1', laliga2: 'esp.2', serieb: 'ita.2', ligue2: 'fra.2', league1: 'eng.3', league2: 'eng.4', natleague: 'eng.5', scotprem: 'sco.1', scotchamp: 'sco.2', belgium: 'bel.1', greece: 'gre.1'};
const API = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
// orden de cada fila de estadísticas: goles, córners, tiros al arco, tiros, amarillas, rojas, faltas, posesión
const KEYS = [null, ['wonCorners'], ['shotsOnTarget', 'shotsOnGoal'], ['totalShots'], ['yellowCards'], ['redCards'], ['foulsCommitted'], ['possessionPct']];

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, {headers: {'User-Agent': 'Mozilla/5.0 AlexBet'}, signal: AbortSignal.timeout(10000)});
      if (r.ok) return r.json();
      if (r.status === 404) return null;
      if (!get.logged) { get.logged = 1; console.log('ESPN respondió', r.status, 'en', url); }
    } catch (e) {}
    await new Promise(ok => setTimeout(ok, 1500 * (i + 1)));
  }
  return null;
}
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');

(async () => {
  let S = {v: 1, ev: {}};
  try { S = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {}
  const lim = Date.now() - DAYS * 864e5, names = new Set();
  // 1) partidos terminados de cada liga (por tramos de 30 días)
  const todo = [], T0 = Date.now(), seen = new Set(), LGT = {};
  const done = e => { const c = (e.competitions || [])[0] || {}, st = c.status || e.status || {}; return !!(st.type && st.type.completed); };
  await Promise.all(Object.entries(LG).map(async ([lg, code]) => {
    const tj = await get(`${API}${code}/teams`);
    const teams = ((tj && tj.sports && tj.sports[0] && tj.sports[0].leagues && tj.sports[0].leagues[0] && tj.sports[0].leagues[0].teams) || []).map(t => t.team && t.team.id).filter(Boolean);
    let n = 0, fail = 0; const set = new Set(teams.map(String)), all = {};
    for (let i = 0; i < teams.length; i += 4) {
      const y = new Date().getUTCFullYear(), R = (await Promise.all(teams.slice(i, i + 4).map(id => Promise.all(['', 1, 2, 3, 4, 5].map(q => get(`${API}${code}/teams/${id}/schedule${q === '' ? '' : '?season=' + (y - q)}`)))))).flat();
      R.forEach(j => { if (!j) { fail++; return; } (j.events || []).forEach(e => {
        if (!done(e)) return; all[e.id] = e;
        if (Date.parse(e.date) < lim || S.ev[e.id] || seen.has(e.id)) return; seen.add(e.id); todo.push([lg, code, e]); n++; }); });
    }
    LGT[lg] = {code, set, all};
    console.log(lg, 'equipos:', teams.length, '· nuevos:', n, '· sin respuesta:', fail);
  }));
  console.log('Búsqueda de partidos:', Math.round((Date.now() - T0) / 1000), 's · por pedir:', todo.length);
  // 2) estadísticas de cada partido nuevo (8 a la vez)
  let ok = 0, sinStats = 0;
  const sc = x => { const v = x.score; return v == null ? 0 : typeof v === 'object' ? (+(v.value ?? v.displayValue) || 0) : (+v || 0); };
  const sides = e => { const c = e.competitions && e.competitions[0]; if (!c) return null; const H = c.competitors.find(x => x.homeAway === 'home'), A = c.competitors.find(x => x.homeAway === 'away'); return H && A ? [H, A] : null; };
  async function boxOf(code, e, H, A) {
    const j = await get(`${API}${code}/summary?event=${e.id}`); if (!j) return null;
    const bt = (j.boxscore && j.boxscore.teams) || [];
    const row = (cmp) => {
      const t = bt.find(x => x.team && String(x.team.id) === String(cmp.id)), st = (t && t.statistics) || [];
      st.forEach(s => names.add(s.name));
      return KEYS.map((k, i) => {
        if (!i) return sc(cmp);
        const s = st.find(x => k.includes(x.name)); if (!s) return null;
        const v = parseFloat(s.displayValue ?? s.value); return isNaN(v) ? null : v;
      });
    };
    return [row(H), row(A)];
  }
  const one = async ([lg, code, e]) => {
    const sd = sides(e); if (!sd) return; const [H, A] = sd;
    const b = await boxOf(code, e, H, A); if (!b) return; const [h, a] = b;
    if (h[1] == null && h[2] == null) sinStats++;
    S.ev[e.id] = [Date.parse(e.date), lg, H.team.id, A.team.id, H.team.shortDisplayName || H.team.displayName, A.team.shortDisplayName || A.team.displayName, h, a];
    ok++;
  };
  // límite de 25 minutos por vuelta: lo que falte se completa en la siguiente (cada 6 horas)
  const t0 = Date.now(); todo.sort((x, y) => Date.parse(y[2].date) - Date.parse(x[2].date));
  for (let i = 0; i < todo.length; i += 8) {
    if (Date.now() - T0 > 22 * 60e3) { console.log('Tiempo agotado: faltan', todo.length - i, 'para la próxima vuelta'); break; }
    await Promise.all(todo.slice(i, i + 8).map(one));
  }
  // 2b) últimos 5 enfrentamientos de cada pareja de la liga (6 temporadas). Archivo pequeño por liga: h2h-<liga>.json
  //     fila: [fecha, idLocal, idVisita, golesLocal, golesVisita, córnersTotal, tarjetasTotal]
  const tot = (h, a, i, j) => h[i] == null || a[i] == null ? null : h[i] + a[i] + (j ? (h[j] || 0) + (a[j] || 0) : 0);
  const h2todo = [];
  for (const [lg, {code, set, all}] of Object.entries(LGT)) {
    const f = `h2h-${lg}.json`; let O = {ev: {}}; try { O = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {}
    const pairs = {};
    Object.values(all).forEach(e => { const sd = sides(e); if (!sd) return; const [H, A] = sd, x = String(H.team.id), y = String(A.team.id);
      if (!set.has(x) || !set.has(y)) return; const k = x < y ? x + '|' + y : y + '|' + x; (pairs[k] = pairs[k] || []).push(e); });
    const ev = {};
    Object.values(pairs).forEach(L => L.sort((p, q) => Date.parse(q.date) - Date.parse(p.date)).slice(0, 5).forEach(e => {
      const [H, A] = sides(e), r = S.ev[e.id], old = O.ev[e.id];
      if (r) ev[e.id] = [r[0], String(r[2]), String(r[3]), r[6][0], r[7][0], tot(r[6], r[7], 1), tot(r[6], r[7], 4, 5)];
      else if (old && old[5] != null) ev[e.id] = old;
      else { ev[e.id] = [Date.parse(e.date), String(H.team.id), String(A.team.id), sc(H), sc(A), null, null]; h2todo.push([code, e, H, A, ev, e.id]); }
    }));
    LGT[lg].out = {f, ev};
  }
  let h2ok = 0;
  for (let i = 0; i < h2todo.length; i += 8) {
    if (Date.now() - T0 > 24 * 60e3) { console.log('Enfrentamientos: faltan', h2todo.length - i, 'para la próxima vuelta'); break; }
    await Promise.all(h2todo.slice(i, i + 8).map(async ([code, e, H, A, ev, id]) => { const b = await boxOf(code, e, H, A); if (!b) return; ev[id][5] = tot(b[0], b[1], 1); ev[id][6] = tot(b[0], b[1], 4, 5); h2ok++; }));
  }
  for (const {out} of Object.values(LGT)) if (out && Object.keys(out.ev).length) fs.writeFileSync(out.f, JSON.stringify({t: Date.now(), ev: out.ev}));
  console.log('Enfrentamientos: partidos', h2todo.length, 'por completar · completados', h2ok);
  // 3) limpiar y guardar
  for (const [id, r] of Object.entries(S.ev)) if (r[0] < lim) delete S.ev[id];
  S.t = Date.now(); S.keys = ['goles', 'corners', 'tirosArco', 'tiros', 'amarillas', 'rojas', 'faltas', 'posesion'];
  fs.writeFileSync(FILE, JSON.stringify(S));
  console.log(`Partidos nuevos: ${ok} (sin estadísticas: ${sinStats}) · total guardados: ${Object.keys(S.ev).length}`);
  console.log('Nombres de estadísticas vistos:', [...names].join(', '));
})().catch(e => { console.error(e); process.exit(1); });

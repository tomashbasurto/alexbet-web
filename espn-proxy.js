// AlexBet · espejo de ESPN (NBA, NCAA, MLB, NHL y tenis).
// Corre en GitHub Actions cada 10 minutos y guarda los datos en espn-*.json.
// La app los usa cuando no puede conectarse directamente con ESPN desde el celular.
const fs = require('fs');

const API = 'https://site.api.espn.com/apis';
const DROP = new Set(['links', 'logos', 'broadcasts', 'geoBroadcasts', 'headlines', 'tickets', 'leaders',
  'highlights', '$ref', 'guid', 'uid', 'calendar', 'previousWinners', 'situation', 'weather', 'format', 'geo']);

function prune(o) {
  if (Array.isArray(o)) return o.map(prune);
  if (!o || typeof o !== 'object') return o;
  const out = {};
  for (const [k, v] of Object.entries(o)) if (!DROP.has(k)) out[k] = prune(v);
  return out;
}
async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, {headers: {'User-Agent': 'Mozilla/5.0 AlexBet'}});
      if (r.ok) return await r.json();
      console.log('HTTP', r.status, url);
    } catch (e) { console.log('fallo', url, e.message); }
    await new Promise(res => setTimeout(res, 1500 * (i + 1)));
  }
  return null;
}
const ymdUTC = d => new Date(d - 5 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
function days(from, to) {
  const out = [];
  for (let i = from; i <= to; i++) out.push(ymdUTC(Date.now() + i * 864e5));
  return out;
}
function soloIndividuales(board) {
  (board.events || []).forEach(e => {
    e.groupings = (e.groupings || []).filter(g => (g.competitions || []).some(c => /singles/.test((c.type && c.type.slug) || '')));
  });
  return board;
}
// lesionados: {equipo: [{id, n, st}]}
function injList(j) {
  const out = {};
  (j.injuries || j.teams || []).forEach(T => {
    const tid = String(T.id || (T.team && T.team.id) || '');
    (T.injuries || []).forEach(x => {
      const a = x.athlete || {}, st = x.status || (x.type && (x.type.description || x.type.name)) || '';
      const id = String(a.id || ((a.links || [])[0] && ((a.links[0].href || '').match(/id\/(\d+)/) || [])[1]) || '');
      const team = String((a.team && a.team.id) || tid);
      if (!team) return; (out[team] = out[team] || []).push({id, n: a.displayName || a.fullName || '', st: String(st)});
    });
  });
  return out;
}
function guardar(file, data) {
  const txt = JSON.stringify(data);
  fs.writeFileSync(file, txt);
  console.log(file, Math.round(txt.length / 1024) + ' KB');
}

// v44: cuotas de fútbol de ESPN (todas las ligas y copas con partidos en los próximos 8 días), cada 30 min.
// La app las lee de aquí en vez de pedir más de 100 consultas a ESPN desde cada celular.
async function cuotasFutbol(t) {
  const F = 'espn-cuotas.json';
  try { const old = JSON.parse(fs.readFileSync(F, 'utf8')); if (t - old.t < 25 * 60e3) return; } catch (e) {}
  const L = [...fs.readFileSync('fetch-data.js', 'utf8').matchAll(/\{id:'([a-z0-9]+)'[^}\n]*espn:'([^']+)'/g)].map(m => [m[1], m[2]]);
  let D = {}; try { D = JSON.parse(fs.readFileSync('datos.json', 'utf8')).fx || {}; } catch (e) {}
  const t1 = t + 8 * 864e5, t0 = t - 3 * 3600e3;
  const soon = id => { const d = D[id]; return !d || !d.fx ? true : d.fx.some(f => { const x = Date.parse(f.d + ':00Z'); return x >= t0 && x <= t1; }); };
  const meses = [...new Set([0, 8].map(k => new Date(t + k * 864e5 - 5 * 3600e3).toISOString().slice(0, 7).replace('-', '')))];
  const ev = [], ligas = L.filter(([id]) => soon(id));
  for (let i = 0; i < ligas.length; i += 6) {
    await Promise.all(ligas.slice(i, i + 6).map(async ([lid, slug]) => {
      for (const m of meses) {
        const j = await get(`${API}/site/v2/sports/soccer/${slug}/scoreboard?dates=${m}`); if (!j) continue;
        (j.events || []).forEach(e => {
          const c = (e.competitions || [])[0]; if (!c || !(c.odds && c.odds[0])) return;
          const x = Date.parse(e.date); if (x < t0 || x > t1) return;
          ev.push({lid, e: prune({id: e.id, date: e.date, competitions: [{status: c.status, competitors: (c.competitors || []).map(k => ({homeAway: k.homeAway, team: {displayName: k.team && k.team.displayName, name: k.team && k.team.name}})), odds: [c.odds[0]]}]})});
        });
      }
    }));
  }
  console.log('cuotas: ligas', ligas.length, 'de', L.length, '· partidos con cuota', ev.length);
  if (ev.length) guardar(F, {t, ev});
}

// v44: lanzadores abridores probables con sus números de la temporada, desde la API oficial de MLB (gratis)
async function abridoresMLB(t) {
  const d0 = new Date(t - 5 * 3600e3 - 864e5).toISOString().slice(0, 10), d1 = new Date(t + 7 * 864e5).toISOString().slice(0, 10);
  const S = await get(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${d0}&endDate=${d1}&hydrate=probablePitcher`);
  const games = ((S && S.dates) || []).flatMap(d => d.games || []), ids = new Set();
  games.forEach(g => ['home', 'away'].forEach(k => { const p = g.teams[k].probablePitcher; if (p) ids.add(p.id); }));
  const st = {}, L = [...ids];
  for (let i = 0; i < L.length; i += 40) {
    const y = new Date(t).getUTCFullYear(), j = await get(`https://statsapi.mlb.com/api/v1/people?personIds=${L.slice(i, i + 40).join(',')}&hydrate=stats(group=[pitching],type=[season],season=${y})`);
    ((j && j.people) || []).forEach(p => {
      const s = (((p.stats || [])[0] || {}).splits || [])[0]; const x = s && s.stat; if (!x) return;
      const ipS = String(x.inningsPitched || '0').split('.'), ip = (+ipS[0] || 0) + (+(ipS[1] || 0)) / 3;
      const fip = ip > 0 ? (13 * (x.homeRuns || 0) + 3 * ((x.baseOnBalls || 0) + (x.hitByPitch || 0)) - 2 * (x.strikeOuts || 0)) / ip + 3.15 : null;
      st[p.id] = {era: parseFloat(x.era) || null, fip: fip != null ? Math.round(fip * 100) / 100 : null, ip: Math.round(ip * 10) / 10, whip: parseFloat(x.whip) || null, k9: ip ? Math.round((x.strikeOuts || 0) / ip * 90) / 10 : null};
    });
  }
  const out = {};
  games.forEach(g => {
    const side = k => { const p = g.teams[k].probablePitcher; return p ? Object.assign({n: p.fullName}, st[p.id] || {}) : null; };
    out[String(g.gameDate).slice(0, 10) + '|' + g.teams.home.team.name] = {h: side('home'), a: side('away')};
  });
  console.log('MLB abridores: partidos', games.length, '· lanzadores', L.length);
  if (games.length) guardar('mlb-abridores.json', {t, g: out});
}

(async () => {
  const t = Date.now();
  for (const [sp, path, q, d2] of [['nba', 'basketball/nba', '', 7], ['mlb', 'baseball/mlb', '', 7], ['nhl', 'hockey/nhl', '', 7], ['ncaa', 'basketball/mens-college-basketball', '&groups=50&limit=400', 1]]) {
    const boards = (await Promise.all(days(-1, d2).map(k => get(`${API}/site/v2/sports/${path}/scoreboard?dates=${k}${q}`))))
      .filter(Boolean).map(b => prune({events: b.events || []}));
    const standings = await get(`${API}/v2/sports/${path}/standings`);
    const inj = sp === 'nba' ? await get(`${API}/site/v2/sports/${path}/injuries`) : null; // lesionados (NBA)
    if (!boards.length) { console.log('sin datos', sp); continue; }
    guardar(`espn-${sp}.json`, {t, boards, standings: standings ? prune(standings) : null, inj: inj ? injList(inj) : null});
  }
  const tenis = {t, atp: [], wta: [], rank: {}};
  for (const tour of ['atp', 'wta']) {
    const urls = [`${API}/site/v2/sports/tennis/${tour}/scoreboard`, ...days(1, 2).map(k => `${API}/site/v2/sports/tennis/${tour}/scoreboard?dates=${k}`)];
    tenis[tour] = (await Promise.all(urls.map(get))).filter(Boolean).map(b => soloIndividuales(prune({events: b.events || []})));
    const r = await get(`${API}/site/v2/sports/tennis/${tour}/rankings`);
    if (r) tenis.rank[tour] = {rankings: (r.rankings || []).slice(0, 1).map(x => ({ranks: (x.ranks || []).map(k => ({current: k.current, points: k.points, athlete: {id: k.athlete && k.athlete.id}}))}))};
  }
  if (tenis.atp.length || tenis.wta.length) guardar('espn-tenis.json', tenis);
  await cuotasFutbol(t);
  await abridoresMLB(t);
})();

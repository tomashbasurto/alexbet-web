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

(async () => {
  const t = Date.now();
  for (const [sp, path, q, d2] of [['nba', 'basketball/nba', '', 7], ['mlb', 'baseball/mlb', '', 7], ['nhl', 'hockey/nhl', '', 7], ['ncaa', 'basketball/mens-college-basketball', '&groups=50&limit=400', 2]]) {
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
})();

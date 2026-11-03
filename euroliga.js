// AlexBet · Euroliga. ESPN tiene los equipos pero no los partidos, así que se usa la API oficial de la Euroliga
// y se traduce al mismo formato de ESPN que ya entiende la app (marcador, clasificación, calendario y estadísticas por partido).
// Escribe la carpeta eul/: board.json, standings.json, sched-<club>.json y sum-<partido>.json (estos se guardan una vez).
'use strict';
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'eul');
const API = 'https://api-live.euroleague.net/v2/competitions/E/seasons/';
const get = async u => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u, {headers: {'User-Agent': 'Mozilla/5.0 AlexBet', Accept: 'application/json'}, signal: AbortSignal.timeout(20000)}); if (r.ok) return r.json(); if (r.status === 404) return null; } catch (e) {} await new Promise(ok => setTimeout(ok, 1500 * (i + 1))); } return null; };
const title = s => String(s || '').toLowerCase().replace(/(^|[\s'-])\S/g, m => m.toUpperCase());
const pname = s => { const [a, b] = String(s || '').split(','); return b ? title(b.trim()) + ' ' + title(a.trim()) : title(a); };
const seasonOf = () => { const n = new Date(); return n.getUTCMonth() >= 6 ? n.getUTCFullYear() : n.getUTCFullYear() - 1; };

(async () => {
  fs.mkdirSync(DIR, {recursive: true});
  const Y = seasonOf(), S = 'E' + Y;
  const G = ((await get(`${API}${S}/games`)) || {}).data || [];
  if (!G.length) { console.log('La API de la Euroliga no respondió'); process.exit(0); }
  const team = c => ({id: c.code, displayName: c.name, shortDisplayName: c.abbreviatedName || c.name, name: c.editorialName || c.abbreviatedName, abbreviation: c.tvCode || c.code, logo: (c.images || {}).crest || ''});
  const evOf = g => {
    const done = !!g.played, live = !done && g.gameStatus && /live|progress/i.test(String(g.gameStatus));
    const side = (s, ha) => ({homeAway: ha, team: team(s.club), score: done || live ? String(s.score ?? '') : '', winner: done && g.winner ? g.winner.code === s.club.code : undefined,
      linescores: done && s.partials ? ['partials1', 'partials2', 'partials3', 'partials4'].map(k => ({value: s.partials[k] || 0})).concat(Object.values(s.partials.extraPeriods || {}).map(v => ({value: v}))) : []});
    return {id: g.identifier, date: g.utcDate, name: `${g.road.club.name} at ${g.local.club.name}`, season: {year: Y, type: 2},
      competitions: [{id: g.identifier, date: g.utcDate, neutralSite: !!g.isNeutralVenue, competitors: [side(g.local, 'home'), side(g.road, 'away')],
        status: {period: done ? 4 : 0, displayClock: '0:00', type: {completed: done, state: done ? 'post' : (live ? 'in' : 'pre'), name: done ? 'STATUS_FINAL' : 'STATUS_SCHEDULED', detail: done ? 'Final' : ''}}}]};
  };
  const now = Date.now();
  // marcador: de 10 días atrás a 21 días adelante
  const board = G.filter(g => { const t = Date.parse(g.utcDate); return t > now - 10 * 864e5 && t < now + 21 * 864e5; }).map(evOf);
  fs.writeFileSync(path.join(DIR, 'board.json'), JSON.stringify({t: now, events: board}));
  // clasificación (puntos a favor y en contra por partido)
  const T = {};
  G.filter(g => g.played).forEach(g => [[g.local, g.road], [g.road, g.local]].forEach(([me, op]) => {
    const x = T[me.club.code] || (T[me.club.code] = {club: me.club, w: 0, l: 0, pf: 0, pa: 0});
    x.pf += +me.score || 0; x.pa += +op.score || 0; if ((+me.score) > (+op.score)) x.w++; else x.l++; }));
  const entries = Object.values(T).map(x => { const gp = x.w + x.l; return {team: team(x.club), stats: [
    {name: 'wins', value: x.w}, {name: 'losses', value: x.l}, {name: 'gamesPlayed', value: gp},
    {name: 'avgPointsFor', value: gp ? x.pf / gp : null}, {name: 'avgPointsAgainst', value: gp ? x.pa / gp : null}, {name: 'overall', summary: `${x.w}-${x.l}`}]}; });
  fs.writeFileSync(path.join(DIR, 'standings.json'), JSON.stringify({children: [{standings: {entries}}]}));
  // calendario de cada equipo (toda la temporada)
  const clubs = new Set(); G.forEach(g => { clubs.add(g.local.club.code); clubs.add(g.road.club.code); });
  clubs.forEach(c => fs.writeFileSync(path.join(DIR, `sched-${c}.json`), JSON.stringify({season: {year: Y}, requestedSeason: {year: Y}, events: G.filter(g => g.local.club.code === c || g.road.club.code === c).map(evOf)})));
  // estadísticas por partido (solo los jugados que faltan)
  const LAB = ['MIN', 'PTS', 'FG', '3PT', 'FT', 'OREB', 'DREB', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF'];
  const played = G.filter(g => g.played && !fs.existsSync(path.join(DIR, `sum-${g.identifier}.json`)));
  let ok = 0;
  for (let i = 0; i < played.length; i += 6) await Promise.all(played.slice(i, i + 6).map(async g => {
    const b = await fetch(`https://live.euroleague.net/api/Boxscore?gamecode=${g.gameCode}&seasoncode=${S}`, {headers: {'User-Agent': 'Mozilla/5.0 AlexBet'}}).then(r => r.ok ? r.json() : null).catch(() => null);
    if (!b || !b.Stats) return;
    const sideOf = code => code === g.local.club.code ? g.local : g.road;
    const players = b.Stats.map((st, i) => {
      const P = st.PlayersStats || [], code = (P[0] && P[0].Team) || (i === 0 ? g.local.club.code : g.road.club.code), s = sideOf(code) || (i === 0 ? g.local : g.road);
      return {team: {id: s.club.code, displayName: s.club.name}, statistics: [{labels: LAB, athletes: P.filter(p => p.Player_ID).map(p => {
        const dnp = !p.Minutes || /dnp/i.test(String(p.Minutes)), m2 = p.FieldGoalsMade2 || 0, a2 = p.FieldGoalsAttempted2 || 0, m3 = p.FieldGoalsMade3 || 0, a3 = p.FieldGoalsAttempted3 || 0;
        return {athlete: {id: 'eul' + String(p.Player_ID).trim(), displayName: pname(p.Player), jersey: String(p.Dorsal || '')}, starter: !!p.IsStarter, didNotPlay: dnp,
          stats: dnp ? [] : [String(parseInt(p.Minutes, 10) || 0), String(p.Points || 0), `${m2 + m3}-${a2 + a3}`, `${m3}-${a3}`, `${p.FreeThrowsMade || 0}-${p.FreeThrowsAttempted || 0}`,
            String(p.OffensiveRebounds || 0), String(p.DefensiveRebounds || 0), String(p.TotalRebounds || 0), String(p.Assistances || 0), String(p.Steals || 0), String(p.BlocksFavour || 0), String(p.Turnovers || 0), String(p.FoulsCommited || 0)]};
      })}]};
    });
    const ev = evOf(g);
    fs.writeFileSync(path.join(DIR, `sum-${g.identifier}.json`), JSON.stringify({header: {id: g.identifier, competitions: ev.competitions}, boxscore: {players}}));
    ok++;
  }));
  console.log(`Euroliga ${S}: ${G.length} partidos (${G.filter(g => g.played).length} jugados) · ${board.length} en el marcador · ${clubs.size} equipos · estadísticas nuevas: ${ok}`);
})().catch(e => { console.error(e); process.exit(1); });

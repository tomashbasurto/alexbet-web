const fs = require('fs');
const L = JSON.parse(fs.readFileSync('props.json', 'utf8')).filter(x => x.ts < Date.now() - 4 * 3600e3);
const B = 'https://site.api.espn.com/apis/site/v2/sports/basketball';
const PATH = {nba: 'nba', ncaa: 'mens-college-basketball'};
const gids = [...new Set(L.map(x => x.sp + '|' + x.gid))];
const box = {};
(async () => {
  for (let i = 0; i < gids.length; i += 8) {
    await Promise.all(gids.slice(i, i + 8).map(async k => { const [sp, gid] = k.split('|');
      try { const j = await (await fetch(`${B}/${PATH[sp]}/summary?event=${gid}`)).json();
        const st = j.header && j.header.competitions && j.header.competitions[0].status.type.state; if (st !== 'post') return;
        const m = {}; (j.boxscore && j.boxscore.players || []).forEach(t => (t.statistics || []).forEach(s => { const lb = s.labels || s.names || [];
          (s.athletes || []).forEach(a => { if (a.didNotPlay || !a.stats || !a.stats.length) return; const o = {}; lb.forEach((l, q) => o[l] = a.stats[q]); m[String(a.athlete.id)] = o; }); }));
        box[k] = m; } catch (e) {} }));
  }
  const n = v => { const x = parseFloat(String(v).split('-')[0]); return isNaN(x) ? null : x; };
  const get = (o, mk) => { const P = n(o.PTS), R = n(o.REB), A = n(o.AST), T = n(o['3PT']), S = n(o.STL), Bk = n(o.BLK), TO = n(o.TO);
    return ({'Puntos': P, 'Rebotes': R, 'Asistencias': A, 'Triples': T, 'Reb+Ast': R + A, 'Pts+Reb+Ast': P + R + A, 'Pts+Ast': P + A, 'Pts+Reb': P + R, 'Pérdidas': TO, 'Robos': S, 'Tapones': Bk, 'Robos+Tapones': S + Bk})[mk]; };
  const out = [];
  for (const x of L) { const m = box[x.sp + '|' + x.gid]; if (!m) continue; const o = m[String(x.pid).split('|')[0]]; if (!o) { out.push({...x, res: 'dnp'}); continue; }
    const v = get(o, x.mk); if (v == null || isNaN(v)) continue; out.push({...x, v, res: (x.u ? v < x.ln : v > x.ln) ? 1 : 0}); }
  fs.writeFileSync('out/props-res.json', JSON.stringify(out)); console.log('resueltas', out.length, 'de', L.length, 'partidos', Object.keys(box).length);
})();

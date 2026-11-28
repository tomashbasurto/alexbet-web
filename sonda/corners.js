const fs = require('fs');
const L = ['eng.1','eng.2','eng.3','eng.4','esp.1','esp.2','ger.1','ger.2','ita.1','ita.2','fra.1','fra.2','por.1','por.2','ned.1','ned.2','bel.1','sui.1','aut.1','den.1','nor.1','swe.1','sco.1','sco.2','tur.1','gre.1','pol.1','cze.1','irl.1','arg.1','bra.1','bra.2','col.1','ecu.1','mex.1','usa.1','chi.1','uru.1','per.1','uefa.champions','uefa.europa','uefa.europa.conf','conmebol.libertadores','conmebol.sudamericana'];
const M = []; for (let y = 2025, m = 7; y < 2026 || m <= 11; m++) { if (m > 12) { m = 1; y++; } M.push(y + String(m).padStart(2, '0')); if (y === 2026 && m === 11) break; }
const J = async u => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u); if (r.ok) return await r.json(); } catch (e) {} await new Promise(r => setTimeout(r, 800)); } return null; };
(async () => {
  const out = [], cnt = {}, seen = new Set();
  for (const lid of L) { const jobs = M.map(m => J(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lid}/scoreboard?dates=${m}&limit=500`)); const res = await Promise.all(jobs);
    res.forEach(j => (j && j.events || []).forEach(e => { if (seen.has(e.id)) return; const c = e.competitions[0]; if (!c || c.status.type.state !== 'post') return;
      const T = {}; c.competitors.forEach(t => { const st = {}; (t.statistics || []).forEach(s => st[s.name] = s.displayValue); T[t.homeAway] = {n: t.team.displayName, id: t.team.id, g: +t.score, c: st.wonCorners != null ? +st.wonCorners : null, sh: +st.totalShots}; });
      if (!T.home || !T.away || T.home.c == null || T.away.c == null || (T.home.c + T.away.c === 0)) return;
      seen.add(e.id); out.push([lid, e.date.slice(0, 10), T.home.n, T.away.n, T.home.g, T.away.g, T.home.c, T.away.c, T.home.id, T.away.id]); cnt[lid] = (cnt[lid] || 0) + 1; })); }
  console.log(JSON.stringify(cnt)); fs.writeFileSync('out/corners.json', JSON.stringify(out)); console.log('partidos', out.length);
})();

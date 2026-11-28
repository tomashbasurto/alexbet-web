// córners por partido (marcador de ESPN trae wonCorners por equipo) · temporada pasada y actual, todas las ligas de la app
const fs = require('fs');
const L = ['eng.1','eng.2','eng.3','eng.4','eng.5','esp.1','esp.2','ger.1','ger.2','ita.1','ita.2','fra.1','fra.2','por.1','ned.1','bel.1','tur.1','gre.1','sco.1','sco.2','arg.1','bra.1','bra.2','col.1','ecu.1','mex.1','usa.1','uefa.champions','uefa.europa','uefa.europa.conf','conmebol.libertadores','conmebol.sudamericana','eng.fa','eng.league_cup','esp.copa_del_rey','ita.coppa_italia','ger.dfb_pokal','fra.coupe_de_france'];
const R = [['20250701','20251231'],['20260101','20260630'],['20260701','20261127']];
const J = async u => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u); if (r.ok) return await r.json(); } catch (e) {} await new Promise(r => setTimeout(r, 1000)); } return null; };
(async () => {
  const out = []; const cnt = {};
  for (const lid of L) for (const [a, b] of R) {
    const j = await J(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lid}/scoreboard?dates=${a}-${b}&limit=1000`);
    (j && j.events || []).forEach(e => { const c = e.competitions[0]; if (!c || c.status.type.state !== 'post') return;
      const T = {}; c.competitors.forEach(t => { const st = {}; (t.statistics || []).forEach(s => st[s.name] = +s.displayValue); T[t.homeAway] = {n: t.team.displayName, g: +t.score, c: st.wonCorners, sh: st.totalShots}; });
      if (!T.home || !T.away || isNaN(T.home.c) || isNaN(T.away.c) || T.home.c == null) return;
      out.push([lid, e.date.slice(0, 10), T.home.n, T.away.n, T.home.g, T.away.g, T.home.c, T.away.c]); cnt[lid] = (cnt[lid] || 0) + 1; });
  }
  console.log(JSON.stringify(cnt)); fs.writeFileSync('out/corners.json', JSON.stringify(out)); console.log('partidos', out.length);
})();

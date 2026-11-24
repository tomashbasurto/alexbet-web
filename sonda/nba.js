// datos NBA (temporada pasada y actual): marcador por cuarto, cuotas ESPN de cierre y box de jugadores
const fs = require('fs');
const B = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const days = []; const add = (a, b) => { for (let d = new Date(a); d <= new Date(b); d = new Date(+d + 864e5)) days.push(d.toISOString().slice(0, 10).replace(/-/g, '')); };
add('2025-10-21', '2026-04-13'); add('2026-10-20', '2026-11-23');
const J = async u => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u); if (r.ok) return await r.json(); } catch (e) {} await new Promise(r => setTimeout(r, 800)); } return null; };
(async () => {
  const ids = [];
  for (let i = 0; i < days.length; i += 10) await Promise.all(days.slice(i, i + 10).map(async d => {
    const j = await J(`${B}/scoreboard?dates=${d}&limit=40`); (j && j.events || []).forEach(e => { const c = e.competitions[0]; if (c.status.type.state === 'post' && (e.season || {}).type === 2) ids.push({id: e.id, d: e.date}); });
  }));
  console.log('partidos', ids.length);
  const out = [];
  for (let i = 0; i < ids.length; i += 10) await Promise.all(ids.slice(i, i + 10).map(async g => {
    const j = await J(`${B}/summary?event=${g.id}`); if (!j) return;
    const c = j.header.competitions[0], T = {};
    c.competitors.forEach(t => { T[t.homeAway] = {n: t.team.displayName, s: +t.score, q: (t.linescores || []).map(x => +(x.displayValue != null ? x.displayValue : x.value))}; });
    const pc = (j.pickcenter || []).map(p => ({pr: (p.provider || {}).name, ou: p.overUnder, sp: p.spread, hml: (p.homeTeamOdds || {}).moneyLine, aml: (p.awayTeamOdds || {}).moneyLine, ouo: p.overOdds, uno: p.underOdds,
      open: p.open ? {ou: (p.open.total || {}).alternateDisplayValue || null} : null, tot: p.total ? JSON.stringify(p.total).slice(0, 300) : null}));
    const pl = [];
    (j.boxscore && j.boxscore.players || []).forEach(t => (t.statistics || []).forEach(s => { const lb = s.labels || [];
      (s.athletes || []).forEach(a => { if (a.didNotPlay || !a.stats || !a.stats.length) return; const o = {}; lb.forEach((l, q) => o[l] = a.stats[q]);
        pl.push([a.athlete.id, a.athlete.displayName, t.team.displayName, a.starter ? 1 : 0, +o.MIN || 0, +o.PTS || 0, +o.REB || 0, +o.AST || 0, +(String(o['3PT'] || '0').split('-')[0])]); }); }));
    out.push({id: g.id, d: g.d, h: T.home, a: T.away, pc, pl});
  }));
  out.sort((a, b) => a.d < b.d ? -1 : 1);
  fs.writeFileSync('out/nba.json', JSON.stringify(out)); console.log('guardados', out.length, 'con cuota', out.filter(x => x.pc.length).length);
})();

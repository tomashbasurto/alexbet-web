const B = 'https://site.api.espn.com/apis/site/v2/sports/basketball/euroleague';
const g = async u => { const r = await fetch(u, {headers: {'User-Agent': 'Mozilla/5.0'}}); return r.ok ? r.json() : {err: r.status}; };
(async () => {
  for (const d of ['20261103', '20261104', '20261105', '20261106', '20261030']) { const j = await g(`${B}/scoreboard?dates=${d}`); console.log('scoreboard', d, (j.events || []).length, (j.events || []).slice(0, 2).map(e => e.name + ' ' + e.status.type.name).join(' | ')); }
  const t = await g(`${B}/teams`); const teams = ((((t.sports || [])[0] || {}).leagues || [])[0] || {}).teams || []; console.log('teams', teams.length, teams.slice(0, 4).map(x => x.team.id + ':' + x.team.displayName).join(', '));
  if (teams[0]) { const s = await g(`${B}/teams/${teams[0].team.id}/schedule`); const ev = s.events || []; console.log('schedule', ev.length, ev.filter(e => (e.competitions[0].status.type.completed)).length, 'jugados');
    const done = ev.filter(e => e.competitions[0].status.type.completed).pop(); if (done) { const m = await g(`${B}/summary?event=${done.id}`);
      console.log('summary keys', Object.keys(m).join(','), '| boxscore players', ((m.boxscore || {}).players || []).length, '| team stats', (((m.boxscore || {}).teams || [])[0] || {}).statistics ? 'si' : 'no');
      const p = ((m.boxscore || {}).players || [])[0]; if (p) console.log('labels', JSON.stringify((p.statistics || [])[0] && p.statistics[0].labels), 'n', (p.statistics[0].athletes || []).length); } }
  const sb = await g(`${B}/scoreboard?dates=20261020-20261110`); console.log('rango', (sb.events || []).length);
})();

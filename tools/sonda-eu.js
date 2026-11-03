const g = async u => { const r = await fetch(u, {headers: {'User-Agent': 'Mozilla/5.0', Accept: 'application/json'}}); const t = await r.text(); return {s: r.status, t}; };
(async () => {
  const G = JSON.parse((await g('https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/games')).t).data;
  console.log('games', G.length); const x = G.find(z => z.played) || G[0];
  console.log('keys', Object.keys(x).join(','));
  console.log('sample', JSON.stringify({gameCode: x.gameCode, date: x.date, utc: x.utcDate, played: x.played, round: x.round, local: x.local, road: x.road}).slice(0, 900));
  const played = G.filter(z => z.played).length; console.log('jugados', played, 'proximos', G.filter(z => !z.played).slice(0, 3).map(z => z.date + ' ' + z.local.club.name + ' vs ' + z.road.club.name).join(' | '));
  for (const u of [`https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/games/${x.gameCode}/stats`, `https://api-live.euroleague.net/v3/competitions/E/seasons/E2026/games/${x.gameCode}/stats`,
    `https://live.euroleague.net/api/Boxscore?gamecode=${x.gameCode}&seasoncode=E2026`, `https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/games/${x.gameCode}/report`]) {
    const r = await g(u); console.log(r.s, u, r.t.length, r.t.slice(0, 500).replace(/\s+/g, ' ')); }
})();

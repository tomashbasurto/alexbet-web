(async () => {
  const r = await fetch('https://live.euroleague.net/api/Boxscore?gamecode=89&seasoncode=E2026', {headers: {'User-Agent': 'Mozilla/5.0'}}); const j = await r.json();
  console.log('top', Object.keys(j).join(','));
  const S = j.Stats[0]; console.log('statkeys', Object.keys(S).join(','));
  console.log('player', JSON.stringify(S.PlayersStats[0]));
  console.log('player2', JSON.stringify(S.PlayersStats[S.PlayersStats.length-1]));
  const c = await (await fetch('https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/clubs', {headers: {'User-Agent': 'Mozilla/5.0'}})).json();
  console.log('club', JSON.stringify(c.data[0]).slice(0, 400));
})();

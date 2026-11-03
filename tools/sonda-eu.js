const U = [
 'https://site.api.espn.com/apis/site/v2/sports/basketball/euroleague/scoreboard',
 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-euroleague/scoreboard',
 'https://site.api.espn.com/apis/site/v2/sports/basketball/euroleague-basketball/scoreboard',
 'https://site.api.espn.com/apis/site/v2/sports/basketball/fiba/scoreboard',
 'https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/games?teamCode=&phaseTypeCode=RS',
 'https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/games',
 'https://feeds.incrowdsports.com/provider/euroleague-feeds/v2/competitions/E/seasons/E2026/games',
 'https://api-live.euroleague.net/v1/schedules?seasonCode=E2026',
 'https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/clubs',
];
(async () => { for (const u of U) { try { const r = await fetch(u, {headers: {'User-Agent': 'Mozilla/5.0', Accept: 'application/json'}}); const t = await r.text();
  console.log(r.status, u, '| cors:', r.headers.get('access-control-allow-origin'), '|', t.length, '|', t.slice(0, 300).replace(/\s+/g, ' ')); } catch (e) { console.log('ERR', u, e.message); } } })();

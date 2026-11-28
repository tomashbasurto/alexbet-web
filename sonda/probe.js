(async()=>{
 for (const u of ['https://site.api.espn.com/apis/site/v2/sports/soccer/sco.1/scoreboard?dates=20261101-20261127&limit=1000','https://site.api.espn.com/apis/site/v2/sports/soccer/nor.1/scoreboard?dates=20261101-20261127','https://site.api.espn.com/apis/site/v2/sports/soccer/sui.1/scoreboard?dates=20261101-20261127','https://site.api.espn.com/apis/site/v2/sports/soccer/ned.2/scoreboard?dates=20261101-20261127']){
  const r=await fetch(u); const j=await r.json(); const e=(j.events||[]); console.log(u.split('/')[8], r.status, 'eventos',e.length);
  if(e[0]){const c=e[0].competitions[0]; console.log(c.status.type.state, JSON.stringify(c.competitors[0].statistics||null).slice(0,600));
   const s=await (await fetch(u.split('/scoreboard')[0]+'/summary?event='+e[0].id)).json(); const t=(s.boxscore&&s.boxscore.teams||[])[0]; console.log('summary', t?JSON.stringify(t.statistics.map(x=>x.name+'='+x.displayValue)).slice(0,600):'none');}
 }})();

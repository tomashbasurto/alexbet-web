(async()=>{
 const B='https://site.api.espn.com/apis/site/v2/sports/soccer/';
 for (const q of ['sco.1/scoreboard?dates=20261122','sco.1/scoreboard?dates=20261101-20261127','sco.1/scoreboard?dates=202611','nor.1/scoreboard?dates=20261109','sui.1/scoreboard?dates=20261122','ned.2/scoreboard?dates=20261121','sco.1/scoreboard']){
  const r=await fetch(B+q); let j={}; try{j=await r.json()}catch(e){} const e=(j.events||[]); console.log(q, r.status, 'eventos',e.length);
  if(e[0]){const c=e[0].competitions[0]; console.log(' st',c.status.type.state, JSON.stringify((c.competitors[0].statistics||[]).map(x=>x.name+'='+x.displayValue)).slice(0,500));}
 }})();

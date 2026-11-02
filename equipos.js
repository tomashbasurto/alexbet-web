// AlexBet · promedios de temporada por equipo para NCAA (básquet universitario) y NHL, calculados con los resultados de ESPN.
// La tabla de ESPN de estos deportes no siempre trae puntos/goles por partido. Corre una vez al día y escribe equipos-ncaa.json y equipos-nhl.json.
'use strict';
const fs = require('fs');
const API = 'https://site.api.espn.com/apis/site/v2/sports';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(u){ for(let i=0;i<3;i++){ try{ const r = await fetch(u,{headers:{'User-Agent':'Mozilla/5.0 AlexBet'}}); if(r.ok) return await r.json(); }catch(e){} await sleep(800*(i+1)); } return null; }
const ymd = t => new Date(t).toISOString().slice(0,10).replace(/-/g,'');
async function pool(items, n, fn){ const out=[]; let i=0; await Promise.all(Array.from({length:n}, async()=>{ while(i<items.length){ const k=i++; out[k]=await fn(items[k]); } })); return out; }
function seasonStart(sp){ const now = new Date(), y = now.getUTCFullYear(), m = now.getUTCMonth()+1;
  // NHL: octubre; NCAA: noviembre. Si estamos antes, es la temporada que empezó el año pasado.
  const startM = sp==='nhl' ? 10 : 11, yy = m >= (sp==='nhl' ? 9 : 10) ? y : y-1; return Date.UTC(yy, startM-1, 1); }
(async()=>{
  for(const [sp, path, q] of [['nhl','hockey/nhl',''], ['ncaa','basketball/mens-college-basketball','&groups=50&limit=400']]){
    const dates = []; for(let t = seasonStart(sp); t <= Date.now(); t += 864e5) dates.push(ymd(t));
    const B = await pool(dates, 6, d => get(`${API}/${path}/scoreboard?dates=${d}${q}`));
    const T = {}, seen = new Set();
    B.forEach(b => (b && b.events || []).forEach(ev => { const c = ev.competitions && ev.competitions[0]; if(!c || seen.has(ev.id)) return; const st = c.status && c.status.type; if(!st || !st.completed) return;
      seen.add(ev.id);
      c.competitors.forEach(x => { const o = c.competitors.find(y => y !== x); const f = parseInt(x.score,10), a = parseInt(o.score,10); if(isNaN(f)||isNaN(a)) return;
        const t = T[x.team.id] = T[x.team.id] || {id:String(x.team.id), name:x.team.displayName||x.team.name, abbr:x.team.abbreviation, gp:0, pfs:0, pas:0, w:0, l:0};
        t.gp++; t.pfs += f; t.pas += a; if(x.winner===true) t.w++; else t.l++; }); }));
    const teams = {}; Object.values(T).forEach(t => { if(t.gp) teams[t.id] = {id:t.id, name:t.name, abbr:t.abbr, gp:t.gp, w:t.w, l:t.l, pf:+(t.pfs/t.gp).toFixed(2), pa:+(t.pas/t.gp).toFixed(2)}; });
    if(Object.keys(teams).length < 10){ console.log(sp, 'pocos equipos, no se guarda'); continue; }
    fs.writeFileSync(`equipos-${sp}.json`, JSON.stringify({t:Date.now(), partidos:seen.size, teams}));
    console.log(sp, seen.size, 'partidos ·', Object.keys(teams).length, 'equipos');
  }
})();

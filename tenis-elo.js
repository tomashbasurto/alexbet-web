// AlexBet · rating Elo de tenis (ATP y WTA) con los resultados de los últimos 150 días de ESPN.
// La prueba con partidos pasados mostró que el Elo acierta mejor que el ranking. Corre una vez al día y escribe elo-tenis.json.
'use strict';
const fs = require('fs');
const API = 'https://site.api.espn.com/apis/site/v2/sports/tennis';
const DAYS = parseInt(process.env.DAYS || '150', 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(u){ for(let i=0;i<3;i++){ try{ const r = await fetch(u,{headers:{'User-Agent':'Mozilla/5.0 AlexBet'}}); if(r.ok) return await r.json(); }catch(e){} await sleep(800*(i+1)); } return null; }
const ymd = t => new Date(t).toISOString().slice(0,10).replace(/-/g,'');
async function pool(items, n, fn){ const out=[]; let i=0; await Promise.all(Array.from({length:n}, async()=>{ while(i<items.length){ const k=i++; out[k]=await fn(items[k]); } })); return out; }
(async()=>{
  const now = Date.now(), dates = []; for(let t=now-DAYS*864e5; t<=now; t+=864e5) dates.push(ymd(t));
  const M = {};
  for(const tour of ['atp','wta']){
    const boards = await pool(dates, 4, d => get(`${API}/${tour}/scoreboard?dates=${d}`));
    boards.forEach(b => (b && b.events || []).forEach(e => (e.groupings||[]).forEach(g => (g.competitions||[]).forEach(c => {
      if(!/singles/.test((c.type&&c.type.slug)||'')) return; const st = c.status&&c.status.type; if(!st||!st.completed) return;
      if(/retired|walkover/i.test((st.name||'')+' '+(st.description||''))) return;
      const cs = (c.competitors||[]).slice().sort((p,q)=>(p.order||0)-(q.order||0)); if(cs.length!==2) return;
      const w = cs.findIndex(x=>x.winner===true); if(w<0) return;
      M[c.id] = {d:c.date, a:String(cs[0].id), b:String(cs[1].id), w};
    }))));
  }
  const L = Object.values(M).sort((x,y)=>x.d.localeCompare(y.d)), E = {}, N = {};
  for(const m of L){ const ea = E[m.a]??1500, eb = E[m.b]??1500, pA = 1/(1+Math.pow(10,(eb-ea)/400)), s = m.w===0?1:0;
    E[m.a] = ea+32*(s-pA); E[m.b] = eb+32*((1-s)-(1-pA)); N[m.a]=(N[m.a]||0)+1; N[m.b]=(N[m.b]||0)+1; }
  const r = {}; Object.keys(E).forEach(id=>{ if(N[id]>=8) r[id] = [Math.round(E[id]), N[id]]; });
  if(Object.keys(r).length < 100){ console.log('muy pocos jugadores, no se guarda', Object.keys(r).length); return; }
  fs.writeFileSync('elo-tenis.json', JSON.stringify({t:now, partidos:L.length, r}));
  console.log('elo-tenis.json', L.length, 'partidos', Object.keys(r).length, 'jugadores');
})();

// AlexBet · rating Elo de tenis (ATP y WTA) con los resultados de los últimos 150 días de ESPN.
// La prueba con partidos pasados mostró que el Elo acierta mejor que el ranking. Corre una vez al día y escribe elo-tenis.json.
// v35: también Elo por superficie (dura, arcilla, césped) y cara a cara.
'use strict';
const fs = require('fs');
const API = 'https://site.api.espn.com/apis/site/v2/sports/tennis';
const DAYS = parseInt(process.env.DAYS || '300', 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(u){ for(let i=0;i<3;i++){ try{ const r = await fetch(u,{headers:{'User-Agent':'Mozilla/5.0 AlexBet'}}); if(r.ok) return await r.json(); }catch(e){} await sleep(800*(i+1)); } return null; }
const ymd = t => new Date(t).toISOString().slice(0,10).replace(/-/g,'');
async function pool(items, n, fn){ const out=[]; let i=0; await Promise.all(Array.from({length:n}, async()=>{ while(i<items.length){ const k=i++; out[k]=await fn(items[k]); } })); return out; }
// superficie por nombre del torneo (ESPN no la trae): c = arcilla, g = césped, h = dura (por defecto)
function tnSurface(name, iso) {
  const n = String(name || '').toLowerCase(), mo = iso ? new Date(iso).getUTCMonth() + 1 : 0;
  if (/stuttgart/.test(n)) return mo >= 6 && mo <= 7 ? 'g' : 'c';
  if (/wimbledon|halle|queen|hertogenbosch|libema|mallorca|eastbourne|newport|berlin|nottingham|birmingham|bad homburg|grass/.test(n)) return 'g';
  if (/roland|french open|madrid|rome|italian|internazionali|monte|barcelona|hamburg|gstaad|kitzb|umag|bastad|nordea|buenos aires|rio |rio open|santiago|chile|estoril|geneva|lyon|bucharest|houston|marrakech|munich|bmw open|charleston|bogota|rabat|strasbourg|palermo|prague|budapest|lausanne|iasi|cluj|parma|clay|cordoba|morocco|tiriac|altesse|lalla|hassan|generali|plava laguna|parc|mutua|bnl|swedish open|cagliari|oeiras|braga|sardegna|bad gastein|iasi|hamburg european/.test(n)) return 'c';
  return 'h';
}
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
      const sets = cs.map(x => (x.linescores || []).map(q => Math.round(q.value || 0)));
      M[c.id] = {d:c.date, a:String(cs[0].id), b:String(cs[1].id), w, s:tnSurface(e.name || e.shortName, c.date), ev:(e.name || e.shortName || '').slice(0, 40), rd:((c.round && c.round.displayName) || '').slice(0, 20), sets};
    }))));
  }
  const L = Object.values(M).sort((x,y)=>x.d.localeCompare(y.d)), E = {}, N = {}, ES = {}, NS = {}, H2H = {};
  for(const m of L){
    const ea = E[m.a]??1500, eb = E[m.b]??1500, pA = 1/(1+Math.pow(10,(eb-ea)/400)), s = m.w===0?1:0;
    E[m.a] = ea+32*(s-pA); E[m.b] = eb+32*((1-s)-(1-pA)); N[m.a]=(N[m.a]||0)+1; N[m.b]=(N[m.b]||0)+1;
    // Elo por superficie
    const ka = m.a+'|'+m.s, kb = m.b+'|'+m.s, sa = ES[ka]??(E[m.a]-32*(s-pA)), sb = ES[kb]??(E[m.b]-32*((1-s)-(1-pA))), qA = 1/(1+Math.pow(10,(sb-sa)/400));
    ES[ka] = sa+32*(s-qA); ES[kb] = sb+32*((1-s)-(1-qA)); NS[ka]=(NS[ka]||0)+1; NS[kb]=(NS[kb]||0)+1;
    // cara a cara
    const [x, y] = m.a < m.b ? [m.a, m.b] : [m.b, m.a], winner = m.w===0 ? m.a : m.b, h = H2H[x+'|'+y] = H2H[x+'|'+y] || [0,0,[]]; h[winner===x?0:1]++;
    // detalle de cada enfrentamiento (marcador visto desde el jugador "x")
    const sx = m.a===x ? m.sets[0] : m.sets[1], sy = m.a===x ? m.sets[1] : m.sets[0];
    h[2].push([m.d.slice(0,10), m.ev, m.s, winner===x ? 0 : 1, sx.map((v,i)=>v+'-'+(sy[i]??0)).join(' '), m.rd]);
  }
  const r = {}; Object.keys(E).forEach(id=>{ if(N[id]>=8){ const sf = {}; ['h','c','g'].forEach(k=>{ if((NS[id+'|'+k]||0)>=5) sf[k] = [Math.round(ES[id+'|'+k]), NS[id+'|'+k]]; }); r[id] = [Math.round(E[id]), N[id], sf]; } });
  const h2h = {}; Object.entries(H2H).forEach(([k,v])=>{ if(v[0]+v[1]>=2) h2h[k] = [v[0], v[1], v[2].slice(-6).reverse()]; });
  if(Object.keys(r).length < 100){ console.log('muy pocos jugadores, no se guarda', Object.keys(r).length); return; }
  fs.writeFileSync('elo-tenis.json', JSON.stringify({t:now, partidos:L.length, r, h2h}));
  console.log('elo-tenis.json', L.length, 'partidos', Object.keys(r).length, 'jugadores');
})();

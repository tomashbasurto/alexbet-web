// AlexBet · alertas con la app cerrada (corre en GitHub Actions) -> notificaciones por ntfy.
// Avisa de: (1) partido en vivo "movido" (muchos córners o tarjetas) y (2) cuotas que se mueven 3 pp o más.
// (El aviso de "posible valor" necesita el modelo de la app y solo funciona con la app abierta.)
'use strict';
const fs = require('fs');
const TOPIC = (process.env.NTFY_TOPIC || '').trim();
const NTFY = (process.env.NTFY_URL || 'https://ntfy.sh').replace(/\/$/, '');
const API = process.env.ESPN_API || 'https://site.api.espn.com/apis/site/v2/sports';
const SEEN_FILE = process.env.SEEN_FILE || 'alerts-seen.json';
const SLUGS = ['ecu.1','eng.2','ger.2','uefa.champions','uefa.europa','uefa.europa.conf','bra.1','esp.1','eng.1','ita.1','ger.1','fra.1','por.1','tur.1','ned.1','conmebol.libertadores','conmebol.sudamericana','arg.1','col.1','mex.1','usa.1'];
const LAM = {corners: 10.2, cards: 4.2, goals: 2.7, nba: 222, mlb: 8.8}; // promedios generales de un partido completo (sin datos por equipo)
const get = async u => { const r = await fetch(u, {headers:{accept:'application/json'}}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); };
function pAtLeast(k, lam){ if(k<=0) return 1; let term = Math.exp(-lam), cdf = term; for(let i=1;i<k;i++){ term *= lam/i; cdf += term; } return Math.max(0, 1-cdf); }
function moved(kind, pos, n, lam, T){
  T = T||90;
  const C = {corners:{r:1.35,n:5,a:15,b:82}, cards:{r:1.5,n:3,a:15,b:82}, goals:{r:1.5,n:3,a:15,b:80}, runs:{r:1.4,n:6,a:3,b:7}}[kind];
  if(!C || pos<C.a || pos>C.b || n==null) return null;
  const exp = lam*pos/T; if(n < C.n || n < C.r*exp) return null;
  const w = pos/(pos+T/3), rate = w*(n/pos) + (1-w)*(lam/T), rem = rate*(T-pos); let best = null;
  for(let L=Math.floor(n)+0.5; L<=n+(kind==='runs'?10:8); L+=1){ const p = pAtLeast(Math.ceil(L)-n, rem); if(p>=0.70) best = {L, p}; }
  return best && {...best, exp};
}
const normCdf = x => { const t = 1/(1+0.2316419*Math.abs(x)), d = 0.3989423*Math.exp(-x*x/2), p = d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274)))); return x>0 ? 1-p : p; };
function nbaPace(T, e, rem){
  if(e<10 || rem<6) return null;
  const norm = LAM.nba/48; if((T/e)/norm < 1.10) return null;
  const w = e/(e+24), rate = w*(T/e)+(1-w)*norm, mean = T+rate*rem, sd = Math.max(3, 18*Math.sqrt(rem/48)); let best = null;
  for(let L=Math.floor(T)+0.5; L<=mean+40; L+=1){ const p = 1-normCdf((L-mean)/sd); if(p>=0.70) best = {L,p}; }
  return best && {...best, exp:norm*e};
}
const am = o => { o = String(o==null?'':o).trim().toUpperCase(); if(o==='EVEN') return .5; const n = parseFloat(o); if(!n) return null; return n<0 ? -n/(-n+100) : 100/(n+100); };
function fair(a){ const p = a.map(am); if(p.some(x=>x==null)) return null; const s = p.reduce((x,y)=>x+y,0); return p.map(x=>x/s); }
function mlMoves(od, hn, an){
  const ml = od && od.moneyline; if(!ml || !ml.home || !ml.away) return null;
  const sides = [['home',hn],['away',an]]; if(ml.draw) sides.push(['draw','Empate']);
  const o = [], c = [];
  for(const [k] of sides){ const x = ml[k]; if(!x || !x.open || !x.close) return null; o.push(x.open.odds); c.push(x.close.odds); }
  const fo = fair(o), fc = fair(c); if(!fo || !fc) return null;
  let best = null; sides.forEach(([k,n],i)=>{ const d = (fc[i]-fo[i])*100; if(!best || Math.abs(d)>Math.abs(best.d)) best = {n,d,now:fc[i]}; });
  return best;
}
const stat = (t, n) => { const it = (t.statistics||[]).find(s=>s.name===n); if(!it) return null; const v = parseFloat(it.displayValue!=null?it.displayValue:it.value); return isNaN(v)?null:v; };
function minuteOf(c){ const dc = String((c.status&&c.status.displayClock)||''); const m = dc.match(/(\d+)/); return m ? parseInt(m[1],10) : null; }
const ymd = d => `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}`;
async function main(){
  const found = [], errs = [];
  // 1) soccer en vivo
  await Promise.all(SLUGS.map(async slug=>{
    try{
      const j = await get(`${API}/soccer/${slug}/scoreboard`);
      for(const ev of (j.events||[])){
        const c = ev.competitions && ev.competitions[0]; if(!c) continue;
        const st = (c.status&&c.status.type)||{}; if(st.state!=='in' || /HALF/i.test(st.name||'') && !/FIRST|SECOND/i.test(st.name||'')) continue;
        const H = c.competitors.find(x=>x.homeAway==='home'), A = c.competitors.find(x=>x.homeAway==='away'); if(!H||!A) continue;
        const min = minuteOf(c); if(min==null) continue;
        const s = await get(`${API}/soccer/${slug}/summary?event=${ev.id}`);
        const T = (s.boxscore && s.boxscore.teams) || []; if(T.length<2) continue;
        const th = T.find(t=>t.homeAway==='home')||T[0], ta = T.find(t=>t.homeAway==='away')||T[1];
        const hn = H.team.displayName||H.team.name, an = A.team.displayName||A.team.name, vs = `${hn} ${H.score}-${A.score} ${an} · ${min}'`;
        const ch = stat(th,'wonCorners'), ca = stat(ta,'wonCorners');
        if(ch!=null && ca!=null){ const C = ch+ca, r = moved('corners', min, C, LAM.corners);
          if(r) found.push({id:`corn|${ev.id}|${r.L}`, title:'Partido movido · córners', msg:`${vs}\n${C} córners (lo normal: ${r.exp.toFixed(1)}). Opción: Más de ${r.L} córners · modelo ${Math.round(r.p*100)}% · solo vale si la cuota es mayor a ${(1/r.p).toFixed(2)} (est.)`, tags:'soccer,fire', prio:4}); }
        const G = (parseInt(H.score,10)||0)+(parseInt(A.score,10)||0), rg = moved('goals', min, G, LAM.goals);
        if(rg) found.push({id:`goal|${ev.id}|${rg.L}`, title:'Partido movido · goles', msg:`${vs}\n${G} goles (lo normal: ${rg.exp.toFixed(1)}). Opción: Más de ${rg.L} goles · modelo ${Math.round(rg.p*100)}% · solo vale si la cuota es mayor a ${(1/rg.p).toFixed(2)} (est.)`, tags:'soccer,fire', prio:4});
        const yh = stat(th,'yellowCards'), ya = stat(ta,'yellowCards');
        if(yh!=null && ya!=null){ const K = yh+ya+(stat(th,'redCards')||0)+(stat(ta,'redCards')||0), r = moved('cards', min, K, LAM.cards);
          if(r) found.push({id:`card|${ev.id}|${r.L}`, title:'Partido movido · tarjetas', msg:`${vs}\n${K} tarjetas (lo normal: ${r.exp.toFixed(1)}). Opción: Más de ${r.L} tarjetas · modelo ${Math.round(r.p*100)}% · solo vale si la cuota es mayor a ${(1/r.p).toFixed(2)} (est.)`, tags:'soccer,warning', prio:4}); }
      }
    }catch(e){ errs.push(slug+': '+e.message); }
  }));
  // 1b) NBA y MLB en vivo (ritmo de puntos / carreras)
  for(const f of ['basketball/nba','baseball/mlb']){
    try{
      const j = await get(`${API}/${f}/scoreboard`);
      for(const ev of (j.events||[])){
        const c = ev.competitions && ev.competitions[0]; if(!c) continue; const st = (c.status&&c.status.type)||{}; if(st.state!=='in') continue;
        const H = c.competitors.find(x=>x.homeAway==='home'), A = c.competitors.find(x=>x.homeAway==='away'); if(!H||!A) continue;
        const hn = H.team.displayName||H.team.name, an = A.team.displayName||A.team.name, hs = parseInt(H.score,10)||0, as = parseInt(A.score,10)||0, T = hs+as;
        if(f.startsWith('basketball')){
          const per = (c.status&&c.status.period)||0; if(per<1||per>4) continue;
          const cm = String((c.status&&c.status.displayClock)||'').match(/^(\d+):(\d+)/); const left = cm ? parseInt(cm[1],10)+parseInt(cm[2],10)/60 : 0;
          const rem = (4-per)*12+left, r = nbaPace(T, 48-rem, rem);
          if(r) found.push({id:`nba|${ev.id}|${r.L}`, title:'Partido movido · puntos (NBA)', msg:`${hn} ${hs}-${as} ${an} · Q${per} ${c.status.displayClock}\n${T} puntos en ${(48-rem).toFixed(0)} min (ritmo normal: ${r.exp.toFixed(0)}). Opción: Más de ${r.L} puntos · modelo ${Math.round(r.p*100)}% · solo vale si la cuota es mayor a ${(1/r.p).toFixed(2)} (est.)`, tags:'basketball,fire', prio:4});
        } else {
          const d = String(st.detail||st.shortDetail||''), mm = d.match(/(top|bot\w*|mid\w*|end)\s*(?:of\s*the\s*)?(\d+)/i); if(!mm) continue;
          const k = mm[1].toLowerCase(), n = parseInt(mm[2],10), el = k==='top' ? 2*(n-1) : (k.startsWith('bot')||k.startsWith('mid')) ? 2*(n-1)+1 : 2*n;
          const r = moved('runs', el/2, T, LAM.mlb, 9);
          if(r) found.push({id:`mlb|${ev.id}|${r.L}`, title:'Partido movido · carreras (MLB)', msg:`${hn} ${hs}-${as} ${an} · ${d}\n${T} carreras (lo normal: ${r.exp.toFixed(1)}). Opción: Más de ${r.L} carreras · modelo ${Math.round(r.p*100)}% · solo vale si la cuota es mayor a ${(1/r.p).toFixed(2)} (est.)`, tags:'baseball,fire', prio:4});
        }
      }
    }catch(e){ errs.push(f+': '+e.message); }
  }
  // 2) cuotas en movimiento (próximos partidos)
  const now = new Date(), range = `${ymd(now)}-${ymd(new Date(now.getTime()+3*86400e3))}`;
  const feeds = SLUGS.map(s=>`soccer/${s}`).concat(['basketball/nba','baseball/mlb']);
  await Promise.all(feeds.map(async f=>{
    try{
      const j = await get(`${API}/${f}/scoreboard?dates=${range}`);
      for(const ev of (j.events||[])){
        const c = ev.competitions && ev.competitions[0]; if(!c) continue;
        if(((c.status&&c.status.type)||{}).state!=='pre') continue;
        const H = c.competitors.find(x=>x.homeAway==='home'), A = c.competitors.find(x=>x.homeAway==='away'); if(!H||!A) continue;
        const hn = H.team.displayName||H.team.name, an = A.team.displayName||A.team.name;
        const mv = mlMoves(c.odds && c.odds[0], hn, an);
        if(mv && Math.abs(mv.d)>=3) found.push({id:`mov|${ev.id}|${mv.n}|${Math.round(mv.d)}`, title:'Cuota en movimiento', msg:`${mv.n} ${mv.d>0?'▲':'▼'} ${Math.abs(mv.d).toFixed(1)} pp (${mv.d>0?'el mercado la ve más probable':'el mercado la ve menos probable'}) · ahora ${Math.round(mv.now*100)}%\n${hn} vs ${an} · ${String(ev.date).slice(0,16).replace('T',' ')} UTC`, tags:'chart_with_upwards_trend', prio:3});
      }
    }catch(e){ if(!/HTTP 400/.test(e.message)) errs.push(f+': '+e.message); }
  }));
  let seen = {}; try{ seen = JSON.parse(fs.readFileSync(SEEN_FILE,'utf8')); }catch(e){}
  const t = Date.now(); Object.keys(seen).forEach(k=>{ if(t-seen[k] > 12*3600e3) delete seen[k]; });
  let sent = 0;
  for(const a of found){
    if(seen[a.id]) continue;
    if(!TOPIC){ console.log('[sin NTFY_TOPIC] '+a.title+' :: '+a.msg.replace(/\n/g,' | ')); continue; }
    const r = await fetch(NTFY, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({topic:TOPIC, title:a.title, message:a.msg, tags:a.tags.split(','), priority:a.prio})});
    if(r.ok){ seen[a.id] = t; sent++; } else errs.push('ntfy HTTP '+r.status);
  }
  fs.writeFileSync(SEEN_FILE, JSON.stringify(seen));
  console.log(`Alertas encontradas: ${found.length} · enviadas: ${sent}${errs.length?' · avisos: '+errs.slice(0,5).join(' | '):''}`);
}
main().catch(e=>{ console.error(e); process.exit(1); });

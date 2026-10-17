// AlexBet · resumen del día por ntfy (corre en GitHub Actions cada mañana).
// Abre la propia app en un navegador sin pantalla, usa SU modelo con los datos de datos.json y envía las mejores opciones de hoy.
'use strict';
const fs = require('fs'), path = require('path');
const TOPIC = (process.env.NTFY_TOPIC || '').trim();
const NTFY = (process.env.NTFY_URL || 'https://ntfy.sh').replace(/\/$/, '');
const FAVS = (process.env.FAVORITOS || '').split(',').map(x=>x.trim()).filter(Boolean);
const INDEX = process.env.INDEX_HTML || 'index.html', DATA = process.env.DATOS_JSON || 'datos.json';
(async()=>{
  const { chromium } = require('playwright');
  const b = await chromium.launch(); const pg = await b.newPage({viewport:{width:420,height:900}});
  if(fs.existsSync(DATA)) await pg.route('**/datos.json*', r=>r.fulfill({status:200, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body:fs.readFileSync(DATA)}));
  await pg.goto('file://'+path.resolve(INDEX)); await pg.waitForFunction(()=>Object.keys(localStorage).some(k=>k.indexOf('ab_fx_')===0), null, {timeout:60000}).catch(()=>{}); await pg.waitForTimeout(3500);
  const calc = (favs)=>pg.evaluate(async (favs)=>{
    const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'');
    const isF = n => { const x = norm(n); return !!x && favs.some(f=>{ const y = norm(f); return y && (x===y||x.includes(y)||y.includes(x)); }); };
    const today = ymd(todayDate), rows = [];
    LEAGUES.forEach(l=>l.fixtures.forEach(f=>{
      if(!l.teams[f[0]] || !l.teams[f[1]] || isoDateOnlyEcuador(f[2], l.utcOffset)!==today) return;
      const pk = matchPicks(l,f), t = pk && pk.picks[0];
      rows.push({lg:l.name, h:f[0], a:f[1], time:fmtParts(f[2], l.utcOffset).time, fav:isF(f[0])||isF(f[1]), pick:t?{label:t.label, prob:t.prob, conf:t.conf}:null, score:t?t.score:0});
    }));
    for(const sp of ['nba','mlb']){
      try{ await usLoad(sp); await new Promise(r=>setTimeout(r,800)); }catch(e){}
      (usData[sp].games||[]).filter(g=>g.state==='pre' && !g.postponed && isoDateOnlyEcuador(g.d,0)===today).forEach(g=>{
        const pk = usPicks(g, usPre(g)), t = pk[0];
        rows.push({lg:US[sp].name, h:g.h.name, a:g.a.name, time:fmtParts(g.d,0).time, fav:isF(g.h.name)||isF(g.a.name), pick:t?{label:t.label, prob:t.prob, conf:t.conf}:null, score:t?t.score:0});
      });
    }
    return {today, rows};
  }, favs);
  let out = {today:'', rows:[]};
  for(let i=0;i<5;i++){ out = await calc(FAVS); if(out.rows.length) break; await pg.waitForTimeout(8000); }
  await b.close();
  const R = out.rows, withP = R.filter(r=>r.pick).sort((a,b)=>b.score-a.score).slice(0,5), favs = R.filter(r=>r.fav).sort((a,b)=>a.time.localeCompare(b.time)).slice(0,8);
  if(!R.length){ console.log('Hoy no hay partidos en la app: no se envía resumen.'); return; }
  const d = out.today.split('-').reverse().slice(0,2).join('/');
  let msg = `${R.length} partidos hoy (hora Ecuador).`;
  if(favs.length) msg += `\n\n★ Tus equipos:\n` + favs.map(r=>`• ${r.time} ${r.h} vs ${r.a}${r.pick?` — ${r.pick.label} (${r.pick.prob}%)`:''}`).join('\n');
  if(withP.length) msg += `\n\nMejores opciones del modelo:\n` + withP.map((r,i)=>`${i+1}. ${r.pick.label} · ${r.pick.prob}%${r.pick.conf==='est'?' (est.)':''}\n   ${r.h} vs ${r.a} · ${r.time} · ${r.lg}`).join('\n');
  else msg += '\n\nNingún mercado supera el 60%: hoy no hay una opción clara.';
  msg += '\n\nSon estimaciones, no garantizan el resultado.';
  console.log(msg);
  if(!TOPIC){ console.log('[sin NTFY_TOPIC] no se envía'); return; }
  const r = await fetch(NTFY, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({topic:TOPIC, title:`Resumen del día ${d} · AlexBet`, message:msg, tags:['sunrise'], priority:3})});
  console.log('ntfy', r.status);
})().catch(e=>{ console.error(e); process.exit(1); });

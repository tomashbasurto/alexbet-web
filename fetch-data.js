// AlexBet · descarga de datos (corre en GitHub Actions, no en el navegador).
// Fuentes: football-data.org (clave en el secreto FD_KEY), ESPN y football-data.co.uk. Escribe datos.json.
'use strict';
const fs = require('fs');
const FD_KEY = (process.env.FD_KEY || '').trim();
const FD_BASE = process.env.FD_BASE || 'https://api.football-data.org/v4';
const ESPN_BASE = process.env.ESPN_BASE || 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const CSV_BASE = process.env.CSV_BASE || 'https://www.football-data.co.uk/mmz4281/';
const FD_GAP = parseInt(process.env.FD_GAP || '6500', 10);
const OUT = process.env.OUT || 'datos.json';
const MAX_SUMMARIES = parseInt(process.env.MAX_SUMMARIES || '250', 10);

const LEAGUES = [
  {id:'ecuador', name:'LigaPro Ecuador', espn:'ecu.1', primary:'espn'},
  {id:'bra2', name:'Série B (Brasil)', espn:'bra.2', primary:'espn'},
  {id:'ucl', name:'Champions League', fd:'CL', espn:'uefa.champions', primary:'espn'},
  {id:'uel', name:'Europa League', espn:'uefa.europa', primary:'espn'},
  {id:'uecl', name:'Conference League', espn:'uefa.europa.conf', primary:'espn'},
  {id:'bra', name:'Brasileirão', fd:'BSA', espn:'bra.1', primary:'espn'},
  {id:'laliga', name:'La Liga', fd:'PD', espn:'esp.1', csv:'SP1', primary:'fd'},
  {id:'epl', name:'Premier League', fd:'PL', espn:'eng.1', csv:'E0', primary:'fd'},
  {id:'seriea', name:'Serie A', fd:'SA', espn:'ita.1', csv:'I1', primary:'fd'},
  {id:'bundes', name:'Bundesliga', fd:'BL1', espn:'ger.1', csv:'D1', primary:'fd'},
  {id:'bundes2', name:'2. Bundesliga', espn:'ger.2', csv:'D2', primary:'espn'},
  {id:'champ', name:'Championship (Inglaterra 2)', fd:'ELC', espn:'eng.2', csv:'E1', primary:'fd'},
  {id:'ligue1', name:'Ligue 1', fd:'FL1', espn:'fra.1', csv:'F1', primary:'fd'},
  {id:'portugal', name:'Primeira Liga', fd:'PPL', espn:'por.1', csv:'P1', primary:'fd'},
  {id:'turkey', name:'Süper Lig', espn:'tur.1', csv:'T1', primary:'espn'},
  {id:'netherlands', name:'Eredivisie', fd:'DED', espn:'ned.1', csv:'N1', primary:'fd'},
  {id:'lib', name:'Copa Libertadores', espn:'conmebol.libertadores', primary:'espn'},
  {id:'sud', name:'Copa Sudamericana', espn:'conmebol.sudamericana', primary:'espn'},
  {id:'arg', name:'Liga Argentina', espn:'arg.1', primary:'espn'},
  {id:'col', name:'Liga Colombia', espn:'col.1', primary:'espn'},
  {id:'mex', name:'Liga MX', espn:'mex.1', primary:'espn'},
  {id:'mls', name:'MLS', espn:'usa.1', primary:'espn'},
  {id:'laliga2', name:'LaLiga 2', espn:'esp.2', csv:'SP2', primary:'espn'},
  {id:'serieb', name:'Serie B (Italia)', espn:'ita.2', csv:'I2', primary:'espn'},
  {id:'ligue2', name:'Ligue 2', espn:'fra.2', csv:'F2', primary:'espn'},
  {id:'league1', name:'League One (Inglaterra 3)', espn:'eng.3', csv:'E2', primary:'espn'},
  {id:'league2', name:'League Two (Inglaterra 4)', espn:'eng.4', csv:'E3', primary:'espn'},
  {id:'natleague', name:'National League (Inglaterra 5)', espn:'eng.5', csv:'EC', primary:'espn'},
  {id:'scotprem', name:'Premiership (Escocia)', espn:'sco.1', csv:'SC0', primary:'espn'},
  {id:'scotchamp', name:'Championship (Escocia)', espn:'sco.2', csv:'SC1', primary:'espn'},
  {id:'belgium', name:'Pro League (Bélgica)', espn:'bel.1', csv:'B1', primary:'espn'},
  {id:'greece', name:'Super League (Grecia)', espn:'gre.1', csv:'G1', primary:'espn'},
  // v48 · selecciones: 18 meses de partidos para medir la forma de cada selección
  {id:'selamist', name:'Amistosos internacionales', espn:'fifa.friendly', primary:'espn', cup:1, nat:1},
  {id:'wcqsa', name:'Eliminatorias Sudamérica', espn:'fifa.worldq.conmebol', primary:'espn', cup:1, nat:1},
  {id:'copaam', name:'Copa América', espn:'conmebol.america', primary:'espn', cup:1, nat:1},
  {id:'mundial', name:'Mundial', espn:'fifa.world', primary:'espn', cup:1, nat:1},
  {id:'unl', name:'Liga de Naciones UEFA', espn:'uefa.nations', primary:'espn', cup:1, nat:1},
  {id:'wcqeu', name:'Eliminatorias Europa', espn:'fifa.worldq.uefa', primary:'espn', cup:1, nat:1},
  {id:'euro', name:'Eurocopa', espn:'uefa.euro', primary:'espn', cup:1, nat:1},
  {id:'euroq', name:'Eliminatorias Eurocopa', espn:'uefa.euroq', primary:'espn', cup:1, nat:1},
  {id:'cnl', name:'Liga de Naciones CONCACAF', espn:'concacaf.nations.league', primary:'espn', cup:1, nat:1},
  {id:'wcqcc', name:'Eliminatorias CONCACAF', espn:'fifa.worldq.concacaf', primary:'espn', cup:1, nat:1},
  {id:'gold', name:'Copa Oro', espn:'concacaf.gold', primary:'espn', cup:1, nat:1},
  {id:'afcon', name:'Copa Africana', espn:'caf.nations', primary:'espn', cup:1, nat:1},
  {id:'afconq', name:'Eliminatorias Copa Africana', espn:'caf.nations_qual', primary:'espn', cup:1, nat:1},
  {id:'wcqcaf', name:'Eliminatorias África', espn:'fifa.worldq.caf', primary:'espn', cup:1, nat:1},
  {id:'asian', name:'Copa Asiática', espn:'afc.asian.cup', primary:'espn', cup:1, nat:1},
  {id:'wcqafc', name:'Eliminatorias Asia', espn:'fifa.worldq.afc', primary:'espn', cup:1, nat:1},
  {id:'copaecu', name:'Copa Ecuador', manual:1, tsdb:'5636', primary:'manual', cup:1},
  {id:'supecu', name:'Supercopa Ecuador', manual:1, tsdb:'5884', primary:'manual', cup:1},
  {id:'facup', name:'FA Cup', espn:'eng.fa', primary:'espn', cup:1},
  {id:'eflcup', name:'Copa de la Liga (Carabao Cup)', espn:'eng.league_cup', primary:'espn', cup:1},
  {id:'efltrophy', name:'EFL Trophy', espn:'eng.trophy', primary:'espn', cup:1},
  {id:'comshield', name:'Community Shield', espn:'eng.charity', primary:'espn', cup:1},
  {id:'cdr', name:'Copa del Rey', espn:'esp.copa_del_rey', primary:'espn', cup:1},
  {id:'supesp', name:'Supercopa de España', espn:'esp.super_cup', primary:'espn', cup:1},
  {id:'coppait', name:'Coppa Italia', espn:'ita.coppa_italia', primary:'espn', cup:1},
  {id:'supita', name:'Supercoppa Italiana', espn:'ita.super_cup', primary:'espn', cup:1},
  {id:'pokal', name:'DFB-Pokal (Copa de Alemania)', espn:'ger.dfb_pokal', primary:'espn', cup:1},
  {id:'supger', name:'Supercopa de Alemania', espn:'ger.super_cup', primary:'espn', cup:1},
  {id:'cdf', name:'Copa de Francia', espn:'fra.coupe_de_france', primary:'espn', cup:1},
  {id:'tdc', name:'Trofeo de Campeones (Francia)', espn:'fra.super_cup', primary:'espn', cup:1},
  {id:'scocup', name:'Copa de Escocia', espn:'sco.tennents', primary:'espn', cup:1},
  {id:'scolc', name:'Copa de la Liga (Escocia)', espn:'sco.cis', primary:'espn', cup:1},
  {id:'scochal', name:'Challenge Cup (Escocia)', espn:'sco.challenge', primary:'espn', cup:1},
  {id:'knvb', name:'Copa KNVB (Holanda)', espn:'ned.cup', primary:'espn', cup:1},
  {id:'jcs', name:'Supercopa de Holanda', espn:'ned.supercup', primary:'espn', cup:1},
  {id:'taca', name:'Taça de Portugal', espn:'por.taca.portugal', primary:'espn', cup:1},
  {id:'cdb', name:'Copa do Brasil', espn:'bra.copa_do_brazil', primary:'espn', cup:1},
  {id:'supbra', name:'Supercopa do Brasil', espn:'bra.supercopa_do_brazil', primary:'espn', cup:1},
  {id:'paulista', name:'Campeonato Paulista', espn:'bra.camp.paulista', primary:'espn', cup:1},
  {id:'carioca', name:'Campeonato Carioca', espn:'bra.camp.carioca', primary:'espn', cup:1},
  {id:'mineiro', name:'Campeonato Mineiro', espn:'bra.camp.mineiro', primary:'espn', cup:1},
  {id:'gaucho', name:'Campeonato Gaúcho', espn:'bra.camp.gaucho', primary:'espn', cup:1},
  {id:'copaarg', name:'Copa Argentina', espn:'arg.copa', primary:'espn', cup:1},
  {id:'suparg', name:'Supercopa Argentina', espn:'arg.supercopa', primary:'espn', cup:1},
  {id:'tdcarg', name:'Trofeo de Campeones (Argentina)', espn:'arg.trofeo_de_la_campeones', primary:'espn', cup:1},
  {id:'copacol', name:'Copa Colombia', espn:'col.copa', primary:'espn', cup:1},
  {id:'supcol', name:'Superliga (Colombia)', espn:'col.superliga', primary:'espn', cup:1},
  {id:'ccmx', name:'Campeón de Campeones (México)', espn:'mex.campeon', primary:'espn', cup:1},
  {id:'usopen', name:'US Open Cup', espn:'usa.open', primary:'espn', cup:1},
  {id:'leaguescup', name:'Leagues Cup', espn:'concacaf.leagues.cup', primary:'espn', cup:1},
  {id:'concachamp', name:'Concacaf Champions Cup', espn:'concacaf.champions', primary:'espn', cup:1},
  {id:'recopa', name:'Recopa Sudamericana', espn:'conmebol.recopa', primary:'espn', cup:1},
  {id:'supuefa', name:'Supercopa de Europa', espn:'uefa.super_cup', primary:'espn', cup:1},
];
const FINISHED = ['FT','AET','PEN'];
const log = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let lastFd = 0, fdDead = !FD_KEY;

function seasonYear(id){
  const now = new Date(), y = now.getUTCFullYear();
  return ['bra','bra2','ecuador','lib','sud','arg','col','mex','mls','copaecu','supecu','cdb','supbra','paulista','carioca','mineiro','gaucho','copaarg','suparg','tdcarg','copacol','supcol','ccmx','usopen','leaguescup','concachamp','recopa'].includes(id) ? y : (now.getUTCMonth()>=6 ? y : y-1);
}
async function getJson(url, headers){
  const r = await fetch(url, {headers: headers || {}});
  if(!r.ok){ const e = new Error('HTTP '+r.status+' '+url.replace(/^https?:\/\/[^/]+/,'').slice(0,100)); e.status = r.status; throw e; }
  return r.json();
}
async function getText(url){
  const r = await fetch(url);
  if(!r.ok){ const e = new Error('HTTP '+r.status+' '+url.replace(/^https?:\/\/[^/]+/,'').slice(0,100)); e.status = r.status; throw e; }
  return r.text();
}
async function fdGet(path){
  for(let a=0;a<3;a++){
    const wait = FD_GAP-(Date.now()-lastFd); if(wait>0) await sleep(wait);
    lastFd = Date.now();
    const r = await fetch(FD_BASE+path, {headers:{'X-Auth-Token':FD_KEY}});
    if(r.status===429){ await sleep(20000); continue; }
    let j = {}; try{ j = await r.json(); }catch(e){}
    if(!r.ok){ const e = new Error((j.message||'HTTP '+r.status)); e.status = r.status; throw e; }
    return j;
  }
  throw new Error('límite de consultas por minuto');
}
function normName(s){
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/manchester/g,'man').replace(/internazionale/g,'inter').replace(/\bnott'?m\b/g,'nottingham')
    .replace(/\b(fc|cf|ac|as|sc|afc|ss|us|ud|rc|cd|fk|sk|bk|sv|vfb|vfl|tsg|rb|1\.|\d{4})\b/g,'')
    .replace(/[^a-z0-9]+/g,' ').trim();
}
function sameTeam(a,b){
  const x = normName(a), y = normName(b);
  if(!x || !y) return false;
  if(x===y || x.includes(y) || y.includes(x)) return true;
  const tx = x.split(' ').filter(w=>w.length>=4), ty = y.split(' ');
  return tx.some(w=>ty.includes(w));
}
const FD_STATUS = {FINISHED:'FT', SCHEDULED:'NS', TIMED:'NS', IN_PLAY:'LIVE', PAUSED:'LIVE', POSTPONED:'PST', SUSPENDED:'PST', CANCELLED:'CANC', AWARDED:'FT'};
function mapFd(j){
  return (j.matches||[]).map(m=>({i:'f'+m.id, h:m.homeTeam.shortName||m.homeTeam.name, a:m.awayTeam.shortName||m.awayTeam.name,
    d:String(m.utcDate).slice(0,16), s:FD_STATUS[m.status]||'NS',
    g:[m.score&&m.score.fullTime?m.score.fullTime.home:null, m.score&&m.score.fullTime?m.score.fullTime.away:null]}));
}
const NAT_LOGOS = {};
function mapEspn(j, nat){
  const out = [];
  for(const ev of (j.events||[])){
    const c = ev.competitions && ev.competitions[0]; if(!c || !c.competitors) continue;
    const h = c.competitors.find(x=>x.homeAway==='home'), a = c.competitors.find(x=>x.homeAway==='away');
    if(!h || !a) continue;
    const st = (c.status && c.status.type) || (ev.status && ev.status.type) || {};
    let s = 'NS';
    if(st.completed) s = 'FT'; else if(st.state==='in') s = 'LIVE'; else if(/postpon|cancel|suspend|abandon/i.test((st.name||'')+(st.description||''))) s = 'PST';
    const num = v => { const n = parseInt(v,10); return isNaN(n) ? null : n; };
    if(nat) [h, a].forEach(x=>{ if(x.team && x.team.logo) NAT_LOGOS[x.team.displayName||x.team.name] = x.team.logo; });
    out.push({i:'e'+ev.id, h:h.team.displayName||h.team.name, a:a.team.displayName||a.team.name,
      d:String(ev.date).slice(0,16), s, g:s==='FT' ? [num(h.score),num(a.score)] : [null,null],
      v: (c.venue && c.venue.address && c.venue.address.city) ? [c.venue.address.city, c.venue.address.country||''].join('|') : undefined});
  }
  return out;
}
async function espnFixtures(cfg, prev){
  const t0 = Date.now()-(cfg.nat ? 540 : 75)*86400e3, t1 = Date.now()+19*86400e3;
  const old = cfg.nat && prev && prev.deep ? prev.fx || [] : null; // selecciones: los meses viejos ya guardados no se vuelven a pedir
  const months = [];
  for(let d = new Date(Date.UTC(new Date(t0).getUTCFullYear(), new Date(t0).getUTCMonth(), 1)); d.getTime() <= t1; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 1))){
    const yy = d.getUTCFullYear(), mm = String(d.getUTCMonth()+1).padStart(2,'0');
    const last = new Date(Date.UTC(yy, d.getUTCMonth()+1, 0)).getUTCDate();
    months.push({m:`${yy}${mm}`, r:`${yy}${mm}01-${yy}${mm}${String(last).padStart(2,'0')}`});
  }
  const seen = new Map(); let lastErr = null;
  for(const w of months){
    const mEnd = Date.UTC(+w.m.slice(0,4), +w.m.slice(4,6), 1);
    if(old && mEnd < Date.now()-40*86400e3){ old.filter(f=>f.d.slice(0,7).replace('-','')===w.m).forEach(f=>seen.set(f.i,f)); continue; }
    try{ mapEspn(await getJson(`${ESPN_BASE}/${cfg.espn}/scoreboard?dates=${w.m}${cfg.nat?'&limit=500':''}`), cfg.nat).forEach(f=>seen.set(f.i,f)); }
    catch(e1){
      try{ mapEspn(await getJson(`${ESPN_BASE}/${cfg.espn}/scoreboard?dates=${w.r}`)).forEach(f=>seen.set(f.i,f)); }
      catch(e2){ lastErr = e2; }
    }
  }
  if(!seen.size && lastErr) throw lastErr;
  return [...seen.values()];
}
// v43/v44: torneos que ESPN no publica (Copa Ecuador): partidos de copas-manual.json + TheSportsDB (gratis)
// TheSportsDB con la clave libre solo entrega el último jugado y el próximo, así que se van acumulando en datos.json.
const TSDB = 'https://www.thesportsdb.com/api/v1/json/123/';
const ALIAS = {'ldu quito':'Liga de Quito', 'liga deportiva universitaria':'Liga de Quito', 'universidad catolica del ecuador':'Universidad Católica (Quito)',
  'universidad catolica':'Universidad Católica (Quito)', 'delfin sc':'Delfín', 'barcelona sporting club':'Barcelona SC', 'libertad fc':'Libertad (Ecuador)', 'libertad':'Libertad (Ecuador)',
  'manta':'Manta F.C.', 'tecnico universitario':'Técnico Universitario', 'guayaquil city':'Guayaquil City FC', 'deportivo cuenca':'Deportivo Cuenca', 'macara':'Macará', 'cs emelec':'Emelec', 'sd aucas':'Aucas'};
const plain = x => String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
function teamName(n, known){
  const p = plain(n); if(ALIAS[p]) return ALIAS[p];
  const k = known.find(x=>plain(x)===p) || known.find(x=>{ const q = plain(x).replace(/\b(fc|sc|cd|club)\b/g,'').trim(); return q.length>3 && (p.includes(q) || q.includes(p)); });
  return k || n;
}
async function tsdbFixtures(cfg, known){
  const out = [];
  for(const q of ['eventspastleague.php?id=', 'eventsnextleague.php?id=']){
    try{ const j = await getJson(TSDB+q+cfg.tsdb); (j.events||[]).forEach(e=>{
      const d = String(e.strTimestamp || ((e.dateEvent||'')+'T'+(e.strTime||'00:00'))).slice(0,16); if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(d)) return;
      const hs = parseInt(e.intHomeScore,10), as = parseInt(e.intAwayScore,10), fin = /FT|AET|PEN|Match Finished/i.test(e.strStatus||'') && !isNaN(hs) && !isNaN(as);
      out.push({h:teamName(e.strHomeTeam, known), a:teamName(e.strAwayTeam, known), d, g: fin ? [hs,as] : null, src:'tsdb'}); }); }
    catch(e){ log.push({name:cfg.name+' (TheSportsDB)', ok:false, msg:e.message}); }
    await sleep(2500); // la clave libre corta con muchas consultas seguidas
  }
  return out;
}
async function manualFixtures(cfg, prev, known){
  let M = {}; try{ M = JSON.parse(fs.readFileSync('copas-manual.json','utf8')); }catch(e){}
  const day = d => Math.floor(Date.parse(d+':00Z')/864e5), key = f => plain(f.h)+'|'+plain(f.a);
  const all = [];
  const put = (f, over) => {
    const x = all.find(y=>key(y)===key(f) && Math.abs(day(y.d)-day(f.d))<=1);
    if(!x){ all.push({...f}); return; }
    if(over){ x.d = f.d; if(f.g) x.g = f.g; } else if(f.g && !x.g) x.g = f.g;
  };
  ((prev && prev.fx) || []).forEach(f=>put({h:f.h, a:f.a, d:f.d, g:f.g && f.g[0]!=null ? f.g : null, i:f.i}, false));
  ((M[cfg.id] && M[cfg.id].fx) || []).filter(f=>f && f.h && f.a && f.d).forEach(f=>put({h:f.h, a:f.a, d:String(f.d).slice(0,16), g:Array.isArray(f.g)&&f.g[0]!=null ? [+f.g[0],+f.g[1]] : null}, true));
  let nT = 0; if(cfg.tsdb) (await tsdbFixtures(cfg, known)).forEach(f=>{ nT++; put(f, false); });
  const fx = all.map(f=>({i: f.i || 'm'+cfg.id+f.d.replace(/\D/g,'')+String(f.h).replace(/[^A-Za-z]/g,'').slice(0,6), h:f.h, a:f.a, d:f.d, s: f.g ? 'FT' : 'NS', g: f.g || [null,null]}))
    .sort((x,y)=>x.d.localeCompare(y.d));
  if(!fx.length){ log.push({name:cfg.name, ok:true, msg:'sin partidos por ahora'}); return null; }
  log.push({name:cfg.name, ok:true, msg:`${fx.length} partidos · manual${cfg.tsdb?' + TheSportsDB ('+nT+' leídos)':''}`});
  return {t:Date.now(), season:seasonYear(cfg.id), src:'manual', fx};
}
async function loadFixtures(cfg, prev, known){
  if(cfg.manual) return manualFixtures(cfg, prev, known||[]);
  const order = cfg.primary==='espn' ? ['espn','fd'] : ['fd','espn'];
  const errs = [];
  for(const src of order){
    if(!cfg[src] || (src==='fd' && fdDead)) continue;
    try{
      const fx = src==='fd' ? mapFd(await fdGet(`/competitions/${cfg.fd}/matches`)) : await espnFixtures(cfg, prev);
      if(!fx.length){ errs.push(`${src}: sin partidos`); continue; }
      log.push({name:cfg.name, ok:true, msg:`${fx.length} partidos · ${src==='fd'?'football-data.org':'ESPN'}`});
      return Object.assign({t:Date.now(), season:seasonYear(cfg.id), src, fx}, cfg.nat ? {deep:1} : {});
    }catch(e){
      errs.push(`${src==='fd'?'football-data.org':'ESPN'}: ${e.message}`);
      if(src==='fd' && e.status===401) fdDead = true;
    }
  }
  if(cfg.cup && errs.length && errs.every(e=>/sin partidos/.test(e))){ log.push({name:cfg.name, ok:true, msg:'sin partidos en estas fechas (fuera de temporada)'}); return null; }
  if(prev){ log.push({name:cfg.name, ok:false, msg:errs.join(' · ')+' · se conservan los datos anteriores'}); return prev; }
  log.push({name:cfg.name, ok:false, msg:errs.join(' · ') || 'sin fuente'});
  return null;
}
function applyCsv(txt, fx, stats){
  const lines = txt.split(/\r?\n/).filter(l=>l.trim());
  if(lines.length<2) return 0;
  const head = lines[0].replace(/^﻿/,'').split(',');
  const ix = n => head.indexOf(n);
  const iD=ix('Date'), iH=ix('HomeTeam'), iA=ix('AwayTeam'), iHG=ix('FTHG'), iAG=ix('FTAG'), iHY=ix('HY'), iAY=ix('AY'), iHC=ix('HC'), iAC=ix('AC'), iHS=ix('HS'), iAS=ix('AS'), iHT=ix('HST'), iAT=ix('AST'), iHF=ix('HF'), iAF=ix('AF'), iHR=ix('HR'), iAR=ix('AR');
  if(iD<0||iH<0||iHG<0||iHY<0||iHC<0) return 0;
  const fin = fx.filter(f=>FINISHED.includes(f.s)&&f.g&&f.g[0]!=null);
  let n = 0;
  for(let k=1;k<lines.length;k++){
    const c = lines[k].split(',');
    const hg = parseInt(c[iHG],10), ag = parseInt(c[iAG],10);
    if(isNaN(hg)||isNaN(ag)) continue;
    const m = String(c[iD]).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if(!m) continue;
    let yy = +m[3]; if(yy<100) yy += 2000;
    const day = Math.floor(Date.UTC(yy,+m[2]-1,+m[1])/864e5);
    let cand = fin.filter(f=>f.g[0]===hg && f.g[1]===ag && Math.abs(Math.floor(Date.parse(f.d+':00Z')/864e5)-day)<=1);
    if(cand.length>1) cand = cand.filter(f=>sameTeam(f.h,c[iH])||sameTeam(f.a,c[iA]));
    if(cand.length!==1) continue;
    const v = i => { const x = parseInt(c[i],10); return isNaN(x)?null:x; };
    const hy=v(iHY), ay=v(iAY), hc=v(iHC), ac=v(iAC);
    if(hy==null||ay==null||hc==null||ac==null) continue;
    const e = {y:[hy,ay], c:[hc,ac]};
    [['s',iHS,iAS],['t',iHT,iAT],['f',iHF,iAF],['r',iHR,iAR]].forEach(([k,a,b])=>{ if(a<0||b<0) return; const p = v(a), q = v(b); if(p!=null&&q!=null) e[k] = [p,q]; });
    stats[cand[0].i] = e;
    n++;
  }
  return n;
}
function applySummary(j, id, stats){
  const teams = j && j.boxscore && j.boxscore.teams;
  if(!teams || teams.length<2){ stats[id] = {n:1}; return false; }
  const get = (t,name) => { const it=(t.statistics||[]).find(s=>s.name===name); if(!it) return null; const v=parseInt(it.displayValue!=null?it.displayValue:it.value,10); return isNaN(v)?null:v; };
  const h = teams.find(t=>t.homeAway==='home')||teams[0], a = teams.find(t=>t.homeAway==='away')||teams[1];
  const y=[get(h,'yellowCards'),get(a,'yellowCards')], c=[get(h,'wonCorners'),get(a,'wonCorners')];
  if(y[0]==null&&y[1]==null&&c[0]==null&&c[1]==null){ stats[id] = {n:1}; return false; }
  const e = {y, c};
  [['s','totalShots'],['t','shotsOnTarget'],['f','foulsCommitted'],['r','redCards'],['p','possessionPct']].forEach(([k,nm])=>{ const p = get(h,nm), q = get(a,nm); if(p!=null&&q!=null) e[k] = [p,q]; });
  if(!e.s) e.nx = 1; // sin tiros publicados: no volver a pedirlo
  // árbitro principal (para el promedio de tarjetas por árbitro)
  const offs = (j.gameInfo && j.gameInfo.officials) || [];
  const ref = offs.find(x => /referee|árbitro|arbitro/i.test(String((x.position && (x.position.name || x.position.displayName)) || x.position || x.role || ''))) || offs[0];
  if(ref && (ref.displayName || ref.fullName)) e.ref = String(ref.displayName || ref.fullName).slice(0, 40);
  stats[id] = e; return true;
}

(async () => {
  let prev = {};
  try{ prev = JSON.parse(fs.readFileSync(OUT,'utf8')); }catch(e){}
  const out = {v:1, t:Date.now(), fx:{}, sc:{}, stats:Object.assign({}, prev.stats||{}), log};
  // 1) partidos
  for(const cfg of LEAGUES){
    const known = cfg.manual ? [...new Set(((out.fx.ecuador||{}).fx||[]).flatMap(f=>[f.h,f.a]))] : null;
    const r = await loadFixtures(cfg, prev.fx && prev.fx[cfg.id], known);
    if(r) out.fx[cfg.id] = r;
  }
  // 2) goleadores (football-data.org)
  for(const cfg of LEAGUES){
    if(!cfg.fd || fdDead) continue;
    try{
      const j = await fdGet(`/competitions/${cfg.fd}/scorers?limit=80`);
      out.sc[cfg.id] = {t:Date.now(), list:(j.scorers||[]).map(x=>({p:x.player.name, t:x.team.shortName||x.team.name, g:x.goals||0, a:x.assists||0, pen:x.penalties||0, m:x.playedMatches||0}))};
    }catch(e){
      log.push({name:'Goleadores '+cfg.name, ok:false, msg:e.message});
      if(prev.sc && prev.sc[cfg.id]) out.sc[cfg.id] = prev.sc[cfg.id];
      if(e.status===401) fdDead = true;
    }
  }
  // 3) tarjetas y córners: CSV de football-data.co.uk
  const csvFailed = new Set();
  for(const cfg of LEAGUES){
    if(!cfg.csv || !out.fx[cfg.id]) continue;
    const y = seasonYear(cfg.id);
    const code = String(y%100).padStart(2,'0') + String((y+1)%100).padStart(2,'0');
    try{
      const n = applyCsv(await getText(`${CSV_BASE}${code}/${cfg.csv}.csv`), out.fx[cfg.id].fx, out.stats);
      if(n===0) csvFailed.add(cfg.id);
      log.push({name:'Tarjetas/córners '+cfg.name, ok:n>0, msg:n>0 ? `${n} partidos · football-data.co.uk` : 'no se pudieron enlazar partidos con el CSV'});
    }catch(e){ csvFailed.add(cfg.id); log.push({name:'Tarjetas/córners '+cfg.name, ok:false, msg:e.message}); }
  }
  // 4) estadísticas por partido de ESPN (ligas sin CSV o con CSV fallido)
  const todo = [];
  for(const cfg of LEAGUES){
    if(cfg.csv && !csvFailed.has(cfg.id)) continue;
    const d = out.fx[cfg.id]; if(!d || d.src!=='espn') continue;
    const fin = d.fx.filter(f=>FINISHED.includes(f.s)&&f.g&&f.g[0]!=null).sort((a,b)=>b.d.localeCompare(a.d));
    const cnt = {};
    for(const f of fin){
      if((cnt[f.h]||0)<8 || (cnt[f.a]||0)<8){
        if(!out.stats[f.i]) todo.push({id:f.i, slug:cfg.espn});
        cnt[f.h]=(cnt[f.h]||0)+1; cnt[f.a]=(cnt[f.a]||0)+1;
      }
    }
  }
  const batch = todo.slice(0, MAX_SUMMARIES); let okN = 0, bad = 0;
  for(let i=0;i<batch.length;i+=5){
    await Promise.all(batch.slice(i,i+5).map(async t=>{
      try{ if(applySummary(await getJson(`${ESPN_BASE}/${t.slug}/summary?event=${t.id.slice(1)}`), t.id, out.stats)) okN++; }
      catch(e){ bad++; }
    }));
  }
  if(todo.length) log.push({name:'Estadísticas ESPN', ok:okN>0, msg:`${okN} partidos con datos${bad?`, ${bad} con error`:''}${todo.length>batch.length?` · faltan ${todo.length-batch.length}`:''}`});
  // limpiar estadísticas de partidos que ya no están
  const keep = new Set(); Object.values(out.fx).forEach(d=>d.fx.forEach(f=>keep.add(f.i)));
  Object.keys(out.stats).forEach(k=>{ if(!keep.has(k)) delete out.stats[k]; });
  // 5) logos de equipos (ESPN)
  out.logos = Object.assign({}, prev.logos||{});
  out.logosLg = Object.assign({}, prev.logosLg||{}); // v38.5: escudos por liga (mismo nombre en ligas distintas)
  const tl = {}; // v39.6: equipos oficiales de ESPN por liga [id, nombre, corto, nombre club, sigla, ciudad]
  for(const cfg of LEAGUES){
    if(!cfg.espn || cfg.nat) continue;
    try{
      const j = await getJson(`${ESPN_BASE}/${cfg.espn}/teams`);
      const ts = (((j.sports||[])[0]||{}).leagues||[])[0];
      ((ts&&ts.teams)||[]).forEach(x=>{ const t = x.team||x; const lg = (t.logos&&t.logos[0]&&t.logos[0].href)||t.logo; if(lg){ if(t.displayName) out.logos[t.displayName]=lg; if(t.shortDisplayName) out.logos[t.shortDisplayName]=lg; const L = out.logosLg[cfg.espn] = out.logosLg[cfg.espn] || {}; [t.displayName, t.shortDisplayName, t.name].forEach(n=>{ if(n) L[n] = lg; }); } if(t.id){ const T = tl[cfg.espn] = tl[cfg.espn] || []; T.push([String(t.id), t.displayName||'', t.shortDisplayName||'', t.name||'', t.abbreviation||'', t.location||'']); } });
    }catch(e){ log.push({name:'Logos '+cfg.name, ok:false, msg:e.message}); }
  }
  Object.assign(out.logos, NAT_LOGOS);
  out.teamsLg = Object.assign({}, prev.teamsLg||{}, tl);
  const okLeagues = Object.keys(out.fx).length;
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`datos.json escrito: ${okLeagues}/${LEAGUES.length} ligas, ${Object.keys(out.stats).length} estadísticas`);
  log.forEach(l=>console.log((l.ok?'OK  ':'FALLA ')+l.name+': '+l.msg));
  if(okLeagues===0){ console.error('No se pudo descargar ninguna liga'); process.exit(1); }
})();

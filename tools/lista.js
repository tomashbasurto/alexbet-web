// AlexBet · "Mejores oportunidades de hoy" por deporte (lista estilo tabla, una fila por partido)
// Lo usa facebook.js (modo lista:futbol, lista:nba, lista:nhl, lista:tenis). Devuelve el HTML de la imagen y el texto, o null si hay pocas jugadas.
'use strict';
const fs = require('fs'), path = require('path');

const ICON = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'lista-iconos.json'), 'utf8')); } catch (e) { return {}; } })();
const emo = (k, s) => { const i = ICON[k]; return i ? `<svg viewBox="0 0 ${i.w} ${i.h}" width="${s}" height="${s}">${i.b}</svg>` : ''; };
const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const US = sp => ['nba', 'ncaa', 'nhl', 'mlb', 'eul'].includes(sp);
const ecuDay = ms => new Date(ms - 5 * 3600e3).toISOString().slice(0, 10);

function short(n, sp) {
  n = String(n || '').replace(/\s*\(.*?\)/g, '').trim();
  if (sp === 'nba' || sp === 'nhl') { const w = n.split(' '); return w.length > 2 && /^(Red|Maple|Blue|Golden|Trail)$/.test(w[w.length - 2]) ? w.slice(-2).join(' ') : w.pop(); }
  if (sp === 'tenis') { const w = n.split(' '); return w.length > 1 ? w[0][0] + '. ' + w.slice(1).join(' ') : n; }
  n = n.replace(/^(1\. FC|FC|SV|AS|CF|CD|SC|AC|KVC|TSG|VfB|VfL|RB)\s+/, '').replace(/\s+(FC|CF|FCO|KSV|\d{2,4})$/, '');
  return n.replace('Inverness Caledonian Thistle', 'Inverness CT').replace(/^Independiente\b/, 'Indep.').replace('Sheffield Wednesday', 'Sheffield Wed.').replace(' Aveyron', '');
}
const ini = n => { const w = String(n).split(' '); return w.length > 1 && n.length > 16 ? w[0][0] + '. ' + w.slice(1).join(' ') : n; };
const ICO_MK = {goles: 'soccer-ball', 'córners': 'triangular-flag', tarjetas: 'card', 'remates al arco': 'bullseye', puntos: 'basketball', games: 'tennis'};

// fila desde una oportunidad (equipo o jugador)
function deOp(x) {
  const ua = x.u ? 'Menos' : 'Más', sp = x.sp;
  if (x.kind === 'player') {
    const mk = String(x.mk).toLowerCase();
    const ic = {'remates totales': 'goal-net', 'remates al arco': 'bullseye', paradas: 'person-raising-hand'}[mk] || (sp === 'futbol' ? 'bust-in-silhouette' : sp === 'nhl' ? 'ice-hockey' : 'man-bouncing-ball');
    return {icon: ic, big: ini(x.pname), sub: `${ua} de ${x.ln} ${mk}`, p: x.p, h: x.h, a: x.a, sp, txt: `${x.pname}: ${ua.toLowerCase()} de ${x.ln} ${mk}`};
  }
  const mk = String(x.mk), quien = !x.who || x.who === 'Partido' ? 'del partido' : 'de ' + short(x.who, sp);
  return {icon: sp === 'nhl' && mk === 'goles' ? 'ice-hockey' : (ICO_MK[mk] || 'soccer-ball'), big: `${ua} de ${x.ln}`, sub: `${mk[0].toUpperCase() + mk.slice(1)} ${quien}`, p: x.p, h: x.h, a: x.a, sp,
    txt: `${ua} de ${x.ln} ${mk} ${quien}`};
}
// fila desde una sugerencia del historial
function deHist(p) {
  const l = p.label, sp = p.sp; let m;
  if ((m = l.match(/^(Más|Menos) de ([\d.]+) (.+)$/))) {
    const mk = m[3]; return {icon: sp === 'nhl' ? 'ice-hockey' : sp === 'tenis' ? 'tennis' : (ICO_MK[mk] || (US(sp) ? 'basketball' : 'soccer-ball')), big: `${m[1]} de ${m[2]}`, sub: `${mk[0].toUpperCase() + mk.slice(1)} del partido`, p: p.prob, h: p.h, a: p.a, sp, txt: l};
  }
  if (l.startsWith('Gana ')) return {icon: 'trophy', big: short(l.slice(5), sp), sub: 'Ganador del partido', p: p.prob, h: p.h, a: p.a, sp, txt: l};
  if ((m = l.match(/^(.+?) ([+-][\d.]+)( games)?$/))) return {icon: 'arrows', big: `${short(m[1], sp)} ${m[2]}`, sub: sp === 'tenis' ? 'Hándicap de games' : US(sp) ? 'Hándicap de puntos' : 'Hándicap', p: p.prob, h: p.h, a: p.a, sp, txt: l};
  return {icon: sp === 'tenis' ? 'tennis' : US(sp) ? 'basketball' : 'soccer-ball', big: l, sub: '', p: p.prob, h: p.h, a: p.a, sp, txt: l};
}

// elige las jugadas: mezcla de mercados, una por partido, solo las que todavía no empiezan
function elegir(sp, O, H, now) {
  const hoy = ecuDay(now), vivo = x => (x.ts || 0) > now + 20 * 60e3 && ecuDay(x.ts) === hoy;
  const ops = O.filter(x => x.sp === sp && vivo(x) && x.n && x.hit / x.n >= 0.6 && (x.p || 0) >= 65);
  const his = H.filter(p => p.sp === sp && vivo(p) && (p.prob || 0) >= 65).map(p => Object.assign({}, p, {p: p.prob}));
  const usados = new Set(), out = [];
  const tomar = (L, n, f) => { for (const x of L.slice().sort((a, b) => b.p - a.p)) { if (n <= 0) break; const k = x.h + '|' + x.a; if (usados.has(k)) continue; usados.add(k); out.push(Object.assign(f(x), {_x: x, _s: f === deOp ? 'o' : 'h'})); n--; } };
  const opT = mk => ops.filter(x => x.kind === 'team' && x.mk === mk), opP = mks => ops.filter(x => x.kind === 'player' && mks.includes(x.mk));
  if (sp === 'futbol') {
    tomar(opT('goles'), 2, deOp); tomar(opT('córners'), 2, deOp); tomar(opT('tarjetas'), 2, deOp); tomar(opT('remates al arco'), 2, deOp);
    tomar(opP(['Remates totales', 'Remates al arco', 'Paradas']), 2, deOp);
    tomar(his, 10 - out.length, deHist);
  } else if (sp === 'nba') {
    tomar(his.filter(p => p.cat === 'line'), 2, deHist); tomar(his.filter(p => p.cat === 'tot' || p.cat === 'ml'), 2, deHist);
    for (const mk of ['Puntos', 'Rebotes', 'Asistencias', 'Triples']) tomar(opP([mk]), 1, deOp);
    tomar(opP(['Pts+Reb', 'Pts+Ast', 'Reb+Ast', 'Pts+Reb+Ast', 'Robos', 'Tapones']), 8 - out.length, deOp);
    tomar(his, 8 - out.length, deHist);
  } else if (sp === 'nhl') {
    tomar(his, 3, deHist); tomar(opT('goles'), 2, deOp); tomar(opP(['Puntos', 'Asistencias', 'Golpes', 'Tiros bloqueados']), 3, deOp);
  } else if (sp === 'tenis') {
    tomar(his, 8, deHist);
  }
  return out;
}

const TIT = {futbol: ['FÚTBOL', 'soccer-ball', 'Goles · córners · tarjetas · remates · jugadores', '⚽'], nba: ['NBA', 'basketball', 'Hándicap · totales · jugadores', '🏀'],
  nhl: ['NHL', 'ice-hockey', 'Totales · goles · jugadores', '🏒'], tenis: ['TENIS', 'tennis', 'Ganador · games · hándicap', '🎾']};
const MIN = {futbol: 6, nba: 5, nhl: 4, tenis: 4};
const HASH = {futbol: '#futbol #pronosticos #apuestasdeportivas', nba: '#NBA #NBAenEspañol #pronosticos', nhl: '#NHL #hockey #pronosticos', tenis: '#tenis #ATP #WTA #pronosticos'};

function armar(sp, ROOT, now) {
  now = now || Date.now();
  let O = [], H = [], M = {};
  try { O = JSON.parse(fs.readFileSync(path.join(ROOT, 'oportunidades.json'), 'utf8')).items || []; } catch (e) {}
  try { H = JSON.parse(fs.readFileSync(path.join(ROOT, 'historial.json'), 'utf8')).picks || []; } catch (e) {}
  try { M = JSON.parse(fs.readFileSync(path.join(ROOT, 'escudos', 'escudos.json'), 'utf8')); } catch (e) {}
  const rows = elegir(sp, O, H, now);
  if (rows.length < MIN[sp]) return {n: rows.length};
  const [titulo, ic, sub, e] = TIT[sp], R = 'file://' + ROOT, F = 'file://' + path.join(__dirname, 'fuentes');
  const crest = n => M[n] ? `<img src="${R}/escudos/${M[n]}">` : `<b class="nc">${esc(String(n).trim()[0] || '?')}</b>`;
  const icon = k => k === 'card' ? '<div class="ic card"><i></i><i></i></div>' : k === 'arrows' ? '<div class="ic arr"><span>➜</span><span>➜</span></div>' : `<div class="ic">${emo(k, 58)}</div>`;
  const fila = r => `<div class="r">${icon(r.icon)}<div class="pc">${r.p}%</div><div class="m"><b>${esc(r.big)}</b><small>${esc(r.sub)}</small></div><div class="t">
    <div>${crest(r.h)}<span>${esc(short(r.h, r.sp))}</span></div><div>${crest(r.a)}<span>${esc(short(r.a, r.sp))}</span></div></div></div>`;
  const n = rows.length, gap = 12, rh = Math.min(n <= 6 ? 128 : 110, Math.floor((1350 - 260 - gap * (n - 1)) / n));
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'], MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const dE = new Date(now - 5 * 3600e3), fecha = `${DIAS[dE.getUTCDay()]} ${dE.getUTCDate()} ${MES[dE.getUTCMonth()]}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Int;font-weight:700;src:url(${F}/inter-latin-700-normal.woff2)}
@font-face{font-family:Int;font-weight:900;src:url(${F}/inter-latin-900-normal.woff2)}
@font-face{font-family:Orb;font-weight:900;src:url(${F}/orbitron-latin-900-normal.woff2)}
*{margin:0;box-sizing:border-box} body{width:1080px;height:1350px;overflow:hidden;font-family:Int;color:#0c1a33;position:relative;
background:radial-gradient(700px 300px at 50% 0%,rgba(80,160,255,.55),transparent 70%),radial-gradient(900px 500px at 50% 110%,rgba(40,120,255,.45),transparent 70%),linear-gradient(180deg,#03113a,#0a2a8a 50%,#03113a)}
.rays{position:absolute;inset:0;background:repeating-conic-gradient(from 0deg at 50% -10%,rgba(255,255,255,.05) 0 3deg,transparent 3deg 9deg)}
.hd{position:relative;display:flex;align-items:center;justify-content:space-between;padding:30px 40px 18px}
.lg{display:flex;align-items:center;gap:12px} .lg img{width:64px;height:64px;border-radius:16px;box-shadow:0 0 0 3px #c6ff00} .lg b{font:900 30px Orb;color:#fff} .lg b i{font-style:normal;color:#c6ff00}
.ti{text-align:right;color:#fff} .ti b{display:flex;align-items:center;justify-content:flex-end;gap:8px;font:900 34px/1 Int} .ti small{font:700 20px Int;color:#bcd3ff}
.list{position:absolute;left:0;right:0;top:122px;bottom:112px;padding:0 28px;display:flex;flex-direction:column;justify-content:center;gap:${gap}px}
.r{display:flex;align-items:center;height:${rh}px;border-radius:18px;padding:0 18px;background:linear-gradient(180deg,#ffffff,#dfe7f5);box-shadow:0 0 0 3px rgba(150,200,255,.6),0 0 22px rgba(80,160,255,.6),inset 0 -3px 0 rgba(0,0,0,.08)}
.ic{width:74px;display:grid;place-items:center;flex:none}
.ic.card{position:relative;height:60px} .ic.card i{position:absolute;width:36px;height:50px;border-radius:5px;background:#ffd21f;border:2px solid #b38f00;left:10px;top:4px;transform:rotate(-12deg)} .ic.card i+i{background:#e52b2b;border-color:#8e1010;left:26px;top:6px;transform:rotate(10deg)}
.ic.arr{display:flex;flex-direction:column;gap:2px;font:900 30px/1 Int} .ic.arr span:first-child{color:#1f6bff} .ic.arr span+span{color:#e53030;transform:scaleX(-1)}
.pc{flex:none;width:92px;height:46px;margin:0 16px 0 6px;border-radius:23px;display:grid;place-items:center;font:900 22px Orb;color:#0b1a05;background:linear-gradient(180deg,#e2ff6a,#9fd400);box-shadow:0 2px 0 #4c6a00}
.m{flex:1;min-width:0;border-right:3px solid #b8c6e0;padding-right:12px} .m b{display:block;font:900 31px/1.05 Int;white-space:nowrap;overflow:hidden;text-overflow:ellipsis} .m small{display:block;font:700 21px Int;color:#2a63c9;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.t{width:330px;padding-left:18px;display:flex;flex-direction:column;gap:6px} .t div{display:flex;align-items:center;gap:12px}
.t img{width:38px;height:38px;object-fit:contain;filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))} .t span{font:900 23px Int;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nc{flex:none;width:38px;height:38px;border-radius:50%;background:#2a63c9;color:#fff;display:grid;place-items:center;font:900 18px Int}
.ft{position:absolute;left:28px;right:28px;bottom:26px;height:70px;border-radius:18px;display:flex;align-items:center;justify-content:space-between;padding:0 26px;background:rgba(3,10,40,.75);border:2px solid rgba(198,255,0,.6);color:#fff}
.ft b{font:900 28px Orb;color:#c6ff00} .ft span{font:700 20px Int;display:flex;align-items:center;gap:8px} .ft i{width:30px;height:30px;border-radius:50%;background:#25d366;display:grid;place-items:center;font-style:normal;font-weight:900}
.lgl{position:absolute;left:0;right:0;bottom:6px;text-align:center;font:700 13px Int;color:rgba(255,255,255,.7)}
</style></head><body><div class="rays"></div>
<div class="hd"><div class="lg"><img src="${R}/icon-512.png"><b>ALEX<i>BET</i></b></div><div class="ti"><b>${emo(ic, 34)} ${titulo} · HOY</b><small>${esc(sub)} · ${fecha}</small></div></div>
<div class="list">${rows.map(fila).join('')}</div>
<div class="ft"><b>alexbetpro.web.app</b><span><i>✆</i> Canal: AlexBet Pronósticos</span></div>
<div class="lgl">+18 · Son probabilidades, no garantías. Juega con responsabilidad.</div></body></html>`;
  const txt = `${e} ${titulo} HOY · las mejores oportunidades · ${fecha.toLowerCase()}\n\n` + rows.map(r => `${e} ${r.txt} · ${r.h} vs ${r.a} (${r.p}%)`).join('\n') +
    `\n\n¿Cuál juegas tú? Comenta 👇\nEl análisis de cada partido 👉 alexbetpro.web.app\n\n+18 · Son probabilidades, no garantías.\n${HASH[sp]}`;
  return {html, txt, n: rows.length, rows};
}
module.exports = {armar, elegir};

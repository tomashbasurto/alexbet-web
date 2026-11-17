// AlexBet · publicaciones automáticas en la página de Facebook (GitHub Actions)
// Modos: check (solo comprueba la llave), pro (imagen de pronósticos de hoy), res (imagen de resultados de ayer), reel (video con voz), sem (resumen semanal)
// La llave (FB_USER_TOKEN, secreto de GitHub) es de larga duración; con ella se pide la llave de la página en cada corrida.
// Las imágenes y el video se arman con el mismo panel de publicaciones (publicar.html) abierto sin pantalla.
'use strict';
const fs = require('fs'), path = require('path');
const G = 'https://graph.facebook.com/v21.0';
const MODE = process.argv[2] || 'check', DRY = process.argv.includes('--prueba');
const ROOT = __dirname; let NB = 0;

async function api(url, opt) {
  const r = await fetch(url, opt), j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error((j.error && (j.error.message + ' (' + j.error.code + ')')) || ('HTTP ' + r.status));
  return j;
}
async function pagina() {
  const t = process.env.FB_USER_TOKEN; if (!t) throw new Error('falta el secreto FB_USER_TOKEN');
  const dbg = await api(`${G}/me?fields=id,name&access_token=${encodeURIComponent(t)}`);
  const j = await api(`${G}/me/accounts?fields=name,id,access_token,tasks&limit=100&access_token=${encodeURIComponent(t)}`);
  const L = j.data || []; const want = process.env.FB_PAGE_ID;
  const p = (want && L.find(x => x.id === want)) || L.find(x => /alexbet/i.test(x.name)) || L[0];
  if (!p) throw new Error('la llave no tiene ninguna página (¿marcaste AlexBet al dar permisos?)');
  try { const pi = await api(`${G}/${p.id}?fields=username,link,followers_count,fan_count&access_token=${encodeURIComponent(p.access_token)}`); console.log(`Página: usuario=${pi.username || '(sin usuario)'} · link=${pi.link} · seguidores=${pi.followers_count ?? '-'} · me gusta=${pi.fan_count ?? '-'}`); } catch (e) { console.log('info de la página:', e.message); }
  console.log(`Llave de ${dbg.name} · páginas: ${L.map(x => x.name).join(', ')} · uso: ${p.name} (${p.id}) · permisos de página: ${(p.tasks || []).join(', ')}`);
  return p;
}

// ---------- estado en Firestore (config/facebook): pausa, "publicar ya" y registro de lo publicado; lo ve el panel ----------
// se guarda en la cuenta del administrador (users/<su id>, campo fb): las reglas ya le dejan leer y escribir ahí
const FS_BASE = 'https://firestore.googleapis.com/v1/projects/alexbet-e14aa/databases/(default)/documents', OWNER = 'tomashbasurto@gmail.com';
let FSH = null, FS_DOC = null, FS_T = 0;
async function fsInit() {
  // la llave de Google dura 1 hora: se pide otra cada 45 min (el turno 'plan' dura ~5,5 h)
  if (FSH !== null && Date.now() - FS_T < 45 * 60e3) return FSH; FSH = false; FS_T = Date.now();
  try {
    const sa = JSON.parse((process.env.FIREBASE_SERVICE_ACCOUNT || '').trim());
    const H = {authorization: 'Bearer ' + await require('./push-send.js').accessToken(sa), 'content-type': 'application/json'};
    const r = await fetch(FS_BASE + ':runQuery', {method: 'POST', headers: H, body: JSON.stringify({structuredQuery: {from: [{collectionId: 'users'}], where: {fieldFilter: {field: {fieldPath: 'email'}, op: 'EQUAL', value: {stringValue: OWNER}}}, limit: 1}})});
    const j = await r.json(), d = (Array.isArray(j) ? j : []).find(x => x.document);
    if (!d) throw new Error('no encontré la cuenta del administrador (HTTP ' + r.status + ')');
    FS_DOC = 'https://firestore.googleapis.com/v1/' + d.document.name; FSH = H;
  } catch (e) { console.log('estado: sin acceso a Firestore (' + e.message + ')'); }
  return FSH;
}
const fsVal = v => !v ? null : v.stringValue ?? (v.integerValue != null ? +v.integerValue : null) ?? v.doubleValue ?? v.booleanValue ??
  (v.arrayValue ? (v.arrayValue.values || []).map(fsVal) : v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fsVal(x)])) : null);
const fsEnc = v => v == null ? {nullValue: null} : typeof v === 'boolean' ? {booleanValue: v} : typeof v === 'number' ? (Number.isInteger(v) ? {integerValue: String(v)} : {doubleValue: v})
  : Array.isArray(v) ? {arrayValue: {values: v.map(fsEnc)}} : typeof v === 'object' ? {mapValue: {fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fsEnc(x)]))}} : {stringValue: String(v)};
async function estado() { const H = await fsInit(); if (!H) return null; const r = await fetch(FS_DOC + '?mask.fieldPaths=fb', {headers: H}); if (!r.ok) { console.log('estado: HTTP ' + r.status); if (r.status === 401) FS_T = 0; return null; } const f = ((await r.json()).fields || {}).fb; return f ? fsVal(f) || {} : {}; }
async function estadoSet(obj) { const H = await fsInit(); if (!H) return; const q = Object.keys(obj).map(k => 'updateMask.fieldPaths=fb.' + k).join('&');
  const r = await fetch(FS_DOC + '?' + q, {method: 'PATCH', headers: H, body: JSON.stringify({fields: {fb: fsEnc(obj)}})}); if (!r.ok) console.log('estado: no se pudo guardar (HTTP ' + r.status + ')'); }
async function anotar(e) { try { const st = await estado(); if (!st) return; const log = [Object.assign({t: Date.now(), modo: MODE}, e)].concat(st.log || []).slice(0, 40); await estadoSet({log, armando: '', paso: ''}); } catch (x) {} } // al terminar (bien o mal) el panel deja de mostrar "armando"

// ---------- armar imágenes / video con el panel ----------
async function panel(fn) {
  const {chromium} = require('playwright');
  const browser = await chromium.launch({args: ['--autoplay-policy=no-user-gesture-required']});
  const page = await browser.newPage({timezoneId: 'America/Guayaquil', acceptDownloads: true});
  page.on('pageerror', e => console.log('error en el panel:', e.message));
  page.on('console', m => { if (/^BOT/.test(m.text())) console.log(m.text()); });
  const STUB_APP = 'export function initializeApp(){ return {}; }';
  const STUB_AUTH = `export const getAuth=()=>({}); export class GoogleAuthProvider{}; export const signInWithPopup=async()=>{}; export const signOut=async()=>{};
    export function onAuthStateChanged(a, cb){ setTimeout(()=>cb({email:'tomashbasurto@gmail.com'}), 0); return ()=>{}; }`;
  await page.route('**/*', async r => {
    const u = r.request().url();
    if (/gstatic\.com\/firebasejs\/.*firebase-app\.js/.test(u)) return r.fulfill({contentType: 'text/javascript', body: STUB_APP});
    if (/gstatic\.com\/firebasejs\/.*firebase-auth\.js/.test(u)) return r.fulfill({contentType: 'text/javascript', body: STUB_AUTH});
    if (process.env.FONTS_LOCAL && /fonts\.(googleapis|local)/.test(u)) { if (u.includes('googleapis')) return r.fulfill({contentType: 'text/css', body: [['Orbitron','orbitron',[700,900]],['Inter','inter',[400,500,600,700,800,900]]].flatMap(([f,d,ws]) => ws.map(w => `@font-face{font-family:${f};font-weight:${w};src:url(https://fonts.local/${d}/files/${d}-latin-${w}-normal.woff2)}`)).join('')}); return r.fulfill({path: process.env.FONTS_LOCAL + u.split('fonts.local/')[1]}); }
    for (const pre of ['https://alexbetpro.web.app/', 'tomashbasurto.github.io/alexbet-web/', 'raw.githubusercontent.com/tomashbasurto/alexbet-web/main/']) {
      if (u.includes(pre)) {
        const f = path.join(ROOT, decodeURIComponent(u.split(pre)[1].split('?')[0] || 'index.html'));
        return fs.existsSync(f) ? r.fulfill({path: f, headers: {'access-control-allow-origin': '*'}}) : r.fulfill({status: 404});
      }
    }
    return r.continue();
  });
  await page.goto('https://alexbetpro.web.app/publicar.html?bot=1');
  await page.waitForFunction(() => window.__bot && window.__bot.ok(), null, {timeout: 120000});
  try { return await fn(page); } finally { await browser.close(); }
}
async function bajar(page, js, arg) {
  const [d] = await Promise.all([page.waitForEvent('download', {timeout: 600000}), page.evaluate(js, arg)]);
  const f = path.join(ROOT, 'fb-out', String(++NB).padStart(2, '0') + '-' + d.suggestedFilename()); fs.mkdirSync(path.dirname(f), {recursive: true}); await d.saveAs(f); return f;
}

// ---------- v50 · video análisis: elige la jugada, toma capturas de la app real y arma el video en el panel ----------
const TOPL = ['lib','sud','recopa','wcqsa','copaam','mundial','wcqeu','euro','euroq','unl','cnl','wcqcc','gold','epl','laliga','seriea','bundes','ligue1','ucl','uel','arg','col','mex','bra','mls'];
const opKey = o => [o.sp, o.h, o.a, o.kind, o.pname || o.who || '', o.mk, o.ln].join('|');
function candidatos() {
  const O = JSON.parse(fs.readFileSync(path.join(ROOT, 'oportunidades.json'), 'utf8')), I = (O.items || []).filter(o => (o.vals || []).length >= 6 && !o.u); // v49.3 · los videos arman solo "Más de"
  const sel = process.env.FB_ANA || '';
  if (sel && sel[0] === '{') { try { return [JSON.parse(sel)]; } catch (e) { console.log('pedido inválido'); return []; } } // una sugerencia 'Más de' elegida en el panel
  if (sel) { const x = I.find(o => opKey(o) === sel); if (!x) console.log('No encontré la jugada elegida en el panel:', sel); return x ? [x] : []; }
  const ts = o => Date.parse(String(o.when).slice(0, 16) + ':00Z'), now = Date.now();
  const prio = o => /Ecuador/i.test(o.h + ' ' + o.a) || ['ecuador','copaecu','supecu'].includes(o.lid) ? 3 : (o.sp === 'futbol' && TOPL.includes(o.lid)) || o.sp === 'nba' ? 2 : o.sp === 'ncaa' ? 0 : 1;
  return I.filter(o => (!o.day || o.day === O.day) && ts(o) > now + 60 * 60e3 && o.p >= 70 && o.hit / o.n >= .8 && (o.kind !== 'player' || o.sp === 'futbol' || o.role === 'top') && !/falta/i.test(o.mk))
    .sort((a, b) => prio(b) - prio(a) || b.hit / b.n - a.hit / a.n || b.p - a.p).slice(0, 4);
}
// abre la app (servida desde este repo) en un celular sin pantalla, con una cuenta de prueba
async function abrirApp() {
  const {chromium} = require('playwright');
  const browser = await chromium.launch(), ctx = await browser.newContext({viewport: {width: 390, height: 1000}, deviceScaleFactor: 3, serviceWorkers: 'block', timezoneId: 'America/Guayaquil'});
  const page = await ctx.newPage(); page.on('pageerror', e => console.log('error en la app:', e.message));
  // la app se abre con una cuenta de prueba (sin Firebase de verdad) para que muestre todo
  const U = 'const U={uid:"bot",email:"bot@alexbet.local"};';
  const FB = {
    'firebase-app': 'export function initializeApp(){return {}}',
    'firebase-auth': U + 'export function getAuth(){return {currentUser:U}} export function onAuthStateChanged(a,f){setTimeout(()=>f(U),50)} export class GoogleAuthProvider{} export async function signInWithPopup(){} export async function signOut(){} export async function createUserWithEmailAndPassword(){} export async function signInWithEmailAndPassword(){} export async function sendPasswordResetEmail(){}',
    'firebase-firestore': 'const D={email:"bot@alexbet.local",creado:{toMillis:()=>Date.now()-3*864e5},premiumHasta:null,plan:"gratis",pendiente:""}; export function getFirestore(){return {}} export function doc(){return {}} export function collection(){return {}} export function query(){return {}} export function where(){return {}} export function orderBy(){return {}} export function limit(){return {}} export async function getDoc(){return {exists:()=>true,data:()=>D}} export async function getDocs(){return {docs:[],forEach(){}}} export async function setDoc(){} export async function updateDoc(){} export function serverTimestamp(){return null} export function onSnapshot(r,f){setTimeout(()=>f({exists:()=>true,data:()=>D}),10);return ()=>{}}',
    'firebase-messaging': 'export const getMessaging=()=>({}),getToken=async()=>"",onMessage=()=>{},deleteToken=async()=>{}'};
  await page.route('**/*', async r => { const u = r.request().url();
    const fbk = Object.keys(FB).find(k => u.includes('gstatic.com/firebasejs/') && u.includes(k + '.js')); if (fbk) return r.fulfill({contentType: 'text/javascript', body: FB[fbk]});
    for (const pre of ['https://alexbetpro.web.app/', 'tomashbasurto.github.io/alexbet-web/', 'raw.githubusercontent.com/tomashbasurto/alexbet-web/main/']) if (u.includes(pre)) {
      const f = path.join(ROOT, decodeURIComponent(u.split(pre)[1].split('?')[0] || 'index.html')); return fs.existsSync(f) ? r.fulfill({path: f, headers: {'access-control-allow-origin': '*'}}) : r.fulfill({status: 404}); }
    return r.continue(); });
  await page.goto('https://alexbetpro.web.app/index.html'); await page.waitForTimeout(6000);
  await page.addStyleTag({content: '#abBar{visibility:hidden!important} #alToast,#wlBox{display:none!important}'});
  return {browser, page};
}
// pantalla de la estadística de una jugada (igual que tocarla en Oportunidades): captura + recuadros + números que muestra
async function detalle(page, o) {
  await page.evaluate(o => { setView('matches'); OP_LIST.length = 0; OP_LIST.push(o); opGo(0); }, o);
  const box = o.kind === 'player' ? '#pjBox' : '#pbBox';
  await page.waitForFunction(b => { const e = document.querySelector(b + ' .pb-tiles'); return e && e.offsetHeight > 0; }, box, {timeout: 60000});
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const y = document.querySelector('#matchList').getBoundingClientRect().top + scrollY; scrollTo(0, Math.max(0, y - 70)); }); await page.waitForTimeout(800);
  const info = await page.evaluate(([b, h, a]) => {
    const R = e => { if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); }, B = document.querySelector(b);
    const hero = [...document.querySelectorAll('#matchList *')].filter(e => { const r = e.getBoundingClientRect(), t = e.innerText || ''; return r.height > 110 && r.height < 320 && t.includes(h) && t.includes(a) && !B.contains(e); }).sort((x, y) => x.getBoundingClientRect().height - y.getBoundingClientRect().height)[0];
    const t = B.querySelectorAll('.pb-tiles > div'), l5 = [...B.querySelectorAll('.pb-per button')].find(x => /^L5/.test(x.innerText.trim()));
    return {r: {hero: R(hero), line: R(B.querySelector('.pb-line2')), prob: R(t[0]), avg: R(t[1]), hit: R(t[2]), bars: R(B.querySelector('.pb-bars')), l5: R(l5), box: R(B)},
      v: {prob: t[0] && t[0].querySelector('b').innerText.trim(), avg: t[1] && t[1].querySelector('b').innerText.trim(), hit: t[2] && t[2].querySelector('b').innerText.trim(), l5: l5 && (l5.querySelector('b') || {}).innerText}};
  }, [box, o.h, o.a]);
  return {det: (await page.screenshot({type: 'png'})).toString('base64'), r: info.r, v: info.v};
}
async function capturar(o) {
  const {browser, page} = await abrirApp();
  try {
    if (o.sp !== 'futbol') { await page.evaluate(s => setSport(s), o.sp); await page.waitForTimeout(6000); }
    // lista de sugerencias del deporte
    await page.evaluate(() => { activeLeague = 'all'; setView('picks'); pkSecSet('mejores'); }); await page.waitForTimeout(3500);
    await page.evaluate(() => scrollTo(0, 0));
    const lista = await page.screenshot({type: 'png'});
    const lf = await page.evaluate(() => { const c = [...document.querySelectorAll('.prob-card')].find(e => /Mejores opciones/.test(e.innerText)); if (!c) return null; const r = c.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); });
    const D = await detalle(page, o);
    return {lista: lista.toString('base64'), lf, det: D.det, r: D.r, v: D.v};
  } finally { await browser.close(); }
}
async function analisis() {
  const C = candidatos(); if (!C.length) return null;
  for (const o of C) {
    console.log('Análisis de:', opKey(o));
    await estadoSet({paso: '1/3 · Abriendo la app y tomando las pantallas…'}).catch(() => {});
    let cap; try { cap = await capturar(o); } catch (e) { console.log('no pude tomar las capturas:', e.message); continue; }
    const [hn, hd] = String(cap.v.hit || '').split('/').map(Number); if (!hn || !hd || !cap.v.prob) { console.log('la pantalla no mostró los datos:', JSON.stringify(cap.v)); continue; }
    if (!cap.r.hero) cap.r.hero = [15, 104, 360, 156];
    if (cap.r.l5 && cap.r.l5[1] + cap.r.l5[3] > 920) cap.r.l5 = null; // quedó debajo de la barra de abajo: no se muestra
    if (parseInt(cap.v.l5) < 80) cap.v.l5 = ''; // "últimos 5" solo si es fuerte
    const mk = String(o.mk).toLowerCase(), opp = o.kind === 'player' ? (o.team === o.h ? o.a : o.h) : o.who && o.who !== 'Partido' ? (o.who === o.h ? o.a : o.h) : '';
    const d = {h: o.h, a: o.a, liga: o.lname || '', ln: String(o.ln), uni: mk, mkt: !o.who || o.who === 'Partido' ? (o.kind === 'player' ? '' : 'en el partido') : '',
      quien: o.kind === 'player' ? o.pname : o.who && o.who !== 'Partido' ? o.who : '', opp, hitN: hn, hitD: hd, l5: cap.v.l5 || '', avg: cap.v.avg, prob: cap.v.prob};
    await estadoSet({paso: '2/3 · Generando la voz y grabando el video (30 s)…'}).catch(() => {});
    const file = await panel(async page => bajar(page, a => window.__bot.analisis(a), {lista: cap.lista, lf: cap.lf, det: cap.det, r: cap.r, d}));
    await estadoSet({paso: '3/3 · Subiendo el video…'}).catch(() => {});
    const ic = {futbol: '⚽', nba: '🏀', ncaa: '🏀', eul: '🏀', nhl: '🏒', mlb: '⚾', tenis: '🎾'}[o.sp] || '📊';
    const lab = `${d.quien ? d.quien + ': ' : ''}Más de ${o.ln} ${mk}${d.mkt ? ' ' + d.mkt : ''}`;
    const txt = `🎬 ANÁLISIS DEL DÍA\n\n${ic} ${o.h} vs ${o.a}\n👉 ${lab} · ${d.prob}\n📊 Superó la línea en ${hn} de sus últimos ${hd} · promedio ${d.avg}${d.l5 ? ' · últimos 5: ' + d.l5 : ''}\n\nNo es suerte, son datos. Este y otros análisis, en la versión Premium 👉 alexbetpro.web.app\n\n+18 · Son probabilidades, no garantías.\n#pronosticos #apuestasdeportivas #${o.sp === 'futbol' ? 'futbol' : 'NBA'}`;
    return {file, txt};
  }
  return null;
}

// ---------- v51 · Video radar: 2 jugadores (con foto y la línea ajustada), el radar del día y Premium; con música, sin voz ----------
function jugadoresRadar() { // 2 jugadas: las que eligió Alexander (jugadores o equipos, de cualquier deporte) o los 2 mejores jugadores del día
  const O = JSON.parse(fs.readFileSync(path.join(ROOT, 'oportunidades.json'), 'utf8')), I = (O.items || []).filter(o => (o.vals || []).length >= 6 && !o.u); // v49.3 · los videos arman solo "Más de"
  const ESC = JSON.parse(fs.readFileSync(path.join(ROOT, 'escudos', 'escudos.json'), 'utf8'));
  const img = k => { const f = ESC[k]; return f && f !== '-' && fs.existsSync(path.join(ROOT, 'escudos', f)) ? path.join(ROOT, 'escudos', f) : null; };
  const foto = o => o.kind === 'player' ? img('j:' + String(o.pid).split('|')[0]) : img(o.who && o.who !== 'Partido' ? o.who : o.h);
  const sel = (process.env.FB_RADAR ? JSON.parse(process.env.FB_RADAR) : []).map(k => { if (String(k)[0] === '{') { try { return JSON.parse(k); } catch (e) { return null; } } return I.find(o => opKey(o) === k); }).filter(Boolean);
  if (process.env.FB_RADAR) { if (sel.length < 2) console.log('Radar: no encontré las jugadas elegidas', process.env.FB_RADAR); return sel.slice(0, 2).map(o => Object.assign({}, o, {foto: foto(o), foto2: o.kind !== 'player' && (!o.who || o.who === 'Partido') ? img(o.a) : null})); }
  const ts = o => Date.parse(String(o.when).slice(0, 16) + ':00Z'), now = Date.now();
  const C = I.filter(o => o.kind === 'player' && (!o.day || o.day === O.day) && ts(o) > now + 45 * 60e3 && o.p >= 70 && o.hit / o.n >= .8 && foto(o) && (o.sp !== 'nba' || o.role === 'top') && !/falta|tarjeta/i.test(o.mk))
    .sort((a, b) => (b.sp === 'nba') - (a.sp === 'nba') || b.hit / b.n - a.hit / a.n || b.p - a.p);
  const out = []; for (const o of C) { if (out.length >= 2) break; if (out.some(x => x.pname === o.pname || (x.h === o.h && x.a === o.a))) continue; if (out.length && out[0].sp !== o.sp) continue; out.push(o); }
  return out.map(o => Object.assign({}, o, {foto: foto(o)}));
}
async function capturarRadar(P) {
  const {browser, page} = await abrirApp();
  try {
    const sp = P[0].sp; if (sp !== 'futbol') { await page.evaluate(s => setSport(s), sp); await page.waitForTimeout(6000); }
    const J = [];
    for (const [i, o] of P.entries()) {
      // jugador 2: primero una línea más alta (menos %) y después la de la app, para mostrar "ajusta la línea"
      if (i === 1 && o.sp !== P[0].sp) { await page.evaluate(s => setSport(s), o.sp); await page.waitForTimeout(6000); }
      const paso = o.ln >= 10 ? Math.max(2, Math.round(o.ln * .15)) : 1, A = i === 1 ? await detalle(page, Object.assign({}, o, {ln: o.ln + paso})) : null;
      const B = await detalle(page, o);
      J.push({o: {kind: o.kind, who: o.who, pname: o.pname, team: o.team, h: o.h, a: o.a, mk: o.mk, ln: o.ln, lname: o.lname, sp: o.sp, when: o.when}, A, B, lnA: A ? o.ln + paso : null,
        foto: o.foto ? fs.readFileSync(o.foto).toString('base64') : null, foto2: o.foto2 ? fs.readFileSync(o.foto2).toString('base64') : null});
    }
    // el radar: oportunidades de jugadores del día
    await page.evaluate(() => { try { goHome(); } catch (e) {} activeLeague = 'all'; setView('picks'); pkSecSet('oport'); }); await page.waitForTimeout(2500);
    if (P[0].sp !== sp) { await page.evaluate(s => setSport(s), P[0].sp); await page.waitForTimeout(5000); await page.evaluate(() => { activeLeague = 'all'; setView('picks'); pkSecSet('oport'); }); await page.waitForTimeout(2000); }
    await page.evaluate(k => { if (typeof opKind === 'function') opKind(k); }, P[0].kind === 'player' ? 'player' : 'team'); await page.waitForTimeout(2500); await page.evaluate(() => scrollTo(0, 0));
    const radar = (await page.screenshot({type: 'png'})).toString('base64');
    const nRadar = await page.evaluate(() => { const b = document.querySelector('.op-kind button.on'); return b ? parseInt((b.querySelector('.op-n') || {}).innerText) || 0 : 0; });
    // la pantalla de Premium
    await page.evaluate(() => { try { abPay(); } catch (e) {} }); await page.waitForTimeout(2000);
    const prem = (await page.screenshot({type: 'png'})).toString('base64');
    return {J, radar, prem, nRadar, kRadar: P[0].kind === 'player' ? 'JUGADORES' : 'JUGADAS'};
  } finally { await browser.close(); }
}
async function radarVideo() {
  const P = jugadoresRadar(); if (P.length < 2) { console.log('Radar: no hay 2 jugadores que sirvan', process.env.FB_RADAR || ''); return null; }
  const nom = o => o.kind === 'player' ? o.pname : o.who && o.who !== 'Partido' ? o.who : `${o.h} vs ${o.a}`;
  console.log('Radar con:', P.map(o => `${nom(o)} · más de ${o.ln} ${o.mk}`).join(' | '));
  await estadoSet({paso: '1/3 · Abriendo la app y tomando las pantallas…'}).catch(() => {});
  const cap = await capturarRadar(P);
  await estadoSet({paso: '2/3 · Armando el video (35 s)…'}).catch(() => {});
  const file = await panel(async page => bajar(page, a => window.__bot.radar(a), cap));
  await estadoSet({paso: '3/3 · Subiendo el video…'}).catch(() => {});
  const icn = o => ({futbol: '⚽', nhl: '🏒', mlb: '⚾', tenis: '🎾'})[o.sp] || '🏀', L = cap.J.map(j => `${icn(j.o)} ${nom(j.o)}${j.o.kind === 'player' || (j.o.who && j.o.who !== 'Partido') ? ` (${j.o.h} vs ${j.o.a})` : ''}: más de ${j.o.ln} ${String(j.o.mk).toLowerCase()} · ${j.B.v.hit} · ${j.B.v.prob}`).join('\n');
  const txt = `📡 EL RADAR DE HOY\n\n${L}\n\n¿Todavía eliges a ciegas? Donde hay datos, hay ventaja.\nEstas y todas las jugadas del día, en la versión Premium 👉 alexbetpro.web.app\n\n+18 · Son probabilidades, no garantías.\n#${({futbol: 'futbol', nhl: 'NHL', mlb: 'MLB'})[P[0].sp] || 'NBA'} #pronosticos #apuestasdeportivas`;
  return {file, txt};
}

// ---------- v50.1 · guardar el video armado para descargarlo desde el panel (rama "videos" del repo, se guardan los últimos 8) ----------
// v51.7 · sube un archivo (video o imagen) a la rama "videos" y da su enlace; se guardan los últimos 60
async function subirArchivo(f) {
  const T = process.env.GH_TOKEN, REPO = process.env.GITHUB_REPOSITORY; if (!T || !REPO) return null;
  const H = {authorization: 'Bearer ' + T, accept: 'application/vnd.github+json', 'content-type': 'application/json'}, A = `https://api.github.com/repos/${REPO}`;
  try {
    let r = await fetch(`${A}/git/ref/heads/videos`, {headers: H});
    if (r.status === 404) { // rama nueva y vacía (sin el código de la app, así no arranca ningún otro proceso)
      const tr = await (await fetch(`${A}/git/trees`, {method: 'POST', headers: H, body: JSON.stringify({tree: [{path: 'LEEME.md', mode: '100644', type: 'blob', content: 'Videos e imágenes armados por el panel de AlexBet (se guardan los últimos 60).'}]})})).json();
      const cm = await (await fetch(`${A}/git/commits`, {method: 'POST', headers: H, body: JSON.stringify({message: 'videos', tree: tr.sha, parents: []})})).json();
      await fetch(`${A}/git/refs`, {method: 'POST', headers: H, body: JSON.stringify({ref: 'refs/heads/videos', sha: cm.sha})}); }
    const name = `alexbet-${new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 16).replace(/[-:T]/g, '')}-${Math.random().toString(36).slice(2, 6)}${path.extname(f)}`;
    r = await fetch(`${A}/contents/v/${name}`, {method: 'PUT', headers: H, body: JSON.stringify({message: 'archivo ' + name, branch: 'videos', content: fs.readFileSync(f).toString('base64')})});
    if (!r.ok) { console.log('no pude guardar el archivo:', r.status, (await r.text()).slice(0, 200)); return null; }
    const L = await (await fetch(`${A}/contents/v?ref=videos`, {headers: H})).json();
    if (Array.isArray(L)) for (const x of L.filter(x => x.name.startsWith('alexbet-')).sort((a, b) => b.name.localeCompare(a.name)).slice(60)) await fetch(`${A}/contents/v/${x.name}`, {method: 'DELETE', headers: H, body: JSON.stringify({message: 'borrar ' + x.name, branch: 'videos', sha: x.sha})});
    let sha = ((await r.json()).commit || {}).sha || 'videos', img = '';
    if (!/\.(png|jpe?g)$/i.test(f)) try { // miniatura (un cuadro del segundo 4) para mostrarla en el panel
      const jp = f.replace(/\.[a-z0-9]+$/, '.jpg'); require('child_process').execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '4', '-i', f, '-frames:v', '1', '-vf', 'scale=360:-1', '-q:v', '4', jp]);
      const ri = await fetch(`${A}/contents/v/${name.replace(/\.[a-z0-9]+$/, '.jpg')}`, {method: 'PUT', headers: H, body: JSON.stringify({message: 'miniatura', branch: 'videos', content: fs.readFileSync(jp).toString('base64')})});
      if (ri.ok) { sha = ((await ri.json()).commit || {}).sha || sha; img = `https://raw.githubusercontent.com/${REPO}/${sha}/v/${name.replace(/\.[a-z0-9]+$/, '.jpg')}`; }
    } catch (e) { console.log('sin miniatura:', e.message); }
    return {url: `https://raw.githubusercontent.com/${REPO}/${sha}/v/${name}`, img, name}; // con el commit exacto no hay caché vieja
  } catch (e) { console.log('no pude guardar el archivo:', e.message); return null; }
}
// v50.1 · guardar el video armado para descargarlo desde el panel
async function guardarVideo(f, txt, kind) {
  const u = await subirArchivo(f); if (!u) return null;
  const vid = Object.assign(u, {t: Date.now(), txt});
  await estadoSet({['vid' + kind]: vid, armando: '', paso: ''}); console.log('Video guardado para descargar:', vid.url); return vid;
}
// v51.9 · Instagram: lo que sale en Facebook se publica también en la cuenta de Instagram vinculada a la página
// (misma llave FB_USER_TOKEN, con los permisos instagram_basic e instagram_content_publish). Si falla, Facebook sigue igual.
const igTxt = t => { t = String(t || '').split('\n').filter(l => !/whatsapp\.com\/channel/i.test(l)).join('\n').replace(/alexbetpro\.web\.app/g, 'alexbetpro.web.app (link en la bio)').replace(/\n{3,}/g, '\n\n').trim(); return t.slice(0, 2150); };
const esperar = ms => new Promise(r => setTimeout(r, ms));
async function igListo(ig, tk, id) { for (let i = 0; i < 60; i++) { const s = await api(`${G}/${id}?fields=status_code,status&access_token=${tk}`); if (s.status_code === 'FINISHED') return; if (s.status_code === 'ERROR') throw new Error('Instagram no aceptó el archivo: ' + (s.status || '')); await esperar(5000); } throw new Error('Instagram tardó demasiado en procesar'); }
async function igFoto(ig, tk, f, extra) { // Instagram solo toma JPG desde un enlace público
  const jp = f.replace(/\.[a-z0-9]+$/i, '-ig.jpg'); require('child_process').execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-q:v', '2', jp]);
  const u = await subirArchivo(jp); if (!u) throw new Error('no pude dejar la imagen en un enlace público');
  return (await api(`${G}/${ig}/media?access_token=${tk}`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(Object.assign({image_url: u.url}, extra))})).id;
}
// v52.0 · video: Instagram lo baja desde un enlace público (la subida directa daba "Request processing failed")
async function igVideo(ig, tk, f, cap) {
  const u = await subirArchivo(f); if (!u) throw new Error('no pude dejar el video en un enlace público');
  return (await api(`${G}/${ig}/media?access_token=${tk}`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({media_type: 'REELS', video_url: u.url, caption: cap, share_to_feed: true})})).id;
}
async function alInstagram(p, files, txt) {
  if (DRY || !p) return;
  const st = await estado().catch(() => null); if (st && st.igOff) { console.log('Instagram: apagado desde el panel'); return; }
  try {
    const tk = encodeURIComponent(p.access_token), cap = igTxt(txt);
    const ig = ((await api(`${G}/${p.id}?fields=instagram_business_account&access_token=${tk}`)).instagram_business_account || {}).id;
    if (!ig) throw new Error('la página no tiene una cuenta de Instagram profesional vinculada');
    let id;
    if (files.length > 1) { // varias imágenes: carrusel (máximo 10)
      const kids = []; for (const f of files.slice(0, 10)) kids.push(await igFoto(ig, tk, f, {is_carousel_item: true}));
      for (const k of kids) await igListo(ig, tk, k);
      id = (await api(`${G}/${ig}/media?access_token=${tk}`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({media_type: 'CAROUSEL', children: kids.join(','), caption: cap})})).id;
    } else if (/\.(png|jpe?g)$/i.test(files[0])) id = await igFoto(ig, tk, files[0], {caption: cap});
    else id = await igVideo(ig, tk, files[0], cap);
    await igListo(ig, tk, id);
    const r = await api(`${G}/${ig}/media_publish?access_token=${tk}`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({creation_id: id})});
    console.log('Publicado en Instagram:', r.id); await anotar({ok: true, id: r.id || '', txt: 'Instagram · ' + cap.split('\n')[0]});
  } catch (e) { console.log('Instagram: no se pudo:', e.message); await anotar({ok: false, txt: 'Instagram · ' + String(e.message).slice(0, 140)}); }
}
const TIPO = m => ({resdep: 'Resultados de ayer', res: 'Resultados de ayer', pro: 'Pronósticos', reel: 'Reel', 'reel:nba': 'Reel NBA', 'reel:sel': 'Video con voz', ana: 'Video análisis', 'ana:sel': 'Video análisis', radar: 'Video radar', 'radar:sel': 'Video radar', sem: 'Resumen de la semana', promo: 'Promo'})[m] || ({pro: 'Pronósticos'})[String(m).split(':')[0]] || 'Publicación';
const SOLO = process.env.FB_SOLO === '1';

// ---------- publicar ----------
const WA = 'https://whatsapp.com/channel/0029VbEE3dUInlqGu4PmJF3o'; // canal de WhatsApp: va en todo lo que se publica
const conWA = t => { t = String(t || ''); if (t.includes('whatsapp.com/channel')) return t; const l = '📲 Pronóstico diario en WhatsApp: ' + WA, i = t.search(/\n\n\+18/); return i >= 0 ? t.slice(0, i) + '\n\n' + l + t.slice(i) : t + '\n\n' + l; };
async function foto(p, file, txt) {
  txt = conWA(txt);
  const fd = new FormData(); fd.append('source', new Blob([fs.readFileSync(file)]), path.basename(file)); fd.append('message', txt); fd.append('access_token', p.access_token);
  return api(`${G}/${p.id}/photos`, {method: 'POST', body: fd});
}
async function album(p, files, txt) {
  txt = conWA(txt);
  const ids = [];
  for (const f of files) {
    const fd = new FormData(); fd.append('source', new Blob([fs.readFileSync(f)]), path.basename(f)); fd.append('published', 'false'); fd.append('access_token', p.access_token);
    ids.push((await api(`${G}/${p.id}/photos`, {method: 'POST', body: fd})).id);
  }
  const fd = new FormData(); fd.append('message', txt); fd.append('access_token', p.access_token);
  ids.forEach((id, i) => fd.append(`attached_media[${i}]`, JSON.stringify({media_fbid: id})));
  return api(`${G}/${p.id}/feed`, {method: 'POST', body: fd});
}
async function reel(p, file, txt) {
  txt = conWA(txt);
  const st = await api(`${G}/${p.id}/video_reels`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({upload_phase: 'start', access_token: p.access_token})});
  const buf = fs.readFileSync(file);
  const up = await fetch(st.upload_url || `https://rupload.facebook.com/video-upload/v21.0/${st.video_id}`, {method: 'POST', headers: {Authorization: 'OAuth ' + p.access_token, offset: '0', file_size: String(buf.length)}, body: buf});
  if (!up.ok) throw new Error('subida del video: ' + up.status + ' ' + (await up.text()).slice(0, 200));
  return Object.assign({video_id: st.video_id}, await api(`${G}/${p.id}/video_reels`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({upload_phase: 'finish', video_id: st.video_id, video_state: 'PUBLISHED', description: txt, access_token: p.access_token})}));
}

// ---------- plan: un trabajo que queda despierto ~5,5 h, revisa cada minuto el horario y los pedidos del panel, y al terminar se vuelve a lanzar ----------
// (los horarios propios de GitHub llegan con horas de atraso o no llegan; así las publicaciones salen a su hora)
const SLOTS = [ // hora de Ecuador, modo, hasta qué hora todavía vale la pena publicarlo, días (0 = domingo)
  ['08:00', 'resdep', '12:00'], ['10:00', 'pro:8', '13:00'], ['10:30', 'reel', '13:30'], ['13:00', 'ana', '16:30'], ['16:00', 'reel:nba', '18:45'], ['17:30', 'radar', '20:30'], ['18:00', 'sem', '22:00', [0]], ['19:00', 'promo', '21:30', [3]]];
const ecuNow = () => { const d = new Date(Date.now() - 5 * 3600e3); return {day: d.toISOString().slice(0, 10), hm: d.toISOString().slice(11, 16), dow: d.getUTCDay()}; };
function correr(m, programado) {
  console.log(`\n===== ${new Date().toISOString()} · publicar ${m}${programado ? ' (programado)' : ' (pedido desde el panel)'} =====`);
  const r = require('child_process').spawnSync(process.execPath, [path.join(ROOT, 'facebook.js'), m], {stdio: 'inherit', env: Object.assign({}, process.env, {FB_PROGRAMADO: programado ? '1' : '0'}), timeout: 25 * 60e3});
  console.log(`===== ${m}: ${r.status === 0 ? 'listo' : 'terminó con error ' + r.status} =====`);
}
async function plan() {
  const T0 = Date.now(), MAX = (+process.env.PLAN_MIN || 330) * 60e3;
  console.log('Plan: revisando cada minuto hasta', new Date(T0 + MAX).toISOString());
  while (Date.now() - T0 < MAX) {
    try {
      const st = await estado();
      if (st) {
        const now = ecuNow(), hecho = Object.assign({}, st.hecho || {});
        Object.keys(hecho).forEach(k => { if (k.slice(0, 10) < now.day) delete hecho[k]; });
        if (st.ya && +st.yaT > Date.now() - 2 * 3600e3 && /^(pro(:\d+)?|resdep|res|reel(:nba|:sel)?|sem|ana(:sel)?|radar(:sel)?|promo)$/.test(st.ya)) { const m = st.ya, slot = SLOTS.find(x => x[1] === m || (m === 'pro' && x[1] === 'pro:8') || (m === 'res' && x[1] === 'resdep')); if (slot && now.hm <= slot[2]) hecho[now.day + '|' + slot[1]] = Date.now(); // si ya se publicó a pedido, no se repite a su hora
          await estadoSet({ya: '', yaT: 0, hecho, armando: m, armandoT: Date.now()}); process.env.FB_ANA = m === 'ana:sel' ? (st.anaSel || '') : ''; process.env.FB_REEL = m === 'reel:sel' ? JSON.stringify(st.reelSel || []) : ''; process.env.FB_RADAR = m === 'radar:sel' ? JSON.stringify(st.radarSel || []) : ''; process.env.FB_SOLO = (/:sel$/.test(m) || m === 'radar') && st.soloDesc ? '1' : ''; correr(m, false); process.env.FB_ANA = ''; process.env.FB_REEL = ''; process.env.FB_RADAR = ''; process.env.FB_SOLO = ''; continue; }
        for (const [h, m, hasta, dias] of SLOTS) {
          const k = now.day + '|' + m;
          if (hecho[k] || (dias && !dias.includes(now.dow)) || now.hm < h || now.hm > hasta) continue;
          hecho[k] = Date.now(); await estadoSet({hecho}); correr(m, true); break;
        }
      }
    } catch (e) { console.log('plan:', e.message); }
    await new Promise(r => setTimeout(r, 60e3));
  }
  console.log('Plan: fin de este turno (el siguiente sigue).');
}

(async () => {
  if (MODE === 'plan') return plan();
  // poll: cada 15 min revisa si en el panel pidieron "publicar ya"; escribe el modo en la salida de GitHub
  if (MODE === 'poll') {
    const st = await estado() || {}; let m = 'none';
    if (st.ya && +st.yaT > Date.now() - 2 * 3600e3 && /^(pro(:\d+)?|resdep|res|reel(:nba|:sel)?|sem|ana(:sel)?|radar(:sel)?|promo)$/.test(st.ya)) { m = st.ya; await estadoSet({ya: '', yaT: 0}); console.log('Pedido desde el panel:', m); }
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'modo=' + m + '\n'); else console.log('modo=' + m);
    return;
  }
  if (MODE !== 'check' && process.env.FB_PROGRAMADO === '1' && !DRY) { const st = await estado(); if (st && st.pausa) { console.log('En pausa desde el panel: no se publica.'); await anotar({ok: false, txt: 'En pausa'}); return; } }
  const p = process.argv.includes('--sin-fb') ? null : await pagina();
  if (MODE === 'check') { // v51.9 · revisa también Instagram
    try { const pr = await api(`${G}/me/permissions?access_token=${encodeURIComponent(process.env.FB_USER_TOKEN)}`); console.log('Permisos de la llave:', (pr.data || []).filter(x => x.status === 'granted').map(x => x.permission).join(', ')); } catch (e) { console.log('permisos:', e.message); }
    try { const ig = (await api(`${G}/${p.id}?fields=instagram_business_account{id,username,followers_count}&access_token=${encodeURIComponent(p.access_token)}`)).instagram_business_account; console.log(ig ? `Instagram vinculado: @${ig.username} (${ig.id}) · seguidores=${ig.followers_count}` : 'Instagram: la página no tiene cuenta profesional vinculada');
      if (ig) { const m = await api(`${G}/${ig.id}/media?fields=timestamp,media_type,caption&limit=5&access_token=${encodeURIComponent(p.access_token)}`); console.log('Últimas en Instagram:', (m.data || []).map(x => x.timestamp + ' ' + x.media_type + ' ' + String(x.caption || '').split('\n')[0].slice(0, 40)).join(' | ') || '(ninguna)'); } } catch (e) { console.log('Instagram:', e.message); }
    if (process.env.IG_PUB) try { // publica en Instagram (solo ahí) el último video guardado: ana, Radar o Reel
      const st = await estado() || {}, v = st['vid' + process.env.IG_PUB]; if (!v || !v.url) throw new Error('no hay video guardado de ' + process.env.IG_PUB);
      const igid = (await api(`${G}/${p.id}?fields=instagram_business_account&access_token=${encodeURIComponent(p.access_token)}`)).instagram_business_account.id, tk = encodeURIComponent(p.access_token);
      const id = (await api(`${G}/${igid}/media?access_token=${tk}`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({media_type: 'REELS', video_url: v.url, caption: igTxt(v.txt), share_to_feed: true})})).id;
      await igListo(igid, tk, id); const r = await api(`${G}/${igid}/media_publish?access_token=${tk}`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({creation_id: id})});
      console.log('PUBLICADO en Instagram:', r.id, '·', String(v.txt || '').split('\n')[0]);
    } catch (e) { console.log('PUBLICAR en Instagram falló:', e.message); }
    if (process.env.IG_TEST === '1') try { // prueba: arma un reel en Instagram pero NO lo publica
      const igid = (await api(`${G}/${p.id}?fields=instagram_business_account&access_token=${encodeURIComponent(p.access_token)}`)).instagram_business_account.id, tk = encodeURIComponent(p.access_token);
      const f = path.join(require('os').tmpdir(), 'igtest.mp4'); require('child_process').execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x0b1a12:s=1080x1920:d=6', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', f]);
      const id = await igVideo(igid, tk, f, 'prueba'); await igListo(igid, tk, id); console.log('PRUEBA Instagram: el video quedó listo para publicar (no se publicó) ✓');
    } catch (e) { console.log('PRUEBA Instagram falló:', e.message); }
    try { const st = await estado(); console.log('Registro del panel:\n' + (st && st.log || []).slice(0, 10).map(x => JSON.stringify(x)).join('\n')); } catch (e) { console.log('registro:', e.message); }
    return; }
  if (MODE === 'promo') { // una imagen y su texto preparados a mano (carpeta fb-promo)
    const f = path.join(ROOT, 'fb-promo', 'promo.png'), txt = (() => { const ls = fs.readdirSync(path.join(ROOT, 'fb-promo')).filter(x => /^promo\d+\.txt$/.test(x)).sort(), sem = Math.floor(Date.now() / (7 * 864e5)); /* un texto distinto cada semana */
      return fs.readFileSync(path.join(ROOT, 'fb-promo', ls.length ? ls[sem % ls.length] : 'promo.txt'), 'utf8').trim(); })();
    if (DRY || !p) { console.log('[prueba] no se publica:', txt.split('\n')[0]); return; }
    const r = await foto(p, f, txt); console.log('Publicada la promo:', r.post_id || r.id); await anotar({ok: true, id: r.post_id || r.id || '', txt: txt.split('\n')[0]}); await alInstagram(p, [f], txt); return;
  }
  if (MODE.startsWith('radar')) { // v51 · video radar
    const res = await radarVideo(); if (!res) { if (!DRY) await anotar({ok: false, txt: 'Sin jugadores para el radar'}); return; }
    let f = res.file; if (f.endsWith('.webm')) { const mp4 = f.replace(/\.webm$/, '.mp4'); require('child_process').execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', mp4]); f = mp4; }
    if (DRY || !p) { console.log(`[prueba] no se publica: ${path.basename(f)}\n${res.txt}`); return; }
    const vR = await guardarVideo(f, res.txt, 'Radar');
    if (SOLO) { await anotar({ok: true, txt: 'Video radar listo para compartir (no se publicó)'}); return; }
    const r = await reel(p, f, res.txt); console.log('Publicado el reel:', JSON.stringify(r)); await anotar({ok: true, id: st0(r), txt: res.txt.split('\n')[0]}); await alInstagram(p, [f], res.txt); return;
  }
  if (MODE.startsWith('ana')) { // v50 · video análisis de una jugada, con capturas de la app
    const res = await analisis(); if (!res) { console.log('Nada para publicar hoy.'); if (!DRY) await anotar({ok: false, txt: 'Sin jugada para el análisis'}); return; }
    if (DRY || !p) { console.log(`[prueba] no se publica: ${path.basename(res.file)}\n${res.txt}`); return; }
    let f = res.file; if (f.endsWith('.webm')) { const mp4 = f.replace(/\.webm$/, '.mp4'); require('child_process').execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', mp4]); f = mp4; }
    const vA = await guardarVideo(f, res.txt, 'Ana');
    if (SOLO) { await anotar({ok: true, txt: 'Video listo para descargar (no se publicó)'}); return; }
    const r = await reel(p, f, res.txt); console.log('Publicado el reel:', JSON.stringify(r)); await anotar({ok: true, id: st0(r), txt: res.txt.split('\n')[0]}); await alInstagram(p, [f], res.txt); return;
  }
  const out = await panel(async page => {
    if (MODE === 'sem') { // resumen de los 7 días hasta ayer (domingos)
      const info = await page.evaluate(() => window.__bot.semana()); console.log('Semana:', info.join(' | ') || 'pocas resueltas');
      if (!info.length) return [];
      return [{file: await bajar(page, k => window.__bot.bajar(k), 0), txt: await page.evaluate(() => window.__bot.texto(0))}];
    }
    if (MODE.startsWith('reel')) {
      if (process.env.FB_REEL) await page.evaluate(k => { window.__reelSel = k; }, JSON.parse(process.env.FB_REEL));
      const info = await page.evaluate(o => window.__bot.elegir('reel', o), MODE.split(':')[1] || null);
      console.log('Reel con:', info.join(' | '));
      if (info.length < (MODE === 'reel:sel' ? 1 : 2)) return []; // sin partidos suficientes ese día: no se publica
      if (/:sel$/.test(MODE)) await estadoSet({paso: '1/2 · Generando la voz y grabando el video…'}).catch(() => {});
      const f = await bajar(page, () => window.__bot.video());
      if (/:sel$/.test(MODE)) await estadoSet({paso: '2/2 · Subiendo el video…'}).catch(() => {});
      return [{file: f, txt: await page.evaluate(() => window.__bot.texto())}];
    }
    // pro[:N] = N sugerencias (4 por imagen) · res = ayer, todo junto · resdep = ayer, una imagen por deporte
    const [m, opt] = MODE.split(':'), res = [];
    const tandas = m === 'resdep' ? (await page.evaluate(() => window.__bot.deportesRes())).map(d => ['res', d]) : [[m, opt]];
    for (const [mm, oo] of tandas) {
      const info = await page.evaluate(([a, b]) => window.__bot.elegir(a, b), [mm, oo || null]);
      console.log((mm === 'res' ? `Resultados de ayer${oo ? ' (' + oo + ')' : ''}: ` : 'Pronósticos con: ') + info.join(' | '));
      if (!info.length) continue;
      const n = await page.evaluate(() => window.__bot.imagenes());
      for (let i = 0; i < n; i++) res.push({file: await bajar(page, k => window.__bot.bajar(k), i), txt: await page.evaluate(k => window.__bot.texto(k), i)});
    }
    // varias imágenes del mismo tipo: una sola publicación (álbum) con un solo texto
    if (res.length > 1) res.album = await page.evaluate(m => m === 'pro' ? window.__bot.textoPro() : window.__bot.textoRes(), m);
    return res;
  });
  if (!out.length) { console.log('Nada para publicar hoy.'); if (!DRY) await anotar({ok: false, txt: 'Nada para publicar'}); return; }
  if (out.album) {
    if (DRY) { console.log(`[prueba] no se publica: álbum de ${out.length} imágenes\n${out.album}`); return; }
    const r = await album(p, out.map(o => o.file), out.album); console.log('Publicado el álbum:', r.id); await anotar({ok: true, id: r.id || '', txt: out.album.split('\n')[0]}); await alInstagram(p, out.map(o => o.file), out.album); return;
  }
  for (const o of out) {
    const kb = Math.round(fs.statSync(o.file).size / 1024);
    if (DRY) { console.log(`[prueba] no se publica: ${path.basename(o.file)} (${kb} KB)\n${o.txt}`); continue; }
    if (o.file.endsWith('.png')) { const r = await foto(p, o.file, o.txt); console.log('Publicada la imagen:', r.post_id || r.id); await anotar({ok: true, id: r.post_id || r.id || '', txt: o.txt.split('\n')[0]}); await alInstagram(p, [o.file], o.txt); }
    else { let f = o.file; if (f.endsWith('.webm')) { const mp4 = f.replace(/\.webm$/, '.mp4'); require('child_process').execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', mp4]); f = mp4; }
      const vS = /:sel$/.test(MODE) ? await guardarVideo(f, o.txt, 'Reel') : null;
      if (SOLO) { await anotar({ok: true, txt: 'Video listo para descargar (no se publicó)'}); continue; }
      const r = await reel(p, f, o.txt); console.log('Publicado el reel:', JSON.stringify(r)); await anotar({ok: true, id: st0(r), txt: o.txt.split('\n')[0]}); await alInstagram(p, [f], o.txt); }
  }
})().catch(async e => { console.error('No se pudo:', e.message); if (!DRY && MODE !== 'poll') await anotar({ok: false, txt: 'Error: ' + String(e.message).slice(0, 140)}); process.exit(1); });
function st0(r) { return (r && (r.post_id || r.video_id || r.id)) || ''; }

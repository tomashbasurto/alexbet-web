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
let FSH = null, FS_DOC = null;
async function fsInit() {
  if (FSH !== null) return FSH; FSH = false;
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
async function estado() { const H = await fsInit(); if (!H) return null; const r = await fetch(FS_DOC + '?mask.fieldPaths=fb', {headers: H}); if (!r.ok) { console.log('estado: HTTP ' + r.status); return null; } const f = ((await r.json()).fields || {}).fb; return f ? fsVal(f) || {} : {}; }
async function estadoSet(obj) { const H = await fsInit(); if (!H) return; const q = Object.keys(obj).map(k => 'updateMask.fieldPaths=fb.' + k).join('&');
  const r = await fetch(FS_DOC + '?' + q, {method: 'PATCH', headers: H, body: JSON.stringify({fields: {fb: fsEnc(obj)}})}); if (!r.ok) console.log('estado: no se pudo guardar (HTTP ' + r.status + ')'); }
async function anotar(e) { try { const st = await estado(); if (!st) return; const log = [Object.assign({t: Date.now(), modo: MODE}, e)].concat(st.log || []).slice(0, 40); await estadoSet({log}); } catch (x) {} }

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

// ---------- publicar ----------
async function foto(p, file, txt) {
  const fd = new FormData(); fd.append('source', new Blob([fs.readFileSync(file)]), path.basename(file)); fd.append('message', txt); fd.append('access_token', p.access_token);
  return api(`${G}/${p.id}/photos`, {method: 'POST', body: fd});
}
async function album(p, files, txt) {
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
  const st = await api(`${G}/${p.id}/video_reels`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({upload_phase: 'start', access_token: p.access_token})});
  const buf = fs.readFileSync(file);
  const up = await fetch(st.upload_url || `https://rupload.facebook.com/video-upload/v21.0/${st.video_id}`, {method: 'POST', headers: {Authorization: 'OAuth ' + p.access_token, offset: '0', file_size: String(buf.length)}, body: buf});
  if (!up.ok) throw new Error('subida del video: ' + up.status + ' ' + (await up.text()).slice(0, 200));
  return Object.assign({video_id: st.video_id}, await api(`${G}/${p.id}/video_reels`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({upload_phase: 'finish', video_id: st.video_id, video_state: 'PUBLISHED', description: txt, access_token: p.access_token})}));
}

// ---------- plan: un trabajo que queda despierto ~5,5 h, revisa cada minuto el horario y los pedidos del panel, y al terminar se vuelve a lanzar ----------
// (los horarios propios de GitHub llegan con horas de atraso o no llegan; así las publicaciones salen a su hora)
const SLOTS = [ // hora de Ecuador, modo, hasta qué hora todavía vale la pena publicarlo, días (0 = domingo)
  ['08:00', 'resdep', '12:00'], ['10:00', 'pro:8', '13:00'], ['10:30', 'reel', '13:30'], ['16:00', 'reel:nba', '18:45'], ['18:00', 'sem', '22:00', [0]]];
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
        if (st.ya && +st.yaT > Date.now() - 2 * 3600e3 && /^(pro(:\d+)?|resdep|res|reel(:nba)?|sem)$/.test(st.ya)) { const m = st.ya, slot = SLOTS.find(x => x[1] === m || (m === 'pro' && x[1] === 'pro:8') || (m === 'res' && x[1] === 'resdep')); if (slot && now.hm <= slot[2]) hecho[now.day + '|' + slot[1]] = Date.now(); // si ya se publicó a pedido, no se repite a su hora
          await estadoSet({ya: '', yaT: 0, hecho}); correr(m, false); continue; }
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
    if (st.ya && +st.yaT > Date.now() - 2 * 3600e3 && /^(pro(:\d+)?|resdep|res|reel(:nba)?|sem)$/.test(st.ya)) { m = st.ya; await estadoSet({ya: '', yaT: 0}); console.log('Pedido desde el panel:', m); }
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'modo=' + m + '\n'); else console.log('modo=' + m);
    return;
  }
  if (MODE !== 'check' && process.env.FB_PROGRAMADO === '1' && !DRY) { const st = await estado(); if (st && st.pausa) { console.log('En pausa desde el panel: no se publica.'); await anotar({ok: false, txt: 'En pausa'}); return; } }
  const p = process.argv.includes('--sin-fb') ? null : await pagina();
  if (MODE === 'check') return;
  const out = await panel(async page => {
    if (MODE === 'sem') { // resumen de los 7 días hasta ayer (domingos)
      const info = await page.evaluate(() => window.__bot.semana()); console.log('Semana:', info.join(' | ') || 'pocas resueltas');
      if (!info.length) return [];
      return [{file: await bajar(page, k => window.__bot.bajar(k), 0), txt: await page.evaluate(() => window.__bot.texto(0))}];
    }
    if (MODE.startsWith('reel')) {
      const info = await page.evaluate(o => window.__bot.elegir('reel', o), MODE.split(':')[1] || null);
      console.log('Reel con:', info.join(' | '));
      if (info.length < 2) return []; // sin partidos suficientes ese día: no se publica
      const f = await bajar(page, () => window.__bot.video());
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
    const r = await album(p, out.map(o => o.file), out.album); console.log('Publicado el álbum:', r.id); await anotar({ok: true, id: r.id || '', txt: out.album.split('\n')[0]}); return;
  }
  for (const o of out) {
    const kb = Math.round(fs.statSync(o.file).size / 1024);
    if (DRY) { console.log(`[prueba] no se publica: ${path.basename(o.file)} (${kb} KB)\n${o.txt}`); continue; }
    if (o.file.endsWith('.png')) { const r = await foto(p, o.file, o.txt); console.log('Publicada la imagen:', r.post_id || r.id); await anotar({ok: true, id: r.post_id || r.id || '', txt: o.txt.split('\n')[0]}); }
    else { let f = o.file; if (f.endsWith('.webm')) { const mp4 = f.replace(/\.webm$/, '.mp4'); require('child_process').execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', mp4]); f = mp4; }
      const r = await reel(p, f, o.txt); console.log('Publicado el reel:', JSON.stringify(r)); await anotar({ok: true, id: st0(r), txt: o.txt.split('\n')[0]}); }
  }
})().catch(async e => { console.error('No se pudo:', e.message); if (!DRY && MODE !== 'poll') await anotar({ok: false, txt: 'Error: ' + String(e.message).slice(0, 140)}); process.exit(1); });
function st0(r) { return (r && (r.post_id || r.video_id || r.id)) || ''; }

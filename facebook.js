// AlexBet · publicaciones automáticas en la página de Facebook (GitHub Actions)
// Modos: check (solo comprueba la llave), pro (imagen de pronósticos de hoy), res (imagen de resultados de ayer), reel (video con voz)
// La llave (FB_USER_TOKEN, secreto de GitHub) es de larga duración; con ella se pide la llave de la página en cada corrida.
// Las imágenes y el video se arman con el mismo panel de publicaciones (publicar.html) abierto sin pantalla.
'use strict';
const fs = require('fs'), path = require('path');
const G = 'https://graph.facebook.com/v21.0';
const MODE = process.argv[2] || 'check', DRY = process.argv.includes('--prueba');
const ROOT = __dirname;

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
  console.log(`Llave de ${dbg.name} · páginas: ${L.map(x => x.name).join(', ')} · uso: ${p.name} (${p.id}) · permisos de página: ${(p.tasks || []).join(', ')}`);
  return p;
}

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
  const f = path.join(ROOT, 'fb-out', d.suggestedFilename()); fs.mkdirSync(path.dirname(f), {recursive: true}); await d.saveAs(f); return f;
}

// ---------- publicar ----------
async function foto(p, file, txt) {
  const fd = new FormData(); fd.append('source', new Blob([fs.readFileSync(file)]), path.basename(file)); fd.append('message', txt); fd.append('access_token', p.access_token);
  return api(`${G}/${p.id}/photos`, {method: 'POST', body: fd});
}
async function reel(p, file, txt) {
  const st = await api(`${G}/${p.id}/video_reels`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({upload_phase: 'start', access_token: p.access_token})});
  const buf = fs.readFileSync(file);
  const up = await fetch(st.upload_url || `https://rupload.facebook.com/video-upload/v21.0/${st.video_id}`, {method: 'POST', headers: {Authorization: 'OAuth ' + p.access_token, offset: '0', file_size: String(buf.length)}, body: buf});
  if (!up.ok) throw new Error('subida del video: ' + up.status + ' ' + (await up.text()).slice(0, 200));
  return api(`${G}/${p.id}/video_reels`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({upload_phase: 'finish', video_id: st.video_id, video_state: 'PUBLISHED', description: txt, access_token: p.access_token})});
}

(async () => {
  const p = await pagina();
  if (MODE === 'check') return;
  const out = await panel(async page => {
    if (MODE === 'reel') {
      const info = await page.evaluate(() => window.__bot.elegir('reel'));
      console.log('Reel con:', info.join(' | '));
      const f = await bajar(page, () => window.__bot.video());
      return [{file: f, txt: await page.evaluate(() => window.__bot.texto())}];
    }
    const info = await page.evaluate(m => window.__bot.elegir(m), MODE);
    console.log((MODE === 'res' ? 'Resultados de ayer con: ' : 'Pronósticos con: ') + info.join(' | '));
    if (!info.length) return [];
    const n = await page.evaluate(() => window.__bot.imagenes());
    const res = [];
    for (let i = 0; i < n; i++) res.push({file: await bajar(page, k => window.__bot.bajar(k), i), txt: await page.evaluate(k => window.__bot.texto(k), i)});
    return res;
  });
  if (!out.length) { console.log('Nada para publicar hoy.'); return; }
  for (const o of out) {
    const kb = Math.round(fs.statSync(o.file).size / 1024);
    if (DRY) { console.log(`[prueba] no se publica: ${path.basename(o.file)} (${kb} KB)\n${o.txt}`); continue; }
    if (o.file.endsWith('.png')) { const r = await foto(p, o.file, o.txt); console.log('Publicada la imagen:', r.post_id || r.id); }
    else { let f = o.file; if (f.endsWith('.webm')) { const mp4 = f.replace(/\.webm$/, '.mp4'); require('child_process').execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', f, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', mp4]); f = mp4; }
      const r = await reel(p, f, o.txt); console.log('Publicado el reel:', JSON.stringify(r)); }
  }
})().catch(e => { console.error('No se pudo:', e.message); process.exit(1); });

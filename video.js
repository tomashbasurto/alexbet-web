// AlexBet · videos cortos con voz (panel de publicaciones)
// Voz: Piper (modelos abiertos, MIT) corriendo dentro del navegador con ONNX Runtime. El modelo se baja una vez de
// Hugging Face y queda guardado en el navegador (IndexedDB). El video se dibuja en un canvas 1080×1920 y se graba
// con MediaRecorder junto con la voz (MP4 si el navegador lo permite, si no WebM).

const ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/';
const PHON_JS = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/dist/piper-DeOu3H9E.js';
const PHON_BASE = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';
const HF = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/';
// solo voces masculinas (tono medido: ald ~155 Hz, davefx ~128 Hz, sharvard hombre ~122 Hz)
export const VOCES = {
  'es_MX-ald-medium': {t: 'México · hombre', p: 'es/es_MX/ald/medium/es_MX-ald-medium.onnx'},
  'es_ES-davefx-medium': {t: 'España · hombre (voz grave)', p: 'es/es_ES/davefx/medium/es_ES-davefx-medium.onnx'},
  'es_ES-sharvard-medium': {t: 'España · hombre 2', p: 'es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx', sid: 0},
};

// ---------- descargas guardadas ----------
// La voz pesa 60–75 MB: se guarda en IndexedDB como Blob (en iPhone, Cache Storage no la guardaba).
const IDB = 'alexbet-voz', ST = 'f';
function idb() { return new Promise((res, rej) => { const q = indexedDB.open(IDB, 1); q.onupgradeneeded = () => q.result.createObjectStore(ST); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function idbGet(k) { try { const d = await idb(); return await new Promise(res => { const q = d.transaction(ST).objectStore(ST).get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch (e) { return null; } }
async function idbPut(k, v) { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction(ST, 'readwrite'); t.objectStore(ST).put(v, k); t.oncomplete = () => res(true); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('sin espacio')); }); }
async function viejoCache(url) { try { const c = await caches.open('alexbet-voz-1'); const h = await c.match(url); return h ? await h.blob() : null; } catch (e) { return null; } }
export let guardadoErr = '';
async function guardado(url, onProg) {
  let b = await idbGet(url);
  if (!b) { b = await viejoCache(url); if (b) { try { await idbPut(url, b); } catch (e) {} } }
  if (b) return await b.arrayBuffer();
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
  const r = await fetch(url); if (!r.ok) throw new Error('No se pudo bajar la voz (' + r.status + ')');
  const total = +(r.headers.get('Content-Length') || 0), rd = r.body && r.body.getReader(), parts = []; let got = 0;
  if (rd) { for (;;) { const {done, value} = await rd.read(); if (done) break; parts.push(value); got += value.length; onProg && onProg(got, total); } }
  const blob = rd ? new Blob(parts) : await r.blob();
  try { await idbPut(url, blob); guardadoErr = ''; } catch (e) { guardadoErr = 'No se pudo guardar la voz en este navegador (' + (e && e.name || 'error') + '): se volverá a bajar la próxima vez.'; }
  return await blob.arrayBuffer();
}
export async function vozGuardada(id) { const u = HF + VOCES[id].p; return !!((await idbGet(u)) || (await viejoCache(u))); }

let ortP = null;
function cargarOrt() {
  if (window.ort) return Promise.resolve(window.ort);
  return ortP = ortP || new Promise((res, rej) => { const s = document.createElement('script'); s.src = ORT_BASE + 'ort.min.js'; s.onload = () => res(window.ort); s.onerror = () => rej(new Error('No se pudo cargar el motor de voz')); document.head.appendChild(s); });
}
let phonP = null;
const cargarPhon = () => phonP = phonP || import(PHON_JS);

export class Voz {
  constructor(id) { this.id = id; this.ses = null; this.cfg = null; this.memo = new Map(); }
  async init(onProg) {
    const ort = await cargarOrt(); ort.env.wasm.wasmPaths = ORT_BASE; ort.env.wasm.numThreads = 1;
    const v = VOCES[this.id], [cfgBuf, model] = await Promise.all([guardado(HF + v.p + '.json'), guardado(HF + v.p, onProg)]);
    this.cfg = JSON.parse(new TextDecoder().decode(cfgBuf));
    this.ses = await ort.InferenceSession.create(model, {executionProviders: ['wasm'], graphOptimizationLevel: 'all'});
    await cargarPhon();
  }
  // todos los textos en una sola pasada del diccionario de pronunciación (antes se cargaba una vez por frase)
  async fonemasVarios(texts) {
    const {createPiperPhonemize} = await cargarPhon(), out = [];
    return new Promise((res, rej) => {
      createPiperPhonemize({
        print: l => { try { out.push(JSON.parse(l).phoneme_ids); if (out.length === texts.length) res(out); } catch (e) { rej(e); } },
        printErr: l => { if (/error/i.test(l)) rej(new Error(l)); },
        locateFile: f => f.endsWith('.wasm') ? PHON_BASE + '.wasm' : f.endsWith('.data') ? PHON_BASE + '.data' : f,
      }).then(m => m.callMain(['-l', this.cfg.espeak.voice, '--input', JSON.stringify(texts.map(text => ({text}))), '--espeak_data', '/espeak-ng-data'])).catch(rej);
    });
  }
  async correr(ids, vel) {
    const ort = window.ort, I = this.cfg.inference;
    const feeds = {
      input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor('float32', Float32Array.from([I.noise_scale, I.length_scale / vel, I.noise_w]), [3]),
    };
    if (Object.keys(this.cfg.speaker_id_map || {}).length) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([BigInt(VOCES[this.id] && VOCES[this.id].sid || 0)]), [1]);
    const out = await this.ses.run(feeds), pcm = Float32Array.from(out.output.data);
    let mx = 0; for (const s of pcm) mx = Math.max(mx, Math.abs(s)); if (mx > 0) { const k = 0.9 / mx; for (let i = 0; i < pcm.length; i++) pcm[i] *= k; }
    return {pcm, sr: this.cfg.audio.sample_rate};
  }
  // textos -> [{pcm, sr}] (lo ya generado con la misma voz y velocidad sale al instante)
  async decirVarios(texts, vel = 1, onEach) {
    const key = t => vel.toFixed(3) + '|' + t, falta = [...new Set(texts.filter(t => !this.memo.has(key(t))))];
    if (falta.length) {
      const ids = await this.fonemasVarios(falta);
      for (const [i, t] of falta.entries()) { onEach && onEach(i + 1, falta.length); this.memo.set(key(t), await this.correr(ids[i], vel)); await new Promise(r => setTimeout(r, 0)); }
    }
    return texts.map(t => this.memo.get(key(t)));
  }
  async decir(text, vel = 1) { return (await this.decirVarios([text], vel))[0]; }
}

// ---------- texto para la voz ----------
const U = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DE = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CE = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
export function n2w(n) {
  n = Math.floor(Math.abs(n));
  if (n < 30) return U[n]; if (n < 100) return DE[Math.floor(n / 10)] + (n % 10 ? ' y ' + U[n % 10] : '');
  if (n === 100) return 'cien'; if (n < 1000) return CE[Math.floor(n / 100)] + (n % 100 ? ' ' + n2w(n % 100) : '');
  if (n < 2000) return 'mil' + (n % 1000 ? ' ' + n2w(n % 1000) : '');
  if (n < 1e6) return n2w(Math.floor(n / 1000)) + ' mil' + (n % 1000 ? ' ' + n2w(n % 1000) : '');
  return String(n);
}
// número -> palabras ("19.5" -> "diecinueve punto cinco"); "uno" delante de un sustantivo -> "un"
export function numW(x) {
  const s = String(x).replace(',', '.'), neg = s.trim().startsWith('-'), [a, b] = s.replace(/^[+-]/, '').split('.');
  let t = n2w(+a); if (b && +b !== 0) t += ' punto ' + (b.length === 1 ? n2w(+b) : b.split('').map(d => U[+d]).join(' '));
  return (neg ? 'menos ' : '') + t;
}
const MK_VOZ = [[/Pts\+Reb\+Ast\+Tap/gi, 'puntos, rebotes, asistencias y tapones'], [/Pts\+Reb\+Ast/gi, 'puntos, rebotes y asistencias'], [/Pts\+Ast\+Tap/gi, 'puntos, asistencias y tapones'],
  [/Pts\+Reb/gi, 'puntos y rebotes'], [/Pts\+Ast/gi, 'puntos y asistencias'], [/Reb\+Ast/gi, 'rebotes y asistencias'], [/Robos\+Tapones/gi, 'robos y tapones'],
  [/\bvs\.?\b/gi, 'contra'], [/\bPJ\b/g, 'partidos'], [/\bNBA\b/g, 'ene be a'], [/\bNHL\b/g, 'ene hache ele'], [/\bMLB\b/g, 'eme ele be'], [/\bNCAA\b/g, 'ene ce doble a'], [/\bATP\b/g, 'a te pe'], [/\bWTA\b/g, 'uve doble te a'],
  [/%/g, ' por ciento'], [/\s*\+\s*/g, ' más '], [/·/g, ','], [/\s*\/\s*/g, ' de ']];
export function hablar(t) {
  let s = String(t);
  MK_VOZ.forEach(([r, w]) => s = s.replace(r, w));
  s = s.replace(/(^|[\s(])([+-]?\d+(?:[.,]\d+)?)(?=[\s).,;:!?]|$)/g, (m, pre, num) => pre + numW(num));
  s = s.replace(/\buno (puntos|rebotes|asistencias|goles|córners|tarjetas|triples|partidos|juegos|sets|carreras|hits|tiros|robos|tapones|faltas|ponches)/g, 'un $1');
  s = s.replace(/\bveintiuno (puntos|rebotes|asistencias|goles|partidos|juegos)/g, 'veintiún $1');
  return s.replace(/\s+/g, ' ').trim();
}
const ORD = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis'];
const DSEM = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'], MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaVoz = d => { const x = new Date(d + 'T12:00:00Z'); return `${DSEM[x.getUTCDay()]} ${n2w(x.getUTCDate())} de ${MES[x.getUTCMonth()]}`; };
const dec1 = v => Math.round(v * 10) / 10;
const avgOf = v => v && v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;

// qué se dice de cada sugerencia: corto, para que el video quede en unos 40 segundos
const ORDF = ['Primera', 'Segunda', 'Tercera', 'Cuarta', 'Quinta', 'Sexta'];
const rival = p => p.who === p.h ? p.a : p.who === p.a ? p.h : (p.team === p.h ? p.a : p.team === p.a ? p.h : '');
export function guion(p, i) {
  const v = p.vals || [], av = p.avg != null ? p.avg : avgOf(v), cab = (ORDF[i] || 'Otra') + '.';
  const prom = av != null && !p.diff ? `, promedio ${dec1(av)}` : '';
  let qui, mk, est = '';
  if (p.kind === 'player') {
    qui = p.pname; mk = `Más de ${p.ln} ${String(p.mk).toLowerCase()}`;
    if (p.hit != null && p.n) est = `La superó en ${p.hit} de sus últimos ${p.n}${prom}.`;
  } else if (p.who && p.who !== 'Partido' && p.mk) {
    qui = `${p.who}${rival(p) ? ', ante ' + rival(p) : ''}`; mk = `Más de ${p.ln} ${String(p.mk).toLowerCase()}`;
    if (p.hit != null && p.n) est = `Lo logró en ${p.hit} de sus últimos ${p.n}${prom}.`;
  } else {
    qui = `${p.h} contra ${p.a}`; mk = String(p.label);
    if (p.hit != null && p.n) {
      const que = p.passTxt === 'partidos ganados' ? 'Ganó' : p.passTxt === 'cubrió la línea' ? 'Cubrió la línea' : p.passTxt === 'ganó un set o más' ? 'Ganó al menos un set' : 'Pasó';
      est = /cada (equipo|jugador)/.test(p.sub || '') ? `${que} en ${p.hit} de sus últimos ${p.n} partidos juntos${prom}.` : `${que} en ${p.hit} de sus últimos ${p.n}${prom}.`;
    }
  }
  return {voz: hablar(`${cab} ${qui}. ${mk}. ${est} ${p.prob}%.`)};
}
export const vozIntro = (day, n) => hablar(`${n === 1 ? 'Una oportunidad' : n2w(n) + ' oportunidades'} para hoy, ${fechaVoz(day)}. ¡Vamos!`).replace(/^./, c => c.toUpperCase());
export const vozCierre = st => hablar((st && st.n >= 100 ? `${st.pct}% de aciertos en ${st.n} pronósticos reales. ` : '') + 'Más en álex bet pro, punto web, punto app. Juega con responsabilidad.');

// ---------- dibujo ----------
const VW = 1080, VH = 1920, A = '#c6ff00', INK = '#eef5f2', DIM = '#8aa39b', CY = '#22d3ee', GRAY = '#3a4652';
const ease = t => t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3);
const seg = (t, a, d) => ease((t - a) / d);
function rr(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function wrap(c, t, w, maxL) {
  const words = String(t).split(' '), L = []; let cur = '';
  for (const wd of words) { const tt = cur ? cur + ' ' + wd : wd; if (c.measureText(tt).width <= w) cur = tt; else { if (cur) L.push(cur); cur = wd; } }
  if (cur) L.push(cur); if (L.length > maxL) { L.length = maxL; L[maxL - 1] += '…'; } return L;
}
function fitFont(c, t, w, size, weight, fam, min = 30) { let s = size; c.font = `${weight} ${s}px ${fam}`; while (s > min && c.measureText(t).width > w) { s -= 2; c.font = `${weight} ${s}px ${fam}`; } return s; }
const ini = n => String(n || '?').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
function circleImg(c, im, name, x, y, s, ring) {
  c.save(); c.beginPath(); c.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2); c.closePath();
  if (im && im.isPhoto) { c.fillStyle = '#16251f'; c.fill(); c.clip(); const r = im.width / im.height, ww = r >= 1 ? s * r : s, hh = r >= 1 ? s : s / r; c.drawImage(im, x + (s - ww) / 2, y, ww, hh); }
  else if (im) { c.fillStyle = 'rgba(255,255,255,.95)'; c.fill(); c.clip(); c.drawImage(im, x + s * .12, y + s * .12, s * .76, s * .76); }
  else { c.fillStyle = '#1f2f2a'; c.fill(); c.fillStyle = INK; c.font = `800 ${Math.round(s * .34)}px Inter`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ini(name), x + s / 2, y + s / 2 + 2); c.textAlign = 'left'; c.textBaseline = 'alphabetic'; }
  c.restore();
  if (ring) { c.beginPath(); c.arc(x + s / 2, y + s / 2, s / 2 + 3, 0, Math.PI * 2); c.strokeStyle = ring; c.lineWidth = 6; c.stroke(); }
}
function fondo(c, t) {
  c.fillStyle = '#040807'; c.fillRect(0, 0, VW, VH);
  const dx = Math.sin(t * .35) * 60;
  let g = c.createRadialGradient(880 + dx, 120, 10, 880 + dx, 120, 900); g.addColorStop(0, 'rgba(198,255,0,.16)'); g.addColorStop(1, 'rgba(198,255,0,0)'); c.fillStyle = g; c.fillRect(0, 0, VW, VH);
  g = c.createRadialGradient(120 - dx, 1820, 10, 120 - dx, 1820, 1000); g.addColorStop(0, 'rgba(34,211,238,.13)'); g.addColorStop(1, 'rgba(34,211,238,0)'); c.fillStyle = g; c.fillRect(0, 0, VW, VH);
  c.strokeStyle = 'rgba(255,255,255,.03)'; c.lineWidth = 1; const off = (t * 18) % 60;
  for (let x = 0; x < VW; x += 60) { c.beginPath(); c.moveTo(x + .5, 0); c.lineTo(x + .5, VH); c.stroke(); }
  for (let y = -60 + off; y < VH; y += 60) { c.beginPath(); c.moveTo(0, y + .5); c.lineTo(VW, y + .5); c.stroke(); }
}
function marca(c, logo, x, y, s) {
  if (logo) { c.save(); rr(c, x, y, s, s, s * .24); c.clip(); c.drawImage(logo, x, y, s, s); c.restore(); }
  c.font = `900 ${Math.round(s * .55)}px Orbitron`; c.fillStyle = INK; c.fillText('ALEX', x + s + 18, y + s * .72); const w = c.measureText('ALEX').width; c.fillStyle = A; c.fillText('BET', x + s + 18 + w, y + s * .72);
}
function pieV(c) {
  c.font = '600 26px Inter'; c.fillStyle = DIM; c.textAlign = 'center';
  c.fillText('+18 · Son probabilidades, no garantías · alexbetpro.web.app', VW / 2, VH - 70); c.textAlign = 'left';
}
function chip(c, txt, x, y, col) {
  c.font = '700 30px Inter'; const w = c.measureText(txt).width + 56;
  rr(c, x, y, w, 62, 31); c.fillStyle = 'rgba(255,255,255,.06)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 2; c.stroke();
  c.beginPath(); c.arc(x + 26, y + 31, 8, 0, Math.PI * 2); c.fillStyle = col || A; c.fill();
  c.fillStyle = INK; c.fillText(txt, x + 44, y + 42); return w;
}

function escenaIntro(c, S, t, D) {
  const a = seg(t, 0, .6), b = seg(t, .4, .7), d = seg(t, .9, .7);
  c.globalAlpha = a; marca(c, D.logo, 90, 150 - (1 - a) * 40, 120); c.globalAlpha = 1;
  c.font = '900 120px Orbitron'; c.fillStyle = INK; c.globalAlpha = b; c.fillText(String(S.n), 90, 520 + (1 - b) * 40);
  fitFont(c, 'OPORTUNIDADES', VW - 180, 92, 900, 'Orbitron', 60); c.fillText('OPORTUNIDADES', 90, 640 + (1 - b) * 40); c.fillStyle = A; c.fillText('DE HOY', 90, 750 + (1 - b) * 40); c.globalAlpha = 1;
  c.globalAlpha = d; c.font = '700 40px Orbitron'; c.fillStyle = A; c.fillText(S.fecha, 90, 850); c.globalAlpha = 1;
  S.items.forEach((p, i) => {
    const k = seg(t, .8 + i * .25, .5), y = 960 + i * 180; if (k <= 0) return;
    c.globalAlpha = k; const x = 90 + (1 - k) * 120;
    rr(c, x, y, VW - 180, 150, 30); c.fillStyle = 'rgba(17,30,27,.92)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 2; c.stroke();
    c.save(); rr(c, x, y, VW - 180, 150, 30); c.clip(); c.fillStyle = p.color || A; c.fillRect(x, y, 10, 150); c.restore();
    c.font = '900 44px Orbitron'; c.fillStyle = A; c.fillText(String(i + 1), x + 44, y + 92);
    c.font = '600 28px Inter'; c.fillStyle = DIM; c.fillText(S.sub[i], x + 120, y + 58);
    fitFont(c, S.tit[i], VW - 180 - 150, 40, 800, 'Inter', 28); c.fillStyle = INK; c.fillText(S.tit[i], x + 120, y + 110);
    c.globalAlpha = 1;
  });
  pieV(c);
}

function barras(c, p, x, y, w, h, k) {
  const v = (p.vals || []).slice(0, 10).slice().reverse(); if (!v.length) return false;
  const n = v.length, gp = 14, bw = (w - gp * (n - 1)) / n;
  const lnOk = a => p.under ? a < p.ln : a > p.ln;
  if (p.diff) {
    const mx = Math.max(1, ...v.map(Math.abs), Math.abs(p.ln) + 1), half = (h - 60) / 2, y0 = y + 30 + half;
    c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y0); c.lineTo(x + w, y0); c.stroke();
    v.forEach((a, i) => { const q = seg(k, i * .07, .35), hh = Math.max(6, Math.abs(a) / mx * half) * q, bx = x + i * (bw + gp), up = a >= 0;
      rr(c, bx, up ? y0 - hh : y0, bw, hh, 8); c.fillStyle = a > p.ln ? A : GRAY; c.fill();
      if (q > .9) { c.font = '700 26px Orbitron'; c.fillStyle = '#b8c9c3'; c.textAlign = 'center'; c.fillText((a > 0 ? '+' : '') + a, bx + bw / 2, up ? y0 - hh - 12 : y0 + hh + 32); c.textAlign = 'left'; } });
    return true;
  }
  const mx0 = Math.max(...v, (p.ln || 0) + 1), lo = Math.min(...v, p.ln || 0), base = p.ln > 20 ? Math.max(0, Math.floor(lo - (mx0 - lo) * .35)) : 0, mx = mx0 - base, top = h - 50;
  v.forEach((a, i) => { const q = seg(k, i * .07, .35), hh = Math.max(8, (a - base) / mx * top) * q, bx = x + i * (bw + gp);
    rr(c, bx, y + h - hh, bw, hh, 10); c.fillStyle = lnOk(a) ? A : GRAY; c.fill();
    if (q > .9) { c.font = `700 ${v.some(z => z >= 100) ? 22 : 28}px Orbitron`; c.fillStyle = '#b8c9c3'; c.textAlign = 'center'; c.fillText(String(a), bx + bw / 2, y + h - hh - 14); c.textAlign = 'left'; } });
  const lk = seg(k, .3, .4), ly = y + h - ((p.ln - base) / mx) * top;
  c.globalAlpha = lk; c.setLineDash([16, 12]); c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 4; c.beginPath(); c.moveTo(x - 6, ly); c.lineTo(x + (w + 18) * lk - 6, ly); c.stroke(); c.setLineDash([]);
  c.font = '600 24px Inter'; c.fillStyle = DIM; c.fillText('línea', x + w + 24, ly - 8); c.font = '900 34px Orbitron'; c.fillStyle = INK; c.fillText(String(p.ln), x + w + 24, ly + 30); c.globalAlpha = 1;
  return true;
}

function escenaPick(c, S, t, D) {
  const p = S.p, g = S.g, dur = S.dur;
  // arriba: marca y progreso
  marca(c, D.logo, 70, 70, 76);
  for (let i = 0; i < S.total; i++) { const x = VW - 70 - (S.total - i) * 74; rr(c, x, 100, 62, 14, 7); c.fillStyle = i < S.i ? A : i === S.i ? 'rgba(198,255,0,.35)' : 'rgba(255,255,255,.12)'; c.fill();
    if (i === S.i) { rr(c, x, 100, 62 * Math.min(1, t / dur), 14, 7); c.fillStyle = A; c.fill(); } }
  // número y liga
  const a1 = seg(t, 0, .5);
  c.globalAlpha = a1; c.font = '900 64px Orbitron'; c.fillStyle = A; c.fillText(`#${S.i + 1}`, 70, 270);
  chip(c, `${S.lugar} · ${S.hora}`, 200, 222, p.color); c.globalAlpha = 1;
  // protagonistas
  const a2 = seg(t, .25, .6), yv = 340 + (1 - a2) * 50;
  c.globalAlpha = a2;
  if (p.kind === 'player') {
    circleImg(c, S.foto, p.pname, VW / 2 - 170, yv, 340, A);
    if (S.escTeam) circleImg(c, S.escTeam, p.team, VW / 2 + 90, yv + 240, 110, '#0d1614');
    const fs = fitFont(c, p.pname, VW - 140, 70, 900, 'Inter', 44); c.fillStyle = INK; c.textAlign = 'center'; c.fillText(p.pname, VW / 2, yv + 430);
    c.font = '600 34px Inter'; c.fillStyle = DIM; c.fillText(p.team ? `${p.team}${rival(p) ? ' vs ' + rival(p) : ''}` : `${p.h} vs ${p.a}`, VW / 2, yv + 485); c.textAlign = 'left';
  } else {
    const s = 230, gap = 160, x1 = VW / 2 - gap / 2 - s, x2 = VW / 2 + gap / 2;
    circleImg(c, S.escH, p.h, x1, yv, s); circleImg(c, S.escA, p.a, x2, yv, s);
    c.font = '900 56px Orbitron'; c.fillStyle = CY; c.textAlign = 'center'; c.fillText('VS', VW / 2, yv + s / 2 + 20);
    [[p.h, x1 + s / 2], [p.a, x2 + s / 2]].forEach(([n, cx]) => { c.font = '800 40px Inter'; const L = wrap(c, n, 400, 2); L.forEach((l, j) => { c.fillStyle = INK; c.fillText(l, cx, yv + s + 64 + j * 48); }); });
    c.textAlign = 'left';
  }
  c.globalAlpha = 1;
  // el pronóstico
  const a3 = seg(t, .7, .6), ym = 880;
  c.globalAlpha = a3; rr(c, 70, ym, VW - 140, 250, 36); c.fillStyle = 'rgba(198,255,0,.08)'; c.fill(); c.strokeStyle = 'rgba(198,255,0,.45)'; c.lineWidth = 3; c.stroke();
  c.font = '800 30px Inter'; c.fillStyle = DIM; c.fillText('PRONÓSTICO', 110, ym + 58);
  const L = (() => { c.font = '900 64px Inter'; return wrap(c, S.mkTxt.toUpperCase(), VW - 140 - 330, 2); })();
  L.forEach((l, j) => { c.font = '900 64px Inter'; c.fillStyle = A; c.fillText(l, 110, ym + 140 + j * 70); });
  // anillo de probabilidad
  const pr = Math.round(p.prob * seg(t, .9, 1.1)), cx = VW - 70 - 145, cyR = ym + 125, R = 98;
  c.lineWidth = 22; c.strokeStyle = 'rgba(255,255,255,.1)'; c.beginPath(); c.arc(cx, cyR, R, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = A; c.lineCap = 'round'; c.beginPath(); c.arc(cx, cyR, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pr / 100); c.stroke(); c.lineCap = 'butt';
  c.font = '900 58px Orbitron'; c.fillStyle = INK; c.textAlign = 'center'; c.fillText(pr + '%', cx, cyR + 20); c.font = '600 22px Inter'; c.fillStyle = DIM; c.fillText('probabilidad', cx, cyR + 56); c.textAlign = 'left';
  c.globalAlpha = 1;
  // estadísticas
  const a4 = seg(t, 1.3, .6), ys = 1190;
  c.globalAlpha = a4; rr(c, 70, ys, VW - 140, 600, 36); c.fillStyle = 'rgba(17,30,27,.92)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 2; c.stroke();
  if (S.statTit) { c.font = '800 34px Inter'; c.fillStyle = INK; c.fillText(S.statTit, 110, ys + 70); }
  const hasB = barras(c, p, 110, ys + 110, VW - 220 - 130, 300, Math.max(0, (t - 1.4) / 2));
  const yk = ys + 470;
  if (hasB) {
    c.font = '900 72px Orbitron'; c.fillStyle = A; c.fillText(`${p.hit}/${p.n}`, 110, yk + 70);
    const w1 = c.measureText(`${p.hit}/${p.n}`).width; c.font = '600 30px Inter'; c.fillStyle = DIM; c.fillText(S.hitTxt, 110 + w1 + 24, yk + 40);
    if (S.avgTxt) { c.font = '800 34px Inter'; c.fillStyle = INK; c.fillText(S.avgTxt, 110 + w1 + 24, yk + 84); }
  } else {
    c.font = '600 34px Inter'; c.fillStyle = DIM; c.fillText('Cuota mínima para que valga la pena', 110, ys + 200);
    c.font = '900 110px Orbitron'; c.fillStyle = INK; c.fillText((100 / Math.max(1, p.prob)).toFixed(2), 110, ys + 340);
    c.font = '600 30px Inter'; c.fillStyle = DIM; c.fillText('Si tu casa paga más que esto, el modelo la ve con valor.', 110, ys + 420);
  }
  c.globalAlpha = 1;
  pieV(c);
}

function escenaCierre(c, S, t, D) {
  const a = seg(t, 0, .6), b = seg(t, .5, .7), d = seg(t, 1.1, .7);
  c.globalAlpha = a; const s = 200; if (D.logo) { c.save(); rr(c, VW / 2 - s / 2, 260, s, s, 48); c.clip(); c.drawImage(D.logo, VW / 2 - s / 2, 260, s, s); c.restore(); }
  c.font = '900 92px Orbitron'; c.textAlign = 'center'; const w = c.measureText('ALEXBET').width; c.fillStyle = INK; c.fillText('ALEX', VW / 2 - w / 2 + c.measureText('ALEX').width / 2, 600); c.fillStyle = A; c.fillText('BET', VW / 2 + w / 2 - c.measureText('BET').width / 2, 600); c.globalAlpha = 1;
  if (S.st && S.st.n >= 100) {
    c.globalAlpha = b; c.font = '900 210px Orbitron'; c.fillStyle = A; c.fillText(Math.round(S.st.pct * b) + '%', VW / 2, 900);
    c.font = '800 50px Inter'; c.fillStyle = INK; c.fillText(`de aciertos en ${S.st.n.toLocaleString('es-EC')} pronósticos`, VW / 2, 990);
    c.font = '500 36px Inter'; c.fillStyle = DIM; c.fillText('resultados reales y públicos', VW / 2, 1046); c.globalAlpha = 1;
  }
  c.globalAlpha = d; rr(c, 120, 1180, VW - 240, 150, 75); c.fillStyle = A; c.fill();
  c.font = '900 56px Orbitron'; c.fillStyle = '#061006'; c.fillText('alexbetpro.web.app', VW / 2, 1275);
  c.font = '700 40px Inter'; c.fillStyle = INK; c.fillText('Síguenos para las de mañana', VW / 2, 1440);
  rr(c, VW / 2 - 70, 1540, 140, 80, 18); c.strokeStyle = INK; c.lineWidth = 5; c.stroke(); c.font = '900 44px Orbitron'; c.fillStyle = INK; c.fillText('+18', VW / 2, 1596);
  c.font = '500 32px Inter'; c.fillStyle = DIM; c.fillText('Son probabilidades, no garantías. Juega con responsabilidad.', VW / 2, 1690);
  c.textAlign = 'left'; c.globalAlpha = 1;
}

// ---------- armado y grabación ----------
// sel: sugerencias (máx. 4) · ctx: {day, fecha, logo, img(p) -> {escH, escA, foto, escTeam}, lugar(p), hora(p), stats, voz, vel, onMsg, canvas}
export async function crearVideo(sel, ctx) {
  const msg = ctx.onMsg || (() => {});
  const L = sel.slice(0, 4), voz = ctx.voz;
  await Promise.all([document.fonts.load('900 64px Orbitron'), document.fonts.load('900 64px Inter'), document.fonts.load('800 40px Inter'), document.fonts.load('600 30px Inter')]).catch(() => {});
  // guiones y voces
  const deps = [...new Set(L.map(p => ({futbol: 'fútbol', nba: 'la NBA', ncaa: 'la NCAA', eul: 'la Euroliga', nhl: 'la NHL', mlb: 'MLB', tenis: 'tenis'})[p.sp] || p.sp))];
  const depsTxt = deps.length > 1 ? deps.slice(0, -1).join(', ') + ' y ' + deps[deps.length - 1] : deps[0];
  const scenes = [];
  scenes.push({k: 'intro', n: L.length, fecha: ctx.fecha, items: L, voz: vozIntro(ctx.day, L.length),
    tit: L.map(p => p.kind === 'player' ? `${p.pname} · más de ${p.ln} ${String(p.mk).toLowerCase()}` : p.label),
    sub: L.map(p => `${ctx.lugar(p)} · ${ctx.hora(p)}${p.kind === 'player' ? '' : ' · ' + p.h + ' vs ' + p.a}`)});
  for (const [i, p] of L.entries()) {
    const g = guion(p, i), im = await ctx.img(p), av = p.avg != null ? p.avg : avgOf(p.vals);
    const unidad = p.kind === 'player' || (p.who && p.who !== 'Partido') ? String(p.mk || '').toLowerCase() : '';
    scenes.push(Object.assign({k: 'pick', p, g, i, total: L.length, voz: g.voz, lugar: ctx.lugar(p), hora: ctx.hora(p),
      mkTxt: p.kind === 'player' ? `Más de ${p.ln} ${String(p.mk).toLowerCase()}` : p.who && p.who !== 'Partido' ? `${p.who}: más de ${p.ln} ${String(p.mk).toLowerCase()}` : String(p.label),
      statTit: p.vals && p.vals.length ? (p.kind === 'player' ? `Sus últimos ${p.n} partidos` : p.sub && /cada/.test(p.sub) ? `Últimos partidos (${p.sub})` : `Últimos ${p.n} partidos`) : 'Sin racha guardada',
      hitTxt: p.passTxt || (p.under ? 'quedó por debajo' : 'superó la línea'),
      avgTxt: av != null && !p.diff ? `promedio ${dec1(av)}${unidad ? ' ' + unidad : ''}` : ''}, im));
  }
  scenes.push({k: 'cierre', st: ctx.stats, voz: vozCierre(ctx.stats)});
  msg('Preparando el texto de la voz…');
  const auds = await voz.decirVarios(scenes.map(s => s.voz), (ctx.vel || 1) / (ctx.tono || 1), (i, n) => msg(`Generando la voz ${i} de ${n}…`, Math.round((i - 1) / n * 100)));
  for (const [i, s] of scenes.entries()) {
    s.au = auds[i];
    s.dur = Math.max(s.k === 'pick' ? 5.8 : s.k === 'intro' ? 3.6 : 4.5, s.au.pcm.length / s.au.sr / (ctx.tono || 1) + (s.k === 'cierre' ? 1.2 : 0.7));
  }
  let t0 = 0; scenes.forEach(s => { s.t0 = t0; t0 += s.dur; }); const total = t0;

  // audio
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === 'suspended') await ac.resume().catch(() => {});
  const dest = ac.createMediaStreamDestination();
  const cv = ctx.canvas || document.createElement('canvas'); cv.width = VW; cv.height = VH; const c = cv.getContext('2d');
  const stream = cv.captureStream(30); stream.addTrack(dest.stream.getAudioTracks()[0]);
  const tipos = ['video/mp4;codecs=avc1.42E028,mp4a.40.2', 'video/mp4;codecs=avc1.4D0028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mime = tipos.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, mime ? {mimeType: mime, videoBitsPerSecond: 5e6, audioBitsPerSecond: 128e3} : {videoBitsPerSecond: 5e6});
  const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const done = new Promise(r => rec.onstop = r);
  const draw = tt => {
    const s = scenes.find(x => tt >= x.t0 && tt < x.t0 + x.dur) || scenes[scenes.length - 1], lt = tt - s.t0;
    fondo(c, tt);
    const fadeIn = Math.min(1, lt / .35), fadeOut = Math.min(1, (s.dur - lt) / .3);
    c.globalAlpha = 1; if (s.k === 'intro') escenaIntro(c, s, lt, ctx); else if (s.k === 'pick') escenaPick(c, s, lt, ctx); else escenaCierre(c, s, lt, ctx);
    const f = Math.min(fadeIn, s === scenes[scenes.length - 1] ? 1 : fadeOut); if (f < 1) { c.globalAlpha = 1 - f; c.fillStyle = '#040807'; c.fillRect(0, 0, VW, VH); c.globalAlpha = 1; }
  };
  draw(0);
  rec.start(1000);
  const start = ac.currentTime + .25;
  scenes.forEach(s => { const b = ac.createBuffer(1, s.au.pcm.length, s.au.sr); b.copyToChannel(s.au.pcm, 0); const src = ac.createBufferSource(); src.buffer = b; src.playbackRate.value = ctx.tono || 1; src.connect(dest); src.start(start + s.t0 + .35); });
  msg('Grabando el video… (deja esta pantalla abierta)');
  await new Promise(res => {
    const tick = () => { const tt = ac.currentTime - start; draw(Math.max(0, tt)); if (tt >= total + .2) return res(); (ctx.raf || requestAnimationFrame)(tick); };
    tick();
  });
  rec.stop(); await done; ac.close().catch(() => {});
  const type = (mime || 'video/webm').split(';')[0], blob = new Blob(chunks, {type});
  return {blob, url: URL.createObjectURL(blob), ext: type === 'video/mp4' ? 'mp4' : 'webm', dur: total, guion: scenes.map(s => s.voz)};
}

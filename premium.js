// AlexBet · cuentas, prueba de 15 días y Premium (Firebase Auth + Firestore).
// El estado queda en window.AB; index.html lo consulta con PREM().

// ===== Ajusta estos datos =====
const PAGO = {
  whatsapp: '593990175893', // tu número con código de país, solo dígitos. Ej: '593991234567'
  deuna: 'Código Deuna: 7701122749', // número o alias para Deuna
  deunaQR: 'deuna-qr.png',  // imagen del QR de cobro de Deuna
  deunaLink: 'https://pagar.deuna.app/H92p/person/payment?id=ce785890dc7cfd5a3a67dd2d79df3a32bd58052d', // el mismo QR como enlace (abre la app Deuna)
  cuentas: [               // cuentas para transferencia (se muestran debajo del QR, con botón Copiar)
    {banco: 'Banco Guayaquil', tipo: 'Ahorros', num: '0016954085', bg: '#fde2ef', fg: '#9d174d'},
    {banco: 'Banco Pichincha', tipo: 'Ahorros', num: '2203442139', bg: '#fef3c7', fg: '#854d0e'},
    {banco: 'Banco Pacífico', tipo: 'Ahorros', num: '1065365682', bg: '#dbeafe', fg: '#1e40af'}
  ],
  titular: 'Alexander Javier Basurto Aguirre',
  payphone: '',            // link o número de PayPhone
  transferencia: ''        // banco, tipo y número de cuenta, nombre y cédula
};
const PLANES = [
  {id: 'premium', nombre: 'Premium mensual', precio: '$4,99', dias: 30},
  {id: 'premium_anual', nombre: 'Premium anual', precio: '$39,99', dias: 365}
];
const PRUEBA_DIAS = 15;
// ==============================

const firebaseConfig = {
  apiKey: 'AIzaSyDDHOsOOBNQ68M2wLx5Ii2mzQ2dftgewew',
  authDomain: 'alexbet-e14aa.firebaseapp.com',
  projectId: 'alexbet-e14aa',
  storageBucket: 'alexbet-e14aa.firebasestorage.app',
  messagingSenderId: '788954789258',
  appId: '1:788954789258:web:525b424b674d597da58473'
};
const V = '10.12.2';
const DIA = 864e5;
const CACHE_KEY = 'ab_cuenta';

const AB = window.AB;
let fb = null;          // módulos de Firebase cargados
let modo = 'signup';    // pestaña del formulario
const METODOS = () => [['Deuna', PAGO.deuna], ['PayPhone', PAGO.payphone], ['Transferencia', PAGO.transferencia]].filter(m => m[1]);
let metodo = 'Deuna';
let planSel = 'premium';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const fecha = ms => new Date(ms).toLocaleDateString('es-EC', {day: 'numeric', month: 'short', year: 'numeric'});

// ---------- Estado ----------
function aplicar(d) {
  // d: {email, nombre, creado(ms), premiumHasta(ms|null), plan, pendiente}
  const ahora = Date.now();
  AB.user = d;
  AB.uid = d && d.uid ? d.uid : null;
  AB.pruebaHasta = d && d.creado ? d.creado + PRUEBA_DIAS * DIA : 0;
  AB.premiumHasta = d && d.premiumHasta ? d.premiumHasta : 0;
  AB.enPrueba = !!d && ahora < AB.pruebaHasta && !(AB.premiumHasta > ahora);
  AB.premium = !!d && (ahora < AB.pruebaHasta || ahora < AB.premiumHasta || d.email === 'tomashbasurto@gmail.com');
  AB.ready = true;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(d || null)); } catch (e) {}
  barra();
  cuentaBox();
  if (typeof window.abRefresh === 'function') window.abRefresh();
}
function cacheLocal() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { return null; } }
const ms = t => t && typeof t.toMillis === 'function' ? t.toMillis() : (typeof t === 'number' ? t : null);

// ---------- Firebase ----------
async function cargarFirebase() {
  const base = `https://www.gstatic.com/firebasejs/${V}/`;
  const [app, auth, fs] = await Promise.all([
    import(base + 'firebase-app.js'),
    import(base + 'firebase-auth.js'),
    import(base + 'firebase-firestore.js')
  ]);
  const a = app.initializeApp(firebaseConfig);
  fb = {auth: auth.getAuth(a), db: fs.getFirestore(a), A: auth, F: fs};
  try { fb.auth.languageCode = 'es'; } catch (e) {}
  return fb;
}

async function leerCuenta(u, nombre) {
  const {db, F} = fb;
  const ref = F.doc(db, 'users', u.uid);
  let snap = await F.getDoc(ref);
  if (!snap.exists()) {
    await F.setDoc(ref, {
      email: (u.email || '').toLowerCase(),
      nombre: (nombre || u.displayName || '').slice(0, 60),
      creado: F.serverTimestamp(),
      premiumHasta: null,
      plan: 'gratis',
      pendiente: ''
    });
    snap = await F.getDoc(ref);
  }
  return {ref, d: leerDoc(snap.data(), u)};
}
function leerDoc(x, u) {
  x = x || {};
  return {
    uid: (u && u.uid) || '',
    email: x.email || (u && u.email) || '',
    nombre: x.nombre || '',
    creado: ms(x.creado) || Date.now(),
    premiumHasta: ms(x.premiumHasta),
    plan: x.plan || 'gratis',
    pendiente: x.pendiente || '',
    push: x.push || null
  };
}
let quitarEscucha = null;

async function iniciar() {
  const previo = cacheLocal();
  if (previo) aplicar(previo); // abre al instante (y sin conexión) con lo último conocido
  try {
    await cargarFirebase();
  } catch (e) {
    if (!previo) puerta('Sin conexión. Conéctate a internet para iniciar sesión.');
    return;
  }
  fb.A.onAuthStateChanged(fb.auth, async u => {
    if (quitarEscucha) { quitarEscucha(); quitarEscucha = null; }
    if (!u) { aplicar(null); puerta(); return; }
    try {
      const {ref, d} = await leerCuenta(u, AB._nombre);
      cerrarPuerta();
      aplicar(d);
      // Cuando actives a alguien desde tu panel, su app se desbloquea sola.
      quitarEscucha = fb.F.onSnapshot(ref, s => { if (s.exists()) aplicar(leerDoc(s.data(), u)); }, () => {});
    } catch (e) {
      if (previo && previo.email === (u.email || '').toLowerCase()) { cerrarPuerta(); return; }
      const cod = (e && (e.code || e.message)) || 'desconocido';
      puerta(`Entraste como ${u.email || 'usuario'}, pero no pudimos cargar tu cuenta (${cod}). Toca "Iniciar sesión" para reintentar.`);
      AB._fallo = true;
    }
  });
}

// ---------- Pantalla de registro / inicio de sesión ----------
function puerta(msg) {
  const g = $('abGate');
  if (!g) return;
  const su = modo === 'signup';
  g.innerHTML = `
  <div class="ab-gate-in">
    <div class="ab-logo">ALEX<span>BET</span></div>
    <div class="ab-h">Prueba todo gratis por ${PRUEBA_DIAS} días</div>
    <div class="ab-sub">Todos los pronósticos, NBA, MLB, sugerencias y alertas. Sin tarjeta.</div>
    <div class="ab-tabs" role="tablist">
      <button type="button" role="tab" aria-selected="${su}" class="${su ? 'on' : ''}" onclick="abModo('signup')">Crear cuenta</button>
      <button type="button" role="tab" aria-selected="${!su}" class="${su ? '' : 'on'}" onclick="abModo('login')">Iniciar sesión</button>
    </div>
    <button type="button" class="btn ab-google" onclick="abGoogle()">Continuar con Google</button>
    <div class="ab-or"><span></span>o con tu correo<span></span></div>
    <form onsubmit="event.preventDefault();abCorreo()">
      ${su ? '<label for="abNom">Nombre</label><input id="abNom" type="text" autocomplete="name" maxlength="60">' : ''}
      <label for="abMail">Correo</label>
      <input id="abMail" type="email" autocomplete="email" autocapitalize="off" required>
      <label for="abPass">Contraseña</label>
      <input id="abPass" type="password" autocomplete="${su ? 'new-password' : 'current-password'}" minlength="6" required>
      ${su ? '' : '<button type="button" class="ab-link" onclick="abOlvide()">¿Olvidaste tu contraseña?</button>'}
      <div class="ab-msg" id="abMsg" role="status">${msg ? esc(msg) : ''}</div>
      <button type="submit" class="btn primary" id="abGo">${su ? 'Crear cuenta y empezar prueba' : 'Iniciar sesión'}</button>
    </form>
    <div class="ab-foot">Al terminar la prueba, el 1X2 de todas las ligas sigue gratis. Premium desde $4,99/mes.</div>
  </div>`;
  g.classList.add('show');
  document.body.classList.add('ab-locked-scroll');
}
function cerrarPuerta() {
  const g = $('abGate');
  if (g) { g.classList.remove('show'); g.innerHTML = ''; }
  document.body.classList.remove('ab-locked-scroll');
}
function aviso(t) { const m = $('abMsg'); if (m) m.textContent = t; }
function errTxt(e) {
  const c = (e && e.code) || '';
  if (c.includes('email-already-in-use')) return 'Ese correo ya tiene cuenta. Usa "Iniciar sesión".';
  if (c.includes('invalid-email')) return 'El correo no es válido.';
  if (c.includes('weak-password')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Correo o contraseña incorrectos.';
  if (c.includes('too-many-requests')) return 'Demasiados intentos. Espera unos minutos.';
  if (c.includes('popup-closed') || c.includes('cancelled-popup')) return 'Se cerró la ventana de Google antes de terminar.';
  if (c.includes('popup-blocked')) return 'El navegador bloqueó la ventana de Google. Usa tu correo y contraseña.';
  if (c.includes('unauthorized-domain')) return 'Falta autorizar este dominio en Firebase.';
  if (c.includes('network')) return 'Sin conexión. Inténtalo de nuevo.';
  if (c.includes('operation-not-allowed') || c.includes('admin-restricted')) return 'El registro con correo todavía no está activado. Usa "Continuar con Google" por ahora.';
  return 'No se pudo completar. Inténtalo de nuevo.' + (c ? ' (' + c.replace('auth/', '') + ')' : '');
}

window.abModo = m => { modo = m; puerta(); };
window.abGoogle = async () => {
  if (!fb) return aviso('Cargando… intenta en unos segundos.');
  aviso('Abriendo Google…');
  try {
    await fb.A.signInWithPopup(fb.auth, new fb.A.GoogleAuthProvider());
  } catch (e) { aviso(errTxt(e)); }
};
window.abCorreo = async () => {
  if (!fb) return aviso('Cargando… intenta en unos segundos.');
  const mail = ($('abMail').value || '').trim(), pass = $('abPass').value || '';
  const nom = ($('abNom') && $('abNom').value.trim()) || '';
  if (fb.auth.currentUser) { await fb.A.signOut(fb.auth); }
  const btn = $('abGo'); if (btn) btn.disabled = true;
  aviso('');
  try {
    if (modo === 'signup') {
      AB._nombre = nom;
      await fb.A.createUserWithEmailAndPassword(fb.auth, mail, pass);
    } else {
      await fb.A.signInWithEmailAndPassword(fb.auth, mail, pass);
    }
  } catch (e) { aviso(errTxt(e)); if (btn) btn.disabled = false; }
};
window.abOlvide = async () => {
  const mail = ($('abMail').value || '').trim();
  if (!mail) return aviso('Escribe tu correo arriba y vuelve a tocar "¿Olvidaste tu contraseña?".');
  try { await fb.A.sendPasswordResetEmail(fb.auth, mail); aviso('Te enviamos un correo para cambiar la contraseña.'); }
  catch (e) { aviso(errTxt(e)); }
};
window.abSalir = async () => {
  if (!confirm('¿Cerrar sesión?')) return;
  try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
  if (typeof closeSettings === 'function') closeSettings();
  if (fb) await fb.A.signOut(fb.auth);
};

// ---------- Barra de estado y cuenta ----------
function diasRest(hasta) { return Math.max(0, Math.ceil((hasta - Date.now()) / DIA)); }
function barra() {
  const b = $('abBar');
  if (!b) return;
  if (!AB.user) { b.textContent = ''; return; }
  const ahora = Date.now();
  let t, cls = '';
  if (AB.premiumHasta > ahora) { t = AB.user.plan === 'vip' ? 'VIP' : 'Premium'; cls = 'ok'; b.title = `Activo hasta el ${fecha(AB.premiumHasta)}`; }
  else if (AB.enPrueba) { const n = diasRest(AB.pruebaHasta); t = `Prueba · ${n} ${n === 1 ? 'día' : 'días'}`; b.title = 'Prueba gratis con todo incluido'; }
  else if (AB.user.pendiente) { t = 'Activando…'; b.title = 'Pago recibido, estamos activando tu Premium'; }
  else { t = 'Hazte Premium'; cls = 'off'; b.title = 'Tu prueba terminó. El 1X2 de todas las ligas sigue gratis'; }
  b.className = 'ab-chip ' + cls;
  b.textContent = t;
}
function cuentaBox() {
  const t = $('abTech');
  const tb = $('abTechBtn');
  if (tb) tb.style.display = AB.user && AB.user.email === 'tomashbasurto@gmail.com' ? '' : 'none';
  if (t && tb && tb.style.display === 'none') t.style.display = 'none';
  const c = $('abAcct');
  if (!c) return;
  if (!AB.user) { c.innerHTML = ''; return; }
  const ahora = Date.now();
  const est = AB.premiumHasta > ahora ? `${AB.user.plan === 'vip' ? 'VIP' : 'Premium'} hasta el ${fecha(AB.premiumHasta)}`
    : AB.enPrueba ? `Prueba gratis hasta el ${fecha(AB.pruebaHasta)}` : 'Plan gratis';
  c.innerHTML = `<div class="row"><span>Cuenta</span><span>${esc(AB.user.email)}</span></div>
    <div class="row"><span>Plan</span><span class="ok">${esc(est)}</span></div>
    <button type="button" class="btn" onclick="abPay()">Ver planes</button>
    <button type="button" class="btn ghost" onclick="abSalir()">Cerrar sesión</button>`;
}

// ---------- Planes y pago ----------
// v39: dos pasos — 1) Elige tu plan (Gratis / Premium mensual o anual)  2) Paga y envía el comprobante
let payPaso = 'planes';
const PREM_INCLUYE = ['Goles, ambos marcan, tarjetas y córners', 'NBA, NCAA, MLB y NHL completas, con jugadores y en vivo', 'Sugerencias, señales y alertas de valor y cuotas', 'Estadísticas por partido y por jugador', 'Combinadas, favoritos, lesiones y resumen diario'];
window.abPayOpen = (paso) => {
  const s = $('abPaySheet'), w = $('abPay');
  if (!s || !w) return;
  if (paso) payPaso = paso; else if (!w.classList.contains('show')) payPaso = 'planes';
  const mets = METODOS();
  if (mets.length && !mets.some(m => m[0] === metodo)) metodo = mets[0][0];
  const pago = (mets.find(m => m[0] === metodo) || [])[1] || '';
  const plan = PLANES.find(x => x.id === planSel) || PLANES[0];
  if (payPaso === 'planes') {
    s.innerHTML = `
    <div class="ab-ph"><h2>Elige tu plan</h2></div>
    <div class="ab-pc">
      <div class="ab-pc-h"><b>Gratis</b><span class="ab-pr">$0</span></div>
      <div class="sub">Todas las ligas con pronóstico 1X2 · En vivo · Tablas · Precisión del modelo</div>
    </div>
    <div class="ab-pc rec">
      <div class="ab-pc-h"><b>Premium</b><span class="ab-tag">RECOMENDADO</span></div>
      <div class="ab-big">${esc(plan.precio)} <small>${plan.id === 'premium_anual' ? '/año' : '/mes'}</small></div>
      <div class="ab-tg2">${PLANES.map(p => `<button type="button" class="${p.id === planSel ? 'on' : ''}" aria-pressed="${p.id === planSel}" onclick="abPlan('${p.id}')">${p.id === 'premium_anual' ? 'Anual' : 'Mensual'} · ${esc(p.precio)}</button>`).join('')}</div>
      ${planSel === 'premium_anual' ? '<div class="sub" style="margin:-2px 0 6px">Equivale a $3,33 al mes: ahorras 4 meses.</div>' : ''}
      <ul class="ab-ok">${PREM_INCLUYE.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      <button type="button" class="btn primary" onclick="abPayOpen('pago')">Activar Premium</button>
    </div>
    <div class="sub" style="text-align:center;margin-top:10px">Pagas con Deuna o transferencia</div>
    <button type="button" class="btn ghost" onclick="abPayClose()">Cerrar</button>`;
    w.classList.add('show'); return;
  }
  s.innerHTML = `
    <div class="ab-ph"><button type="button" class="ab-back" aria-label="Volver a los planes" onclick="abPayOpen('planes')">‹</button><h2>Paga tu plan</h2></div>
    <div class="set-box" style="display:flex;justify-content:space-between;align-items:center"><span>${esc(plan.nombre)}</span><b style="font-size:16px">${esc(plan.precio)}</b></div>
    <label>1. ${mets.length > 1 ? 'Elige cómo pagar' : 'Paga por ' + esc(metodo)}</label>
    ${mets.length > 1 ? `<div class="ab-met">${mets.map(([m]) => `<button type="button" class="${m === metodo ? 'on' : ''}" aria-pressed="${m === metodo}" onclick="abMetodo('${m}')">${m}</button>`).join('')}</div>` : ''}
    <div class="set-box">${pago ? esc(pago).replace(/\n/g, '<br>') : 'Datos de pago: [PENDIENTE DE CONFIGURAR]'}</div>
    ${metodo === 'Deuna' && PAGO.deunaQR ? `<div class="ab-qr"><img src="${PAGO.deunaQR}" alt="Código QR de Deuna para pagar AlexBet">
      ${PAGO.deunaLink ? `<a class="btn primary" href="${esc(PAGO.deunaLink)}" target="_blank" rel="noopener">Pagar con Deuna</a>` : ''}
      <div class="sub">Desde otro celular, escanea el QR con Deuna. Desde este celular, toca "Pagar con Deuna" o mantén presionado el QR para guardarlo.</div></div>` : ''}
    ${PAGO.cuentas && PAGO.cuentas.length ? `<div class="sub" style="margin:10px 0 6px">O transfiere a una de estas cuentas:</div>
    <div class="ab-ctas">${PAGO.cuentas.map(c => `<div class="ab-cta"><div class="ab-bk" style="background:${c.bg};color:${c.fg}">${esc(c.banco)}</div><small>${esc(c.tipo)}</small><b>${esc(c.num)}</b><button type="button" onclick="abCopiar('${esc(c.num)}', this)">Copiar</button></div>`).join('')}</div>
    ${PAGO.titular ? `<div class="set-box" style="margin-top:6px">Titular: <b>${esc(PAGO.titular)}</b></div>` : ''}` : ''}
    <label>2. Envía el comprobante</label>
    <button type="button" class="btn primary" onclick="abComprobante()">Enviar comprobante por WhatsApp</button>
    <div class="sub" style="margin-top:8px">El mensaje sale con tu correo (${esc(AB.user ? AB.user.email : '')}) para activarte rápido. Premium se activa en esta cuenta, en el celular y en la web.</div>
    <button type="button" class="btn ghost" onclick="abPayClose()">Cerrar</button>`;
  w.classList.add('show');
};
window.abCopiar = async (t, btn) => {
  let ok = false;
  try { await navigator.clipboard.writeText(t); ok = true; } catch (e) {
    try { const a = document.createElement('textarea'); a.value = t; a.style.position = 'absolute'; a.style.left = '-9999px'; document.body.appendChild(a); a.select(); ok = document.execCommand('copy'); a.remove(); } catch (e2) {}
  }
  if (btn) { btn.textContent = ok ? 'Copiado ✓' : t; setTimeout(() => { btn.textContent = 'Copiar'; }, 2000); }
};
window.abPayClose = () => { const w = $('abPay'); if (w) w.classList.remove('show'); };
window.abPlan = id => { planSel = id; window.abPayOpen('planes'); };
window.abMetodo = m => { metodo = m; window.abPayOpen('pago'); };
window.abComprobante = async () => {
  const p = PLANES.find(x => x.id === planSel) || PLANES[0];
  const mail = AB.user ? AB.user.email : '';
  const txt = `Hola, pagué AlexBet ${p.nombre} (${p.precio}) por ${metodo}. Mi correo: ${mail}. Adjunto el comprobante.`;
  if (!PAGO.whatsapp) { alert('El número de WhatsApp aún no está configurado.'); return; }
  window.open(`https://wa.me/${PAGO.whatsapp}?text=${encodeURIComponent(txt)}`, '_blank');
  try {
    if (fb && fb.auth.currentUser) {
      await fb.F.updateDoc(fb.F.doc(fb.db, 'users', fb.auth.currentUser.uid), {pendiente: `${p.id} · ${metodo}`});
      aplicar(Object.assign({}, AB.user, {pendiente: `${p.id} · ${metodo}`}));
    }
  } catch (e) {}
};

// Revisa cada hora por si la prueba vence con la app abierta.
setInterval(() => { if (AB.user) aplicar(AB.user); }, 3600e3);

// ---------- Notificaciones en el celular (Premium) ----------
// Clave pública de "Certificados push web" (Firebase > Configuración > Cloud Messaging).
const VAPID = 'BAeyOSXYr-WN5v31XJ51upmEE-f2PyknbnDGOG6dsJNi3fdmeXbwu9SxAjOPxTrrxli9vYXYlI5KCa6m4Cthvr8';
const PUSH_TIPOS = [['movido', 'Partido movido (goles, córners, tarjetas, puntos)'], ['alineacion', 'Alineación confirmada'], ['fav', 'Mis equipos favoritos: empieza, gol, roja, final'], ['combinadas', 'Combinadas del día publicadas']];
window.abPushInfo = () => ({ok: !!VAPID && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window, perm: ('Notification' in window) ? Notification.permission : 'no', tipos: PUSH_TIPOS, on: !!(AB.user && AB.user.push && AB.user.push.token), sel: (AB.user && AB.user.push && AB.user.push.tipos) || PUSH_TIPOS.map(t => t[0]), ios: /iphone|ipad/i.test(navigator.userAgent) && !navigator.standalone});
window.abPushEnable = async tipos => {
  if (!fb || !AB.uid) throw new Error('Inicia sesión primero');
  if (!VAPID) throw new Error('Las notificaciones todavía no están configuradas');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Este navegador no permite notificaciones. En iPhone, primero agrega AlexBet a la pantalla de inicio y ábrela desde ahí');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('No diste permiso de notificaciones. Actívalo en los ajustes del navegador');
  const reg = await navigator.serviceWorker.ready;
  const M = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-messaging.js`);
  const messaging = M.getMessaging();
  // registro limpio: borra un registro viejo guardado en este celular (en iPhone a veces queda uno inválido)
  try { await M.deleteToken(messaging); } catch (e) {}
  try { const old = await reg.pushManager.getSubscription(); if (old) await old.unsubscribe(); } catch (e) {}
  const token = await M.getToken(messaging, {vapidKey: VAPID, serviceWorkerRegistration: reg});
  if (!token) throw new Error('No se pudo registrar este celular');
  let ep = ''; try { const sub = await reg.pushManager.getSubscription(); ep = sub ? new URL(sub.endpoint).host : 'sin suscripción'; } catch (e) { ep = 'error'; }
  const push = {token, ep, tipos: tipos || PUSH_TIPOS.map(t => t[0]), favs: typeof window.favList === 'function' ? window.favList().slice(0, 50) : [], t: Date.now(), ua: navigator.userAgent.slice(0, 80)};
  await fb.F.updateDoc(fb.F.doc(fb.db, 'users', AB.uid), {push});
  if (AB.user) AB.user.push = push;
  return push;
};
window.abPushSyncFavs = async () => {
  if (!fb || !AB.uid || !AB.user || !AB.user.push || typeof window.favList !== 'function') return;
  const push = {...AB.user.push, favs: window.favList().slice(0, 50)};
  try { await fb.F.updateDoc(fb.F.doc(fb.db, 'users', AB.uid), {push}); AB.user.push = push; } catch (e) {}
};
window.abPushDisable = async () => {
  if (!fb || !AB.uid) return;
  await fb.F.updateDoc(fb.F.doc(fb.db, 'users', AB.uid), {push: null});
  if (AB.user) AB.user.push = null;
};
iniciar();

// AlexBet · cuentas, prueba de 15 días y Premium (Firebase Auth + Firestore).
// El estado queda en window.AB; index.html lo consulta con PREM().

// ===== Ajusta estos datos =====
const PAGO = {
  whatsapp: '593990175893', // tu número con código de país, solo dígitos. Ej: '593991234567'
  deuna: 'Código Deuna: 7701122749', // número o alias para Deuna
  payphone: '',            // link o número de PayPhone
  transferencia: ''        // banco, tipo y número de cuenta, nombre y cédula
};
const PLANES = [
  {id: 'premium', nombre: 'Premium mensual', precio: '$4,99', dias: 30},
  {id: 'premium_anual', nombre: 'Premium anual', precio: '$39,99', dias: 365},
  {id: 'vip', nombre: 'VIP mensual', precio: '$9,99', dias: 30}
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
    pendiente: x.pendiente || ''
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
  return 'No se pudo completar. Inténtalo de nuevo.';
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
  if (!AB.user) { b.innerHTML = ''; return; }
  const ahora = Date.now();
  let t, cta = 'Ver planes', cls = '';
  if (AB.premiumHasta > ahora) {
    t = `${AB.user.plan === 'vip' ? 'VIP' : 'Premium'} activo hasta el ${fecha(AB.premiumHasta)}`; cta = ''; cls = 'ok';
  } else if (AB.enPrueba) {
    const n = diasRest(AB.pruebaHasta);
    t = `Prueba gratis: ${n === 1 ? 'queda 1 día' : 'quedan ' + n + ' días'} con todo incluido`;
  } else if (AB.user.pendiente) {
    t = 'Pago recibido, estamos activando tu Premium'; cta = '';
  } else {
    t = 'Tu prueba terminó. El 1X2 de todas las ligas sigue gratis'; cta = 'Desbloquear Premium'; cls = 'off';
  }
  b.className = 'ab-bar ' + cls;
  b.innerHTML = `<span>${esc(t)}</span>${cta ? `<button type="button" onclick="abPay()">${cta}</button>` : ''}`;
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
window.abPayOpen = () => {
  const s = $('abPaySheet'), w = $('abPay');
  if (!s || !w) return;
  const mets = METODOS();
  if (mets.length && !mets.some(m => m[0] === metodo)) metodo = mets[0][0];
  const pago = (mets.find(m => m[0] === metodo) || [])[1] || '';
  s.innerHTML = `
    <h2>Desbloquea Premium</h2>
    <div class="sub">Todos los pronósticos (goles, ambos anotan, tarjetas y córners), NBA y MLB, sugerencias, valor, alertas y mis jugadas.</div>
    <div class="ab-plans">${PLANES.map(p => `
      <button type="button" class="ab-plan${p.id === planSel ? ' on' : ''}" aria-pressed="${p.id === planSel}" onclick="abPlan('${p.id}')">
        <span>${p.nombre}${p.id === 'vip' ? '<small>Premium + canal de Telegram con picks comentados</small>' : ''}</span><b>${p.precio}</b>
      </button>`).join('')}
    </div>
    <label>1. ${mets.length > 1 ? 'Elige cómo pagar' : 'Paga por ' + esc(metodo)}</label>
    ${mets.length > 1 ? `<div class="ab-met">${mets.map(([m]) => `<button type="button" class="${m === metodo ? 'on' : ''}" aria-pressed="${m === metodo}" onclick="abMetodo('${m}')">${m}</button>`).join('')}</div>` : ''}
    <div class="set-box">${pago ? esc(pago).replace(/\n/g, '<br>') : 'Datos de pago: [PENDIENTE DE CONFIGURAR]'}</div>
    <label>2. Envía el comprobante</label>
    <button type="button" class="btn primary" onclick="abComprobante()">Enviar comprobante por WhatsApp</button>
    <div class="sub" style="margin-top:8px">El mensaje sale con tu correo (${esc(AB.user ? AB.user.email : '')}) para activarte rápido. Premium se activa en esta cuenta, en el celular y en la web.</div>
    <button type="button" class="btn ghost" onclick="abPayClose()">Cerrar</button>`;
  w.classList.add('show');
};
window.abPayClose = () => { const w = $('abPay'); if (w) w.classList.remove('show'); };
window.abPlan = id => { planSel = id; window.abPayOpen(); };
window.abMetodo = m => { metodo = m; window.abPayOpen(); };
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
iniciar();

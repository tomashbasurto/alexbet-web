// AlexBet · envío de notificaciones a los celulares de los usuarios Premium (Firebase Cloud Messaging).
// Usa la cuenta de servicio de Firebase (secreto FIREBASE_SERVICE_ACCOUNT). Lo usan alerts.js e historial.js.
'use strict';
const crypto = require('crypto');
const PROJECT = 'alexbet-e14aa', OWNER = 'tomashbasurto@gmail.com', PRUEBA_DIAS = 15;
const b64u = b => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({alg: 'RS256', typ: 'JWT'}));
  const body = b64u(JSON.stringify({iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3500}));
  const sig = b64u(crypto.createSign('RSA-SHA256').update(head + '.' + body).sign(sa.private_key));
  const r = await fetch('https://oauth2.googleapis.com/token', {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'}, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${head}.${body}.${sig}`});
  const j = await r.json(); if (!j.access_token) throw new Error('token: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}
const val = v => !v ? null : v.stringValue ?? v.timestampValue ?? v.integerValue ?? v.doubleValue ?? v.booleanValue ??
  (v.arrayValue ? (v.arrayValue.values || []).map(val) : v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, val(x)])) : null);

async function init() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) return null;
  let sa; try { sa = JSON.parse(raw); } catch (e) { console.log('push: FIREBASE_SERVICE_ACCOUNT no es JSON válido'); return null; }
  let tok; try { tok = await accessToken(sa); } catch (e) { console.log('push: no se pudo autenticar:', e.message); return null; }
  const H = {authorization: 'Bearer ' + tok, 'content-type': 'application/json'};
  // usuarios con celular registrado y Premium vigente (o en prueba)
  const users = []; let page = '';
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/users?pageSize=300${page ? '&pageToken=' + page : ''}`, {headers: H});
    if (!r.ok) { console.log('push: no pude leer usuarios (HTTP ' + r.status + '). ¿La cuenta de servicio tiene el rol "Cloud Datastore User"?'); return null; }
    const j = await r.json();
    (j.documents || []).forEach(d => {
      const f = Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, val(x)]));
      const p = f.push; if (!p || !p.token) return;
      const creado = f.creado ? Date.parse(f.creado) : 0, hasta = f.premiumHasta ? Date.parse(f.premiumHasta) : 0, now = Date.now();
      const prem = now < creado + PRUEBA_DIAS * 864e5 || now < hasta || f.email === OWNER;
      if (prem) users.push({path: d.name, email: f.email, token: p.token, tipos: p.tipos || ['movido', 'alineacion', 'fav', 'combinadas'], favs: p.favs || []});
    });
    if (!j.nextPageToken) break; page = j.nextPageToken;
  }
  let sent = 0, dead = 0;
  const send = async (u, title, body, tag) => {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${PROJECT}/messages:send`, {method: 'POST', headers: H,
      body: JSON.stringify({message: {token: u.token, notification: {title, body: String(body).slice(0, 900)}, data: {tag: tag || '', link: 'https://alexbetpro.web.app/'},
        webpush: {headers: {TTL: '1800', Urgency: 'high'}, fcm_options: {link: 'https://alexbetpro.web.app/'}}}})});
    if (r.ok) { sent++; return true; }
    const t = await r.text();
    console.log('push: FCM HTTP', r.status, (u.email || ''), t.replace(/\s+/g, ' ').slice(0, 300));
    if (/UNREGISTERED/.test(t)) { // celular que ya no existe: se borra
      dead++; u.dead = true;
      await fetch(`https://firestore.googleapis.com/v1/${u.path}?updateMask.fieldPaths=push`, {method: 'PATCH', headers: H, body: JSON.stringify({fields: {push: {nullValue: null}}})}).catch(() => {});
    }
    return false;
  };
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const favOf = (u, teams) => (teams || []).some(n => { const x = norm(n); return x && u.favs.some(f => { const y = norm(f); return y && (x === y || x.includes(y) || y.includes(x)); }); });
  console.log(`push: ${users.length} celulares Premium registrados`);
  return {
    users,
    hasFavs: users.some(u => u.favs.length),
    wantsFav: teams => users.some(u => !u.dead && u.tipos.includes('fav') && favOf(u, teams)),
    // tipo: movido | alineacion | fav | combinadas; para 'fav' se manda solo a quien sigue a alguno de esos equipos
    async notify(tipo, title, body, opt) {
      opt = opt || {};
      for (const u of users) {
        if (u.dead || !u.tipos.includes(tipo)) continue;
        if (tipo === 'fav' && !favOf(u, opt.teams)) continue;
        await send(u, title, body, opt.tag);
      }
    },
    stats: () => ({sent, dead})
  };
}
module.exports = {init};

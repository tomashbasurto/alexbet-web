// AlexBet · libera espacio del hosting de Firebase (lo usa firebase.yml antes de publicar).
// Deja guardadas solo las últimas 10 versiones del sitio (y la que está publicada) y configura que Firebase guarde 10 de ahora en adelante.
'use strict';
const crypto = require('crypto');
const SITE = 'alexbetpro', KEEP = 10, API = 'https://firebasehosting.googleapis.com/v1beta1';
const b64u = b => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
async function token(sa) {
  const now = Math.floor(Date.now() / 1000), head = b64u(JSON.stringify({alg: 'RS256', typ: 'JWT'}));
  const body = b64u(JSON.stringify({iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3500}));
  const sig = b64u(crypto.createSign('RSA-SHA256').update(head + '.' + body).sign(sa.private_key));
  const r = await fetch('https://oauth2.googleapis.com/token', {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'}, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${head}.${body}.${sig}`});
  const j = await r.json(); if (!j.access_token) throw new Error('token: ' + JSON.stringify(j).slice(0, 200)); return j.access_token;
}
(async () => {
  const sa = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8')), H = {authorization: 'Bearer ' + await token(sa), 'content-type': 'application/json'};
  const cfg = await fetch(`${API}/sites/${SITE}/config?updateMask=maxVersions`, {method: 'PATCH', headers: H, body: JSON.stringify({maxVersions: KEEP})});
  console.log('guardar solo', KEEP, 'versiones:', cfg.status, cfg.ok ? 'ok' : (await cfg.text()).slice(0, 200));
  const rel = await (await fetch(`${API}/sites/${SITE}/releases?pageSize=1`, {headers: H})).json(), live = ((rel.releases || [])[0] || {}).version || {};
  const V = []; let page = '';
  for (let i = 0; i < 50; i++) { const j = await (await fetch(`${API}/sites/${SITE}/versions?pageSize=100${page ? '&pageToken=' + page : ''}`, {headers: H})).json();
    if (j.error) { console.log('no pude listar versiones:', JSON.stringify(j.error).slice(0, 200)); return; }
    V.push(...(j.versions || [])); if (!j.nextPageToken) break; page = j.nextPageToken; }
  const vivas = V.filter(v => v.status !== 'DELETED' && v.status !== 'ABANDONED').sort((a, b) => String(b.createTime).localeCompare(String(a.createTime)));
  const fin = vivas.filter(v => v.status === 'FINALIZED'), quedan = new Set(fin.slice(0, KEEP).map(v => v.name).concat(live.name || []));
  const borrar = vivas.filter(v => !quedan.has(v.name));
  const mb = v => (+v.versionBytes || 0) / 1048576;
  console.log(`versiones: ${vivas.length} (${Math.round(vivas.reduce((t, v) => t + mb(v), 0))} MB) · publicada: ${(live.name || '').split('/').pop()} · se borran ${borrar.length} (${Math.round(borrar.reduce((t, v) => t + mb(v), 0))} MB)`);
  let ok = 0; for (const v of borrar) { const r = await fetch(`${API}/${v.name}`, {method: 'DELETE', headers: H}); if (r.ok) ok++; else if (ok + 1 === 1) console.log('no pude borrar', v.name, r.status, (await r.text()).slice(0, 200)); }
  console.log('borradas:', ok, 'de', borrar.length);
})().catch(e => { console.log('limpieza:', e.message); });

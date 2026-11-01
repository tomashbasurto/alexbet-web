// AlexBet · Acierto oficial: sugerencias y combinadas publicadas en el servidor antes de cada partido
// (historial.json, lo escribe historial.js cada 2 horas). Es igual para todos los usuarios y nadie lo puede editar.

const OF = {t: 0, H: null, loading: false, days: 30};
async function ofLoad(force) {
  if (OF.loading || (!force && OF.H && Date.now() - OF.t < 30 * 60e3)) return;
  OF.loading = true;
  try { OF.H = await mirrorGet('historial.json'); OF.t = Date.now(); } catch (e) {}
  OF.loading = false;
  if (viewMode === 'picks') renderMatches();
  if (document.getElementById('ofSheet') && document.getElementById('ofSheet').innerHTML) ofOpen();
}
const OF_SP = {futbol: 'Fútbol', nba: 'NBA', mlb: 'MLB', tenis: 'Tenis'};
const OF_TIER = {seg: 'Combinadas opción 1 (riesgo bajo)', med: 'Combinadas opción 2 (riesgo medio)', alt: 'Combinadas opción 3 (riesgo alto)'};
function ofSets() {
  const H = OF.H || {picks: [], combos: []}, lim = OF.days ? Date.now() - OF.days * 864e5 : 0;
  const P = (H.picks || []).filter(p => p.ts >= lim && (p.res === 0 || p.res === 1));
  const C = (H.combos || []).filter(c => c.ts >= lim && (c.status === 'w' || c.status === 'l'));
  return {H, P, C};
}
const ofPct = a => a.length ? Math.round(a.filter(x => x.res === 1 || x.status === 'w').length / a.length * 100) : null;
const ofUnits = a => a.reduce((t, x) => { const won = x.res === 1 || x.status === 'w', o = x.odds || x.odd || (x.prob ? Math.max(1.03, 100 / x.prob * 0.93) : 1.8); return t + (won ? o - 1 : -1); }, 0);

// tarjeta corta arriba de Sugerencias
function ofCardHTML(sp) {
  ofLoad();
  const {P} = ofSets();
  if (!OF.H) return '';
  const mine = P.filter(p => p.sp === sp), all = ofPct(P), my = ofPct(mine);
  if (!P.length) return `<div class="prob-card of-mini" onclick="ofOpen()"><h3><span class="dot"></span>Acierto oficial AlexBet</h3><div class="pl-none">El historial oficial empezó hoy: las sugerencias se publican en el servidor antes de cada partido y aquí verás cuántas se cumplieron. <b style="color:var(--accent)">Ver</b></div></div>`;
  return `<div class="prob-card of-mini" onclick="ofOpen()"><h3><span class="dot"></span>Acierto oficial AlexBet · ${OF.days} días</h3>
    <div class="lv-stats" style="justify-content:space-between"><span>Todas: <b>${all}%</b> (${P.length})</span>${mine.length ? `<span>${OF_SP[sp]}: <b>${my}%</b> (${mine.length})</span>` : ''}<span style="color:var(--accent);font-weight:700">Ver detalle ›</span></div></div>`;
}
function ofClose() { const el = document.getElementById('ofSheet'); if (el) el.innerHTML = ''; }
function ofOpen() {
  let el = document.getElementById('ofSheet'); if (!el) { el = document.createElement('div'); el.id = 'ofSheet'; document.body.appendChild(el); }
  ofLoad();
  const {H, P, C} = ofSets(), chip = (d, t) => `<button type="button" class="tn-chip ${OF.days === d ? 'on' : ''}" onclick="OF.days=${d};ofOpen();if(viewMode==='picks')renderMatches()">${t}</button>`;
  const bar = v => `<span class="of-bar"><i style="width:${v || 0}%"></i></span>`;
  const row = (t, a) => a.length ? `<div class="of-row"><span>${t}</span><span>${ofPct(a)}% · ${a.length}${bar(ofPct(a))}</span></div>` : '';
  const crow = (t, a) => a.length ? `<div class="of-row"><span>${t}</span><span>${a.filter(c => c.status === 'w').length} / ${a.length}${bar(ofPct(a))}</span></div>` : '';
  const bin = (lo, hi) => { const a = P.filter(p => p.prob >= lo && p.prob < hi); return a.length ? `<div class="of-row"><span>Cuando decíamos ${lo}–${hi - 1}%</span><span>salió ${ofPct(a)}% (${a.length})</span></div>` : ''; };
  const units = ofUnits(P);
  const last = [...(H.picks || []).filter(p => p.res === 0 || p.res === 1).map(p => ({t: p.rt || p.ts, html: `${p.res ? '✅' : '❌'} ${escA(p.label)}<small>${OF_SP[p.sp]} · ${escA(p.h)} vs ${escA(p.a)} · publicada ${ofWhen(p.pub)}</small>`, v: p.prob + '%'})),
    ...(H.combos || []).filter(c => c.status === 'w' || c.status === 'l').map(c => ({t: c.rt || c.ts, html: `${c.status === 'w' ? '✅' : '❌'} ${OF_TIER[c.tier] ? OF_TIER[c.tier].replace('Combinadas ', 'Combinada ') : 'Combinada'} · cuota ${(+c.odds).toFixed(2)}<small>${OF_SP[c.sp]} · ${c.legs.length} selecciones · publicada ${ofWhen(c.pub)}</small>`, v: c.prob + '%'}))]
    .sort((a, b) => b.t - a.t).slice(0, 25);
  const pend = (H.picks || []).filter(p => p.res == null && p.ts > Date.now() - 864e5).length;
  el.innerHTML = `<div class="mh-sheet" onclick="if(event.target===this)ofClose()"><div class="mh-card">
    <button class="mh-x" onclick="ofClose()">✕</button>
    <h3 style="margin:0 0 8px">Acierto oficial AlexBet</h3>
    <div class="tn-chips" style="margin:0 0 10px">${chip(7, '7 días')}${chip(30, '30 días')}${chip(0, 'Todo')}</div>
    ${!OF.H ? '<div class="pl-none">Cargando historial…</div>' : !P.length && !C.length ? `<div class="pl-none">Todavía no hay resultados en este período. Las sugerencias de hoy ya están publicadas (${pend} pendientes) y se revisan solas cuando terminan los partidos.</div>` : `
    <div class="mh-grid"><div><b>${ofPct(P) ?? '-'}%</b><small>Sugerencias (${P.length})</small></div><div><b style="color:${units >= 0 ? 'var(--over)' : '#ff6b6b'}">${units >= 0 ? '+' : ''}${units.toFixed(1)} u</b><small>Ganancia a 1 u*</small></div></div>
    ${['futbol', 'nba', 'mlb', 'tenis'].map(sp => row(OF_SP[sp], P.filter(p => p.sp === sp))).join('')}
    ${['seg', 'med', 'alt'].map(k => crow(OF_TIER[k], C.filter(c => c.tier === k))).join('')}
    ${bin(55, 65)}${bin(65, 75)}${bin(75, 86)}
    <div class="lv-h" style="margin-top:10px">Últimas resueltas</div>
    ${last.map(x => `<div class="of-row of-it"><div>${x.html}</div><span>${x.v}</span></div>`).join('')}`}
    <div class="al-st" style="margin-top:8px">Se publican en el servidor antes de cada partido, con fecha y hora, y se revisan solas con los resultados reales de ESPN. Nadie las puede editar. *Ganancia aproximada apostando 1 unidad a la cuota de la casa estimada. ${pend ? 'Pendientes de hoy: ' + pend + '.' : ''}</div>
  </div></div>`;
}
function ofWhen(t) { if (!t) return '-'; const d = new Date(t - 5 * 3600e3); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; }

// AlexBet · Acierto oficial: sugerencias y combinadas publicadas en el servidor antes de cada partido
// (historial.json, lo escribe historial.js cada 2 horas). Es igual para todos los usuarios y nadie lo puede editar.

const OF = {t: 0, H: null, loading: false, days: 30, sp: 'futbol', open: {}};
async function ofLoad(force) {
  if (OF.loading || (!force && OF.H && Date.now() - OF.t < 30 * 60e3)) return;
  OF.loading = true;
  try { OF.H = await mirrorGet('historial.json'); OF.t = Date.now(); } catch (e) {}
  OF.loading = false;
  if (viewMode === 'picks') renderMatches();
  if (document.getElementById('ofSheet') && document.getElementById('ofSheet').innerHTML) ofOpen(OF.sp);
}
const OF_SP = {futbol: 'Fútbol', nba: 'NBA', mlb: 'MLB', tenis: 'Tenis', ncaa: 'NCAA', nhl: 'NHL'};
const OF_TIER = {seg: 'Combinadas opción 1 (riesgo bajo)', med: 'Combinadas opción 2 (riesgo medio)', alt: 'Combinadas opción 3 (riesgo alto)'};
// v36.2: solo el deporte que está abierto en la app
function ofSets(sp) {
  const H = OF.H || {picks: [], combos: []}, lim = OF.days ? Date.now() - OF.days * 864e5 : 0, ok = x => !sp || x.sp === sp;
  const P = (H.picks || []).filter(p => ok(p) && p.ts >= lim && (p.res === 0 || p.res === 1));
  const C = (H.combos || []).filter(c => ok(c) && c.ts >= lim && (c.status === 'w' || c.status === 'l'));
  return {H, P, C};
}
const ofPct = a => a.length ? Math.round(a.filter(x => x.res === 1 || x.status === 'w').length / a.length * 100) : null;
const ofUnits = a => a.reduce((t, x) => { const won = x.res === 1 || x.status === 'w', o = x.odds || x.odd || (x.prob ? Math.max(1.03, 100 / x.prob * 0.93) : 1.8); return t + (won ? o - 1 : -1); }, 0);

// tarjeta corta arriba de Sugerencias (del deporte abierto)
function ofCardHTML(sp) {
  ofLoad();
  if (!OF.H) return '';
  const {P, C} = ofSets(sp), n = OF_SP[sp] || '';
  if (!P.length && !C.length) return `<div class="prob-card of-mini" onclick="ofOpen('${sp}')"><h3><span class="dot"></span>Acierto oficial AlexBet · ${n}</h3><div class="pl-none">Todavía no hay resultados de ${n} en este período. Las sugerencias se publican en el servidor antes de cada partido y aquí verás cuántas se cumplieron. <b style="color:var(--accent)">Ver</b></div></div>`;
  return `<div class="prob-card of-mini" onclick="ofOpen('${sp}')"><h3><span class="dot"></span>Acierto oficial AlexBet · ${n} · ${OF.days ? OF.days + ' días' : 'todo'}</h3>
    <div class="lv-stats" style="justify-content:space-between">${P.length ? `<span>Sugerencias: <b>${ofPct(P)}%</b> (${P.length})</span>` : ''}${C.length ? `<span>Combinadas: <b>${C.filter(c => c.status === 'w').length}/${C.length}</b></span>` : ''}<span style="color:var(--accent);font-weight:700">Ver detalle ›</span></div></div>`;
}
function ofClose() { const el = document.getElementById('ofSheet'); if (el) el.innerHTML = ''; }
const OF_CAT = {goles: 'Goles', btts: 'Ambos anotan', res: 'Resultado', tarj: 'Tarjetas', corn: 'Córners', ml: 'Ganador', line: 'Hándicap / sets', tot: 'Total'};
function ofLegs(c) {
  return c.legs.map(l => `<div class="of-leg"><span>${l.res === 1 ? '✅' : l.res === 0 ? '❌' : l.res === 'v' ? '➖' : '⏳'}</span><div><b>${escA(l.label)}</b><small>${escA(l.h)} vs ${escA(l.a)}${l.where ? ' · ' + escA(l.where) : ''}</small></div><em>${l.prob}%${l.odds ? '<small>' + (+l.odds).toFixed(2) + '</small>' : ''}</em></div>`).join('');
}
// abrir/cerrar una combinada sin volver a dibujar la hoja (así no salta hacia arriba)
function ofToggle(id, el) {
  OF.open[id] = !OF.open[id];
  const box = el && el.nextElementSibling, sm = el && el.querySelector('small .of-tg');
  if (box && box.classList.contains('of-legs')) { box.style.display = OF.open[id] ? '' : 'none'; if (sm) sm.textContent = OF.open[id] ? 'ocultar ▲' : 'ver selecciones ▼'; return; }
  const card = document.querySelector('#ofSheet .mh-card'), y = card ? card.scrollTop : 0; ofOpen(OF.sp);
  const c2 = document.querySelector('#ofSheet .mh-card'); if (c2) c2.scrollTop = y;
}
function ofOpen(sp) {
  const same = !sp || sp === OF.sp, prevCard = document.querySelector('#ofSheet .mh-card'), keepY = same && prevCard ? prevCard.scrollTop : 0;
  sp = sp || OF.sp; OF.sp = sp;
  let el = document.getElementById('ofSheet'); if (!el) { el = document.createElement('div'); el.id = 'ofSheet'; document.body.appendChild(el); }
  setTimeout(() => { const c = document.querySelector('#ofSheet .mh-card'); if (c && keepY) c.scrollTop = keepY; }, 0);
  ofLoad();
  const {H, P, C} = ofSets(sp), n = OF_SP[sp] || '', chip = (d, t) => `<button type="button" class="tn-chip ${OF.days === d ? 'on' : ''}" onclick="OF.days=${d};ofOpen();if(viewMode==='picks')renderMatches()">${t}</button>`;
  const bar = v => `<span class="of-bar"><i style="width:${v || 0}%"></i></span>`;
  const row = (t, a) => a.length ? `<div class="of-row"><span>${t}</span><span>${ofPct(a)}% · ${a.length}${bar(ofPct(a))}</span></div>` : '';
  const crow = (t, a) => a.length ? `<div class="of-row"><span>${t}</span><span>${a.filter(c => c.status === 'w').length} / ${a.length}${bar(ofPct(a))}</span></div>` : '';
  const bin = (lo, hi) => { const a = P.filter(p => p.prob >= lo && p.prob < hi); return a.length ? `<div class="of-row"><span>Cuando decíamos ${lo}–${hi - 1}%</span><span>salió ${ofPct(a)}% (${a.length})</span></div>` : ''; };
  const units = ofUnits(P);
  const cats = {}; P.forEach(p => { const k = OF_CAT[p.cat] || 'Otros'; (cats[k] = cats[k] || []).push(p); });
  const comboItem = c => { const id = String(c.id || (c.day + c.tier + c.odds)).replace(/'/g, ''), open = !!OF.open[id], ok = c.legs.filter(l => l.res === 1).length;
    return `<div class="of-row of-it of-cb" onclick="ofToggle('${id}', this)"><div>${c.status === 'w' ? '✅' : c.status === 'l' ? '❌' : '⏳'} ${OF_TIER[c.tier] ? OF_TIER[c.tier].replace('Combinadas ', 'Combinada ') : 'Combinada'} · cuota ${(+c.odds).toFixed(2)}<small>${ok}/${c.legs.length} acertadas · publicada ${ofWhen(c.pub)} · <span class="of-tg">${open ? 'ocultar ▲' : 'ver selecciones ▼'}</span></small></div><span>${c.prob}%</span></div><div class="of-legs" style="${open ? '' : 'display:none'}">${ofLegs(c)}</div>`; };
  const last = [...(H.picks || []).filter(p => p.sp === sp && (p.res === 0 || p.res === 1)).map(p => ({t: p.rt || p.ts, html: `<div class="of-row of-it"><div>${p.res ? '✅' : '❌'} ${escA(p.label)}<small>${escA(p.h)} vs ${escA(p.a)}${p.where ? ' · ' + escA(p.where) : ''} · publicada ${ofWhen(p.pub)}</small></div><span>${p.prob}%</span></div>`})),
    ...(H.combos || []).filter(c => c.sp === sp && (c.status === 'w' || c.status === 'l')).map(c => ({t: c.rt || c.ts, html: comboItem(c)}))]
    .sort((a, b) => b.t - a.t).slice(0, 30);
  const today = (H.combos || []).filter(c => c.sp === sp && c.status === 'p' && c.ts > Date.now() - 2 * 864e5);
  const pend = (H.picks || []).filter(p => p.sp === sp && p.res == null && p.ts > Date.now() - 864e5).length;
  el.innerHTML = `<div class="mh-sheet" onclick="if(event.target===this)ofClose()"><div class="mh-card">
    <button class="mh-x" onclick="ofClose()">✕</button>
    <h3 style="margin:0 0 8px">Acierto oficial AlexBet · ${n}</h3>
    <div class="tn-chips" style="margin:0 0 10px">${chip(7, '7 días')}${chip(30, '30 días')}${chip(0, 'Todo')}</div>
    ${!OF.H ? '<div class="pl-none">Cargando historial…</div>' : !P.length && !C.length ? `<div class="pl-none">Todavía no hay resultados de ${n} en este período. Las sugerencias de hoy ya están publicadas (${pend} pendientes) y se revisan solas cuando terminan los partidos.</div>` : `
    <div class="mh-grid"><div><b>${ofPct(P) ?? '-'}%</b><small>Sugerencias (${P.length})</small></div><div><b style="color:${units >= 0 ? 'var(--over)' : '#ff6b6b'}">${units >= 0 ? '+' : ''}${units.toFixed(1)} u</b><small>Ganancia a 1 u*</small></div></div>
    ${Object.entries(cats).sort((a, b) => b[1].length - a[1].length).map(([k, a]) => row(k, a)).join('')}
    ${['seg', 'med', 'alt'].map(k => crow(OF_TIER[k], C.filter(c => c.tier === k))).join('')}
    ${bin(55, 65)}${bin(65, 75)}${bin(75, 86)}`}
    ${today.length ? `<div class="lv-h" style="margin-top:10px">Combinadas en juego</div>${today.map(comboItem).join('')}` : ''}
    ${last.length ? `<div class="lv-h" style="margin-top:10px">Últimas resueltas</div>${last.map(x => x.html).join('')}` : ''}
    <div class="al-st" style="margin-top:8px">Toca una combinada para ver sus selecciones. Se publican en el servidor antes de cada partido, con fecha y hora, y se revisan solas con los resultados reales de ESPN. Nadie las puede editar. *Ganancia aproximada apostando 1 unidad a la cuota de la casa estimada. ${pend ? 'Pendientes de hoy: ' + pend + '.' : ''}</div>
  </div></div>`;
}
function ofWhen(t) { if (!t) return '-'; const d = new Date(t - 5 * 3600e3); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; }

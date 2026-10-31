// AlexBet · Tenis (ATP y WTA) con datos de ESPN.
// Modelo: fuerza de cada jugador según puntos del ranking y forma reciente;
// de ahí sale la probabilidad de ganar, sets exactos y total de juegos (simulación por saque).

const TN_API = 'https://site.api.espn.com/apis/site/v2/sports/tennis';
const TN_TOURS = {atp: {name: 'ATP', color: '#38bdf8', hold: 0.79}, wta: {name: 'WTA', color: '#f472b6', hold: 0.64}};
const TN = {m: {}, rank: {atp: {}, wta: {}}, t: 0, rt: 0, err: '', loading: false, tour: 'all'};

// ---------- Datos ----------
function tnSide(x) {
  const a = x.athlete || {};
  const ls = (x.linescores || []).map(s => ({v: Math.round(s.value || 0), w: s.winner === true ? 1 : s.winner === false ? 0 : null}));
  return {
    id: String(x.id), name: a.displayName || a.fullName || '', short: a.shortName || a.displayName || '',
    flag: (a.flag && a.flag.href) || '', country: (a.flag && a.flag.alt) || '',
    crank: x.curatedRank && x.curatedRank.current ? x.curatedRank.current : null,
    sets: ls, winner: x.winner === true, serve: x.possession === true
  };
}
function tnParse(tour, j) {
  (j.events || []).forEach(e => (e.groupings || []).forEach(g => (g.competitions || []).forEach(c => {
    const slug = (c.type && c.type.slug) || '';
    if (!/singles/.test(slug)) return;
    const cs = (c.competitors || []).slice().sort((p, q) => (p.order || 0) - (q.order || 0));
    if (cs.length !== 2 || !cs[0].athlete || !cs[1].athlete) return;
    const nm = x => String((x.athlete && (x.athlete.displayName || x.athlete.fullName)) || '').trim();
    if (!nm(cs[0]) || !nm(cs[1]) || /^(tbd|tba|bye|qualifier)$/i.test(nm(cs[0])) || /^(tbd|tba|bye|qualifier)$/i.test(nm(cs[1]))) return;
    const st = (c.status && c.status.type) || {};
    TN.m[c.id] = {
      id: String(c.id), tour, ev: e.name || e.shortName || '', major: !!e.major,
      round: (c.round && c.round.displayName) || '', d: String(c.date || e.date).slice(0, 16),
      state: st.completed ? 'post' : (st.state === 'in' ? 'in' : 'pre'),
      off: /postpon|cancel|suspend|walkover|retired/i.test((st.name || '') + ' ' + (st.description || '')),
      detail: tnDetail(st.shortDetail || st.detail || ''), tv: c.timeValid !== false, note: (c.notes && c.notes[0] && c.notes[0].text) || '',
      bo: tour === 'atp' && e.major ? 5 : 3, court: (c.venue && c.venue.court) || '',
      p: [tnSide(cs[0]), tnSide(cs[1])]
    };
  })));
}
function tnParseRank(tour, j) {
  const R = (j.rankings && j.rankings[0] && j.rankings[0].ranks) || [];
  const out = {};
  R.forEach(r => { if (r.athlete && r.athlete.id) out[String(r.athlete.id)] = {rank: r.current, pts: r.points || 0}; });
  if (Object.keys(out).length) TN.rank[tour] = out;
}
async function tnLoad(force) {
  if (TN.loading) return;
  if (!force && TN.t && Date.now() - TN.t < 5 * 60e3) return;
  TN.loading = true; TN.err = '';
  const days = [1, 2].map(i => { const x = new Date(todayDate); x.setDate(x.getDate() + i); return ymd(x).replace(/-/g, ''); });
  const jobs = [];
  Object.keys(TN_TOURS).forEach(t => {
    jobs.push([t, 's', webGet(`${TN_API}/${t}/scoreboard`)]);
    days.forEach(k => jobs.push([t, 's', webGet(`${TN_API}/${t}/scoreboard?dates=${k}`)]));
    if (!TN.rt || Date.now() - TN.rt > 12 * 3600e3) jobs.push([t, 'r', webGet(`${TN_API}/${t}/rankings`)]);
  });
  const res = await Promise.allSettled(jobs.map(x => x[2]));
  let ok = 0, last = '';
  res.forEach((r, i) => {
    const [t, k] = jobs[i];
    if (r.status !== 'fulfilled') { last = (r.reason && r.reason.message) || String(r.reason); return; }
    if (k === 's') { ok++; tnParse(t, r.value); } else tnParseRank(t, r.value);
  });
  if (jobs.some(x => x[1] === 'r')) TN.rt = Date.now();
  if (ok) { TN.t = Date.now(); TN.retry = 0; }
  else {
    TN.err = last || 'sin respuesta de ESPN';
    if ((TN.retry || 0) < 2) { TN.retry = (TN.retry || 0) + 1; setTimeout(() => tnLoad(true), 3000 * TN.retry); }
  }
  TN.loading = false;
  updateLiveBadge();
  if (sport === 'tenis') {
    if (document.getElementById('detail').classList.contains('show') && TN.open) tnOpen(TN.open, true);
    else renderMatches();
  }
}

function tnDetail(t) { const m = String(t).match(/^(\d)(st|nd|rd|th)/i); return m ? 'Set ' + m[1] : t; }

// ---------- Modelo ----------
function tnStrength(m, i) {
  const s = m.p[i], R = TN.rank[m.tour][s.id];
  let rank = R ? R.rank : s.crank, pts = R ? R.pts : 0, est = false;
  if (!pts) {
    if (!rank) { rank = 250; est = true; }
    pts = 11000 * Math.pow(rank, -0.7); // estimación de puntos según el puesto
  }
  // Forma: partidos de individuales cargados (torneos de esta semana y próximos días)
  let w = 0, l = 0;
  Object.values(TN.m).forEach(x => {
    if (x.state !== 'post' || x.id === m.id || x.off) return;
    const k = x.p[0].id === s.id ? 0 : x.p[1].id === s.id ? 1 : -1; if (k < 0) return;
    if (x.p[k].winner) w++; else if (x.p[1 - k].winner) l++;
  });
  const form = Math.max(0.85, Math.min(1.25, 1 + 0.06 * (w - l)));
  return {rank: rank && !est ? rank : null, pts, est, w, l, f: pts * form};
}
// Un set con saques alternos: probabilidad de que A lo gane y de cada total de juegos.
function tnSet(ha, hb, ga0, gb0) {
  const ptb = Math.max(0.05, Math.min(0.95, 0.5 + (ha - hb) * 1.1));
  const out = {pA: 0, games: {}};
  [0, 1].forEach(first => { // quién saca primero (promedio de ambos casos)
    let cur = {}; cur[(ga0 || 0) + ',' + (gb0 || 0)] = 1;
    for (let step = 0; step < 14; step++) {
      const nx = {};
      Object.keys(cur).forEach(k => {
        const p = cur[k], [a, b] = k.split(',').map(Number);
        const done = (a >= 6 || b >= 6) && Math.abs(a - b) >= 2 || a === 7 || b === 7;
        if (done) { nx[k] = (nx[k] || 0) + p; return; }
        if (a === 6 && b === 6) {
          nx['7,6'] = (nx['7,6'] || 0) + p * ptb; nx['6,7'] = (nx['6,7'] || 0) + p * (1 - ptb); return;
        }
        const aServes = ((a + b + first) % 2) === 0;
        const pa = aServes ? ha : 1 - hb;
        const ka = (a + 1) + ',' + b, kb = a + ',' + (b + 1);
        nx[ka] = (nx[ka] || 0) + p * pa; nx[kb] = (nx[kb] || 0) + p * (1 - pa);
      });
      cur = nx;
    }
    Object.keys(cur).forEach(k => {
      const [a, b] = k.split(',').map(Number), p = cur[k] / 2;
      if (a > b) out.pA += p;
      const g = a + b; out.games[g] = (out.games[g] || 0) + p;
      out[a > b ? 'wA' : 'wB'] = out[a > b ? 'wA' : 'wB'] || {};
      out[a > b ? 'wA' : 'wB'][g] = (out[a > b ? 'wA' : 'wB'][g] || 0) + p;
    });
  });
  return out;
}
function tnMatchProb(s, need) { // prob. de ganar el partido si gana cada set con prob s
  const f = (a, b) => a === need ? 1 : b === need ? 0 : s * f(a + 1, b) + (1 - s) * f(a, b + 1);
  return f(0, 0);
}
function tnModel(m) {
  const key = m.id + '|' + TN.t + '|' + TN.rt;
  if (TN.cache && TN.cache[m.id] && TN.cache[m.id].key === key) return TN.cache[m.id].M;
  const M = tnModelCalc(m);
  (TN.cache = TN.cache || {})[m.id] = {key, M};
  return M;
}
function tnModelCalc(m) {
  const A = tnStrength(m, 0), B = tnStrength(m, 1);
  const c = 0.85;
  const pMatch = Math.max(0.04, Math.min(0.96, Math.pow(A.f, c) / (Math.pow(A.f, c) + Math.pow(B.f, c))));
  const need = m.bo === 5 ? 3 : 2;
  // 1) probabilidad de set que reproduce la de partido
  let lo = 0.01, hi = 0.99;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (tnMatchProb(mid, need) < pMatch) lo = mid; else hi = mid; }
  const sSet = (lo + hi) / 2;
  // 2) tasas de saque que reproducen esa probabilidad de set
  const base = TN_TOURS[m.tour].hold;
  lo = -0.3; hi = 0.3;
  for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (tnSet(base + mid / 2, base - mid / 2).pA < sSet) lo = mid; else hi = mid; }
  const d = (lo + hi) / 2, ha = base + d / 2, hb = base - d / 2;
  const S = tnSet(ha, hb);
  // 3) partido completo: sets y total de juegos
  let st = {'0,0,0': 1}; const fin = {};
  for (let k = 0; k < 2 * need - 1; k++) {
    const nx = {};
    Object.keys(st).forEach(key => {
      const p = st[key], [a, b, g] = key.split(',').map(Number);
      Object.keys(S.wA || {}).forEach(gg => { const q = p * S.wA[gg], kk = (a + 1) + ',' + b + ',' + (g + +gg); (a + 1 === need ? fin : nx)[kk] = ((a + 1 === need ? fin : nx)[kk] || 0) + q; });
      Object.keys(S.wB || {}).forEach(gg => { const q = p * S.wB[gg], kk = a + ',' + (b + 1) + ',' + (g + +gg); (b + 1 === need ? fin : nx)[kk] = ((b + 1 === need ? fin : nx)[kk] || 0) + q; });
    });
    st = nx;
  }
  const sets = {}, games = {}; let pA = 0;
  Object.keys(fin).forEach(key => {
    const [a, b, g] = key.split(',').map(Number), p = fin[key];
    sets[a + '-' + b] = (sets[a + '-' + b] || 0) + p; games[g] = (games[g] || 0) + p; if (a === need) pA += p;
  });
  const over = L => Object.keys(games).reduce((t, g) => t + (+g > L ? games[g] : 0), 0);
  let acc = 0, med = 0;
  Object.keys(games).map(Number).sort((x, y) => x - y).some(g => { acc += games[g]; if (acc >= 0.5) { med = g; return true; } return false; });
  const L0 = Math.floor(med) - 0.5;
  const exp = Object.keys(games).reduce((t, g) => t + g * games[g], 0);
  return {A, B, pA, pB: 1 - pA, sSet, ha, hb, sets, over, lines: [L0 - 2, L0, L0 + 2], exp, need,
    oneA: 1 - (sets[`0-${need}`] || 0), oneB: 1 - (sets[`${need}-0`] || 0), est: A.est || B.est};
}
// En vivo: sets ganados y juegos del set actual.
function tnLive(m, base) {
  const M = base || tnModel(m), need = M.need;
  let sa = 0, sb = 0, ga = 0, gb = 0;
  const n = Math.max(m.p[0].sets.length, m.p[1].sets.length);
  for (let i = 0; i < n; i++) {
    const a = m.p[0].sets[i] || {v: 0, w: null}, b = m.p[1].sets[i] || {v: 0, w: null};
    if (a.w === 1 || b.w === 0) sa++; else if (b.w === 1 || a.w === 0) sb++; else { ga = a.v; gb = b.v; }
  }
  const pSetNow = tnSet(M.ha, M.hb, ga, gb).pA;
  const f = (a, b) => a === need ? 1 : b === need ? 0 : M.sSet * f(a + 1, b) + (1 - M.sSet) * f(a, b + 1);
  const pA = (sa === need) ? 1 : (sb === need) ? 0 : pSetNow * f(sa + 1, sb) + (1 - pSetNow) * f(sa, sb + 1);
  return {pA, pB: 1 - pA, sa, sb, ga, gb};
}

// ---------- Pantallas ----------
const tnPc = x => Math.round(Math.max(0, Math.min(1, x)) * 100);
function tnFlag(s) { return s.flag ? `<img src="${escA(s.flag)}" alt="" width="16" height="11" style="vertical-align:-1px;margin-right:5px;border-radius:2px;object-fit:cover">` : ''; }
function tnRankTag(X) { return X.rank ? `<small style="color:var(--ink-dim);font-weight:500"> #${X.rank}</small>` : ''; }
function tnList() {
  const ayer = ymd(new Date(todayDate.getTime() - 864e5));
  return Object.values(TN.m).filter(m => (TN.tour === 'all' || m.tour === TN.tour) && !m.off && favOK(m.p[0].name, m.p[1].name) && (m.state !== 'post' || isoDateOnlyEcuador(m.d, 0) >= ayer));
}
function tnHeader() {
  const ago = TN.t ? Math.round((Date.now() - TN.t) / 60000) : 0;
  const chip = (k, t) => `<button type="button" class="tn-chip ${TN.tour === k ? 'on' : ''}" onclick="TN.tour='${k}';renderMatches()">${t}</button>`;
  return `<div class="tn-chips">${chip('all', 'Todos')}${chip('atp', 'ATP')}${chip('wta', 'WTA')}</div>
    <div class="data-status" style="display:block"><b>● Datos reales</b> · ESPN · Tenis${TN.t ? ` · actualizado ${ago < 1 ? 'hace un momento' : 'hace ' + ago + ' min'}` : ''} <a href="#" onclick="tnLoad(true);return false;" style="color:var(--accent);margin-left:6px;">Actualizar</a></div>`;
}
function tnEmpty(what) {
  if (TN.loading && !TN.t) return `<div class="empty-state">Cargando tenis…</div>`;
  if (TN.err && !TN.t) return `<div class="empty-state">No pude conectar con ESPN para tenis (${escA(TN.err)}).<br><br><button class="btn primary" onclick="tnLoad(true)">Reintentar</button></div>`;
  return `<div class="empty-state">No hay partidos de tenis ${what}. Prueba otro día.</div>`;
}
function tnScore(m) {
  const n = Math.max(m.p[0].sets.length, m.p[1].sets.length);
  const a = [], b = [], pr = [];
  for (let i = 0; i < n; i++) { const x = (m.p[0].sets[i] || {}).v ?? 0, y = (m.p[1].sets[i] || {}).v ?? 0; a.push(x); b.push(y); pr.push(x + '-' + y); }
  return {a: a.join(' '), b: b.join(' '), pairs: pr.join(' · ')};
}
function tnTime(m, f) { return m.tv ? f.time : 'Por conf.'; }
function tnRow(m, M, mid) {
  const pl = (s, X, right) => `<div class="team${right ? ' away' : ''}">${badgeHTML(s.name, false)}<div class="team-name">${tnFlag(s)}${escA(s.name)}${tnRankTag(X)}${favStar(s.name)}</div></div>`;
  return `<div class="teams-row">${pl(m.p[0], M.A)}${mid}${pl(m.p[1], M.B, true)}</div>`;
}
function tnMeta(m, f) {
  return `<div class="match-meta"><span><i class="lg-dot" style="background:${TN_TOURS[m.tour].color}"></i>${TN_TOURS[m.tour].name} · ${escA(m.ev)}${m.round ? ' · ' + escA(m.round) : ''}</span><span>${f.date} · hora Ecuador</span></div>`;
}
function tnRenderMatches() {
  const list = document.getElementById('matchList');
  document.getElementById('matchesLabel').textContent = 'Partidos';
  if (!TN.t && !TN.loading && !TN.err) tnLoad();
  const ms = tnList().filter(m => activeDate === 'all' || isoDateOnlyEcuador(m.d, 0) === activeDate).sort((x, y) => x.d.localeCompare(y.d));
  document.getElementById('matchCount').textContent = ms.length + (ms.length === 1 ? ' partido' : ' partidos');
  if (!ms.length) { list.innerHTML = tnHeader() + tnEmpty('en esta fecha'); return; }
  list.innerHTML = tnHeader() + ms.map(m => {
    const f = fmtParts(m.d, 0), M = tnModel(m);
    let pA = M.pA;
    if (m.state === 'in') pA = tnLive(m, M).pA;
    const sc = tnScore(m);
    const mid = m.state === 'pre'
      ? `<div class="ko"><b${m.tv ? '' : ' style="font-size:13px"'}>${tnTime(m, f)}</b><span>${f.date}</span></div>`
      : `<div class="ko"><b style="font-size:13px;white-space:nowrap">${sc.pairs || '-'}</b><span>${m.state === 'in' ? escA(m.detail || 'En vivo') : 'Final'}</span></div>`;
    const a = tnPc(pA), b = 100 - a;
    const straight = M.sets[`${M.need}-0`] + M.sets[`0-${M.need}`];
    return `<div class="match-card" onclick="tnOpen('${m.id}')">
      ${tnMeta(m, f)}
      ${tnRow(m, M, mid)}
      <div class="mini1x2"><span style="width:${a}%; background:var(--over);"></span><span style="width:${b}%; background:var(--accent);"></span></div>
      <div class="mini1x2-labels"><span>${escA(m.p[0].short)} ${a}%</span><span>${escA(m.p[1].short)} ${b}%</span></div>
      <div class="lv-stats" style="justify-content:center;margin-top:8px;"><span>${m.state === 'pre' ? `Juegos esperados: <b>${M.exp.toFixed(1)}</b> · Sets corridos: <b>${tnPc(straight)}%</b>` : 'Probabilidad según el marcador actual'}${M.est ? ' (est.)' : ''}</span></div>
    </div>`;
  }).join('') + `<div class="foot-note">Tenis: probabilidades según los puntos del ranking ATP/WTA y la forma en los torneos recientes (ESPN). No considera superficie, lesiones ni cuotas. "(est.)" = jugador sin ranking conocido. No garantizan el resultado.</div>`;
}
function tnCands(m, M) {
  const c = [], add = (label, p, why) => { const q = tnPc(p); if (q >= 60 && q <= 97) c.push({label, prob: q, why}); };
  const A = m.p[0].name, B = m.p[1].name, need = M.need;
  add(`Gana ${A}`, M.pA, 'ganador del partido'); add(`Gana ${B}`, M.pB, 'ganador del partido');
  if (M.pA < 0.5) add(`${A} gana al menos un set`, M.oneA, `no pierde ${need}-0`); else add(`${B} gana al menos un set`, M.oneB, `no pierde ${need}-0`);
  M.lines.forEach(L => { add(`Más de ${L} juegos`, M.over(L), `esperados ${M.exp.toFixed(1)}`); add(`Menos de ${L} juegos`, 1 - M.over(L), `esperados ${M.exp.toFixed(1)}`); });
  return c.sort((x, y) => y.prob - x.prob);
}
function tnRenderPicks() {
  const list = document.getElementById('matchList');
  document.getElementById('matchesLabel').textContent = 'Sugerencias';
  if (!TN.t && !TN.loading && !TN.err) tnLoad();
  const day = activeDate === 'all' ? ymd(todayDate) : activeDate;
  const ms = tnList().filter(m => m.state === 'pre' && isoDateOnlyEcuador(m.d, 0) === day);
  const rows = [];
  ms.forEach(m => { const M = tnModel(m); if (M.est) return; tnCands(m, M).slice(0, 1).forEach(k => rows.push({m, M, k})); });
  rows.sort((x, y) => y.k.prob - x.k.prob);
  document.getElementById('matchCount').textContent = ms.length + (ms.length === 1 ? ' partido' : ' partidos');
  if (!ms.length) { list.innerHTML = tnHeader() + tnEmpty('por jugar en esta fecha'); return; }
  const top = rows.slice(0, 10);
  list.innerHTML = tnHeader() + `<div class="prob-card"><h3><span class="dot"></span>Mejores opciones de tenis</h3>` + (top.length ? top.map(x => {
    const f = fmtParts(x.m.d, 0);
    return `<div class="pick-row" onclick="tnOpen('${x.m.id}')"><div class="pick-main"><b>${escA(x.k.label)}</b><small>${escA(x.m.p[0].name)} vs ${escA(x.m.p[1].name)} · ${tnTime(x.m, f)} · ${TN_TOURS[x.m.tour].name} ${escA(x.m.ev)}${x.M.est ? ' · (est.)' : ''}</small></div><div class="pick-pct"><b>${x.k.prob}%</b></div></div>`;
  }).join('') : `<div class="pl-none">Ningún mercado pasa el filtro de confianza hoy.</div>`) + `</div>` +
  `<div class="foot-note">Sugerencias de tenis: mercados con 60% o más según el modelo (ranking y forma). Solo se sugieren partidos con ambos jugadores en el ranking. Los totales de juegos son estimaciones: dependen mucho del saque de cada jugador.</div>`;
}
function tnRenderLive() {
  const list = document.getElementById('matchList');
  document.getElementById('matchesLabel').textContent = 'En vivo';
  const ms = tnList().filter(m => m.state === 'in');
  document.getElementById('matchCount').textContent = TN.t ? ms.length + (ms.length === 1 ? ' partido' : ' partidos') : '';
  if (!TN.t) { list.innerHTML = tnHeader() + tnEmpty('en vivo'); return; }
  if (!ms.length) { list.innerHTML = tnHeader() + `<div class="empty-state">No hay partidos de tenis en vivo ahora mismo.</div>`; return; }
  list.innerHTML = tnHeader() + ms.map(m => {
    const M = tnModel(m), L = tnLive(m, M), sc = tnScore(m);
    const bar = (lab, v) => `<div class="pk-line"><div class="t">${escA(lab)}</div><div class="bar-track"><div class="bar-fill ${v >= .5 ? 'strong' : ''}" style="width:${tnPc(v)}%"></div></div><div class="v">${tnPc(v)}%</div></div>`;
    return `<div class="match-card" onclick="tnOpen('${m.id}')">
      <div class="match-meta"><span><i class="lg-dot" style="background:${TN_TOURS[m.tour].color}"></i>${TN_TOURS[m.tour].name} · ${escA(m.ev)}</span><span class="lv-min"><i></i>${escA(m.detail || 'En vivo')}</span></div>
      <div class="tn-sc">${[0, 1].map(i => `<div><span>${m.p[i].serve ? '<i class="tn-sv" aria-label="saca"></i>' : ''}${tnFlag(m.p[i])}${escA(m.p[i].name)}</span><b>${(i ? sc.b : sc.a).split(' ').map(v => `<em>${v}</em>`).join('')}</b></div>`).join('')}</div>
      <div class="lv-h">Quién gana (modelo con el marcador actual)</div>${bar(m.p[0].name, L.pA)}${bar(m.p[1].name, L.pB)}
    </div>`;
  }).join('') + `<div class="foot-note">En vivo: el modelo combina la probabilidad previa con los sets y juegos que ya se jugaron. El punto verde marca quién saca.</div>`;
}
function tnRender() {
  if (viewMode === 'live') return tnRenderLive();
  if (viewMode === 'picks') return tnRenderPicks();
  if (viewMode === 'value') {
    document.getElementById('matchesLabel').textContent = 'Valor';
    document.getElementById('matchCount').textContent = '';
    document.getElementById('matchList').innerHTML = `<div class="empty-state">Valor (modelo contra cuotas) todavía no está disponible para tenis. Usa Partidos o Sugerencias.</div>`;
    return;
  }
  tnRenderMatches();
}
function tnLiveCount() { return Object.values(TN.m).filter(m => m.state === 'in' && !m.off).length; }
function tnLiveStart() { liveStop(); tnLoad(true); usLiveTimer = setInterval(() => tnLoad(true), 60000); }

function tnForm(s) {
  const rows = Object.values(TN.m).filter(x => x.state === 'post' && !x.off && (x.p[0].id === s.id || x.p[1].id === s.id)).sort((a, b) => b.d.localeCompare(a.d)).slice(0, 6);
  if (!rows.length) return `<div class="lv-stats"><span>Sin partidos recientes en los datos.</span></div>`;
  return rows.map(x => {
    const k = x.p[0].id === s.id ? 0 : 1, o = x.p[1 - k], won = x.p[k].winner;
    const sc = x.p[k].sets.map((v, i) => v.v + '-' + ((x.p[1 - k].sets[i] || {}).v ?? '')).join(' ');
    return `<div class="pk-line" style="cursor:default"><div class="t">${won ? '✅' : '❌'} vs ${escA(o.name)}<small>${escA(x.ev)} · ${escA(x.round)} · ${fmtParts(x.d, 0).date}</small></div><div class="v" style="min-width:auto;font-size:12.5px;white-space:nowrap">${sc}</div></div>`;
  }).join('');
}
function tnOpen(id, keep) {
  const m = TN.m[id]; if (!m) return;
  TN.open = id;
  const M = tnModel(m), f = fmtParts(m.d, 0), sc = tnScore(m);
  const L = m.state === 'in' ? tnLive(m, M) : null;
  const pA = tnPc(L ? L.pA : M.pA), pB = 100 - pA, A = m.p[0], B = m.p[1], need = M.need;
  const ringC = p => p >= 60 ? 'var(--over)' : 'var(--accent)';
  const tile = (p, lab) => `<div class="stat-tile">${ringHTML(p, ringC(p), 72)}<div class="l">${lab}</div></div>`;
  const setKeys = need === 3 ? ['3-0', '3-1', '3-2', '0-3', '1-3', '2-3'] : ['2-0', '2-1', '0-2', '1-2'];
  const setLab = k => { const [a, b] = k.split('-').map(Number); return a > b ? `${escA(A.short)} ${a}-${b}` : `${escA(B.short)} ${b}-${a}`; };
  const info = (s, X) => `<div style="padding:8px 0;border-top:1px solid var(--line);"><div style="font-weight:700;font-size:14px;">${tnFlag(s)}${escA(s.name)}</div>
    <div class="lv-stats"><span>Ranking: <b>${X.rank ? '#' + X.rank : 'sin dato (est.)'}</b></span>${X.pts && X.rank ? `<span>Puntos: <b>${Math.round(X.pts)}</b></span>` : ''}<span>Últimos partidos en los datos: <b>${X.w}-${X.l}</b></span></div>${tnForm(s)}</div>`;
  const html = `
    <div class="matchup-hero"><div class="meta">${TN_TOURS[m.tour].name} · ${escA(m.ev).toUpperCase()}${m.round ? ' · ' + escA(m.round).toUpperCase() : ''}</div>
      <div class="row">
        <div class="team-big">${badgeHTML(A.name, true)}<div class="name">${tnFlag(A)}${escA(A.name)}${favStar(A.name)}</div></div>
        <div class="center-vs"><div class="ko-big">${m.state === 'pre' ? tnTime(m, f) : `<span style="font-size:17px;white-space:nowrap">${sc.pairs || '-'}</span>`}<small>${f.date} Ecuador${m.state === 'post' ? ' · Final' : m.state === 'in' ? ' · En vivo' : ''}${m.court ? ' · ' + escA(m.court) : ''}</small></div></div>
        <div class="team-big">${badgeHTML(B.name, true)}<div class="name">${tnFlag(B)}${escA(B.name)}${favStar(B.name)}</div></div>
      </div></div>
    <div class="prob-card"><h3><span class="dot"></span>Quién gana${L ? ' (con el marcador actual)' : ''}</h3>
      <div class="bar1x2"><span style="width:${pA}%; background:var(--over);"></span><span style="width:${pB}%; background:var(--accent);"></span></div>
      <div class="bar1x2-labels"><div><div class="v">${pA}%</div><div class="l">${escA(A.name)}</div></div><div><div class="v">${pB}%</div><div class="l">${escA(B.name)}</div></div></div>
      <div class="lv-stats" style="justify-content:center;">Al mejor de ${m.bo} sets${M.est ? ' · (est.)' : ''}</div></div>
    <div class="prob-card"><h3><span class="dot"></span>Resultado en sets</h3><div class="stat-grid" style="grid-template-columns:repeat(${need === 3 ? 3 : 2},1fr)">${setKeys.map(k => tile(tnPc(M.sets[k] || 0), setLab(k))).join('')}</div></div>
    <div class="prob-card"><h3><span class="dot"></span>Gana al menos un set</h3><div class="stat-grid" style="grid-template-columns:repeat(2,1fr)">${tile(tnPc(M.oneA), escA(A.short))}${tile(tnPc(M.oneB), escA(B.short))}</div></div>
    <div class="prob-card"><h3><span class="dot"></span>Total de juegos (esperados ${M.exp.toFixed(1)})</h3><div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">${M.lines.map(Lx => tile(tnPc(M.over(Lx)), 'Más de ' + Lx)).join('')}</div>
      <div class="lv-stats" style="justify-content:center;">Estimación según el saque típico del circuito: tómalo como referencia.</div></div>
    <div class="prob-card"><h3><span class="dot"></span>Jugadores</h3>${info(A, M.A)}${info(B, M.B)}</div>
    <div class="foot-note">Hora mostrada: Ecuador (UTC-5). Modelo: puntos del ranking ${TN_TOURS[m.tour].name} y forma en los torneos recientes (ESPN), sets y juegos simulados con el saque típico del circuito. No considera superficie, lesiones ni cuotas. No garantiza el resultado.</div>`;
  document.getElementById('detailContent').innerHTML = html;
  if (!keep) {
    document.getElementById('home').classList.add('hide');
    document.getElementById('detail').classList.add('show');
    window.scrollTo(0, 0);
  }
}

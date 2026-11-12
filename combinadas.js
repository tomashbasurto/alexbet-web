// AlexBet · Combinadas del día, en 3 niveles:
//   Opción 1 (riesgo bajo): 3 a 5 combinadas de cuota 2.00 a 2.50
//   Opción 2 (riesgo medio): 2 combinadas de cuota 3.50 a 5.00
//   Opción 3 (riesgo alto): 2 combinadas de cuota mayor a 5 (hasta 10)
// Las claves internas (seg/med/alt) no cambian para no romper el historial guardado.
// Cada deporte (fútbol, NBA, MLB) tiene sus propias combinadas, armadas con las mejores sugerencias de hoy
// de ese deporte (cada selección de un partido distinto). Se congelan para el día y se resuelven solas
// con los resultados reales (igual que Mis jugadas).

const CB = {tab: 'hoy'};
const CB_TIERS = [
  {k: 'seg', name: 'Opción 1', risk: 'bajo', min: 2.0, max: 2.5, n: 5, want: 3, sizes: [2, 3, 4], minP: 62, maxP: 99, maxO: 1.75},
  {k: 'med', name: 'Opción 2', risk: 'medio', min: 3.5, max: 5.0, n: 2, want: 2, sizes: [3, 4, 5], minP: 58, maxP: 74, maxO: 2.0},
  {k: 'alt', name: 'Opción 3', risk: 'alto', min: 5.0001, max: 10, n: 2, want: 2, sizes: [4, 5], minP: 55, maxP: 68, maxO: 2.3}
];
const cbDay = () => ymd(todayDate);
// Las casas pagan menos que la cuota justa (se quedan un margen de ~7% por selección).
// Sin cuota real, la cuota que se muestra es la estimada de la casa: cuota justa x 0.93.
const CB_MARGIN = 0.93, CB_CV = 5;
const cbEst = fair => Math.max(1.03, fair * CB_MARGIN);
const CB_SP = {futbol: 'Fútbol', nba: 'NBA', eul: 'Euroliga', mlb: 'MLB', tenis: 'Tenis', ncaa: 'NCAA', nhl: 'NHL', mix: 'Mixtas'};
// combinadas mixtas de hoy: las publica el servidor (historial.json), iguales para todos
function cbMixHTML() {
  if (!PREM() || typeof OF === 'undefined') return '';
  if (!OF.H) { ofLoad(); return ''; }
  const C = (OF.H.combos || []).filter(c => c.sp === 'mix' && c.day === cbDay());
  if (!C.length) return '';
  return `<details class="prob-card cb-box"><summary><h3 style="display:inline"><span class="dot"></span>Combinadas mixtas · varios deportes</h3></summary>` +
    CB_TIERS.map(T => { const G = C.filter(c => (c.tier || 'seg') === T.k); return G.length ? `<div class="cb-t">${T.name} <span class="cb-rk ${T.k}">Riesgo ${T.risk}</span></div>` + G.map((c, i) => cbCard(c, `${T.name} · #${i + 1}`)).join('') : ''; }).join('') +
    `<div class="al-st">Las mejores selecciones del día de todos los deportes, una por partido. Las publica el servidor antes de que empiecen y se resuelven solas.</div></details>`;
}
// historial: {día: {deporte: {t, combos, lock}}}
function cbAll() {
  let all = LS.get('ab_cb2', null);
  if (!all) { // pasa las de la versión anterior (todas de fútbol)
    all = {}; const old = LS.get('ab_cb', {});
    Object.keys(old).forEach(d => { if (old[d] && old[d].combos) all[d] = {futbol: {...old[d], combos: old[d].combos.map(c => ({...c, tier: c.tier || 'seg'}))}}; });
    LS.set('ab_cb2', all);
  }
  return all;
}
const cbEach = (all, f) => Object.keys(all).forEach(d => Object.keys(all[d] || {}).forEach(sp => f(all[d][sp], d, sp)));

function cbLegs(want) {
  const day = cbDay(), now = Date.now(), out = [];
  const push = (sp, lid, h, a, when, ts, gid, k, where) => {
    if (ts < now + 10 * 60e3) return; // solo partidos que todavía no empiezan
    const mkt = pkMkt(k.label, h, a); if (!mkt) return;
    const fair = 100 / k.prob, odds = k.odd > 1 ? k.odd : cbEst(fair);
    out.push({sp, lid, h, a, when, ts, gid, label: k.label, cat: k.cat, prob: k.prob, raw: k.raw, odds: +odds.toFixed(2), fair: +fair.toFixed(2), real: k.odd > 1, mkt, where, res: null});
  };
  try {
    if (want === 'futbol') LEAGUES.forEach(l => l.fixtures.forEach(f => {
      if (!l.teams[f[0]] || !l.teams[f[1]] || isoDateOnlyEcuador(f[2], l.utcOffset) !== day) return;
      const pk = matchPicks(l, f); if (!pk) return;
      pk.picks.slice(0, 4).forEach(k => push('futbol', l.id, f[0], f[1], f[2], pkTs(f[2], l.utcOffset), null, k, l.name));
    }));
  } catch (e) {}
  if (want === 'tenis') try {
    const cat = l => /^Gana /.test(l) ? 'ml' : / set$/.test(l) ? 'line' : 'tot';
    Object.values(TN.m).forEach(m => {
      if (m.state !== 'pre' || m.off || isoDateOnlyEcuador(m.d, 0) !== day) return;
      const M = tnModel(m); if (M.est) return;
      const ts = Date.parse(m.d + (m.d.length <= 16 ? ':00Z' : '')), h = m.p[0].name, a = m.p[1].name;
      if (m.tv && ts < now + 10 * 60e3) return;
      tnCands(m, M).slice(0, 2).forEach(k => { const c = cat(k.label), q = calP(c, k.prob, false); if (q < 55) return;
        out.push({sp: 'tenis', lid: m.tour, h, a, when: m.d, ts, gid: m.id, label: k.label, cat: c, prob: q, raw: k.prob, odds: +cbEst(100 / q).toFixed(2), fair: +(100 / q).toFixed(2), real: false, mkt: {t: 'tn'}, where: TN_TOURS[m.tour].name + ' ' + m.ev, res: null}); });
    });
  } catch (e) {}
  ['nba', 'eul', 'mlb', 'ncaa', 'nhl'].filter(sp => sp === want).forEach(sp => {
    try {
      (usData[sp].games || []).forEach(g => {
        if (g.state !== 'pre' || g.postponed || isoDateOnlyEcuador(g.d, 0) !== day) return;
        usPicks(g, usPre(g)).slice(0, 2).forEach(k => push(sp, sp, g.h.name, g.a.name, g.d, toEcuador(g.d, 0).getTime() + 5 * 3600e3, g.id, k, US[sp].name));
      });
    } catch (e) {}
  });
  return out.filter(x => x.odds >= 1.12).sort((x, y) => y.prob - x.prob);
}

const cbPj = c => c.reduce((a, l) => a * l.prob / 100, 1);
function cbBuildTier(T, all, usedGlobal, sp) {
  const shareOK = !!usedGlobal.share;
  const key = x => pkKey(x);
  // En fútbol cada partido aporta sus 2 selecciones más probables (de mercados distintos: goles, ambos anotan,
  // resultado, córners o tarjetas), así una combinada puede llevar 2 del mismo partido. Nunca dos líneas del mismo mercado.
  // En NBA, MLB y tenis, una por partido (ahí todos los mercados dependen del mismo marcador).
  const fam = x => x.sp === 'futbol' ? x.cat : 'g', perMatch = {};
  const fk = x => key(x) + '#' + fam(x);
  const seen = new Set(), L = [];
  const ok = x => x.prob >= T.minP && x.prob <= T.maxP && x.odds <= T.maxO && (shareOK || !usedGlobal.has(key(x)));
  // en NBA/MLB (pocos partidos) prefiere otra selección del mismo partido para no repetir lo de otro nivel
  const fresh = x => !usedGlobal.has(key(x) + '|' + x.label);
  [all.filter(x => ok(x) && fresh(x)), all.filter(x => ok(x) && !fresh(x))].forEach(A => A.forEach(x => { if (seen.has(fk(x)) || (perMatch[key(x)] || 0) >= 2) return; seen.add(fk(x)); perMatch[key(x)] = (perMatch[key(x)] || 0) + 1; L.push(x); }));
  L.sort((x, y) => y.prob - x.prob);
  const pool = L.slice(0, 32), combos = [], maxN = Math.max(...T.sizes);
  const fits = (cur, x) => { const same = cur.filter(l => key(l) === key(x)); return same.length < 2 && !same.some(l => fam(l) === fam(x)); };
  const dfs = (start, cur, o) => {
    if (T.sizes.includes(cur.length) && o >= T.min && o <= T.max) combos.push(cur.slice());
    if (cur.length >= maxN || o >= T.max || combos.length > 20000) return;
    for (let i = start; i < pool.length; i++) { if (!fits(cur, pool[i])) continue; const no = o * pool[i].odds; if (no > T.max * 1.0001 && cur.length + 1 >= Math.min(...T.sizes)) continue; cur.push(pool[i]); dfs(i + 1, cur, no); cur.pop(); }
  };
  dfs(0, [], 1);
  // con probabilidad parecida (±1 punto), prefiere la que usa menos partidos (2 mercados del mismo partido)
  const nm = c => new Set(c.map(key)).size;
  combos.sort((x, y) => Math.round(cbPj(y) * 100) - Math.round(cbPj(x) * 100) || nm(x) - nm(y) || x.length - y.length);
  const used = new Set(), pick = [];
  for (const c of combos) {
    if (pick.length >= T.n) break;
    if (c.some(l => used.has(key(l)))) continue;
    c.forEach(l => { used.add(key(l)); usedGlobal.add(key(l)); usedGlobal.add(key(l) + '|' + l.label); });
    pick.push(c);
  }
  return pick.map((c, i) => ({
    id: cbDay() + '|' + sp + '|' + T.k + i, sp, tier: T.k, legs: c.map(l => ({...l})), odds: +c.reduce((a, l) => a * l.odds, 1).toFixed(2), fair: +c.reduce((a, l) => a * (l.fair || 100 / l.prob), 1).toFixed(2),
    prob: Math.round(cbPj(c) * 100), ts: Math.max(...c.map(l => l.ts)), first: Math.min(...c.map(l => l.ts)), status: 'p'
  }));
}
// fútbol tiene muchos partidos: no repite partido entre niveles. NBA/MLB tienen pocos: sí puede repetir entre niveles.
// v46: "mixtas" = las mejores selecciones de todos los deportes juntos (un partido distinto por selección)
const CB_ALLSP = ['futbol', 'nba', 'eul', 'ncaa', 'mlb', 'nhl', 'tenis'];
function cbBuild(sp) { const all = sp === 'mix' ? CB_ALLSP.flatMap(s => cbLegs(s)).sort((x, y) => y.prob - x.prob) : cbLegs(sp), used = new Set(); return CB_TIERS.flatMap(T => cbBuildTier(T, all, sp === 'futbol' ? used : Object.assign(used, {share: true}), sp)); }
const cbCount = (C, k) => C.filter(c => c.tier === k).length;
const cbFull = C => CB_TIERS.every(T => cbCount(C, T.k) >= T.want);

// Se arman una vez al día. Si falta algún nivel, se reintenta hasta que empiece el primer partido.
function cbToday(sp) {
  const all = cbAll(), day = cbDay(), D = all[day] = all[day] || {};
  if (D[sp] && D[sp].cv !== CB_CV && !D[sp].combos.some(c => c.first <= Date.now())) delete D[sp]; // armadas con cuotas viejas
  const cur = D[sp];
  if (cur && (cur.lock || cbFull(cur.combos))) return cur;
  if (cur && cur.combos.some(c => c.first <= Date.now())) { cur.lock = true; LS.set('ab_cb2', all); return cur; }
  if (US[sp] && !usData[sp].t) return cur || {combos: [], lock: false}; // espera a que carguen los partidos
  if (sp === 'tenis' && !TN.t) return cur || {combos: [], lock: false};
  const M = (CB.memo = CB.memo || {})[sp]; if (M && Date.now() - M.t < 90e3) return M.D; // no recalcular en cada toque
  // espera las cuotas reales de ESPN de este deporte para usarlas en las combinadas
  if (sp !== 'tenis' && !(VA.t && VA.sp === sp) && sport === sp && !VA.err) { vaPrime(); if (VA.loading || !VA.t || VA.sp !== sp) return cur || {combos: [], lock: false}; }
  const combos = cbBuild(sp);
  if (!combos.length && !cur) return {combos: [], lock: false};
  if (!cur || combos.length >= cur.combos.length) D[sp] = {t: Date.now(), combos, lock: cbFull(combos), cv: CB_CV};
  const ks = Object.keys(all).sort(); if (ks.length > 60) ks.slice(0, ks.length - 60).forEach(k => delete all[k]);
  LS.set('ab_cb2', all);
  CB.memo[sp] = {t: Date.now(), D: D[sp] || {combos: [], lock: false}};
  return D[sp];
}

// Resultados: usa el mismo buscador de resultados de Mis jugadas
function cbNeeds(need, now) {
  const all = cbAll(), res = LS.get('ab_res', {});
  cbEach(all, x => x.combos.forEach(c => { if (c.status !== 'p') return;
    c.legs.forEach(l => { if (l.sp !== 'tenis' && l.res == null && l.ts + 3 * 3600e3 < now) { const k = pkKey(l); if (!res[k]) need[k] = need[k] || l; } }); }));
}
// Tenis: se resuelve con los partidos ya terminados que trae ESPN en el marcador del torneo
function cbSettleTennis() {
  if (typeof TN === 'undefined' || !TN.t) return false;
  const all = cbAll(); let ch = false;
  cbEach(all, (x, d, sp) => { if (sp !== 'tenis') return; x.combos.forEach(c => { if (c.status !== 'p') return;
    c.legs.forEach(l => { if (l.res != null) return; const m = TN.m[l.gid]; if (!m) return;
      if (m.off && m.state !== 'pre') { l.res = 'v'; ch = true; return; }
      if (m.state !== 'post' || !(m.p[0].winner || m.p[1].winner)) return;
      const v = tnHit(m, l); if (v != null) { l.res = v ? 1 : 0; ch = true; } });
    pkSettleBet(c, {}); if (c.status === 'm') c.status = 'w'; }); });
  if (ch) LS.set('ab_cb2', all);
  return ch;
}
function cbSettle(res) {
  const all = cbAll();
  cbEach(all, x => x.combos.forEach(c => { if (c.status === 'p') pkSettleBet(c, res); if (c.status === 'm') c.status = 'w'; }));
  LS.set('ab_cb2', all);
}

// ---------- Pantalla ----------
const cbSpName = l => (l.sp === 'futbol' || l.sp === 'tenis') ? l.where : (US[l.sp] || {}).name || l.sp;
const cbMark = s => s === 'w' ? '✅' : s === 'l' ? '❌' : s === 'v' ? '➖' : '⏳';
function cbHTML(sp) {
  sp = sp || sport;
  if (sp === 'tenis') cbSettleTennis();
  if (!PREM()) return `<div class="prob-card"><h3><span class="dot"></span>Combinadas AlexBet</h3><div class="pl-none">Combinadas del día en 3 opciones (opción 1 de riesgo bajo, cuota 2 a 2.5; opción 2 de riesgo medio, 3.5 a 5; opción 3 de riesgo alto, más de 5) con su historial de resultados. <a href="#" onclick="abPay();return false;" style="color:var(--accent)">Disponible en Premium</a>.</div></div>`;
  const tab = (k, t) => `<button type="button" class="tn-chip ${CB.tab === k ? 'on' : ''}" onclick="CB.tab='${k}';renderMatches()">${t}</button>`;
  let h = `<div class="prob-card cb-box"><h3><span class="dot"></span>Combinadas AlexBet · ${CB_SP[sp]}</h3><div class="tn-chips" style="margin:2px 0 8px">${tab('hoy', 'Hoy')}${tab('res', 'Resultados')}</div>`;
  if (CB.tab === 'res') return h + cbResHTML(sp) + `</div>`;
  const D = cbToday(sp), C = D.combos || [];
  if (!C.length) {
    const loading = sp === 'tenis' ? !TN.t : sp !== 'futbol' && (usData[sp].loading || !usData[sp].t);
    return h + `<div class="pl-none">${loading ? 'Cargando partidos para armar las combinadas…' : `Hoy no hay suficientes selecciones de ${CB_SP[sp]} para armar combinadas. Mejor no forzar.`}</div></div>`;
  }
  h += CB_TIERS.map(T => { const G = C.filter(c => (c.tier || 'seg') === T.k);
    return `<div class="cb-t">${T.name} <span class="cb-rk ${T.k}">Riesgo ${T.risk}</span> · cuota ${T.k === 'alt' ? 'mayor a 5' : T.min.toFixed(2) + ' a ' + T.max.toFixed(2)}</div>` + (G.length ? G.map((c, i) => cbCard(c, `${T.name} · #${i + 1}`)).join('') : `<div class="pl-none" style="padding:6px 0">Hoy no hay selecciones suficientes para este nivel.</div>`); }).join('');
  const est = C.some(c => c.legs.some(l => !l.real));
  h += `<div class="al-st">${D.lock ? 'Combinadas fijas de hoy.' : 'Se completan cuando carguen más partidos.'} En fútbol una combinada puede llevar las 2 selecciones más probables de un mismo partido (de mercados distintos); revisa que tu casa lo permita. ${est ? '≈ cuota aproximada de la casa (la cuota justa del modelo menos el margen que se queda la casa, ~7% por selección). Tu casa puede pagar un poco distinto. ' : ''}A más cuota, más riesgo: las de la opción 3 se pierden la mayoría de las veces. Ninguna probabilidad garantiza el resultado.</div></div>`;
  return h;
}
function cbCard(c, title) {
  return `<div class="cb-c"><div class="cb-hd"><b>${title}</b><span>${cbMark(c.status)} ${c.legs.length} selecciones</span></div>` +
    c.legs.map(l => { const f = l.sp === 'tenis' && TN.m[l.gid] && !TN.m[l.gid].tv ? {time: 'hora por conf.'} : fmtParts(l.when, l.sp === 'futbol' ? (LEAGUES.find(x => x.id === l.lid) || {}).utcOffset || 0 : 0);
      return `<div class="cb-l"><div><b>${escA(l.label)}${l.res === 1 ? ' ✔' : l.res === 0 ? ' ✖' : ''}</b><small>${escA(cbSpName(l))} · ${escA(l.h)} vs ${escA(l.a)} · ${f.time}</small></div><span>${l.prob}%<small>${l.real ? '' : '≈'}${l.odds.toFixed(2)}</small></span></div>`; }).join('') +
    `<div class="cb-ft"><span>Prob. de acertar <b>${c.prob}%</b></span><span>Cuota ${c.legs.every(l => l.real) ? '' : 'aprox. '}<b>${c.odds.toFixed(2)}</b></span></div></div>`;
}
function cbResHTML(sp) {
  const all = cbAll(), days = Object.keys(all).sort().reverse();
  const C = []; days.forEach(d => { const n = {}; ((all[d] || {})[sp] || {combos: []}).combos.forEach(c => { const t = c.tier || 'seg'; n[t] = (n[t] || 0) + 1; C.push({d, i: n[t], c, t}); }); });
  if (!C.length) return `<div class="pl-none">Todavía no hay combinadas de ${CB_SP[sp]} guardadas. El historial empieza hoy y se guarda en este celular.</div>`;
  const done = C.filter(x => x.c.status === 'w' || x.c.status === 'l'), w = done.filter(x => x.c.status === 'w').length;
  const net = done.reduce((a, x) => a + (x.c.status === 'w' ? x.c.odds - 1 : -1), 0), pend = C.filter(x => x.c.status === 'p').length;
  let h = `<div class="mh-grid"><div><b>${w} / ${done.length}</b><small>Acertadas</small></div><div><b>${done.length ? Math.round(w / done.length * 100) + '%' : '-'}</b><small>Acierto</small></div><div><b style="color:${net >= 0 ? 'var(--over)' : '#ff6b6b'}">${net >= 0 ? '+' : ''}${net.toFixed(2)} u</b><small>Ganancia</small></div></div>`;
  h += CB_TIERS.map(T => { const D2 = done.filter(x => x.t === T.k), w2 = D2.filter(x => x.c.status === 'w').length, n2 = D2.reduce((a, x) => a + (x.c.status === 'w' ? x.c.odds - 1 : -1), 0);
    return D2.length ? `<div class="lv-stats"><span>${T.name}: <b>${w2}/${D2.length}</b></span><span>${n2 >= 0 ? '+' : ''}${n2.toFixed(2)} u</span></div>` : ''; }).join('');
  h += C.slice(0, 60).map(x => { const ok = x.c.legs.filter(l => l.res === 1).length, bad = x.c.legs.find(l => l.res === 0);
    const [y, m, d] = x.d.split('-');
    return `<div class="cb-r"><span>${cbMark(x.c.status)} ${(CB_TIERS.find(T => T.k === x.t) || CB_TIERS[0]).name} · #${x.i} · ${d}/${m}</span><span>${ok}/${x.c.legs.length} · ${bad ? 'falló ' + escA(bad.label) : 'cuota ' + x.c.odds.toFixed(2)}</span></div>`; }).join('');
  h += `<div class="al-st" style="margin-top:6px">Ganancia = apostando 1 unidad en cada combinada.${pend ? ' Pendientes: ' + pend + '.' : ''} Toca "Actualizar resultados" en Mis jugadas si ya terminaron los partidos.</div>`;
  return h;
}
function cbPrime() {
  if (!PREM()) return;
  const now = Date.now(); let pend = false;
  cbEach(cbAll(), x => { if (x.combos.some(c => c.status === 'p' && c.legs.some(l => l.res == null && l.ts + 3 * 3600e3 < now))) pend = true; });
  if (pend && !PK.busy && now - PK.last > 10 * 60e3) pkSweep().then(() => { if (viewMode === 'picks') renderMatches(); });
}

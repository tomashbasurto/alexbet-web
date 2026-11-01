// AlexBet · Combinadas del día, en 3 niveles:
//   Seguras: 3 a 5 combinadas de cuota 2.00 a 2.50
//   Medias: 2 combinadas de cuota 3.50 a 5.00
//   Altas: 2 combinadas de cuota mayor a 5 (hasta 10)
// Cada deporte (fútbol, NBA, MLB) tiene sus propias combinadas, armadas con las mejores sugerencias de hoy
// de ese deporte (cada selección de un partido distinto). Se congelan para el día y se resuelven solas
// con los resultados reales (igual que Mis jugadas).

const CB = {tab: 'hoy'};
const CB_TIERS = [
  {k: 'seg', name: 'Seguras', min: 2.0, max: 2.5, n: 5, want: 3, sizes: [2, 3], minP: 62, maxP: 99, maxO: 1.75},
  {k: 'med', name: 'Medias', min: 3.5, max: 5.0, n: 2, want: 2, sizes: [3, 4], minP: 60, maxP: 74, maxO: 2.0},
  {k: 'alt', name: 'Altas', min: 5.0001, max: 10, n: 2, want: 2, sizes: [3, 4, 5], minP: 55, maxP: 70, maxO: 2.3}
];
const cbDay = () => ymd(todayDate);
const CB_SP = {futbol: 'Fútbol', nba: 'NBA', mlb: 'MLB'};
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
    const odds = k.odd > 1 ? k.odd : 100 / k.prob;
    out.push({sp, lid, h, a, when, ts, gid, label: k.label, cat: k.cat, prob: k.prob, raw: k.raw, odds: +odds.toFixed(2), real: k.odd > 1, mkt, where, res: null});
  };
  try {
    if (want === 'futbol') LEAGUES.forEach(l => l.fixtures.forEach(f => {
      if (!l.teams[f[0]] || !l.teams[f[1]] || isoDateOnlyEcuador(f[2], l.utcOffset) !== day) return;
      const pk = matchPicks(l, f); if (!pk) return;
      pk.picks.slice(0, 2).forEach(k => push('futbol', l.id, f[0], f[1], f[2], pkTs(f[2], l.utcOffset), null, k, l.name));
    }));
  } catch (e) {}
  ['nba', 'mlb'].filter(sp => sp === want).forEach(sp => {
    try {
      (usData[sp].games || []).forEach(g => {
        if (g.state !== 'pre' || g.postponed || isoDateOnlyEcuador(g.d, 0) !== day) return;
        usPicks(g, usPre(g)).slice(0, 2).forEach(k => push(sp, sp, g.h.name, g.a.name, g.d, toEcuador(g.d, 0).getTime() + 5 * 3600e3, g.id, k, US[sp].name));
      });
    } catch (e) {}
  });
  return out.filter(x => x.odds >= 1.2).sort((x, y) => y.prob - x.prob);
}

const cbPj = c => c.reduce((a, l) => a * l.prob / 100, 1);
function cbBuildTier(T, all, usedGlobal, sp) {
  const shareOK = !!usedGlobal.share;
  const key = x => pkKey(x);
  // cada partido aporta su mejor selección para este nivel
  const seen = new Set(), L = [];
  const ok = x => x.prob >= T.minP && x.prob <= T.maxP && x.odds <= T.maxO && (shareOK || !usedGlobal.has(key(x)));
  // en NBA/MLB (pocos partidos) prefiere otra selección del mismo partido para no repetir lo de otro nivel
  const fresh = x => !usedGlobal.has(key(x) + '|' + x.label);
  [all.filter(x => ok(x) && fresh(x)), all.filter(x => ok(x) && !fresh(x))].forEach(A => A.forEach(x => { if (seen.has(key(x))) return; seen.add(key(x)); L.push(x); }));
  L.sort((x, y) => y.prob - x.prob);
  const pool = L.slice(0, 30), combos = [], maxN = Math.max(...T.sizes);
  const dfs = (start, cur, o) => {
    if (T.sizes.includes(cur.length) && o >= T.min && o <= T.max) combos.push(cur.slice());
    if (cur.length >= maxN || o >= T.max || combos.length > 20000) return;
    for (let i = start; i < pool.length; i++) { const no = o * pool[i].odds; if (no > T.max * 1.0001 && cur.length + 1 >= Math.min(...T.sizes)) continue; cur.push(pool[i]); dfs(i + 1, cur, no); cur.pop(); }
  };
  dfs(0, [], 1);
  combos.sort((x, y) => cbPj(y) - cbPj(x) || x.length - y.length);
  const used = new Set(), pick = [];
  for (const c of combos) {
    if (pick.length >= T.n) break;
    if (c.some(l => used.has(key(l)))) continue;
    c.forEach(l => { used.add(key(l)); usedGlobal.add(key(l)); usedGlobal.add(key(l) + '|' + l.label); });
    pick.push(c);
  }
  return pick.map((c, i) => ({
    id: cbDay() + '|' + sp + '|' + T.k + i, sp, tier: T.k, legs: c.map(l => ({...l})), odds: +c.reduce((a, l) => a * l.odds, 1).toFixed(2),
    prob: Math.round(cbPj(c) * 100), ts: Math.max(...c.map(l => l.ts)), first: Math.min(...c.map(l => l.ts)), status: 'p'
  }));
}
// fútbol tiene muchos partidos: no repite partido entre niveles. NBA/MLB tienen pocos: sí puede repetir entre niveles.
function cbBuild(sp) { const all = cbLegs(sp), used = new Set(); return CB_TIERS.flatMap(T => cbBuildTier(T, all, sp === 'futbol' ? used : Object.assign(used, {share: true}), sp)); }
const cbCount = (C, k) => C.filter(c => c.tier === k).length;
const cbFull = C => CB_TIERS.every(T => cbCount(C, T.k) >= T.want);

// Se arman una vez al día. Si falta algún nivel, se reintenta hasta que empiece el primer partido.
function cbToday(sp) {
  const all = cbAll(), day = cbDay(), D = all[day] = all[day] || {}, cur = D[sp];
  if (cur && (cur.lock || cbFull(cur.combos))) return cur;
  if (cur && cur.combos.some(c => c.first <= Date.now())) { cur.lock = true; LS.set('ab_cb2', all); return cur; }
  if (sp !== 'futbol' && !usData[sp].t) return cur || {combos: [], lock: false}; // espera a que carguen los partidos
  const combos = cbBuild(sp);
  if (!combos.length && !cur) return {combos: [], lock: false};
  if (!cur || combos.length >= cur.combos.length) D[sp] = {t: Date.now(), combos, lock: cbFull(combos)};
  const ks = Object.keys(all).sort(); if (ks.length > 60) ks.slice(0, ks.length - 60).forEach(k => delete all[k]);
  LS.set('ab_cb2', all);
  return D[sp];
}

// Resultados: usa el mismo buscador de resultados de Mis jugadas
function cbNeeds(need, now) {
  const all = cbAll(), res = LS.get('ab_res', {});
  cbEach(all, x => x.combos.forEach(c => { if (c.status !== 'p') return;
    c.legs.forEach(l => { if (l.res == null && l.ts + 3 * 3600e3 < now) { const k = pkKey(l); if (!res[k]) need[k] = need[k] || l; } }); }));
}
function cbSettle(res) {
  const all = cbAll();
  cbEach(all, x => x.combos.forEach(c => { if (c.status === 'p') pkSettleBet(c, res); if (c.status === 'm') c.status = 'w'; }));
  LS.set('ab_cb2', all);
}

// ---------- Pantalla ----------
const cbSpName = l => l.sp === 'futbol' ? l.where : (US[l.sp] || {}).name || l.sp;
const cbMark = s => s === 'w' ? '✅' : s === 'l' ? '❌' : s === 'v' ? '➖' : '⏳';
function cbHTML(sp) {
  sp = sp || sport;
  if (!PREM()) return `<div class="prob-card"><h3><span class="dot"></span>Combinadas AlexBet</h3><div class="pl-none">Combinadas del día (seguras de cuota 2 a 2.5, medias de 3.5 a 5 y altas de más de 5) con su historial de resultados. <a href="#" onclick="abPay();return false;" style="color:var(--accent)">Disponible en Premium</a>.</div></div>`;
  const tab = (k, t) => `<button type="button" class="tn-chip ${CB.tab === k ? 'on' : ''}" onclick="CB.tab='${k}';renderMatches()">${t}</button>`;
  let h = `<div class="prob-card cb-box"><h3><span class="dot"></span>Combinadas AlexBet · ${CB_SP[sp]}</h3><div class="tn-chips" style="margin:2px 0 8px">${tab('hoy', 'Hoy')}${tab('res', 'Resultados')}</div>`;
  if (CB.tab === 'res') return h + cbResHTML(sp) + `</div>`;
  const D = cbToday(sp), C = D.combos || [];
  if (!C.length) {
    const loading = sp !== 'futbol' && (usData[sp].loading || !usData[sp].t);
    return h + `<div class="pl-none">${loading ? 'Cargando partidos para armar las combinadas…' : `Hoy no hay suficientes selecciones de ${CB_SP[sp]} para armar combinadas. Mejor no forzar.`}</div></div>`;
  }
  h += CB_TIERS.map(T => { const G = C.filter(c => (c.tier || 'seg') === T.k);
    return `<div class="cb-t">${T.name} · cuota ${T.k === 'alt' ? 'mayor a 5' : T.min.toFixed(2) + ' a ' + T.max.toFixed(2)}</div>` + (G.length ? G.map((c, i) => cbCard(c, `${T.name.slice(0, -1)} ${i + 1}`)).join('') : `<div class="pl-none" style="padding:6px 0">Hoy no hay selecciones suficientes para este nivel.</div>`); }).join('');
  const est = C.some(c => c.legs.some(l => !l.real));
  h += `<div class="al-st">${D.lock ? 'Combinadas fijas de hoy.' : 'Se completan cuando carguen más partidos.'} Dentro de cada combinada, cada selección es de un partido distinto. ${est ? '* cuota justa del modelo (sin cuota real de la casa); juega solo si tu casa paga igual o más. ' : ''}A más cuota, más riesgo: las altas se pierden la mayoría de las veces. Ninguna probabilidad garantiza el resultado.</div></div>`;
  return h;
}
function cbCard(c, title) {
  return `<div class="cb-c"><div class="cb-hd"><b>${title}</b><span>${cbMark(c.status)} ${c.legs.length} selecciones</span></div>` +
    c.legs.map(l => { const f = fmtParts(l.when, l.sp === 'futbol' ? (LEAGUES.find(x => x.id === l.lid) || {}).utcOffset || 0 : 0);
      return `<div class="cb-l"><div><b>${escA(l.label)}${l.res === 1 ? ' ✔' : l.res === 0 ? ' ✖' : ''}</b><small>${escA(cbSpName(l))} · ${escA(l.h)} vs ${escA(l.a)} · ${f.time}</small></div><span>${l.prob}%<small>${l.odds.toFixed(2)}${l.real ? '' : '*'}</small></span></div>`; }).join('') +
    `<div class="cb-ft"><span>Prob. de acertar <b>${c.prob}%</b></span><span>Cuota <b>${c.odds.toFixed(2)}</b></span></div></div>`;
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
    return `<div class="cb-r"><span>${cbMark(x.c.status)} ${(CB_TIERS.find(T => T.k === x.t) || CB_TIERS[0]).name.slice(0, -1)} ${x.i} · ${d}/${m}</span><span>${ok}/${x.c.legs.length} · ${bad ? 'falló ' + escA(bad.label) : 'cuota ' + x.c.odds.toFixed(2)}</span></div>`; }).join('');
  h += `<div class="al-st" style="margin-top:6px">Ganancia = apostando 1 unidad en cada combinada.${pend ? ' Pendientes: ' + pend + '.' : ''} Toca "Actualizar resultados" en Mis jugadas si ya terminaron los partidos.</div>`;
  return h;
}
function cbPrime() {
  if (!PREM()) return;
  const now = Date.now(); let pend = false;
  cbEach(cbAll(), x => { if (x.combos.some(c => c.status === 'p' && c.legs.some(l => l.res == null && l.ts + 3 * 3600e3 < now))) pend = true; });
  if (pend && !PK.busy && now - PK.last > 10 * 60e3) pkSweep().then(() => { if (viewMode === 'picks') renderMatches(); });
}

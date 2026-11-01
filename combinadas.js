// AlexBet · Combinadas del día, en 3 niveles:
//   Seguras: 3 a 5 combinadas de cuota 2.00 a 2.50
//   Medias: 2 combinadas de cuota 3.50 a 5.00
//   Altas: 2 combinadas de cuota mayor a 5 (hasta 10)
// Se arman con las mejores sugerencias de fútbol, NBA y MLB de hoy (cada selección de un partido distinto),
// se congelan para el día y se resuelven solas con los resultados reales (igual que Mis jugadas).

const CB = {tab: 'hoy'};
const CB_TIERS = [
  {k: 'seg', name: 'Seguras', min: 2.0, max: 2.5, n: 5, want: 3, sizes: [2, 3], minP: 62, maxP: 99, maxO: 1.75},
  {k: 'med', name: 'Medias', min: 3.5, max: 5.0, n: 2, want: 2, sizes: [3, 4], minP: 60, maxP: 74, maxO: 2.0},
  {k: 'alt', name: 'Altas', min: 5.0001, max: 10, n: 2, want: 2, sizes: [3, 4, 5], minP: 55, maxP: 70, maxO: 2.3}
];
const cbDay = () => ymd(todayDate);

function cbLegs() {
  const day = cbDay(), now = Date.now(), out = [];
  const push = (sp, lid, h, a, when, ts, gid, k, where) => {
    if (ts < now + 10 * 60e3) return; // solo partidos que todavía no empiezan
    const mkt = pkMkt(k.label, h, a); if (!mkt) return;
    const odds = k.odd > 1 ? k.odd : 100 / k.prob;
    out.push({sp, lid, h, a, when, ts, gid, label: k.label, cat: k.cat, prob: k.prob, raw: k.raw, odds: +odds.toFixed(2), real: k.odd > 1, mkt, where, res: null});
  };
  try {
    LEAGUES.forEach(l => l.fixtures.forEach(f => {
      if (!l.teams[f[0]] || !l.teams[f[1]] || isoDateOnlyEcuador(f[2], l.utcOffset) !== day) return;
      const pk = matchPicks(l, f); if (!pk) return;
      pk.picks.slice(0, 2).forEach(k => push('futbol', l.id, f[0], f[1], f[2], pkTs(f[2], l.utcOffset), null, k, l.name));
    }));
  } catch (e) {}
  ['nba', 'mlb'].forEach(sp => {
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
function cbBuildTier(T, all, usedGlobal) {
  usedGlobal = usedGlobal || new Set();
  const key = x => pkKey(x);
  // cada partido aporta su mejor selección para este nivel
  const seen = new Set(), L = [];
  all.forEach(x => { if (x.prob < T.minP || x.prob > T.maxP || x.odds > T.maxO || seen.has(key(x)) || usedGlobal.has(key(x))) return; seen.add(key(x)); L.push(x); });
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
    c.forEach(l => { used.add(key(l)); usedGlobal.add(key(l)); });
    pick.push(c);
  }
  return pick.map((c, i) => ({
    id: cbDay() + '|' + T.k + i, tier: T.k, legs: c.map(l => ({...l})), odds: +c.reduce((a, l) => a * l.odds, 1).toFixed(2),
    prob: Math.round(cbPj(c) * 100), ts: Math.max(...c.map(l => l.ts)), first: Math.min(...c.map(l => l.ts)), status: 'p'
  }));
}
function cbBuild() { const all = cbLegs(), used = new Set(); return CB_TIERS.flatMap(T => cbBuildTier(T, all, used)); }
const cbCount = (C, k) => C.filter(c => c.tier === k).length;
const cbFull = C => CB_TIERS.every(T => cbCount(C, T.k) >= T.want);

// Se arman una vez al día. Si falta algún nivel, se reintenta hasta que empiece el primer partido.
function cbToday() {
  const all = LS.get('ab_cb', {}), day = cbDay(), cur = all[day];
  if (cur && cur.combos.some(c => !c.tier)) cur.combos.forEach(c => { c.tier = c.tier || 'seg'; });
  if (cur && (cur.lock || cbFull(cur.combos))) return cur;
  if (cur && cur.combos.some(c => c.first <= Date.now())) { cur.lock = true; LS.set('ab_cb', all); return cur; }
  const combos = cbBuild();
  if (!combos.length && !cur) return {combos: [], lock: false};
  if (!cur || combos.length >= cur.combos.length) all[day] = {t: Date.now(), combos, lock: cbFull(combos)};
  const ks = Object.keys(all).sort(); if (ks.length > 60) ks.slice(0, ks.length - 60).forEach(k => delete all[k]);
  LS.set('ab_cb', all);
  return all[day];
}

// Resultados: usa el mismo buscador de resultados de Mis jugadas
function cbNeeds(need, now) {
  const all = LS.get('ab_cb', {}), res = LS.get('ab_res', {});
  Object.values(all).forEach(d => d.combos.forEach(c => { if (c.status !== 'p') return;
    c.legs.forEach(l => { if (l.res == null && l.ts + 3 * 3600e3 < now) { const k = pkKey(l); if (!res[k]) need[k] = need[k] || l; } }); }));
}
function cbSettle(res) {
  const all = LS.get('ab_cb', {});
  Object.values(all).forEach(d => d.combos.forEach(c => { if (c.status === 'p') pkSettleBet(c, res); if (c.status === 'm') c.status = 'w'; }));
  LS.set('ab_cb', all);
}

// ---------- Pantalla ----------
const cbSpName = l => l.sp === 'futbol' ? l.where : (US[l.sp] || {}).name || l.sp;
const cbMark = s => s === 'w' ? '✅' : s === 'l' ? '❌' : s === 'v' ? '➖' : '⏳';
function cbHTML() {
  if (!PREM()) return `<div class="prob-card"><h3><span class="dot"></span>Combinadas AlexBet</h3><div class="pl-none">Combinadas del día (seguras de cuota 2 a 2.5, medias de 3.5 a 5 y altas de más de 5) con su historial de resultados. <a href="#" onclick="abPay();return false;" style="color:var(--accent)">Disponible en Premium</a>.</div></div>`;
  const tab = (k, t) => `<button type="button" class="tn-chip ${CB.tab === k ? 'on' : ''}" onclick="CB.tab='${k}';renderMatches()">${t}</button>`;
  let h = `<div class="prob-card cb-box"><h3><span class="dot"></span>Combinadas AlexBet</h3><div class="tn-chips" style="margin:2px 0 8px">${tab('hoy', 'Hoy')}${tab('res', 'Resultados')}</div>`;
  if (CB.tab === 'res') return h + cbResHTML() + `</div>`;
  const D = cbToday(), C = D.combos || [];
  if (!C.length) {
    const loading = ['nba', 'mlb'].some(sp => usData[sp].loading);
    return h + `<div class="pl-none">${loading ? 'Cargando NBA y MLB para armar las combinadas…' : 'Hoy no hay suficientes selecciones para armar combinadas. Mejor no forzar.'}</div></div>`;
  }
  h += CB_TIERS.map(T => { const G = C.filter(c => (c.tier || 'seg') === T.k);
    return `<div class="cb-t">${T.name} · cuota ${T.k === 'alt' ? 'mayor a 5' : T.min.toFixed(2) + ' a ' + T.max.toFixed(2)}</div>` + (G.length ? G.map((c, i) => cbCard(c, `${T.name.slice(0, -1)} ${i + 1}`)).join('') : `<div class="pl-none" style="padding:6px 0">Hoy no hay selecciones suficientes para este nivel.</div>`); }).join('');
  const est = C.some(c => c.legs.some(l => !l.real));
  h += `<div class="al-st">${D.lock ? 'Combinadas fijas de hoy.' : 'Se completan cuando carguen más partidos.'} Cada selección es de un partido distinto. ${est ? '* cuota justa del modelo (sin cuota real de la casa); juega solo si tu casa paga igual o más. ' : ''}A más cuota, más riesgo: las altas se pierden la mayoría de las veces. Ninguna probabilidad garantiza el resultado.</div></div>`;
  return h;
}
function cbCard(c, title) {
  return `<div class="cb-c"><div class="cb-hd"><b>${title}</b><span>${cbMark(c.status)} ${c.legs.length} selecciones</span></div>` +
    c.legs.map(l => { const f = fmtParts(l.when, l.sp === 'futbol' ? (LEAGUES.find(x => x.id === l.lid) || {}).utcOffset || 0 : 0);
      return `<div class="cb-l"><div><b>${escA(l.label)}${l.res === 1 ? ' ✔' : l.res === 0 ? ' ✖' : ''}</b><small>${escA(cbSpName(l))} · ${escA(l.h)} vs ${escA(l.a)} · ${f.time}</small></div><span>${l.prob}%<small>${l.odds.toFixed(2)}${l.real ? '' : '*'}</small></span></div>`; }).join('') +
    `<div class="cb-ft"><span>Prob. de acertar <b>${c.prob}%</b></span><span>Cuota <b>${c.odds.toFixed(2)}</b></span></div></div>`;
}
function cbResHTML() {
  const all = LS.get('ab_cb', {}), days = Object.keys(all).sort().reverse();
  const C = []; days.forEach(d => { const n = {}; all[d].combos.forEach(c => { const t = c.tier || 'seg'; n[t] = (n[t] || 0) + 1; C.push({d, i: n[t], c, t}); }); });
  if (!C.length) return `<div class="pl-none">Todavía no hay combinadas guardadas. El historial empieza hoy y se guarda en este celular.</div>`;
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
  ['nba', 'mlb'].forEach(sp => { const D = usData[sp]; if (!D.games.length && !D.loading && !D.err)
    Promise.resolve(usLoad(sp)).then(() => { if (viewMode === 'picks' && sport !== sp) renderMatches(); }).catch(() => {}); });
  const now = Date.now(), pend = Object.values(LS.get('ab_cb', {})).some(d => d.combos.some(c => c.status === 'p' && c.legs.some(l => l.res == null && l.ts + 3 * 3600e3 < now)));
  if (pend && !PK.busy && now - PK.last > 10 * 60e3) pkSweep().then(() => { if (viewMode === 'picks') renderMatches(); });
}

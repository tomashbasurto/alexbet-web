// AlexBet · historial oficial (corre en GitHub Actions cada 2 horas).
// 1) Abre la app sin pantalla con los mismos modelos que ven los usuarios.
// 2) Publica las sugerencias y combinadas de hoy ANTES de que empiecen los partidos (con fecha y hora; luego no se cambian).
// 3) Revisa las que ya terminaron con los resultados reales de ESPN y las marca como acertadas o falladas.
// Escribe historial.json, que la app muestra igual para todos los usuarios.
'use strict';
const fs = require('fs'), path = require('path');
const {chromium} = require('playwright');
const ROOT = __dirname, FILE = path.join(ROOT, 'historial.json');
const KEEP_DAYS = 120;

(async () => {
  let H = {v: 1, picks: [], combos: []};
  try { H = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {}
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('error en la app:', e.message));
  await page.route('**/*', async r => {
    const u = r.request().url();
    // ESPN y otras APIs: se piden desde el servidor y se entregan a la página (sin problemas de permisos del navegador)
    if (/espn\.com|the-odds-api\.com|football-data/.test(u)) {
      try {
        const resp = await fetch(u, {headers: {'User-Agent': 'Mozilla/5.0 AlexBet', 'Accept': 'application/json'}, signal: AbortSignal.timeout(30000)});
        return r.fulfill({status: resp.status, body: Buffer.from(await resp.arrayBuffer()), headers: {'content-type': resp.headers.get('content-type') || 'application/json', 'access-control-allow-origin': '*'}});
      } catch (e) { return r.abort(); }
    }
    for (const pre of ['https://alexbetpro.web.app/', 'tomashbasurto.github.io/alexbet-web/']) {
      if (u.includes(pre)) {
        const f = path.join(ROOT, (u.split(pre)[1].split('?')[0] || 'index.html'));
        return fs.existsSync(f) ? r.fulfill({path: f}) : r.fulfill({status: 404});
      }
    }
    if (/gstatic\.com\/firebasejs|fonts\.(googleapis|gstatic)/.test(u)) return r.abort();
    return r.continue();
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'AB', {get() { return window.__ab || (window.__ab = {premium: true}); }, set(v) { window.__ab = Object.assign(v || {}, {premium: true}); }});
  });
  await page.goto('https://alexbetpro.web.app/index.html');
  await page.waitForFunction(() => typeof LEAGUES !== 'undefined' && LEAGUES.some(l => l.live && l.fixtures), null, {timeout: 120000}).catch(() => console.log('fútbol no cargó a tiempo'));
  await page.evaluate(() => {
    window.publishPart = sp => {
      const now = Date.now(), day = ymd(todayDate), picks = [];
      const one = (sp, lid, h, a, when, ts, gid, k, where) => {
        if (!k || ts < now + 5 * 60e3) return;
        const mkt = sp === 'tenis' ? {t: 'tn'} : pkMkt(k.label, h, a); if (!mkt) return;
        picks.push({id: [sp, lid, h, a, when, k.label].join('|'), sp, lid, h, a, when, ts, gid: gid || null, where, label: k.label, cat: k.cat || null, prob: k.prob, odd: k.odd || null, mkt, pub: now, res: null});
      };
      if (sp === 'futbol') LEAGUES.forEach(l => (l.fixtures || []).forEach(f => {
        if (!l.teams[f[0]] || !l.teams[f[1]] || isoDateOnlyEcuador(f[2], l.utcOffset) !== day) return;
        const pk = matchPicks(l, f); if (pk && pk.picks[0]) one('futbol', l.id, f[0], f[1], f[2], pkTs(f[2], l.utcOffset), null, pk.picks[0], l.name);
      }));
      if (US[sp]) (usData[sp].games || []).forEach(g => {
        if (g.state !== 'pre' || g.postponed || isoDateOnlyEcuador(g.d, 0) !== day) return;
        const pk = usPicks(g, usPre(g)); if (pk[0]) one(sp, sp, g.h.name, g.a.name, g.d, toEcuador(g.d, 0).getTime() + 5 * 3600e3, g.id, pk[0], US[sp].name);
      });
      if (sp === 'tenis') Object.values(TN.m).forEach(m => {
        if (m.state !== 'pre' || m.off || !m.tv || isoDateOnlyEcuador(m.d, 0) !== day) return;
        const M = tnModel(m); if (M.est) return; const k = tnCands(m, M)[0];
        if (k) one('tenis', m.tour, m.p[0].name, m.p[1].name, m.d, Date.parse(m.d + ':00Z'), m.id, {...k, cat: /^Gana /.test(k.label) ? 'ml' : / set$/.test(k.label) ? 'line' : 'tot'}, TN_TOURS[m.tour].name + ' ' + m.ev);
      });
      let combos = []; try { combos = cbBuild(sp); } catch (e) {}
      return {day, picks, combos, now};
    };
  });
  await page.evaluate(async () => {
    await Promise.allSettled([usLoad('nba', true), usLoad('eul', true), usLoad('mlb', true), usLoad('ncaa', true), usLoad('nhl', true), tnLoad(true), plLoad2('nba')]);
    try { const j = await mirrorGet('elo-tenis.json'); TN.elo = {lt: Date.now(), r: j.r || {}, h2h: j.h2h || {}}; TN.cache = {}; } catch (e) {}
  });

  // ---------- 1) publicar ----------
  // cuotas reales de ESPN por deporte (las usan las sugerencias y combinadas cuando existen)
  const fresh = {picks: [], combos: {}};
  for (const sp of ['futbol', 'nba', 'eul', 'ncaa', 'mlb', 'nhl', 'tenis']) {
    const part = await page.evaluate(async sp => {
      sport = sp; if (sp !== 'tenis') { try { await vaLoad(true); } catch (e) {} }
      const r = publishPart(sp); r.cuotas = sp !== 'tenis' ? (VA.rows || []).length + ' partidos con cuota' + (VA.err ? ' (' + VA.err + ')' : '') : '-';
      return r;
    }, sp).catch(e => { console.log('fallo', sp, e.message); return {picks: [], combos: [], day: null, now: Date.now()}; });
    console.log(sp, '· cuotas ESPN:', part.cuotas, '· sugerencias hoy:', part.picks.length, '· con cuota real:', part.picks.filter(p => p.odd).length);
    fresh.picks.push(...part.picks); fresh.combos[sp] = part.combos; fresh.day = part.day || fresh.day; fresh.now = part.now;
  }
  console.log('con cuota real:', fresh.picks.filter(p => p.odd).length, 'de', fresh.picks.length);

  const have = new Set(H.picks.map(p => p.id)), newCombos = [];
  let added = 0;
  fresh.picks.forEach(p => { if (!have.has(p.id)) { H.picks.push(p); added++; } });
  // combinadas: una vez por día y deporte; se pueden completar solo si ninguna selección empezó
  for (const [sp, C] of Object.entries(fresh.combos)) {
    const cur = H.combos.filter(c => c.day === fresh.day && c.sp === sp);
    const started = cur.some(c => c.legs.some(l => l.ts <= fresh.now));
    if (!C.length || started || cur.length >= C.length) continue;
    H.combos = H.combos.filter(c => !(c.day === fresh.day && c.sp === sp));
    const first = !cur.length;
    C.forEach(c => H.combos.push({...c, day: fresh.day, sp, pub: fresh.now}));
    added += C.length;
    if (first) newCombos.push({sp, n: C.length, seg: C.filter(c => c.tier === 'seg').length, med: C.filter(c => c.tier === 'med').length, alt: C.filter(c => c.tier === 'alt').length});
  }

  // ---------- 2) resolver ----------
  const pend = H.picks.filter(p => p.res == null && p.ts + 3 * 3600e3 < Date.now() && Date.now() - p.ts < 10 * 864e5);
  const legs = []; H.combos.forEach(c => { if (c.status === 'p') c.legs.forEach(l => { if (l.res == null && l.ts + 3 * 3600e3 < Date.now()) legs.push(l); }); });
  const todo = {}; [...pend, ...legs].forEach(e => { todo[[e.sp, e.lid, e.h, e.a, e.when].join('|')] = e; });
  const results = await page.evaluate(async items => {
    const out = {};
    for (const [k, e] of Object.entries(items)) {
      try {
        if (e.sp === 'tenis') { const m = TN.m[e.gid]; if (m && m.state === 'post' && (m.p[0].winner || m.p[1].winner)) out[k] = {tn: m}; continue; }
        const r = await pkResult(e); if (r && !r.pending) out[k] = r;
      } catch (err) {}
    }
    return out;
  }, todo);
  const evalOne = async e => {
    const r = results[[e.sp, e.lid, e.h, e.a, e.when].join('|')]; if (!r) return null;
    return page.evaluate(([e, r]) => r.tn ? (tnHit(r.tn, e) == null ? null : (tnHit(r.tn, e) ? 1 : 0)) : pkEval(e.mkt, r), [e, r]);
  };
  let solved = 0;
  for (const p of pend) { const v = await evalOne(p); if (v != null) { p.res = v; p.rt = Date.now(); solved++; } }
  for (const c of H.combos) {
    if (c.status !== 'p') continue;
    for (const l of c.legs) if (l.res == null) { const v = await evalOne(l); if (v != null) l.res = v; }
    const lost = c.legs.some(l => l.res === 0), all = c.legs.every(l => l.res != null);
    if (lost) c.status = 'l'; else if (all) c.status = c.legs.every(l => l.res === 'v') ? 'v' : 'w';
    if (c.status !== 'p') { c.rt = Date.now(); solved++; }
  }
  await browser.close();

  // aviso a los celulares Premium: combinadas del día publicadas
  if (newCombos.length) {
    try {
      const P = await require('./push-send').init();
      if (P) { const N = {futbol: 'Fútbol', nba: 'NBA', eul: 'Euroliga', mlb: 'MLB', tenis: 'Tenis', ncaa: 'NCAA', nhl: 'NHL'};
        await P.notify('combinadas', 'Combinadas AlexBet de hoy', newCombos.map(x => `${N[x.sp]}: ${[x.seg && x.seg + ' de opción 1', x.med && x.med + ' de opción 2', x.alt && x.alt + ' de opción 3'].filter(Boolean).join(', ')}`).join(' · ') + '. Ábrelas en Sugerencias.', {tag: 'cb|' + fresh.day});
        console.log('push combinadas:', JSON.stringify(P.stats())); }
    } catch (e) { console.log('push:', e.message); }
  }

  // ---------- 3) limpiar y guardar ----------
  const lim = Date.now() - KEEP_DAYS * 864e5;
  H.picks = H.picks.filter(p => p.ts > lim).sort((a, b) => a.ts - b.ts);
  H.combos = H.combos.filter(c => c.ts > lim);
  H.t = Date.now();
  fs.writeFileSync(FILE, JSON.stringify(H));
  console.log(`Publicadas nuevas: ${added} · resueltas: ${solved} · total sugerencias: ${H.picks.length} · combinadas: ${H.combos.length}`);
})().catch(e => { console.error(e); process.exit(1); });

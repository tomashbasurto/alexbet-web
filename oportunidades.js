// AlexBet · Oportunidades del día (opción B) para todos los deportes, de equipos y de jugadores.
// Corre en GitHub Actions: abre la app sin pantalla (mismos modelos y datos que ven los usuarios), toma los partidos de hoy,
// lee los últimos 10 partidos de cada equipo y de cada jugador (ESPN) y guarda en oportunidades.json las líneas donde
// el modelo da 58–78% y lo que pasó coincide (al menos 6 de 10). La app solo las muestra.
'use strict';
const fs = require('fs'), path = require('path');
const {chromium} = require('playwright');
const ROOT = __dirname, FILE = path.join(ROOT, 'oportunidades.json');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({timezoneId: 'America/Guayaquil'}); // el día y las horas en Ecuador, como los usuarios
  page.on('pageerror', e => console.log('error en la app:', e.message));
  await page.route('**/*', async r => {
    const u = r.request().url();
    if (/espn\.com|football-data/.test(u)) {
      try {
        const resp = await fetch(u, {headers: {'User-Agent': 'Mozilla/5.0 AlexBet', 'Accept': 'application/json'}, signal: AbortSignal.timeout(25000)});
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

  // v49.3 · líneas reales de jugadores NBA (DraftKings vía ESPN), las mismas que copia espn-proxy.js cada 30 min
  let PROPSX = {}; try { PROPSX = JSON.parse(fs.readFileSync(path.join(ROOT, 'espn-props-nba.json'), 'utf8')).ev || {}; } catch (e) {}
  const res = await page.evaluate(async (PROPSX) => {
    // v49.4 · hoy y mañana (cada oportunidad lleva su día), para que la app también muestre las del día siguiente
    const day = ymd(todayDate), now = Date.now(), log = [], tmw = new Date(todayDate); tmw.setDate(tmw.getDate() + 1); const DAYS = [day, ymd(tmw)];
    await Promise.allSettled([usLoad('nba', true), usLoad('eul', true), usLoad('ncaa', true), usLoad('mlb', true), usLoad('nhl', true)]);
    PB.S = null; await pbLoad();
    const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    const sdOf = a => { const m = avg(a); return Math.sqrt(a.reduce((t, x) => t + (x - m) * (x - m), 0) / Math.max(1, a.length - 1)); };
    // línea más alta donde el modelo da 58–78% y lo que pasó coincide (≥6 de 10)
    const pAt = (lam, sd, ln) => { const raw = sd ? 1 - pbNorm((ln - lam) / sd) : pbPois(lam, ln); return Math.round((0.5 + (Math.min(.99, Math.max(.01, raw)) - 0.5) * 0.9) * 100); };
    // v49.3 · "Menos de": la línea más baja donde el modelo da 58–78% y lo que pasó coincide (≥6 de 10 por debajo)
    const findU = (vals, lam, sd) => {
      const top = lam + 3 * Math.max(sd || 0, Math.sqrt(lam || 1)) + 1;
      for (let ln = 0.5; ln <= top; ln += 1) {
        const p = 100 - pAt(lam, sd, ln); if (p < 58) continue; if (p > 78) return null;
        const v10 = vals.slice(0, 10), hit = v10.filter(v => v < ln).length; if (hit < 6) return null;
        return {ln, p, hit, n: v10.length, avg: +avg(v10).toFixed(2), u: 1};
      }
      return null;
    };
    const find = (vals, lam, sd) => {
      for (let ln = Math.max(0.5, Math.floor(lam + 1) - 0.5); ln >= 0.5; ln -= 1) {
        const raw = sd ? 1 - pbNorm((ln - lam) / sd) : pbPois(lam, ln), p = Math.round((0.5 + (Math.min(.99, Math.max(.01, raw)) - 0.5) * 0.9) * 100);
        if (p < 58) continue; if (p > 78) return null;
        const v10 = vals.slice(0, 10), hit = v10.filter(v => v > ln).length; if (hit < 6) return null;
        return {ln, p, hit, n: v10.length, avg: +avg(v10).toFixed(2)};
      }
      return null;
    };
    const out = [], PJC = {};
    async function summaries(list) { // [{id,url}] -> carga en PJC
      const todo = list.filter(g => g.url && !(g.id in PJC));
      for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(async g => { try { PJC[g.id] = pjParse(g.sp, await webGet(g.url)); } catch (e) { PJC[g.id] = null; } }));
    }
    // jugadores de un equipo: últimos 10 partidos (del más reciente al más viejo) -> candidatos
    function players(sp, G, ctx) {
      const M = {};
      G.forEach((g, gi) => { const E = PJC[g.id]; if (!E) return; (E[g.side] || []).forEach(p => {
        const k = p.id + '|' + p.k, x = M[k] || (M[k] = {key: k, name: p.name, pos: p.pos, kind: p.k, rows: [], st: 0}); x.rows[gi] = p.S; if (p.st) x.st++; }); });
      // básquet: dos listas por equipo
      //  · "top" (titulares): los que más anotan entre los que suelen empezar, solo en puntos, rebotes, asistencias, triples y sus combinados, con líneas reales de las casas
      //  · "alt" (suplentes): los que suelen salir del banco, en cualquier mercado, la probabilidad más alta
      const MAIN = {bask: {'Puntos': 9.5, 'Rebotes': 4.5, 'Asistencias': 3.5, 'Triples': 1.5, 'Pts+Reb+Ast': 17.5, 'Pts+Reb': 14.5, 'Pts+Ast': 14.5, 'Reb+Ast': 6.5}};
      const ptsAvg = P => { const v = P.rows.filter(Boolean).map(S => pjVal(S, ['PTS'])).filter(x => x != null); return v.length ? avg(v) : 0; };
      const bestOf = (P, lim) => {
        let best = null;
        (PJ_M[P.kind] || []).filter(([mk]) => !lim || mk in lim).forEach(([mk, comps]) => {
          const vals = P.rows.filter(Boolean).map(S => pjVal(S, comps)).filter(v => v != null); if (vals.length < 7) return;
          const lam = avg(vals.slice(0, 10)), big = lam >= 8, r = find(vals, lam, big ? Math.max(sdOf(vals.slice(0, 20)), Math.sqrt(lam)) : 0);
          if (r && lim && r.ln < lim[mk]) return;
          if (r && (!best || r.p > best.p || (r.p === best.p && r.hit > best.hit))) best = Object.assign(r, {mk, vals: vals.slice(0, 10).reverse()});
        });
        return best ? Object.assign(best, {pid: P.key, pname: P.name, pos: P.pos || ''}) : null;
      };
      const pool = Object.values(M).filter(P => P.rows.filter(Boolean).length >= 7);
      const byP = (a, b) => b.p - a.p || b.hit - a.hit;
      if (!pool.some(P => P.kind === 'bask')) return pool.map(P => bestOf(P)).filter(Boolean).sort(byP).slice(0, 3);
      // titular = empezó la mayoría de los partidos que jugó (últimos 10); suplente = el resto
      // si ESPN no marca titulares en ese torneo, se toman como titulares los 5 que más anotan
      const top5 = new Set(pool.slice().sort((a, b) => ptsAvg(b) - ptsAvg(a)).slice(0, 5).map(P => P.key));
      const isSt = pool.some(P => P.st > 0) ? (P => P.st * 2 >= P.rows.filter(Boolean).length) : (P => top5.has(P.key));
      if (sp === 'nba') return nbaPlayers(pool, isSt, ctx || {});
      const top = pool.filter(isSt).map(P => { const r = bestOf(P, MAIN.bask); return r && Object.assign(r, {role: 'top', imp: +ptsAvg(P).toFixed(1)}); }).filter(Boolean)
        .sort((a, b) => b.imp - a.imp || byP(a, b)).slice(0, 3);
      const alt = pool.filter(P => !isSt(P)).map(P => { const r = bestOf(P); return r && Object.assign(r, {role: 'alt', imp: +ptsAvg(P).toFixed(1)}); }).filter(Boolean).sort(byP).slice(0, 3);
      return top.concat(alt);
    }
    // v49.3 · NBA: toda la rotación (hasta 5 titulares y 5 suplentes por equipo), hasta 3 mercados por jugador,
    // "Más de" y "Menos de", y las líneas reales de DraftKings con su cuota (valor = el modelo da más que la cuota)
    const NBA_MK = ['Puntos', 'Rebotes', 'Asistencias', 'Triples', 'Pts+Reb+Ast', 'Pts+Reb', 'Pts+Ast', 'Reb+Ast', 'Robos', 'Tapones', 'Pérdidas', 'Robos+Tapones'];
    function nbaPlayers(pool, isSt, ctx) {
      const props = (PROPSX[ctx.gid] || {}), MAIN = {'Puntos': 9.5, 'Rebotes': 4.5, 'Asistencias': 3.5, 'Triples': 1.5, 'Pts+Reb+Ast': 17.5, 'Pts+Reb': 14.5, 'Pts+Ast': 14.5, 'Reb+Ast': 6.5};
      const COMPS = {}; (PJ_M.bask || []).forEach(([mk, c]) => COMPS[mk] = c);
      const minAvg = P => { const v = P.rows.filter(Boolean).map(S => pjVal(S, ['MIN'])).filter(x => x != null); return v.length ? avg(v) : 99; };
      const ptsAvg = P => { const v = P.rows.filter(Boolean).map(S => pjVal(S, ['PTS'])).filter(x => x != null); return v.length ? avg(v) : 0; };
      const one = (P, role) => {
        const aid = P.key.split('|')[0], dk = props[aid] || {}, C = [];
        NBA_MK.forEach(mk => {
          const vals = P.rows.filter(Boolean).map(S => pjVal(S, COMPS[mk])).filter(v => v != null); if (vals.length < 7) return;
          const v10 = vals.slice(0, 10), lam = avg(v10), sd = lam >= 8 ? Math.max(sdOf(vals.slice(0, 20)), Math.sqrt(lam)) : 0, bars = v10.slice().reverse();
          const L = dk[mk];
          if (L && L[0] != null) { // línea real de la casa: el lado que el modelo y lo que pasó apoyan
            const po = pAt(lam, sd, L[0]), ho = v10.filter(v => v > L[0]).length, hu = v10.filter(v => v < L[0]).length;
            let added = 0;
            [[po, ho, L[1], 0], [100 - po, hu, L[2], 1]].forEach(([p, hit, o, u]) => {
              if (p < 58 || p > 82 || hit < 6) return; added++;
              const c = {ln: L[0], p, hit, n: v10.length, avg: +lam.toFixed(2), mk, vals: bars, bk: 1};
              if (u) c.u = 1; if (o > 1) { c.o = o; if (p / 100 >= 1 / o + 0.10) c.vl = 1; } // valor: el modelo da 10 puntos o más que lo que paga la cuota
              C.push(c);
            });
            if (added) return;
          }
          const r = find(vals, lam, sd); if (r && (role !== 'top' || !(mk in MAIN) || r.ln >= MAIN[mk])) C.push(Object.assign(r, {mk, vals: bars}));
          const q = findU(vals, lam, sd); if (q && q.ln >= 1.5) C.push(Object.assign(q, {mk, vals: bars}));
        });
        // un lado por mercado; primero las que tienen cuota real, luego las de valor y la probabilidad
        // v49.5 · primero puntos, rebotes, asistencias, triples y combinados; robos, tapones y pérdidas como mucho 1 por jugador
        const MINOR = ['Robos', 'Tapones', 'Pérdidas', 'Robos+Tapones'];
        const sc = c => (c.bk ? 1000 : 0) + (c.vl ? 500 : 0) + (MINOR.includes(c.mk) ? 0 : 300) + c.p * 2 + c.hit, best = {};
        C.forEach(c => { if (!best[c.mk] || sc(c) > sc(best[c.mk])) best[c.mk] = c; });
        let nMin = 0;
        return Object.values(best).sort((a, b) => sc(b) - sc(a)).filter(c => !MINOR.includes(c.mk) || nMin++ < 1).slice(0, 3)
          .map(c => Object.assign(c, {pid: P.key, pname: P.name, pos: P.pos || '', role, imp: +ptsAvg(P).toFixed(1)}));
      };
      const rot = pool.filter(P => minAvg(P) >= 12);
      const top = rot.filter(isSt).sort((a, b) => ptsAvg(b) - ptsAvg(a)).slice(0, 5).flatMap(P => one(P, 'top'));
      const alt = rot.filter(P => !isSt(P)).sort((a, b) => minAvg(b) - minAvg(a)).slice(0, 5).flatMap(P => one(P, 'alt'));
      return top.concat(alt);
    }

    // ---------- fútbol ----------
    const fx = [];
    LEAGUES.forEach(l => (l.fixtures || []).forEach((f, idx) => { if (l.teams[f[0]] && l.teams[f[1]] && DAYS.includes(isoDateOnlyEcuador(f[2], l.utcOffset))) fx.push({l, f, idx}); }));
    log.push('fútbol hoy: ' + fx.length);
    for (const x of fx) {
      const [hn, an, when] = x.f, hid = pbTeamId(x.l.id, hn), aid = pbTeamId(x.l.id, an); if (!hid || !aid) continue;
      const ts = pkTs(when, x.l.utcOffset); if (ts < now) continue;
      const base = {day: isoDateOnlyEcuador(when, x.l.utcOffset), sp: 'futbol', lid: x.l.id, lname: x.l.name, color: x.l.color, h: hn, a: an, when, ts};
      // equipos (misma lógica que la sección de la app)
      const H = pbGames(hid), A = pbGames(aid), tc = [];
      OP_M.forEach(Mk => {
        if (Mk.team) [[0, hn, H, A], [1, an, A, H]].forEach(([t, nm, me, op]) => {
          const v = me.map(g => Mk.f(g.us)).filter(z => z != null).slice(0, 10), c = op.map(g => Mk.f(g.them)).filter(z => z != null).slice(0, 10); if (v.length < 8 || c.length < 5) return;
          const r = find(v, (avg(v) + avg(c)) / 2, 0); if (r) tc.push(Object.assign(r, {who: nm, t, m: Mk.m, mk: Mk.k, vals: v.slice().reverse()}));
        });
        if (Mk.tot) { const T = g => Mk.f(g.us) == null || Mk.f(g.them) == null ? null : Mk.f(g.us) + Mk.f(g.them);
          const a = H.map(T).filter(z => z != null).slice(0, 10), b = A.map(T).filter(z => z != null).slice(0, 10); if (a.length < 8 || b.length < 8) return;
          const mix = []; for (let i = 0; i < 5; i++) { mix.push(a[i]); mix.push(b[i]); }
          const r = find(mix, (avg(a) + avg(b)) / 2, 0); if (r) tc.push(Object.assign(r, {who: 'Partido', t: 2, m: Mk.m, mk: Mk.k, vals: mix.slice().reverse()})); }
      });
      tc.sort((p, q) => q.p - p.p || q.hit - p.hit).slice(0, 2).forEach(c => out.push(Object.assign({}, base, {kind: 'team'}, c)));
      // jugadores
      for (const [t, id] of [[0, hid], [1, aid]]) {
        const G = pbGames(id).slice(0, 10).map(g => { const slug = g.slug; return {id: g.id, sp: 'futbol', side: g.home ? 'h' : 'a', url: slug ? `${ESPN_BASE}/${slug}/summary?event=${g.id}` : null}; });
        await summaries(G);
        players('futbol', G).forEach(c => out.push(Object.assign({}, base, {kind: 'player', t, team: t ? an : hn}, c)));
      }
    }
    // ---------- NBA, NCAA, MLB, NHL ----------
    for (const sp of ['nba', 'eul', 'ncaa', 'mlb', 'nhl']) {
      const games = (usData[sp].games || []).filter(g => g.state === 'pre' && !g.postponed && DAYS.includes(isoDateOnlyEcuador(g.d, 0)));
      log.push(sp + ' hoy: ' + games.length);
      const list = sp === 'ncaa' ? DAYS.flatMap(d => games.filter(g => isoDateOnlyEcuador(g.d, 0) === d).slice(0, 25)) : games;
      for (const g of list) {
        await Promise.allSettled([rcTeam(sp, g.h), rcTeam(sp, g.a)]);
        const C = id => (RC.sched[sp + '|' + String(id)] || {}).all || [];
        const Hs = C(g.h.id).slice().reverse(), As = C(g.a.id).slice().reverse(); if (Hs.length < 8 || As.length < 8) continue;
        const base = {day: isoDateOnlyEcuador(g.d, 0), sp, lid: sp, lname: US[sp].name, color: US[sp].color, gid: g.id, h: g.h.name, a: g.a.name, when: g.d, ts: Date.parse(g.d + ':00Z')};
        const pts = usPts(sp), unit = US[sp].unit, tc = [];
        [[0, g.h.name, Hs, As], [1, g.a.name, As, Hs]].forEach(([t, nm, me, op]) => {
          const v = me.slice(0, 10).map(m => m.us), c = op.slice(0, 10).map(m => m.them), lam = (avg(v) + avg(c)) / 2;
          const r = find(me.map(m => m.us), lam, pts ? Math.max(sdOf(me.slice(0, 20).map(m => m.us)), Math.sqrt(lam)) : 0);
          if (r) tc.push(Object.assign(r, {who: nm, t, mk: unit, vals: v.slice().reverse()}));
        });
        { const a = Hs.slice(0, 10).map(m => m.us + m.them), b = As.slice(0, 10).map(m => m.us + m.them), mix = [];
          for (let i = 0; i < 5; i++) { mix.push(a[i]); mix.push(b[i]); }
          const lam = (avg(a) + avg(b)) / 2, r = find(mix, lam, pts ? Math.max(sdOf(a.concat(b)), Math.sqrt(lam)) : 0);
          if (r) tc.push(Object.assign(r, {who: 'Partido', t: 2, mk: unit, vals: mix.slice().reverse()})); }
        tc.sort((p, q) => q.p - p.p || q.hit - p.hit).slice(0, 2).forEach(c => out.push(Object.assign({}, base, {kind: 'team'}, c)));
        for (const [t, side, list2] of [[0, g.h, Hs], [1, g.a, As]]) {
          const G = list2.slice(0, 10).map(m => ({id: m.id, sp, side: m.home ? 'h' : 'a', url: `${US_API}/site/v2/sports/${US[sp].path}/summary?event=${m.id}`}));
          await summaries(G);
          players(sp, G, {gid: g.id}).forEach(c => out.push(Object.assign({}, base, {kind: 'player', t, team: side.name}, c)));
        }
      }
    }
    return {day, items: out, log, partidos: Object.keys(PJC).length};
  }, PROPSX);
  await browser.close();
  res.log.forEach(l => console.log(l));
  const by = {}; res.items.forEach(x => { const k = x.sp + ' ' + x.kind; by[k] = (by[k] || 0) + 1; });
  console.log('Resúmenes leídos:', res.partidos, '· oportunidades:', res.items.length, JSON.stringify(by));
  fs.writeFileSync(FILE, JSON.stringify({t: Date.now(), day: res.day, days: 2, items: res.items}));
})().catch(e => { console.error(e); process.exit(1); });

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

  const res = await page.evaluate(async () => {
    const day = ymd(todayDate), now = Date.now(), log = [];
    await Promise.allSettled([usLoad('nba', true), usLoad('eul', true), usLoad('ncaa', true), usLoad('mlb', true), usLoad('nhl', true)]);
    PB.S = null; await pbLoad();
    const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    const sdOf = a => { const m = avg(a); return Math.sqrt(a.reduce((t, x) => t + (x - m) * (x - m), 0) / Math.max(1, a.length - 1)); };
    // línea más alta donde el modelo da 58–78% y lo que pasó coincide (≥6 de 10)
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
    function players(sp, G) {
      const M = {};
      G.forEach((g, gi) => { const E = PJC[g.id]; if (!E) return; (E[g.side] || []).forEach(p => {
        const k = p.id + '|' + p.k, x = M[k] || (M[k] = {key: k, name: p.name, pos: p.pos, kind: p.k, rows: []}); x.rows[gi] = p.S; }); });
      const res = [];
      Object.values(M).forEach(P => {
        const played = P.rows.filter(Boolean).length; if (played < 7) return;
        let best = null;
        (PJ_M[P.kind] || []).forEach(([mk, comps]) => {
          const vals = P.rows.filter(Boolean).map(S => pjVal(S, comps)).filter(v => v != null); if (vals.length < 7) return;
          const lam = avg(vals.slice(0, 10)), big = lam >= 8, r = find(vals, lam, big ? Math.max(sdOf(vals.slice(0, 20)), Math.sqrt(lam)) : 0);
          if (r && (!best || r.p > best.p || (r.p === best.p && r.hit > best.hit))) best = Object.assign(r, {mk, vals: vals.slice(0, 10).reverse()});
        });
        if (best) res.push(Object.assign(best, {pid: P.key, pname: P.name, pos: P.pos || ''}));
      });
      return res.sort((a, b) => b.p - a.p || b.hit - a.hit).slice(0, 3);
    }

    // ---------- fútbol ----------
    const fx = [];
    LEAGUES.forEach(l => (l.fixtures || []).forEach((f, idx) => { if (l.teams[f[0]] && l.teams[f[1]] && isoDateOnlyEcuador(f[2], l.utcOffset) === day) fx.push({l, f, idx}); }));
    log.push('fútbol hoy: ' + fx.length);
    for (const x of fx) {
      const [hn, an, when] = x.f, hid = pbTeamId(x.l.id, hn), aid = pbTeamId(x.l.id, an); if (!hid || !aid) continue;
      const ts = pkTs(when, x.l.utcOffset); if (ts < now) continue;
      const base = {sp: 'futbol', lid: x.l.id, lname: x.l.name, color: x.l.color, h: hn, a: an, when, ts};
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
        const G = pbGames(id).slice(0, 10).map(g => { const slug = (SRC[g.lid] || {}).espn; return {id: g.id, sp: 'futbol', side: g.home ? 'h' : 'a', url: slug ? `${ESPN_BASE}/${slug}/summary?event=${g.id}` : null}; });
        await summaries(G);
        players('futbol', G).forEach(c => out.push(Object.assign({}, base, {kind: 'player', t, team: t ? an : hn}, c)));
      }
    }
    // ---------- NBA, NCAA, MLB, NHL ----------
    for (const sp of ['nba', 'eul', 'ncaa', 'mlb', 'nhl']) {
      const games = (usData[sp].games || []).filter(g => g.state === 'pre' && !g.postponed && isoDateOnlyEcuador(g.d, 0) === day);
      log.push(sp + ' hoy: ' + games.length);
      const list = sp === 'ncaa' ? games.slice(0, 25) : games;
      for (const g of list) {
        await Promise.allSettled([rcTeam(sp, g.h), rcTeam(sp, g.a)]);
        const C = id => (RC.sched[sp + '|' + String(id)] || {}).all || [];
        const Hs = C(g.h.id).slice().reverse(), As = C(g.a.id).slice().reverse(); if (Hs.length < 8 || As.length < 8) continue;
        const base = {sp, lid: sp, lname: US[sp].name, color: US[sp].color, gid: g.id, h: g.h.name, a: g.a.name, when: g.d, ts: Date.parse(g.d + ':00Z')};
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
          players(sp, G).forEach(c => out.push(Object.assign({}, base, {kind: 'player', t, team: side.name}, c)));
        }
      }
    }
    return {day, items: out, log, partidos: Object.keys(PJC).length};
  });
  await browser.close();
  res.log.forEach(l => console.log(l));
  const by = {}; res.items.forEach(x => { const k = x.sp + ' ' + x.kind; by[k] = (by[k] || 0) + 1; });
  console.log('Resúmenes leídos:', res.partidos, '· oportunidades:', res.items.length, JSON.stringify(by));
  fs.writeFileSync(FILE, JSON.stringify({t: Date.now(), day: res.day, items: res.items}));
})().catch(e => { console.error(e); process.exit(1); });

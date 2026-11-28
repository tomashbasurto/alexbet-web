// v68 · Córners: ranking de ligas y partidos próximos en las ligas con más córners.
// Prueba con 12.700 partidos (jul 2025 – nov 2026): lo que más pesa es la LIGA; la racha del equipo ayuda poco (se usa a la mitad).
// Probabilidad: total ~ normal con varianza 1.4 × esperado (calibrado: dice 62% → salió 62%; dice 72% → salió 74%).
const fs = require('fs');
const B = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
const LIGAS = {
  'sco.1': ['Premiership', 'Escocia', '🏴'], 'sco.2': ['Championship', 'Escocia', '🏴'],
  'ger.2': ['2. Bundesliga', 'Alemania', '🇩🇪'], 'ger.1': ['Bundesliga', 'Alemania', '🇩🇪'],
  'ned.2': ['Eerste Divisie', 'Países Bajos', '🇳🇱'], 'ned.1': ['Eredivisie', 'Países Bajos', '🇳🇱'],
  'nor.1': ['Eliteserien', 'Noruega', '🇳🇴'], 'swe.1': ['Allsvenskan', 'Suecia', '🇸🇪'], 'den.1': ['Superliga', 'Dinamarca', '🇩🇰'],
  'sui.1': ['Super League', 'Suiza', '🇨🇭'], 'aut.1': ['Bundesliga', 'Austria', '🇦🇹'], 'bel.1': ['Pro League', 'Bélgica', '🇧🇪'],
  'eng.1': ['Premier League', 'Inglaterra', '🏴'], 'eng.2': ['Championship', 'Inglaterra', '🏴'], 'eng.3': ['League One', 'Inglaterra', '🏴'], 'eng.4': ['League Two', 'Inglaterra', '🏴'],
  'esp.1': ['LaLiga', 'España', '🇪🇸'], 'esp.2': ['LaLiga 2', 'España', '🇪🇸'], 'ita.1': ['Serie A', 'Italia', '🇮🇹'], 'ita.2': ['Serie B', 'Italia', '🇮🇹'],
  'fra.1': ['Ligue 1', 'Francia', '🇫🇷'], 'fra.2': ['Ligue 2', 'Francia', '🇫🇷'], 'por.1': ['Liga Portugal', 'Portugal', '🇵🇹'],
  'tur.1': ['Süper Lig', 'Turquía', '🇹🇷'], 'gre.1': ['Super League', 'Grecia', '🇬🇷'],
  'mex.1': ['Liga MX', 'México', '🇲🇽'], 'usa.1': ['MLS', 'EE. UU.', '🇺🇸'], 'bra.1': ['Brasileirão', 'Brasil', '🇧🇷'], 'bra.2': ['Série B', 'Brasil', '🇧🇷'],
  'arg.1': ['Liga Profesional', 'Argentina', '🇦🇷'], 'col.1': ['Primera A', 'Colombia', '🇨🇴'], 'ecu.1': ['LigaPro', 'Ecuador', '🇪🇨'], 'chi.1': ['Primera', 'Chile', '🇨🇱'], 'per.1': ['Liga 1', 'Perú', '🇵🇪'],
  'uefa.champions': ['Champions League', 'Europa', '🇪🇺'], 'uefa.europa': ['Europa League', 'Europa', '🇪🇺'], 'uefa.europa.conf': ['Conference League', 'Europa', '🇪🇺'],
  'conmebol.libertadores': ['Libertadores', 'Sudamérica', '🌎'], 'conmebol.sudamericana': ['Sudamericana', 'Sudamérica', '🌎']
};
const CAL = l => /^(nor|swe|arg|bra|col|ecu|usa|chi|per|conmebol)\./.test(l);
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const now = new Date(), ecu = new Date(now - 5 * 3600e3);
const season = (l, d) => CAL(l) ? d.slice(0, 4) : (d.slice(5, 7) >= '07' ? d.slice(0, 4) : String(+d.slice(0, 4) - 1));
const curSeason = l => season(l, ecu.toISOString().slice(0, 10));
const months = []; for (let d = new Date(Date.UTC(ecu.getUTCFullYear() - 1, ecu.getUTCMonth(), 1)); d <= ecu; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) months.push(ymd(d).slice(0, 6));
const J = async u => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u); if (r.ok) return await r.json(); } catch (e) {} await new Promise(r => setTimeout(r, 800)); } return null; };
const nc = x => 0.5 * (1 + erf(x / Math.SQRT2));
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
const pOver = (L, lam) => 1 - nc((L - lam) / Math.sqrt(1.4 * lam));
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;

(async () => {
  const games = [], up = [], seen = new Set();
  const lids = Object.keys(LIGAS);
  for (let i = 0; i < lids.length; i += 6) await Promise.all(lids.slice(i, i + 6).map(async lid => {
    const res = await Promise.all(months.map(m => J(`${B}${lid}/scoreboard?dates=${m}&limit=500`)));
    const days = [0, 1, 2].map(k => ymd(new Date(+ecu + k * 864e5)));
    const nxt = await Promise.all(days.map(d => J(`${B}${lid}/scoreboard?dates=${d}`)));
    res.concat(nxt).forEach(j => (j && j.events || []).forEach(e => {
      const c = e.competitions[0]; if (!c || seen.has(e.id)) return; seen.add(e.id);
      const T = {}; c.competitors.forEach(t => { const st = {}; (t.statistics || []).forEach(s => st[s.name] = s.displayValue);
        T[t.homeAway] = {n: t.team.displayName, id: t.team.id, logo: t.team.logo || '', c: st.wonCorners != null ? +st.wonCorners : null}; });
      if (!T.home || !T.away) return;
      const st = c.status.type.state;
      if (st === 'post' && T.home.c != null && T.away.c != null && T.home.c + T.away.c > 0) games.push({lid, d: e.date.slice(0, 10), h: T.home, a: T.away, hc: T.home.c, ac: T.away.c});
      else if (st === 'pre' && Date.parse(e.date) > Date.now()) up.push({lid, gid: e.id, ts: Date.parse(e.date), h: T.home, a: T.away});
    }));
  }));
  games.sort((x, y) => x.d < y.d ? -1 : 1);
  // ranking de ligas: temporada actual (mín. 40 partidos)
  const ligas = [];
  for (const lid of lids) {
    const cur = games.filter(g => g.lid === lid && season(lid, g.d) === curSeason(lid)), v = cur.map(g => g.hc + g.ac);
    if (v.length < 40) continue;
    const pct = L => Math.round(v.filter(x => x > L).length / v.length * 100);
    ligas.push({lid, nombre: LIGAS[lid][0], pais: LIGAS[lid][1], flag: LIGAS[lid][2], temp: curSeason(lid), n: v.length, avg: +mean(v).toFixed(2), o85: pct(8.5), o95: pct(9.5), o105: pct(10.5), o115: pct(11.5)});
  }
  ligas.sort((a, b) => b.avg - a.avg); ligas.forEach((l, i) => l.rank = i + 1);
  // partidos próximos
  const sh = (v, prior, k = 6) => (v.reduce((s, x) => s + x, 0) + prior * k) / (v.length + k);
  const partidos = [];
  up.forEach(u => {
    const lg = games.filter(g => g.lid === u.lid), cur = lg.filter(g => season(u.lid, g.d) === curSeason(u.lid));
    const base = cur.length >= 60 ? cur : lg.slice(-Math.max(120, cur.length));
    if (base.length < 40) return;
    const lh = mean(base.map(g => g.hc)), la = mean(base.map(g => g.ac)), lgm = lh + la;
    const H = lg.filter(g => g.h.id === u.h.id).slice(-10), A = lg.filter(g => g.a.id === u.a.id).slice(-10);
    if (H.length < 3 || A.length < 3) return;
    const hf = sh(H.map(g => g.hc), lh), hag = sh(H.map(g => g.ac), la), af = sh(A.map(g => g.ac), la), aag = sh(A.map(g => g.hc), lh);
    const proj = (hf + aag) / 2 + (af + hag) / 2, lam = lgm + 0.5 * (proj - lgm);
    const eh = lh + 0.5 * ((hf + aag) / 2 - lh), ea = la + 0.5 * ((af + hag) / 2 - la);
    const p = L => Math.round(pOver(L, lam) * 100);
    const lines = [7.5, 8.5, 9.5, 10.5, 11.5].map(L => [L, p(L)]);
    partidos.push({lid: u.lid, gid: u.gid, ts: u.ts, h: u.h.n, a: u.a.n, hl: u.h.logo, al: u.a.logo, lam: +lam.toFixed(2), lgm: +lgm.toFixed(2), eh: +eh.toFixed(1), ea: +ea.toFixed(1),
      hf: +mean(H.map(g => g.hc)).toFixed(1), hc: +mean(H.map(g => g.ac)).toFixed(1), af: +mean(A.map(g => g.ac)).toFixed(1), ac: +mean(A.map(g => g.hc)).toFixed(1),
      hv: H.map(g => g.hc + g.ac), av: A.map(g => g.hc + g.ac), lines});
  });
  partidos.sort((a, b) => b.lam - a.lam);
  const out = {upd: Date.now(), ligas, partidos, nota: 'Córners por partido de ESPN. Ranking: temporada actual, mínimo 40 partidos.'};
  fs.writeFileSync('corners.json', JSON.stringify(out));
  console.log('partidos jugados', games.length, '· ligas', ligas.length, '· próximos', partidos.length);
  console.log(ligas.slice(0, 8).map(l => `${l.rank}. ${l.nombre} (${l.pais}) ${l.avg}`).join(' | '));
})();

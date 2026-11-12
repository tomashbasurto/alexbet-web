// AlexBet · copia los escudos de los equipos de las sugerencias recientes en escudos/
// Así el panel de publicaciones (publicar.html) puede dibujarlos en las imágenes para Facebook
// (las imágenes de ESPN no se pueden usar directo en un canvas).
const fs = require('fs');
const crypto = require('crypto');

const DIR = 'escudos';
const read = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const H = read('historial.json') || {picks: []};
const D = read('datos.json') || {};
const MAP = read(DIR + '/escudos.json') || {};

// nombre -> url del escudo
const url = {};
Object.entries(D.logos || {}).forEach(([n, u]) => { if (u) url[n] = u; });
Object.values(D.logosLg || {}).forEach(m => Object.entries(m || {}).forEach(([n, u]) => { if (u && !url[n]) url[n] = u; }));
// nombres cortos y alternos de cada equipo (HSV, M'gladbach…) con el escudo de su id de ESPN
Object.values(D.teamsLg || {}).forEach(L => (L || []).forEach(r => { if (!Array.isArray(r) || !r[0]) return;
  const u = `https://a.espncdn.com/i/teamlogos/soccer/500/${r[0]}.png`; r.slice(1).forEach(n => { if (typeof n === 'string' && n && !url[n]) url[n] = u; }); }));
for (const f of ['espn-nba.json', 'espn-ncaa.json', 'espn-nhl.json']) {
  const j = read(f); if (!j) continue;
  (j.boards || []).forEach(b => (b.events || []).forEach(e => ((e.competitions || [])[0] || {competitors: []}).competitors.forEach(c => {
    const t = c.team || {}; if (t.displayName && t.logo) url[t.displayName] = t.logo;
  })));
}

const desde = Date.now() - 4 * 864e5;
const nombres = new Set();
(H.picks || []).filter(p => p.ts >= desde && p.sp !== 'tenis').forEach(p => { nombres.add(p.h); nombres.add(p.a); });

async function bajar(u) {
  const m = u.match(/^https:\/\/a\.espncdn\.com(\/i\/.+\.png)$/);
  const src = m ? `https://a.espncdn.com/combiner/i?img=${m[1]}&w=160&h=160` : u;
  for (let i = 0; i < 2; i++) {
    try { const r = await fetch(src, {headers: {'User-Agent': 'Mozilla/5.0 AlexBet'}}); if (r.ok) return Buffer.from(await r.arrayBuffer()); } catch (e) {}
    await new Promise(r => setTimeout(r, 1000));
  }
  return null;
}

// fotos de los jugadores de Oportunidades (para los videos): clave "j:<id de ESPN>"
const O = read('oportunidades.json') || {items: []};
const HS = {nba: 'nba', ncaa: 'mens-college-basketball', nhl: 'nhl', futbol: 'soccer', mlb: 'mlb'};
const fotos = {};
(O.items || []).filter(x => x.kind === 'player' && x.pid && HS[x.sp]).forEach(x => { const id = String(x.pid).split('|')[0]; if (/^\d+$/.test(id)) fotos['j:' + id] = `https://a.espncdn.com/i/headshots/${HS[x.sp]}/players/full/${id}.png`; });

(async () => {
  fs.mkdirSync(DIR, {recursive: true});
  let nuevos = 0, nf = 0;
  for (const [k, u] of Object.entries(fotos)) {
    if (MAP[k] === '-' || (MAP[k] && fs.existsSync(DIR + '/' + MAP[k]))) continue;
    const f = 'j' + crypto.createHash('md5').update(u).digest('hex').slice(0, 11) + '.png';
    const r = await (async () => { for (let i = 0; i < 2; i++) { try { const x = await fetch(`https://a.espncdn.com/combiner/i?img=${u.replace('https://a.espncdn.com', '')}&w=350&h=254`, {headers: {'User-Agent': 'Mozilla/5.0 AlexBet'}}); if (x.ok) return Buffer.from(await x.arrayBuffer()); if (x.status === 404) return null; } catch (e) {} await new Promise(z => setTimeout(z, 800)); } return null; })();
    if (!r) { MAP[k] = '-'; continue; } // sin foto en ESPN: no se vuelve a intentar
    fs.writeFileSync(DIR + '/' + f, r); MAP[k] = f; nf++;
  }
  console.log('fotos de jugadores nuevas', nf);
  for (const n of nombres) {
    const u = url[n]; if (!u) continue;
    const f = crypto.createHash('md5').update(u).digest('hex').slice(0, 12) + '.png';
    if (MAP[n] === f && fs.existsSync(DIR + '/' + f)) continue;
    if (!fs.existsSync(DIR + '/' + f)) { const b = await bajar(u); if (!b) continue; fs.writeFileSync(DIR + '/' + f, b); nuevos++; }
    MAP[n] = f;
  }
  fs.writeFileSync(DIR + '/escudos.json', JSON.stringify(MAP));
  console.log('escudos: equipos', nombres.size, '· nuevos', nuevos, '· total', Object.keys(MAP).length);
})();

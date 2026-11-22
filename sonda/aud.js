// Auditoría: nombres de equipos de datos.json que no se reconocen con los de ESPN de su liga
const fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || '.';
const H = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const grab = (start, endRe) => { const i = H.indexOf(start); if (i < 0) throw new Error('no ' + start); const rest = H.slice(i); const m = rest.search(endRe); return rest.slice(0, m); };
function block(start) { const i = H.indexOf(start); let d = 0, j = H.indexOf('{', i); for (let k = j; k < H.length; k++) { if (H[k] === '{') d++; else if (H[k] === '}') { d--; if (!d) return H.slice(i, k + 1); } } }
let code = '';
code += H.split('\n').filter(l => /^var TM_STOP|^var TM_GEN/.test(l)).join('\n') + '\n';
code += block('function tmTok(') + '\n' + block('function tmCover(') + '\n' + block('function normName(') + '\n';
code += H.split('\n').find(l => l.startsWith('const TEAM_EQ')) + '\n' + block('function sameTeam(') + '\n';
code += block('const SRC = {') + ';\n'; code += H.split('\n').find(l => l.startsWith('const NAT_ES')) + '\n' + H.split('\n').find(l => l.startsWith('const NAT_URL')) + '\n' + block('function natEs(') + '\n';
const F = new Function(code + '; return {sameTeam, normName, SRC, natEs, NAT_URL};')();
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'datos.json'), 'utf8'));
const B = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
(async () => {
  const out = [];
  for (const [lid, L] of Object.entries(D.fx || {})) {
    const slug = (F.SRC[lid] || {}).espn; if (!slug) continue;
    let teams = [];
    try { const j = await (await fetch(`${B}/${slug}/teams`)).json(); teams = (((j.sports || [])[0] || {}).leagues || [])[0]?.teams?.map(t => t.team) || []; } catch (e) { out.push(`${lid}: no pude leer ESPN`); continue; }
    if (F.NAT_URL.test('/soccer/' + slug + '/')) F.natEs(teams);
    if (!teams.length) { out.push(`${lid} (${slug}): ESPN sin equipos`); continue; }
    const names = [...new Set((L.fx || []).flatMap(f => [f.h, f.a]))];
    for (const n of names) {
      const hits = teams.filter(t => F.sameTeam(t.displayName, n) || F.sameTeam(t.shortDisplayName || '', n) || F.sameTeam(t.name || '', n));
      if (!hits.length) out.push(`SIN · ${lid} · "${n}"  ·  ESPN: ${teams.map(t => t.displayName).filter(x => x[0] === n[0]).slice(0, 6).join(' | ')}`);
      else if (hits.length > 1) out.push(`DOBLE · ${lid} · "${n}" → ${hits.map(t => t.displayName).join(' | ')}`);
    }
  }
  console.log(out.join('\n') || 'todo bien'); fs.writeFileSync('auditoria.txt', out.join('\n'));
})();

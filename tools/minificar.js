// AlexBet · comprime el código de la app SOLO en la copia que se publica (lo usa firebase.yml). El repositorio queda igual.
// Si algo falla, se publica sin comprimir.
const fs = require('fs'), path = require('path'), {minify} = require('html-minifier-terser'), terser = require('terser');
const dir = process.argv[2];
const TOPT = {compress: {passes: 1, drop_debugger: false}, mangle: {toplevel: false}, format: {comments: false}, module: false};
(async () => {
  for (const f of ['index.html']) {
    const p = path.join(dir, f), s = fs.readFileSync(p, 'utf8');
    const o = await minify(s, {collapseWhitespace: true, conservativeCollapse: true, removeComments: true, minifyCSS: true, minifyJS: TOPT, keepClosingSlash: true, caseSensitive: true});
    fs.writeFileSync(p, o); console.log(f, s.length, '→', o.length);
  }
  for (const f of ['tenis.js', 'combinadas.js', 'oficial.js', 'estadisticas.js', 'oportunidades.js']) {
    const p = path.join(dir, f); if (!fs.existsSync(p)) continue; const s = fs.readFileSync(p, 'utf8');
    const r = await terser.minify(s, TOPT); if (r.code) { fs.writeFileSync(p, r.code); console.log(f, s.length, '→', r.code.length); }
  }
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });

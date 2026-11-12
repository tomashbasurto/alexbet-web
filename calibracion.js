// AlexBet · ajuste automático del modelo (corre después de historial.js, cada 2 horas).
// Compara lo que prometió el modelo con lo que pasó en las sugerencias publicadas de los últimos 45 días,
// por deporte y mercado (y por nivel: menos de 75% / 75% o más), y escribe calibracion.json.
// La app suma "off" puntos a la probabilidad de ese mercado. Se usa la probabilidad SIN el ajuste anterior (p0),
// así el ajuste no se corrige a sí mismo en círculos.
'use strict';
const fs = require('fs');
const H = JSON.parse(fs.readFileSync('historial.json', 'utf8'));
const desde = Date.now() - 45 * 864e5;
const P = (H.picks || []).filter(p => (p.res === 0 || p.res === 1) && p.ts >= desde && p.cat);
const G = {};
const add = (k, p) => { const g = G[k] = G[k] || {n: 0, hit: 0, sum: 0}; g.n++; g.hit += p.res; g.sum += (p.p0 != null ? p.p0 : p.prob); };
P.forEach(p => { const base = p.sp + '|' + p.cat; add(base, p); add(base + '|' + ((p.p0 != null ? p.p0 : p.prob) >= 75 ? 'hi' : 'lo'), p); });
const K = {};
Object.entries(G).forEach(([k, g]) => {
  if (g.n < 20) return; // muy pocas para decir algo
  const real = g.hit / g.n * 100, model = g.sum / g.n;
  // cuanto más resultados, más se confía en la diferencia; tope de ±8 puntos
  const w = g.n / (g.n + 120), off = Math.max(-8, Math.min(8, Math.round((real - model) * w)));
  K[k] = {n: g.n, real: Math.round(real * 10) / 10, model: Math.round(model * 10) / 10, off};
});
fs.writeFileSync('calibracion.json', JSON.stringify({t: Date.now(), dias: 45, n: P.length, k: K}));
console.log('calibración:', P.length, 'sugerencias ·', Object.entries(K).filter(([k]) => k.split('|').length === 2).map(([k, v]) => `${k} ${v.model}%→${v.real}% (${v.off > 0 ? '+' : ''}${v.off})`).join(' · '));

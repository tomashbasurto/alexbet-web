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
// v53: además de lo/hi (versiones viejas de la app), tres niveles: menos de 70 · 70 a 74 · 75 o más
const b3 = q => q >= 75 ? 'hi' : q >= 70 ? 'mid' : 'lo';
P.forEach(p => { const base = p.sp + '|' + p.cat, q = p.p0 != null ? p.p0 : p.prob; add(base, p); add(base + '|' + (q >= 75 ? 'hi' : 'lo'), p); add(base + '|b:' + b3(q), p); });
const K = {};
Object.entries(G).forEach(([k, g]) => {
  if (g.n < 20) return; // muy pocas para decir algo
  const real = g.hit / g.n * 100, model = g.sum / g.n;
  // cuanto más resultados, más se confía en la diferencia; tope de ±8 puntos
  // v53: se confía antes en la diferencia (40 en vez de 120) y el tope sube a ±12 puntos
  const w = g.n / (g.n + 40), off = Math.max(-12, Math.min(12, Math.round((real - model) * w)));
  // v53: si un mercado (o un nivel) acierta menos de 62% con 30 o más resultados, se pausa: deja de salir en Sugerencias.
  // Al no publicarse, sus datos salen de la ventana de 45 días y vuelve a probarse solo.
  K[k] = {n: g.n, real: Math.round(real * 10) / 10, model: Math.round(model * 10) / 10, off, ...(g.n >= 30 && real < 62 ? {cut: 1} : {})};
});
fs.writeFileSync('calibracion.json', JSON.stringify({t: Date.now(), dias: 45, n: P.length, k: K}));
console.log('calibración:', P.length, 'sugerencias ·', Object.entries(K).filter(([k]) => k.split('|').length === 2).map(([k, v]) => `${k} ${v.model}%→${v.real}% (${v.off > 0 ? '+' : ''}${v.off}${v.cut ? ' PAUSADO' : ''})`).join(' · '));

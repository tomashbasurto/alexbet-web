// v63 · Selección diaria de pronósticos oficiales: menos jugadas, las de mejor historial y con valor.
// Cada jugada se compara con su "tipo" (deporte + mercado + rango de probabilidad) en el historial ya resuelto.
const CAP_DIA = 15;                 // máximo de pronósticos oficiales por día (prueba 8–23 nov: 77% vs 75% publicando todo)
const CAP_SP = 6;                   // máximo por deporte, para no llenar el día con un solo deporte
const MIN_SEG = 66;                 // tipos que aciertan menos de esto (con 15+ resueltos) no se publican
const MIN_ODD = 1.30;               // cuota mínima cuando se conoce (real o estimada)

function kind(p) {
  let l = p.label;
  [p.h, p.a].forEach(n => { if (n) l = l.split(n).join('X'); });
  return p.sp + '|' + (p.cat || '') + '|' + l.replace(/\d+(\.\d+)?/g, 'N');
}
const band = pr => pr >= 80 ? '80+' : pr >= 75 ? '75-79' : pr >= 70 ? '70-74' : '<70';

function stats(picks, before) {
  const S = {}, add = (k, r) => { const s = S[k] || (S[k] = [0, 0]); s[0] += r; s[1]++; };
  let w = 0, n = 0;
  picks.forEach(p => {
    if (p.res !== 0 && p.res !== 1) return;
    if (before && p.ts >= before) return;
    const k = kind(p); add(k, p.res); add(k + '|' + band(p.prob), p.res);
    if (p.sp === 'futbol') add('lg|' + p.lid, p.res);
    w += p.res; n++;
  });
  return {S, g: n ? w / n * 100 : 72};
}
// % esperado de acierto del tipo de jugada (suavizado hacia el promedio cuando hay pocos datos)
function segRate(p, st) {
  const sh = (s, prior, m) => s ? (s[0] * 100 + prior * m) / (s[1] + m) : prior;
  const k = kind(p), rk = sh(st.S[k], st.g, 15), rb = sh(st.S[k + '|' + band(p.prob)], rk, 10);
  let r = rb;
  if (p.sp === 'futbol') r = 0.75 * r + 0.25 * sh(st.S['lg|' + p.lid], rk, 12);
  return r;
}
function weak(p, st) {
  const s = st.S[kind(p)], sb = st.S[kind(p) + '|' + band(p.prob)];
  if (s && s[1] >= 15 && s[0] / s[1] * 100 < MIN_SEG) return true;     // tipo flojo (ej. tenis "gana al menos un set")
  if (sb && sb[1] >= 12 && sb[0] / sb[1] * 100 < MIN_SEG - 4) return true; // rango flojo dentro de un tipo (ej. NBA menos de puntos al 70-74%)
  const o = p.odd || p.oe; if (o && o < MIN_ODD) return true;
  // v64 · NBA: la casa no se equivoca en promedio (1.237 partidos); solo se publica si hay cuota real y paga más que la probabilidad
  if (p.sp === 'nba' && !(p.odd && p.prob / 100 * p.odd >= 1.02)) return true;           // paga muy poco: sin valor
  return false;
}
function score(p, st) {
  return segRate(p, st) * 0.5 + p.prob * 0.5; // la cuota ya filtra en weak(); sumarla al puntaje bajaba el % en la prueba
}
// cand: jugadas nuevas del día; ya: las ya publicadas ese día; hist: todo el historial
function seleccionar(cand, ya, hist, before) {
  const st = stats(hist, before), n = {}, out = [];
  ya.forEach(p => { n[p.sp] = (n[p.sp] || 0) + 1; });
  let libres = CAP_DIA - ya.length;
  cand.filter(p => !weak(p, st)).map(p => ({p, s: score(p, st)})).sort((a, b) => b.s - a.s).forEach(({p, s}) => {
    if (libres <= 0 || (n[p.sp] || 0) >= CAP_SP) return;
    p.sel = Math.round(s * 10) / 10; out.push(p); n[p.sp] = (n[p.sp] || 0) + 1; libres--;
  });
  return out;
}
module.exports = {seleccionar, kind, band, stats, segRate, weak, score, CAP_DIA, CAP_SP};

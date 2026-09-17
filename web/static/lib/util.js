// Small shared helpers for clock modules.

export const TAU = Math.PI * 2;

export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const mod = (a, n) => ((a % n) + n) % n;
export const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, '0');

// Local wall-clock parts for an epoch-ms timestamp, including fractional
// progress values that make smooth animation easy.
export function timeParts(ms) {
  const d = new Date(ms);
  const h = d.getHours(), m = d.getMinutes(), s = d.getSeconds(), msec = d.getMilliseconds();
  const secOfDay = h * 3600 + m * 60 + s + msec / 1000;
  return {
    date: d, h, m, s, ms: msec,
    h12: h % 12 || 12,
    secOfDay,
    dayFrac: secOfDay / 86400,
    hourFrac: (m * 60 + s + msec / 1000) / 3600,
    minuteFrac: (s + msec / 1000) / 60,
    secondFrac: msec / 1000,
  };
}

// "HH:MM:SS" (24h) for the given ms.
export function hms(ms, sep = ':') {
  const t = timeParts(ms);
  return [t.h, t.m, t.s].map((x) => pad(x)).join(sep);
}

// Deterministic PRNG (mulberry32) so animations can be reproducible per seed.
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Font stacks that look right without any network fonts.
export const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Code", Menlo, Consolas, monospace';
export const SANS = '"Avenir Next", "Inter", "Segoe UI", system-ui, sans-serif';

// Kepler Orbits: the hands of this clock are bodies in elliptical orbits that
// obey Kepler's laws. An hour planet (12 h period), a minute planet (60 min)
// and a seconds moon (60 s) that circles the minute planet. Each body moves
// fastest at periapsis, so the dial marks sit at equal *time* intervals (equal
// mean anomaly) and bunch up where the body crawls. The coloured wedges are
// the areas swept between marks: all equal, as Kepler's second law demands.
import { TAU, timeParts, pad, rng, SANS, MONO } from '../lib/util.js';

function solveKepler(M, e) {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 10; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

// Position relative to the focus in the orbit's own frame (periapsis on +x),
// then rotated so +x points along `rot`. Positive angles are clockwise on
// screen because canvas y points down.
function orbitPoint(o, E) {
  const x = o.a * (Math.cos(E) - o.e);
  const y = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E);
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  return [x * c - y * s, x * s + y * c];
}
const pointAtM = (o, M) => orbitPoint(o, solveKepler(M, o.e));

export function create(host) {
  const surface = host.canvas();
  const { ctx } = surface;

  const r = rng(90);
  const stars = Array.from({ length: 420 }, () => ({ x: r(), y: r(), m: r() ** 3, p: r() * TAU }));

  const HOUR = { e: 0.4, color: [255, 179, 71], wedgeA: 'rgba(255, 179, 71, 0.16)', wedgeB: 'rgba(255, 120, 60, 0.07)', name: 'hour planet' };
  const MIN = { e: 0.3, color: [95, 212, 255], wedgeA: 'rgba(95, 212, 255, 0.18)', wedgeB: 'rgba(120, 140, 255, 0.08)', name: 'minute planet' };
  const SEC = { e: 0.25, color: [225, 205, 255], wedgeA: 'rgba(225, 205, 255, 0.22)', wedgeB: 'rgba(225, 205, 255, 0.08)', name: 'seconds moon' };

  const rgb = (c, a = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

  function drawOrbitPath(o, fx, fy, color, width = 1.2) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i <= 180; i++) {
      const [x, y] = orbitPoint(o, (i / 180) * TAU);
      i ? ctx.lineTo(fx + x, fy + y) : ctx.moveTo(fx + x, fy + y);
    }
    ctx.stroke();
  }

  // Filled sectors from the focus between equal steps of mean anomaly.
  function drawWedges(o, fx, fy, M, steps, def) {
    const dM = TAU / steps;
    const done = Math.floor(M / dM);
    for (let k = 0; k <= done; k++) {
      const m0 = k * dM, m1 = Math.min(M, (k + 1) * dM);
      if (m1 <= m0) continue;
      ctx.fillStyle = k % 2 ? def.wedgeB : def.wedgeA;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      const n = 24;
      for (let i = 0; i <= n; i++) {
        const [x, y] = pointAtM(o, m0 + ((m1 - m0) * i) / n);
        ctx.lineTo(fx + x, fy + y);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawTicks(o, fx, fy, count, majorEvery, labelFor, def, size, labelOffset) {
    // Outward direction measured from the ellipse centre.
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    const ecx = fx - o.a * o.e * c, ecy = fy - o.a * o.e * s;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let k = 0; k < count; k++) {
      const [x, y] = pointAtM(o, (k / count) * TAU);
      const px = fx + x, py = fy + y;
      let nx = px - ecx, ny = py - ecy;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len; ny /= len;
      const major = k % majorEvery === 0;
      const tl = major ? size * 0.9 : size * 0.4;
      ctx.strokeStyle = rgb(def.color, major ? 0.9 : 0.45);
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(px - nx * tl * 0.3, py - ny * tl * 0.3);
      ctx.lineTo(px + nx * tl, py + ny * tl);
      ctx.stroke();
      if (major && labelFor) {
        ctx.fillStyle = rgb(def.color, 0.9);
        ctx.fillText(labelFor(k), px + nx * (tl + labelOffset), py + ny * (tl + labelOffset));
      }
    }
  }

  function drawTrail(o, fx, fy, M, span, def, width) {
    const n = 40;
    for (let i = 0; i < n; i++) {
      const m0 = M - span + (span * i) / n, m1 = M - span + (span * (i + 1)) / n;
      const [x0, y0] = pointAtM(o, m0), [x1, y1] = pointAtM(o, m1);
      ctx.strokeStyle = rgb(def.color, (i / n) ** 2 * 0.9);
      ctx.lineWidth = width * (0.3 + 0.7 * (i / n));
      ctx.beginPath(); ctx.moveTo(fx + x0, fy + y0); ctx.lineTo(fx + x1, fy + y1); ctx.stroke();
    }
  }

  function drawBody(x, y, radius, def) {
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 6);
    g.addColorStop(0, rgb(def.color, 0.6));
    g.addColorStop(1, rgb(def.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, radius * 6, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    const b = ctx.createRadialGradient(x - radius * 0.4, y - radius * 0.4, radius * 0.1, x, y, radius);
    b.addColorStop(0, '#ffffff');
    b.addColorStop(0.45, rgb(def.color));
    b.addColorStop(1, rgb(def.color.map((v) => v * 0.35)));
    ctx.fillStyle = b;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
  }

  return {
    frame(now) {
      const W = surface.width, H = surface.height;
      const t = timeParts(now);
      const portrait = H > W;

      ctx.fillStyle = '#03040a';
      ctx.fillRect(0, 0, W, H);
      const neb = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.7);
      neb.addColorStop(0, 'rgba(40, 30, 70, 0.35)');
      neb.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = neb;
      ctx.fillRect(0, 0, W, H);
      for (const s of stars) {
        const a = 0.15 + 0.55 * s.m * (0.75 + 0.25 * Math.sin(now / 900 + s.p));
        ctx.fillStyle = `rgba(210, 220, 255, ${a})`;
        ctx.fillRect(s.x * W, s.y * H, 1 + s.m * 1.5, 1 + s.m * 1.5);
      }

      // Geometry: the hour orbit's long axis follows the long side of the screen.
      const eH = HOUR.e;
      const bFactor = Math.sqrt(1 - eH * eH);
      const long = (portrait ? H : W) * 0.4, short = (portrait ? W : H) * 0.37;
      const aH = Math.min(long, short / bFactor);
      const rotH = portrait ? -Math.PI / 2 : Math.PI; // periapsis to the left (landscape) or top (portrait)
      const hourOrbit = { a: aH, e: eH, rot: rotH };
      // Focus sits a·e from the ellipse centre toward periapsis.
      const fx = W / 2 + aH * eH * Math.cos(rotH);
      const fy = H / 2 + aH * eH * Math.sin(rotH) + (portrait ? 0 : H * 0.02);
      const minOrbit = { a: aH * 0.42, e: MIN.e, rot: rotH + (portrait ? 2.2 : 2.3) };
      const secOrbit = { a: aH * 0.12, e: SEC.e, rot: -Math.PI / 2 };

      const U = aH / 500; // size unit

      // Mean anomalies (periapsis passage at 12:00, :00, :00).
      const Mh = (((t.h % 12) + t.hourFrac) / 12) * TAU;
      const Mm = t.hourFrac * TAU;
      const Ms = t.minuteFrac * TAU;

      // Hour orbit
      drawWedges(hourOrbit, fx, fy, Mh, 12, HOUR);
      drawOrbitPath(hourOrbit, fx, fy, rgb(HOUR.color, 0.35), 1.4 * U + 0.4);
      ctx.font = `600 ${Math.max(12, 26 * U)}px ${SANS}`;
      drawTicks(hourOrbit, fx, fy, 60, 5, (k) => String(k / 5 || 12), HOUR, 16 * U, 22 * U);

      // Line of apsides and the empty focus
      {
        const c = Math.cos(rotH), s = Math.sin(rotH);
        const peri = aH * (1 - eH), apo = aH * (1 + eH);
        ctx.setLineDash([6 * U, 8 * U]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(fx + c * peri, fy + s * peri);
        ctx.lineTo(fx - c * apo, fy - s * apo);
        ctx.stroke();
        ctx.setLineDash([]);
        const ex = fx - c * 2 * aH * eH, ey = fy - s * 2 * aH * eH;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        const k = 6 * U;
        ctx.beginPath();
        ctx.moveTo(ex - k, ey); ctx.lineTo(ex + k, ey);
        ctx.moveTo(ex, ey - k); ctx.lineTo(ex, ey + k);
        ctx.stroke();
        ctx.font = `${Math.max(10, 14 * U)}px ${MONO}`;
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.textAlign = 'center';
        ctx.fillText('empty focus', ex, ey + 20 * U);
        ctx.fillText('periapsis', fx + c * (peri + 70 * U), fy + s * (peri + 70 * U) + (portrait ? 0 : 26 * U));
        ctx.fillText('apoapsis', fx - c * (apo + 70 * U), fy - s * (apo + 70 * U) + (portrait ? 0 : 26 * U));
      }

      // Minute orbit
      drawWedges(minOrbit, fx, fy, Mm, 12, MIN);
      drawOrbitPath(minOrbit, fx, fy, rgb(MIN.color, 0.4), 1.2 * U + 0.4);
      ctx.font = `600 ${Math.max(10, 17 * U)}px ${MONO}`;
      drawTicks(minOrbit, fx, fy, 60, 5, (k) => pad(k), MIN, 10 * U, 16 * U);

      // Star at the focus
      {
        const pulse = 1 + 0.04 * Math.sin(now / 700);
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 120 * U * pulse);
        g.addColorStop(0, 'rgba(255, 250, 230, 1)');
        g.addColorStop(0.12, 'rgba(255, 220, 140, 0.8)');
        g.addColorStop(0.4, 'rgba(255, 150, 60, 0.18)');
        g.addColorStop(1, 'rgba(255, 120, 40, 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(fx, fy, 120 * U * pulse, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#fffaf0';
        ctx.beginPath(); ctx.arc(fx, fy, 11 * U, 0, TAU); ctx.fill();
      }

      // Hour planet
      const [hx, hy] = pointAtM(hourOrbit, Mh);
      drawTrail(hourOrbit, fx, fy, Mh, 0.5, HOUR, 5 * U);
      drawBody(fx + hx, fy + hy, 17 * U, HOUR);

      // Minute planet + seconds moon
      const [mx, my] = pointAtM(minOrbit, Mm);
      const px = fx + mx, py = fy + my;
      drawTrail(minOrbit, fx, fy, Mm, 0.9, MIN, 4 * U);
      drawWedges(secOrbit, px, py, Ms, 12, SEC);
      drawOrbitPath(secOrbit, px, py, rgb(SEC.color, 0.35), 1);
      drawTicks(secOrbit, px, py, 12, 3, null, SEC, 5 * U, 0);
      drawBody(px, py, 12 * U, MIN);
      const [sx, sy] = pointAtM(secOrbit, Ms);
      drawTrail(secOrbit, px, py, Ms, 1.4, SEC, 2.5 * U);
      drawBody(px + sx, py + sy, 5.5 * U, SEC);

      // Radius vectors (the lines that sweep the areas)
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgb(HOUR.color, 0.35);
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + hx, fy + hy); ctx.stroke();
      ctx.strokeStyle = rgb(MIN.color, 0.35);
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(px, py); ctx.stroke();

      // Readout
      const base = Math.max(12, Math.min(W, H) * 0.02);
      const margin = Math.max(20, Math.min(W, H) * 0.035);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `200 ${base * 3}px ${SANS}`;
      ctx.fillStyle = 'rgba(245, 240, 230, 0.92)';
      ctx.fillText(`${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`, W - margin, H - margin - base * 3.6);
      ctx.font = `${base}px ${MONO}`;
      const speeds = (o, periodS) => {
        // v ∝ sqrt((1+e)/(1-e)) ratio between periapsis and apoapsis speed.
        return ((1 + o.e) / (1 - o.e)).toFixed(2);
      };
      const lines = [
        [`hour planet   e=${HOUR.e.toFixed(2)}  v_peri/v_apo=${speeds(hourOrbit)}`, rgb(HOUR.color, 0.8)],
        [`minute planet e=${MIN.e.toFixed(2)}  v_peri/v_apo=${speeds(minOrbit)}`, rgb(MIN.color, 0.8)],
        [`seconds moon  e=${SEC.e.toFixed(2)}  v_peri/v_apo=${speeds(secOrbit)}`, rgb(SEC.color, 0.8)],
      ];
      lines.forEach(([txt, col], i) => {
        ctx.fillStyle = col;
        ctx.fillText(txt, W - margin, H - margin - base * (2.4 - i * 1.25) + base * 0.2);
      });
    },
  };
}

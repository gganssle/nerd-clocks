// Hilbert Day: the 86,400 seconds of a day laid along an order-8 Hilbert curve
// (256 x 256 = 65,536 cells, 1.318 s per cell). The curve snakes through every
// cell of the square without crossing itself, and times that are close
// together always land close together in space.
import { TAU, timeParts, pad, clamp, SANS, MONO } from '../lib/util.js';

const ORDER = 8;
const N = 1 << ORDER; // cells per side
const CELLS = N * N;
const SEC_PER_CELL = 86400 / CELLS;

// Classic Hilbert index -> (x, y) conversion.
function d2xy(n, d) {
  let x = 0, y = 0, t = d;
  for (let s = 1; s < n; s *= 2) {
    const rx = 1 & (t >> 1);
    const ry = 1 & (t ^ rx);
    if (ry === 0) {
      if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
      const tmp = x; x = y; y = tmp;
    }
    x += s * rx;
    y += s * ry;
    t >>= 2;
  }
  return [x, y];
}

const CX = new Uint8Array(CELLS), CY = new Uint8Array(CELLS);
for (let d = 0; d < CELLS; d++) {
  const [x, y] = d2xy(N, d);
  CX[d] = x; CY[d] = N - 1 - y; // flip so midnight starts bottom-left
}

const hourOfCell = (d) => Math.floor((d * SEC_PER_CELL) / 3600);
const hueOf = (h) => (205 + h * 15) % 360;
const hourColor = (h, l = 62, a = 1) => `hsla(${hueOf(h)}, 85%, ${l}%, ${a})`;

// Centroid of each hour's region, for labels.
const CENTROIDS = Array.from({ length: 24 }, () => [0, 0, 0]);
for (let d = 0; d < CELLS; d++) {
  const c = CENTROIDS[hourOfCell(d)];
  c[0] += CX[d]; c[1] += CY[d]; c[2]++;
}
for (const c of CENTROIDS) { c[0] = c[0] / c[2] + 0.5; c[1] = c[1] / c[2] + 0.5; }

export function create(host) {
  const surface = host.canvas();
  const { ctx } = surface;

  let layout = null;
  let faint = null;   // whole curve, dim
  let bright = null;  // elapsed portion, drawn incrementally
  let drawnUpTo = -1;

  function makeLayer(size, dpr) {
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
  }

  function computeLayout(W, H) {
    const landscape = W >= H * 1.15;
    let S, sx, sy, panel;
    if (landscape) {
      const P = clamp(W * 0.27, 300, 560);
      S = Math.min(H * 0.84, W - P - W * 0.12);
      const gap = W * 0.04;
      const total = S + gap + P;
      sx = (W - total) / 2 + W * 0.02;
      sy = (H - S) / 2;
      panel = { x: sx + S + gap, y: sy + S * 0.18, w: P, h: S * 0.8 };
    } else {
      S = Math.min(W * 0.88, H * 0.58);
      sx = (W - S) / 2;
      sy = H * 0.1;
      const P = Math.min(W * 0.84, 620);
      panel = { x: (W - P) / 2, y: sy + S + H * 0.04, w: P, h: H - (sy + S) - H * 0.08 };
    }
    return { W, H, S, sx, sy, panel, dpr: surface.dpr, cell: S / N };
  }

  function buildLayers() {
    const { S, dpr, cell } = layout;
    faint = makeLayer(S, dpr);
    const g = faint.getContext('2d');
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = Math.max(0.6, cell * 0.42);
    // one path per hour so each gets its tint
    for (let h = 0; h < 24; h++) {
      g.strokeStyle = hourColor(h, 55, 0.16);
      g.beginPath();
      const d0 = Math.ceil((h * 3600) / SEC_PER_CELL), d1 = Math.min(CELLS - 1, Math.ceil(((h + 1) * 3600) / SEC_PER_CELL));
      g.moveTo((CX[d0] + 0.5) * cell, (CY[d0] + 0.5) * cell);
      for (let d = d0 + 1; d <= d1; d++) g.lineTo((CX[d] + 0.5) * cell, (CY[d] + 0.5) * cell);
      g.stroke();
    }
    bright = makeLayer(S, dpr);
    drawnUpTo = -1;
  }

  // Extend the bright layer to include cells [drawnUpTo+1 .. upTo].
  function extendBright(upTo) {
    const { cell } = layout;
    const g = bright.getContext('2d');
    if (upTo < drawnUpTo) {
      g.clearRect(0, 0, layout.S, layout.S);
      drawnUpTo = -1;
    }
    if (upTo === drawnUpTo) return;
    const start = Math.max(0, drawnUpTo);
    // territory fill
    let h = -1;
    for (let d = drawnUpTo + 1; d <= upTo; d++) {
      const hh = hourOfCell(d);
      if (hh !== h) { h = hh; g.fillStyle = hourColor(h, 45, 0.16); }
      g.fillRect(CX[d] * cell, CY[d] * cell, cell + 0.05, cell + 0.05);
    }
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = Math.max(0.8, cell * 0.5);
    h = hourOfCell(start);
    g.strokeStyle = hourColor(h, 64, 0.95);
    g.beginPath();
    g.moveTo((CX[start] + 0.5) * cell, (CY[start] + 0.5) * cell);
    for (let d = start + 1; d <= upTo; d++) {
      const hh = hourOfCell(d);
      g.lineTo((CX[d] + 0.5) * cell, (CY[d] + 0.5) * cell);
      if (hh !== h) {
        g.stroke();
        h = hh;
        g.strokeStyle = hourColor(h, 64, 0.95);
        g.beginPath();
        g.moveTo((CX[d] + 0.5) * cell, (CY[d] + 0.5) * cell);
      }
    }
    g.stroke();
    drawnUpTo = upTo;
  }

  return {
    frame(now) {
      const W = surface.width, H = surface.height;
      if (!layout || layout.W !== W || layout.H !== H || layout.dpr !== surface.dpr) {
        layout = computeLayout(W, H);
        buildLayers();
      }
      const { S, sx, sy, cell, panel } = layout;
      const t = timeParts(now);
      const u = t.secOfDay / SEC_PER_CELL;
      const k = Math.min(CELLS - 1, Math.floor(u));
      const frac = u - k;

      ctx.fillStyle = '#05060b';
      ctx.fillRect(0, 0, W, H);
      const bg = ctx.createRadialGradient(sx + S / 2, sy + S / 2, 0, sx + S / 2, sy + S / 2, S);
      bg.addColorStop(0, hourColor(t.h, 30, 0.10));
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      extendBright(k);
      ctx.drawImage(faint, sx, sy, S, S);
      ctx.drawImage(bright, sx, sy, S, S);

      // frame
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx - 6.5, sy - 6.5, S + 13, S + 13);

      const px = (d) => sx + (CX[d] + 0.5) * cell;
      const py = (d) => sy + (CY[d] + 0.5) * cell;
      const k2 = Math.min(CELLS - 1, k + 1);
      const hx = px(k) + (px(k2) - px(k)) * frac;
      const hy = py(k) + (py(k2) - py(k)) * frac;

      // nested quadrants containing the head: the base-4 "address"
      const digits = [];
      for (let lvl = 1; lvl <= 4; lvl++) {
        const size = N >> lvl;
        const qx = Math.floor(CX[k] / size) * size, qy = Math.floor(CY[k] / size) * size;
        ctx.strokeStyle = `rgba(255,255,255,${0.32 - lvl * 0.05})`;
        ctx.setLineDash(lvl === 1 ? [] : [4, 5]);
        ctx.strokeRect(sx + qx * cell + 0.5, sy + qy * cell + 0.5, size * cell - 1, size * cell - 1);
      }
      ctx.setLineDash([]);
      for (let lvl = ORDER - 1; lvl >= 0; lvl--) digits.push((k >> (2 * lvl)) & 3);

      // hour labels
      const fs = clamp(S * 0.022, 10, 22);
      ctx.font = `500 ${fs}px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let h = 0; h < 24; h++) {
        const [cxh, cyh] = CENTROIDS[h];
        const x = sx + cxh * cell, y = sy + cyh * cell;
        const past = h < t.h, cur = h === t.h;
        ctx.fillStyle = 'rgba(5,6,11,0.55)';
        ctx.beginPath();
        ctx.roundRect(x - fs * 1.05, y - fs * 0.72, fs * 2.1, fs * 1.44, fs * 0.4);
        ctx.fill();
        ctx.fillStyle = cur ? '#fff' : past ? hourColor(h, 75, 0.95) : 'rgba(200,205,220,0.35)';
        ctx.fillText(pad(h), x, y + 1);
      }

      // trail: last ~2 minutes brighter
      const trail = 28;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'lighter';
      for (let i = Math.max(0, k - trail); i < k; i++) {
        const a = (i - (k - trail)) / trail;
        ctx.strokeStyle = `rgba(255,255,255,${a * a * 0.9})`;
        ctx.lineWidth = Math.max(1, cell * 0.55);
        ctx.beginPath();
        ctx.moveTo(px(i), py(i));
        ctx.lineTo(px(i + 1), py(i + 1));
        ctx.stroke();
      }
      ctx.strokeStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(px(k), py(k)); ctx.lineTo(hx, hy); ctx.stroke();

      const pulse = 0.75 + 0.25 * Math.sin(now / 1000 * TAU);
      const gr = Math.max(18, S * 0.05) * pulse;
      const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, gr);
      glow.addColorStop(0, 'rgba(255,255,255,0.95)');
      glow.addColorStop(0.15, hourColor(t.h, 70, 0.8));
      glow.addColorStop(1, hourColor(t.h, 50, 0));
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(hx, hy, gr, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(hx, hy, Math.max(2.5, cell * 0.9), 0, TAU); ctx.fill();

      // ---- panel ----
      const { x: PX, w: PW } = panel;
      let y = panel.y;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const big = clamp(PW * 0.2, 36, 110);
      ctx.font = `200 ${big}px ${SANS}`;
      ctx.fillStyle = 'rgba(240,244,255,0.95)';
      y += big;
      ctx.fillText(`${pad(t.h)}:${pad(t.m)}`, PX, y);
      const hmW = ctx.measureText(`${pad(t.h)}:${pad(t.m)}`).width;
      ctx.font = `200 ${big * 0.5}px ${SANS}`;
      ctx.fillStyle = hourColor(t.h, 70, 0.9);
      ctx.fillText(`:${pad(t.s)}`, PX + hmW + 4, y);

      const small = clamp(PW * 0.036, 11, 18);
      ctx.font = `${small}px ${MONO}`;
      y += small * 2.4;
      ctx.fillStyle = 'rgba(200,206,222,0.8)';
      ctx.fillText(`cell ${(k + 1).toLocaleString('en-US')} of 65,536`, PX, y);
      y += small * 1.6;
      ctx.fillStyle = 'rgba(160,166,184,0.65)';
      ctx.fillText(`(x, y) = (${CX[k]}, ${CY[k]})  ·  1 cell = 1.318 s`, PX, y);
      y += small * 1.6;
      ctx.fillText('base-4 address  ', PX, y);
      const lw = ctx.measureText('base-4 address  ').width;
      digits.forEach((dg, i) => {
        ctx.fillStyle = i < 4 ? `rgba(255,255,255,${0.95 - i * 0.12})` : 'rgba(160,166,184,0.55)';
        ctx.fillText(String(dg), PX + lw + i * small * 0.95, y);
      });

      // linear timeline with the same colours
      y += small * 3.2;
      const barH = clamp(PW * 0.05, 12, 26);
      ctx.font = `${small * 0.85}px ${MONO}`;
      ctx.fillStyle = 'rgba(160,166,184,0.7)';
      ctx.fillText('the same day, unrolled', PX, y - barH * 0.7);
      for (let h = 0; h < 24; h++) {
        const x0 = PX + (h / 24) * PW;
        ctx.fillStyle = h < t.h ? hourColor(h, 55, 0.9) : h === t.h ? hourColor(h, 55, 0.45) : hourColor(h, 50, 0.13);
        ctx.fillRect(x0 + 0.5, y, PW / 24 - 1, barH);
      }
      const mx = PX + t.dayFrac * PW;
      ctx.fillStyle = hourColor(t.h, 55, 0.9);
      ctx.fillRect(PX + (t.h / 24) * PW + 0.5, y, mx - (PX + (t.h / 24) * PW), barH);
      ctx.fillStyle = '#fff';
      ctx.fillRect(mx - 1, y - 5, 2, barH + 10);
      ctx.fillStyle = 'rgba(160,166,184,0.6)';
      ctx.textAlign = 'center';
      for (const h of [0, 6, 12, 18, 24]) ctx.fillText(pad(h), PX + (h / 24) * PW, y + barH + small * 1.3);

      y += barH + small * 3.4;
      ctx.textAlign = 'left';
      ctx.font = `${small * 0.95}px ${SANS}`;
      ctx.fillStyle = 'rgba(170,176,194,0.7)';
      const lines = [
        'Close in time is close in space:',
        'each hour fills a compact patch,',
        'each quarter-day a quadrant.',
      ];
      for (const line of lines) { ctx.fillText(line, PX, y); y += small * 1.45; }
    },
  };
}

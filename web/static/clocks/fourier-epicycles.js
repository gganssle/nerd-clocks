// Fourier Epicycles: the current HH:MM, drawn by a chain of spinning circles.
// The digits are joined into one closed curve, sampled at N points, and turned
// into N rotating vectors by a discrete Fourier transform.
import { TAU, timeParts, pad, clamp, easeInOut, SANS, MONO } from '../lib/util.js';
import { strokeText } from '../lib/glyphs.js';

const N = 1024;          // samples along the closed path (and number of frequencies)
const K = 320;           // epicycles actually drawn
const PERIOD = 10000;    // ms per revolution
const MORPH = 2500;      // ms to morph between minutes

// Build one closed path through every stroke of `text`, resampled uniformly by
// arc length. Returns {re, im, pen} with pen[j] = false on travel segments.
function samplePath(text) {
  const { lines, width, height } = strokeText(text, { tracking: 0.5, step: 0.02 });
  const pts = []; // [x, y, drawn]
  lines.forEach((pl) => {
    pl.forEach(([x, y], i) => pts.push([x - width / 2, y - height / 2, i > 0]));
  });
  // closing travel back to the start is implied by the wrap-around
  const segLen = [];
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segLen.push(L);
    total += L;
  }
  const re = new Float64Array(N), im = new Float64Array(N), pen = new Uint8Array(N);
  let seg = 0, acc = 0;
  for (let j = 0; j < N; j++) {
    const target = (j / N) * total;
    while (acc + segLen[seg] < target && seg < pts.length - 1) { acc += segLen[seg]; seg++; }
    const a = pts[seg], b = pts[(seg + 1) % pts.length];
    const u = segLen[seg] > 0 ? (target - acc) / segLen[seg] : 0;
    re[j] = a[0] + (b[0] - a[0]) * u;
    im[j] = a[1] + (b[1] - a[1]) * u;
    pen[j] = b[2] ? 1 : 0; // the segment ending at b is drawn if b continues a stroke
  }
  return { re, im, pen, width, height };
}

// Plain O(N²) DFT; runs once a minute. Coefficients indexed by frequency slot
// s in [0, N) meaning k = s < N/2 ? s : s - N.
function dft({ re, im }) {
  const cr = new Float64Array(N), ci = new Float64Array(N);
  const cos = new Float64Array(N), sin = new Float64Array(N);
  for (let s = 0; s < N; s++) {
    const k = s < N / 2 ? s : s - N;
    for (let n = 0; n < N; n++) { const a = (-TAU * k * n) / N; cos[n] = Math.cos(a); sin[n] = Math.sin(a); }
    let sr = 0, si = 0;
    for (let n = 0; n < N; n++) {
      sr += re[n] * cos[n] - im[n] * sin[n];
      si += re[n] * sin[n] + im[n] * cos[n];
    }
    cr[s] = sr / N; ci[s] = si / N;
  }
  return { cr, ci };
}

const freqOf = (s) => (s < N / 2 ? s : s - N);

export function create(host) {
  const surf = host.canvas();
  const { ctx } = surf;
  const cache = new Map(); // text -> {coef, pen, width}

  function shape(text) {
    if (!cache.has(text)) {
      const path = samplePath(text);
      cache.set(text, { coef: dft(path), pen: path.pen, width: path.width });
      if (cache.size > 4) cache.delete(cache.keys().next().value);
    }
    return cache.get(text);
  }

  let current = null;  // text shown
  let previous = null; // text morphing from
  let morphStart = 0;

  const curveX = new Float64Array(N), curveY = new Float64Array(N);
  let curveKey = '';
  let order = [];
  const termsR = new Float64Array(N), termsI = new Float64Array(N);

  return {
    frame(now) {
      const W = surf.width, H = surf.height;
      const t = timeParts(now);
      const text = `${pad(t.h)}:${pad(t.m)}`;
      if (text !== current) {
        previous = current;
        current = text;
        morphStart = now;
      }
      const target = shape(current);
      const mix = previous ? easeInOut(clamp((now - morphStart) / MORPH, 0, 1)) : 1;
      if (mix >= 1) previous = null;
      const source = previous ? shape(previous) : target;

      const pen = mix < 0.5 ? source.pen : target.pen;
      const width = source.width + (target.width - source.width) * mix;

      const key = previous ? `${previous}>${current}@${mix.toFixed(3)}` : current;
      if (key !== curveKey) {
      curveKey = key;
      for (let s = 0; s < N; s++) {
        termsR[s] = source.coef.cr[s] + (target.coef.cr[s] - source.coef.cr[s]) * mix;
        termsI[s] = source.coef.ci[s] + (target.coef.ci[s] - source.coef.ci[s]) * mix;
      }
      order = Array.from({ length: N }, (_, s) => s)
        .sort((a, b) => termsR[b] ** 2 + termsI[b] ** 2 - (termsR[a] ** 2 + termsI[a] ** 2))
        .slice(0, K);

      // Reconstruct the whole curve with K terms (what the pen will draw).
      for (let j = 0; j < N; j++) {
        let x = 0, y = 0;
        const phase = (TAU * j) / N;
        for (const s of order) {
          const a = freqOf(s) * phase;
          const c = Math.cos(a), sn = Math.sin(a);
          x += termsR[s] * c - termsI[s] * sn;
          y += termsR[s] * sn + termsI[s] * c;
        }
        curveX[j] = x; curveY[j] = y;
      }
      }

      const scale = Math.min((W * 0.8) / width, (H * 0.42) / 2);
      const ox = W / 2, oy = H * 0.47;

      // background
      ctx.fillStyle = '#03040b';
      ctx.fillRect(0, 0, W, H);
      const bg = ctx.createRadialGradient(ox, oy, 0, ox, oy, Math.max(W, H) * 0.65);
      bg.addColorStop(0, 'rgba(30, 50, 110, 0.28)');
      bg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      const phase = ((now % PERIOD) + PERIOD) % PERIOD / PERIOD;
      const head = phase * N;
      const headIdx = Math.floor(head);

      // trail: fading behind the pen for one revolution
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'lighter';
      const trailW = Math.max(2, scale * 0.045);
      const BANDS = 24;
      for (let band = 0; band < BANDS; band++) {
        const age = (band + 0.5) / BANDS;
        const fresh = 1 - age;
        for (const drawn of [0, 1]) {
          const alpha = (drawn ? 0.95 : 0.05) * Math.pow(fresh, 0.6);
          if (alpha < 0.01) continue;
          ctx.strokeStyle = `rgba(${Math.round(120 + 135 * fresh)}, ${Math.round(220 + 35 * fresh)}, 255, ${alpha})`;
          ctx.lineWidth = trailW * (drawn ? 1 : 0.5);
          ctx.beginPath();
          const b0 = Math.max(1, Math.floor((band / BANDS) * N)), b1 = Math.floor(((band + 1) / BANDS) * N);
          let open = false;
          for (let back = Math.min(b1 - 1, N - 1); back >= b0; back--) {
            const j = (headIdx - back + N) % N;
            const j2 = (j + 1) % N;
            if (pen[j2] !== drawn) { open = false; continue; }
            if (!open) ctx.moveTo(ox + curveX[j] * scale, oy + curveY[j] * scale);
            ctx.lineTo(ox + curveX[j2] * scale, oy + curveY[j2] * scale);
            open = true;
          }
          ctx.stroke();
        }
      }
      // soft halo pass on the freshest part
      ctx.strokeStyle = 'rgba(90, 170, 255, 0.10)';
      ctx.lineWidth = trailW * 5;
      ctx.beginPath();
      for (let back = 0; back < N * 0.35; back++) {
        const j = (headIdx - back + N) % N;
        const x = ox + curveX[j] * scale, y = oy + curveY[j] * scale;
        if (!pen[(j + 1) % N]) { ctx.stroke(); ctx.beginPath(); continue; }
        back === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';

      // epicycle chain at the exact head phase
      const ang = TAU * phase;
      let x = ox, y = oy;
      for (let i = 0; i < order.length; i++) {
        const s = order[i];
        const a = freqOf(s) * ang;
        const c = Math.cos(a), sn = Math.sin(a);
        const dx = (termsR[s] * c - termsI[s] * sn) * scale;
        const dy = (termsR[s] * sn + termsI[s] * c) * scale;
        const r = Math.hypot(dx, dy);
        const fade = 1 - i / order.length;
        if (r > 1.2 && i < 90) {
          ctx.strokeStyle = `rgba(140, 160, 255, ${0.07 + 0.33 * fade * fade})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
        }
        ctx.strokeStyle = `rgba(255, ${Math.round(190 + 50 * fade)}, 120, ${0.35 + 0.65 * fade})`;
        ctx.lineWidth = Math.max(1, 3.2 * fade);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
        x += dx; y += dy;
      }
      // pen tip
      const tip = ctx.createRadialGradient(x, y, 0, x, y, trailW * 6);
      tip.addColorStop(0, 'rgba(255,255,255,1)');
      tip.addColorStop(0.3, 'rgba(150,220,255,0.6)');
      tip.addColorStop(1, 'rgba(80,150,255,0)');
      ctx.fillStyle = tip;
      ctx.beginPath(); ctx.arc(x, y, trailW * 6, 0, TAU); ctx.fill();

      // seconds rule
      const ruleW = Math.min(W * 0.62, 1100), rx = W / 2 - ruleW / 2, ry = H * 0.84;
      for (let i = 0; i <= 60; i++) {
        const px = rx + (i / 60) * ruleW;
        const h = i % 15 === 0 ? 14 : i % 5 === 0 ? 8 : 4;
        ctx.fillStyle = i <= t.s ? 'rgba(170, 210, 255, 0.55)' : 'rgba(255,255,255,0.13)';
        ctx.fillRect(px - 0.75, ry - h / 2, 1.5, h);
      }
      const sx = rx + (t.minuteFrac) * ruleW;
      const sg = ctx.createRadialGradient(sx, ry, 0, sx, ry, 18);
      sg.addColorStop(0, 'rgba(255,255,255,0.95)');
      sg.addColorStop(1, 'rgba(120,180,255,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(sx, ry, 18, 0, TAU); ctx.fill();

      const fs = Math.max(12, Math.min(W, H) * 0.02);
      ctx.font = `${fs}px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(200, 215, 255, 0.6)';
      ctx.fillText(`${text}:${pad(t.s)}   ·   ${K} of ${N} terms   ·   one turn every ${PERIOD / 1000} s`, W / 2, ry + 22);
    },
  };
}

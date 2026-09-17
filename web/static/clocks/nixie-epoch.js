// Nixie Epoch: the Unix timestamp on cold-cathode Nixie tubes, with its 32-bit
// binary on neon lamps, a hex VFD readout and the countdown to the moment a
// signed 32-bit time_t overflows (2038-01-19 03:14:08 UTC).
import { TAU, timeParts, pad, clamp, SANS, MONO } from '../lib/util.js';
import { strokeGlyph } from '../lib/glyphs.js';

const OVERFLOW = 2 ** 31; // seconds
// Real tubes stack the cathodes at different depths (IN-14 order, back to front).
const STACK = [1, 6, 2, 7, 5, 0, 4, 9, 8, 3];
const SEG = { // 7-segment: a b c d e f g
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc',
  '8': 'abcdefg', '9': 'abcdfg', A: 'abcefg', B: 'cdefg', C: 'adef', D: 'bcdeg', E: 'adefg', F: 'aefg', '-': 'g', ' ': '',
};

const glyphCache = {};
const glyph = (d) => (glyphCache[d] ??= strokeGlyph(String(d), 0.02));

function strokeDigit(g, d, x, y, gw, gh) {
  for (const pl of glyph(d)) {
    g.beginPath();
    pl.forEach(([px, py], i) => {
      const X = x + px * gw, Y = y + (py / 2) * gh;
      if (i) g.lineTo(X, Y); else g.moveTo(X, Y);
    });
    g.stroke();
  }
}

function offscreen(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return [c, c.getContext('2d')];
}

// Pre-rendered sprites for one tube size (in device pixels).
function tubeSprites(w, h) {
  const gh = h * 0.5, gw = gh * 0.52;
  const gx = (w - gw) / 2, gy = h * 0.19;
  const lw = Math.max(1.2, w * 0.035);

  // body: socket, dark interior, unlit cathode stack
  const [body, b] = offscreen(w, h);
  const r = w * 0.34;
  b.fillStyle = '#0c0907';
  b.beginPath(); b.roundRect(w * 0.04, h * 0.02, w * 0.92, h * 0.86, [r, r, w * 0.08, w * 0.08]); b.fill();
  const inner = b.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, h * 0.55);
  inner.addColorStop(0, 'rgba(60, 38, 24, 0.55)');
  inner.addColorStop(1, 'rgba(0, 0, 0, 0)');
  b.fillStyle = inner;
  b.fill();
  b.lineCap = 'round'; b.lineJoin = 'round';
  STACK.forEach((d, i) => {
    const depth = i / (STACK.length - 1);
    const sc = 0.94 + depth * 0.06;
    b.strokeStyle = `rgba(${120 + depth * 50}, ${100 + depth * 35}, ${85 + depth * 25}, ${0.1 + depth * 0.14})`;
    b.lineWidth = lw * 0.55;
    strokeDigit(b, d, gx + (gw * (1 - sc)) / 2, gy + (gh * (1 - sc)) / 2, gw * sc, gh * sc);
  });
  // socket
  const sock = b.createLinearGradient(0, h * 0.86, 0, h);
  sock.addColorStop(0, '#1b1b1d'); sock.addColorStop(1, '#050505');
  b.fillStyle = sock;
  b.beginPath(); b.roundRect(0, h * 0.86, w, h * 0.14, w * 0.06); b.fill();
  b.fillStyle = 'rgba(255,255,255,0.06)';
  b.fillRect(w * 0.06, h * 0.87, w * 0.88, Math.max(1, h * 0.006));

  // lit digits with bloom
  const lit = [];
  const pad_ = w * 0.25;
  for (let d = 0; d < 10; d++) {
    const [c, g] = offscreen(w + pad_ * 2, h + pad_ * 2);
    g.translate(pad_, pad_);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.shadowColor = 'rgba(255, 90, 10, 1)';
    for (const [width, color, blur] of [
      [lw * 3.2, 'rgba(255, 70, 0, 0.18)', w * 0.22],
      [lw * 1.7, 'rgba(255, 110, 20, 0.55)', w * 0.1],
      [lw * 0.95, 'rgba(255, 170, 60, 0.95)', w * 0.04],
      [lw * 0.4, 'rgba(255, 238, 200, 1)', 0],
    ]) {
      g.shadowBlur = blur;
      g.strokeStyle = color;
      g.lineWidth = width;
      strokeDigit(g, d, gx, gy, gw, gh);
    }
    lit.push(c);
  }

  // anode mesh (in front of the digits) + glass
  const [front, f] = offscreen(w, h);
  f.save();
  f.beginPath(); f.roundRect(w * 0.04, h * 0.02, w * 0.92, h * 0.86, [r, r, w * 0.08, w * 0.08]); f.clip();
  const cell = Math.max(3, w * 0.07);
  f.strokeStyle = 'rgba(40, 30, 25, 0.55)';
  f.lineWidth = Math.max(0.6, w * 0.006);
  f.beginPath();
  const hx = cell * Math.sqrt(3);
  for (let row = -1; row * cell * 1.5 < h; row++) {
    for (let col = -1; col * hx < w + hx; col++) {
      const cx = col * hx + (row % 2 ? hx / 2 : 0);
      const cy = row * cell * 1.5 + h * 0.1;
      for (let k = 0; k < 6; k++) {
        const a0 = (k / 6) * TAU + Math.PI / 6, a1 = ((k + 1) / 6) * TAU + Math.PI / 6;
        f.moveTo(cx + Math.cos(a0) * cell, cy + Math.sin(a0) * cell);
        f.lineTo(cx + Math.cos(a1) * cell, cy + Math.sin(a1) * cell);
      }
    }
  }
  f.stroke();
  // glass reflections
  const streak = f.createLinearGradient(w * 0.1, 0, w * 0.34, 0);
  streak.addColorStop(0, 'rgba(255,255,255,0)');
  streak.addColorStop(0.5, 'rgba(255,255,255,0.10)');
  streak.addColorStop(1, 'rgba(255,255,255,0)');
  f.fillStyle = streak;
  f.fillRect(w * 0.1, h * 0.08, w * 0.24, h * 0.72);
  f.restore();
  f.strokeStyle = 'rgba(210, 220, 230, 0.22)';
  f.lineWidth = Math.max(1, w * 0.012);
  f.beginPath(); f.roundRect(w * 0.04, h * 0.02, w * 0.92, h * 0.86, [r, r, w * 0.08, w * 0.08]); f.stroke();
  f.fillStyle = 'rgba(255,255,255,0.25)';
  f.beginPath(); f.ellipse(w * 0.5, h * 0.035, w * 0.06, h * 0.012, 0, 0, TAU); f.fill(); // exhaust tip

  return { w, h, body, lit, front, pad: pad_ };
}

function lampSprites(w, h) {
  const make = (on) => {
    const p = w * 1.2;
    const [c, g] = offscreen(w + 2 * p, h + 2 * p);
    g.translate(p, p);
    if (on) {
      const glow = g.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, h * 0.9);
      glow.addColorStop(0, 'rgba(255, 110, 30, 0.55)');
      glow.addColorStop(1, 'rgba(255, 60, 0, 0)');
      g.fillStyle = glow;
      g.fillRect(-p, -p, w + 2 * p, h + 2 * p);
    }
    g.fillStyle = on ? 'rgba(255, 150, 90, 0.18)' : 'rgba(200, 200, 210, 0.06)';
    g.strokeStyle = 'rgba(220, 225, 235, 0.3)';
    g.lineWidth = Math.max(1, w * 0.06);
    g.beginPath(); g.roundRect(0, 0, w, h * 0.82, w / 2); g.fill(); g.stroke();
    // electrodes
    for (const ex of [0.34, 0.66]) {
      g.strokeStyle = on ? 'rgba(255, 190, 120, 0.9)' : 'rgba(150, 150, 160, 0.5)';
      g.lineWidth = Math.max(1, w * 0.1);
      g.beginPath(); g.moveTo(w * ex, h * 0.18); g.lineTo(w * ex, h * 1.0); g.stroke();
      if (on) {
        g.shadowColor = 'rgba(255, 90, 10, 1)';
        g.shadowBlur = w * 0.6;
        g.strokeStyle = 'rgba(255, 150, 60, 0.95)';
        g.lineWidth = w * 0.18;
        g.beginPath(); g.moveTo(w * ex, h * 0.2); g.lineTo(w * ex, h * 0.55); g.stroke();
        g.shadowBlur = 0;
      }
    }
    return { c, p };
  };
  return { on: make(true), off: make(false) };
}

export function create(host) {
  const surface = host.canvas();
  const { ctx } = surface;
  const sprites = new Map();
  const spriteFor = (kind, w, h) => {
    const dpr = surface.dpr;
    const key = `${kind}:${Math.round(w * dpr)}x${Math.round(h * dpr)}`;
    let s = sprites.get(key);
    if (!s) {
      s = kind === 'tube' ? tubeSprites(w * dpr, h * dpr) : lampSprites(w * dpr, h * dpr);
      sprites.set(key, s);
      if (sprites.size > 8) sprites.delete(sprites.keys().next().value);
    }
    return s;
  };

  function drawTube(x, y, w, h, digit, prev, sf, flick) {
    const s = spriteFor('tube', w, h);
    const k = w / s.w;
    ctx.drawImage(s.body, x, y, w, h);
    // halo on the surroundings
    const halo = ctx.createRadialGradient(x + w / 2, y + h * 0.44, 0, x + w / 2, y + h * 0.44, h * 0.62);
    halo.addColorStop(0, `rgba(255, 90, 20, ${0.16 * flick})`);
    halo.addColorStop(1, 'rgba(255, 60, 0, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(x - h * 0.3, y - h * 0.2, w + h * 0.6, h * 1.3);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // cathode switching: the old digit decays as the new one strikes
    const blend = prev !== digit ? clamp(sf / 0.07, 0, 1) : 1;
    const draw = (d, a) => {
      if (a <= 0.01) return;
      ctx.globalAlpha = a;
      ctx.drawImage(s.lit[d], x - s.pad * k, y - s.pad * k, (s.w + 2 * s.pad) * k, (s.h + 2 * s.pad) * k);
    };
    if (blend < 1) draw(prev, (1 - blend) * flick);
    draw(digit, blend * flick);
    ctx.restore();
    ctx.drawImage(s.front, x, y, w, h);
  }

  function neonDot(x, y, r, flick) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
    g.addColorStop(0, `rgba(255, 220, 170, ${flick})`);
    g.addColorStop(0.2, `rgba(255, 120, 30, ${0.8 * flick})`);
    g.addColorStop(1, 'rgba(255, 60, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 5, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // VFD 7-segment text; returns width used
  function vfd(text, x, y, ch, { color = [110, 255, 230], align = 'left', dim = 0.07 } = {}) {
    const cw = ch * 0.55, gap = ch * 0.18, t = ch * 0.1, skew = 0.1;
    const chars = [...text];
    const widthOf = (c) => (c === ' ' ? cw * 0.4 : c === ':' || c === '.' ? cw * 0.35 : cw) + gap;
    const total = chars.reduce((a, c) => a + widthOf(c), 0) - gap;
    let cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
    const [R, G, B] = color;
    ctx.save();
    ctx.lineCap = 'round';
    for (const c of chars) {
      if (c === ' ') { cx += cw * 0.4 + gap; continue; }
      if (c === ':' || c === '.') {
        ctx.fillStyle = `rgba(${R},${G},${B},0.9)`;
        const dots = c === ':' ? [0.3, 0.7] : [0.95];
        for (const dy of dots) { ctx.beginPath(); ctx.arc(cx + cw * 0.12, y + ch * dy, t * 0.6, 0, TAU); ctx.fill(); }
        cx += widthOf(c);
        continue;
      }
      const on = SEG[c.toUpperCase()] ?? '';
      const P = (px, py) => [cx + px * cw + (1 - py) * cw * skew, y + py * ch];
      const segs = {
        a: [P(0.1, 0), P(0.9, 0)], b: [P(1, 0.08), P(1, 0.46)], c: [P(1, 0.54), P(1, 0.92)],
        d: [P(0.1, 1), P(0.9, 1)], e: [P(0, 0.54), P(0, 0.92)], f: [P(0, 0.08), P(0, 0.46)], g: [P(0.1, 0.5), P(0.9, 0.5)],
      };
      for (const [name, [[x0, y0], [x1, y1]]] of Object.entries(segs)) {
        const lit = on.includes(name);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        if (lit) {
          ctx.strokeStyle = `rgba(${R},${G},${B},0.18)`;
          ctx.lineWidth = t * 3;
          ctx.stroke();
          ctx.strokeStyle = `rgba(${Math.min(255, R + 90)},${Math.min(255, G + 20)},${Math.min(255, B + 20)},0.95)`;
          ctx.lineWidth = t;
          ctx.stroke();
        } else {
          ctx.strokeStyle = `rgba(${R},${G},${B},${dim})`;
          ctx.lineWidth = t;
          ctx.stroke();
        }
      }
      cx += widthOf(c);
    }
    ctx.restore();
    return total;
  }

  let extent = 0; // content bottom from the previous frame, for vertical centering

  function caption(text, x, y, align = 'left', size = 12, alpha = 0.55) {
    ctx.font = `600 ${size}px ${MONO}`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(255, 170, 110, ${alpha})`;
    ctx.fillText(text, x, y);
  }

  function dhms(sec) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor(sec / 3600) % 24, m = Math.floor(sec / 60) % 60, s = Math.floor(sec) % 60;
    return `${d} ${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  return {
    frame(now) {
      const W = surface.width, H = surface.height;
      const portrait = H > W * 1.1;
      const unit = Math.min(W / 16, H / 9);
      const m = Math.max(20, W * 0.04);
      const t = timeParts(now);
      const unix = Math.floor(now / 1000);
      const sf = (now / 1000) - unix;
      const flick = (i) => 0.93 + 0.04 * Math.sin(now / 53 + i * 2.1) + 0.03 * Math.sin(now / 17.3 + i * 5.7);

      // backdrop: dark walnut and warm spill light
      ctx.fillStyle = '#080605';
      ctx.fillRect(0, 0, W, H);
      const spill = ctx.createRadialGradient(W / 2, H * 0.33, 0, W / 2, H * 0.33, Math.max(W, H) * 0.6);
      spill.addColorStop(0, 'rgba(120, 50, 15, 0.22)');
      spill.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = spill;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      const shift = extent ? Math.max(0, (H - extent) * 0.45) : 0;
      ctx.translate(0, shift);
      let bottom = 0;

      // ---------------- big tubes -----------------
      const digits = String(unix).padStart(10, '0');
      const prevDigits = String(unix - 1).padStart(10, '0');
      const rows = portrait ? [[0, 5], [5, 10]] : [[0, 10]];
      const perRow = rows[0][1] - rows[0][0];
      const groupGap = portrait ? 0 : 0.35;
      const spanUnits = perRow + (perRow - 1) * 0.1 + (portrait ? 0 : 3 * groupGap);
      let tw = (W - 2 * m) / spanUnits;
      const maxH = portrait ? H * 0.2 : H * 0.36;
      tw = Math.min(tw, maxH / 1.85);
      const th = tw * 1.85;
      const topY = portrait ? H * 0.08 : H * 0.12;
      let yCursor = topY;
      rows.forEach(([a, b], ri) => {
        const n = b - a;
        const rowW = (n + (n - 1) * 0.1 + (portrait ? 0 : 3 * groupGap)) * tw;
        let x = W / 2 - rowW / 2;
        const y = topY + ri * th * 1.08;
        for (let i = a; i < b; i++) {
          drawTube(x, y, tw, th, +digits[i], +prevDigits[i], sf, flick(i));
          x += tw * 1.1;
          const place = 9 - i; // thousands separators: after digit with place 9, 6, 3
          if (!portrait && (place === 9 || place === 6 || place === 3)) {
            neonDot(x + (groupGap * tw) / 2 - tw * 0.05, y + th * 0.8, tw * 0.035, flick(i + 20));
            x += groupGap * tw;
          }
        }
        yCursor = y + th;
      });
      caption('time(NULL)  ·  SECONDS SINCE 1970-01-01T00:00:00Z', W / 2, yCursor + unit * 0.3, 'center', Math.max(11, unit * 0.2), 0.6);

      // ---------------- 32 neon lamps -----------------
      const bits = unix >>> 0;
      const lampRows = portrait ? [[31, 16], [15, 0]] : [[31, 0]];
      const lampsPerRow = portrait ? 16 : 32;
      const byteGap = 0.9;
      const pitch = Math.min((W - 2 * m) / (lampsPerRow + (lampsPerRow / 8 - 1) * byteGap), unit * 0.62);
      const lw = pitch * 0.42, lh = lw * 2.1;
      let ly = yCursor + unit * (portrait ? 0.9 : 0.85);
      const lamps = spriteFor('lamp', lw, lh);
      const kk = lw / (lamps.on.c.width / (1 + 2.4));
      for (const [hi, lo] of lampRows) {
        const n = hi - lo + 1;
        const rowW = (n + (n / 8 - 1) * byteGap) * pitch;
        let x = W / 2 - rowW / 2;
        for (let bit = hi; bit >= lo; bit--) {
          const on = (bits >>> bit) & 1;
          const spr = on ? lamps.on : lamps.off;
          const k = lw / (spr.c.width - 2 * spr.p);
          ctx.globalAlpha = on ? flick(bit + 40) : 1;
          ctx.drawImage(spr.c, x + (pitch - lw) / 2 - spr.p * k, ly - spr.p * k, spr.c.width * k, spr.c.height * k);
          ctx.globalAlpha = 1;
          if (bit % 8 === 7 || bit % 8 === 0) caption(String(bit), x + pitch / 2, ly + lh + unit * 0.2, 'center', Math.max(9, unit * 0.14), bit === 31 ? 0.8 : 0.4);
          if (bit === 31) caption('SIGN', x + pitch / 2, ly - unit * 0.2, 'center', Math.max(9, unit * 0.13), 0.6);
          x += pitch;
          if (bit % 8 === 0) x += byteGap * pitch;
        }
        ly += lh + unit * 0.55;
      }
      void kk;

      // ---------------- bottom instruments -----------------
      const hex = (bits.toString(16).toUpperCase()).padStart(8, '0');
      const toOverflow = OVERFLOW - now / 1000;
      const nextMilestone = (Math.floor(unix / 1e8) + 1) * 1e8;
      const toMilestone = nextMilestone - now / 1000;
      const used = clamp(now / 1000 / OVERFLOW, 0, 1);

      const panelTop = ly + unit * 0.25;
      const panelH = portrait ? H - panelTop - m * 0.6 : Math.min(H - panelTop - m * 0.6, unit * 2.6);
      const cols = portrait ? 1 : 3;
      const colW = (W - 2 * m) / cols;
      const cellH = portrait ? panelH / 3 : panelH;

      const box = (i) => ({ x: m + (portrait ? 0 : i * colW), y: panelTop + (portrait ? i * cellH : 0), w: colW, h: cellH });

      // local time on small tubes
      {
        const b = box(0);
        caption('LOCAL TIME', b.x + b.w / 2, b.y + unit * 0.15, 'center', Math.max(10, unit * 0.16));
        const avail = b.h - unit * 0.45;
        let stw = Math.min((b.w * 0.92) / (6 + 5 * 0.08 + 2 * 0.35), avail / 1.85);
        const sth = stw * 1.85;
        const rowW = (6 + 5 * 0.08 + 2 * 0.35) * stw;
        let x = b.x + b.w / 2 - rowW / 2;
        const y = b.y + unit * 0.38;
        const cur = `${pad(t.h)}${pad(t.m)}${pad(t.s)}`;
        const prevT = timeParts(now - 1000);
        const prev = `${pad(prevT.h)}${pad(prevT.m)}${pad(prevT.s)}`;
        for (let i = 0; i < 6; i++) {
          drawTube(x, y, stw, sth, +cur[i], +prev[i], t.secondFrac, flick(i + 60));
          x += stw * 1.08;
          if (i === 1 || i === 3) {
            neonDot(x + stw * 0.13, y + sth * 0.3, stw * 0.04, flick(i + 70));
            neonDot(x + stw * 0.13, y + sth * 0.6, stw * 0.04, flick(i + 71));
            x += stw * 0.35;
          }
        }
        bottom = Math.max(bottom, y + sth);
      }

      // hex VFD
      {
        const b = box(1);
        const cx = b.x + b.w / 2;
        caption('HEX  ·  0x', cx, b.y + unit * 0.15, 'center', Math.max(10, unit * 0.16));
        ctx.fillStyle = 'rgba(5, 25, 22, 0.8)';
        const ch = Math.min(b.h * (portrait ? 0.3 : 0.42), (b.w * (portrait ? 0.6 : 0.8)) / (8 * 0.73));
        ctx.beginPath(); ctx.roundRect(cx - ch * 3.1, b.y + unit * 0.35, ch * 6.2, ch * 1.5, 8); ctx.fill();
        vfd(hex.slice(0, 4) + ' ' + hex.slice(4), cx, b.y + unit * 0.35 + ch * 0.25, ch, { align: 'center' });
        caption(`${(used * 100).toFixed(4)}% OF INT32_MAX`, cx, b.y + unit * 0.35 + ch * 1.5 + unit * 0.3, 'center', Math.max(10, unit * 0.15), 0.5);
      }

      // 2038 countdown + milestone
      {
        const b = box(2);
        const cx = b.x + b.w / 2;
        const overflowed = toOverflow <= 0;
        // After the overflow, show what a wrapped int32 clock would read instead.
        const wrapped = new Date(((unix | 0)) * 1000).toISOString().slice(0, 10);
        caption(overflowed ? 'OVERFLOWED! AN INT32 CLOCK NOW READS' : 'SIGNED 32-BIT time_t OVERFLOWS IN', cx, b.y + unit * 0.15, 'center', Math.max(10, unit * 0.16), overflowed && sf < 0.5 ? 0.95 : 0.55);
        const txt = overflowed ? wrapped : dhms(toOverflow).replace(' ', 'd ');
        const ch = Math.min(b.h * (portrait ? 0.22 : 0.3), (b.w * (portrait ? 0.7 : 0.9)) / (txt.length * 0.7));
        vfd(txt, cx, b.y + unit * 0.4, ch, { align: 'center', color: [255, 120, 90] });
        // progress bar of the int32 range
        const by = b.y + unit * 0.4 + ch + unit * 0.3, bw = b.w * 0.8, bx = cx - bw / 2;
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(bx, by, bw, Math.max(3, unit * 0.06));
        ctx.fillStyle = 'rgba(255, 120, 60, 0.85)';
        ctx.fillRect(bx, by, bw * used, Math.max(3, unit * 0.06));
        const mDate = new Date(nextMilestone * 1000).toISOString().slice(0, 16).replace('T', ' ');
        caption(`NEXT: ${nextMilestone.toLocaleString('en-US')} IN ${dhms(toMilestone).replace(' ', 'd ')}`, cx, by + unit * 0.35, 'center', Math.max(10, unit * 0.15), 0.6);
        caption(`(${mDate} UTC)`, cx, by + unit * 0.62, 'center', Math.max(9, unit * 0.13), 0.4);
        bottom = Math.max(bottom, by + unit * 0.8);
      }
      ctx.restore();
      extent = bottom + m * 0.5;
    },
  };
}

// Oscilloscope: an analogue scope in X-Y mode. A single electron beam, steered
// by two voltages, sweeps out a clock face. The phosphor glows and decays, and
// the two channel voltages that paint the picture are shown on the side.
import { TAU, timeParts, pad, clamp, MONO, SANS } from '../lib/util.js';
import { strokeText } from '../lib/glyphs.js';

const STEP = 0.011;          // beam sample spacing (screen units, face radius ≈ 1)
const REFRESH = 0.16;        // seconds for the beam to trace the whole display list
const DECAY = 0.22;          // phosphor 1/e decay time (s), exaggerated for effect
const GREEN = [110, 255, 150];

// ---- display list -------------------------------------------------------------
// Points are [x, y, lit]. A "move" with lit=0 is a blanked retrace.
function buildList(t) {
  const pts = [];
  let cur = null;
  const seg = (x0, y0, x1, y1, lit) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (lit ? STEP : STEP * 6)));
    for (let i = 1; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, lit]);
  };
  const moveTo = (x, y) => {
    if (cur) seg(cur[0], cur[1], x, y, 0);
    else pts.push([x, y, 0]);
    cur = [x, y];
  };
  const lineTo = (x, y) => { seg(cur[0], cur[1], x, y, 1); cur = [x, y]; };
  const poly = (list) => { moveTo(list[0][0], list[0][1]); for (let i = 1; i < list.length; i++) lineTo(list[i][0], list[i][1]); };

  // bezel circle
  const R = 0.94;
  const circ = [];
  for (let i = 0; i <= 240; i++) circ.push([R * Math.sin((i / 240) * TAU), -R * Math.cos((i / 240) * TAU)]);
  poly(circ);
  // hour ticks
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const r0 = i % 3 === 0 ? 0.74 : 0.82;
    poly([[r0 * Math.sin(a), -r0 * Math.cos(a)], [0.88 * Math.sin(a), -0.88 * Math.cos(a)]]);
  }
  // 12 / 3 / 6 / 9 numerals
  const glyphs = (text, cx, cy, h) => {
    const g = strokeText(text, { tracking: 0.35, step: 0.08 });
    const k = h / 2;
    for (const line of g.lines) poly(line.map(([x, y]) => [cx + (x - g.width / 2) * k, cy + (y - 1) * k]));
  };
  glyphs('12', 0, -0.6, 0.14);
  glyphs('3', 0.62, 0, 0.14);
  glyphs('6', 0, 0.6, 0.14);
  glyphs('9', -0.62, 0, 0.14);
  // digital readout
  glyphs(`${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`, 0, 0.32, 0.075);

  // hands
  const hand = (angle, len, width, tail) => {
    const sx = Math.sin(angle), cy = -Math.cos(angle);
    const px = -cy, py = sx; // perpendicular
    const tip = [sx * len, cy * len];
    const back = [-sx * tail, -cy * tail];
    const mid = 0.25 * len;
    poly([back, [sx * mid + px * width, cy * mid + py * width], tip, [sx * mid - px * width, cy * mid - py * width], back]);
  };
  const hourA = ((t.h % 12) + t.m / 60 + t.s / 3600) / 12 * TAU;
  const minA = (t.m + t.s / 60) / 60 * TAU;
  const secA = (t.s + t.ms / 1000) / 60 * TAU;
  hand(hourA, 0.46, 0.045, 0.06);
  hand(minA, 0.72, 0.03, 0.08);
  poly([[-Math.sin(secA) * 0.16, Math.cos(secA) * 0.16], [Math.sin(secA) * 0.84, -Math.cos(secA) * 0.84]]);
  // hub
  const hub = [];
  for (let i = 0; i <= 16; i++) hub.push([0.03 * Math.cos((i / 16) * TAU), 0.03 * Math.sin((i / 16) * TAU)]);
  poly(hub);
  // retrace to start
  moveTo(pts[0][0], pts[0][1]);
  return pts;
}

// ---- panel drawing helpers ----------------------------------------------------
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function knob(ctx, x, y, r, angle, label, sub) {
  // skirt with tick marks
  ctx.strokeStyle = 'rgba(220,225,235,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI * 1.25 + (i / 10) * Math.PI * 1.5;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 1.2, y + Math.sin(a) * r * 1.2);
    ctx.lineTo(x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35);
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#5b606c');
  g.addColorStop(0.6, '#2a2d34');
  g.addColorStop(1, '#141519');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  // knurling
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.fillStyle = '#1c1e24';
  ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#e8ecf2';
  ctx.lineWidth = Math.max(1.5, r * 0.09);
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(angle) * r * 0.25, y + Math.sin(angle) * r * 0.25);
  ctx.lineTo(x + Math.cos(angle) * r * 0.9, y + Math.sin(angle) * r * 0.9);
  ctx.stroke();
  ctx.fillStyle = 'rgba(230,235,245,0.8)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `600 ${Math.max(9, r * 0.36)}px ${SANS}`;
  ctx.fillText(label, x, y + r * 1.5);
  if (sub) {
    ctx.fillStyle = 'rgba(160,200,255,0.75)';
    ctx.font = `${Math.max(8, r * 0.3)}px ${MONO}`;
    ctx.fillText(sub, x, y + r * 1.5 + Math.max(11, r * 0.45));
  }
}

export function create(host) {
  const base = host.canvas();
  const phos = host.canvas({ alpha: true });
  const over = host.canvas({ alpha: true });
  let layoutKey = '';
  let L = null;
  let beamIdx = 0;
  let lastPt = null;
  let history = []; // recent beam samples for the waveform panes

  function layout(W, H) {
    const m = Math.min(W, H) * 0.05;
    const landscape = W / H > 1.15;
    let crt, panel;
    if (landscape) {
      const ch = Math.min(H - 2 * m - H * 0.1, (W * 0.64 - 2 * m) / 1.25);
      const cw = ch * 1.25;
      crt = { x: m + Math.max(0, (W * 0.64 - 2 * m - cw) / 2), y: (H - ch) / 2, w: cw, h: ch };
      panel = { x: crt.x + cw + m, y: crt.y, w: W - (crt.x + cw + m) - m, h: ch };
    } else {
      const cw = W - 2 * m;
      const ch = cw * 0.8;
      crt = { x: m, y: Math.max(H * 0.1, m), w: cw, h: ch };
      const lab = Math.max(9, ch * 0.022) * 2.5;
      panel = { x: m, y: crt.y + ch + m + lab, w: cw, h: H - (crt.y + ch + m + lab) - m };
    }
    return { W, H, m, landscape, crt, panel };
  }

  function drawBase() {
    const { ctx } = base;
    const { W, H, crt, panel, landscape } = L;
    // chassis
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b1d23');
    g.addColorStop(1, '#0d0e12');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // subtle brushed lines
    ctx.fillStyle = 'rgba(255,255,255,0.012)';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);

    // CRT bezel
    const pad_ = crt.h * 0.045;
    roundRect(ctx, crt.x - pad_, crt.y - pad_, crt.w + 2 * pad_, crt.h + 2 * pad_, pad_ * 1.2);
    const bz = ctx.createLinearGradient(0, crt.y - pad_, 0, crt.y + crt.h + pad_);
    bz.addColorStop(0, '#2c2f37');
    bz.addColorStop(1, '#08090b');
    ctx.fillStyle = bz;
    ctx.fill();
    roundRect(ctx, crt.x, crt.y, crt.w, crt.h, crt.h * 0.04);
    const glass = ctx.createRadialGradient(crt.x + crt.w / 2, crt.y + crt.h / 2, 0, crt.x + crt.w / 2, crt.y + crt.h / 2, crt.w * 0.7);
    glass.addColorStop(0, '#07140c');
    glass.addColorStop(1, '#020403');
    ctx.fillStyle = glass;
    ctx.fill();

    // panel
    if (panel.w > 40 && panel.h > 40) {
      const fs = Math.max(10, Math.min(panel.w, panel.h * 1.4) * 0.045);
      ctx.fillStyle = 'rgba(235,238,245,0.9)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = `700 ${fs * 1.2}px ${SANS}`;
      ctx.fillText('NERDTRONIX  XY-60', panel.x, panel.y);
      ctx.font = `${fs * 0.7}px ${MONO}`;
      ctx.fillStyle = 'rgba(160,170,190,0.8)';
      ctx.fillText('DUAL-CHANNEL VECTOR CLOCK · 60 MHz', panel.x, panel.y + fs * 1.55);

      // power LED
      const lx = panel.x + panel.w - fs * 0.6, ly = panel.y + fs * 0.6;
      const led = ctx.createRadialGradient(lx, ly, 0, lx, ly, fs);
      led.addColorStop(0, 'rgba(120,255,160,1)');
      led.addColorStop(0.3, 'rgba(60,220,110,0.5)');
      led.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = led;
      ctx.beginPath(); ctx.arc(lx, ly, fs, 0, TAU); ctx.fill();

      // knobs
      const kr = Math.min(panel.w / 11, panel.h * 0.06);
      const ky = panel.y + panel.h - kr * 3.6;
      const labels = [
        ['INTENS', '', -0.5], ['FOCUS', '', 0.3], ['CH1 V/DIV', '0.5 V', 0.9], ['CH2 V/DIV', '0.5 V', 0.9], ['TIME/DIV', 'X-Y', 2.2],
      ];
      const n = labels.length;
      labels.forEach(([lab, sub, ang], i) => {
        const kx = panel.x + kr * 1.5 + (i / (n - 1)) * (panel.w - kr * 3);
        knob(ctx, kx, ky, kr, -Math.PI / 2 + ang, lab, sub);
      });
    }
  }

  // Waveform pane geometry (overlay)
  function panes() {
    const { panel } = L;
    const fs = Math.max(10, Math.min(panel.w, panel.h * 1.4) * 0.045);
    const top = panel.y + fs * 3.2;
    const kr = Math.min(panel.w / 11, panel.h * 0.06);
    const bottom = panel.y + panel.h - kr * 6;
    const gap = fs * 1.6;
    const h = (bottom - top - gap) / 2;
    return [
      { x: panel.x, y: top, w: panel.w, h, label: 'CH1 · X deflection', color: [255, 196, 90], key: 0 },
      { x: panel.x, y: top + h + gap, w: panel.w, h, label: 'CH2 · Y deflection', color: [90, 220, 255], key: 1 },
    ];
  }

  return {
    frame(now, dt) {
      const W = base.width, H = base.height;
      const key = `${W}x${H}`;
      if (key !== layoutKey) {
        layoutKey = key;
        L = layout(W, H);
        drawBase();
        phos.ctx.clearRect(0, 0, W, H);
        lastPt = null;
      }
      const t = timeParts(now);
      const list = buildList(t);
      const { crt } = L;
      const cx = crt.x + crt.w / 2, cy = crt.y + crt.h / 2;
      const unit = (crt.h / 2) * 0.92; // face radius in px
      const toPx = (p) => [cx + p[0] * unit, cy + p[1] * unit];

      // ---- phosphor decay ----
      const pctx = phos.ctx;
      pctx.save();
      pctx.beginPath();
      roundRect(pctx, crt.x, crt.y, crt.w, crt.h, crt.h * 0.04);
      pctx.clip();
      pctx.globalCompositeOperation = 'destination-out';
      pctx.fillStyle = `rgba(0,0,0,${clamp(1 - Math.exp(-Math.max(dt, 1 / 240) / DECAY), 0, 1)})`;
      pctx.fillRect(crt.x, crt.y, crt.w, crt.h);

      // ---- beam ----
      pctx.globalCompositeOperation = 'lighter';
      pctx.lineCap = 'round';
      pctx.lineJoin = 'round';
      const advance = Math.max(1, Math.round((list.length * Math.max(dt, 1 / 240)) / REFRESH));
      const segs = [];
      for (let i = 0; i < advance; i++) {
        beamIdx = (beamIdx + 1) % list.length;
        const p = list[beamIdx];
        const px = toPx(p);
        if (lastPt) segs.push([lastPt, px, p[2]]);
        lastPt = px;
        history.push([p[0], p[1]]);
      }
      const maxHist = list.length * 2;
      if (history.length > maxHist) history = history.slice(history.length - maxHist);

      const passes = [
        [unit * 0.055, 0.035], // wide halo
        [unit * 0.018, 0.22],
        [Math.max(1.2, unit * 0.006), 0.9], // hot core
      ];
      for (const [lw, a] of passes) {
        pctx.lineWidth = lw;
        pctx.strokeStyle = `rgba(${GREEN[0]},${GREEN[1]},${GREEN[2]},${a})`;
        pctx.beginPath();
        for (const [a0, a1, lit] of segs) if (lit) { pctx.moveTo(a0[0], a0[1]); pctx.lineTo(a1[0], a1[1]); }
        pctx.stroke();
      }
      // imperfect blanking: retrace is faintly visible
      pctx.lineWidth = 1;
      pctx.strokeStyle = 'rgba(110,255,150,0.025)';
      pctx.beginPath();
      for (const [a0, a1, lit] of segs) if (!lit) { pctx.moveTo(a0[0], a0[1]); pctx.lineTo(a1[0], a1[1]); }
      pctx.stroke();
      pctx.restore();

      // ---- overlay: graticule, beam spot, glass, waveforms ----
      const o = over.ctx;
      o.clearRect(0, 0, W, H);
      o.save();
      roundRect(o, crt.x, crt.y, crt.w, crt.h, crt.h * 0.04);
      o.clip();
      const dv = crt.h / 8;
      o.strokeStyle = 'rgba(160, 200, 180, 0.13)';
      o.lineWidth = 1;
      o.beginPath();
      for (let i = 1; i < 10; i++) { const x = crt.x + (crt.w * i) / 10; o.moveTo(x, crt.y); o.lineTo(x, crt.y + crt.h); }
      for (let j = 1; j < 8; j++) { const y = crt.y + dv * j; o.moveTo(crt.x, y); o.lineTo(crt.x + crt.w, y); }
      o.stroke();
      o.beginPath();
      for (let i = 0; i <= 50; i++) {
        const x = crt.x + (crt.w * i) / 50;
        o.moveTo(x, cy - dv * 0.06); o.lineTo(x, cy + dv * 0.06);
      }
      for (let j = 0; j <= 40; j++) {
        const y = crt.y + (crt.h * j) / 40;
        o.moveTo(cx - dv * 0.06, y); o.lineTo(cx + dv * 0.06, y);
      }
      o.stroke();
      // beam spot
      if (lastPt && list[beamIdx][2]) {
        const s = o.createRadialGradient(lastPt[0], lastPt[1], 0, lastPt[0], lastPt[1], unit * 0.05);
        s.addColorStop(0, 'rgba(230,255,235,0.95)');
        s.addColorStop(1, 'rgba(110,255,150,0)');
        o.fillStyle = s;
        o.beginPath(); o.arc(lastPt[0], lastPt[1], unit * 0.05, 0, TAU); o.fill();
      }
      // glass reflection + vignette
      const refl = o.createLinearGradient(crt.x, crt.y, crt.x + crt.w * 0.6, crt.y + crt.h * 0.6);
      refl.addColorStop(0, 'rgba(255,255,255,0.06)');
      refl.addColorStop(0.35, 'rgba(255,255,255,0.015)');
      refl.addColorStop(0.36, 'rgba(255,255,255,0)');
      o.fillStyle = refl;
      o.fillRect(crt.x, crt.y, crt.w, crt.h);
      const vig = o.createRadialGradient(cx, cy, crt.h * 0.4, cx, cy, crt.w * 0.72);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.55)');
      o.fillStyle = vig;
      o.fillRect(crt.x, crt.y, crt.w, crt.h);
      o.restore();

      // CRT labels
      const lf = Math.max(9, crt.h * 0.022);
      o.font = `${lf}px ${MONO}`;
      o.fillStyle = 'rgba(190,200,215,0.6)';
      o.textBaseline = 'top';
      o.textAlign = 'left';
      o.fillText('CH1 0.5V  CH2 0.5V  X-Y', crt.x, crt.y + crt.h + crt.h * 0.055);
      o.textAlign = 'right';
      o.fillText(`BEAM ${(list.length / REFRESH / 1000).toFixed(1)} kpt/s  ·  ${list.length} PTS`, crt.x + crt.w, crt.y + crt.h + crt.h * 0.055);

      // waveform panes
      const { panel } = L;
      if (panel.w > 120 && panel.h > 160) {
        for (const pane of panes()) {
          roundRect(o, pane.x, pane.y, pane.w, pane.h, 8);
          o.fillStyle = '#040605';
          o.fill();
          o.strokeStyle = 'rgba(255,255,255,0.08)';
          o.stroke();
          o.save();
          roundRect(o, pane.x, pane.y, pane.w, pane.h, 8);
          o.clip();
          // grid
          o.strokeStyle = 'rgba(255,255,255,0.06)';
          o.beginPath();
          for (let i = 1; i < 10; i++) { const x = pane.x + (pane.w * i) / 10; o.moveTo(x, pane.y); o.lineTo(x, pane.y + pane.h); }
          for (let j = 1; j < 4; j++) { const y = pane.y + (pane.h * j) / 4; o.moveTo(pane.x, y); o.lineTo(pane.x + pane.w, y); }
          o.stroke();
          // trace: most recent full refresh, newest at the right
          const n = Math.min(history.length, list.length);
          const [r, g, b] = pane.color;
          const mid = pane.y + pane.h / 2;
          const amp = pane.h * 0.42;
          for (const [lw, a] of [[5, 0.12], [1.6, 0.9]]) {
            o.lineWidth = lw;
            o.strokeStyle = `rgba(${r},${g},${b},${a})`;
            o.beginPath();
            for (let i = 0; i < n; i++) {
              const p = history[history.length - n + i];
              const v = pane.key === 0 ? p[0] : -p[1];
              const x = pane.x + (i / Math.max(1, list.length - 1)) * pane.w;
              const y = mid - v * amp;
              i ? o.lineTo(x, y) : o.moveTo(x, y);
            }
            o.stroke();
          }
          o.restore();
          const pf = Math.max(9, pane.h * 0.085);
          o.font = `${pf}px ${MONO}`;
          o.textAlign = 'left';
          o.textBaseline = 'top';
          o.fillStyle = `rgba(${r},${g},${b},0.85)`;
          o.fillText(pane.label, pane.x + 10, pane.y + 8);
          o.textAlign = 'right';
          o.fillStyle = 'rgba(200,210,225,0.5)';
          o.fillText(`${(REFRESH * 1000).toFixed(0)} ms sweep`, pane.x + pane.w - 10, pane.y + 8);
        }
      }
    },
  };
}

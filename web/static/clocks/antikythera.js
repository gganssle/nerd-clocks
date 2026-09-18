// Antikythera: a skeleton bronze movement seen through an open zodiac dial.
// The motion work (16 -> 80 -> 15 -> 60 -> 20 -> 60 -> 12 -> 48 -> 12 -> 36)
// steps a one-turn-a-minute wheel down to the twelve-hour wheel at the centre,
// and the lunar train of the real mechanism (64/38, 48/24, 127/32) hangs off
// that same shaft, so the moon pointer runs 254/19 turns per turn of the sun.
// Tooth counts set every ratio; nothing is animated by hand.
import { TAU, mod, pad, timeParts, SANS, MONO } from '../lib/util.js';

const DEG = Math.PI / 180;
const SIDEREAL = 254 / 19;     // sidereal months per "year" (one 12 h turn)
const METONIC = 5 / 19;        // turns of the Metonic pointer per year
const SAROS = 4 / 18.03;       // turns of the Saros pointer per year

const HOUR_NUM = ['Α', 'Β', 'Γ', 'Δ', 'Ε', 'Ϛ', 'Ζ', 'Η', 'Θ', 'Ι', 'ΙΑ', 'ΙΒ'];
const ZODIAC = ['ΚΡΙΟΣ', 'ΤΑΥΡΟΣ', 'ΔΙΔΥΜΟΙ', 'ΚΑΡΚΙΝΟΣ', 'ΛΕΩΝ', 'ΠΑΡΘΕΝΟΣ',
  'ΧΗΛΑΙ', 'ΣΚΟΡΠΙΟΣ', 'ΤΟΞΟΤΗΣ', 'ΑΙΓΟΚΕΡΩΣ', 'ΥΔΡΟΧΟΟΣ', 'ΙΧΘΥΕΣ'];

// The train, in module units (one module = one tooth of pitch diameter / 2).
// `rate` is turns per second, signed; every mesh reverses it and divides by the
// tooth ratio, exactly as brass does.
function buildTrain() {
  const nodes = [];
  const push = (n) => { nodes.push(n); return n; };
  const hub = push({ label: 'b1 · 36', teeth: 36, x: 0, y: 0, rate: 1 / 43200, phase: 0 });

  const mesh = (parent, teeth, dirDeg, label) => {
    const dir = dirDeg * DEG;
    const d = (parent.teeth + teeth) / 2;
    return push({
      label,
      teeth,
      x: parent.x + Math.cos(dir) * d,
      y: parent.y + Math.sin(dir) * d,
      rate: (-parent.rate * parent.teeth) / teeth,
      // a gap facing the driver keeps the teeth interleaved; the ratios above
      // guarantee they stay that way forever
      phase: dir + Math.PI + Math.PI / teeth,
    });
  };
  const coax = (parent, teeth, label) =>
    push({ label, teeth, x: parent.x, y: parent.y, rate: parent.rate, phase: parent.phase + Math.PI / teeth });

  // motion work, read backwards from the hour wheel
  const h2 = mesh(hub, 12, 190, 'c2 · 12');
  const h1 = coax(h2, 48, 'c1 · 48');
  const m2 = mesh(h1, 12, 265, 'd2 · 12');
  const mm = coax(m2, 60, 'd1 · 60');
  const b2s = mesh(mm, 20, 345, 'e2 · 20');
  const bb = coax(b2s, 60, 'e1 · 60');
  const a2 = mesh(bb, 15, 40, 'f2 · 15');
  const aa = coax(a2, 80, 'f1 · 80');
  mesh(aa, 16, 206, 'g1 · 16');   // one turn a minute

  // lunar train (the mechanism's own tooth counts)
  const lb = coax(hub, 64, 'b2 · 64');
  const c1 = mesh(lb, 38, 15, 'l1 · 38');
  const c2 = coax(c1, 48, 'l2 · 48');
  const d1 = mesh(c2, 24, 195, 'm1 · 24');
  const d2 = coax(d1, 127, 'm2 · 127');
  mesh(d2, 32, 130, 'n1 · 32');

  return nodes;
}

// One gear as a Path2D in module units: teeth, rim, spokes cut, hub.
function gearPath(teeth) {
  const p = new Path2D();
  const rp = teeth / 2;                       // pitch radius
  const rt = rp + 0.52, rr = rp - 0.62;       // tip and root
  const half = Math.PI / teeth;               // half a pitch angle
  for (let i = 0; i < teeth; i++) {
    const a = (i * TAU) / teeth;
    const flank = half * 0.34, tip = half * 0.24;
    p.lineTo(Math.cos(a - flank) * rr, Math.sin(a - flank) * rr);
    p.lineTo(Math.cos(a - tip) * rt, Math.sin(a - tip) * rt);
    p.lineTo(Math.cos(a + tip) * rt, Math.sin(a + tip) * rt);
    p.lineTo(Math.cos(a + flank) * rr, Math.sin(a + flank) * rr);
    const next = ((i + 1) * TAU) / teeth;
    p.arc(0, 0, rr, a + flank, next - flank);
  }
  p.closePath();
  return p;
}

function spokePath(teeth) {
  const p = new Path2D();
  const rr = teeth / 2 - 1.2;
  if (rr < 6) return null;
  const arms = teeth >= 96 ? 6 : teeth >= 40 ? 5 : 4;
  const hub = Math.max(2.2, rr * 0.22);
  for (let i = 0; i < arms; i++) {
    const a = (i * TAU) / arms;
    const w = Math.max(0.9, rr * 0.11);
    p.moveTo(Math.cos(a) * hub - Math.sin(a) * w, Math.sin(a) * hub + Math.cos(a) * w);
    p.lineTo(Math.cos(a) * rr - Math.sin(a) * w, Math.sin(a) * rr + Math.cos(a) * w);
    p.lineTo(Math.cos(a) * rr + Math.sin(a) * w, Math.sin(a) * rr - Math.cos(a) * w);
    p.lineTo(Math.cos(a) * hub + Math.sin(a) * w, Math.sin(a) * hub - Math.cos(a) * w);
    p.closePath();
  }
  return p;
}

export function create(host) {
  const surface = host.canvas();
  const { ctx } = surface;
  const gears = buildTrain().map((g) => ({ ...g, path: gearPath(g.teeth), spokes: spokePath(g.teeth) }));
  // biggest first, so small wheels sit on top like a real stacked movement
  const order = [...gears].sort((a, b) => b.teeth - a.teeth);
  // half-span of the bounding box around the central shaft, for fitting
  const reach = Math.max(...gears.flatMap((g) => {
    const r = g.teeth / 2 + 1;
    return [Math.abs(g.x) + r, Math.abs(g.y) + r];
  }));

  function bronze(r, warm) {
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r);
    g.addColorStop(0, warm ? '#f4c98a' : '#cfa46a');
    g.addColorStop(0.45, warm ? '#c08b4a' : '#9c7440');
    g.addColorStop(0.8, '#6d5230');
    g.addColorStop(1, '#3a2c1c');
    return g;
  }

  // An Archimedean spiral dial (Metonic: 5 turns of 235 cells, Saros: 4 of 223).
  function spiralDial(cx, cy, R, turns, cells, turnsPerYear, year, label, sub) {
    if (!(R > 4)) return;
    const inner = R * 0.3;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(210, 165, 105, 0.35)';
    ctx.lineWidth = Math.max(1, R * 0.012);
    ctx.beginPath();
    const steps = 720;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const a = u * turns * TAU - Math.PI / 2;
      const r = inner + (R - inner) * u;
      i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(190, 150, 95, 0.20)';
    ctx.lineWidth = 1;
    for (let i = 0; i < cells; i++) {
      const u = i / cells;
      const a = u * turns * TAU - Math.PI / 2;
      const r = inner + (R - inner) * u;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (r - R * 0.028), Math.sin(a) * (r - R * 0.028));
      ctx.lineTo(Math.cos(a) * (r + R * 0.028), Math.sin(a) * (r + R * 0.028));
      ctx.stroke();
    }
    const u = mod(year * turnsPerYear, turns) / turns;
    const a = u * turns * TAU - Math.PI / 2;
    const r = inner + (R - inner) * u;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255, 214, 140, 0.9)';
    ctx.lineWidth = Math.max(1.5, R * 0.022);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.stroke();
    const dot = ctx.createRadialGradient(Math.cos(a) * r, Math.sin(a) * r, 0, Math.cos(a) * r, Math.sin(a) * r, R * 0.12);
    dot.addColorStop(0, 'rgba(255, 235, 180, 0.95)');
    dot.addColorStop(1, 'rgba(255, 170, 60, 0)');
    ctx.fillStyle = dot;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, R * 0.12, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(232, 198, 145, 0.75)';
    ctx.font = `${Math.max(10, R * 0.13)}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, 0, R + R * 0.1);
    ctx.fillStyle = 'rgba(200, 165, 115, 0.5)';
    ctx.font = `${Math.max(9, R * 0.1)}px ${MONO}`;
    ctx.fillText(sub, 0, R + R * 0.28);
    ctx.restore();
  }

  return {
    frame(now) {
      const W = surface.width, H = surface.height;
      const t = timeParts(now);
      // one continuous local timeline so every wheel is a function of the clock
      const T = now / 1000 - t.date.getTimezoneOffset() * 60;
      const year = T / 43200;            // turns of the hour wheel
      const R = Math.min(W, H);

      ctx.fillStyle = '#0b0906';
      ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(W / 2, H * 0.46, 0, W / 2, H * 0.46, R * 0.8);
      glow.addColorStop(0, 'rgba(120, 80, 35, 0.30)');
      glow.addColorStop(0.6, 'rgba(60, 40, 20, 0.12)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      const cx = W / 2, cy = H * 0.46;
      const dialR = R * 0.38;
      const m = (dialR * 0.99) / reach;   // module in pixels

      // ---- the movement ----------------------------------------------------
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(m, m);
      for (const g of order) {
        const ang = TAU * g.rate * T + g.phase;
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(ang);
        ctx.fillStyle = bronze(g.teeth / 2, g.teeth <= 24);
        ctx.fill(g.path);
        ctx.lineWidth = 0.16;
        ctx.strokeStyle = 'rgba(20, 12, 6, 0.55)';
        ctx.stroke(g.path);
        if (g.spokes) {
          ctx.fillStyle = 'rgba(12, 9, 6, 0.82)';
          ctx.beginPath();
          ctx.arc(0, 0, g.teeth / 2 - 1.2, 0, TAU);
          ctx.fill();
          ctx.fillStyle = bronze(g.teeth / 2, false);
          ctx.fill(g.spokes);
          ctx.strokeStyle = 'rgba(20, 12, 6, 0.45)';
          ctx.stroke(g.spokes);
        }
        ctx.fillStyle = '#2a2015';
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(0.7, g.teeth * 0.035), 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      // gear labels, faint, outside the wheels
      ctx.font = `${Math.max(9, R * 0.012)}px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(226, 190, 135, 0.35)';
      for (const g of gears) {
        if (g.teeth < 30) continue;
        ctx.fillText(g.label, cx + g.x * m, cy + (g.y - g.teeth / 2 - 2.6) * m);
      }

      // ---- open dial rings -------------------------------------------------
      ctx.save();
      ctx.translate(cx, cy);
      const ringOuter = dialR * 1.18, ringInner = dialR * 1.0;
      ctx.beginPath();
      ctx.arc(0, 0, ringOuter, 0, TAU);
      ctx.arc(0, 0, ringInner, 0, TAU, true);
      const rg = ctx.createLinearGradient(-ringOuter, -ringOuter, ringOuter, ringOuter);
      rg.addColorStop(0, '#6a5334');
      rg.addColorStop(0.35, '#b08b53');
      rg.addColorStop(0.6, '#4f3f27');
      rg.addColorStop(1, '#8a6e42');
      ctx.fillStyle = rg;
      ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(255, 220, 160, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, ringOuter, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, ringInner, 0, TAU); ctx.stroke();

      // zodiac: twelve 30° sectors, and the hour numerals inside them
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < 12; i++) {
        const a0 = -Math.PI / 2 + i * (TAU / 12);
        ctx.strokeStyle = 'rgba(40, 26, 12, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a0) * ringInner, Math.sin(a0) * ringInner);
        ctx.lineTo(Math.cos(a0) * ringOuter, Math.sin(a0) * ringOuter);
        ctx.stroke();
        const mid = a0 + TAU / 24;
        const flip = Math.sin(mid) > 0 ? Math.PI : 0;   // keep the lower half upright
        ctx.save();
        ctx.translate(Math.cos(mid) * (ringInner + ringOuter) / 2, Math.sin(mid) * (ringInner + ringOuter) / 2);
        ctx.rotate(mid + Math.PI / 2 + flip);
        ctx.fillStyle = 'rgba(28, 18, 8, 0.85)';
        ctx.font = `${Math.max(9, dialR * 0.052)}px ${SANS}`;
        ctx.fillText(ZODIAC[i], 0, flip ? dialR * 0.075 : -dialR * 0.035);
        ctx.fillStyle = 'rgba(255, 226, 170, 0.85)';
        ctx.font = `600 ${Math.max(11, dialR * 0.07)}px ${SANS}`;
        ctx.fillText(HOUR_NUM[i], 0, flip ? -dialR * 0.005 : dialR * 0.045);
        ctx.restore();
      }
      // minute ticks just inside the ring
      for (let i = 0; i < 60; i++) {
        const a = -Math.PI / 2 + (i / 60) * TAU;
        const len = i % 5 === 0 ? dialR * 0.045 : dialR * 0.022;
        ctx.strokeStyle = i % 5 === 0 ? 'rgba(255, 224, 170, 0.5)' : 'rgba(255, 224, 170, 0.22)';
        ctx.lineWidth = i % 5 === 0 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (ringInner - len), Math.sin(a) * (ringInner - len));
        ctx.lineTo(Math.cos(a) * ringInner, Math.sin(a) * ringInner);
        ctx.stroke();
      }

      // ---- pointers --------------------------------------------------------
      const hourA = -Math.PI / 2 + TAU * mod(year, 1);
      const minA = -Math.PI / 2 + TAU * t.hourFrac;
      const secA = -Math.PI / 2 + TAU * t.minuteFrac;
      const moonA = -Math.PI / 2 + TAU * mod(year * SIDEREAL, 1);

      const pointer = (ang, len, w, color, tail = 0.12) => {
        ctx.save();
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(-len * tail, -w / 2);
        ctx.lineTo(len * 0.86, -w * 0.22);
        ctx.lineTo(len, 0);
        ctx.lineTo(len * 0.86, w * 0.22);
        ctx.lineTo(-len * tail, w / 2);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(30, 18, 8, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      };

      // moon pointer, with the phase ball riding on its tip
      pointer(moonA, dialR * 0.86, dialR * 0.028, 'rgba(206, 214, 232, 0.92)');
      const mx = Math.cos(moonA) * dialR * 0.86, my = Math.sin(moonA) * dialR * 0.86;
      const ballR = dialR * 0.055;
      const phase = mod(year * (SIDEREAL - 1), 1);  // synodic = sidereal − solar
      ctx.save();
      ctx.translate(mx, my);
      ctx.fillStyle = '#12100e';
      ctx.beginPath(); ctx.arc(0, 0, ballR, 0, TAU); ctx.fill();
      // lit fraction: a half disc plus an ellipse for the terminator
      const lit = Math.cos(phase * TAU);
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, ballR, 0, TAU); ctx.clip();
      ctx.fillStyle = '#e8edf6';
      ctx.beginPath();
      const waxing = phase < 0.5;
      ctx.arc(0, 0, ballR, waxing ? -Math.PI / 2 : Math.PI / 2, waxing ? Math.PI / 2 : 1.5 * Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = lit > 0 ? '#12100e' : '#e8edf6';
      ctx.beginPath();
      ctx.ellipse(0, 0, ballR * Math.abs(lit), ballR, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255, 235, 200, 0.6)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, ballR, 0, TAU); ctx.stroke();
      ctx.restore();

      pointer(hourA, dialR * 0.62, dialR * 0.042, 'rgba(255, 206, 120, 0.95)');
      // little sun disc on the hour pointer
      const sx = Math.cos(hourA) * dialR * 0.62, sy = Math.sin(hourA) * dialR * 0.62;
      ctx.globalCompositeOperation = 'lighter';
      const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, dialR * 0.1);
      sun.addColorStop(0, 'rgba(255, 244, 200, 0.95)');
      sun.addColorStop(0.35, 'rgba(255, 190, 80, 0.55)');
      sun.addColorStop(1, 'rgba(255, 140, 20, 0)');
      ctx.fillStyle = sun;
      ctx.beginPath(); ctx.arc(sx, sy, dialR * 0.1, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      pointer(minA, dialR * 0.93, dialR * 0.024, 'rgba(246, 232, 205, 0.92)');
      pointer(secA, dialR * 0.97, dialR * 0.008, 'rgba(255, 150, 90, 0.9)', 0.22);

      ctx.fillStyle = '#eddcc0';
      ctx.beginPath(); ctx.arc(0, 0, dialR * 0.022, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a2015';
      ctx.beginPath(); ctx.arc(0, 0, dialR * 0.009, 0, TAU); ctx.fill();
      ctx.restore();

      // ---- back dials ------------------------------------------------------
      if (W > H * 1.25) {
        const sr = Math.min(R * 0.135, (W / 2 - dialR * 1.3) * 0.62);
        spiralDial(W * 0.5 - dialR * 1.28 - sr * 0.1 - sr, cy, sr, 5, 235, METONIC, year,
          'ΜΕΤΩΝ · Metonic', '235 months / 19 years');
        spiralDial(W * 0.5 + dialR * 1.28 + sr * 0.1 + sr, cy, sr, 4, 223, SAROS, year,
          'ΣΑΡΟΣ · Saros', '223 months / 18.03 years');
      } else {
        // Stacked layout: the side dials drop below the movement.
        const sr = Math.min(W * 0.15, H * 0.085);
        spiralDial(W * 0.19, H * 0.83, sr, 5, 235, METONIC, year, 'Metonic', '235 / 19');
        spiralDial(W * 0.81, H * 0.83, sr, 4, 223, SAROS, year, 'Saros', '223 / 18.03');
      }

      // ---- readout ---------------------------------------------------------
      const fs = Math.max(13, R * 0.021);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `200 ${Math.max(20, R * 0.06)}px ${SANS}`;
      ctx.fillStyle = 'rgba(255, 228, 182, 0.9)';
      ctx.fillText(`${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`, W / 2, H * 0.955);
      ctx.font = `${fs}px ${MONO}`;
      ctx.fillStyle = 'rgba(214, 178, 126, 0.6)';
      const age = phase * 29.53059;
      ctx.fillText(`moon pointer ${(mod(year * SIDEREAL, 1) * 360).toFixed(1).padStart(5, '0')}°   ·   age ${age.toFixed(2)} d   ·   1 turn of b1 = 12 h`, W / 2, H * 0.99);
    },
  };
}

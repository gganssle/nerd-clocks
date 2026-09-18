// Babylon & Maya: the time of day in Babylonian sexagesimal cuneiform, pressed
// into a clay tablet, beside today's date as a Maya Long Count carved in stone.
import { TAU, timeParts, pad, rng, SANS, MONO, clamp } from '../lib/util.js';

const TZOLKIN = ['Imix', 'Ik’', 'Ak’b’al', 'K’an', 'Chikchan', 'Kimi', 'Manik’', 'Lamat', 'Muluk', 'Ok',
  'Chuwen', 'Eb’', 'B’en', 'Ix', 'Men', 'Kib’', 'Kab’an', 'Etz’nab’', 'Kawak', 'Ajaw'];
const HAAB = ['Pop', 'Wo’', 'Sip', 'Sotz’', 'Sek', 'Xul', 'Yaxk’in', 'Mol', 'Ch’en', 'Yax', 'Sak’', 'Keh',
  'Mak', 'K’ank’in', 'Muwan', 'Pax', 'K’ayab', 'Kumk’u', 'Wayeb’'];
const LC_UNITS = [['b’ak’tun', 144000], ['k’atun', 7200], ['tun', 360], ['winal', 20], ['k’in', 1]];
const GMT_CORRELATION = 584283;

export function mayaDate(d) {
  const jdn = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000 + 2440588;
  const days = jdn - GMT_CORRELATION;
  let r = days;
  const longCount = LC_UNITS.map(([, n]) => { const v = Math.floor(r / n); r %= n; return v; });
  const haabDay = (days + 348) % 365;
  return {
    days,
    longCount,
    tzolkin: `${((days + 3) % 13) + 1} ${TZOLKIN[(days + 19) % 20]}`,
    haab: `${haabDay % 20} ${HAAB[Math.floor(haabDay / 20)]}`,
  };
}

// Traditional stacking of wedges.
const UNIT_ROWS = [[], [1], [2], [3], [2, 2], [3, 2], [3, 3], [4, 3], [4, 4], [3, 3, 3]];
const TEN_ROWS = [[], [1], [2], [3], [2, 2], [3, 2]];
// Unit wedges get shorter as more rows are stacked.
const WEDGE_SCALE = [0, 1.15, 0.7, 0.5];

function makeTexture(w, h, seed, base, speck, cracks) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d');
  const r = rng(seed);
  const grad = g.createLinearGradient(0, 0, w * 0.3, h);
  grad.addColorStop(0, base[0]);
  grad.addColorStop(1, base[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const n = Math.round((w * h) / 90);
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, s = r() * 2.2 + 0.4;
    g.fillStyle = r() < 0.5 ? speck[0] : speck[1];
    g.globalAlpha = r() * 0.35;
    g.fillRect(x, y, s, s);
  }
  // Soft blotches
  for (let i = 0; i < 40; i++) {
    const x = r() * w, y = r() * h, s = (r() * 0.2 + 0.05) * Math.min(w, h);
    const b = g.createRadialGradient(x, y, 0, x, y, s);
    b.addColorStop(0, r() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.06)');
    b.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 1;
    g.fillStyle = b;
    g.fillRect(x - s, y - s, 2 * s, 2 * s);
  }
  g.globalAlpha = 1;
  g.strokeStyle = cracks;
  g.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    let x = r() * w, y = r() * h;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 12; k++) {
      x += (r() - 0.5) * w * 0.05;
      y += (r() - 0.3) * h * 0.04;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return c;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function create(host) {
  const surface = host.canvas();
  const { ctx } = surface;
  let tex = { key: '' };
  // Per sexagesimal slot: last value and when it changed (for the press animation).
  const slots = [0, 1, 2].map(() => ({ value: -1, changed: -1e9 }));
  const mayaSlots = [0, 1, 2, 3].map(() => ({ value: -1, changed: -1e9 }));

  // --- cuneiform ---------------------------------------------------------------
  // Vertical wedge: triangular head on top, tapering tail below. (x, y) = top centre.
  function verticalWedge(x, y, s, alpha) {
    const hw = s * 0.26, head = s * 0.34, len = s;
    const path = (dx, dy) => {
      ctx.beginPath();
      ctx.moveTo(x - hw + dx, y + dy);
      ctx.lineTo(x + hw + dx, y + dy);
      ctx.lineTo(x + s * 0.045 + dx, y + head + dy);
      ctx.lineTo(x + s * 0.012 + dx, y + len + dy);
      ctx.lineTo(x - s * 0.012 + dx, y + len + dy);
      ctx.lineTo(x - s * 0.045 + dx, y + head + dy);
      ctx.closePath();
    };
    impress(path, s, alpha);
    // The deep point where the stylus corner went in.
    ctx.fillStyle = `rgba(30, 16, 6, ${0.55 * alpha})`;
    ctx.beginPath();
    ctx.moveTo(x - hw * 0.55, y + s * 0.03);
    ctx.lineTo(x + hw * 0.55, y + s * 0.03);
    ctx.lineTo(x, y + head * 0.8);
    ctx.closePath();
    ctx.fill();
  }

  // Corner wedge (Winkelhaken), pointing left. (x, y) = left tip.
  function cornerWedge(x, y, s, alpha) {
    const w = s * 0.62, h = s * 0.62;
    const path = (dx, dy) => {
      ctx.beginPath();
      ctx.moveTo(x + dx, y + dy);
      ctx.lineTo(x + w + dx, y - h / 2 + dy);
      ctx.lineTo(x + w * 0.62 + dx, y + dy);
      ctx.lineTo(x + w + dx, y + h / 2 + dy);
      ctx.closePath();
    };
    impress(path, s, alpha);
    ctx.fillStyle = `rgba(30, 16, 6, ${0.5 * alpha})`;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.05, y);
    ctx.lineTo(x + w * 0.7, y - h * 0.3);
    ctx.lineTo(x + w * 0.5, y);
    ctx.lineTo(x + w * 0.7, y + h * 0.3);
    ctx.closePath();
    ctx.fill();
  }

  // An impression: lit lower-right rim, dark interior, shadowed upper-left wall.
  function impress(path, s, alpha) {
    const o = Math.max(1, s * 0.035);
    ctx.fillStyle = `rgba(255, 222, 170, ${0.55 * alpha})`;
    path(o, o); ctx.fill();
    ctx.fillStyle = `rgba(58, 34, 14, ${0.95 * alpha})`;
    path(0, 0); ctx.fill();
    ctx.fillStyle = `rgba(120, 78, 40, ${0.6 * alpha})`;
    path(o * 0.8, o * 0.8); ctx.fill();
  }

  // Draw a sexagesimal digit (0–59) centred at (cx, cy). Returns nothing.
  function sexDigit(v, cx, cy, s, since, maxW) {
    if (v === 0) {
      // Late-Babylonian placeholder: two slanted wedges.
      const a = clamp(since / 0.35, 0, 1);
      ctx.save();
      ctx.translate(cx, cy);
      for (let i = 0; i < 2; i++) {
        ctx.save();
        ctx.translate(-s * 0.18 + i * s * 0.36, -s * 0.25 + i * s * 0.05);
        ctx.rotate(-0.75);
        verticalWedge(0, 0, s * 0.55, a);
        ctx.restore();
      }
      ctx.restore();
      return;
    }
    const tens = Math.floor(v / 10), units = v % 10;
    // Shrink wide numbers so they stay inside their column.
    {
      const tw = tens ? Math.max(...TEN_ROWS[tens]) * 0.62 + 0.12 : 0;
      const ur = UNIT_ROWS[units];
      const uw = units ? Math.max(...ur) * 0.62 * WEDGE_SCALE[ur.length] : 0;
      const factor = tw + uw + (tens && units ? 0.18 : 0);
      s = Math.min(s, maxW / factor);
    }
    const tenStep = s * 0.62;
    const tenRows = TEN_ROWS[tens], unitRows = UNIT_ROWS[units];
    const tensW = tens ? Math.max(...tenRows) * tenStep + s * 0.12 : 0;
    const unitWs = units ? s * WEDGE_SCALE[unitRows.length] : 0;
    const unitStep = unitWs * 0.62;
    const unitsW = units ? Math.max(...unitRows) * unitStep : 0;
    const gap = tens && units ? s * 0.18 : 0;
    let x0 = cx - (tensW + gap + unitsW) / 2;
    let order = 0;
    const alphaFor = () => {
      const a = clamp((since - order * 0.06) / 0.25, 0, 1);
      order++;
      return a;
    };
    // Tens
    if (tens) {
      const pitch = s * 0.72;
      const top = cy - ((tenRows.length - 1) * pitch) / 2;
      tenRows.forEach((n, row) => {
        for (let i = 0; i < n; i++) {
          const a = alphaFor();
          if (a <= 0) continue;
          const pop = 1 + (1 - a) * 0.6;
          ctx.save();
          const px = x0 + i * tenStep, py = top + row * pitch;
          ctx.translate(px, py); ctx.scale(pop, pop); ctx.translate(-px, -py);
          cornerWedge(px, py, s, a);
          ctx.restore();
        }
      });
      x0 += tensW + gap;
    }
    if (units) {
      const rows = unitRows.length;
      const ws = unitWs;
      const pitch = ws * 1.08;
      const top = cy - (rows * pitch) / 2 + ws * 0.02;
      unitRows.forEach((n, row) => {
        const rowW = n * unitStep;
        const rx = x0 + (unitsW - rowW) / 2;
        for (let i = 0; i < n; i++) {
          const a = alphaFor();
          if (a <= 0) continue;
          const pop = 1 + (1 - a) * 0.6;
          const px = rx + (i + 0.5) * unitStep, py = top + row * pitch;
          ctx.save();
          ctx.translate(px, py + ws / 2); ctx.scale(pop, pop); ctx.translate(-px, -py - ws / 2);
          verticalWedge(px, py, ws, a);
          ctx.restore();
        }
      });
    }
  }

  // --- Maya numerals --------------------------------------------------------------
  function carved(pathFn, u, alpha = 1) {
    const o = Math.max(1, u * 0.09);
    ctx.fillStyle = `rgba(10, 14, 12, ${0.55 * alpha})`;
    pathFn(o, o); ctx.fill();
    ctx.fillStyle = `rgba(222, 214, 186, ${alpha})`;
    pathFn(0, 0); ctx.fill();
    ctx.fillStyle = `rgba(255, 250, 230, ${0.35 * alpha})`;
    pathFn(-o * 0.4, -o * 0.4);
    ctx.fill();
    ctx.fillStyle = `rgba(200, 190, 160, ${alpha})`;
    pathFn(o * 0.15, o * 0.15); ctx.fill();
  }

  function mayaNumeral(v, cx, cy, u, alpha = 1) {
    if (v === 0) {
      // Shell glyph for zero.
      const path = (dx, dy) => {
        ctx.beginPath();
        ctx.ellipse(cx + dx, cy + dy, u * 1.9, u * 1.05, 0, 0, TAU);
      };
      carved(path, u, alpha);
      ctx.strokeStyle = `rgba(70, 64, 50, ${0.8 * alpha})`;
      ctx.lineWidth = Math.max(1, u * 0.14);
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - u * 1.3, cy + i * u * 0.45);
        ctx.quadraticCurveTo(cx, cy + i * u * 0.45 - u * 0.5, cx + u * 1.3, cy + i * u * 0.45);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx - u * 1.2, cy - u * 0.1, u * 0.22, 0, TAU);
      ctx.stroke();
      return;
    }
    const bars = Math.floor(v / 5), dots = v % 5;
    const barW = u * 4, barH = u * 0.72, pitch = u * 1.0, dotR = u * 0.42;
    const total = bars * pitch + (dots ? pitch : 0);
    let y = cy - total / 2;
    if (dots) {
      const dy = y + pitch / 2;
      for (let i = 0; i < dots; i++) {
        const dx = cx + (i - (dots - 1) / 2) * u * 1.05;
        carved((ox, oy) => { ctx.beginPath(); ctx.arc(dx + ox, dy + oy, dotR, 0, TAU); }, u, alpha);
      }
      y += pitch;
    }
    for (let b = 0; b < bars; b++) {
      const by = y + b * pitch + (pitch - barH) / 2;
      carved((ox, oy) => roundRect(ctx, cx - barW / 2 + ox, by + oy, barW, barH, barH * 0.4), u, alpha);
    }
  }

  function bakeBackground(W, H, dpr, m, tab, stela, lineY1, lineY2, small, inset, ssmall) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W * dpr));
    c.height = Math.max(1, Math.round(H * dpr));
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const clay = makeTexture(tab.w, tab.h, 7, ['#c79a64', '#9c7040'], ['#6e4a26', '#f0cf9c'], 'rgba(70, 45, 20, 0.25)');
    const stone = makeTexture(stela.w, stela.h, 11, ['#6f7a70', '#4a534c'], ['#2e3530', '#aab3a8'], 'rgba(20, 25, 22, 0.35)');

    g.fillStyle = '#0b0908';
    g.fillRect(0, 0, W, H);
    const amb = g.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
    amb.addColorStop(0, 'rgba(90, 60, 30, 0.25)');
    amb.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = amb;
    g.fillRect(0, 0, W, H);

    // Clay tablet
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = m;
    g.shadowOffsetY = m * 0.3;
    roundRect(g, tab.x, tab.y, tab.w, tab.h, Math.min(tab.w, tab.h) * 0.08);
    g.fillStyle = '#a57a48';
    g.fill();
    g.restore();
    g.save();
    roundRect(g, tab.x, tab.y, tab.w, tab.h, Math.min(tab.w, tab.h) * 0.08);
    g.clip();
    g.drawImage(clay, tab.x, tab.y, tab.w, tab.h);
    const bevel = g.createLinearGradient(tab.x, tab.y, tab.x + tab.w, tab.y + tab.h);
    bevel.addColorStop(0, 'rgba(255, 235, 200, 0.18)');
    bevel.addColorStop(0.5, 'rgba(0,0,0,0)');
    bevel.addColorStop(1, 'rgba(40, 20, 0, 0.35)');
    g.fillStyle = bevel;
    g.fillRect(tab.x, tab.y, tab.w, tab.h);
    g.fillStyle = 'rgba(60, 36, 14, 0.8)';
    g.font = `600 ${small}px ${MONO}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('BABYLON · SEXAGESIMAL · BASE 60', tab.x + tab.w / 2, tab.y + small * 2.2);
    for (const ly of [lineY1, lineY2]) {
      g.strokeStyle = 'rgba(70, 42, 18, 0.45)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(tab.x + tab.w * 0.05, ly); g.lineTo(tab.x + tab.w * 0.95, ly); g.stroke();
      g.strokeStyle = 'rgba(255, 225, 180, 0.3)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(tab.x + tab.w * 0.05, ly + 2); g.lineTo(tab.x + tab.w * 0.95, ly + 2); g.stroke();
    }
    g.restore();

    // Stela
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = m;
    g.shadowOffsetY = m * 0.3;
    g.fillStyle = '#4f5851';
    roundRect(g, stela.x, stela.y, stela.w, stela.h, Math.min(stela.w, stela.h) * 0.03);
    g.fill();
    g.restore();
    g.save();
    roundRect(g, stela.x, stela.y, stela.w, stela.h, Math.min(stela.w, stela.h) * 0.03);
    g.clip();
    g.drawImage(stone, stela.x, stela.y, stela.w, stela.h);
    g.strokeStyle = 'rgba(15, 20, 17, 0.5)';
    g.lineWidth = Math.max(2, inset * 0.25);
    roundRect(g, stela.x + inset, stela.y + inset, stela.w - 2 * inset, stela.h - 2 * inset, inset);
    g.stroke();
    g.strokeStyle = 'rgba(210, 205, 180, 0.18)';
    g.lineWidth = 1;
    roundRect(g, stela.x + inset + 2, stela.y + inset + 2, stela.w - 2 * inset, stela.h - 2 * inset, inset);
    g.stroke();
    g.font = `600 ${ssmall}px ${MONO}`;
    g.fillStyle = 'rgba(225, 220, 195, 0.75)';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('MAYA LONG COUNT · BASE 20', stela.x + stela.w / 2, stela.y + inset + ssmall * 1.6);
    g.restore();
    return c;
  }

  return {
    frame(now) {
      const W = surface.width, H = surface.height;
      const t = timeParts(now);
      const sec = now / 1000;
      const portrait = H > W * 1.05;

      const m = Math.max(18, Math.min(W, H) * 0.04);
      const top = portrait ? H * 0.1 : H * 0.15;
      let tab, stela;
      if (portrait) {
        const avail = H - top - m * 2;
        tab = { x: m, y: top, w: W - 2 * m, h: avail * 0.44 };
        stela = { x: m, y: top + avail * 0.44 + m, w: W - 2 * m, h: avail * 0.56 };
      } else {
        const avail = W - m * 3;
        tab = { x: m, y: top, w: avail * 0.54, h: H - top - m * 1.4 };
        stela = { x: m * 2 + avail * 0.54, y: top, w: avail * 0.46, h: H - top - m * 1.4 };
      }

      const lineY1 = tab.y + tab.h * 0.2, lineY2 = tab.y + tab.h * 0.74;
      const small = Math.max(11, Math.min(tab.w, tab.h) * 0.032);
      const inset = Math.min(stela.w, stela.h) * 0.035;
      const ssmall = Math.max(11, Math.min(stela.w, stela.h) * 0.03);

      const key = `${W}x${H}x${surface.dpr}`;
      if (tex.key !== key) {
        tex = { key, bg: bakeBackground(W, H, surface.dpr, m, tab, stela, lineY1, lineY2, small, inset, ssmall) };
      }
      ctx.drawImage(tex.bg, 0, 0, W, H);

      ctx.save();
      roundRect(ctx, tab.x, tab.y, tab.w, tab.h, Math.min(tab.w, tab.h) * 0.08);
      ctx.clip();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const values = [t.h, t.m, t.s];
      const colW = tab.w / 3;
      const s = Math.min(colW * 0.45, (lineY2 - lineY1) * 0.4);
      values.forEach((v, i) => {
        const slot = slots[i];
        if (slot.value !== v) {
          slot.changed = slot.value === -1 ? sec - 10 : sec;
          slot.value = v;
        }
        const ccx = tab.x + colW * (i + 0.5);
        const ccy = (lineY1 + lineY2) / 2;
        sexDigit(v, ccx, ccy, s, sec - slot.changed, colW * 0.74);
        if (i < 2) {
          // column divider: a single scratched vertical stroke
          const dx = tab.x + colW * (i + 1);
          ctx.strokeStyle = 'rgba(70, 42, 18, 0.3)';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(dx, lineY1 + s * 0.3); ctx.lineTo(dx, lineY2 - s * 0.3); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(55, 32, 12, 0.85)';
        ctx.font = `500 ${small * 1.6}px ${SANS}`;
        ctx.fillText(pad(v), ccx, lineY2 + small * 2.2);
        ctx.font = `${small * 0.85}px ${MONO}`;
        ctx.fillStyle = 'rgba(55, 32, 12, 0.6)';
        ctx.fillText(['hours', 'minutes', 'seconds'][i], ccx, lineY2 + small * 3.9);
      });
      ctx.font = `${small * 0.9}px ${MONO}`;
      ctx.fillStyle = 'rgba(55, 32, 12, 0.65)';
      const secs = t.h * 3600 + t.m * 60 + t.s;
      ctx.fillText(`${t.h}·60² + ${t.m}·60 + ${t.s} = ${secs.toLocaleString('en-US')} s since midnight`, tab.x + tab.w / 2, tab.y + tab.h - small * 1.8);
      ctx.restore();

      // ===== Maya stela =====
      ctx.save();
      roundRect(ctx, stela.x, stela.y, stela.w, stela.h, Math.min(stela.w, stela.h) * 0.03);
      ctx.clip();

      const md = mayaDate(t.date);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const rowsTop = stela.y + inset + ssmall * 3.2;
      const rowsBottom = stela.y + stela.h * 0.66;
      const rowH = (rowsBottom - rowsTop) / 5;
      const u = Math.min(rowH * 0.2, stela.w * 0.035);
      const numX = stela.x + stela.w * 0.3;
      LC_UNITS.forEach(([name, n], i) => {
        const cy = rowsTop + rowH * (i + 0.5);
        mayaNumeral(md.longCount[i], numX, cy, u);
        ctx.textAlign = 'left';
        ctx.font = `500 ${ssmall * 1.25}px ${SANS}`;
        ctx.fillStyle = 'rgba(235, 230, 205, 0.92)';
        ctx.fillText(`${md.longCount[i]}`, stela.x + stela.w * 0.52, cy - ssmall * 0.55);
        ctx.font = `${ssmall * 0.85}px ${MONO}`;
        ctx.fillStyle = 'rgba(225, 220, 195, 0.6)';
        ctx.fillText(`${name} · ${n.toLocaleString('en-US')} day${n === 1 ? '' : 's'}`, stela.x + stela.w * 0.52, cy + ssmall * 0.75);
      });

      // Calendar round
      ctx.textAlign = 'center';
      const crY = stela.y + stela.h * 0.72;
      ctx.font = `500 ${ssmall * 1.2}px ${SANS}`;
      ctx.fillStyle = 'rgba(240, 232, 200, 0.95)';
      ctx.fillText(`${md.longCount.join('.')}  ·  ${md.tzolkin}  ${md.haab}`, stela.x + stela.w / 2, crY);
      ctx.font = `${ssmall * 0.8}px ${MONO}`;
      ctx.fillStyle = 'rgba(225, 220, 195, 0.55)';
      ctx.fillText(`${md.days.toLocaleString('en-US')} days since 4 Ajaw 8 Kumk’u (11 Aug 3114 BCE)`, stela.x + stela.w / 2, crY + ssmall * 1.5);

      // Time of day as a vigesimal fraction.
      let f = t.dayFrac;
      const digits = [];
      for (let i = 0; i < 4; i++) { f *= 20; const dgt = Math.floor(f); digits.push(dgt); f -= dgt; }
      const tfY = stela.y + stela.h * 0.86;
      const tu = Math.min(u * 0.8, stela.w * 0.022);
      const span = stela.w * 0.7;
      digits.forEach((dgt, i) => {
        const slot = mayaSlots[i];
        if (slot.value !== dgt) { slot.changed = slot.value === -1 ? sec - 10 : sec; slot.value = dgt; }
        const a = clamp((sec - slot.changed) / 0.3, 0, 1);
        const cx = stela.x + (stela.w - span) / 2 + span * ((i + 0.5) / 4);
        mayaNumeral(dgt, cx, tfY, tu, 0.35 + 0.65 * a);
        ctx.font = `${ssmall * 0.75}px ${MONO}`;
        ctx.fillStyle = 'rgba(225, 220, 195, 0.55)';
        ctx.fillText(`${dgt}`, cx, tfY + tu * 3.2);
      });
      ctx.font = `${ssmall * 0.75}px ${MONO}`;
      ctx.fillStyle = 'rgba(225, 220, 195, 0.6)';
      ctx.fillText('today so far, in twentieths: 72 min · 3.6 min · 10.8 s · 0.54 s', stela.x + stela.w / 2, tfY - tu * 3.4);
      ctx.restore();
    },
  };
}

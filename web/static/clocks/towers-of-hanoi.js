// Towers of Hanoi: 16 disks, 65,535 moves, spread evenly over one day.
// The state is computed in closed form from the move number, so any moment of
// the day can be drawn instantly without replaying the solution.
import { TAU, clamp, easeInOut, timeParts, pad, SANS, MONO } from '../lib/util.js';

const N = 16;
const TOTAL = 2 ** N - 1; // 65,535
const SLOT = 2 ** N; // day is split into 65,536 slots (~1.318 s each)

// Peg of disk i (0 = smallest) after k moves of the optimal A -> C solution.
// Disk i moves every 2^(i+1) moves, first at move 2^i, always cycling the same
// direction: +1 peg when (N - i) is even, -1 peg when it is odd.
function pegOf(i, k) {
  const moves = Math.floor((k + 2 ** i) / 2 ** (i + 1));
  const dir = (N - i) % 2 === 0 ? 1 : 2;
  return (dir * moves) % 3;
}

// Index of the disk moved on move m (1-based) = number of trailing zeros of m.
const ctz = (m) => 31 - Math.clz32(m & -m);

const hue = (i) => 350 - (i / (N - 1)) * 290; // small = red ... large = violet

export function create(host) {
  const surface = host.canvas();
  const { ctx } = surface;

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function drawDisk(i, cx, y, geo, alpha = 1) {
    const w = geo.minW + (geo.maxW - geo.minW) * (i / (N - 1));
    const h = geo.diskH * 0.9;
    const x = cx - w / 2;
    const top = y - h;
    const g = ctx.createLinearGradient(0, top, 0, y);
    const H = hue(i);
    g.addColorStop(0, `hsla(${H}, 95%, 78%, ${alpha})`);
    g.addColorStop(0.35, `hsla(${H}, 90%, 58%, ${alpha})`);
    g.addColorStop(1, `hsla(${H}, 85%, 26%, ${alpha})`);
    ctx.fillStyle = g;
    roundRect(x, top, w, h, h / 2);
    ctx.fill();
    // specular highlight
    ctx.fillStyle = `rgba(255,255,255,${0.35 * alpha})`;
    roundRect(x + h * 0.5, top + h * 0.14, w - h, h * 0.2, h * 0.1);
    ctx.fill();
    // side shading for a cylindrical feel
    const s = ctx.createLinearGradient(x, 0, x + w, 0);
    s.addColorStop(0, `rgba(0,0,0,${0.35 * alpha})`);
    s.addColorStop(0.18, 'rgba(0,0,0,0)');
    s.addColorStop(0.82, 'rgba(0,0,0,0)');
    s.addColorStop(1, `rgba(0,0,0,${0.35 * alpha})`);
    ctx.fillStyle = s;
    roundRect(x, top, w, h, h / 2);
    ctx.fill();
  }

  function drawScene(state, geo, alpha) {
    const { pegX, baseY, pegH } = geo;
    // pegs
    for (let p = 0; p < 3; p++) {
      const pw = geo.diskH * 0.42;
      const g = ctx.createLinearGradient(pegX[p] - pw / 2, 0, pegX[p] + pw / 2, 0);
      g.addColorStop(0, `rgba(90,95,110,${alpha})`);
      g.addColorStop(0.35, `rgba(240,242,250,${alpha})`);
      g.addColorStop(0.6, `rgba(150,155,170,${alpha})`);
      g.addColorStop(1, `rgba(50,52,62,${alpha})`);
      ctx.fillStyle = g;
      roundRect(pegX[p] - pw / 2, baseY - pegH, pw, pegH, pw / 2);
      ctx.fill();
    }
    // base
    const bw = geo.pegX[2] - geo.pegX[0] + geo.maxW * 1.12;
    const bh = geo.diskH * 0.6;
    const bg = ctx.createLinearGradient(0, baseY, 0, baseY + bh);
    bg.addColorStop(0, `rgba(120,110,100,${alpha})`);
    bg.addColorStop(0.15, `rgba(70,60,55,${alpha})`);
    bg.addColorStop(1, `rgba(28,24,22,${alpha})`);
    ctx.fillStyle = bg;
    roundRect(geo.cx - bw / 2, baseY, bw, bh, bh * 0.3);
    ctx.fill();

    // stacked disks
    for (let p = 0; p < 3; p++) {
      state.stacks[p].forEach((i, level) => drawDisk(i, pegX[p], baseY - level * geo.diskH, geo, alpha));
    }
    if (state.moving) {
      const m = state.moving;
      drawDisk(m.disk, m.x, m.y, geo, alpha);
    }
  }

  return {
    frame(now) {
      const W = surface.width, H = surface.height;
      const t = timeParts(now);
      const pos = t.dayFrac * SLOT;
      const k = Math.min(TOTAL, Math.floor(pos));
      const frac = pos - Math.floor(pos);

      // Background
      ctx.fillStyle = '#07060a';
      ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, Math.max(W, H) * 0.65);
      glow.addColorStop(0, 'rgba(70, 50, 90, 0.35)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      // Geometry
      const U = Math.min(W, H);
      const spacing = Math.min(W / 3.15, H * 0.62);
      const cx = W / 2;
      const pegX = [cx - spacing, cx, cx + spacing];
      const maxW = spacing * 0.88;
      const diskH = Math.min(H * 0.026, maxW * 0.13);
      const geo = {
        cx, pegX, maxW, minW: maxW * 0.16, diskH,
        baseY: H * 0.72, pegH: diskH * (N + 1.6),
      };

      // State after k moves; move k+1 (if any) is animating.
      const pegs = Array.from({ length: N }, (_, i) => pegOf(i, k));
      let moving = null;
      let movingDisk = -1;
      if (k < TOTAL) {
        const m = k + 1;
        movingDisk = ctz(m);
        const from = pegs[movingDisk];
        const to = pegOf(movingDisk, m);
        // Motion takes the first 80% of the slot, then rests on the new peg.
        const f = clamp(frac / 0.8, 0, 1);
        if (f >= 1) {
          pegs[movingDisk] = to;
        } else {
          pegs[movingDisk] = -1;
          const countOn = (p) => pegs.filter((q) => q === p).length;
          const y0 = geo.baseY - countOn(from) * diskH;
          const y1 = geo.baseY - countOn(to) * diskH;
          const liftY = geo.baseY - geo.pegH - diskH * 1.6;
          const x0 = pegX[from], x1 = pegX[to];
          // path length in three legs: up, across (arc), down
          const up = y0 - liftY, across = Math.abs(x1 - x0) * 1.2, down = y1 - liftY;
          const total = up + across + down;
          const d = easeInOut(f) * total;
          let x, y;
          if (d < up) { x = x0; y = y0 - d; }
          else if (d < up + across) {
            const a = (d - up) / across;
            x = x0 + (x1 - x0) * easeInOut(a);
            y = liftY - Math.sin(a * Math.PI) * diskH * 2.2;
          } else { x = x1; y = liftY + (d - up - across); }
          moving = { disk: movingDisk, x, y };
        }
      }
      const stacks = [[], [], []];
      for (let i = N - 1; i >= 0; i--) if (pegs[i] >= 0) stacks[pegs[i]].push(i);
      const state = { stacks, moving };

      // Reflection (mirror about the base line), then the scene.
      const baseBottom = geo.baseY + diskH * 0.6;
      ctx.save();
      ctx.translate(0, baseBottom * 2);
      ctx.scale(1, -1);
      drawScene(state, geo, 0.16);
      ctx.restore();
      const fade = ctx.createLinearGradient(0, baseBottom, 0, baseBottom + H * 0.16);
      fade.addColorStop(0, 'rgba(7,6,10,0.2)');
      fade.addColorStop(1, 'rgba(7,6,10,1)');
      ctx.fillStyle = fade;
      ctx.fillRect(0, baseBottom, W, H - baseBottom);
      drawScene(state, geo, 1);

      // Peg labels
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = `${Math.max(11, U * 0.016)}px ${MONO}`;
      ctx.fillStyle = 'rgba(220,220,235,0.45)';
      ['A · midnight', 'B', 'C · next midnight'].forEach((s, p) => ctx.fillText(s, pegX[p], baseBottom + diskH * 0.5));

      // Time readout
      ctx.textBaseline = 'alphabetic';
      const big = Math.min(W * 0.075, H * 0.085);
      ctx.font = `200 ${big}px ${SANS}`;
      ctx.fillStyle = 'rgba(240,236,255,0.94)';
      ctx.fillText(`${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`, W / 2, H * 0.045 + big * 0.85);

      // Bit rows: binary move counter and its Gray code. The Gray code bit i
      // flips exactly when disk i moves.
      const shown = frac >= 0.8 || k >= TOTAL ? Math.min(TOTAL, k + (k < TOTAL ? 1 : 0)) : k;
      const gray = shown ^ (shown >> 1);
      const cell = Math.min((W * 0.8) / (N + 6), H * 0.034);
      const rowX = W / 2 - (N * cell) / 2 + cell * 1.5;
      const rows = [
        { label: 'binary', v: shown, y: H * 0.855 },
        { label: 'gray', v: gray, y: H * 0.855 + cell * 1.3 },
      ];
      ctx.font = `${Math.max(10, cell * 0.42)}px ${MONO}`;
      for (const row of rows) {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(200,200,220,0.5)';
        ctx.fillText(row.label, rowX - cell * 0.6, row.y + cell * 0.45);
        for (let b = N - 1; b >= 0; b--) {
          const col = N - 1 - b;
          const x = rowX + col * cell;
          const on = (row.v >> b) & 1;
          const active = b === movingDisk;
          ctx.fillStyle = on ? `hsla(${hue(b)}, 90%, ${active ? 70 : 58}%, ${active ? 1 : 0.9})` : 'rgba(255,255,255,0.06)';
          roundRect(x + cell * 0.08, row.y, cell * 0.84, cell * 0.9, cell * 0.18);
          ctx.fill();
          if (active) {
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = Math.max(1.5, cell * 0.06);
            ctx.stroke();
          }
          ctx.textAlign = 'center';
          ctx.fillStyle = on ? 'rgba(10,8,14,0.85)' : 'rgba(255,255,255,0.28)';
          ctx.fillText(on ? '1' : '0', x + cell / 2, row.y + cell * 0.47);
        }
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `${Math.max(12, U * 0.02)}px ${MONO}`;
      ctx.fillStyle = 'rgba(220,215,240,0.7)';
      const moveNo = Math.min(TOTAL, k + 1);
      const verb = frac >= 0.8 ? 'moved' : 'moving';
      const note = movingDisk === N - 1 ? `   ·   the big disk is ${verb}: noon` : `   ·   disk ${movingDisk + 1} ${verb}`;
      ctx.fillText(`move ${moveNo.toLocaleString('en-US')} of ${TOTAL.toLocaleString('en-US')}${k < TOTAL ? note : ''}`, W / 2, H * 0.975);
    },
  };
}

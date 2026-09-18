// Penrose Mosaic: a P3 rhombus tiling grown by deflating Robinson triangles.
// The tiling never repeats, but it is self-similar: inflate it by φ and you get
// the same tiling back. So the minute is a continuous zoom by exactly φ, which
// lands on itself at every minute boundary; the hour turns the whole mosaic and
// the second sweeps a light around it.
import { TAU, mod, pad, timeParts, SANS, MONO } from '../lib/util.js';

const PHI = (1 + Math.sqrt(5)) / 2;
const DEPTH = 7;

// Robinson triangle deflation. Kind 0 is half a thin rhombus (36°),
// kind 1 is half a fat one (72°); each child is φ times smaller.
function deflate(tris) {
  const out = [];
  for (const [k, ax, ay, bx, by, cx, cy] of tris) {
    if (k === 0) {
      const px = ax + (bx - ax) / PHI, py = ay + (by - ay) / PHI;
      out.push([0, cx, cy, px, py, bx, by]);
      out.push([1, px, py, cx, cy, ax, ay]);
    } else {
      const qx = bx + (ax - bx) / PHI, qy = by + (ay - by) / PHI;
      const rx = bx + (cx - bx) / PHI, ry = by + (cy - by) / PHI;
      out.push([1, rx, ry, cx, cy, ax, ay]);
      out.push([1, qx, qy, rx, ry, bx, by]);
      out.push([0, rx, ry, qx, qy, ax, ay]);
    }
  }
  return out;
}

function buildTiling(depth) {
  let tris = [];
  for (let i = 0; i < 10; i++) {          // a "sun" of ten triangles
    const a0 = ((2 * i - 1) * Math.PI) / 10, a1 = ((2 * i + 1) * Math.PI) / 10;
    let bx = Math.cos(a0), by = Math.sin(a0);
    let cx = Math.cos(a1), cy = Math.sin(a1);
    if (i % 2 === 0) { [bx, cx] = [cx, bx]; [by, cy] = [cy, by]; }
    tris.push([0, 0, 0, bx, by, cx, cy]);
  }
  for (let i = 0; i < depth; i++) tris = deflate(tris);
  return tris.map(([k, ax, ay, bx, by, cx, cy]) => {
    const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3;
    return { k, ax, ay, bx, by, cx, cy, mx, my, r: Math.hypot(mx, my), a: Math.atan2(my, mx) };
  });
}

export function create(host) {
  const surface = host.canvas();
  const { ctx } = surface;
  const tiles = buildTiling(DEPTH);
  const fat = tiles.filter((t) => t.k === 1).length / 2;
  const thin = tiles.filter((t) => t.k === 0).length / 2;

  return {
    frame(now) {
      const W = surface.width, H = surface.height;
      const R = Math.min(W, H);
      const diag = Math.hypot(W, H) / 2;
      const t = timeParts(now);

      ctx.fillStyle = '#05030a';
      ctx.fillRect(0, 0, W, H);

      // The hour turns the mosaic; the minute zooms it by φ, which is a
      // symmetry of the tiling, so the zoom is seamless at 00 seconds.
      const spin = (t.h % 12) / 12 * TAU + t.hourFrac * (TAU / 12);
      const zoom = Math.pow(PHI, t.minuteFrac);
      const base = diag * 1.15;
      const sweep = t.minuteFrac * TAU - Math.PI / 2;

      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(spin);
      ctx.scale(base * zoom, base * zoom);
      ctx.lineJoin = 'round';

      const px = 1 / (base * zoom);         // one device pixel in tiling units
      const limit = diag / (base * zoom) * 1.05;

      for (const tile of tiles) {
        if (tile.r - 0.02 > limit) continue;
        // Angle behind or ahead of the sweeping line: a sharp leading edge and
        // a long afterglow trailing it.
        const d = mod(tile.a + spin - sweep + Math.PI, TAU) - Math.PI;
        const lit = d > 0
          ? Math.max(0, 1 - d / 0.22) ** 2
          : Math.max(0, 1 + d / 1.9) ** 2.6;
        const depthShade = Math.min(1, tile.r / limit);

        const hue = tile.k ? 268 : 196;
        const l = (tile.k ? 20 : 27) + lit * 48 - depthShade * 8;
        const s = 62 + lit * 30;
        ctx.fillStyle = `hsl(${hue + lit * 34}, ${s}%, ${l}%)`;
        ctx.beginPath();
        ctx.moveTo(tile.ax, tile.ay);
        ctx.lineTo(tile.bx, tile.by);
        ctx.lineTo(tile.cx, tile.cy);
        ctx.closePath();
        ctx.fill();

        // The rhombus edges are A–B and A–C; B–C is the internal diagonal.
        ctx.strokeStyle = `hsla(${hue + 40}, 90%, ${52 + lit * 40}%, ${0.22 + lit * 0.72})`;
        ctx.lineWidth = px * (0.7 + lit * 1.6);
        ctx.beginPath();
        ctx.moveTo(tile.bx, tile.by);
        ctx.lineTo(tile.ax, tile.ay);
        ctx.lineTo(tile.cx, tile.cy);
        ctx.stroke();
      }
      ctx.restore();

      // Sweep beam and the hour pointer.
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.globalCompositeOperation = 'lighter';
      const beam = ctx.createLinearGradient(0, 0, Math.cos(sweep) * diag, Math.sin(sweep) * diag);
      beam.addColorStop(0, 'rgba(255, 245, 210, 0.30)');
      beam.addColorStop(1, 'rgba(255, 180, 90, 0)');
      ctx.strokeStyle = beam;
      ctx.lineWidth = Math.max(2, R * 0.006);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(sweep) * diag, Math.sin(sweep) * diag);
      ctx.stroke();
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.16);
      core.addColorStop(0, 'rgba(255, 240, 210, 0.42)');
      core.addColorStop(1, 'rgba(180, 120, 255, 0)');
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.16, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();

      // Vignette so the readouts stay legible over the mosaic.
      const vig = ctx.createRadialGradient(W / 2, H / 2, R * 0.2, W / 2, H / 2, diag);
      vig.addColorStop(0, 'rgba(5, 3, 10, 0)');
      vig.addColorStop(1, 'rgba(5, 3, 10, 0.82)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      // ---- readouts --------------------------------------------------------
      const label = `${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `200 ${Math.min(R * 0.14, W * 0.2)}px ${SANS}`;
      ctx.fillStyle = 'rgba(8, 5, 16, 0.55)';
      ctx.fillText(label, W / 2 + 2, H / 2 + 3);
      ctx.fillStyle = 'rgba(245, 238, 255, 0.96)';
      ctx.fillText(label, W / 2, H / 2);

      ctx.font = `${Math.max(10, R * 0.018)}px ${MONO}`;
      ctx.fillStyle = 'rgba(205, 190, 245, 0.7)';
      ctx.fillText(`zoom ×${zoom.toFixed(4)} of φ = ${PHI.toFixed(6)}`, W / 2, H / 2 + R * 0.1);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(190, 175, 235, 0.6)';
      const pad0 = R * 0.045;
      ctx.fillText('Penrose P3 · deflation depth ' + DEPTH, pad0, pad0);
      ctx.fillText(`${fat.toLocaleString()} fat : ${thin.toLocaleString()} thin rhombi`, pad0, pad0 + R * 0.028);
      ctx.fillText(`ratio ${(fat / thin).toFixed(6)} → φ`, pad0, pad0 + R * 0.056);

      ctx.textAlign = 'right';
      ctx.fillText('hour = rotation of the mosaic', W - pad0, pad0);
      ctx.fillText('minute = one inflation by φ', W - pad0, pad0 + R * 0.028);
      ctx.fillText('second = the sweeping light', W - pad0, pad0 + R * 0.056);

      // Hour hand marker on the rim: where 12 o'clock has been rotated to.
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(spin - Math.PI / 2);
      ctx.fillStyle = 'rgba(255, 228, 160, 0.9)';
      ctx.beginPath();
      const rr = R * 0.47;
      ctx.moveTo(rr, 0);
      ctx.lineTo(rr - R * 0.035, -R * 0.014);
      ctx.lineTo(rr - R * 0.035, R * 0.014);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
  };
}

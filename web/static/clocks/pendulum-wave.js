// Pendulum Wave: 18 uncoupled pendulums whose lengths are tuned so pendulum n
// completes exactly (N0 + n) swings per minute. They all line up at :00 and the
// whole dance of snakes, braids and apparent chaos repeats every 60 seconds.
import { TAU, timeParts, pad, SANS, MONO } from '../lib/util.js';

const COUNT = 18;
const N0 = 51; // swings per minute of the longest pendulum
const G = 9.81;

export function create(host) {
  const surface = host.canvas();
  const { ctx } = surface;
  const pend = Array.from({ length: COUNT }, (_, n) => {
    const swings = N0 + n;
    const period = 60 / swings;
    return { swings, period, length: G * (period / TAU) ** 2, hue: 190 + (n / (COUNT - 1)) * 150 };
  });
  const maxLen = pend[0].length;

  return {
    frame(now) {
      const s = surface;
      const W = s.width, H = s.height;
      const t = timeParts(now);
      // Seconds into the current minute, continuous across the minute boundary
      // (every pendulum makes a whole number of swings per minute).
      const tm = t.minuteFrac * 60;
      const amp = 0.42; // radians

      ctx.fillStyle = '#04050a';
      ctx.fillRect(0, 0, W, H);
      const bg = ctx.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.35, Math.max(W, H) * 0.7);
      bg.addColorStop(0, 'rgba(60, 70, 120, 0.22)');
      bg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Camera: the row of pendulums runs left-right; they swing towards and
      // away from us. Viewed from above and slightly to the side so the
      // travelling wave reads as a snake. The camera drifts slowly.
      const yaw = 0.16 * Math.sin(now / 41000);
      const pitch = 0.62 + 0.05 * Math.sin(now / 29000);
      const cyaw = Math.cos(yaw), syaw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const span = 1.1; // metres from first to last pendulum
      const dist = 1.75;
      const scale = Math.min(W * 0.8, H * 1.55);
      const cx = W / 2, cy = H * 0.4;
      const pivotY = maxLen * 0.55;
      const project = (x, y, z) => {
        const x1 = x * cyaw + z * syaw;
        const z1 = -x * syaw + z * cyaw;
        const y1 = y * cp + z1 * sp;
        const z2 = -y * sp + z1 * cp + dist;
        const f = scale / z2;
        return [cx + x1 * f, cy - y1 * f, f];
      };

      const floorY = pivotY - maxLen - 0.06;
      const items = pend.map((p, n) => {
        const x = (n / (COUNT - 1) - 0.5) * span;
        const theta = amp * Math.cos((TAU * tm) / p.period);
        const bz = -p.length * Math.sin(theta);
        const by = pivotY - p.length * Math.cos(theta);
        return { p, n, theta, pivot: project(x, pivotY, 0), bob: project(x, by, bz), shadow: project(x, floorY, bz) };
      });

      // Frame: top beam and two posts.
      const beamA = project(-span / 2 - 0.08, pivotY, 0), beamB = project(span / 2 + 0.08, pivotY, 0);
      const footA = project(-span / 2 - 0.08, floorY, 0), footB = project(span / 2 + 0.08, floorY, 0);
      ctx.strokeStyle = 'rgba(190, 200, 235, 0.28)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(footA[0], footA[1]); ctx.lineTo(beamA[0], beamA[1]); ctx.lineTo(beamB[0], beamB[1]); ctx.lineTo(footB[0], footB[1]);
      ctx.stroke();

      // Floor grid for depth.
      ctx.strokeStyle = 'rgba(120, 140, 200, 0.07)';
      ctx.lineWidth = 1;
      for (let i = -6; i <= 6; i++) {
        const u = project(i * 0.12, floorY, -0.3), v = project(i * 0.12, floorY, 0.3);
        ctx.beginPath(); ctx.moveTo(u[0], u[1]); ctx.lineTo(v[0], v[1]); ctx.stroke();
      }
      for (let j = -2; j <= 2; j++) {
        const u = project(-0.72, floorY, j * 0.15), v = project(0.72, floorY, j * 0.15);
        ctx.beginPath(); ctx.moveTo(u[0], u[1]); ctx.lineTo(v[0], v[1]); ctx.stroke();
      }

      // Floor shadows and the wave curve through them.
      for (const it of items) {
        const [sx, sy, f] = it.shadow;
        ctx.fillStyle = `hsla(${it.p.hue}, 80%, 60%, 0.13)`;
        ctx.beginPath();
        ctx.ellipse(sx, sy, f * 0.028, f * 0.028 * sp, 0, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      items.forEach((it, i) => (i ? ctx.lineTo(it.shadow[0], it.shadow[1]) : ctx.moveTo(it.shadow[0], it.shadow[1])));
      ctx.stroke();

      // Far-to-near so nearer bobs overlap farther ones.
      const order = [...items].sort((u, v) => u.bob[2] - v.bob[2]);
      for (const it of order) {
        const [px, py] = it.pivot;
        const [bx, by, f] = it.bob;
        const r = f * 0.021;
        ctx.strokeStyle = `hsla(${it.p.hue}, 50%, 80%, 0.4)`;
        ctx.lineWidth = Math.max(1, f * 0.0014);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(bx, by); ctx.stroke();

        ctx.globalCompositeOperation = 'lighter';
        const glow = ctx.createRadialGradient(bx, by, 0, bx, by, r * 3.2);
        glow.addColorStop(0, `hsla(${it.p.hue}, 100%, 65%, 0.35)`);
        glow.addColorStop(1, `hsla(${it.p.hue}, 100%, 50%, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(bx, by, r * 3.2, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        const body = ctx.createRadialGradient(bx - r * 0.35, by - r * 0.4, r * 0.05, bx, by, r);
        body.addColorStop(0, `hsla(${it.p.hue}, 100%, 94%, 1)`);
        body.addColorStop(0.35, `hsla(${it.p.hue}, 90%, 62%, 1)`);
        body.addColorStop(1, `hsla(${it.p.hue}, 80%, 22%, 1)`);
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.fill();
      }

      // Readout
      const big = Math.min(W * 0.11, H * 0.16);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `200 ${big}px ${SANS}`;
      ctx.fillStyle = 'rgba(235, 240, 255, 0.92)';
      ctx.fillText(`${pad(t.h)}:${pad(t.m)}`, W / 2, H * 0.885);

      // Seconds dial: 60 ticks, lit up to the current second.
      const dialW = Math.min(W * 0.5, 900), dx = W / 2 - dialW / 2, dy = H * 0.94;
      for (let i = 0; i < 60; i++) {
        const x = dx + (i / 59) * dialW;
        const on = i <= t.s;
        ctx.fillStyle = on ? `hsla(${190 + (i / 59) * 150}, 90%, 65%, ${i === t.s ? 1 : 0.6})` : 'rgba(255,255,255,0.10)';
        const hgt = i % 15 === 0 ? 14 : i % 5 === 0 ? 9 : 5;
        ctx.fillRect(x - 1, dy - hgt / 2, 2, hgt);
      }
      ctx.font = `${Math.max(11, big * 0.1)}px ${MONO}`;
      ctx.fillStyle = 'rgba(200, 210, 240, 0.55)';
      const left = 60 - tm;
      ctx.fillText(`realignment in ${left.toFixed(1).padStart(4, '0')} s`, W / 2, H * 0.975);
    },
  };
}

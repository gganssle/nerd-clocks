// Caesium Fountain: the SI second, built the way NIST-F2 builds it. A ball of
// laser-cooled caesium is tossed up once a second, crosses the microwave cavity
// on the way up and again on the way down (Ramsey's separated fields), and the
// counter racks up 9,192,631,770 cycles of the hyperfine transition — which is
// the definition of one second.
import { TAU, mod, pad, rng, timeParts, SANS, MONO } from '../lib/util.js';

const HYPERFINE = 9192631770;     // Hz, exact by definition since 1967
const ATOMS = 420;
const FLIGHT = 1;                 // s from launch to catch: one tick

export function create(host) {
  const surface = host.canvas();
  const { ctx } = surface;
  const rand = rng(0x5eed);
  // A cold cloud: gaussian in position, gaussian in velocity, so it expands
  // ballistically exactly like a real one at ~1 µK.
  const cloud = Array.from({ length: ATOMS }, () => {
    const g = () => (rand() + rand() + rand() + rand() - 2) / 1.2;
    return { x: g() * 0.16, y: g() * 0.14, vx: g() * 0.075, vy: g() * 0.05, bright: 0.45 + rand() * 0.55 };
  });

  return {
    frame(now) {
      const W = surface.width, H = surface.height;
      const R = Math.min(W, H);
      const t = timeParts(now);
      const u = t.secondFrac;                 // seconds into the current tick
      // Ballistic toss: apex at u = 0.5, back at the trap at u = 1.
      const rise = (p) => 4 * p * (1 - p);    // 0 at launch/catch, 1 at apex

      ctx.fillStyle = '#01040c';
      ctx.fillRect(0, 0, W, H);

      const cx = W * 0.5;
      const trapY = H * 0.87;                 // magneto-optical trap
      const apexY = H * 0.27;
      const span = trapY - apexY;
      const cavityY = trapY - span * 0.46;    // the microwave cavity
      const tubeW = R * 0.17;

      const bg = ctx.createRadialGradient(cx, H * 0.6, 0, cx, H * 0.6, R * 0.95);
      bg.addColorStop(0, 'rgba(20, 45, 95, 0.35)');
      bg.addColorStop(0.55, 'rgba(10, 20, 50, 0.16)');
      bg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // ---- vacuum tube -----------------------------------------------------
      const tube = ctx.createLinearGradient(cx - tubeW, 0, cx + tubeW, 0);
      tube.addColorStop(0, 'rgba(120, 180, 255, 0.00)');
      tube.addColorStop(0.5, 'rgba(90, 150, 255, 0.055)');
      tube.addColorStop(1, 'rgba(120, 180, 255, 0.00)');
      ctx.fillStyle = tube;
      ctx.fillRect(cx - tubeW, apexY - R * 0.05, tubeW * 2, trapY - apexY + R * 0.1);
      ctx.strokeStyle = 'rgba(120, 170, 255, 0.18)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - tubeW, apexY - R * 0.05); ctx.lineTo(cx - tubeW, trapY + R * 0.05);
      ctx.moveTo(cx + tubeW, apexY - R * 0.05); ctx.lineTo(cx + tubeW, trapY + R * 0.05);
      ctx.stroke();

      // ---- the cloud -------------------------------------------------------
      // Height and ballistic expansion at this instant.
      const h = rise(u) * span;
      const cloudY = trapY - h;
      const expand = 0.35 + u * 1.5;          // the cloud spreads as it flies
      const scale = R * 0.085;

      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(cx, cloudY, 0, cx, cloudY, scale * expand * 3.2);
      halo.addColorStop(0, 'rgba(150, 205, 255, 0.25)');
      halo.addColorStop(1, 'rgba(60, 110, 255, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(cx, cloudY, scale * expand * 3.2, 0, TAU); ctx.fill();

      // Atoms in the F = 4 state (blue-white) after the second cavity pass.
      const flipped = u > 0.78;
      for (const a of cloud) {
        const x = cx + (a.x + a.vx * u * 1.6) * scale * expand * 2.4;
        const y = cloudY + (a.y + a.vy * u * 1.6) * scale * expand * 2.4;
        const r = Math.max(0.8, R * 0.0016);
        const c = flipped ? '190, 235, 255' : '120, 175, 255';
        ctx.fillStyle = `rgba(${c}, ${a.bright * 0.85})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // ---- microwave cavity ------------------------------------------------
      // Two passes: once climbing, once falling. Ring when the cloud is inside.
      const halfH = span * 0.02;
      const inCavity = Math.abs(cloudY - cavityY) < halfH * 3;
      const cavW = tubeW * 1.55, cavH = R * 0.045;
      const cg = ctx.createLinearGradient(cx - cavW, 0, cx + cavW, 0);
      cg.addColorStop(0, 'rgba(90, 110, 150, 0.35)');
      cg.addColorStop(0.5, 'rgba(180, 205, 245, 0.55)');
      cg.addColorStop(1, 'rgba(90, 110, 150, 0.35)');
      ctx.fillStyle = cg;
      ctx.fillRect(cx - cavW, cavityY - cavH / 2, cavW * 2, cavH);
      ctx.strokeStyle = 'rgba(190, 220, 255, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(cx - cavW, cavityY - cavH / 2, cavW * 2, cavH);
      // standing 9.19 GHz field inside the cavity
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - cavW, cavityY - cavH / 2, cavW * 2, cavH);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255, 170, 90, ${inCavity ? 0.95 : 0.45})`;
      ctx.lineWidth = Math.max(1, R * 0.0022);
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const x = cx - cavW + (i / 200) * cavW * 2;
        const env = Math.sin((i / 200) * Math.PI);
        const y = cavityY + Math.sin((i / 200) * TAU * 6 + now / 40) * env * cavH * 0.36;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
      if (inCavity) {
        ctx.globalCompositeOperation = 'lighter';
        const flash = ctx.createRadialGradient(cx, cavityY, 0, cx, cavityY, cavW * 1.6);
        flash.addColorStop(0, 'rgba(255, 190, 110, 0.35)');
        flash.addColorStop(1, 'rgba(255, 120, 40, 0)');
        ctx.fillStyle = flash;
        ctx.beginPath(); ctx.arc(cx, cavityY, cavW * 1.6, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.fillStyle = 'rgba(180, 205, 245, 0.6)';
      ctx.font = `${Math.max(10, R * 0.016)}px ${MONO}`;
      ctx.textBaseline = 'middle';
      // Wide: the label sits to the left of the cavity. Narrow: above it.
      if (W > H * 1.25) {
        ctx.textAlign = 'right';
        ctx.fillText('Ramsey cavity · 9.192 631 770 GHz', cx - cavW * 1.15, cavityY);
      } else {
        ctx.textAlign = 'center';
        ctx.fillText('Ramsey cavity · 9.192 631 770 GHz', cx, cavityY - cavH * 1.6);
      }

      // ---- trap and cooling beams -----------------------------------------
      const launching = u < 0.06;
      const beam = R * 0.2;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3 + Math.PI / 6;
        const dx = Math.cos(a) * beam, dy = Math.sin(a) * beam * 0.75;
        const lg = ctx.createLinearGradient(cx - dx, trapY - dy, cx + dx, trapY + dy);
        const k = launching ? 0.16 : 0.5;
        lg.addColorStop(0, 'rgba(255, 40, 40, 0)');
        lg.addColorStop(0.5, `rgba(255, 70, 60, ${k})`);
        lg.addColorStop(1, 'rgba(255, 40, 40, 0)');
        ctx.strokeStyle = lg;
        ctx.lineWidth = Math.max(2, R * 0.012);
        ctx.beginPath(); ctx.moveTo(cx - dx, trapY - dy); ctx.lineTo(cx + dx, trapY + dy); ctx.stroke();
      }
      const trapGlow = ctx.createRadialGradient(cx, trapY, 0, cx, trapY, R * 0.09);
      trapGlow.addColorStop(0, `rgba(255, 150, 120, ${launching ? 0.5 : 0.22})`);
      trapGlow.addColorStop(1, 'rgba(255, 60, 40, 0)');
      ctx.fillStyle = trapGlow;
      ctx.beginPath(); ctx.arc(cx, trapY, R * 0.09, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(255, 170, 150, 0.55)';
      ctx.font = `${Math.max(10, R * 0.016)}px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('optical molasses · 852 nm · ~1 µK', cx, trapY + R * 0.055);

      // ---- height against time --------------------------------------------
      // The same parabola, plotted sideways: h(u) = 4u(1-u)·span, sharing the
      // vertical scale of the tube. The cavity line cuts it at the two passes.
      const px0 = cx + tubeW * 1.25, pw = R * 0.25;
      ctx.strokeStyle = 'rgba(120, 165, 230, 0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px0, apexY - R * 0.03); ctx.lineTo(px0, trapY);
      ctx.lineTo(px0 + pw, trapY);
      ctx.stroke();
      ctx.setLineDash([3, 7]);
      ctx.strokeStyle = 'rgba(255, 175, 95, 0.3)';
      ctx.beginPath(); ctx.moveTo(px0, cavityY); ctx.lineTo(px0 + pw, cavityY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(130, 190, 255, 0.55)';
      ctx.lineWidth = Math.max(1.2, R * 0.002);
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const p = i / 120;
        const x = px0 + p * pw, y = trapY - rise(p) * span;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      // the two cavity passes: 4u(1-u) = 0.46
      const root = Math.sqrt(1 - 0.46);
      for (const p of [(1 - root) / 2, (1 + root) / 2]) {
        const x = px0 + p * pw;
        ctx.fillStyle = 'rgba(255, 190, 120, 0.85)';
        ctx.beginPath(); ctx.arc(x, cavityY, Math.max(2.5, R * 0.004), 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255, 190, 130, 0.6)';
        ctx.font = `${Math.max(9, R * 0.013)}px ${MONO}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${p.toFixed(3)} s`, x, cavityY - R * 0.012);
      }
      ctx.fillStyle = 'rgba(190, 230, 255, 0.95)';
      ctx.beginPath();
      ctx.arc(px0 + u * pw, trapY - h, Math.max(3, R * 0.005), 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(140, 175, 225, 0.55)';
      ctx.font = `${Math.max(9, R * 0.014)}px ${MONO}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('height vs. time in this tick', px0, trapY + R * 0.016);

      // ---- hyperfine level diagram (left) ---------------------------------
      const lx = W * 0.5 - R * 0.62;
      if (lx > R * 0.05) {
        const ly = H * 0.3, lw = R * 0.19, gap = R * 0.16;
        ctx.strokeStyle = 'rgba(190, 215, 255, 0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + lw, ly); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(lx, ly + gap); ctx.lineTo(lx + lw, ly + gap); ctx.stroke();
        ctx.font = `${Math.max(10, R * 0.017)}px ${SANS}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(200, 225, 255, 0.85)';
        ctx.fillText('F = 4', lx, ly - 6);
        ctx.textBaseline = 'top';
        ctx.fillText('F = 3', lx, ly + gap + 6);
        ctx.fillStyle = 'rgba(160, 185, 230, 0.55)';
        ctx.font = `${Math.max(9, R * 0.014)}px ${MONO}`;
        ctx.fillText('¹³³Cs · 6 ²S 1/2 ground state', lx, ly + gap + R * 0.045);
        // the photon itself, drawn at 6 cycles for legibility
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255, 175, 95, 0.9)';
        ctx.lineWidth = Math.max(1.4, R * 0.0026);
        ctx.beginPath();
        for (let i = 0; i <= 120; i++) {
          const y = ly + (i / 120) * gap;
          const x = lx + lw * 0.55 + Math.sin((i / 120) * TAU * 3 - now / 60) * lw * 0.16;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(255, 190, 130, 0.8)';
        ctx.font = `${Math.max(9, R * 0.015)}px ${MONO}`;
        ctx.textAlign = 'left';
        ctx.fillText('ΔE / h = 9.192 631 770 GHz', lx + lw * 0.78, ly + gap * 0.42);
      }

      // ---- Ramsey fringes (right) -----------------------------------------
      const rx = W * 0.5 + R * 0.53;
      if (rx + R * 0.32 < W) {
        const rw = R * 0.3, rh = R * 0.16, ry = H * 0.32;
        ctx.strokeStyle = 'rgba(140, 175, 235, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(rx, ry, rw, rh);
        // P(δ) = cos²(π δ T) with T = 1 s of free flight: fringes 1 Hz apart,
        // damped by the width of the velocity distribution.
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(120, 220, 255, 0.85)';
        ctx.lineWidth = Math.max(1.4, R * 0.0026);
        ctx.beginPath();
        for (let i = 0; i <= 300; i++) {
          const d = -3 + (i / 300) * 6;                 // detuning in Hz
          const p = Math.cos(Math.PI * d * FLIGHT) ** 2 * Math.exp(-((d / 2.3) ** 2));
          const x = rx + (i / 300) * rw;
          const y = ry + rh - p * rh * 0.92;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        // the servo squats alternately on the two half-height points
        const side = Math.floor(t.secOfDay) % 2 ? 1 : -1;
        const d = side * 0.25;
        const px = rx + ((d + 3) / 6) * rw;
        const py = ry + rh - Math.cos(Math.PI * d) ** 2 * rh * 0.92;
        ctx.fillStyle = 'rgba(255, 220, 140, 0.95)';
        ctx.beginPath(); ctx.arc(px, py, Math.max(3, R * 0.005), 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(170, 200, 245, 0.6)';
        ctx.font = `${Math.max(9, R * 0.014)}px ${MONO}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('Ramsey fringes · probe ±0.25 Hz', rx, ry + rh + 8);
        ctx.fillText(`central fringe ≈ 1 Hz wide (T = ${FLIGHT.toFixed(1)} s)`, rx, ry + rh + 8 + R * 0.024);
      }

      // ---- the counter -----------------------------------------------------
      const cycles = Math.floor(HYPERFINE * u);
      const digits = String(cycles).padStart(10, '0');
      const grouped = `${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
      const cf = Math.min(R * 0.072, W * 0.052);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `600 ${cf}px ${MONO}`;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(120, 200, 255, 0.22)';
      ctx.fillText(grouped, cx, H * 0.115);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(215, 240, 255, 0.95)';
      ctx.fillText(grouped, cx, H * 0.115);
      ctx.font = `${Math.max(10, R * 0.017)}px ${MONO}`;
      ctx.fillStyle = 'rgba(150, 185, 235, 0.65)';
      ctx.fillText(`cycles into this second  ·  ${(u * 100).toFixed(0).padStart(2, '0')}% of the definition`, cx, H * 0.115 + R * 0.04);

      // ---- time ------------------------------------------------------------
      ctx.font = `200 ${Math.min(R * 0.1, W * 0.16)}px ${SANS}`;
      ctx.fillStyle = 'rgba(235, 245, 255, 0.95)';
      ctx.textAlign = 'left';
      const label = `${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`;
      const bx = W * 0.5 - R * 0.62;
      if (bx > R * 0.04) {
        ctx.fillText(label, bx, H * 0.8);
        ctx.font = `${Math.max(10, R * 0.017)}px ${MONO}`;
        ctx.fillStyle = 'rgba(150, 185, 235, 0.6)';
        ctx.fillText(`toss ${mod(Math.floor(t.secOfDay), 86400)} of 86 400 today`, bx, H * 0.83);
        ctx.fillText('fountain accuracy ≈ 1 s in 300 000 000 years', bx, H * 0.86);
      } else {
        // No room beside the tube: the digits go under everything.
        ctx.font = `200 ${Math.min(R * 0.075, W * 0.13)}px ${SANS}`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(label, R * 0.04, H - R * 0.02);
      }
    },
  };
}

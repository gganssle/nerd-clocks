// Light Clock: Einstein's thought experiment, running on your wall. A photon
// bounces between two mirrors; one round trip is one second in the lab. The
// same clock flown past at β = minute/60 has to send its photon along a longer,
// diagonal path — so it ticks slower by exactly γ, and the two clocks disagree
// by the end of the minute.
import { TAU, clamp, pad, timeParts, SANS, MONO } from '../lib/util.js';

export function create(host) {
  const surface = host.canvas();
  const { ctx } = surface;

  const tri = (p) => Math.abs(((p * 2) % 2) - 1);    // 1 → 0 → 1 bounce

  function mirror(x0, x1, y, hot) {
    const g = ctx.createLinearGradient(x0, y, x1, y);
    g.addColorStop(0, 'rgba(90, 130, 180, 0.15)');
    g.addColorStop(0.5, `rgba(190, 225, 255, ${hot ? 0.95 : 0.55})`);
    g.addColorStop(1, 'rgba(90, 130, 180, 0.15)');
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(2, (x1 - x0) * 0.02);
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  }

  function photon(x, y, r, hue) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 6);
    g.addColorStop(0, `hsla(${hue}, 100%, 92%, 0.95)`);
    g.addColorStop(0.25, `hsla(${hue}, 100%, 70%, 0.45)`);
    g.addColorStop(1, `hsla(${hue}, 100%, 60%, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.restore();
  }

  return {
    frame(now) {
      const W = surface.width, H = surface.height;
      const R = Math.min(W, H);
      const t = timeParts(now);

      // The rocket's speed is set by the minute hand: β from 0 to 0.99.
      const beta = clamp(0.06 + (t.m + t.minuteFrac) / 60 * 0.93, 0, 0.995);
      const gamma = 1 / Math.sqrt(1 - beta * beta);

      ctx.fillStyle = '#02030b';
      ctx.fillRect(0, 0, W, H);
      const bg = ctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.42, R * 0.9);
      bg.addColorStop(0, 'rgba(20, 40, 90, 0.35)');
      bg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Wide: the two clocks sit side by side. Narrow: they stack.
      const narrow = W < H * 1.25;
      const boxH = narrow ? H * 0.2 : R * 0.36;   // mirror separation: 1 light-second
      const boxW = narrow ? Math.min(W * 0.17, boxH * 0.5) : R * 0.16;
      const labTop = narrow ? H * 0.05 : H * 0.11, labBot = labTop + boxH;
      const rocTop = narrow ? H * 0.34 : labTop, rocBot = rocTop + boxH;
      const labX = narrow ? W * 0.3 : W * 0.2;
      const note = Math.max(10, Math.min(R * 0.02, W * 0.021));

      // ---- lab frame clock -------------------------------------------------
      // One round trip per second. Proper time here is coordinate time.
      const labP = t.secondFrac;
      const labY = labBot - tri(labP) * boxH;
      const up = (labP % 1) < 0.5;
      ctx.strokeStyle = 'rgba(120, 170, 235, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(labX - boxW, labTop); ctx.lineTo(labX - boxW, labBot);
      ctx.moveTo(labX + boxW, labTop); ctx.lineTo(labX + boxW, labBot);
      ctx.stroke();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(120, 200, 255, 0.35)';
      ctx.lineWidth = Math.max(1.5, R * 0.0035);
      ctx.beginPath(); ctx.moveTo(labX, up ? labBot : labTop); ctx.lineTo(labX, labY); ctx.stroke();
      ctx.restore();
      mirror(labX - boxW, labX + boxW, labTop, labY < labTop + boxH * 0.06);
      mirror(labX - boxW, labX + boxW, labBot, labY > labBot - boxH * 0.06);
      photon(labX, labY, Math.max(2.5, R * 0.006), 200);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = `${note}px ${MONO}`;
      ctx.fillStyle = 'rgba(180, 215, 255, 0.85)';
      ctx.fillText('lab frame · β = 0', labX, labBot + note * 1.4);
      ctx.fillStyle = 'rgba(140, 180, 235, 0.6)';
      ctx.fillText('one bounce up and back = 1 s', labX, labBot + note * 2.8);

      // ---- moving clock ----------------------------------------------------
      // Same photon, same speed c, longer path: the clock drifts right while
      // the light crosses, so each tick takes γ times as long.
      // The mirrors are one light-second apart, so boxH pixels = c · 1 s: the
      // box slides β · boxH pixels per lab second and the photon rides with it.
      const rocketX = narrow ? W * 0.5 : W * 0.68;
      const span = narrow ? W * 0.5 : Math.min(W * 0.34, boxH * 2.2);
      const labT = t.secOfDay;
      const px = rocketX + (((labT * beta * boxH) % span) - span / 2);
      const prop = (labT / gamma) % 1;               // the rocket's proper time
      const movY = rocBot - tri(prop) * boxH;

      // the zig-zag the lab sees: the photon's actual path through space
      ctx.save();
      ctx.beginPath();
      ctx.rect(rocketX - span * 0.75, rocTop - R * 0.03, span * 1.5, boxH + R * 0.06);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255, 170, 110, 0.30)';
      ctx.setLineDash([5, 7]);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i <= 80; i++) {
        const dt = (-1.5 + (i / 80) * 3) * gamma;    // ± one and a half ticks
        const x = px + dt * beta * boxH;
        const y = rocBot - tri((labT + dt) / gamma) * boxH;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      ctx.strokeStyle = 'rgba(160, 200, 255, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px - boxW, rocTop); ctx.lineTo(px - boxW, rocBot);
      ctx.moveTo(px + boxW, rocTop); ctx.lineTo(px + boxW, rocBot);
      ctx.stroke();
      mirror(px - boxW, px + boxW, rocTop, movY < rocTop + boxH * 0.06);
      mirror(px - boxW, px + boxW, rocBot, movY > rocBot - boxH * 0.06);
      photon(px, movY, Math.max(2.5, R * 0.006), 32);

      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255, 205, 150, 0.9)';
      ctx.font = `${note}px ${MONO}`;
      ctx.fillText(`rocket frame · β = ${beta.toFixed(3)} c`, rocketX, rocBot + note * 1.4);
      ctx.fillStyle = 'rgba(230, 180, 130, 0.65)';
      ctx.fillText(`γ = ${gamma.toFixed(4)} · one tick takes ${gamma.toFixed(3)} s of lab time`, rocketX, rocBot + note * 2.8);

      // ---- Minkowski diagram ----------------------------------------------
      const msz = narrow ? Math.min(W * 0.2, H * 0.085) : R * 0.17;
      const mcx = narrow ? W * 0.76 : W * 0.5;
      const mcy = narrow ? H * 0.72 : H * 0.8;
      ctx.save();
      ctx.translate(mcx, mcy);
      ctx.strokeStyle = 'rgba(120, 165, 225, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-msz, 0); ctx.lineTo(msz, 0);
      ctx.moveTo(0, msz * 0.7); ctx.lineTo(0, -msz * 0.95);
      ctx.stroke();
      // light cone
      ctx.strokeStyle = 'rgba(255, 220, 140, 0.45)';
      ctx.beginPath();
      ctx.moveTo(-msz * 0.9, msz * 0.9); ctx.lineTo(msz * 0.9, -msz * 0.9);
      ctx.moveTo(msz * 0.9, msz * 0.9); ctx.lineTo(-msz * 0.9, -msz * 0.9);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 220, 140, 0.05)';
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(-msz * 0.9, -msz * 0.9); ctx.lineTo(msz * 0.9, -msz * 0.9);
      ctx.closePath(); ctx.fill();
      // worldlines: lab (vertical) and rocket (tilted by arctan β)
      ctx.strokeStyle = 'rgba(150, 205, 255, 0.9)';
      ctx.lineWidth = Math.max(1.5, R * 0.003);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -msz * 0.9); ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 185, 120, 0.9)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(beta * msz * 0.9, -msz * 0.9); ctx.stroke();
      // hyperbola of equal proper time: the rocket's "one second" tick
      ctx.strokeStyle = 'rgba(200, 160, 255, 0.5)';
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) {
        const x = (-0.85 + (i / 60) * 1.7) * msz;
        const y = -Math.sqrt((msz * 0.45) ** 2 + x * x);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(200, 165, 255, 0.85)';
      const hx = clamp(beta * msz * 0.45 * gamma, 0, msz * 0.72);
      const hy = -Math.sqrt((msz * 0.45) ** 2 + hx * hx);
      ctx.beginPath(); ctx.arc(hx, hy, Math.max(2.5, R * 0.004), 0, TAU); ctx.fill();
      ctx.textAlign = 'left';
      ctx.font = `${Math.max(9, R * 0.015)}px ${MONO}`;
      ctx.fillStyle = 'rgba(150, 185, 235, 0.55)';
      ctx.fillText('ct', msz * 0.06, -msz * 0.92);
      ctx.fillText('x', msz * 0.9, msz * 0.06);
      ctx.textAlign = 'center';
      ctx.fillText(narrow ? 'c²t² − x² = c²τ²' : 'τ = 1 s hyperbola · c²t² − x² = c²τ²', 0, msz * 0.85);
      ctx.restore();

      // ---- tick ledger for the current minute ------------------------------
      // Proper time of the rocket, integrated over the minute so far, because
      // β is still climbing: τ = ∫ dt / γ(t).
      const elapsed = t.s + t.secondFrac;
      let tau = 0;
      const steps = 120;
      for (let i = 0; i < steps; i++) {
        const s = (elapsed * (i + 0.5)) / steps;
        const b = clamp(0.06 + (t.m + s / 60) / 60 * 0.93, 0, 0.995);
        tau += Math.sqrt(1 - b * b) * (elapsed / steps);
      }
      const ledW = narrow ? W * 0.44 : W * 0.22;
      const ledX = narrow ? W * 0.06 : W * 0.72;
      const ledY = narrow ? H * 0.64 : H * 0.58;
      const cell = ledW / 30;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.font = `${Math.max(9, Math.min(R * 0.018, ledW / 19))}px ${MONO}`;
      ctx.fillStyle = 'rgba(170, 210, 255, 0.8)';
      ctx.fillText(`lab ticks this minute   ${elapsed.toFixed(2)}`, ledX, ledY - cell * 0.6);
      for (let i = 0; i < 60; i++) {
        const on = i < elapsed;
        ctx.fillStyle = on ? 'rgba(150, 205, 255, 0.9)' : 'rgba(90, 120, 170, 0.22)';
        ctx.fillRect(ledX + (i % 30) * cell, ledY + Math.floor(i / 30) * cell * 1.6, cell * 0.66, cell * 1.1);
      }
      const ly2 = ledY + cell * 6.4;
      ctx.fillStyle = 'rgba(255, 200, 140, 0.85)';
      ctx.fillText(`rocket ticks this minute  ${tau.toFixed(2)}`, ledX, ly2 - cell * 0.6);
      for (let i = 0; i < 60; i++) {
        const on = i < tau;
        ctx.fillStyle = on ? 'rgba(255, 190, 120, 0.9)' : 'rgba(150, 110, 70, 0.22)';
        ctx.fillRect(ledX + (i % 30) * cell, ly2 + Math.floor(i / 30) * cell * 1.6, cell * 0.66, cell * 1.1);
      }
      ctx.fillStyle = 'rgba(200, 165, 255, 0.8)';
      ctx.fillText(`difference  ${(elapsed - tau).toFixed(2)} s and growing`, ledX, ly2 + cell * 5.6);

      // ---- readouts --------------------------------------------------------
      const m = R * 0.045;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.font = `200 ${Math.min(R * 0.12, W * 0.13)}px ${SANS}`;
      ctx.fillStyle = 'rgba(232, 242, 255, 0.96)';
      ctx.fillText(`${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`, m, H - m - R * 0.075);
      ctx.font = `${note}px ${MONO}`;
      ctx.fillStyle = 'rgba(150, 190, 240, 0.7)';
      // A muon lives 2.2 µs by its own clock; at this β the lab sees γ times that.
      const muonKm = 299792.458 * beta * 2.2e-6 * gamma;
      ctx.fillText(`a muon at this β lives ${(2.2 * gamma).toFixed(2)} µs and flies ${muonKm.toFixed(2)} km`, m, H - m - note * 1.9);
      ctx.fillText('mirror separation = 1 light-second = 299 792 458 m', m, H - m - note * 0.4);

      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(140, 175, 225, 0.6)';
      ctx.fillText('Δt = γ Δτ,  γ = 1 / √(1 − β²)', W - m * 0.6, m * 0.4);
      if (!narrow) {
        ctx.fillText('β is set by the minute: 0 at :00, 0.99 c at :59', W - m * 0.6, m * 0.4 + note * 1.4);
        ctx.fillText('both photons move at exactly c', W - m * 0.6, m * 0.4 + note * 2.8);
      }
    },
  };
}

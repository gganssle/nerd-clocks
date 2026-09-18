// Prime Spiral: all 86 400 seconds of the day laid out on a Sacks spiral —
// r = √n, θ = 2π√n, so the perfect squares run down one ray. Primes are lit.
// The day burns its way around the spiral one second at a time.
import { TAU, pad, timeParts, SANS, MONO } from '../lib/util.js';

const DAY = 86400;

function sieve(n) {
  const p = new Uint8Array(n + 1).fill(1);
  p[0] = p[1] = 0;
  for (let i = 2; i * i <= n; i++) if (p[i]) for (let j = i * i; j <= n; j += i) p[j] = 0;
  return p;
}

function factor(n) {
  if (n < 2) return [];
  const out = [];
  let m = n;
  for (let d = 2; d * d <= m; d++) {
    let e = 0;
    while (m % d === 0) { m /= d; e++; }
    if (e) out.push([d, e]);
  }
  if (m > 1) out.push([m, 1]);
  return out;
}

const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
const fmt = (fs) => fs.map(([d, e]) => (e > 1 ? `${d}${SUP[e] ?? '^' + e}` : `${d}`)).join(' × ');

export function create(host) {
  const surface = host.canvas();
  const { ctx } = surface;
  const isPrime = sieve(DAY);
  // π(n) at every second, so the running prime count is a lookup.
  const pi = new Int32Array(DAY + 1);
  for (let i = 1; i <= DAY; i++) pi[i] = pi[i - 1] + isPrime[i];
  // Euler's polynomial n² + n + 41 is prime for n = 0…39: a famous streak that
  // shows up as a curve of lit points on the spiral.
  const euler = new Set();
  for (let i = 0; i * i + i + 41 <= DAY; i++) euler.add(i * i + i + 41);

  let base = null, lit = null, litUntil = -1, key = '';

  const place = (n, S) => {
    const s = Math.sqrt(n);
    const a = s * TAU - Math.PI / 2;
    return [Math.cos(a) * s * S, Math.sin(a) * s * S];
  };

  function build(W, H) {
    // Tall screens shrink the spiral so it clears the readouts above and below.
    const R = Math.min(W, H);
    const rad = W < H * 1.25
      ? Math.max(W * 0.2, Math.min(W * 0.455, H * 0.5 - R * 0.24))
      : R * 0.455;
    const S = rad / Math.sqrt(DAY);
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      return c;
    };
    base = mk(); lit = mk();
    const b = base.getContext('2d');
    b.translate(W / 2, H / 2);
    const dot = Math.max(0.55, Math.min(W, H) * 0.0013);
    for (let n = 2; n <= DAY; n++) {
      const [x, y] = place(n, S);
      if (isPrime[n]) {
        b.fillStyle = euler.has(n) ? 'rgba(255, 150, 90, 0.85)' : 'rgba(120, 190, 255, 0.55)';
        b.beginPath(); b.arc(x, y, dot * 1.5, 0, TAU); b.fill();
      } else {
        b.fillStyle = 'rgba(70, 90, 130, 0.16)';
        b.fillRect(x - dot * 0.5, y - dot * 0.5, dot, dot);
      }
    }
    litUntil = -1;
    return S;
  }

  let S = 0;

  return {
    frame(now) {
      const W = surface.width, H = surface.height;
      const R = Math.min(W, H);
      const t = timeParts(now);
      const n = Math.floor(t.secOfDay);

      const k = `${W}x${H}`;
      if (k !== key) { key = k; S = build(W, H); }

      // Paint the seconds that have already happened onto a persistent layer;
      // only the new ones are drawn each frame.
      if (n < litUntil) { lit.getContext('2d').clearRect(0, 0, W, H); litUntil = -1; }
      if (n > litUntil) {
        const l = lit.getContext('2d');
        l.save();
        l.translate(W / 2, H / 2);
        const dot = Math.max(0.6, R * 0.0014);
        for (let i = Math.max(2, litUntil + 1); i <= n; i++) {
          const [x, y] = place(i, S);
          if (isPrime[i]) {
            l.fillStyle = euler.has(i) ? 'rgba(255, 205, 140, 0.95)' : 'rgba(225, 245, 255, 0.95)';
            l.beginPath(); l.arc(x, y, dot * 2.1, 0, TAU); l.fill();
          } else {
            l.fillStyle = 'rgba(255, 170, 90, 0.12)';
            l.fillRect(x - dot * 0.6, y - dot * 0.6, dot * 1.2, dot * 1.2);
          }
        }
        l.restore();
        litUntil = n;
      }

      ctx.fillStyle = '#03040a';
      ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, R * 0.55);
      glow.addColorStop(0, 'rgba(30, 60, 120, 0.22)');
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      ctx.drawImage(base, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(lit, 0, 0);
      ctx.globalCompositeOperation = 'source-over';

      // ---- the current second ---------------------------------------------
      const [cxp, cyp] = place(t.secOfDay, S);
      const X = W / 2 + cxp, Y = H / 2 + cyp;
      const prime = !!isPrime[n];
      const pulse = 0.65 + 0.35 * Math.sin(t.secondFrac * TAU);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255, 210, 140, 0.32)';
      ctx.lineWidth = Math.max(1, R * 0.0025);
      ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.lineTo(X, Y); ctx.stroke();
      const hg = ctx.createRadialGradient(X, Y, 0, X, Y, R * (prime ? 0.075 : 0.045));
      hg.addColorStop(0, prime ? `rgba(255, 240, 190, ${0.95 * pulse})` : `rgba(160, 210, 255, ${0.72 * pulse})`);
      hg.addColorStop(1, 'rgba(60, 90, 200, 0)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(X, Y, R * (prime ? 0.075 : 0.045), 0, TAU); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = prime ? 'rgba(255, 235, 180, 0.95)' : 'rgba(170, 210, 255, 0.8)';
      ctx.lineWidth = Math.max(1.4, R * 0.0028);
      ctx.beginPath(); ctx.arc(X, Y, R * 0.016 * (1.15 - 0.15 * pulse), 0, TAU); ctx.stroke();

      // ---- readouts --------------------------------------------------------
      const m = R * 0.05;
      const narrow = W < H * 1.25;
      const note = Math.max(10, Math.min(R * 0.021, W * 0.023));
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = `200 ${Math.min(R * 0.11, W * 0.12)}px ${SANS}`;
      ctx.fillStyle = 'rgba(232, 242, 255, 0.96)';
      ctx.fillText(`${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`, m, m);

      ctx.font = `${note}px ${MONO}`;
      const fs = factor(n);
      const line = prime ? `${n.toLocaleString()} is PRIME` : `${n.toLocaleString()} = ${fmt(fs) || '0'}`;
      ctx.fillStyle = prime ? 'rgba(255, 228, 160, 0.95)' : 'rgba(150, 185, 235, 0.8)';
      ctx.fillText(line, m, m + R * 0.125);
      ctx.fillStyle = 'rgba(150, 185, 235, 0.7)';
      ctx.fillText(`π(n) = ${pi[n].toLocaleString()} primes so far today`, m, m + R * 0.155);
      let next = n + 1;
      while (next <= DAY && !isPrime[next]) next++;
      const gap = next - n;
      ctx.fillText(
        next <= DAY ? `next prime second ${next.toLocaleString()} · ${gap} s away` : 'no prime seconds left today',
        m, m + R * 0.185,
      );

      // Narrow screens have no room beside the digits, so the legend drops
      // to the bottom right.
      const capY = narrow ? H - m - note * 6.8 : m;
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(140, 175, 225, 0.6)';
      ctx.fillText('Sacks spiral · r = √n, θ = 2π√n', W - m, capY);
      ctx.fillText('squares fall on the ray straight up', W - m, capY + note * 1.35);
      ctx.fillStyle = 'rgba(120, 190, 255, 0.75)';
      ctx.fillText(`${pi[DAY].toLocaleString()} prime seconds in a day`, W - m, capY + note * 2.9);
      ctx.fillStyle = 'rgba(255, 160, 100, 0.8)';
      ctx.fillText('orange: n² + n + 41, Euler\u2019s prime machine', W - m, capY + note * 4.25);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(150, 185, 235, 0.55)';
      ctx.fillText(`${(t.dayFrac * 100).toFixed(3)}% of the spiral burned`, m, H - m);
    },
  };
}

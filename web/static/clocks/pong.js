// Pong clock: left score = hours, right score = minutes.
// Each minute's rally is planned in advance: the ball's horizontal speed is
// chosen so that after a whole number of volleys it slips past a paddle at
// exactly :00. Everything is a pure function of time, so it never drifts.
import { clamp, easeInOut, timeParts, pad, rng, mod, MONO } from '../lib/util.js';
import { BITMAP } from '../lib/glyphs.js';

const XL = 0.05, XR = 0.95; // paddle planes (court units, 0..1)
const YMIN = 0.02, YMAX = 0.98; // ball centre bounds
const PADDLE_H = 0.13;
const SERVE = 1.0; // seconds into the minute
const CROSS = 1.25; // target seconds per court crossing

function reflect(u) {
  const span = YMAX - YMIN;
  const p = mod(u - YMIN, 2 * span);
  return YMIN + (p < span ? p : 2 * span - p);
}
// Direction (+1/-1) of an unfolded coordinate after reflection.
function reflectDir(u) {
  const span = YMAX - YMIN;
  return mod(u - YMIN, 2 * span) < span ? 1 : -1;
}

// Plan the rally for the minute identified by minuteKey (minutes since epoch,
// local). `minute` is 0..59; on minute 59 the right paddle misses so the hour
// increments instead.
function plan(minuteKey, minute, prevFinal) {
  const rand = rng(minuteKey * 7919 + 13);
  const mirror = minute === 59;
  // Work in a frame where the ball finally exits on the left (x -> 0).
  const L = XR - XL;
  const d1 = XR - 0.5;
  const final = XR; // far plane to the exit edge
  const dur = 60 - SERVE;
  const m = Math.max(1, Math.round((dur * (L / CROSS) - d1 - final) / (2 * L)));
  const v = (d1 + 2 * m * L + final) / dur;
  const vyMax = v * 0.95;

  // Hit events in time order: far, near, far, ..., far (2m + 1 hits), then the miss.
  const legs = [];
  const near = [], far = [];
  let t0 = SERVE;
  let y0 = 0.3 + 0.4 * rand();
  let vy = (rand() < 0.5 ? -1 : 1) * (0.2 + 0.4 * rand()) * v;
  for (let j = 0; j <= 2 * m; j++) {
    const t1 = SERVE + (d1 + j * L) / v;
    legs.push({ t0, u0: y0, vy });
    const u = y0 + vy * (t1 - t0);
    const by = reflect(u);
    // Paddle aims to hit the ball off-centre; the offset sets the new angle,
    // just like the original Pong's segmented paddle.
    let off = (rand() < 0.5 ? -1 : 1) * (0.1 + 0.75 * rand());
    let py = clamp(by - off * (PADDLE_H / 2), PADDLE_H / 2, 1 - PADDLE_H / 2);
    off = (by - py) / (PADDLE_H / 2);
    (j % 2 === 0 ? far : near).push({ t: t1, y: py });
    t0 = t1;
    y0 = by;
    vy = off * vyMax;
    if (Math.abs(vy) < 0.08 * v) vy = (reflectDir(u) || 1) * 0.08 * v;
  }
  legs.push({ t0, u0: y0, vy });
  // The miss: the near paddle lunges but stops just short.
  const tMiss = SERVE + (d1 + 2 * m * L + L) / v;
  const lastLeg = legs[legs.length - 1];
  const bm = reflect(lastLeg.u0 + lastLeg.vy * (tMiss - lastLeg.t0));
  const sign = bm > 0.5 ? 1 : -1;
  near.push({ t: tMiss + 0.15, y: clamp(bm - sign * PADDLE_H * 0.8, PADDLE_H / 2, 1 - PADDLE_H / 2) });

  const leftEvents = mirror ? far : near;
  const rightEvents = mirror ? near : far;
  const p = {
    mirror, v, m, L, d1, legs,
    left: [{ t: 0, y: prevFinal ? prevFinal.left : 0.5 }, ...leftEvents],
    right: [{ t: 0, y: prevFinal ? prevFinal.right : 0.5 }, ...rightEvents],
  };
  p.finalLeft = p.left[p.left.length - 1].y;
  p.finalRight = p.right[p.right.length - 1].y;
  return p;
}

function ballAt(p, t) {
  const s = p.v * (t - SERVE);
  if (s < 0) return null;
  let xf;
  if (s < p.d1) xf = 0.5 + s;
  else {
    const s2 = s - p.d1;
    if (s2 < 2 * p.m * p.L) {
      const q = mod(s2, 2 * p.L);
      xf = q < p.L ? XR - q : XL + (q - p.L);
    } else xf = XR - (s2 - 2 * p.m * p.L);
  }
  if (xf < -0.05) return null;
  let leg = p.legs[0];
  for (const l of p.legs) { if (l.t0 <= t) leg = l; else break; }
  const y = reflect(leg.u0 + leg.vy * (t - leg.t0));
  return { x: p.mirror ? 1 - xf : xf, y };
}

function paddleAt(events, t) {
  let i = 0;
  while (i + 1 < events.length && events[i + 1].t <= t) i++;
  const a = events[i], b = events[i + 1];
  if (!b) return a.y;
  const u = (t - a.t) / (b.t - a.t);
  return a.y + (b.y - a.y) * easeInOut(clamp((u - 0.12) / 0.72, 0, 1));
}

export function create(host) {
  const surface = host.canvas();
  const { ctx, canvas } = surface;
  const bloom1 = document.createElement('canvas');
  const bloom2 = document.createElement('canvas');
  const b1 = bloom1.getContext('2d');
  const b2 = bloom2.getContext('2d');
  let scan = null, scanKey = '';
  const cache = new Map();

  function getPlan(key, minute) {
    if (cache.has(key)) return cache.get(key);
    const prevMinute = (minute + 59) % 60;
    const prev = plan(key - 1, prevMinute, null);
    const p = plan(key, minute, { left: prev.finalLeft, right: prev.finalRight });
    cache.set(key, p);
    if (cache.size > 4) cache.delete(cache.keys().next().value);
    return p;
  }

  function scanPattern(dpr) {
    const key = String(dpr);
    if (scan && scanKey === key) return scan;
    const c = document.createElement('canvas');
    const period = Math.max(3, Math.round(3 * dpr));
    c.width = 4; c.height = period;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.38)';
    g.fillRect(0, 0, 4, Math.ceil(period / 3));
    scan = ctx.createPattern(c, 'repeat');
    scanKey = key;
    return scan;
  }

  return {
    frame(now) {
      const W = surface.width, H = surface.height, dpr = surface.dpr;
      const t = timeParts(now);
      const d = t.date;
      const dayNumber = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
      const key = dayNumber * 1440 + t.h * 60 + t.m;
      const sec = t.minuteFrac * 60;
      const p = getPlan(key, t.m);

      const U = Math.min(W, H);
      const mx = W * 0.05, my = H * 0.1;
      const cw = W - 2 * mx, ch = H - my - H * 0.06;
      const X = (x) => mx + x * cw;
      const Y = (y) => my + y * ch;
      const ink = '#eafff2';

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#030805';
      ctx.fillRect(0, 0, W, H);
      const screenGlow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
      screenGlow.addColorStop(0, 'rgba(30, 60, 45, 0.35)');
      screenGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = screenGlow;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = ink;
      const px = Math.max(2, U * 0.012);

      // court boundaries
      ctx.fillRect(mx, my - px, cw, px);
      ctx.fillRect(mx, my + ch, cw, px);
      // dashed net
      for (let y = my; y < my + ch; y += px * 3) ctx.fillRect(W / 2 - px / 2, y + px, px, px * 1.6);

      // scores
      const cell = Math.max(3, U * 0.024);
      const drawNumber = (str, cx, top) => {
        const width = str.length * 5 * cell + (str.length - 1) * 2 * cell;
        let x0 = cx - width / 2;
        for (const chr of str) {
          const rows = BITMAP[chr];
          for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
            if (rows[r][c] === '#') ctx.fillRect(x0 + c * cell, top + r * cell, cell * 0.92, cell * 0.92);
          }
          x0 += 7 * cell;
        }
      };
      const top = my + ch * 0.05;
      drawNumber(pad(t.h), W * 0.3, top);
      drawNumber(pad(t.m), W * 0.7, top);

      // paddles
      const pw = Math.max(4, U * 0.016);
      const phPx = PADDLE_H * ch;
      const ballS = Math.max(5, U * 0.02);
      const leftY = paddleAt(p.left, sec), rightY = paddleAt(p.right, sec);
      ctx.fillRect(X(XL) - ballS / 2 - pw, Y(leftY) - phPx / 2, pw, phPx);
      ctx.fillRect(X(XR) + ballS / 2, Y(rightY) - phPx / 2, pw, phPx);

      // ball with a short phosphor trail
      const ball = ballAt(p, sec);
      if (ball) {
        const serveBlink = sec - SERVE < 0.4 ? (Math.floor((sec - SERVE) * 10) % 2 === 0 ? 1 : 0.35) : 1;
        for (let k = 8; k >= 1; k--) {
          const b = ballAt(p, sec - k * 0.014);
          if (!b) continue;
          ctx.globalAlpha = 0.28 * (1 - k / 9);
          ctx.fillRect(X(b.x) - ballS / 2, Y(b.y) - ballS / 2, ballS, ballS);
        }
        ctx.globalAlpha = serveBlink;
        ctx.fillRect(X(ball.x) - ballS / 2, Y(ball.y) - ballS / 2, ballS, ballS);
        ctx.globalAlpha = 1;
      }

      // goal flash just after a point is scored
      if (sec < 0.6) {
        const prevMinute = (t.m + 59) % 60;
        const side = prevMinute === 59 ? W - mx : mx; // where the ball went out
        const a = 1 - sec / 0.6;
        const g = ctx.createRadialGradient(side, H / 2, 0, side, H / 2, H * 0.6);
        g.addColorStop(0, `rgba(200,255,220,${0.35 * a})`);
        g.addColorStop(1, 'rgba(200,255,220,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      // labels
      ctx.fillStyle = 'rgba(200, 255, 220, 0.35)';
      ctx.font = `${Math.max(11, U * 0.018)}px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('HOURS', W * 0.3, top + cell * 7.8);
      ctx.fillText('MINUTES', W * 0.7, top + cell * 7.8);

      // bloom: downsample the frame twice and add it back blurred
      const s1w = Math.max(1, Math.round(canvas.width / 4)), s1h = Math.max(1, Math.round(canvas.height / 4));
      const s2w = Math.max(1, Math.round(canvas.width / 16)), s2h = Math.max(1, Math.round(canvas.height / 16));
      if (bloom1.width !== s1w || bloom1.height !== s1h) { bloom1.width = s1w; bloom1.height = s1h; }
      if (bloom2.width !== s2w || bloom2.height !== s2h) { bloom2.width = s2w; bloom2.height = s2h; }
      b1.clearRect(0, 0, s1w, s1h);
      b1.drawImage(canvas, 0, 0, s1w, s1h);
      b2.clearRect(0, 0, s2w, s2h);
      b2.drawImage(bloom1, 0, 0, s2w, s2h);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(bloom1, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 0.7;
      ctx.drawImage(bloom2, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // scanlines
      ctx.fillStyle = scanPattern(dpr);
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // vignette and rounded tube corners
      const vig = ctx.createRadialGradient(W / 2, H / 2, U * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.75)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.roundRect(U * 0.012, U * 0.012, W - U * 0.024, H - U * 0.024, U * 0.06);
      ctx.fill('evenodd');
    },
  };
}

export const _test = { plan, ballAt, paddleAt, XL, XR, PADDLE_H };

// Julia Set: the fractal J(c) for z -> z² + c, where c walks once a minute
// around the edge of the Mandelbrot set's main cardioid. An inset Mandelbrot
// map doubles as the minute dial.
import { TAU, timeParts, pad, SANS, MONO } from '../lib/util.js';

const PULL = 0.985; // |multiplier| of the fixed point; <1 keeps J(c) connected

// c(θ) = r·e^{iθ}/2 − r²·e^{2iθ}/4 : the point whose fixed point has multiplier r·e^{iθ}.
function cardioid(theta, r = 1) {
  return [
    (r * Math.cos(theta)) / 2 - (r * r * Math.cos(2 * theta)) / 4,
    (r * Math.sin(theta)) / 2 - (r * r * Math.sin(2 * theta)) / 4,
  ];
}

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform vec2 uC;
uniform vec2 uZStar;  // the neutral-ish fixed point of z² + c
uniform float uZoom;
uniform float uRot;
uniform float uHue;
uniform float uTime;
uniform vec3 uInset;   // centre x, y (device px, y up), radius
const int MAXIT = 220;

vec3 palette(float t) {
  // Inigo Quilez style cosine palette, shifted by the hour.
  return 0.5 + 0.5 * cos(6.28318 * (vec3(1.0, 0.85, 0.7) * t + vec3(0.0, 0.18, 0.38) + uHue));
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec3 col;

  float dInset = length(frag - uInset.xy);
  if (dInset < uInset.z) {
    // ---- Mandelbrot inset -------------------------------------------------
    vec2 c = (frag - uInset.xy) / uInset.z * 1.45 + vec2(-0.6, 0.0);
    vec2 z = vec2(0.0);
    float n = 0.0;
    float r2 = 0.0;
    for (int i = 0; i < 160; i++) {
      z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
      r2 = dot(z, z);
      if (r2 > 64.0) break;
      n += 1.0;
    }
    if (n >= 160.0) {
      col = vec3(0.0, 0.0, 0.0);
    } else {
      float sn = n + 1.0 - log2(log2(r2) * 0.5);
      float t = sqrt(sn / 160.0);
      col = palette(0.15 + t * 1.4) * pow(t, 1.3) * 1.8;
    }
    col *= 0.85;
    // soft vignette at the inset rim
    col *= smoothstep(uInset.z, uInset.z * 0.9, dInset) * 0.6 + 0.4;
  } else {
    // ---- Julia set ----------------------------------------------------------
    float s = min(uRes.x, uRes.y);
    float span = 2.7 / uZoom;
    vec2 p = (frag - 0.5 * uRes) / s * span;
    float cr = cos(uRot), sr = sin(uRot);
    p = vec2(cr * p.x - sr * p.y, sr * p.x + cr * p.y);
    vec2 z = p;
    vec2 dz = vec2(1.0, 0.0);
    float n = 0.0;
    float r2 = 0.0;
    float trap = 1e9;
    for (int i = 0; i < MAXIT; i++) {
      dz = 2.0 * vec2(z.x * dz.x - z.y * dz.y, z.x * dz.y + z.y * dz.x);
      z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + uC;
      r2 = dot(z, z);
      trap = min(trap, abs(z.x * z.y));
      if (r2 > 1024.0) break;
      n += 1.0;
    }
    float px = span / s;
    if (n >= float(MAXIT)) {
      // Prisoner set: dark interior with orbit-trap filigree.
      // Orbits spiral into the fixed point, turning by ~θ each step; the angle
      // and distance of where they end up draws petals and rings.
      vec2 w = z - uZStar;
      float ang = atan(w.y, w.x) / 6.28318;
      float rings = log(length(w) + 1e-6);
      float petals = 0.5 + 0.5 * cos(6.28318 * (ang * 3.0 + rings * 0.35));
      col = palette(ang + rings * 0.06 + 0.5) * (0.05 + 0.2 * petals);
      col *= 0.6 + 0.4 * smoothstep(0.0, 1.0, exp(-trap * 6.0));
    } else {
      float sn = n + 1.0 - log2(log2(r2) * 0.5);
      // distance estimate: |z| log|z| / |dz|
      float de = 0.5 * sqrt(r2) * log(r2) / max(length(dz), 1e-9);
      float edge = exp(-de / (px * 5.0));
      float haze = exp(-de / (px * 60.0));
      vec3 base = palette(sn * 0.07 + 0.1 * sin(uTime * 0.05));
      col = base * (0.05 + 0.35 * haze + 1.2 * edge) + vec3(1.0, 0.97, 0.92) * pow(edge, 6.0) * 0.8;
    }
    // vignette
    vec2 q = frag / uRes - 0.5;
    col *= 1.0 - 0.55 * dot(q, q) * 1.8;
  }
  gl_FragColor = vec4(pow(max(col, 0.0), vec3(0.9)), 1.0);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}

export function create(host) {
  const glSurf = host.webgl({ scale: 0.75, antialias: false });
  const { gl } = glSurf;
  const over = host.canvas({ alpha: true });
  const ctx = over.ctx;

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const name of ['uZStar', 'uRes', 'uC', 'uZoom', 'uRot', 'uHue', 'uTime', 'uInset']) U[name] = gl.getUniformLocation(prog, name);

  return {
    frame(now) {
      const W = over.width, H = over.height;
      const t = timeParts(now);
      const theta = TAU * t.minuteFrac;
      const [cx, cy] = cardioid(theta, PULL);

      // Inset geometry in CSS px
      const R = Math.min(W, H) * 0.16;
      const ix = W - R - Math.min(W, H) * 0.06;
      const iy = H - R - Math.min(W, H) * 0.06;
      const INSET_SCALE = 1.45, INSET_OX = -0.6;
      const toInset = (re, im) => [ix + ((re - INSET_OX) / INSET_SCALE) * R, iy - (im / INSET_SCALE) * R];

      // ---- GL pass ----
      const k = glSurf.dpr;
      gl.uniform2f(U.uRes, glSurf.width, glSurf.height);
      gl.uniform2f(U.uC, cx, cy);
      // z* = λ/2 with λ = PULL·e^{iθ} (the fixed point whose multiplier is λ)
      gl.uniform2f(U.uZStar, (PULL * Math.cos(theta)) / 2, (PULL * Math.sin(theta)) / 2);
      gl.uniform1f(U.uZoom, 1.0 + 0.08 * Math.sin(TAU * t.hourFrac));
      gl.uniform1f(U.uRot, TAU * t.hourFrac);
      gl.uniform1f(U.uHue, (t.h + t.hourFrac) / 24);
      gl.uniform1f(U.uTime, (now / 1000) % 1000);
      gl.uniform3f(U.uInset, ix * k, (H - iy) * k, R * k);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // ---- overlay ----
      ctx.clearRect(0, 0, W, H);

      // inset rim
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(ix, iy, R, 0, TAU); ctx.stroke();

      // cardioid path
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 240; i++) {
        const [re, im] = cardioid((i / 240) * TAU, 1);
        const [x, y] = toInset(re, im);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();

      // 60 ticks, pointing outward from the cardioid (normal direction)
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * TAU;
        const [re, im] = cardioid(a, 1);
        const [re2, im2] = cardioid(a + 0.001, 1);
        let nx = im2 - im, ny = -(re2 - re);
        const len = Math.hypot(nx, ny) || 1;
        nx /= len; ny /= len;
        if (i === 0) { nx = 1; ny = 0; } // the cusp has no normal; point outward
        const [x, y] = toInset(re, im);
        const major = i % 5 === 0;
        const L = (major ? 0.085 : 0.04) * R;
        const passed = i <= t.s;
        ctx.strokeStyle = passed ? 'rgba(255,240,210,0.9)' : 'rgba(255,255,255,0.3)';
        ctx.lineWidth = major ? 2 : 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + nx * L, y - ny * L); ctx.stroke();
        if (i % 15 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.font = `${Math.max(10, R * 0.075)}px ${MONO}`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(pad(i), x + nx * L * 2.6, y - ny * L * 2.6);
        }
      }

      // marker trail + marker at c
      const [mx, my] = toInset(cx, cy);
      // comet tail: where c was over the last few seconds
      for (let i = 30; i > 0; i--) {
        const a0 = theta - (i / 30) * TAU * (4 / 60), a1 = theta - ((i - 1) / 30) * TAU * (4 / 60);
        const p0 = toInset(...cardioid(a0, PULL)), p1 = toInset(...cardioid(a1, PULL));
        ctx.strokeStyle = `rgba(255,220,160,${(1 - i / 30) * 0.8})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.stroke();
      }
      const glow = ctx.createRadialGradient(mx, my, 0, mx, my, R * 0.12);
      glow.addColorStop(0, 'rgba(255,245,220,1)');
      glow.addColorStop(0.25, 'rgba(255,190,120,0.7)');
      glow.addColorStop(1, 'rgba(255,120,60,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(mx, my, R * 0.12, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(mx, my, 3, 0, TAU); ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = `${Math.max(10, R * 0.08)}px ${MONO}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('MANDELBROT · SECONDS DIAL', ix, iy - R - R * 0.1);

      // readout, bottom-left
      const big = Math.min(W * 0.075, H * 0.11);
      const lx = Math.min(W, H) * 0.06, ly = H - Math.min(W, H) * 0.06;
      ctx.textAlign = 'left';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 18;
      ctx.font = `200 ${big}px ${SANS}`;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      const hm = `${pad(t.h)}:${pad(t.m)}`;
      ctx.fillText(hm, lx, ly - big * 0.42);
      const hmw = ctx.measureText(hm).width;
      ctx.font = `200 ${big * 0.45}px ${SANS}`;
      ctx.fillStyle = 'rgba(255,225,190,0.9)';
      ctx.fillText(pad(t.s), lx + hmw + big * 0.12, ly - big * 0.42);
      ctx.font = `${Math.max(12, big * 0.2)}px ${MONO}`;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      const sign = cy < 0 ? '−' : '+';
      ctx.fillText(`c = ${cx.toFixed(4)} ${sign} ${Math.abs(cy).toFixed(4)}i`, lx, ly);
      ctx.shadowBlur = 0;
    },
    destroy() {
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    },
  };
}

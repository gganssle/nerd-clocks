// Reaction–Diffusion: a Gray–Scott simulation running on the GPU. Inside the
// shape of the current time the feed/kill rates favour labyrinthine "coral";
// outside they favour sparse, self-dividing spots. When the minute changes the
// old digits dissolve and new ones grow out of the chemistry.
import { TAU, timeParts, pad, clamp, SANS, MONO } from '../lib/util.js';

const DU = 1.0, DV = 0.5;
// [F, k] presets (Pearson / Munafo naming in comments)
const INSIDE = [0.0545, 0.062];  // coral / labyrinth
const OUTSIDE = [0.0367, 0.0649]; // mitosis: spots that split

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const SIM = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uState;
uniform sampler2D uMask;
uniform vec2 uTexel;
uniform vec2 uIn;
uniform vec2 uOut;
uniform vec3 uSeed; // xy = random offset, z = strength
void main() {
  vec2 c = texture(uState, vUv).rg;
  vec2 l = texture(uState, vUv + vec2(-uTexel.x, 0.0)).rg;
  vec2 r = texture(uState, vUv + vec2(uTexel.x, 0.0)).rg;
  vec2 t = texture(uState, vUv + vec2(0.0, uTexel.y)).rg;
  vec2 b = texture(uState, vUv + vec2(0.0, -uTexel.y)).rg;
  vec2 tl = texture(uState, vUv + vec2(-uTexel.x, uTexel.y)).rg;
  vec2 tr = texture(uState, vUv + vec2(uTexel.x, uTexel.y)).rg;
  vec2 bl = texture(uState, vUv + vec2(-uTexel.x, -uTexel.y)).rg;
  vec2 br = texture(uState, vUv + vec2(uTexel.x, -uTexel.y)).rg;
  vec2 lap = 0.2 * (l + r + t + b) + 0.05 * (tl + tr + bl + br) - c;
  float m = texture(uMask, vUv).r;
  vec2 fk = mix(uOut, uIn, m);
  float u = c.r, v = c.g;
  float uvv = u * v * v;
  u += ${DU.toFixed(3)} * lap.r - uvv + fk.x * (1.0 - u);
  v += ${DV.toFixed(3)} * lap.g + uvv - (fk.x + fk.y) * v;
  // sprinkle catalyst into freshly-changed digit areas
  if (uSeed.z > 0.0) {
    float h = fract(sin(dot(floor(vUv / uTexel / 3.0) + uSeed.xy, vec2(12.9898, 78.233))) * 43758.5453);
    if (h > 0.985 && m > 0.5) v = max(v, 0.5 * uSeed.z);
  }
  outColor = vec4(clamp(u, 0.0, 1.0), clamp(v, 0.0, 1.0), 0.0, 1.0);
}`;

const DRAW = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uState;
uniform sampler2D uMask;
uniform sampler2D uPrevMask;
uniform float uBlend;
uniform vec2 uTexel;
uniform vec2 uLight;
uniform float uTime;
void main() {
  float v = texture(uState, vUv).g;
  float vx = texture(uState, vUv + vec2(uTexel.x, 0.0)).g - texture(uState, vUv - vec2(uTexel.x, 0.0)).g;
  float vy = texture(uState, vUv + vec2(0.0, uTexel.y)).g - texture(uState, vUv - vec2(0.0, uTexel.y)).g;
  vec3 n = normalize(vec3(-vx * 3.0, -vy * 3.0, 0.35));
  vec3 L = normalize(vec3(uLight, 0.9));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(clamp(dot(n, H), 0.0, 1.0), 40.0);

  float m = mix(texture(uPrevMask, vUv).r, texture(uMask, vUv).r, uBlend);
  m = smoothstep(0.15, 0.85, m);

  float s = smoothstep(0.08, 0.42, v);
  // warm palette inside the digits
  vec3 inA = vec3(0.10, 0.015, 0.05);
  vec3 inB = vec3(0.95, 0.22, 0.22);
  vec3 inC = vec3(1.00, 0.78, 0.38);
  vec3 warm = mix(mix(inA, inB, smoothstep(0.0, 0.6, s)), inC, smoothstep(0.55, 1.0, s));
  // cool, dim palette outside
  vec3 outA = vec3(0.008, 0.02, 0.04);
  vec3 outB = vec3(0.05, 0.28, 0.40);
  vec3 outC = vec3(0.35, 0.80, 0.85);
  vec3 cool = mix(mix(outA, outB, smoothstep(0.0, 0.7, s)), outC, smoothstep(0.7, 1.0, s)) * 0.8;

  vec3 col = mix(cool, warm, m);
  col *= 0.45 + 0.85 * diff;
  col += spec * mix(0.12, 0.5, m) * s;
  vec2 q = vUv - 0.5;
  col *= 1.0 - 0.55 * dot(q, q);
  outColor = vec4(pow(col, vec3(0.9)), 1.0);
}`;

export function create(host) {
  const surface = host.webgl({ antialias: false, alpha: false, preserveDrawingBuffer: false });
  const gl = surface.gl;
  const isGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  if (!isGL2 || !gl.getExtension('EXT_color_buffer_float')) {
    surface.canvas.remove();
    return cpuFallback(host);
  }

  const overlay = host.canvas({ alpha: true });
  const octx = overlay.ctx;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }
  function program(fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }
  const sim = program(SIM);
  const draw = program(DRAW);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  let simW = 0, simH = 0;
  let states = [], fbos = [], cur = 0;
  let maskTex = null, prevMaskTex = null;
  let maskCanvas = null, maskCtx = null;
  let maskKey = '';
  let maskChangedAt = -1e9;
  let seedLeft = 0;
  let warm = 0;

  function makeTex(w, h, data, internal, format, type, filter) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    return t;
  }

  function freeSim() {
    for (const t of states) gl.deleteTexture(t);
    for (const f of fbos) gl.deleteFramebuffer(f);
    if (maskTex) gl.deleteTexture(maskTex);
    if (prevMaskTex) gl.deleteTexture(prevMaskTex);
    states = []; fbos = []; maskTex = prevMaskTex = null;
  }

  function setupSim(cssW, cssH) {
    freeSim();
    const scale = clamp(Math.sqrt(770000 / (cssW * cssH)), 0.25, 0.5);
    simW = Math.max(64, Math.round(cssW * scale));
    simH = Math.max(64, Math.round(cssH * scale));
    const data = new Float32Array(simW * simH * 4);
    for (let i = 0; i < simW * simH; i++) { data[i * 4] = 1; data[i * 4 + 3] = 1; }
    // scattered seeds everywhere
    const blobs = Math.round((simW * simH) / 900);
    for (let n = 0; n < blobs; n++) {
      const cx = Math.floor(Math.random() * simW), cy = Math.floor(Math.random() * simH);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x = (cx + dx + simW) % simW, y = (cy + dy + simH) % simH;
        const i = (y * simW + x) * 4;
        data[i] = 0.5; data[i + 1] = 0.25 + Math.random() * 0.1;
      }
    }
    // RGBA16F keeps linear filtering available everywhere in WebGL2.
    for (let k = 0; k < 2; k++) {
      const t = makeTex(simW, simH, data, gl.RGBA16F, gl.RGBA, gl.FLOAT, gl.LINEAR);
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      states.push(t); fbos.push(f);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    maskCanvas = document.createElement('canvas');
    maskCanvas.width = simW; maskCanvas.height = simH;
    maskCtx = maskCanvas.getContext('2d', { willReadFrequently: false });
    maskTex = makeTex(simW, simH, null, gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.LINEAR);
    prevMaskTex = makeTex(simW, simH, null, gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.LINEAR);
    maskKey = '';
    warm = 1500; // fast-forward the first frames so the pattern is already grown
  }

  function renderMask(text, into) {
    const w = simW, h = simH;
    maskCtx.fillStyle = '#000';
    maskCtx.fillRect(0, 0, w, h);
    // portrait screens stack the hours over the minutes
    const lines = h > w * 1.2 ? text.split(':') : [text];
    let size = (h * 0.62) / lines.length;
    maskCtx.font = `800 ${size}px ${SANS}`;
    const tw = Math.max(...lines.map((l) => maskCtx.measureText(l).width));
    if (tw > w * 0.86) size *= (w * 0.86) / tw;
    maskCtx.font = `800 ${size}px ${SANS}`;
    maskCtx.textAlign = 'center';
    maskCtx.textBaseline = 'middle';
    maskCtx.fillStyle = '#fff';
    // canvas y is down, texture v is up: flip
    maskCtx.save();
    maskCtx.translate(0, h);
    maskCtx.scale(1, -1);
    lines.forEach((line, i) => {
      maskCtx.fillText(line, w / 2, h * 0.5 + (i - (lines.length - 1) / 2) * size * 0.95);
    });
    maskCtx.restore();
    gl.bindTexture(gl.TEXTURE_2D, into);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, maskCanvas);
  }

  function step(n, seed) {
    gl.useProgram(sim.p);
    gl.viewport(0, 0, simW, simH);
    gl.uniform2f(sim.u.uTexel, 1 / simW, 1 / simH);
    gl.uniform2f(sim.u.uIn, INSIDE[0], INSIDE[1]);
    gl.uniform2f(sim.u.uOut, OUTSIDE[0], OUTSIDE[1]);
    gl.uniform1i(sim.u.uState, 0);
    gl.uniform1i(sim.u.uMask, 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    for (let i = 0; i < n; i++) {
      const s = i === 0 && seed ? 1 : 0;
      gl.uniform3f(sim.u.uSeed, Math.random() * 100, Math.random() * 100, s);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[1 - cur]);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, states[cur]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      cur = 1 - cur;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  let lastCssW = 0, lastCssH = 0;
  let ms = 16;

  return {
    frame(now) {
      const W = overlay.width, H = overlay.height;
      if (Math.abs(W - lastCssW) > 2 || Math.abs(H - lastCssH) > 2) {
        lastCssW = W; lastCssH = H;
        setupSim(W, H);
      }
      const t = timeParts(now);
      const key = `${pad(t.h)}:${pad(t.m)}`;
      if (key !== maskKey) {
        const first = maskKey === '';
        // current mask becomes previous for the colour cross-fade
        const tmp = prevMaskTex; prevMaskTex = maskTex; maskTex = tmp;
        renderMask(key, maskTex);
        if (first) renderMask(key, prevMaskTex);
        maskKey = key;
        maskChangedAt = now;
        seedLeft = first ? 0 : 6;
      }

      const t0 = performance.now();
      let n = 12;
      if (warm > 0) { n = Math.min(warm, 60); warm -= n; }
      step(n, seedLeft > 0 && (seedLeft--, true));

      gl.viewport(0, 0, surface.width, surface.height);
      gl.useProgram(draw.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, states[cur]);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, prevMaskTex);
      gl.uniform1i(draw.u.uState, 0);
      gl.uniform1i(draw.u.uMask, 1);
      gl.uniform1i(draw.u.uPrevMask, 2);
      gl.uniform1f(draw.u.uBlend, clamp((now - maskChangedAt) / 6000, 0, 1));
      gl.uniform2f(draw.u.uTexel, 1 / simW, 1 / simH);
      // the light circles once a minute: a subtle second hand
      const a = t.minuteFrac * TAU;
      gl.uniform2f(draw.u.uLight, Math.sin(a), Math.cos(a));
      gl.uniform1f(draw.u.uTime, now / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      ms = ms * 0.95 + (performance.now() - t0) * 0.05;

      drawOverlay(octx, W, H, t);
    },
    destroy() {
      freeSim();
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(sim.p);
      gl.deleteProgram(draw.p);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

// Seconds: a thin ring of 60 ticks in the bottom-right, plus a small readout.
function drawOverlay(ctx, W, H, t) {
  ctx.clearRect(0, 0, W, H);
  const r = clamp(Math.min(W, H) * 0.045, 22, 60);
  const cx = W - r * 1.9, cy = H - r * 1.9;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU - Math.PI / 2;
    const on = i <= t.s;
    ctx.strokeStyle = on ? `rgba(255, 210, 150, ${i === t.s ? 0.95 : 0.45})` : 'rgba(160, 220, 230, 0.12)';
    ctx.lineWidth = i % 5 === 0 ? 2 : 1;
    const r0 = i % 5 === 0 ? r * 0.78 : r * 0.86;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.font = `300 ${r * 0.55}px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255, 225, 190, 0.85)';
  ctx.fillText(pad(t.s), cx, cy + 1);
}

// ---- CPU fallback for machines without float render targets ----------------
function cpuFallback(host) {
  const surface = host.canvas();
  const { ctx } = surface;
  const overlay = host.canvas({ alpha: true });
  let w = 0, h = 0, U, V, U2, V2, M, img, off, offCtx, maskKey = '', lastW = 0, lastH = 0;

  function setup(W, H) {
    w = Math.max(80, Math.round(W / 5)); h = Math.max(50, Math.round(H / 5));
    U = new Float32Array(w * h).fill(1); V = new Float32Array(w * h);
    U2 = new Float32Array(w * h); V2 = new Float32Array(w * h); M = new Float32Array(w * h);
    for (let n = 0; n < (w * h) / 300; n++) {
      const i = Math.floor(Math.random() * w * h);
      for (const d of [0, 1, w, w + 1]) if (i + d < w * h) { U[i + d] = 0.5; V[i + d] = 0.25; }
    }
    off = document.createElement('canvas'); off.width = w; off.height = h;
    offCtx = off.getContext('2d'); img = offCtx.createImageData(w, h);
    maskKey = ''; lastW = W; lastH = H;
  }
  function mask(text) {
    offCtx.fillStyle = '#000'; offCtx.fillRect(0, 0, w, h);
    let size = h * 0.62; offCtx.font = `800 ${size}px ${SANS}`;
    const tw = offCtx.measureText(text).width; if (tw > w * 0.86) size *= (w * 0.86) / tw;
    offCtx.font = `800 ${size}px ${SANS}`; offCtx.textAlign = 'center'; offCtx.textBaseline = 'middle';
    offCtx.fillStyle = '#fff'; offCtx.fillText(text, w / 2, h / 2);
    const d = offCtx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < w * h; i++) M[i] = d[i * 4] / 255;
  }
  function step() {
    for (let y = 0; y < h; y++) {
      const ym = ((y - 1 + h) % h) * w, y0 = y * w, yp = ((y + 1) % h) * w;
      for (let x = 0; x < w; x++) {
        const xm = (x - 1 + w) % w, xp = (x + 1) % w, i = y0 + x;
        const lu = 0.2 * (U[y0 + xm] + U[y0 + xp] + U[ym + x] + U[yp + x]) + 0.05 * (U[ym + xm] + U[ym + xp] + U[yp + xm] + U[yp + xp]) - U[i];
        const lv = 0.2 * (V[y0 + xm] + V[y0 + xp] + V[ym + x] + V[yp + x]) + 0.05 * (V[ym + xm] + V[ym + xp] + V[yp + xm] + V[yp + xp]) - V[i];
        const m = M[i];
        const F = OUTSIDE[0] + (INSIDE[0] - OUTSIDE[0]) * m, k = OUTSIDE[1] + (INSIDE[1] - OUTSIDE[1]) * m;
        const uvv = U[i] * V[i] * V[i];
        U2[i] = Math.min(1, Math.max(0, U[i] + DU * lu - uvv + F * (1 - U[i])));
        V2[i] = Math.min(1, Math.max(0, V[i] + DV * lv + uvv - (F + k) * V[i]));
      }
    }
    [U, U2] = [U2, U]; [V, V2] = [V2, V];
  }
  let warm = 800;
  return {
    frame(now) {
      const W = surface.width, H = surface.height;
      if (W !== lastW || H !== lastH) setup(W, H);
      const t = timeParts(now);
      const key = `${pad(t.h)}:${pad(t.m)}`;
      if (key !== maskKey) { mask(key); maskKey = key; }
      const n = warm > 0 ? 40 : 6;
      warm -= n;
      for (let i = 0; i < n; i++) step();
      const d = img.data;
      for (let i = 0; i < w * h; i++) {
        const s = clamp((V[i] - 0.08) / 0.34, 0, 1), m = M[i];
        d[i * 4] = (20 + 230 * s) * m + (5 + 60 * s) * (1 - m);
        d[i * 4 + 1] = (5 + 170 * s * s) * m + (8 + 150 * s) * (1 - m);
        d[i * 4 + 2] = (15 + 70 * s) * m + (15 + 160 * s) * (1 - m);
        d[i * 4 + 3] = 255;
      }
      offCtx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, W, H);
      drawOverlay(overlay.ctx, W, H, t);
    },
  };
}

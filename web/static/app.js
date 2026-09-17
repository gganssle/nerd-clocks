// Nerd Clocks runtime.
//
// Datastar owns the application state (which clock, overlays, cycling) and
// keeps it in sync with the server over SSE. This module owns the pixels: it
// lazy-loads the clock module named by the `clock` signal, gives it a canvas,
// and drives it from requestAnimationFrame.
//
// Clock modules live in /static/clocks/<id>.js and export:
//
//   export function create(host) {
//     // set up; host.canvas() / host.webgl() give auto-resizing surfaces
//     return {
//       frame(now, dt) {},   // now = epoch ms (honours ?at= and ?speed=), dt = seconds
//       destroy() {},        // optional
//     };
//   }

const params = new URLSearchParams(location.search);

// ---- time -----------------------------------------------------------------
// ?at=2026-03-14T15:09:26 starts the clock at a given moment; ?speed=60 runs
// it 60x faster. Both are useful for demos and for screenshot tests.
const speed = Number(params.get('speed')) || 1;
const realStart = performance.timeOrigin + performance.now();
const atParam = params.get('at');
const virtualStart = atParam
  ? (/^\d+$/.test(atParam) ? Number(atParam) : Date.parse(atParam))
  : realStart;

function now() {
  const real = performance.timeOrigin + performance.now();
  return virtualStart + (real - realStart) * speed;
}

// ---- location ---------------------------------------------------------------
const GREENWICH = { lat: 51.4779, lon: -0.0015 };
const location_ = { ...GREENWICH, source: 'default' };

function configure({ location: loc, solo } = {}) {
  if (params.has('lat') && params.has('lon')) {
    Object.assign(location_, { lat: +params.get('lat'), lon: +params.get('lon'), source: 'url' });
  } else if (loc && loc.known) {
    Object.assign(location_, { lat: loc.lat, lon: loc.lon, source: 'server' });
  } else if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (p) => Object.assign(location_, { lat: p.coords.latitude, lon: p.coords.longitude, source: 'browser' }),
      () => {},
      { timeout: 10000, maximumAge: 24 * 3600 * 1000 },
    );
  }
  document.body.classList.toggle('solo', !!solo);
}

// ---- surfaces ---------------------------------------------------------------
function makeHost(el) {
  const surfaces = [];
  const resizeHooks = [];

  function fit() {
    const r = el.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const s of surfaces) s.fit(r.width, r.height, dpr);
    for (const fn of resizeHooks) fn(r.width, r.height);
  }

  const host = {
    el,
    params,
    now,
    date: () => new Date(now()),
    location: location_,
    get width() { return el.clientWidth; },
    get height() { return el.clientHeight; },
    onResize(fn) { resizeHooks.push(fn); },

    // A 2D canvas whose context is pre-scaled so you draw in CSS pixels.
    // opts.scale < 1 renders at reduced resolution (for per-pixel effects).
    canvas(opts = {}) {
      const canvas = document.createElement('canvas');
      el.appendChild(canvas);
      const ctx = canvas.getContext('2d', { alpha: opts.alpha ?? false });
      const s = {
        canvas, ctx, width: 0, height: 0, dpr: 1,
        fit(w, h, dpr) {
          const scale = (opts.scale ?? 1) * dpr;
          s.width = w; s.height = h; s.dpr = scale;
          canvas.width = Math.max(1, Math.round(w * scale));
          canvas.height = Math.max(1, Math.round(h * scale));
          ctx.setTransform(scale, 0, 0, scale, 0, 0);
          if (opts.pixelated) canvas.style.imageRendering = 'pixelated';
        },
      };
      surfaces.push(s);
      fit();
      return s;
    },

    // A WebGL canvas; width/height are in device pixels.
    webgl(opts = {}) {
      const canvas = document.createElement('canvas');
      el.appendChild(canvas);
      const gl = canvas.getContext('webgl2', { antialias: true, ...opts }) || canvas.getContext('webgl', opts);
      const s = {
        canvas, gl, width: 0, height: 0, dpr: 1,
        fit(w, h, dpr) {
          const scale = (opts.scale ?? 1) * dpr;
          s.dpr = scale;
          s.width = canvas.width = Math.max(1, Math.round(w * scale));
          s.height = canvas.height = Math.max(1, Math.round(h * scale));
          gl && gl.viewport(0, 0, s.width, s.height);
        },
      };
      surfaces.push(s);
      fit();
      return s;
    },
  };

  const ro = new ResizeObserver(fit);
  ro.observe(el);
  host._dispose = () => ro.disconnect();
  return host;
}

// ---- mounting -----------------------------------------------------------------
const stage = () => document.getElementById('stage');
let layers = []; // [{id, el, host, clock, dead}]
let wanted = null;

async function mount(id) {
  if (!id || id === wanted) return;
  wanted = id;
  let mod;
  try {
    mod = await import(`/static/clocks/${id}.js`);
  } catch (err) {
    console.error(err);
    showError(id, err);
    return;
  }
  if (wanted !== id) return; // user moved on while we were loading

  const el = document.createElement('div');
  el.className = 'clock-layer';
  el.dataset.clock = id;
  stage().appendChild(el);
  const host = makeHost(el);
  let clock;
  try {
    clock = mod.create(host);
  } catch (err) {
    console.error(err);
    el.remove();
    showError(id, err);
    return;
  }
  const layer = { id, el, host, clock };

  for (const old of layers) retire(old);
  layers.push(layer);
  requestAnimationFrame(() => el.classList.add('in'));
}

function retire(layer) {
  if (layer.dead) return;
  layer.dead = true;
  layer.el.classList.remove('in');
  layer.el.classList.add('out');
  setTimeout(() => {
    try { layer.clock.destroy?.(); } catch (err) { console.error(err); }
    layer.host._dispose();
    layer.el.remove();
    layers = layers.filter((l) => l !== layer);
  }, 900);
}

function showError(id, err) {
  const el = document.createElement('div');
  el.className = 'clock-layer in clock-error';
  el.textContent = `clock "${id}" failed: ${err?.message || err}`;
  for (const old of layers) retire(old);
  stage().appendChild(el);
  layers.push({ id, el, host: { _dispose() {} }, clock: {} });
}

let last = performance.now();
function loop(ts) {
  const dt = Math.min(0.25, (ts - last) / 1000) * speed;
  last = ts;
  const t = now();
  for (const layer of layers) {
    if (!layer.clock.frame || layer.failed) continue;
    try {
      layer.clock.frame(t, dt);
    } catch (err) {
      layer.failed = true;
      console.error(`clock ${layer.id} crashed`, err);
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}

if (params.get('chrome') === '0') document.documentElement.classList.add('no-chrome');

window.nerd = { mount, configure, toggleFullscreen, now };

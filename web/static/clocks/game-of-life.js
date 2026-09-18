// Game of Life: Conway's B3/S23 cellular automaton boiling on a torus, with the
// time stamped into the grid as permanently-live "wall" cells. A one-cell dead
// moat around every digit absorbs anything that crashes into it. When a digit
// changes, the cells it releases become ordinary Life and explode into the soup.
import { TAU, timeParts, pad, clamp, SANS, MONO } from '../lib/util.js';
import { BITMAP } from '../lib/glyphs.js';

// Like glyphs.bitmapCells, but with an unslashed zero (reads better at size).
const ZERO = ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'];
function cellsFor(text, gap = 1) {
  const cells = [];
  let x0 = 0;
  for (const ch of text) {
    const rows = ch === '0' ? ZERO : BITMAP[ch] || BITMAP[' '];
    const narrow = ch === ':';
    const colStart = narrow ? 1 : 0, width = narrow ? 3 : 5;
    for (let y = 0; y < 7; y++) for (let x = 0; x < width; x++) if (rows[y][x + colStart] === '#') cells.push([x0 + x, y]);
    x0 += width + gap;
  }
  return { cells, width: x0 - gap };
}

const GEN_PER_SEC = 14;
const FREE = 0, WALL = 1, MOAT = 2;

const PATTERNS = {
  glider: [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]],
  rpent: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]],
  acorn: [[1, 0], [3, 1], [0, 2], [1, 2], [4, 2], [5, 2], [6, 2]],
  lwss: [[1, 0], [4, 0], [0, 1], [0, 2], [4, 2], [0, 3], [1, 3], [2, 3], [3, 3]],
  diehard: [[6, 0], [0, 1], [1, 1], [1, 2], [5, 2], [6, 2], [7, 2]],
};

export function create(host) {
  const surface = host.canvas();
  const { ctx } = surface;

  let cols = 0, rows = 0, cs = 0, ox = 0, oy = 0;
  let alive, next, age, heat, mask;
  let glowCanvas, glowCtx, glowImg;
  let stamped = '';
  let acc = 0;
  let dirty = true;
  let lastW = 0, lastH = 0;

  function setup(W, H) {
    cs = clamp(Math.round(Math.max(W, H) / 170), 6, 18);
    cols = Math.floor(W / cs);
    rows = Math.floor(H / cs);
    ox = (W - cols * cs) / 2;
    oy = (H - rows * cs) / 2;
    const n = cols * rows;
    alive = new Uint8Array(n);
    next = new Uint8Array(n);
    age = new Uint16Array(n);
    heat = new Float32Array(n);
    mask = new Uint8Array(n);
    glowCanvas = document.createElement('canvas');
    glowCanvas.width = cols;
    glowCanvas.height = rows;
    glowCtx = glowCanvas.getContext('2d');
    glowImg = glowCtx.createImageData(cols, rows);
    stamped = '';
    // initial soup
    for (let i = 0; i < n; i++) alive[i] = Math.random() < 0.28 ? 1 : 0;
    lastW = W; lastH = H;
  }

  function stamp(t) {
    const top = `${pad(t.h)}:${pad(t.m)}`;
    const sec = pad(t.s);
    const key = top + sec;
    if (key === stamped) return;
    stamped = key;
    // Landscape: "HH:MM" over the seconds. Portrait: HH, MM and SS stacked.
    const portrait = rows > cols * 1.2;
    const lines = portrait
      ? [[pad(t.h), 1], [pad(t.m), 1], [sec, 0.55]]
      : [[top, 1], [sec, 0.55]];
    const glyphs = lines.map(([txt, rel]) => ({ ...cellsFor(txt), rel }));
    const widest = Math.max(...glyphs.filter((g) => g.rel === 1).map((g) => g.width));
    let b = Math.max(2, Math.floor((cols * (portrait ? 0.7 : 0.62)) / widest));
    b = Math.min(b, Math.floor((rows * 0.42) / (7 * (portrait ? 2 : 1))));
    const s = Math.max(1, Math.round(b * 0.55));
    const gapRows = Math.max(2, Math.round(b * 1.2));
    const scaleOf = (g) => (g.rel === 1 ? b : s);
    const totalH = glyphs.reduce((acc, g) => acc + 7 * scaleOf(g), 0) + gapRows * (glyphs.length - 1);
    let yCursor = Math.floor((rows - totalH) / 2);
    const placed = glyphs.map((g) => {
      const sc = scaleOf(g);
      const out = { g, sc, x0: Math.floor((cols - g.width * sc) / 2), y0: yCursor };
      yCursor += 7 * sc + gapRows;
      return out;
    });

    const old = mask;
    mask = new Uint8Array(cols * rows);
    const put = (cells, x0, y0, scale) => {
      for (const [cx, cy] of cells) {
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
          const x = x0 + cx * scale + dx, y = y0 + cy * scale + dy;
          if (x >= 0 && y >= 0 && x < cols && y < rows) mask[y * cols + x] = WALL;
        }
      }
    };
    for (const p of placed) put(p.g.cells, p.x0, p.y0, p.sc);
    // moat: dead ring around walls
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (mask[i] !== WALL) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
          const j = yy * cols + xx;
          if (mask[j] === FREE) mask[j] = MOAT;
        }
      }
    }
    // Released wall cells stay alive for one more generation and then follow
    // the rules, so vanished digit strokes shatter into the soup.
    for (let i = 0; i < old.length && i < mask.length; i++) {
      if (old[i] === WALL && mask[i] !== WALL) { alive[i] = 1; age[i] = 0; }
    }
    applyMask();
    dirty = true;
  }

  function applyMask() {
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === WALL) alive[i] = 1;
      else if (mask[i] === MOAT) alive[i] = 0;
    }
  }

  function place(pattern, x0, y0) {
    const fx = Math.random() < 0.5 ? -1 : 1, fy = Math.random() < 0.5 ? -1 : 1;
    const swap = Math.random() < 0.5;
    for (let [px, py] of pattern) {
      if (swap) [px, py] = [py, px];
      const x = ((x0 + fx * px) % cols + cols) % cols;
      const y = ((y0 + fy * py) % rows + rows) % rows;
      const i = y * cols + x;
      if (mask[i] === FREE) { alive[i] = 1; age[i] = 0; }
    }
  }

  function seed() {
    const names = Object.keys(PATTERNS);
    // favour the screen edges so things drift inwards
    const edge = Math.random() < 0.6;
    let x = Math.floor(Math.random() * cols), y = Math.floor(Math.random() * rows);
    if (edge) {
      if (Math.random() < 0.5) y = Math.random() < 0.5 ? 2 : rows - 10;
      else x = Math.random() < 0.5 ? 2 : cols - 10;
    }
    if (Math.random() < 0.25) {
      for (let dy = 0; dy < 9; dy++) for (let dx = 0; dx < 9; dx++) {
        if (Math.random() < 0.45) place([[0, 0]], x + dx, y + dy);
      }
    } else {
      const name = names[Math.floor(Math.random() * names.length)];
      place(PATTERNS[name], x, y);
    }
  }

  let population = 0;
  function step() {
    const c = cols, r = rows;
    let pop = 0;
    for (let y = 0; y < r; y++) {
      const ym = (y - 1 + r) % r * c, y0 = y * c, yp = (y + 1) % r * c;
      for (let x = 0; x < c; x++) {
        const xm = (x - 1 + c) % c, xp = (x + 1) % c;
        const n = alive[ym + xm] + alive[ym + x] + alive[ym + xp]
          + alive[y0 + xm] + alive[y0 + xp]
          + alive[yp + xm] + alive[yp + x] + alive[yp + xp];
        const i = y0 + x;
        const a = alive[i];
        const v = (n === 3 || (a && n === 2)) ? 1 : 0;
        next[i] = v;
      }
    }
    for (let i = 0; i < next.length; i++) {
      const m = mask[i];
      let v = next[i];
      if (m === WALL) v = 1; else if (m === MOAT) v = 0;
      if (v) {
        age[i] = alive[i] ? Math.min(65535, age[i] + 1) : 0;
        heat[i] = 1;
        if (m === FREE) pop++;
      } else {
        heat[i] *= 0.84;
      }
      next[i] = v;
    }
    const tmp = alive; alive = next; next = tmp;
    population = pop;
  }

  // Age -> colour: newborns burn orange, then pink, violet, and cool to blue
  // as they survive; long-lived still lifes end up deep blue.
  const STOPS = [
    [0, [255, 140, 60]], [2, [255, 70, 120]], [6, [196, 80, 255]],
    [20, [90, 120, 255]], [80, [40, 170, 255]], [255, [30, 90, 200]],
  ];
  const RGB = [];
  for (let a = 0; a < 256; a++) {
    let j = 0;
    while (j < STOPS.length - 2 && a > STOPS[j + 1][0]) j++;
    const [a0, c0] = STOPS[j], [a1, c1] = STOPS[j + 1];
    const u = Math.min(1, Math.max(0, (a - a0) / (a1 - a0)));
    RGB.push(c0.map((v, i) => Math.round(v + (c1[i] - v) * u)));
  }
  const BUCKETS = [0, 1, 2, 3, 5, 8, 12, 20, 35, 60, 100, 160, 255];
  const bucketOf = (a) => { let b = 0; while (b < BUCKETS.length - 1 && a >= BUCKETS[b + 1]) b++; return b; };
  const BUCKET_STYLE = BUCKETS.map((a) => `rgb(${RGB[a].join(',')})`);
  const WALL_RGB = [150, 255, 225];

  function render(W, H, now, t) {
    ctx.fillStyle = '#030408';
    ctx.fillRect(0, 0, W, H);

    // soft glow field: one pixel per cell, scaled up with smoothing
    const d = glowImg.data;
    for (let i = 0, p = 0; i < heat.length; i++, p += 4) {
      const hv = heat[i];
      if (hv < 0.02) { d[p] = d[p + 1] = d[p + 2] = 0; d[p + 3] = 255; continue; }
      const rgb = mask[i] === WALL ? WALL_RGB : RGB[Math.min(255, age[i])];
      const k = alive[i] ? 0.55 : hv * 0.5;
      d[p] = rgb[0] * k; d[p + 1] = rgb[1] * k; d[p + 2] = rgb[2] * k; d[p + 3] = 255;
    }
    glowCtx.putImageData(glowImg, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55;
    // blurred halo (drawn slightly larger) + tight heat layer
    ctx.drawImage(glowCanvas, ox - cs, oy - cs, cols * cs + 2 * cs, rows * cs + 2 * cs);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(glowCanvas, ox, oy, cols * cs, rows * cs);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // crisp cells, batched by colour bucket
    const r = cs * 0.28, inset = Math.max(0.5, cs * 0.1), size = cs - inset * 2;
    const buckets = new Map();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (!alive[i]) continue;
        const key = mask[i] === WALL ? -1 : bucketOf(age[i]);
        let path = buckets.get(key);
        if (!path) { path = new Path2D(); buckets.set(key, path); }
        path.roundRect(ox + x * cs + inset, oy + y * cs + inset, size, size, r);
      }
    }
    for (const [key, path] of buckets) {
      ctx.fillStyle = key === -1 ? 'rgb(205, 255, 238)' : BUCKET_STYLE[key];
      ctx.fill(path);
    }

    // seconds progress along the bottom edge + generation counter
    const barY = H - Math.max(10, cs * 0.9);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, barY, W, 3);
    ctx.fillStyle = 'rgba(160, 255, 220, 0.6)';
    ctx.fillRect(0, barY, W * t.minuteFrac, 3);
    const fs = clamp(Math.min(W, H) * 0.014, 11, 18);
    ctx.font = `${fs}px ${MONO}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    const label = `B3/S23 · gen ${generation.toLocaleString('en-US')} · pop ${population.toLocaleString('en-US')}`;
    const tw = ctx.measureText(label).width;
    ctx.fillRect(W - tw - fs * 2.4, barY - fs * 2.2, tw + fs * 1.6, fs * 1.7);
    ctx.fillStyle = 'rgba(190, 230, 215, 0.75)';
    ctx.fillText(label, W - fs * 1.6, barY - fs * 0.75);
  }

  let generation = 0;
  let seedAcc = 0;

  return {
    frame(now, dt) {
      const W = surface.width, H = surface.height;
      if (W !== lastW || H !== lastH || !alive) {
        setup(W, H);
        const t0 = timeParts(now);
        stamp(t0);
        for (let i = 0; i < 60; i++) step();
        for (let i = 0; i < 25; i++) seed();
        dirty = true;
      }
      const t = timeParts(now);
      stamp(t);

      acc += dt;
      let steps = 0;
      while (acc >= 1 / GEN_PER_SEC && steps < 4) {
        acc -= 1 / GEN_PER_SEC;
        step();
        generation++;
        steps++;
        seedAcc += 1 / GEN_PER_SEC;
        const want = population < cols * rows * 0.05 ? 0.12 : 0.6;
        while (seedAcc > want) { seedAcc -= want; seed(); }
      }
      if (acc > 1) acc = 0;
      if (steps || dirty) {
        render(W, H, now, t);
        dirty = false;
      } else {
        // keep the seconds bar moving smoothly between generations
        const barY = H - Math.max(10, cs * 0.9);
        ctx.fillStyle = 'rgba(160, 255, 220, 0.6)';
        ctx.fillRect(0, barY, W * t.minuteFrac, 3);
      }
    },
  };
}

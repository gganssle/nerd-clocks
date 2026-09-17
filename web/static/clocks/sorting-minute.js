// Sorting Minute: every minute a fresh shuffle is sorted by a different
// algorithm. The whole operation trace is recorded up front, then replayed so
// the sort finishes at :55, which makes the progress of the sort a seconds hand.
import { TAU, clamp, easeInOut, timeParts, pad, rng, SANS, MONO } from '../lib/util.js';

const N = 96;
const SORT_START = 1.2; // seconds into the minute
const SORT_END = 55;

// ---- algorithms (each records ops through the recorder `r`) -----------------
function quicksort(a, r, rand) {
  const part = (lo, hi) => {
    const p = lo + Math.floor(rand() * (hi - lo + 1));
    r.swap(p, hi);
    let i = lo;
    for (let j = lo; j < hi; j++) {
      if (r.less(j, hi)) { r.swap(i, j); i++; }
    }
    r.swap(i, hi);
    return i;
  };
  const qs = (lo, hi) => {
    if (lo >= hi) return;
    const p = part(lo, hi);
    qs(lo, p - 1);
    qs(p + 1, hi);
  };
  qs(0, a.length - 1);
}

function mergesort(a, r) {
  const aux = a.slice();
  const ms = (lo, hi) => {
    if (hi - lo < 1) return;
    const mid = (lo + hi) >> 1;
    ms(lo, mid);
    ms(mid + 1, hi);
    for (let k = lo; k <= hi; k++) aux[k] = a[k];
    let i = lo, j = mid + 1;
    for (let k = lo; k <= hi; k++) {
      if (i > mid) r.write(k, aux[j++]);
      else if (j > hi) r.write(k, aux[i++]);
      else { r.cmpAt(i, j); if (aux[j] < aux[i]) r.write(k, aux[j++]); else r.write(k, aux[i++]); }
    }
  };
  ms(0, a.length - 1);
}

function heapsort(a, r) {
  const n = a.length;
  const sift = (i, size) => {
    for (;;) {
      const l = 2 * i + 1, rr = l + 1;
      let m = i;
      if (l < size && r.less(m, l)) m = l;
      if (rr < size && r.less(m, rr)) m = rr;
      if (m === i) return;
      r.swap(i, m);
      i = m;
    }
  };
  for (let i = (n >> 1) - 1; i >= 0; i--) sift(i, n);
  for (let end = n - 1; end > 0; end--) { r.swap(0, end); sift(0, end); }
}

function shellsort(a, r) {
  for (const gap of [57, 23, 10, 4, 1]) {
    for (let i = gap; i < a.length; i++) {
      for (let j = i; j >= gap && r.less(j, j - gap); j -= gap) r.swap(j, j - gap);
    }
  }
}

function radixLSD(a, r) {
  const BASE = 4;
  const n = a.length;
  for (let div = 1; div < n; div *= BASE) {
    const buckets = Array.from({ length: BASE }, () => []);
    for (let i = 0; i < n; i++) { r.read(i); buckets[Math.floor(a[i] / div) % BASE].push(a[i]); }
    let k = 0;
    for (const b of buckets) for (const v of b) r.write(k++, v);
  }
}

function cocktail(a, r) {
  let lo = 0, hi = a.length - 1, swapped = true;
  while (swapped) {
    swapped = false;
    for (let i = lo; i < hi; i++) if (r.less(i + 1, i)) { r.swap(i, i + 1); swapped = true; }
    hi--;
    for (let i = hi; i > lo; i--) if (r.less(i, i - 1)) { r.swap(i, i - 1); swapped = true; }
    lo++;
  }
}

function insertion(a, r) {
  for (let i = 1; i < a.length; i++) {
    for (let j = i; j > 0 && r.less(j, j - 1); j--) r.swap(j, j - 1);
  }
}

function selection(a, r) {
  for (let i = 0; i < a.length - 1; i++) {
    let m = i;
    for (let j = i + 1; j < a.length; j++) if (r.less(j, m)) m = j;
    if (m !== i) r.swap(i, m);
  }
}

const ALGORITHMS = [
  { name: 'Quicksort', big: 'O(n log n) average · O(n²) worst', fn: quicksort, stable: false },
  { name: 'Merge sort', big: 'O(n log n) always · stable', fn: mergesort, stable: true },
  { name: 'Heapsort', big: 'O(n log n) · in place', fn: heapsort, stable: false },
  { name: 'Shell sort', big: '≈ O(n^1.3) with Ciura gaps', fn: shellsort, stable: false },
  { name: 'Radix sort (LSD, base 4)', big: 'O(n·k) · no comparisons', fn: radixLSD, stable: true },
  { name: 'Cocktail shaker sort', big: 'O(n²) · stable', fn: cocktail, stable: true },
  { name: 'Insertion sort', big: 'O(n²) · great on nearly sorted data', fn: insertion, stable: true },
  { name: 'Selection sort', big: 'O(n²) · minimal swaps', fn: selection, stable: false },
];

// Op codes
const CMP = 0, SWAP = 1, WRITE = 2, READ = 3;

function buildRun(minuteKey, algoIndex) {
  const rand = rng(minuteKey * 2654435761);
  const initial = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [initial[i], initial[j]] = [initial[j], initial[i]];
  }
  const a = initial.slice();
  const ops = [];
  let compares = 0, moves = 0;
  const cmpCount = [], moveCount = [];
  const push = (op, i, j) => {
    ops.push(op, i, j);
    if (op === CMP || op === READ) compares++; else moves++;
    cmpCount.push(compares);
    moveCount.push(moves);
  };
  const r = {
    less(i, j) { push(CMP, i, j); return a[i] < a[j]; },
    cmpAt(i, j) { push(CMP, i, j); },
    read(i) { push(READ, i, i); },
    swap(i, j) { push(SWAP, i, j); const t = a[i]; a[i] = a[j]; a[j] = t; },
    write(i, v) { push(WRITE, i, v); a[i] = v; },
  };
  const algo = ALGORITHMS[algoIndex];
  algo.fn(a, r, rand);
  return { key: minuteKey, algo, initial, ops, count: ops.length / 3, cmpCount, moveCount, sorted: a.every((v, i) => v === i) };
}

export function create(host) {
  const surface = host.canvas();
  const { ctx } = surface;
  let run = null;
  let cur = new Array(N);
  let applied = 0;
  const heat = new Float32Array(N);
  const hot = new Float32Array(N); // moved elements

  function ensureRun(t) {
    const d = t.date;
    const dayNumber = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
    const minuteKey = dayNumber * 1440 + t.h * 60 + t.m;
    if (!run || run.key !== minuteKey) {
      run = buildRun(minuteKey, minuteKey % ALGORITHMS.length);
      cur = run.initial.slice();
      applied = 0;
      heat.fill(0); hot.fill(0);
    }
    return minuteKey;
  }

  function applyTo(target) {
    if (target < applied) { cur = run.initial.slice(); applied = 0; }
    const burst = target - applied;
    for (let k = applied; k < target; k++) {
      const op = run.ops[k * 3], i = run.ops[k * 3 + 1], j = run.ops[k * 3 + 2];
      const recent = target - k <= 6 || burst < 40;
      if (op === SWAP) {
        const tmp = cur[i]; cur[i] = cur[j]; cur[j] = tmp;
        if (recent) { hot[i] = 1; hot[j] = 1; }
      } else if (op === WRITE) {
        cur[i] = j;
        if (recent) hot[i] = 1;
      } else if (recent) {
        heat[i] = 1; heat[j] = 1;
      }
    }
    applied = target;
  }

  function wedge(cx, cy, r0, r1, a0, a1) {
    ctx.beginPath();
    ctx.arc(cx, cy, r1, a0, a1);
    ctx.arc(cx, cy, r0, a1, a0, true);
    ctx.closePath();
  }

  return {
    frame(now, dt) {
      const W = surface.width, H = surface.height;
      const t = timeParts(now);
      const minuteKey = ensureRun(t);
      const sec = t.minuteFrac * 60;

      const decay = Math.exp(-dt * 6);
      for (let i = 0; i < N; i++) { heat[i] *= decay; hot[i] *= decay; }

      let phase;
      let values = cur;
      if (sec < SORT_START) {
        phase = 'shuffle';
        applyTo(0);
        const f = sec / SORT_START;
        values = run.initial.map((v, i) => {
          const local = clamp(f * 1.6 - (i / N) * 0.6, 0, 1);
          return i + (v - i) * easeInOut(local);
        });
      } else if (sec < SORT_END) {
        phase = 'sort';
        const p = (sec - SORT_START) / (SORT_END - SORT_START);
        applyTo(Math.min(run.count, Math.floor(p * run.count)));
      } else {
        phase = 'done';
        applyTo(run.count);
      }

      // background
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, W, H);
      const U = Math.min(W, H);
      const cx = W / 2, cy = H / 2;
      const R = U * 0.43;
      const r0 = R * 0.42;
      const bgGlow = ctx.createRadialGradient(cx, cy, r0 * 0.5, cx, cy, R * 1.5);
      bgGlow.addColorStop(0, 'rgba(40, 30, 70, 0.55)');
      bgGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, W, H);

      const slot = TAU / N;
      const sweepPos = phase === 'done' ? ((sec - SORT_END) / 3.2) * N : -99;
      const bars = [];
      for (let i = 0; i < N; i++) {
        const v = values[i];
        const a0 = -Math.PI / 2 + i * slot + slot * 0.1;
        const a1 = a0 + slot * 0.8;
        const r1 = r0 + ((v + 1) / N) * (R - r0);
        const sweep = phase === 'done' ? Math.max(0, 1 - Math.abs(i - sweepPos) / 6) : 0;
        bars.push({ a0, a1, r1, v, sweep, h: heat[i], m: hot[i] });
      }

      // soft glow pass
      ctx.globalCompositeOperation = 'lighter';
      for (const b of bars) {
        ctx.fillStyle = `hsla(${(b.v / N) * 360}, 90%, 55%, 0.10)`;
        wedge(cx, cy, r0 * 0.96, b.r1 + R * 0.03, b.a0 - slot * 0.35, b.a1 + slot * 0.35);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      for (const b of bars) {
        const hueV = (b.v / N) * 360;
        const light = 52 + b.m * 30 + b.sweep * 35;
        ctx.fillStyle = `hsl(${hueV}, ${90 - b.m * 40}%, ${Math.min(96, light)}%)`;
        wedge(cx, cy, r0, b.r1, b.a0, b.a1);
        ctx.fill();
        if (b.h > 0.05) {
          ctx.fillStyle = `rgba(255,255,255,${b.h * 0.75})`;
          wedge(cx, cy, b.r1 + R * 0.012, b.r1 + R * 0.04, b.a0, b.a1);
          ctx.fill();
        }
      }

      // seconds ring
      const ringR = R * 1.08;
      for (let s = 0; s < 60; s++) {
        const a = -Math.PI / 2 + (s / 60) * TAU;
        const on = s <= t.s;
        const len = s % 5 === 0 ? R * 0.04 : R * 0.018;
        ctx.strokeStyle = on ? `rgba(240,240,255,${s === t.s ? 0.95 : 0.5})` : 'rgba(255,255,255,0.10)';
        ctx.lineWidth = s % 5 === 0 ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * ringR, cy + Math.sin(a) * ringR);
        ctx.lineTo(cx + Math.cos(a) * (ringR + len), cy + Math.sin(a) * (ringR + len));
        ctx.stroke();
      }

      // centre text
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(245,245,255,0.95)';
      ctx.font = `200 ${r0 * 0.52}px ${SANS}`;
      ctx.fillText(`${pad(t.h)}:${pad(t.m)}`, cx, cy + r0 * 0.02);

      ctx.font = `600 ${r0 * 0.085}px ${MONO}`;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(run.algo.name.toUpperCase(), cx, cy - r0 * 0.42);
      ctx.font = `${r0 * 0.07}px ${MONO}`;
      ctx.fillStyle = 'rgba(200,200,225,0.55)';
      ctx.fillText(run.algo.big, cx, cy - r0 * 0.3);

      const idx = Math.max(0, applied - 1);
      const cmps = applied ? run.cmpCount[idx] : 0;
      const moves = applied ? run.moveCount[idx] : 0;
      const moveWord = run.algo.fn === mergesort || run.algo.fn === radixLSD ? 'writes' : 'swaps';
      const cmpWord = run.algo.fn === radixLSD ? 'reads' : 'compares';
      ctx.font = `${r0 * 0.075}px ${MONO}`;
      ctx.fillStyle = 'rgba(230,230,245,0.75)';
      ctx.fillText(`${cmps.toLocaleString('en-US')} ${cmpWord} · ${moves.toLocaleString('en-US')} ${moveWord}`, cx, cy + r0 * 0.34);
      ctx.fillStyle = 'rgba(200,200,225,0.5)';
      const status = phase === 'shuffle' ? 'shuffling…'
        : phase === 'sort' ? `${Math.floor((applied / run.count) * 100)}% of ${run.count.toLocaleString('en-US')} steps`
        : 'sorted ✓';
      ctx.fillText(status, cx, cy + r0 * 0.46);
      ctx.fillStyle = 'rgba(200,200,225,0.35)';
      ctx.font = `${r0 * 0.062}px ${MONO}`;
      ctx.fillText(`next: ${ALGORITHMS[(minuteKey + 1) % ALGORITHMS.length].name}`, cx, cy + r0 * 0.58);
    },
  };
}

export const _test = { buildRun, ALGORITHMS, N };

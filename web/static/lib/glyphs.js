// Glyphs shared by several clocks.
//
// 1. BITMAP: a classic 5x7 dot-matrix font for digits and a little
//    punctuation. Rows are strings, '#' is lit.
// 2. strokeGlyph(): single-stroke vector digits for "beam" style clocks
//    (oscilloscope, Fourier). Coordinates live in a 1 x 2 box, y down.

export const BITMAP = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ':': ['.....', '..#..', '..#..', '.....', '..#..', '..#..', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

// Lit cells of a string rendered in BITMAP, as [x, y] pairs. Characters are
// 5 wide with `gap` blank columns between them (a narrow colon uses 3).
export function bitmapCells(text, gap = 1) {
  const cells = [];
  let x0 = 0;
  for (const ch of text) {
    const rows = BITMAP[ch] || BITMAP[' '];
    const narrow = ch === ':' || ch === '.';
    const colStart = narrow ? 1 : 0;
    const width = narrow ? 3 : 5;
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < width; x++) {
        if (rows[y][x + colStart] === '#') cells.push([x0 + x, y]);
      }
    }
    x0 += width + gap;
  }
  return { cells, width: x0 - gap, height: 7 };
}

// ---- stroke glyphs -----------------------------------------------------------
// Path commands: ['M', x, y] move, ['L', x, y] line,
// ['A', cx, cy, rx, ry, a0, a1] elliptical arc from angle a0 to a1 (radians,
// y down so +angle is clockwise on screen).
const P = Math.PI;
const STROKES = {
  '0': [[['A', 0.5, 1, 0.5, 1, -P / 2, 1.5 * P]]],
  '1': [[['M', 0.2, 0.45], ['L', 0.58, 0], ['L', 0.58, 2]]],
  '2': [[['A', 0.5, 0.52, 0.5, 0.52, P, 2.25 * P], ['L', 0, 2], ['L', 1, 2]]],
  '3': [[['A', 0.5, 0.5, 0.48, 0.5, 1.15 * P, 2.5 * P], ['A', 0.5, 1.5, 0.5, 0.5, -0.5 * P, 0.85 * P]]],
  '4': [[['M', 0.75, 2], ['L', 0.75, 0], ['L', 0, 1.4], ['L', 1, 1.4]]],
  '5': [[['M', 0.92, 0], ['L', 0.12, 0], ['L', 0.04, 0.92], ['A', 0.46, 1.36, 0.54, 0.64, -2.3, 2.55]]],
  '6': [[['M', 0.82, 0.02], ['L', 0.06, 1.3], ['A', 0.5, 1.5, 0.5, 0.5, P + 0.4, 3 * P + 0.4]]],
  '7': [[['M', 0, 0], ['L', 1, 0], ['L', 0.32, 2]]],
  '8': [
    [['A', 0.5, 0.5, 0.42, 0.5, P / 2, 2.5 * P]],
    [['A', 0.5, 1.5, 0.5, 0.5, -P / 2, 1.5 * P]],
  ],
  '9': [[['A', 0.5, 0.5, 0.5, 0.5, 0.4, 2 * P + 0.4], ['L', 0.3, 2]]],
  ':': [
    [['A', 0.5, 0.6, 0.09, 0.09, 0, 2.5 * P]],
    [['A', 0.5, 1.4, 0.09, 0.09, 0, 2.5 * P]],
  ],
};

// Returns an array of polylines ([[x, y], ...]) for ch, sampled so that
// consecutive points are at most `step` apart (in glyph units).
export function strokeGlyph(ch, step = 0.04) {
  const out = [];
  for (const path of STROKES[ch] || []) {
    const pts = [];
    let cur = null;
    const lineTo = (x, y) => {
      if (!cur) { pts.push([x, y]); cur = [x, y]; return; }
      const n = Math.max(1, Math.ceil(Math.hypot(x - cur[0], y - cur[1]) / step));
      for (let i = 1; i <= n; i++) pts.push([cur[0] + ((x - cur[0]) * i) / n, cur[1] + ((y - cur[1]) * i) / n]);
      cur = [x, y];
    };
    for (const c of path) {
      if (c[0] === 'M') { cur = null; lineTo(c[1], c[2]); }
      else if (c[0] === 'L') lineTo(c[1], c[2]);
      else if (c[0] === 'A') {
        const [, cx, cy, rx, ry, a0, a1] = c;
        const len = Math.abs(a1 - a0) * Math.max(rx, ry);
        const n = Math.max(8, Math.ceil(len / step));
        for (let i = 0; i <= n; i++) {
          const a = a0 + ((a1 - a0) * i) / n;
          lineTo(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
        }
      }
    }
    out.push(pts);
  }
  return out;
}

// Lays out a string of stroke glyphs. Returns polylines in a coordinate space
// where each glyph is 1 wide and 2 tall, with `tracking` between glyphs
// (colons are narrower). Also returns the total width.
export function strokeText(text, { tracking = 0.45, step = 0.04 } = {}) {
  const lines = [];
  let x = 0;
  for (const ch of text) {
    const w = ch === ':' ? 0.4 : 1;
    const dx = ch === ':' ? x - 0.3 : x;
    for (const pl of strokeGlyph(ch, step)) lines.push(pl.map(([px, py]) => [px + dx, py]));
    x += w + tracking;
  }
  return { lines, width: x - tracking, height: 2 };
}

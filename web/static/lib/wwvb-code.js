// WWVB legacy amplitude-modulated time code (NIST Special Publication 432 /
// the WWVB time code format). One frame per UTC minute, one symbol per second:
//   0 -> carrier reduced for 0.2 s, 1 -> 0.5 s, marker (M) -> 0.8 s.
// The frame encodes the UTC time at the start of the minute (second 0).

export const ZERO = 0, ONE = 1, MARK = 2;

// Field layout: [second, field, weight]
export const LAYOUT = [
  [1, 'min', 40], [2, 'min', 20], [3, 'min', 10], [5, 'min', 8], [6, 'min', 4], [7, 'min', 2], [8, 'min', 1],
  [12, 'hour', 20], [13, 'hour', 10], [15, 'hour', 8], [16, 'hour', 4], [17, 'hour', 2], [18, 'hour', 1],
  [22, 'day', 200], [23, 'day', 100], [25, 'day', 80], [26, 'day', 40], [27, 'day', 20], [28, 'day', 10],
  [30, 'day', 8], [31, 'day', 4], [32, 'day', 2], [33, 'day', 1],
  [36, 'dut1sign', '+'], [37, 'dut1sign', '−'], [38, 'dut1sign', '+'],
  [40, 'dut1', 0.8], [41, 'dut1', 0.4], [42, 'dut1', 0.2], [43, 'dut1', 0.1],
  [45, 'year', 80], [46, 'year', 40], [47, 'year', 20], [48, 'year', 10],
  [50, 'year', 8], [51, 'year', 4], [52, 'year', 2], [53, 'year', 1],
  [55, 'lyi', 1], [56, 'lsw', 1], [57, 'dst', 2], [58, 'dst', 1],
];
export const MARKERS = [0, 9, 19, 29, 39, 49, 59];

export const FIELD_OF = new Array(60).fill(null);
export const WEIGHT_OF = new Array(60).fill(null);
for (const [s, f, w] of LAYOUT) { FIELD_OF[s] = f; WEIGHT_OF[s] = w; }
for (const s of MARKERS) FIELD_OF[s] = 'marker';

// DUT1 = UT1 − UTC, in tenths of a second. IERS publishes this; WWVB
// broadcasts it rounded to 0.1 s. This value is approximate.
export const DUT1_TENTHS = 1;

export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export function dayOfYear(d) {
  return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1;
}

// n-th Sunday (1-based) of month m (0-based) in year y, as a UTC day number.
function nthSunday(y, m, n) {
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  return Date.UTC(y, m, 1 + ((7 - first) % 7) + 7 * (n - 1)) / 86400000;
}

// Is US daylight time in effect at the end (24:00 UTC) of the given UTC day?
function dstAtEndOfDay(dayNumber) {
  const y = new Date(dayNumber * 86400000).getUTCFullYear();
  return dayNumber >= nthSunday(y, 2, 2) && dayNumber < nthSunday(y, 10, 1);
}

// Returns an array of 60 symbols for the minute containing `ms` plus the
// decoded values it carries.
export function frame(ms) {
  const d = new Date(Math.floor(ms / 60000) * 60000);
  const values = {
    min: d.getUTCMinutes(),
    hour: d.getUTCHours(),
    day: dayOfYear(d),
    year: d.getUTCFullYear() % 100,
    dut1: Math.abs(DUT1_TENTHS) / 10,
    dut1sign: DUT1_TENTHS >= 0 ? '+' : '−',
    lyi: isLeap(d.getUTCFullYear()) ? 1 : 0,
    lsw: 0,
  };
  const today = Math.floor(d.getTime() / 86400000);
  // bit 57 goes high at 00:00 UTC on the day DST starts; bit 58 follows 24 h later.
  values.dst = (dstAtEndOfDay(today) ? 2 : 0) + (dstAtEndOfDay(today - 1) ? 1 : 0);

  const bits = new Array(60).fill(ZERO);
  for (const s of MARKERS) bits[s] = MARK;
  const bcd = (field, v) => {
    let rest = v;
    for (const [s, f, w] of LAYOUT) {
      if (f !== field) continue;
      if (rest >= w - 1e-9) { bits[s] = ONE; rest -= w; }
    }
  };
  // Greedy subtraction yields correct BCD for weights like 80-40-20-10-8-4-2-1.
  bcd('min', values.min);
  bcd('hour', values.hour);
  bcd('day', values.day);
  bcd('year', values.year);
  if (DUT1_TENTHS >= 0) { bits[36] = ONE; bits[38] = ONE; } else { bits[37] = ONE; }
  bcd('dut1', values.dut1);
  bits[55] = values.lyi;
  bits[56] = values.lsw;
  bits[57] = values.dst & 2 ? ONE : ZERO;
  bits[58] = values.dst & 1 ? ONE : ZERO;
  return { bits, values, start: d.getTime() };
}

// Decode a (possibly partial) frame. received = number of seconds received.
export function decode(bits, received = 60) {
  const out = {};
  const sums = {};
  const complete = {};
  for (const [s, f, w] of LAYOUT) {
    if (typeof w !== 'number' || f === 'dut1sign') continue;
    sums[f] = (sums[f] || 0) + (bits[s] === ONE ? w : 0);
    complete[f] = s < received;
  }
  for (const f of Object.keys(sums)) if (complete[f]) out[f] = f === 'dut1' ? Math.round(sums[f] * 10) / 10 : sums[f];
  if (received > 38) out.dut1sign = bits[37] === ONE ? '−' : '+';
  return out;
}

export const PULSE = [0.2, 0.5, 0.8]; // reduced-power duration per symbol

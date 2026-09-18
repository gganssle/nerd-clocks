// Low-precision positional astronomy, good to a fraction of a degree for
// roughly 1900–2100. Angles are in degrees unless noted.
//
// Sources: Astronomical Almanac low-precision formulae (Sun, Moon), Meeus
// GMST, and JPL "Approximate Positions of the Planets" (Standish) elements.

const RAD = Math.PI / 180;
export const sind = (x) => Math.sin(x * RAD);
export const cosd = (x) => Math.cos(x * RAD);
export const norm360 = (x) => ((x % 360) + 360) % 360;

export const julianDate = (ms) => ms / 86400000 + 2440587.5;

// Greenwich mean sidereal time, degrees.
export function gmst(ms) {
  const jd = julianDate(ms);
  const T = (jd - 2451545.0) / 36525;
  return norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000);
}

// Local sidereal time in degrees for east-positive longitude.
export const lst = (ms, lon) => norm360(gmst(ms) + lon);

export function obliquity(ms) {
  return 23.439 - 0.0000004 * (julianDate(ms) - 2451545.0);
}

export function eclipticToEquatorial(lambda, beta, eps) {
  const ra = Math.atan2(sind(lambda) * cosd(eps) - (Math.tan(beta * RAD)) * sind(eps), cosd(lambda)) / RAD;
  const dec = Math.asin(sind(beta) * cosd(eps) + cosd(beta) * sind(eps) * sind(lambda)) / RAD;
  return { ra: norm360(ra), dec };
}

// Sun: apparent ecliptic longitude and equatorial coordinates.
export function sun(ms) {
  const n = julianDate(ms) - 2451545.0;
  const L = norm360(280.46 + 0.9856474 * n);
  const g = norm360(357.528 + 0.9856003 * n);
  const lambda = norm360(L + 1.915 * sind(g) + 0.02 * sind(2 * g));
  const dist = 1.00014 - 0.01671 * cosd(g) - 0.00014 * cosd(2 * g); // AU
  return { lambda, beta: 0, dist, ...eclipticToEquatorial(lambda, 0, obliquity(ms)) };
}

// Moon: geocentric ecliptic longitude/latitude (≈0.3° accuracy).
export function moon(ms) {
  const T = (julianDate(ms) - 2451545.0) / 36525;
  const lambda = norm360(
    218.32 + 481267.881 * T
    + 6.29 * sind(135.0 + 477198.87 * T)
    - 1.27 * sind(259.3 - 413335.36 * T)
    + 0.66 * sind(235.7 + 890534.22 * T)
    + 0.21 * sind(269.9 + 954397.74 * T)
    - 0.19 * sind(357.5 + 35999.05 * T)
    - 0.11 * sind(186.5 + 966404.03 * T),
  );
  const beta = 5.13 * sind(93.3 + 483202.02 * T)
    + 0.28 * sind(228.2 + 960400.89 * T)
    - 0.28 * sind(318.3 + 6003.15 * T)
    - 0.17 * sind(217.6 - 407332.21 * T);
  const s = sun(ms);
  // Elongation from the Sun and illuminated fraction.
  const cosPsi = cosd(beta) * cosd(lambda - s.lambda);
  const psi = Math.acos(cosPsi) / RAD;
  const illum = (1 - cosPsi) / 2;
  const age = norm360(lambda - s.lambda); // 0 new, 90 first quarter, 180 full
  return { lambda, beta, psi, illum, age, waxing: age < 180, ...eclipticToEquatorial(lambda, beta, obliquity(ms)) };
}

// JPL approximate Keplerian elements, J2000 frame, valid 1800–2050.
// [a, e, I, L, longPeri, longNode] and their rates per Julian century.
const ELEMENTS = {
  mercury: [[0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  venus: [[0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418]],
  earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
  mars: [[1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  jupiter: [[5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
};

export function solveKepler(M, e) {
  // M, E in radians.
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 12; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-10) break;
  }
  return E;
}

function heliocentric(name, T) {
  const [el, rate] = ELEMENTS[name];
  const [a, e, I, L, wbar, node] = el.map((v, i) => v + rate[i] * T);
  const w = wbar - node;
  const M = norm360(L - wbar) * RAD;
  const E = solveKepler(M, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = cosd(w), sw = sind(w), cn = cosd(node), sn = sind(node), ci = cosd(I), si = sind(I);
  return [
    (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
    (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
    sw * si * xp + cw * si * yp,
  ];
}

export const PLANETS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];

// Geocentric equatorial position of a planet.
export function planet(name, ms) {
  const T = (julianDate(ms) - 2451545.0) / 36525;
  const p = heliocentric(name, T);
  const e = heliocentric('earth', T);
  const x = p[0] - e[0], y = p[1] - e[1], z = p[2] - e[2];
  const lambda = norm360(Math.atan2(y, x) / RAD);
  const beta = Math.atan2(z, Math.hypot(x, y)) / RAD;
  return { lambda, beta, dist: Math.hypot(x, y, z), ...eclipticToEquatorial(lambda, beta, obliquity(ms)) };
}

// Equatorial (ra, dec) to horizontal for latitude lat and local sidereal time
// lstDeg. Azimuth is measured from north through east.
export function toHorizontal(ra, dec, lat, lstDeg) {
  const H = lstDeg - ra;
  const sinAlt = sind(lat) * sind(dec) + cosd(lat) * cosd(dec) * cosd(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) / RAD;
  const az = Math.atan2(-cosd(dec) * sind(H), sind(dec) * cosd(lat) - cosd(dec) * sind(lat) * cosd(H)) / RAD;
  return { alt, az: norm360(az) };
}

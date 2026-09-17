// Sky Dial: a live planisphere. The real sky above the observer, drawn as an
// azimuthal-equidistant all-sky map (zenith in the centre, horizon at the rim,
// east on the left because you are looking up). The whole sky turns once per
// sidereal day, so the stars themselves are the hour hand; two rotating rings
// read local civil time and local sidereal time off the meridian pointer.
import { TAU, timeParts, pad, rng, SANS, MONO, clamp, lerp } from '../lib/util.js';
import * as A from '../lib/astro.js';
import { STARS, LINES, STAR_BY_KEY } from '../lib/sky-dial-stars.js';

const STAR_TINT = {
  betelgeuse: [255, 170, 110], antares: [255, 150, 110], aldebaran: [255, 190, 130], arcturus: [255, 205, 150],
  pollux: [255, 215, 170], mirach: [255, 190, 140], dubhe: [255, 215, 170], kochab: [255, 200, 150], gacrux: [255, 170, 120],
  rigel: [185, 205, 255], spica: [180, 200, 255], vega: [200, 215, 255], sirius: [210, 225, 255], regulus: [195, 210, 255],
  achernar: [180, 200, 255], hadar: [185, 205, 255], acrux: [185, 205, 255], bellatrix: [190, 210, 255], deneb: [225, 230, 255],
  capella: [255, 240, 205], procyon: [255, 250, 230], canopus: [250, 250, 245], altair: [240, 245, 255],
};

const PLANET_STYLE = {
  mercury: { label: 'Mercury', color: [220, 210, 200], mag: 0.5 },
  venus: { label: 'Venus', color: [255, 250, 225], mag: -4 },
  mars: { label: 'Mars', color: [255, 140, 90], mag: 0.5 },
  jupiter: { label: 'Jupiter', color: [255, 235, 200], mag: -2.3 },
  saturn: { label: 'Saturn', color: [240, 220, 160], mag: 0.7 },
};

// Sky colours keyed by solar altitude: [alt, zenith rgb, horizon rgb]
const SKY = [
  [12, [22, 62, 118], [78, 128, 182]],
  [0, [24, 48, 96], [110, 110, 140]],
  [-6, [14, 22, 58], [70, 52, 78]],
  [-12, [7, 11, 32], [22, 24, 52]],
  [-18, [3, 5, 14], [9, 12, 28]],
];

function skyColors(sunAlt) {
  if (sunAlt >= SKY[0][0]) return [SKY[0][1], SKY[0][2]];
  for (let i = 0; i < SKY.length - 1; i++) {
    const [a0, z0, h0] = SKY[i], [a1, z1, h1] = SKY[i + 1];
    if (sunAlt <= a0 && sunAlt >= a1) {
      const t = (a0 - sunAlt) / (a0 - a1);
      return [z0.map((v, k) => lerp(v, z1[k], t)), h0.map((v, k) => lerp(v, h1[k], t))];
    }
  }
  return [SKY[SKY.length - 1][1], SKY[SKY.length - 1][2]];
}

function twilightName(alt) {
  if (alt > 0) return 'daylight';
  if (alt > -6) return 'civil twilight';
  if (alt > -12) return 'nautical twilight';
  if (alt > -18) return 'astronomical twilight';
  return 'night';
}

function phaseName(m) {
  const a = m.age;
  if (a < 7 || a > 353) return 'new moon';
  if (a < 83) return 'waxing crescent';
  if (a < 97) return 'first quarter';
  if (a < 173) return 'waxing gibbous';
  if (a < 187) return 'full moon';
  if (a < 263) return 'waning gibbous';
  if (a < 277) return 'last quarter';
  return 'waning crescent';
}

const rgb = (c, a = 1) => `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${a})`;

// Galactic (l, b) to equatorial (ra, dec), degrees.
function galToEq(l, b) {
  const aG = 192.859, dG = 27.128, lNCP = 122.932;
  const sinDec = A.sind(b) * A.sind(dG) + A.cosd(b) * A.cosd(dG) * A.cosd(lNCP - l);
  const dec = Math.asin(sinDec) * 180 / Math.PI;
  const ra = aG + Math.atan2(A.cosd(b) * A.sind(lNCP - l), A.sind(b) * A.cosd(dG) - A.cosd(b) * A.sind(dG) * A.cosd(lNCP - l)) * 180 / Math.PI;
  return { ra: A.norm360(ra), dec };
}

function buildMilkyWay() {
  const r = rng(20260916);
  const pts = [];
  const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(TAU * r());
  for (let i = 0; i < 2600; i++) {
    const l = r() * 360;
    // Brighter and thicker toward the galactic centre (l = 0).
    const centre = Math.cos((l * Math.PI) / 180) * 0.5 + 0.5;
    if (r() > 0.35 + 0.65 * centre) continue;
    const b = gauss() * (3 + 6 * centre);
    // The Great Rift: dark lane from Cygnus to Sagittarius.
    const rift = l < 60 || l > 340 ? Math.exp(-((b - 1.5) ** 2) / 3) * 0.7 : 0;
    const { ra, dec } = galToEq(l, b);
    pts.push({ ra, dec, a: (0.05 + 0.1 * centre) * (1 - rift), s: 0.6 + r() * 1.4 });
  }
  return pts;
}

export function create(host) {
  const surface = host.canvas();
  const { ctx } = surface;
  const milky = buildMilkyWay();
  const ecliptic = Array.from({ length: 121 }, (_, i) => i * 3);

  // A soft dot sprite for the Milky Way and glows.
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 64;
  {
    const s = sprite.getContext('2d');
    const g = s.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    s.fillStyle = g;
    s.fillRect(0, 0, 64, 64);
  }

  return {
    frame(now) {
      const W = surface.width, H = surface.height;
      const t = timeParts(now);
      const { lat, lon, source } = host.location;
      const lstDeg = A.lst(now, lon);
      const narrow = W / H < 1.1;

      const R = Math.min(W * (narrow ? 0.38 : 0.36), H * (narrow ? 0.3 : 0.365));
      const cx = W / 2;
      const cy = narrow ? Math.max(R * 1.35, H * 0.4) : H / 2;
      const rings = { az: R * 1.045, lst: R * 1.115, civil: R * 1.2 };

      const proj = (alt, az) => {
        const r = (R * (90 - alt)) / 90;
        return [cx - r * A.sind(az), cy - r * A.cosd(az)];
      };
      const horiz = (ra, dec) => A.toHorizontal(ra, dec, lat, lstDeg);

      const sun = A.sun(now);
      const sunH = horiz(sun.ra, sun.dec);
      const moon = A.moon(now);
      const moonH = horiz(moon.ra, moon.dec);
      moonH.alt -= 0.95 * A.cosd(moonH.alt); // topocentric parallax, roughly
      const [zenith, horizon] = skyColors(sunH.alt);
      const starVis = clamp(0.35 + (-sunH.alt) / 18 * 0.65, 0.35, 1);

      // ---- background -------------------------------------------------------
      ctx.fillStyle = '#020309';
      ctx.fillRect(0, 0, W, H);
      const halo = ctx.createRadialGradient(cx, cy, R, cx, cy, R * 1.6);
      halo.addColorStop(0, rgb(horizon, 0.18));
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, W, H);

      // ---- sky disc -----------------------------------------------------------
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.clip();
      const sky = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      sky.addColorStop(0, rgb(zenith));
      sky.addColorStop(0.75, rgb(zenith.map((v, i) => lerp(v, horizon[i], 0.35))));
      sky.addColorStop(1, rgb(horizon));
      ctx.fillStyle = sky;
      ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);

      // Glow on the Sun's side of the sky during twilight/day.
      if (sunH.alt > -18) {
        const [sx, sy] = proj(sunH.alt, sunH.az);
        const k = clamp((sunH.alt + 18) / 18, 0, 1);
        const warm = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 1.3);
        warm.addColorStop(0, `rgba(255, 150, 80, ${0.35 * k})`);
        warm.addColorStop(0.5, `rgba(200, 90, 90, ${0.1 * k})`);
        warm.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = warm;
        ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
      }

      // Alt/az grid
      ctx.strokeStyle = 'rgba(160, 190, 255, 0.07)';
      ctx.lineWidth = 1;
      for (const alt of [30, 60]) {
        ctx.beginPath();
        ctx.arc(cx, cy, (R * (90 - alt)) / 90, 0, TAU);
        ctx.stroke();
      }
      for (let az = 0; az < 360; az += 45) {
        const [x, y] = proj(0, az);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
      }

      // Milky Way
      ctx.globalCompositeOperation = 'lighter';
      const mwScale = R / 420;
      for (const p of milky) {
        const h = horiz(p.ra, p.dec);
        if (h.alt < -2) continue;
        const [x, y] = proj(h.alt, h.az);
        const s = 22 * p.s * mwScale;
        ctx.globalAlpha = p.a * starVis * starVis;
        ctx.drawImage(sprite, x - s / 2, y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // Ecliptic
      ctx.setLineDash([R * 0.012, R * 0.018]);
      ctx.strokeStyle = 'rgba(255, 205, 120, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      let pen = false;
      for (const lambda of ecliptic) {
        const eq = A.eclipticToEquatorial(lambda, 0, 23.44);
        const h = horiz(eq.ra, eq.dec);
        if (h.alt < -1) { pen = false; continue; }
        const [x, y] = proj(h.alt, h.az);
        pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        pen = true;
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Stars (project once)
      const pos = {};
      for (const s of STARS) {
        const h = horiz(s.ra, s.dec);
        pos[s.key] = { h, xy: proj(h.alt, h.az) };
      }

      // Constellation figures
      ctx.strokeStyle = `rgba(140, 180, 255, ${0.28 * starVis})`;
      ctx.lineWidth = Math.max(1, R * 0.0022);
      ctx.beginPath();
      for (const [a, b] of LINES) {
        const pa = pos[a], pb = pos[b];
        if (pa.h.alt < -3 && pb.h.alt < -3) continue;
        ctx.moveTo(pa.xy[0], pa.xy[1]);
        ctx.lineTo(pb.xy[0], pb.xy[1]);
      }
      ctx.stroke();

      const twinkleT = now / 1000;
      ctx.globalCompositeOperation = 'lighter';
      for (const s of STARS) {
        const { h, xy } = pos[s.key];
        if (h.alt < -1) continue;
        const tint = STAR_TINT[s.key] || [235, 240, 255];
        const base = Math.max(0.6, (4.6 - s.mag) * 0.85) * (R / 420);
        // Scintillation grows toward the horizon.
        const tw = 1 + 0.18 * (1 - h.alt / 90) ** 2 * Math.sin(twinkleT * (3 + (s.ra % 7)) + s.dec);
        const alpha = clamp((4.8 - s.mag) / 3.5, 0.25, 1) * starVis;
        if (s.mag < 2.2) {
          const g = base * 7 * tw;
          ctx.globalAlpha = alpha * 0.5;
          ctx.drawImage(sprite, xy[0] - g / 2, xy[1] - g / 2, g, g);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = rgb(tint, alpha);
        ctx.beginPath();
        ctx.arc(xy[0], xy[1], base * tw, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // Star labels
      const labelSize = Math.max(12, R * 0.032);
      ctx.font = `${labelSize}px ${SANS}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (const s of STARS) {
        if (!s.name || s.mag > 1.6) continue;
        const { h, xy } = pos[s.key];
        if (h.alt < 3) continue;
        ctx.fillStyle = `rgba(200, 215, 245, ${0.55 * starVis})`;
        ctx.fillText(s.name, xy[0] + labelSize * 0.7, xy[1] - labelSize * 0.1);
      }

      // Planets
      for (const name of A.PLANETS) {
        const p = A.planet(name, now);
        const h = horiz(p.ra, p.dec);
        if (h.alt < -1) continue;
        const st = PLANET_STYLE[name];
        const [x, y] = proj(h.alt, h.az);
        const r = Math.max(1.8, (2.2 - st.mag * 0.5) * (R / 420));
        ctx.globalCompositeOperation = 'lighter';
        const g = r * 9;
        ctx.globalAlpha = 0.55;
        ctx.drawImage(sprite, x - g / 2, y - g / 2, g, g);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = rgb(st.color);
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.font = `600 ${labelSize}px ${SANS}`;
        ctx.fillStyle = rgb(st.color, 0.9);
        ctx.fillText(st.label, x + r + labelSize * 0.5, y + labelSize * 0.1);
      }

      // Sun
      const [sx, sy] = proj(sunH.alt, sunH.az);
      if (sunH.alt > -1) {
        const g = R * 0.22;
        ctx.globalCompositeOperation = 'lighter';
        const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, g);
        sg.addColorStop(0, 'rgba(255, 245, 210, 0.95)');
        sg.addColorStop(0.08, 'rgba(255, 220, 150, 0.7)');
        sg.addColorStop(1, 'rgba(255, 170, 80, 0)');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(sx, sy, g, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#fff8e0';
        ctx.beginPath(); ctx.arc(sx, sy, R * 0.022, 0, TAU); ctx.fill();
      }

      // Moon with the correct phase, lit limb pointing at the Sun.
      if (moonH.alt > -2) {
        const [mx, my] = proj(moonH.alt, moonH.az);
        const mr = R * 0.042;
        const toward = Math.atan2(sy - my, sx - mx);
        ctx.globalCompositeOperation = 'lighter';
        const g = mr * 8;
        ctx.globalAlpha = 0.25 + 0.4 * moon.illum;
        ctx.drawImage(sprite, mx - g / 2, my - g / 2, g, g);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(toward);
        ctx.fillStyle = 'rgba(40, 44, 60, 0.95)';
        ctx.beginPath(); ctx.arc(0, 0, mr, 0, TAU); ctx.fill();
        ctx.fillStyle = '#f4f0e2';
        const c = Math.cos((moon.psi * Math.PI) / 180); // +1 new, -1 full
        ctx.beginPath();
        // Lit half toward the Sun (+x), terminator is an ellipse of width mr*c.
        ctx.arc(0, 0, mr, -Math.PI / 2, Math.PI / 2, false);
        ctx.ellipse(0, 0, Math.abs(c) * mr, mr, 0, Math.PI / 2, -Math.PI / 2, c > 0);
        ctx.fill();
        ctx.restore();
        ctx.font = `${labelSize}px ${SANS}`;
        ctx.fillStyle = 'rgba(240, 235, 215, 0.8)';
        ctx.fillText('Moon', mx + mr + labelSize * 0.5, my + mr + labelSize * 0.2);
      }
      ctx.restore(); // unclip

      // ---- horizon & rings ------------------------------------------------------
      ctx.strokeStyle = 'rgba(200, 215, 255, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();

      // Azimuth ticks + cardinal points (fixed)
      ctx.lineWidth = 1;
      for (let az = 0; az < 360; az += 5) {
        const a = -Math.PI / 2 - (az * Math.PI) / 180; // az 0 at top, east to the left
        const long = az % 45 === 0;
        const r0 = R * 1.004, r1 = R * (long ? 1.03 : 1.015);
        ctx.strokeStyle = long ? 'rgba(220,230,255,0.6)' : 'rgba(220,230,255,0.22)';
        ctx.beginPath();
        ctx.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a));
        ctx.lineTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a));
        ctx.stroke();
      }

      // Rotating rings. A value whose hour angle is H sits at screen angle
      // theta = meridian - H (it has already crossed toward the west).
      const south = lat >= 0;
      const meridian = south ? Math.PI / 2 : -Math.PI / 2;
      const dirSign = south ? -1 : 1;
      const angleForHA = (Hdeg) => meridian + dirSign * (Hdeg * Math.PI) / 180;

      const drawRing = (radius, width, color, labelFor, valueToHA, label) => {
        ctx.strokeStyle = color(0.18);
        ctx.lineWidth = width;
        ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU); ctx.stroke();
        ctx.font = `${Math.max(9, R * 0.024)}px ${MONO}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < 96; i++) {
          const v = i / 4; // hours
          const a = angleForHA(valueToHA(v));
          const major = i % 4 === 0;
          const r0 = radius - width * (major ? 0.45 : 0.2), r1 = radius + width * (major ? 0.45 : 0.2);
          ctx.strokeStyle = color(major ? 0.7 : 0.3);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a));
          ctx.lineTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a));
          ctx.stroke();
          if (major && i % 8 === 0) {
            const rl = radius;
            ctx.save();
            ctx.translate(cx + rl * Math.cos(a), cy + rl * Math.sin(a));
            ctx.rotate(a + Math.PI / 2 + (Math.sin(a) > 0.05 ? Math.PI : 0));
            ctx.fillStyle = color(0.9);
            ctx.fillRect(-R * 0.03, -width * 0.32, R * 0.06, width * 0.64);
            ctx.fillStyle = '#05060c';
            ctx.fillText(labelFor(v), 0, 1);
            ctx.restore();
          }
        }
      };

      const civilNow = t.secOfDay / 3600;
      const lstHours = lstDeg / 15;
      const ringW = R * 0.05;
      drawRing(rings.lst, ringW, (a) => `rgba(150, 190, 255, ${a})`,
        (v) => `${v | 0}h`, (v) => (lstHours - v) * 15, 'SIDEREAL');
      drawRing(rings.civil, ringW, (a) => `rgba(255, 205, 140, ${a})`,
        (v) => pad(v), (v) => (civilNow - v) * 15, 'LOCAL TIME');

      // Sun transit (local solar noon) marker on the civil ring.
      {
        const Hsun = A.norm360(lstDeg - sun.ra + 180) - 180; // -180..180
        const noon = civilNow - Hsun / 15;
        const a = angleForHA((civilNow - noon) * 15);
        const rr = rings.civil + ringW * 0.85;
        ctx.fillStyle = 'rgba(255, 220, 150, 0.95)';
        ctx.beginPath(); ctx.arc(cx + rr * Math.cos(a), cy + rr * Math.sin(a), R * 0.009, 0, TAU); ctx.fill();
      }

      // Meridian pointer
      {
        const a = meridian;
        const r0 = R * 1.0, r1 = rings.civil + ringW * 1.3;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a));
        ctx.lineTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a));
        ctx.stroke();
        const tip = r1 + R * 0.01;
        const px = cx + tip * Math.cos(a), py = cy + tip * Math.sin(a);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + R * 0.025 * Math.cos(a + 2.6), py + R * 0.025 * Math.sin(a + 2.6));
        ctx.lineTo(px + R * 0.025 * Math.cos(a - 2.6), py + R * 0.025 * Math.sin(a - 2.6));
        ctx.closePath();
        ctx.fill();
      }

      // Seconds sweep: a thin arc just outside the civil ring.
      {
        const rr = rings.civil + ringW * 1.05;
        ctx.strokeStyle = 'rgba(255, 205, 140, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + TAU * t.minuteFrac);
        ctx.stroke();
      }

      // Cardinal letters inside the horizon rim
      ctx.font = `600 ${Math.max(11, R * 0.036)}px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const [az, l] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
        const [x, y] = proj(5.5, az);
        ctx.fillStyle = l === 'N' ? 'rgba(255, 140, 120, 0.9)' : 'rgba(220, 230, 255, 0.75)';
        ctx.fillText(l, x, y);
      }

      // ---- readouts ---------------------------------------------------------------
      const big = Math.min(W * 0.05, H * 0.07) * (narrow ? 1.4 : 1);
      const small = Math.max(12, big * 0.26);
      const pad0 = Math.max(20, Math.min(W, H) * 0.035);
      const lstH = Math.floor(lstHours), lstM = Math.floor((lstHours % 1) * 60), lstS = Math.floor((((lstHours % 1) * 60) % 1) * 60);

      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      // Landscape: time bottom-left, sky facts bottom-right. Portrait: one column under the dial.
      let y = narrow ? cy + R * 1.3 + big * 1.1 : H - pad0 - small * 2.9;
      ctx.font = `200 ${big}px ${SANS}`;
      ctx.fillStyle = 'rgba(255, 225, 185, 0.95)';
      ctx.fillText(`${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`, pad0, y);
      ctx.font = `${small}px ${MONO}`;
      ctx.fillStyle = 'rgba(160, 195, 255, 0.9)';
      ctx.fillText(`LST ${pad(lstH)}h ${pad(lstM)}m ${pad(lstS)}s`, pad0, y + small * 1.6);
      ctx.fillStyle = 'rgba(200, 205, 220, 0.55)';
      ctx.fillText('sidereal day = 23h 56m 04s', pad0, y + small * 3.0);

      const latS = `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`;
      const lonS = `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
      const lines = [
        [`${latS}  ${lonS}`, 'rgba(230, 235, 245, 0.85)'],
        [`location: ${source === 'default' ? 'Greenwich (default)' : source}`, 'rgba(200, 205, 220, 0.5)'],
        [`Sun ${sunH.alt >= 0 ? '+' : ''}${sunH.alt.toFixed(1)}° · ${twilightName(sunH.alt)}`, 'rgba(255, 215, 150, 0.85)'],
        [`Moon ${Math.round(moon.illum * 100)}% · ${phaseName(moon)}`, 'rgba(235, 230, 215, 0.8)'],
      ];
      ctx.textAlign = narrow ? 'left' : 'right';
      const lx = narrow ? pad0 : W - pad0;
      const ly = narrow ? y + small * 5 : H - pad0 - small * 1.55 * (lines.length - 1);
      lines.forEach(([txt, col], i) => {
        ctx.fillStyle = col;
        ctx.fillText(txt, lx, ly + i * small * 1.55);
      });
    },
  };
}

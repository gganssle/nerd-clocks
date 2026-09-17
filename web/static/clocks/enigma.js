// Enigma: a faithful Enigma I types the current time, one key press per second.
// Each minute starts a new message with a fresh message key derived from the
// date and minute, so every ciphertext is reproducible and decryptable.
import { TAU, timeParts, pad, rng, clamp, easeInOut, SANS, MONO } from '../lib/util.js';
import { Enigma, ALPHA } from '../lib/enigma-machine.js';

const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE',
  'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY'];

function minuteWords(m) {
  if (m === 0) return 'OCLOCK';
  if (m < 10) return `OHX${ONES[m]}`;
  if (m < 20) return ONES[m];
  return TENS[Math.floor(m / 10)] + (m % 10 ? `X${ONES[m % 10]}` : '');
}

// Plaintext for a minute, e.g. "TIMEXTENXFORTYXTWOXPMX" repeated to 60 letters.
function plaintextFor(h, m) {
  const unit = `TIMEX${ONES[h % 12 || 12]}X${minuteWords(m)}X${h < 12 ? 'AM' : 'PM'}X`;
  return unit.repeat(Math.ceil(60 / unit.length)).slice(0, 60);
}

const QWERTZ = ['QWERTZUIO', 'ASDFGHJK', 'PYXCVBNML'];

// Daily key sheet + per-minute message key, all deterministic.
function keyFor(date) {
  const day = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  const r = rng(Math.imul(day, 2654435761));
  const letter = () => ALPHA[Math.floor(r() * 26)];
  const rings = letter() + letter() + letter();
  const letters = [...ALPHA];
  for (let i = 25; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  const plugs = Array.from({ length: 10 }, (_, i) => letters[2 * i] + letters[2 * i + 1]).join(' ');
  const rm = rng(Math.imul(day * 1440 + date.getHours() * 60 + date.getMinutes(), 374761393) ^ 0x5bd1e995);
  const ml = () => ALPHA[Math.floor(rm() * 26)];
  const positions = ml() + ml() + ml();
  return { rings, plugs, positions };
}

function buildMinute(ms) {
  const d = new Date(ms);
  d.setSeconds(0, 0);
  const key = keyFor(d);
  const machine = new Enigma({ order: ['I', 'II', 'III'], ...key });
  const plain = plaintextFor(d.getHours(), d.getMinutes());
  const presses = [];
  let prevPos = [...machine.pos];
  for (const ch of plain) {
    const res = machine.press(ch);
    presses.push({ ...res, in: ch, from: prevPos, pos: [...machine.pos], maps: [0, 1, 2].map((i) => machine.rotorMap(i)) });
    prevPos = [...machine.pos];
  }
  return { id: d.getTime(), key, plain, cipher: presses.map((p) => p.out).join(''), presses };
}

export function create(host) {
  const surface = host.canvas();
  const { ctx } = surface;
  let minute = null;
  let texture = null;
  let texKey = '';

  function backdrop(W, H) {
    const k = `${W}x${H}`;
    if (texKey === k) return texture;
    texKey = k;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W / 2));
    c.height = Math.max(1, Math.round(H / 2));
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(c.width / 2, c.height * 0.45, 0, c.width / 2, c.height * 0.45, Math.max(c.width, c.height) * 0.75);
    grad.addColorStop(0, '#1d1712');
    grad.addColorStop(1, '#070504');
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    const img = g.getImageData(0, 0, c.width, c.height);
    const r = rng(7);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (r() - 0.5) * 10;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    texture = c;
    return c;
  }

  function brassPlate(x, y, w, h, r) {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#6b5430');
    g.addColorStop(0.5, '#3a2d18');
    g.addColorStop(1, '#1e170c');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
    ctx.strokeStyle = 'rgba(230, 190, 120, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawRotor(x, y, w, h, posFloat, label, stepping) {
    brassPlate(x - w * 0.18, y - h * 0.08, w * 1.36, h * 1.16, w * 0.12);
    // window
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, y, w, h, w * 0.08); ctx.clip();
    const drum = ctx.createLinearGradient(x, y, x, y + h);
    drum.addColorStop(0, '#15110b'); drum.addColorStop(0.5, '#efe3c6'); drum.addColorStop(1, '#15110b');
    ctx.fillStyle = drum;
    ctx.fillRect(x, y, w, h);
    const base = Math.floor(posFloat);
    const frac = posFloat - base;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let k = -2; k <= 2; k++) {
      const off = k - frac; // letters move up as the rotor advances
      const ang = off * 0.62;
      if (Math.abs(ang) > Math.PI / 2) continue;
      const cy = y + h / 2 + Math.sin(ang) * h * 0.62;
      const sc = Math.cos(ang);
      ctx.save();
      ctx.translate(x + w / 2, cy);
      ctx.scale(1, sc);
      ctx.font = `700 ${h * 0.42}px ${MONO}`;
      ctx.fillStyle = `rgba(30, 22, 12, ${0.25 + 0.75 * sc})`;
      ctx.fillText(ALPHA[((base + k) % 26 + 26) % 26], 0, 0);
      ctx.restore();
    }
    ctx.restore();
    ctx.strokeStyle = stepping ? 'rgba(255, 210, 120, 0.9)' : 'rgba(0,0,0,0.6)';
    ctx.lineWidth = stepping ? 2.5 : 2;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, w * 0.08); ctx.stroke();
    // thumbwheel ridges
    const tw = w * 0.14, tx = x + w + w * 0.26;
    ctx.fillStyle = '#17120c';
    ctx.fillRect(tx, y - h * 0.02, tw, h * 1.04);
    for (let i = 0; i < 14; i++) {
      const yy = y + ((i + (posFloat * 3) % 1) / 14) * h;
      ctx.fillStyle = 'rgba(200, 170, 110, 0.35)';
      ctx.fillRect(tx, yy, tw, Math.max(1, h * 0.012));
    }
    ctx.font = `600 ${Math.max(10, h * 0.12)}px ${MONO}`;
    ctx.fillStyle = 'rgba(230, 200, 140, 0.8)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(label, x + w / 2, y + h * 1.14);
  }

  return {
    frame(now) {
      const W = surface.width, H = surface.height;
      const t = timeParts(now);
      const minStart = now - (t.minuteFrac * 60000);
      if (!minute || Math.abs(minute.id - Math.floor(minStart / 1000) * 1000) > 999) minute = buildMinute(now);
      const s = t.s;
      const sf = t.secondFrac;
      const press = minute.presses[s];
      const portrait = H > W * 1.1;

      ctx.drawImage(backdrop(W, H), 0, 0, W, H);

      const unit = Math.min(W / 16, H / 9);
      const margin = Math.max(20, W * 0.04);

      // ---------------- rotors -----------------
      const rotorH = unit * (portrait ? 1.5 : 1.35);
      const rotorW = rotorH * 0.62;
      const rotorGap = rotorW * 2.1;
      const rotorsY = portrait ? H * 0.07 : H * 0.055;
      const rotorsX = W / 2 - rotorGap - rotorW / 2;
      const stepAnim = easeInOut(clamp(sf / 0.28, 0, 1));
      const names = ['I', 'II', 'III'];
      const roles = ['L', 'M', 'R'];
      for (let i = 0; i < 3; i++) {
        const from = press.from[i], to = press.pos[i];
        const delta = ((to - from) + 26) % 26;
        const p = from + delta * stepAnim;
        drawRotor(rotorsX + i * rotorGap, rotorsY, rotorW, rotorH, p, `${roles[i]} · ${names[i]}`, press.stepped[i] && sf < 0.6);
      }
      // key sheet
      ctx.textBaseline = 'top';
      ctx.font = `${Math.max(10, unit * 0.2)}px ${MONO}`;
      ctx.fillStyle = 'rgba(230, 200, 140, 0.55)';
      ctx.textAlign = portrait ? 'center' : 'left';
      const sheetX = portrait ? W / 2 : rotorsX + 2 * rotorGap + rotorW * 2.2;
      const sheetY = portrait ? rotorsY + rotorH * 1.55 : rotorsY + rotorH * 0.05;
      const lines = [
        'WALZENLAGE  I II III   UKW-B',
        `RINGSTELLUNG  ${minute.key.rings.split('').join(' ')}`,
        `STECKER  ${minute.key.plugs.split(' ').slice(0, 5).join(' ')}`,
        `         ${minute.key.plugs.split(' ').slice(5).join(' ')}`,
        `SPRUCHSCHLÜSSEL  ${minute.key.positions}`,
      ];
      if (portrait) {
        lines.forEach((l, i) => ctx.fillText(l, sheetX, sheetY + i * unit * 0.3));
      } else {
        const maxW = W - sheetX - margin;
        lines.forEach((l, i) => {
          let txt = l;
          while (ctx.measureText(txt).width > maxW && txt.length > 4) txt = txt.slice(0, -2);
          ctx.fillText(txt, sheetX, sheetY + i * unit * 0.3);
        });
      }

      // ---------------- wiring diagram -----------------
      const dTop = portrait ? H * 0.27 : H * 0.345;
      const dBot = portrait ? H * 0.58 : H * 0.655;
      const dLeft = margin + unit * 0.35, dRight = W - margin - unit * 1.1;
      const yOf = (i) => dTop + (i / 25) * (dBot - dTop);
      // Column x: keys, plug in/out, R in/out, M in/out, L in/out, UKW
      const gapU = (dRight - dLeft) / (5 + 4 * 1.25);
      const cols = [dLeft];
      for (let c = 0; c < 4; c++) {
        const start = dLeft + gapU * (1 + c * 2.25);
        cols.push(start, start + gapU * 1.25);
      }
      cols.push(dRight);
      const compNames = ['KEYS / LAMPS', 'STECKERBRETT', 'WALZE III (R)', 'WALZE II (M)', 'WALZE I (L)', 'UKW-B'];

      // component bodies
      for (let c = 0; c < 4; c++) {
        const x0 = cols[1 + c * 2], x1 = cols[2 + c * 2];
        const g = ctx.createLinearGradient(x0, 0, x1, 0);
        g.addColorStop(0, 'rgba(60, 45, 25, 0.35)');
        g.addColorStop(0.5, 'rgba(90, 70, 40, 0.18)');
        g.addColorStop(1, 'rgba(60, 45, 25, 0.35)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(x0 - unit * 0.12, dTop - unit * 0.22, x1 - x0 + unit * 0.24, dBot - dTop + unit * 0.44, unit * 0.1);
        ctx.fill();
      }
      ctx.font = `600 ${Math.max(9, unit * 0.17)}px ${MONO}`;
      ctx.fillStyle = 'rgba(230, 200, 140, 0.65)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(compNames[0], cols[0], dTop - unit * 0.3);
      for (let c = 0; c < 4; c++) ctx.fillText(compNames[c + 1], (cols[1 + c * 2] + cols[2 + c * 2]) / 2, dTop - unit * 0.3);
      ctx.fillText(compNames[5], cols[9], dTop - unit * 0.3);

      // internal wiring (faint)
      const plugMap = [...Array(26).keys()];
      for (const pair of minute.key.plugs.split(' ')) {
        const a = pair.charCodeAt(0) - 65, b = pair.charCodeAt(1) - 65;
        plugMap[a] = b; plugMap[b] = a;
      }
      const maps = [plugMap, press.maps[2], press.maps[1], press.maps[0]];
      ctx.lineWidth = 1;
      for (let c = 0; c < 4; c++) {
        const x0 = cols[1 + c * 2], x1 = cols[2 + c * 2];
        ctx.strokeStyle = 'rgba(210, 170, 100, 0.13)';
        ctx.beginPath();
        for (let i = 0; i < 26; i++) {
          const j = maps[c][i];
          ctx.moveTo(x0, yOf(i));
          ctx.bezierCurveTo((x0 + x1) / 2, yOf(i), (x0 + x1) / 2, yOf(j), x1, yOf(j));
        }
        ctx.stroke();
      }
      // reflector body and arcs
      const reflBulge = (i, j) => cols[9] + gapU * (0.12 + 0.55 * Math.abs(j - i) / 25);
      {
        const g = ctx.createLinearGradient(cols[9] - gapU * 0.2, 0, cols[9] + gapU * 0.8, 0);
        g.addColorStop(0, 'rgba(60, 45, 25, 0.4)');
        g.addColorStop(1, 'rgba(60, 45, 25, 0.05)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(cols[9] - gapU * 0.2, dTop - unit * 0.22, gapU * 0.9, dBot - dTop + unit * 0.44, unit * 0.1);
        ctx.fill();
      }
      const refl = 'YRUHQSLDPXNGOKMIEBFZCWVJAT';
      ctx.strokeStyle = 'rgba(210, 170, 100, 0.16)';
      ctx.beginPath();
      for (let i = 0; i < 26; i++) {
        const j = refl.charCodeAt(i) - 65;
        if (j < i) continue;
        const bx = reflBulge(i, j);
        ctx.moveTo(cols[9], yOf(i));
        ctx.bezierCurveTo(bx, yOf(i), bx, yOf(j), cols[9], yOf(j));
      }
      ctx.stroke();
      // straight inter-component connections + contacts
      ctx.fillStyle = 'rgba(220, 185, 120, 0.4)';
      const cr = Math.max(1.2, unit * 0.025);
      for (let i = 0; i < 26; i++) {
        const y = yOf(i);
        for (const x of cols) { ctx.beginPath(); ctx.arc(x, y, cr, 0, TAU); ctx.fill(); }
      }
      ctx.font = `${Math.max(9, Math.min((dBot - dTop) / 30, unit * 0.2))}px ${MONO}`;
      ctx.textBaseline = 'middle';
      for (let i = 0; i < 26; i++) {
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(230, 200, 140, 0.45)';
        ctx.fillText(ALPHA[i], cols[0] - unit * 0.14, yOf(i));
      }

      // lit signal path
      const P = press.path;
      const pts = [
        [cols[0], P[0]], [cols[1], P[0]], [cols[2], P[1]], [cols[3], P[1]], [cols[4], P[2]], [cols[5], P[2]],
        [cols[6], P[3]], [cols[7], P[3]], [cols[8], P[4]], [cols[9], P[4]],
        [cols[9], P[5]], [cols[8], P[5]], [cols[7], P[6]], [cols[6], P[6]], [cols[5], P[7]], [cols[4], P[7]],
        [cols[3], P[8]], [cols[2], P[8]], [cols[1], P[9]], [cols[0], P[9]],
      ].map(([x, i]) => [x, yOf(i)]);
      const travel = clamp(sf / 0.3, 0, 1) * (pts.length - 1);
      const fade = sf < 0.9 ? 1 : 0.35 + 0.65 * (1 - (sf - 0.9) / 0.1);
      const segs = [];
      for (let i = 0; i < pts.length - 1; i++) {
        if (travel <= i) break;
        const u = Math.min(1, travel - i);
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        segs.push({ i, a: [ax, ay], b: [ax + (bx - ax) * u, ay + (by - ay) * u], curved: i % 2 === 1 || i === 9 });
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const pass of [{ w: unit * 0.16, a: 0.08 }, { w: unit * 0.07, a: 0.22 }, { w: Math.max(1.5, unit * 0.025), a: 0.95 }]) {
        for (const sg of segs) {
          const ret = sg.i >= 9;
          ctx.strokeStyle = ret ? `rgba(255, 110, 70, ${pass.a * fade})` : `rgba(255, 200, 90, ${pass.a * fade})`;
          ctx.lineWidth = pass.w;
          ctx.beginPath();
          ctx.moveTo(sg.a[0], sg.a[1]);
          if (sg.i === 9) {
            const bx = reflBulge(P[4], P[5]);
            ctx.bezierCurveTo(bx, sg.a[1], bx, sg.b[1], sg.b[0], sg.b[1]);
          } else if (sg.curved) {
            const mx = (sg.a[0] + sg.b[0]) / 2;
            ctx.bezierCurveTo(mx, sg.a[1], mx, sg.b[1], sg.b[0], sg.b[1]);
          } else {
            ctx.lineTo(sg.b[0], sg.b[1]);
          }
          ctx.stroke();
        }
      }
      if (segs.length) {
        const head = segs[segs.length - 1].b;
        const g = ctx.createRadialGradient(head[0], head[1], 0, head[0], head[1], unit * 0.35);
        g.addColorStop(0, `rgba(255, 240, 200, ${0.9 * fade})`);
        g.addColorStop(1, 'rgba(255, 180, 80, 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(head[0], head[1], unit * 0.35, 0, TAU); ctx.fill();
      }
      ctx.restore();
      // key and lamp letters on the path
      ctx.font = `700 ${Math.max(10, (dBot - dTop) / 26)}px ${MONO}`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(255, 210, 120, ${fade})`;
      ctx.fillText(ALPHA[P[0]], cols[0] - unit * 0.14, yOf(P[0]));
      if (travel >= pts.length - 1) {
        ctx.fillStyle = `rgba(255, 130, 90, ${fade})`;
        ctx.fillText(ALPHA[P[9]], cols[0] - unit * 0.14, yOf(P[9]));
      }

      // ---------------- tapes -----------------
      const tapesTop = portrait ? H * 0.62 : H * 0.685;
      const perRow = W < 1300 ? 30 : 60;
      const tapeW = W - margin * 2;
      const cellW = tapeW / perRow;
      const rowH = Math.min(cellW * 1.35, unit * 0.42);
      const tapes = [
        { label: 'KLARTEXT', text: minute.plain, color: '#2a2217' },
        { label: 'GEHEIMTEXT', text: minute.cipher, color: '#5a1a10' },
      ];
      let ty = tapesTop;
      ctx.textBaseline = 'middle';
      for (const tape of tapes) {
        ctx.font = `600 ${Math.max(9, unit * 0.16)}px ${MONO}`;
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(230, 200, 140, 0.6)';
        ctx.fillText(tape.label, margin, ty - rowH * 0.25);
        ty += rowH * 0.1;
        const rows = 60 / perRow;
        for (let r = 0; r < rows; r++) {
          const y = ty + r * (rowH * 1.08);
          const paper = ctx.createLinearGradient(0, y, 0, y + rowH);
          paper.addColorStop(0, '#e9dcbc'); paper.addColorStop(1, '#cdbb92');
          ctx.fillStyle = paper;
          ctx.fillRect(margin, y, tapeW, rowH);
          for (let c = 0; c < perRow; c++) {
            const k = r * perRow + c;
            const x = margin + c * cellW;
            if (k % 5 === 0) {
              ctx.fillStyle = 'rgba(80, 60, 30, 0.35)';
              ctx.fillRect(x, y, 1, rowH);
            }
            if (k === s) {
              ctx.fillStyle = 'rgba(255, 190, 80, 0.45)';
              ctx.fillRect(x, y, cellW, rowH);
            }
            if (k <= s) {
              const typed = k < s || tape.label === 'KLARTEXT' || sf > 0.3;
              if (!typed) continue;
              ctx.font = `700 ${rowH * 0.62}px ${MONO}`;
              ctx.textAlign = 'center';
              ctx.fillStyle = tape.color;
              ctx.fillText(tape.text[k], x + cellW / 2, y + rowH * 0.55);
            }
          }
        }
        ty += rows * rowH * 1.08 + rowH * 0.7;
      }

      // ---------------- lampboard -----------------
      const lbTop = ty + rowH * 0.1;
      const lbBot = portrait ? H - unit * 1.6 : H - Math.max(16, H * 0.025);
      const lampR = Math.min((lbBot - lbTop) / 6.8, (W - margin * 2) / 9 / 2.6);
      const lit = travel >= pts.length - 1 ? ALPHA[P[9]] : null;
      QWERTZ.forEach((row, ri) => {
        const cy = lbTop + lampR * 1.15 + ri * lampR * 2.3;
        const rowW = row.length * lampR * 2.6;
        const x0 = W / 2 - rowW / 2 + lampR * 1.3;
        [...row].forEach((ch, ci) => {
          const cx = x0 + ci * lampR * 2.6;
          const on = ch === lit;
          const flick = on ? fade * (0.92 + 0.08 * Math.sin(now / 37 + ci)) : 0;
          ctx.fillStyle = '#0d0b09';
          ctx.beginPath(); ctx.arc(cx, cy, lampR * 1.08, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(200, 170, 110, 0.35)';
          ctx.lineWidth = Math.max(1, lampR * 0.06);
          ctx.stroke();
          if (flick > 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, lampR * 4);
            g.addColorStop(0, `rgba(255, 220, 130, ${0.55 * flick})`);
            g.addColorStop(1, 'rgba(255, 160, 40, 0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(cx, cy, lampR * 4, 0, TAU); ctx.fill();
            ctx.restore();
          }
          const face = ctx.createRadialGradient(cx - lampR * 0.3, cy - lampR * 0.3, 0, cx, cy, lampR);
          if (flick > 0) {
            face.addColorStop(0, `rgba(255, 250, 220, ${flick})`);
            face.addColorStop(1, `rgba(255, 180, 60, ${flick})`);
          } else {
            face.addColorStop(0, '#3a342a');
            face.addColorStop(1, '#1a1612');
          }
          ctx.fillStyle = face;
          ctx.beginPath(); ctx.arc(cx, cy, lampR * 0.92, 0, TAU); ctx.fill();
          ctx.font = `700 ${lampR * 0.95}px ${SANS}`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = flick > 0 ? 'rgba(60, 30, 0, 0.9)' : 'rgba(200, 185, 150, 0.55)';
          ctx.fillText(ch, cx, cy + lampR * 0.04);
        });
      });

      // readout: decrypted time, bottom right
      ctx.font = `300 ${unit * 0.42}px ${SANS}`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(240, 220, 180, 0.85)';
      const rx = W - margin, ry = H - Math.max(16, H * 0.03);
      if (!portrait) {
        ctx.fillText(`${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`, rx, ry);
        ctx.font = `${Math.max(9, unit * 0.15)}px ${MONO}`;
        ctx.fillStyle = 'rgba(230, 200, 140, 0.5)';
        ctx.fillText(`${ALPHA[P[0]]} → ${ALPHA[P[9]]}   ·   key ${s + 1} of 60`, rx, ry - unit * 0.55);
      } else {
        ctx.textAlign = 'center';
        ctx.font = `300 ${unit * 0.8}px ${SANS}`;
        ctx.fillText(`${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`, W / 2, H - unit * 0.45);
      }
    },
  };
}

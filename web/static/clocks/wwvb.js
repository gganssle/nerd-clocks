// WWVB: a receiver for NIST's 60 kHz time signal. Shows the real amplitude-
// modulated time code for the current UTC minute arriving bit by bit and
// being decoded into a date and time.
import { TAU, timeParts, pad, clamp, SANS, MONO } from '../lib/util.js';
import { frame, decode, FIELD_OF, WEIGHT_OF, PULSE, MARK, ONE } from '../lib/wwvb-code.js';

const LOW = Math.pow(10, -17 / 20); // 17 dB power reduction, as amplitude

const FIELD_COLOR = {
  marker: '#ff5a4e',
  min: '#58e1ff',
  hour: '#7dff9b',
  day: '#ffbf3c',
  dut1sign: '#c792ff',
  dut1: '#c792ff',
  year: '#ff7ac6',
  lyi: '#9fb4d8',
  lsw: '#9fb4d8',
  dst: '#9fb4d8',
  null: '#3a3f35',
};
const FIELD_LABEL = {
  marker: 'MARK', min: 'MIN', hour: 'HOUR', day: 'DAY', dut1sign: 'DUT1±', dut1: 'DUT1', year: 'YEAR', lyi: 'LEAP YR', lsw: 'LEAP SEC', dst: 'DST',
};

export function create(host) {
  const surface = host.canvas();
  const { ctx } = surface;
  const cache = new Map();
  const frameAt = (ms) => {
    const k = Math.floor(ms / 60000);
    let f = cache.get(k);
    if (!f) {
      f = frame(ms);
      cache.set(k, f);
      if (cache.size > 4) cache.delete(cache.keys().next().value);
    }
    return f;
  };
  // carrier amplitude at an instant
  const amplitude = (ms) => {
    const f = frameAt(ms);
    const into = (ms - f.start) / 1000;
    const s = Math.floor(into);
    return into - s < PULSE[f.bits[s]] ? LOW : 1;
  };

  return {
    frame(now) {
      const W = surface.width, H = surface.height;
      const portrait = H > W * 1.1;
      const unit = Math.min(W / 16, H / 9);
      const m = Math.max(20, W * 0.035);
      const f = frameAt(now);
      const into = (now - f.start) / 1000;
      const sec = Math.floor(into);
      const sFrac = into - sec;

      // background
      ctx.fillStyle = '#070805';
      ctx.fillRect(0, 0, W, H);
      const bg = ctx.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.35, Math.max(W, H) * 0.8);
      bg.addColorStop(0, 'rgba(70, 60, 20, 0.22)');
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // ---------------- scope -----------------
      const sx = m, sw = W - 2 * m;
      const sy = portrait ? H * 0.09 : H * 0.11;
      const sh = portrait ? H * 0.19 : H * 0.22;
      ctx.fillStyle = '#030703';
      ctx.strokeStyle = 'rgba(141, 255, 182, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, 14); ctx.fill(); ctx.stroke();
      // graticule
      ctx.save();
      ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, 14); ctx.clip();
      const secondsShown = portrait ? 7 : 12;
      const xNow = sx + sw * 0.86;
      const pps = (sw * 0.86) / secondsShown;
      ctx.strokeStyle = 'rgba(141, 255, 182, 0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 8; i++) { const y = sy + (i / 8) * sh; ctx.moveTo(sx, y); ctx.lineTo(sx + sw, y); }
      const firstSec = Math.floor(now / 1000 - secondsShown - 1);
      for (let k = firstSec; k <= now / 1000 + 3; k++) {
        const x = xNow - (now / 1000 - k) * pps;
        ctx.moveTo(x, sy); ctx.lineTo(x, sy + sh);
      }
      ctx.stroke();

      const mid = sy + sh * 0.52;
      const amp = sh * 0.36;
      // carrier (not to scale: 60 kHz drawn as 22 cycles per second)
      ctx.beginPath();
      const step = 1.25;
      for (let x = sx; x <= xNow; x += step) {
        const tms = now - ((xNow - x) / pps) * 1000;
        const a = amplitude(tms) * amp;
        const y = mid + a * Math.sin((tms / 1000) * 22 * TAU);
        if (x === sx) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(141, 255, 182, 0.10)';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(141, 255, 182, 0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // envelope
      for (const sign of [1, -1]) {
        ctx.beginPath();
        for (let x = sx; x <= xNow; x += 2) {
          const tms = now - ((xNow - x) / pps) * 1000;
          const y = mid - sign * amplitude(tms) * amp;
          if (x === sx) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(190, 255, 210, 0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      // symbol labels under each pulse
      ctx.font = `600 ${Math.max(10, sh * 0.075)}px ${MONO}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      for (let k = firstSec; k <= Math.floor(now / 1000); k++) {
        const x = xNow - (now / 1000 - k) * pps;
        if (x < sx + 4) continue;
        const fr = frameAt(k * 1000);
        const s = Math.round((k * 1000 - fr.start) / 1000);
        const b = fr.bits[s];
        const done = now / 1000 - k > PULSE[b];
        const label = done ? (b === MARK ? 'M' : String(b)) : '·';
        ctx.fillStyle = FIELD_COLOR[FIELD_OF[s]];
        ctx.fillText(label, x + 5, sy + sh * 0.06);
        ctx.fillStyle = 'rgba(141, 255, 182, 0.35)';
        ctx.fillText(`:${pad(s)}`, x + 5, sy + sh * 0.86);
      }
      // now cursor
      ctx.strokeStyle = 'rgba(255, 182, 64, 0.8)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(xNow, sy); ctx.lineTo(xNow, sy + sh); ctx.stroke();
      ctx.setLineDash([]);
      const beam = ctx.createRadialGradient(xNow, mid, 0, xNow, mid, amp * 0.6);
      beam.addColorStop(0, 'rgba(210, 255, 225, 0.5)');
      beam.addColorStop(1, 'rgba(141, 255, 182, 0)');
      ctx.fillStyle = beam;
      ctx.beginPath(); ctx.arc(xNow, mid, amp * 0.6, 0, TAU); ctx.fill();
      ctx.restore();

      // scope caption
      ctx.font = `${Math.max(10, unit * 0.17)}px ${MONO}`;
      ctx.fillStyle = 'rgba(141, 255, 182, 0.55)';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('CARRIER ENVELOPE · 60 kHz · −17 dB AT EACH SECOND', sx + 2, sy - 8);
      ctx.textAlign = 'right';
      const lowNow = sFrac < PULSE[f.bits[sec]];
      ctx.fillStyle = lowNow ? 'rgba(255, 182, 64, 0.9)' : 'rgba(141, 255, 182, 0.55)';
      if (!portrait) ctx.fillText(`FORT COLLINS, CO  40°41′N 105°03′W  ·  ${lowNow ? 'LOW POWER' : 'FULL POWER'}`, sx + sw - 2, sy - 8);

      // ---------------- frame grid -----------------
      const gy = sy + sh + (portrait ? H * 0.05 : H * 0.07);
      const labelW = portrait ? 0 : unit * 1.15;
      const gx = m + labelW;
      const gw = W - m - gx;
      const cellW = gw / 10;
      const cellH = portrait ? Math.min(cellW * 1.25, H * 0.05) : Math.min(cellW * 0.62, H * 0.052);
      ctx.font = `${Math.max(10, unit * 0.17)}px ${MONO}`;
      ctx.fillStyle = 'rgba(255, 182, 64, 0.6)';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText(`TIME CODE FRAME · ${new Date(f.start).toISOString().slice(0, 16).replace('T', ' ')} UTC · SECOND ${pad(sec)}`, m + 2, gy - 8);
      const rowNames = ['MIN', 'HOUR', 'DAY', 'DAY/DUT1', 'DUT1/YR', 'YR/FLAGS'];
      for (let row = 0; row < 6; row++) {
        const y = gy + row * cellH * 1.12;
        if (!portrait) {
          ctx.font = `600 ${Math.max(9, cellH * 0.22)}px ${MONO}`;
          ctx.fillStyle = 'rgba(255, 182, 64, 0.45)';
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(rowNames[row], m, y + cellH / 2);
        }
        for (let col = 0; col < 10; col++) {
          const s = row * 10 + col;
          const x = gx + col * cellW;
          const field = FIELD_OF[s];
          const color = FIELD_COLOR[field];
          const b = f.bits[s];
          const received = s < sec || (s === sec && sFrac >= PULSE[b]);
          const current = s === sec;
          const pad_ = cellW * 0.05;
          const cx = x + pad_, cw = cellW - pad_ * 2;
          ctx.fillStyle = current ? 'rgba(255, 182, 64, 0.16)' : received ? 'rgba(255, 255, 255, 0.035)' : 'rgba(255,255,255,0.012)';
          ctx.beginPath(); ctx.roundRect(cx, y, cw, cellH, 6); ctx.fill();
          ctx.strokeStyle = current ? 'rgba(255, 182, 64, 0.9)' : field ? `${color}${received ? '66' : '22'}` : 'rgba(255,255,255,0.05)';
          ctx.lineWidth = current ? 2 : 1;
          ctx.stroke();
          // pulse shape: low segment width proportional to reduced-power time
          const px0 = cx + cw * 0.08, pw = cw * 0.84;
          const ph = cellH * 0.22, py = y + cellH * 0.66;
          const shown = current ? clamp(sFrac, 0, 1) : received ? 1 : 0;
          if (shown > 0) {
            const lowEnd = Math.min(shown, PULSE[b]);
            ctx.strokeStyle = received || current ? color : 'rgba(255,255,255,0.1)';
            ctx.lineWidth = Math.max(1.5, cellH * 0.04);
            ctx.beginPath();
            ctx.moveTo(px0, py);
            ctx.lineTo(px0 + pw * lowEnd, py);
            if (shown > PULSE[b]) {
              ctx.lineTo(px0 + pw * PULSE[b], py - ph);
              ctx.lineTo(px0 + pw * shown, py - ph);
            }
            ctx.stroke();
          }
          // value
          ctx.textAlign = 'right'; ctx.textBaseline = 'top';
          ctx.font = `700 ${cellH * 0.34}px ${MONO}`;
          if (received) {
            ctx.fillStyle = b === ONE || b === MARK ? color : 'rgba(220, 220, 200, 0.45)';
            ctx.fillText(b === MARK ? 'M' : String(b), cx + cw - cw * 0.07, y + cellH * 0.08);
          }
          // label
          ctx.textAlign = 'left';
          ctx.font = `${Math.max(8, cellH * 0.2)}px ${MONO}`;
          ctx.fillStyle = field ? `${color}${received ? 'cc' : '55'}` : 'rgba(255,255,255,0.15)';
          const w = WEIGHT_OF[s];
          const lab = field === 'marker' ? (s === 0 ? 'FRM' : `P${(s + 1) / 10 % 6}`) : field ? (typeof w === 'number' && !['lyi', 'lsw'].includes(field) ? (field === 'dst' ? `DST${w === 2 ? 2 : 1}` : `${w}`) : FIELD_LABEL[field] === 'DUT1±' ? `${w}` : field.toUpperCase()) : '—';
          ctx.fillText(portrait ? String(s) : `${pad(s)} ${lab}`, cx + cw * 0.07, y + cellH * 0.1);
        }
      }

      // ---------------- decoded -----------------
      const dec = decode(f.bits, sFrac >= PULSE[f.bits[sec]] ? sec + 1 : sec);
      const dy = gy + 6 * cellH * 1.12 + (portrait ? H * 0.03 : H * 0.035);
      const boxes = [
        ['min', 'MINUTE', dec.min, (v) => pad(v)],
        ['hour', 'HOUR', dec.hour, (v) => pad(v)],
        ['day', 'DAY OF YEAR', dec.day, (v) => String(v).padStart(3, '0')],
        ['dut1', 'UT1 − UTC', dec.dut1, (v) => `${dec.dut1sign ?? '+'}${v.toFixed(1)}s`],
        ['year', 'YEAR', dec.year, (v) => `20${pad(v)}`],
        ['dst', 'LY · LS · DST', dec.dst, (v) => `${dec.lyi}·${dec.lsw}·${(v >> 1) & 1}${v & 1}`],
      ];
      const cols = portrait ? 3 : 6;
      const bw = ((portrait ? W - 2 * m : W * 0.62 - m)) / cols;
      const bh = portrait ? H * 0.065 : Math.min(H * 0.1, H - m * 0.6 - dy);
      boxes.forEach(([key, name, v, fmt], i) => {
        const x = m + (i % cols) * bw;
        const y = dy + Math.floor(i / cols) * (bh + 10);
        const known = v !== undefined;
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.beginPath(); ctx.roundRect(x + 4, y, bw - 8, bh, 8); ctx.fill();
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.font = `${Math.max(9, bh * 0.15)}px ${MONO}`;
        ctx.fillStyle = `${FIELD_COLOR[key]}aa`;
        ctx.fillText(name, x + 14, y + bh * 0.1);
        ctx.font = `600 ${bh * 0.42}px ${MONO}`;
        ctx.fillStyle = known ? FIELD_COLOR[key] : 'rgba(255,255,255,0.12)';
        ctx.fillText(known ? fmt(v) : '– –', x + 14, y + bh * 0.36);
      });

      // big assembled time
      const rows = Math.ceil(boxes.length / cols);
      const ty = dy + rows * (bh + 10) + (portrait ? H * 0.07 : H * 0.02);
      const locked = dec.year !== undefined;
      const t = timeParts(now);
      const utc = new Date(now);
      ctx.textBaseline = 'alphabetic';
      if (portrait) {
        ctx.textAlign = 'center';
        ctx.font = `200 ${W * 0.16}px ${SANS}`;
        ctx.fillStyle = 'rgba(255, 230, 190, 0.95)';
        ctx.fillText(`${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`, W / 2, Math.min(ty + W * 0.1, H - W * 0.11));
        ctx.font = `${Math.max(12, W * 0.028)}px ${MONO}`;
        ctx.fillStyle = locked ? 'rgba(141, 255, 182, 0.8)' : 'rgba(255, 182, 64, 0.7)';
        ctx.fillText(locked ? `LOCKED · ${utc.toISOString().slice(11, 19)} UTC` : `SYNCING · FRAME ${sec}/60`, W / 2, Math.min(ty + W * 0.17, H - W * 0.04));
      } else {
        ctx.textAlign = 'right';
        const big = Math.min(H * 0.12, W * 0.07);
        ctx.font = `200 ${big}px ${SANS}`;
        ctx.fillStyle = 'rgba(255, 230, 190, 0.95)';
        ctx.fillText(`${pad(t.h)}:${pad(t.m)}:${pad(t.s)}`, W - m, H - m * 0.7);
        ctx.font = `${Math.max(10, unit * 0.17)}px ${MONO}`;
        ctx.fillStyle = 'rgba(255, 182, 64, 0.55)';
        ctx.fillText('LOCAL TIME', W - m, H - m * 0.7 - big * 0.95);
        // status on the frame header line
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.font = `${Math.max(10, unit * 0.17)}px ${MONO}`;
        ctx.fillStyle = locked ? 'rgba(141, 255, 182, 0.85)' : 'rgba(255, 182, 64, 0.75)';
        ctx.fillText(`${locked ? '● LOCKED' : `○ SYNCING ${sec}/60`}   ${utc.toISOString().slice(0, 10)} ${utc.toISOString().slice(11, 19)} UTC`, W - m, gy - 8);
      }
    },
  };
}

// A faithful Enigma I simulation: rotors I-III, reflector UKW-B, ring settings,
// plugboard and the double-stepping middle rotor. Also records the full signal
// path so the clock can draw it.

const A = 65;
export const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const idx = (ch) => ch.charCodeAt(0) - A;

export const ROTORS = {
  I: { wiring: 'EKMFLGDQVZNTOWYHXUSPAIBRCJ', notch: 'Q' },
  II: { wiring: 'AJDKSIRUXBLHWTMCQGZNPYFVOE', notch: 'E' },
  III: { wiring: 'BDFHJLCPRTXVZNYEIWGAKMUSQO', notch: 'V' },
};
export const UKW_B = 'YRUHQSLDPXNGOKMIEBFZCWVJAT';

function makeRotor(name, ring = 0) {
  const r = ROTORS[name];
  const fwd = [...r.wiring].map(idx);
  const back = new Array(26);
  fwd.forEach((o, i) => { back[o] = i; });
  return { name, fwd, back, notch: idx(r.notch), ring };
}

// Machine frame contact -> machine frame contact through a rotor at `pos`.
function through(rotor, pos, x, table) {
  const shift = pos - rotor.ring;
  return (((table[(((x + shift) % 26) + 26) % 26] - shift) % 26) + 26) % 26;
}

export class Enigma {
  // order: left-to-right rotor names; rings, positions: 3 letters; plugs: 'AB CD ...'
  constructor({ order = ['I', 'II', 'III'], rings = 'AAA', positions = 'AAA', plugs = '' } = {}) {
    this.rotors = order.map((n, i) => makeRotor(n, idx(rings[i])));
    this.pos = [...positions].map(idx);
    this.plug = [...Array(26).keys()];
    for (const pair of plugs.trim().split(/\s+/).filter(Boolean)) {
      const a = idx(pair[0]), b = idx(pair[1]);
      this.plug[a] = b; this.plug[b] = a;
    }
    this.reflector = [...UKW_B].map(idx);
  }

  // Wire map of rotor i at its current position in machine frame (for drawing).
  rotorMap(i) {
    const r = this.rotors[i];
    return [...Array(26).keys()].map((x) => through(r, this.pos[i], x, r.fwd));
  }

  step() {
    const [L, M, R] = this.rotors;
    const stepped = [false, false, true];
    if (this.pos[1] === M.notch) {
      // double step: middle rotor at its notch turns itself and the left rotor
      stepped[0] = stepped[1] = true;
    } else if (this.pos[2] === R.notch) {
      stepped[1] = true;
    }
    for (let i = 0; i < 3; i++) if (stepped[i]) this.pos[i] = (this.pos[i] + 1) % 26;
    return stepped;
  }

  // Press a key: steps, then encrypts. Returns { out, path, stepped } where
  // path lists contacts: [key, plug, R, M, L, reflector, L, M, R, plug(lamp)].
  press(ch) {
    const stepped = this.step();
    const [L, M, R] = this.rotors;
    const path = [];
    let x = idx(ch);
    path.push(x);
    x = this.plug[x]; path.push(x);
    x = through(R, this.pos[2], x, R.fwd); path.push(x);
    x = through(M, this.pos[1], x, M.fwd); path.push(x);
    x = through(L, this.pos[0], x, L.fwd); path.push(x);
    x = this.reflector[x]; path.push(x);
    x = through(L, this.pos[0], x, L.back); path.push(x);
    x = through(M, this.pos[1], x, M.back); path.push(x);
    x = through(R, this.pos[2], x, R.back); path.push(x);
    x = this.plug[x]; path.push(x);
    return { out: ALPHA[x], path, stepped };
  }

  get window() { return this.pos.map((p) => ALPHA[p]).join(''); }
}

export function encrypt(opts, text) {
  const m = new Enigma(opts);
  return [...text].map((c) => m.press(c).out).join('');
}

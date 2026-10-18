// Scene library. Each scene builds a target layout for every particle, sets its
// rendering mode, and defines a camera path that plays out across its share of the song.

import { V, TAU, prng, sphere, gauss, clamp01, mix, fbm2, fbm3 } from './math.js';
import { coastH, volcH, forestH, distToPath, lavaAt, VOLC_TOP, PATH, BLOCKS, CITY } from './terrain.js';
import { oceanMesh, volcanoMesh, forestMesh, downtownMesh } from './meshes.js';

const PHI = (1 + Math.sqrt(5)) / 2;

// Fills a fixed-size particle buffer one point at a time. Unused slots get size 0 and stay hidden.
export class Builder {
  constructor(N) {
    this.N = N;
    this.n = 0;
    this.pos = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
    this.size = new Float32Array(N);
    this.kind = new Float32Array(N);
    this.anchor = new Float32Array(N * 3);
    this.axis = new Float32Array(N * 3);
  }
  // Sets the orbit axis for the particle just added.
  setAxis(x, y, z) {
    const k = (this.n - 1) * 3;
    this.axis[k] = x; this.axis[k + 1] = y; this.axis[k + 2] = z;
  }
  get full() { return this.n >= this.N; }
  add(x, y, z, r, g, b, s, kind = 0, ax = 0, ay = 0, az = 0) {
    if (this.n >= this.N) return false;
    const i = this.n++, k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.col[k] = r; this.col[k + 1] = g; this.col[k + 2] = b;
    this.size[i] = s; this.kind[i] = kind;
    this.anchor[k] = ax; this.anchor[k + 1] = ay; this.anchor[k + 2] = az;
    return true;
  }
  finish() {
    for (let i = this.n; i < this.N; i++) this.size[i] = 0;
    return { pos: this.pos, col: this.col, size: this.size, kind: this.kind, anchor: this.anchor, axis: this.axis };
  }
}

// ---------- camera helpers ----------
const orbit = (t, tgt, r, el, sp, ph = 0, fov = 50) => {
  const yaw = ph + t * sp;
  return {
    eye: [tgt[0] + r * Math.cos(el) * Math.sin(yaw), tgt[1] + r * Math.sin(el), tgt[2] + r * Math.cos(el) * Math.cos(yaw)],
    target: tgt,
    fov,
  };
};

// ---------- cosmic acts ----------
function buildAtoms(b, R) {
  const A = 10, centers = [], bases = [];
  for (let a = 0; a < A; a++) {
    const d = sphere(R), r = 0.15 + R() * 1.0;
    centers.push([d[0] * r, d[1] * r * 0.65, d[2] * r]);
    const sh = [];
    for (let s = 0; s < 3; s++) {
      const n = V.norm(sphere(R));
      const e1 = V.norm(V.cross(n, sphere(R)));
      sh.push([e1, V.cross(n, e1), n]);
    }
    bases.push(sh);
  }
  const RAD = [0.09, 0.16, 0.24];
  const TINT = [[0.45, 0.9, 1], [0.7, 0.6, 1], [1, 0.5, 0.85]];
  while (!b.full) {
    const i = b.n, a = i % A, c = centers[a];
    if (R() < 0.05) {
      const d = sphere(R), q = 0.03 * Math.cbrt(R());
      b.add(c[0] + d[0] * q, c[1] + d[1] * q, c[2] + d[2] * q, 1, 0.62, 0.32, 1.8);
      continue;
    }
    const s = (R() * 3) | 0, rr = RAD[s] * (0.92 + R() * 0.16), th = R() * TAU;
    const [e1, e2, nrm] = bases[a][s], cs = Math.cos(th) * rr, sn = Math.sin(th) * rr, T = TINT[s];
    b.add(c[0] + e1[0] * cs + e2[0] * sn, c[1] + e1[1] * cs + e2[1] * sn, c[2] + e1[2] * cs + e2[2] * sn, T[0], T[1], T[2], 0.9 + R() * 0.7, 9, c[0], c[1], c[2]);
    b.setAxis(nrm[0], nrm[1], nrm[2]);
  }
  return b;
}

function edgesOf(V3) {
  const dist = (a, c) => Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]);
  let mn = Infinity;
  for (let i = 0; i < V3.length; i++) for (let j = i + 1; j < V3.length; j++) mn = Math.min(mn, dist(V3[i], V3[j]));
  const E = [];
  for (let i = 0; i < V3.length; i++) for (let j = i + 1; j < V3.length; j++) if (Math.abs(dist(V3[i], V3[j]) - mn) < 1e-6) E.push([i, j]);
  return E;
}

function buildShapes(b, R) {
  const ico = [], dod = [], cube = [];
  for (const a of [-1, 1]) for (const c of [-PHI, PHI]) ico.push([0, a, c], [a, c, 0], [c, 0, a]);
  for (const a of [-1, 1]) for (const c of [-1, 1]) for (const d of [-1, 1]) cube.push([a, c, d]);
  for (const a of [-1, 1]) for (const c of [-1, 1]) dod.push([0, a / PHI, c * PHI], [a / PHI, c * PHI, 0], [c * PHI, 0, a / PHI]);
  dod.push(...cube);
  const prep = (Vs, Rr) => { const Vn = Vs.map((v) => V.norm(v).map((x) => x * Rr)); return { Vs: Vn, E: edgesOf(Vn) }; };
  const A = prep(ico, 1.0), B = prep(dod, 0.72);
  while (!b.full) {
    const isA = R() < 0.6, S = isA ? A : B;
    if (R() < 0.06) {
      const v = S.Vs[(R() * S.Vs.length) | 0];
      b.add(v[0], v[1], v[2], 1, 0.95, 0.85, 2.2);
      continue;
    }
    const e = S.E[(R() * S.E.length) | 0], p = V.lerp(S.Vs[e[0]], S.Vs[e[1]], R());
    const C = isA ? [1, 0.82, 0.42] : [0.45, 0.9, 1];
    b.add(p[0] + gauss(R) * 0.006, p[1] + gauss(R) * 0.006, p[2] + gauss(R) * 0.006, C[0], C[1], C[2], 0.9 + R() * 0.5);
  }
  return b;
}

function buildGalaxies(b, R) {
  while (!b.full) {
    if (R() < 0.1) {
      const d = sphere(R), q = 0.17 * Math.pow(R(), 0.6);
      b.add(d[0] * q, d[1] * q * 0.45, d[2] * q, 1, 0.86, 0.6, 1.5);
      continue;
    }
    const arm = b.n % 3, r = 0.1 + 1.15 * Math.pow(R(), 0.85);
    const th = arm * TAU / 3 + 3.0 * Math.log(1 + r * 5) + gauss(R) * 0.2 * (0.25 + r);
    const t = Math.min(1, r / 1.2);
    let c = [0.95 - 0.45 * t, 0.9 - 0.25 * t, 1.0];
    if (R() < 0.07) c = [1, 0.42, 0.62];
    b.add(r * Math.cos(th), gauss(R) * 0.018 * (1.1 - r * 0.6), r * Math.sin(th), c[0], c[1], c[2], 0.8 + R() * 0.9);
  }
  return b;
}

function buildUniverse(b, R) {
  const H = 56, hc = [];
  for (let h = 0; h < H; h++) {
    const d = sphere(R), r = 1.15 * Math.cbrt(R());
    hc.push([d[0] * r, d[1] * r, d[2] * r]);
  }
  const nb = hc.map((p, i) => hc
    .map((q, j) => ({ j, d: V.len(V.sub(p, q)) }))
    .filter((o) => o.j !== i)
    .sort((x, y) => x.d - y.d)
    .slice(0, 3)
    .map((o) => o.j));
  while (!b.full) {
    if (R() < 0.6) {
      const h = (R() * H) | 0, n = nb[h][(R() * 3) | 0], p = V.lerp(hc[h], hc[n], R());
      const c = R() < 0.4 ? [0.45, 0.7, 1] : [0.66, 0.5, 1];
      b.add(p[0] + gauss(R) * 0.01, p[1] + gauss(R) * 0.01, p[2] + gauss(R) * 0.01, c[0], c[1], c[2], 0.6 + R() * 0.4);
    } else {
      const h = (R() * H) | 0, d = sphere(R), q = Math.abs(gauss(R)) * 0.1, p = hc[h];
      b.add(p[0] + d[0] * q, p[1] + d[1] * q, p[2] + d[2] * q, 1, 0.93, 0.98, 1.0 + R() * 0.9);
    }
  }
  return b;
}

// ---------- life ----------
function buildLife(b, R) {
  const cells = [];
  for (let c = 0; c < 9; c++) {
    const d = sphere(R), rr = 0.2 + R() * 1.1;
    cells.push({ c: [d[0] * rr, d[1] * rr * 0.7, d[2] * rr], r: 0.22 + R() * 0.2 });
  }
  while (!b.full) {
    if (R() < 0.12) {
      const d = sphere(R), q = 1.9 * Math.cbrt(R());
      b.add(d[0] * q, d[1] * q * 0.8, d[2] * q, 0.45, 0.85, 1.0, 0.6, 10);
      continue;
    }
    const cell = cells[(R() * cells.length) | 0];
    const d = sphere(R), roll = R();
    if (roll < 0.7) {
      const rad = cell.r * (0.85 + 0.3 * fbm3(d[0] * 2.2 + 7, d[1] * 2.2, d[2] * 2.2 + 3, 5, 3));
      b.add(cell.c[0] + d[0] * rad, cell.c[1] + d[1] * rad, cell.c[2] + d[2] * rad, 0.3, 0.9, 0.85, 1.1, 10);
    } else if (roll < 0.8) {
      b.add(cell.c[0] + d[0] * cell.r * 0.35, cell.c[1] + d[1] * cell.r * 0.35, cell.c[2] + d[2] * cell.r * 0.35, 1, 0.45, 0.8, 1.8, 10);
    } else {
      const q = cell.r * 0.7 * Math.cbrt(R());
      b.add(cell.c[0] + d[0] * q, cell.c[1] + d[1] * q, cell.c[2] + d[2] * q, 0.92, 0.85, 0.35, 1.0, 10);
    }
  }
  return b;
}

// ---------- creatures ----------
function buildCreatures(b, R) {
  const J = 7, jel = [];
  for (let j = 0; j < J; j++) {
    jel.push({ c: [(R() * 2 - 1) * 3.6, 0.8 + R() * 2.0, (R() * 2 - 1) * 3.6], r: 0.55 + R() * 0.45, L: 1.6 + R() * 1.2 });
  }
  while (!b.full) {
    if (R() < 0.14) {
      const d = sphere(R), q = 8 * Math.cbrt(R());
      b.add(d[0] * q, d[1] * q * 0.6 + 1.0, d[2] * q, 0.25, 0.6, 0.7, 0.55, 10);
      continue;
    }
    const jf = jel[(R() * J) | 0], c = jf.c;
    if (R() < 0.45) {
      const d = sphere(R);
      if (d[1] < 0) d[1] = -d[1];
      const q = jf.r * (0.9 + 0.1 * R()), hue = R();
      const col = [mix(0.5, 0.95, hue), mix(0.85, 0.55, hue), mix(1.0, 1.0, hue)];
      b.add(c[0] + d[0] * q, c[1] + d[1] * q * 0.7, c[2] + d[2] * q, col[0], col[1], col[2], 1.5, 6, c[0], c[1], c[2]);
    } else {
      const phi = R() * TAU, s = R(), rr = jf.r * 0.92;
      b.add(c[0] + Math.cos(phi) * rr, c[1] - s * jf.L, c[2] + Math.sin(phi) * rr, 0.8, 0.95, 1.0, 0.95, 7, c[0], c[1], c[2]);
    }
  }
  return b;
}

// ---------- Earth ----------
function buildEarth(b, R) {
  const S = 1.5;
  while (!b.full) {
    const roll = R(), d = sphere(R);
    if (roll < 0.18) {
      const r = 1.62 + R() * 0.06;
      b.add(d[0] * r, d[1] * r, d[2] * r, 1, 1, 1, 1.6, 10);
    } else if (roll < 0.26) {
      const r = 1.78 + R() * 0.08;
      b.add(d[0] * r, d[1] * r, d[2] * r, 0.35, 0.65, 1.0, 1.2);
    } else {
      const n = fbm3(d[0] * 1.8 + 4.1, d[1] * 1.8, d[2] * 1.8 + 7.3, 41, 5);
      let c;
      if (Math.abs(d[1]) > 0.86) c = [0.92, 0.96, 1.0];
      else if (n < 0.5) {
        const depth = clamp01((0.5 - n) * 2.2);
        c = [mix(0.12, 0.02, depth), mix(0.46, 0.14, depth), mix(0.75, 0.4, depth)];
      } else if (n < 0.56) c = [0.22, 0.55, 0.26];
      else if (n < 0.62) c = [0.75, 0.62, 0.35];
      else c = [0.42, 0.4, 0.38];
      b.add(d[0] * S, d[1] * S, d[2] * S, c[0], c[1], c[2], 1.2);
    }
  }
  return b;
}

// ---------- living layers for the ground scenes ----------
// Geometry carries the world. These particles add the living layer on top of it.
function fillTo(b, frac, fn) {
  const end = b.n + Math.floor(b.N * frac);
  while (b.n < end && !b.full) fn();
}

function buildOceanMotes(b, R) {
  fillTo(b, 0.2, () => {
    let x, z, h;
    do { x = (R() * 2 - 1) * 14; z = (R() * 2 - 1) * 14; h = coastH(x, z); } while (h > 0);
    b.add(x, 0.03, z, 0.75, 0.93, 1.0, 0.9, 3);
  });
  fillTo(b, 0.36, () => {
    b.add((R() * 2 - 1) * 12, 0.4 + R() * 3.6, (R() * 2 - 1) * 12, 0.6, 0.75, 0.9, 0.6, 10);
  });
  return b;
}

function buildVolcanoMotes(b, R) {
  fillTo(b, 0.14, () => {
    const a = R() * Math.PI * 2, r = 1.3 * Math.sqrt(R()), x = Math.cos(a) * r, z = Math.sin(a) * r;
    b.add(x, volcH(x, z) + 0.1, z, 1, 0.62, 0.22, 1.5, 5);
  });
  fillTo(b, 0.2, () => {
    b.add((R() * 2 - 1) * 12, 3 + R() * 5, (R() * 2 - 1) * 12, 0.5, 0.5, 0.52, 0.5, 10);
  });
  return b;
}

function buildForestMotes(b, R) {
  fillTo(b, 0.2, () => {
    const t = R(), x = mix(PATH[0][0], PATH[1][0], t) + (R() * 2 - 1) * 3, z = mix(PATH[0][1], PATH[1][1], t) + (R() * 2 - 1) * 3;
    b.add(x, 0.3 + R() * 3.5, z, 1, 0.95, 0.6, 0.6, 10);
  });
  fillTo(b, 0.25, () => {
    const x = (R() * 2 - 1) * 13, z = (R() * 2 - 1) * 13;
    b.add(x, forestH(x, z) + 0.4 + R() * 1.2, z, 0.8, 1, 0.45, 1.5, 10);
  });
  return b;
}

function buildDowntownMotes(b, R) {
  const EXT = CITY.EXT;
  fillTo(b, 0.16, () => {
    const alongX = R() < 0.5;
    const lane = (Math.floor(R() * 9) - 4) * CITY.CELL + (R() < 0.5 ? -0.7 : 0.7);
    const along = (R() * 2 - 1) * EXT;
    const head = R() < 0.5;
    const c = head ? [1, 0.92, 0.7] : [1, 0.2, 0.2];
    if (alongX) b.add(along, 0.35, lane, c[0], c[1], c[2], 1.4, 1);
    else b.add(lane, 0.35, along, c[0], c[1], c[2], 1.4, 2);
  });
  fillTo(b, 0.2, () => {
    const d = sphere(R);
    if (d[1] < 0.05) d[1] = -d[1];
    const p = V.scale(d, 110);
    b.add(p[0], p[1], p[2], 0.6, 0.66, 0.85, 0.9);
  });
  return b;
}

// ---------- scene table ----------
export const SCENES = [
  {
    name: 'Atoms', short: 'Atoms', line: 'Matter begins as motion around empty space.', weight: 1,
    px: 4.5, fog: 0, kick: true, spin: 0, wave: 0, wrap: 0, solid: false, build: buildAtoms,
    cam: (t, u) => orbit(t, [0, 0, 0], 4.2 - 0.3 * u, 0.25, 0.05, 0, 50),
  },
  {
    name: 'Shapes', short: 'Shapes', line: 'Symmetry is the first pattern that lasts.', weight: 1,
    px: 4.5, fog: 0, kick: true, spin: 0, wave: 0, wrap: 0, solid: false, build: buildShapes,
    cam: (t) => orbit(t, [0, 0, 0], 4.0, 0.3, 0.07, 0, 50),
  },
  {
    name: 'Galaxies', short: 'Galaxies', line: 'Gravity draws loose dust into spirals.', weight: 1,
    px: 4.0, fog: 0, kick: true, spin: 1, wave: 0, wrap: 0, solid: false, build: buildGalaxies,
    cam: (t, u) => orbit(t, [0, 0, 0], 4.4 - 0.4 * u, 0.55, 0.04, 0, 50),
  },
  {
    name: 'The Universe', short: 'Universe', line: 'Galaxies gather along filaments that span the void.', weight: 1,
    px: 4.0, fog: 0, kick: true, spin: 0.35, wave: 0, wrap: 0, solid: false, build: buildUniverse,
    cam: (t) => orbit(t, [0, 0, 0], 4.8, 0.2, 0.035, 0, 50),
  },
  {
    name: 'Life', short: 'Life', line: 'In warm water, chemistry learns to copy itself.', weight: 1,
    px: 3.4, fog: 0, kick: true, spin: 0, wave: 0, wrap: 0, solid: false, build: buildLife,
    cam: (t, u) => orbit(t, [0, 0, 0], 2.8 - 0.4 * u, 0.15, 0.06, 0, 50),
  },
  {
    name: 'Creatures', short: 'Creatures', line: 'Jellyfish pulse through a sea that was here first.', weight: 1,
    px: 3.8, fog: 0.05, kick: true, spin: 0, wave: 0, wrap: 0, solid: false, build: buildCreatures,
    cam: (t, u) => orbit(t, [0, 0.6, 0], 9.0 - 1.0 * u, 0.12, 0.05, 0.5, 55),
  },
  {
    name: 'Earth', short: 'Earth', line: 'One small planet, and the place everything happens.', weight: 1,
    px: 3.4, fog: 0, kick: true, spin: 0, wave: 0, wrap: 0, solid: false, build: buildEarth,
    cam: (t, u) => orbit(t, [0, 0, 0], 5.6 - 3.0 * u, 0.1 + 0.2 * u, 0.02, 0, 42),
  },
  {
    name: 'Ocean', short: 'Ocean', line: 'Most of this world is water, and it keeps its own time.', weight: 1,
    px: 5.0, fog: 0.012, kick: false, spin: 0, wave: 0.09, wrap: 0, solid: false,
    build: buildOceanMotes, mesh: oceanMesh,
    cam: (t, u) => {
      const bob = 0.03 * Math.sin(t * 1.3);
      const eye = [mix(-10, -1, u), mix(1.6, 1.3, u) + bob, mix(-8, 5, u)];
      const tgt = [mix(4, 10, u), mix(1.2, 2.0, u) + bob, mix(-2, 2, u)];
      return { eye, target: tgt, fov: 58 };
    },
  },
  {
    name: 'Volcano', short: 'Volcano', line: 'Heat from below builds the land, one eruption at a time.', weight: 1,
    px: 5.0, fog: 0.015, kick: false, spin: 0, wave: 0, wrap: 0, solid: false,
    build: buildVolcanoMotes, mesh: volcanoMesh,
    cam: (t, u) => orbit(t, [0, 4.5, 0], mix(17, 11, u), mix(0.25, 0.42, u), 0.03, 0.8, 55),
  },
  {
    name: 'Forest', short: 'Forest', line: 'Roots, bark, and wind. The land turns green.', weight: 1,
    px: 5.0, fog: 0.03, kick: false, spin: 0, wave: 0, wrap: 0, solid: false,
    build: buildForestMotes, mesh: forestMesh,
    cam: (t, u) => {
      const eye = [mix(PATH[0][0], PATH[1][0], u), 1.8, mix(PATH[0][1], PATH[1][1], u)];
      const dir = V.norm([PATH[1][0] - PATH[0][0], 0, PATH[1][1] - PATH[0][1]]);
      const look = 0.9 * Math.sin(u * 6.28 + t * 0.1);
      const tgt = [eye[0] + dir[0] * 6 + look, 1.5 + 0.1 * Math.sin(t * 0.7), eye[2] + dir[2] * 6];
      return { eye, target: tgt, fov: 60 };
    },
  },
  {
    name: 'Downtown', short: 'Downtown', line: 'Towers, traffic, and lit windows, all the way up.', weight: 1.6,
    px: 5.0, fog: 0.02, kick: false, spin: 0, wave: 0, wrap: 72, solid: false,
    build: buildDowntownMotes, mesh: downtownMesh,
    cam: (t, u) => {
      const walk = clamp01(u / 0.72);
      const eye = [0.25 * Math.sin(t * 0.35), 1.7, mix(24, -22, walk)];
      const fwd = [eye[0], 1.5, eye[2] - 10];
      const up = [0, 15, -26];
      const p = clamp01((u - 0.72) / 0.28);
      const tgt = V.lerp(fwd, up, p * p * (3 - 2 * p));
      return { eye, target: tgt, fov: 62 };
    },
  },
];

export const STARTS = [];
let acc = 0;
for (const s of SCENES) { STARTS.push(acc); acc += s.weight; }
export const TOTAL = acc;

export function sceneAt(progress) {
  let k = 0;
  for (let i = 0; i < SCENES.length; i++) if (progress >= STARTS[i]) k = i;
  return k;
}

export function buildScene(k, N) {
  const b = new Builder(N);
  SCENES[k].build(b, prng(1000 + k * 7919));
  return b.finish();
}

// Triangle geometry for scenes that have a ground layer, or null.
export function buildMesh(k) {
  return SCENES[k].mesh ? SCENES[k].mesh() : null;
}

export function cameraFor(k, t, u) {
  return SCENES[k].cam(t, u);
}

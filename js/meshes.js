// Triangle geometry for the ground-level scenes: ocean, volcano, forest and downtown.
// Each builder returns chunks: { mode, count, pos, nrm, col, emi }.
// mode: 0 terrain, 1 city facades (lit windows), 2 water (waves and glints).

import { V, mix, clamp01, prng, fbm2, fbm3 } from './math.js';
import { coastH, volcH, forestH, distToPath, lavaAt, BLOCKS, CITY } from './terrain.js';
import { SMALL, grid } from './device.js';

class MB {
  constructor() { this.p = []; this.n = []; this.c = []; this.e = []; }
  v(p, n, c, e) {
    this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]);
    this.c.push(c[0], c[1], c[2]); this.e.push(e);
  }
  tri(a, b, c) { for (const q of [a, b, c]) this.v(q.p, q.n, q.c, q.e); }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  out(mode) {
    return {
      mode, count: this.e.length,
      pos: new Float32Array(this.p), nrm: new Float32Array(this.n),
      col: new Float32Array(this.c), emi: new Float32Array(this.e),
    };
  }
}

// Height grid over [-E, E]^2 with per-vertex normals from finite differences.
function heightfield(mb, E, n, hfn, colfn, emifn = () => 0) {
  const s = (2 * E) / n, m = n + 1, H = new Float32Array(m * m);
  const X = (i) => -E + i * s;
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) H[i * m + j] = hfn(X(i), X(j));
  const hAt = (i, j) => H[Math.min(n, Math.max(0, i)) * m + Math.min(n, Math.max(0, j))];
  const vtx = (i, j) => {
    const x = X(i), z = X(j), h = hAt(i, j);
    const dx = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * s), dz = (hAt(i, j + 1) - hAt(i, j - 1)) / (2 * s);
    return { p: [x, h, z], n: V.norm([-dx, 1, -dz]), c: colfn(x, h, z), e: emifn(x, z, h) };
  };
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    mb.quad(vtx(i, j), vtx(i + 1, j), vtx(i + 1, j + 1), vtx(i, j + 1));
  }
}

function box(mb, x0, x1, y0, y1, z0, z1, wall, roof) {
  const q = (a, b, c, d, n, col) => {
    const v = (p) => ({ p, n, c: col, e: 0 });
    mb.quad(v(a), v(b), v(c), v(d));
  };
  q([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], wall);
  q([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0], wall);
  q([x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1], [0, 0, 1], wall);
  q([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1], wall);
  q([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], roof);
}

export function oceanMesh() {
  const land = new MB();
  heightfield(land, 14, grid(170),
    (x, z) => Math.max(Math.min(coastH(x, z), 6), -2.2),
    (x, z, h) => {
      if (h > 0.02) {
        if (h < 0.45) return [0.86, 0.76, 0.52];
        if (h < 2.6) return [0.3, 0.5, 0.28];
        if (h < 4.2) return [0.45, 0.42, 0.4];
        return [0.92, 0.94, 0.98];
      }
      const d = clamp01(-h / 3);
      return [mix(0.05, 0.02, d), mix(0.14, 0.1, d), mix(0.22, 0.3, d)];
    });
  const water = new MB();
  heightfield(water, 14, grid(120), () => 0, (x, z) => {
    const d = clamp01(-coastH(x, z) / 3);
    return [mix(0.1, 0.01, d), mix(0.4, 0.07, d), mix(0.5, 0.18, d)];
  });
  return [land.out(0), water.out(2)];
}

export function volcanoMesh() {
  const mb = new MB();
  heightfield(mb, 16, grid(200), volcH, (x, z, h) => {
    const r = Math.hypot(x, z);
    if (h > 4) return [0.22, 0.19, 0.19];
    if (r < 3) return [0.3, 0.27, 0.27];
    if (fbm2(x * 0.3, z * 0.3, 23, 3) > 0.55 && r < 9) return [0.2, 0.4, 0.22];
    if (r < 8) return [0.22, 0.2, 0.18];
    return [0.18, 0.36, 0.2];
  }, (x, z) => lavaAt(x, z));
  return [mb.out(0)];
}

function trunk(mb, x, base, z, h) {
  const SIDES = 6, r = 0.09, col = [0.36, 0.24, 0.14];
  for (let k = 0; k < SIDES; k++) {
    const a0 = (k / SIDES) * Math.PI * 2, a1 = ((k + 1) / SIDES) * Math.PI * 2;
    const n0 = [Math.cos(a0), 0, Math.sin(a0)], n1 = [Math.cos(a1), 0, Math.sin(a1)];
    const p = (a, y) => [x + Math.cos(a) * r, base + y, z + Math.sin(a) * r];
    const v = (a, y, n) => ({ p: p(a, y), n, c: col, e: 0 });
    mb.quad(v(a0, 0, n0), v(a1, 0, n1), v(a1, h, n1), v(a0, h, n0));
  }
}

function canopy(mb, cx, cy, cz, rad, R, base) {
  const LAT = 10, LON = 14, g = R();
  const col = g < 0.07 ? [0.85, 0.45, 0.15] : [mix(0.12, 0.3, g), mix(0.4, 0.6, g), mix(0.16, 0.2, g)];
  const dirAt = (i, j) => {
    const th = (i / LAT) * Math.PI, ph = (j / LON) * Math.PI * 2;
    return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
  };
  const vtx = (i, j) => {
    const d = dirAt(i, j);
    const wob = 1 + 0.08 * (fbm2(cx * 0.7 + d[0] * 1.3, cz * 0.7 + d[2] * 1.3, 51, 2) - 0.5);
    const p = [cx + d[0] * rad * wob, cy + d[1] * rad * 0.85 * wob, cz + d[2] * rad * wob];
    return { p, n: d, c: col, e: 0 };
  };
  for (let i = 0; i < LAT; i++) for (let j = 0; j < LON; j++) {
    mb.quad(vtx(i, j), vtx(i + 1, j), vtx(i + 1, j + 1), vtx(i, j + 1));
  }
}

export function forestMesh() {
  const ground = new MB();
  heightfield(ground, 14, grid(150), forestH, (x, z) => {
    const n = fbm2(x * 0.5, z * 0.5, 33, 2);
    return [mix(0.18, 0.34, n), mix(0.34, 0.28, n), mix(0.14, 0.15, n)];
  });
  const trees = new MB();
  const R = prng(4242);
  let count = 0;
  const TREES = SMALL ? 260 : 420;
  while (count < TREES) {
    const x = (R() * 2 - 1) * 13, z = (R() * 2 - 1) * 13, dp = distToPath(x, z);
    if (dp < 1.8 || R() > 1 / (1 + (dp / 3) ** 2)) continue;
    count++;
    const base = forestH(x, z), trunkH = 1.4 + R() * 0.6, rad = 0.95 + R() * 0.45;
    trunk(trees, x, base, z, trunkH);
    canopy(trees, x, base + trunkH + 0.55, z, rad, R, base);
  }
  return [ground.out(0), trees.out(0)];
}

export function downtownMesh() {
  const ground = new MB();
  heightfield(ground, CITY.EXT, 2, () => 0, () => [0.07, 0.075, 0.09]);
  const towers = new MB();
  const H = CITY.HALF;
  for (const bl of BLOCKS) {
    box(towers, bl.cx - H, bl.cx + H, 0, bl.h, bl.cz - H, bl.cz + H, [0.1, 0.11, 0.15], [0.15, 0.15, 0.19]);
  }
  return [ground.out(0), towers.out(1)];
}

// Line segments as one chunk: two vertices per segment, drawn additively and without depth writes.
export function lineChunk(segs) {
  const n = segs.length * 2;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3), emi = new Float32Array(n);
  segs.forEach((s, i) => {
    for (let v = 0; v < 2; v++) {
      const o = i * 2 + v, q = v ? s.b : s.a;
      pos.set(q, o * 3);
      col.set(s.c, o * 3);
      emi[o] = s.e;
    }
  });
  return { mode: 9, count: n, pos, nrm, col, emi };
}

// A lit globe with continents, oceans and ice caps.
export function earthMesh() {
  const mb = new MB();
  const LAT = 90, LON = 150, Rr = 1.5;
  const vtx = (i, j) => {
    const th = (i / LAT) * Math.PI, ph = (j / LON) * Math.PI * 2;
    const d = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
    const n = fbm3(d[0] * 1.8 + 4.1, d[1] * 1.8, d[2] * 1.8 + 7.3, 41, 5);
    let c;
    if (Math.abs(d[1]) > 0.86) c = [0.92, 0.96, 1.0];
    else if (n < 0.5) {
      const depth = clamp01((0.5 - n) * 2.2);
      c = [mix(0.12, 0.02, depth), mix(0.46, 0.14, depth), mix(0.75, 0.4, depth)];
    } else if (n < 0.56) c = [0.22, 0.55, 0.26];
    else if (n < 0.62) c = [0.75, 0.62, 0.35];
    else c = [0.42, 0.4, 0.38];
    return { p: [d[0] * Rr, d[1] * Rr, d[2] * Rr], n: d, c, e: 0 };
  };
  for (let i = 0; i < LAT; i++) for (let j = 0; j < LON; j++) {
    mb.quad(vtx(i, j), vtx(i + 1, j), vtx(i + 1, j + 1), vtx(i, j + 1));
  }
  return [mb.out(0)];
}

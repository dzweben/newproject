// Small math toolkit: seeded randomness, value noise, vectors and camera matrices.

export const TAU = Math.PI * 2;

export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const mix = (a, b, t) => a + (b - a) * t;
const fade = (t) => t * t * (3 - 2 * t);

function h2(ix, iz, s) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function h3(ix, iy, iz, s) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 2246822519) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function vnoise2(x, z, s = 0) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const ux = fade(x - ix), uz = fade(z - iz);
  const a = h2(ix, iz, s), b = h2(ix + 1, iz, s), c = h2(ix, iz + 1, s), d = h2(ix + 1, iz + 1, s);
  return mix(mix(a, b, ux), mix(c, d, ux), uz);
}

export function vnoise3(x, y, z, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const ux = fade(x - ix), uy = fade(y - iy), uz = fade(z - iz);
  const c000 = h3(ix, iy, iz, s), c100 = h3(ix + 1, iy, iz, s);
  const c010 = h3(ix, iy + 1, iz, s), c110 = h3(ix + 1, iy + 1, iz, s);
  const c001 = h3(ix, iy, iz + 1, s), c101 = h3(ix + 1, iy, iz + 1, s);
  const c011 = h3(ix, iy + 1, iz + 1, s), c111 = h3(ix + 1, iy + 1, iz + 1, s);
  const x0 = mix(mix(c000, c100, ux), mix(c010, c110, ux), uy);
  const x1 = mix(mix(c001, c101, ux), mix(c011, c111, ux), uy);
  return mix(x0, x1, uz);
}

// Fractal sums, both roughly in [0, 1] with a mean near 0.5.
export function fbm2(x, z, s = 0, oct = 4) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise2(x * f, z * f, s + o * 17);
    norm += amp; amp *= 0.5; f *= 2.03;
  }
  return sum / norm;
}
export function fbm3(x, y, z, s = 0, oct = 4) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise3(x * f, y * f, z * f, s + o * 17);
    norm += amp; amp *= 0.5; f *= 2.03;
  }
  return sum / norm;
}

export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)],
};

export function sphere(R) {
  const u = R() * 2 - 1, t = R() * TAU, s = Math.sqrt(1 - u * u);
  return [s * Math.cos(t), u, s * Math.sin(t)];
}
export function gauss(R) {
  return Math.sqrt(-2 * Math.log(R() + 1e-9)) * Math.cos(TAU * R());
}

// Column-major matrices, as WebGL expects.
export function lookAt(eye, target, up = [0, 1, 0]) {
  const f = V.norm(V.sub(target, eye));
  const s = V.norm(V.cross(f, up));
  const u = V.cross(s, f);
  return new Float32Array([
    s[0], u[0], -f[0], 0,
    s[1], u[1], -f[1], 0,
    s[2], u[2], -f[2], 0,
    -V.dot(s, eye), -V.dot(u, eye), V.dot(f, eye), 1,
  ]);
}

export function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

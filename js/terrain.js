// Shared terrain math. Mesh and particle builders read from these same functions,
// so the particles and the geometry always describe the same world.

import { fbm2, prng, clamp01 } from './math.js';

const TAU = Math.PI * 2;

// Ocean: a coastline that rises from the sea on the right.
export const coastH = (x, z) =>
  (x - 1.8) * 0.5 + (fbm2(x * 0.17, z * 0.17, 11, 4) - 0.5) * 3.4 + (fbm2(x * 0.7, z * 0.7, 12, 2) - 0.5) * 0.5;

// Volcano: a cone with a crater and eight lava rivers.
export const VOLC_TOP = 7.0;
export const volcH = (x, z) => {
  const r = Math.hypot(x, z);
  let h = VOLC_TOP * Math.exp(-((r / 4.6) ** 2) * 1.1);
  h += (fbm2(x * 0.45, z * 0.45, 21, 4) - 0.5) * 1.4 * Math.min(1, r / 2.5);
  h -= 1.6 * Math.exp(-((r / 0.9) ** 2));
  return h;
};
export const RIVERS = 8;
export const riverAngle = (k, r) => k * TAU / RIVERS + 0.3 + 0.25 * Math.sin(r * 1.3 + k * 2);
export function lavaAt(x, z) {
  const r = Math.hypot(x, z);
  if (r < 0.8) return 1;
  if (r < 1.2 || r > 9) return 0;
  const th = Math.atan2(z, x);
  for (let k = 0; k < RIVERS; k++) {
    const d = Math.atan2(Math.sin(th - riverAngle(k, r)), Math.cos(th - riverAngle(k, r)));
    if (Math.abs(d) * r < 0.32) return 1;
  }
  return 0;
}

// Forest: rolling hills and a footpath through the trees.
export const forestH = (x, z) =>
  1.8 * ((fbm2(x * 0.11, z * 0.11, 31, 4) - 0.5) * 2) + 0.6 * Math.sin(x * 0.35) * Math.cos(z * 0.27);
export const PATH = [[-7, 10], [4, -6]];
export function distToPath(x, z) {
  const [ax, az] = PATH[0], [bx, bz] = PATH[1];
  const dx = bx - ax, dz = bz - az;
  const t = clamp01(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

// Downtown: a fixed district of blocks, built from a fixed seed.
export const CITY = { CELL: 8.2, HALF: 2.7, FLOOR: 1.2, COLS: 5, EXT: 36 };
export const BLOCKS = (() => {
  const R = prng(777);
  const out = [];
  for (let bx = -2; bx <= 1; bx++) for (let bz = -5; bz <= 3; bz++) {
    const cx = (bx + 0.5) * CITY.CELL, cz = (bz + 0.5) * CITY.CELL;
    const fall = 0.12 + 0.88 * Math.exp(-(cx * cx + cz * cz) / (2 * 16 * 16));
    out.push({ id: out.length, cx, cz, h: 2.5 + Math.pow(R(), 2.2) * 15 * fall + 0.8 * R() });
  }
  return out;
})();

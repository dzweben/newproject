// Device profile, read once at startup. Phones and weaker machines get fewer points and lighter meshes.

export const COARSE = matchMedia('(pointer: coarse)').matches;
export const SMALL = matchMedia('(max-width: 700px)').matches || (navigator.hardwareConcurrency || 8) <= 4;

// Scales mesh resolution: a 170-cell grid becomes 110 cells on a phone.
export const MESH_SCALE = SMALL ? 0.65 : 1;
export const grid = (n) => Math.round(n * MESH_SCALE);

// Small math helpers shared across modules.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

// Positive modulo (JS % keeps the sign of the dividend).
export function mod(a, n) {
  return ((a % n) + n) % n;
}

export function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Ken Perlin's smootherstep: 0->1 with zero 1st AND 2nd derivative at both ends.
// Gives motion that eases smoothly into and out of a dwell (no velocity jump).
export function smootherstep(t) {
  t = clamp(t, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Involute function inv(a) = tan(a) - a, used for gear tooth layout.
export function involute(a) {
  return Math.tan(a) - a;
}

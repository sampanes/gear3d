// Unit tests for the shared math helpers (src/math.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TAU, DEG, mod, clamp, lerp, smootherstep, involute } from '../src/math.js';

const near = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) <= eps, `${a} !~= ${b}`);

test('mod is always non-negative (unlike JS %)', () => {
  near(mod(7, 5), 2);
  near(mod(-1, 5), 4);
  near(mod(-0.25 * TAU, TAU), 0.75 * TAU);
  near(mod(0, 5), 0);
  for (let a = -20; a <= 20; a += 0.37) {
    const m = mod(a, TAU);
    assert.ok(m >= 0 && m < TAU, `mod(${a},TAU)=${m} out of [0,TAU)`);
  }
});

test('clamp bounds a value', () => {
  near(clamp(5, 0, 10), 5);
  near(clamp(-1, 0, 10), 0);
  near(clamp(11, 0, 10), 10);
});

test('lerp interpolates', () => {
  near(lerp(0, 10, 0.5), 5);
  near(lerp(2, 4, 0), 2);
  near(lerp(2, 4, 1), 4);
});

test('smootherstep clamps and has zero end-derivatives', () => {
  near(smootherstep(0), 0);
  near(smootherstep(1), 1);
  near(smootherstep(0.5), 0.5);
  near(smootherstep(-3), 0); // clamped
  near(smootherstep(9), 1); // clamped
  // numerical derivative at both ends should be ~0 (smooth ease into dwell)
  const h = 1e-5;
  const dStart = (smootherstep(h) - smootherstep(0)) / h;
  const dEnd = (smootherstep(1) - smootherstep(1 - h)) / h;
  assert.ok(Math.abs(dStart) < 1e-3, `start derivative ${dStart} not ~0`);
  assert.ok(Math.abs(dEnd) < 1e-3, `end derivative ${dEnd} not ~0`);
});

test('involute function inv(a) = tan(a) - a', () => {
  near(involute(0), 0);
  near(involute(20 * DEG), Math.tan(20 * DEG) - 20 * DEG);
});

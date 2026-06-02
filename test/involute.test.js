// Unit tests for the involute tooth profile (src/gears/involute.js).
// Imports three (for Vector2); three's math classes load fine under node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEG } from '../src/math.js';
import { gearMetrics, gearContour } from '../src/gears/involute.js';

const near = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} !~= ${b}`);

test('gearMetrics uses standard full-depth proportions', () => {
  const m = 4;
  const z = 20;
  const g = gearMetrics({ module: m, teeth: z, pressureAngle: 20 });
  near(g.r, (m * z) / 2);
  near(g.rb, g.r * Math.cos(20 * DEG));
  near(g.ra, g.r + m);
  near(g.rf, g.r - 1.25 * m);
});

const PARAMS = [
  { module: 4, teeth: 12, pressureAngle: 20 },
  { module: 2, teeth: 25, pressureAngle: 20 }, // odd teeth
  { module: 6, teeth: 8, pressureAngle: 14.5 }, // low count, undercut regime
  { module: 3, teeth: 60, pressureAngle: 25 }, // high count, rf >= rb regime
];

test('gearContour has NO zero-length edges — regression for the duplicate-vertex fixes', () => {
  for (const p of PARAMS) {
    const sPF = 14;
    const pts = gearContour(p, sPF);
    let minEdge = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length]; // include the closing wrap edge
      minEdge = Math.min(minEdge, Math.hypot(b.x - a.x, b.y - a.y));
    }
    assert.ok(minEdge > 1e-6, `${JSON.stringify(p)}: smallest edge ${minEdge} is degenerate`);
  }
});

test('gearContour point count matches the post-fix layout (2*steps + 11 per tooth)', () => {
  for (const p of PARAMS) {
    for (const sPF of [10, 14, 24]) {
      const pts = gearContour(p, sPF);
      assert.equal(pts.length, p.teeth * (2 * sPF + 11), `${JSON.stringify(p)} steps=${sPF}`);
    }
  }
});

test('gearContour winds CCW (positive signed area) and stays within [root, tip]', () => {
  for (const p of PARAMS) {
    const { ra, r } = gearMetrics(p);
    const pts = gearContour(p, 14);
    let area2 = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      area2 += a.x * b.y - b.x * a.y; // shoelace
      const rad = Math.hypot(a.x, a.y);
      assert.ok(rad <= ra + 1e-6, `${JSON.stringify(p)}: radius ${rad} exceeds tip ${ra}`);
      assert.ok(rad >= 0.2 * r - 1e-6, `${JSON.stringify(p)}: radius ${rad} below allowed root`);
    }
    assert.ok(area2 > 0, `${JSON.stringify(p)}: signed area ${area2} not CCW`);
  }
});

test('tooth thickness at the pitch circle equals pi*m/2 (measured off the generated flanks)', () => {
  const p = { module: 4, teeth: 20, pressureAngle: 20 };
  const { r, rb, ra } = gearMetrics(p);
  const sPF = 160; // fine sampling so linear interpolation along the flank is accurate
  const pts = gearContour(p, sPF);
  const perTooth = 2 * sPF + 11;
  // first tooth only (centre line at angle 0): split flank points by angle sign
  const tooth0 = pts.slice(0, perTooth).map((q) => ({ rad: Math.hypot(q.x, q.y), ang: Math.atan2(q.y, q.x) }));
  const onFlank = (q) => q.rad >= rb - 1e-6 && q.rad <= ra + 1e-6;
  const trailing = tooth0.filter((q) => q.ang < 0 && onFlank(q)).sort((a, b) => a.rad - b.rad);
  const leading = tooth0.filter((q) => q.ang > 0 && onFlank(q)).sort((a, b) => a.rad - b.rad);

  const interpAngleAt = (arr, rad) => {
    for (let i = 0; i + 1 < arr.length; i++) {
      if (rad >= arr[i].rad && rad <= arr[i + 1].rad) {
        const t = (rad - arr[i].rad) / (arr[i + 1].rad - arr[i].rad);
        return arr[i].ang + (arr[i + 1].ang - arr[i].ang) * t;
      }
    }
    throw new Error(`radius ${rad} not bracketed`);
  };

  const angTrailing = interpAngleAt(trailing, r); // negative
  const angLeading = interpAngleAt(leading, r); // positive
  const thicknessAngle = angLeading - angTrailing; // = 2*psi(r) = 2*halfTooth
  near(thicknessAngle, Math.PI / p.teeth, 2e-3, 'angular tooth thickness');
  near(r * thicknessAngle, (Math.PI * p.module) / 2, 2e-3 * r, 'arc tooth thickness = pi*m/2');
});

// Unit tests for the involute tooth profile (src/gears/involute.js).
// Imports three (for Vector2); three's math classes load fine under node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEG } from '../src/math.js';
import { gearMetrics, gearContour, internalGearMetrics, internalGearContour } from '../src/gears/involute.js';

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

test('gearContour point count matches the layout (radial drop only when rf < rb)', () => {
  for (const p of PARAMS) {
    const { rb, rf, r } = gearMetrics(p);
    const rStart = Math.max(rb, rf);
    const rootR = Math.max(Math.min(rf, rStart), 0.2 * r);
    const drop = rootR < rStart ? 1 : 0;
    const rootSteps = 5;
    const lastRootK = rootR < rStart ? rootSteps : rootSteps - 1;
    for (const sPF of [10, 14, 24]) {
      const pts = gearContour(p, sPF);
      const perTooth = sPF + 1 + 4 + sPF + drop + lastRootK; // trailing + tip + leading + drop + root
      assert.equal(pts.length, p.teeth * perTooth, `${JSON.stringify(p)} steps=${sPF}`);
    }
  }
});

test('high tooth count (rf >= rb): the profile is not drawn below the dedendum rf', () => {
  const p = { module: 3, teeth: 60, pressureAngle: 25 };
  const { rf, rb } = gearMetrics(p);
  assert.ok(rf >= rb, `precondition rf(${rf}) >= rb(${rb})`);
  const pts = gearContour(p, 14);
  let minR = Infinity;
  for (const q of pts) minR = Math.min(minR, Math.hypot(q.x, q.y));
  assert.ok(minR >= rf - 1e-6, `min radius ${minR} dips below the dedendum ${rf}`);
  near(minR, rf, 1e-6, 'root land should sit exactly at rf'); // regression for the accuracy fix
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

// ---------------------------------------------------------------------------
// Internal (ring) gear
// ---------------------------------------------------------------------------
const RINGS = [
  { module: 4, teeth: 48, pressureAngle: 20 }, // ra >= rb (normal ring)
  { module: 3, teeth: 60, pressureAngle: 20 },
  { module: 4, teeth: 32, pressureAngle: 14.5 }, // ra < rb -> radial bridge to the tip
  { module: 4, teeth: 24, pressureAngle: 14.5 }, // planetary-min ring, ra < rb
];

test('internalGearMetrics swaps addendum/dedendum (tip inner, root outer)', () => {
  const g = internalGearMetrics({ module: 4, teeth: 48, pressureAngle: 20 });
  near(g.ra, g.r - 4); // addendum points inward
  near(g.rf, g.r + 1.25 * 4); // dedendum opens outward into the rim
  assert.ok(g.ra < g.r && g.rf > g.r && g.rOuter > g.rf);
});

test('internalGearContour has no zero-length edges and winds CCW within [ra, rf]', () => {
  for (const p of RINGS) {
    const { ra, rf } = internalGearMetrics(p);
    const pts = internalGearContour(p, 14);
    let minEdge = Infinity;
    let area2 = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      minEdge = Math.min(minEdge, Math.hypot(b.x - a.x, b.y - a.y));
      area2 += a.x * b.y - b.x * a.y;
      const rad = Math.hypot(a.x, a.y);
      assert.ok(rad >= ra - 1e-6 && rad <= rf + 1e-6, `${JSON.stringify(p)}: radius ${rad} out of [ra,rf]`);
    }
    assert.ok(minEdge > 1e-6, `${JSON.stringify(p)}: degenerate edge ${minEdge}`);
    assert.ok(area2 > 0, `${JSON.stringify(p)}: not CCW`);
  }
});

test('internal tooth reaches its true addendum ra even when ra < rb (radial-bridge regression)', () => {
  for (const p of RINGS) {
    const { ra, rb } = internalGearMetrics(p);
    const pts = internalGearContour(p, 14);
    let minR = Infinity;
    for (const q of pts) minR = Math.min(minR, Math.hypot(q.x, q.y));
    // the inner tip must sit at the design addendum ra, NOT be truncated at rb
    near(minR, ra, 1e-6, `${JSON.stringify(p)} ra(${ra}) rb(${rb})`);
  }
});

test('internal tooth thickness at the pitch circle equals pi*m/2', () => {
  for (const p of RINGS) {
    const { r, ra, rf } = internalGearMetrics(p);
    const pts = internalGearContour(p, 200);
    // tooth 0 is centred at angle 0; gather flank points straddling it
    const win = Math.PI / p.teeth; // half pitch angle
    const tooth0 = pts
      .map((q) => ({ rad: Math.hypot(q.x, q.y), ang: Math.atan2(q.y, q.x) }))
      .filter((q) => Math.abs(q.ang) < win && q.rad >= ra - 1e-6 && q.rad < rf - 1e-6);
    const left = tooth0.filter((q) => q.ang < 0).sort((a, b) => a.rad - b.rad);
    const right = tooth0.filter((q) => q.ang > 0).sort((a, b) => a.rad - b.rad);
    const interp = (arr, rad) => {
      for (let i = 0; i + 1 < arr.length; i++)
        if (rad >= arr[i].rad && rad <= arr[i + 1].rad) {
          const t = (rad - arr[i].rad) / (arr[i + 1].rad - arr[i].rad);
          return arr[i].ang + (arr[i + 1].ang - arr[i].ang) * t;
        }
      throw new Error(`radius ${rad} not bracketed`);
    };
    const thickness = (interp(right, r) - interp(left, r)) * r;
    near(thickness, (Math.PI * p.module) / 2, 3e-3 * r, `${JSON.stringify(p)}`);
  }
});

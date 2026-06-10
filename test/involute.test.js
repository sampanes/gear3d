// Unit tests for the involute tooth profile (src/gears/involute.js).
// Imports three (for Vector2); three's math classes load fine under node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEG } from '../src/math.js';
import { gearMetrics, gearContour, rootFilletGeometry, internalGearMetrics, internalGearContour } from '../src/gears/involute.js';

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

test('gearContour point count matches the layout (trochoidal fillet vs filletEmpty fallback)', () => {
  // Resolution constants mirror src/gears/involute.js: TIP_STEPS=4, K_FILLET=8,
  // LAND_STEPS=4. Fillet present: (0)trailing-fillet K + (a)trailing-flank sPF +
  // (b)tip TIP + (c)leading-flank sPF + (d)leading-fillet K + (e)land LAND.
  // filletEmpty (rf>=rb): trailing sPF+1 + tip 4 + leading sPF + root land 4.
  const TIP_STEPS = 4, K_FILLET = 8, LAND_STEPS = 4;
  for (const p of PARAMS) {
    const { rb, rf } = gearMetrics(p);
    const filletEmpty = rf >= rb;
    for (const sPF of [10, 14, 24]) {
      const pts = gearContour(p, sPF);
      const perTooth = filletEmpty
        ? 2 * sPF + TIP_STEPS + 5 // = 2sPF + 9 (sPF+1 trailing + tip + sPF leading + (rootSteps-1=4) land)
        : 2 * sPF + 2 * K_FILLET + TIP_STEPS + LAND_STEPS; // = 2sPF + 24
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
  // z=20 m4 20deg: rf<rb and not undercut -> fillet present, perTooth = 2sPF + 2*8 + 4 + 4
  const perTooth = 2 * sPF + 24;
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
// Trochoidal root fillet / undercut (docs/fillet-design.md)
// ---------------------------------------------------------------------------
test('root fillet bottoms exactly at the dedendum rf (the trochoid reaches the root circle)', () => {
  for (const p of PARAMS) {
    const { rf } = gearMetrics(p);
    const pts = gearContour(p, 14);
    let minR = Infinity;
    for (const q of pts) minR = Math.min(minR, Math.hypot(q.x, q.y));
    near(minR, rf, 1e-6, `${JSON.stringify(p)}: deepest root point should sit at rf`);
  }
});

test('undercut is detected on low-tooth pinions and absent on high-tooth gears', () => {
  // Below z ~ 2/sin^2(alpha) the trochoid crosses the involute above rb -> undercut.
  const u12 = rootFilletGeometry({ module: 4, teeth: 12, pressureAngle: 20 });
  assert.ok(u12.undercut && u12.rhoForm > u12.rb, `z12@20 should undercut (rhoForm ${u12.rhoForm} > rb ${u12.rb})`);
  const u8 = rootFilletGeometry({ module: 6, teeth: 8, pressureAngle: 14.5 });
  assert.ok(u8.undercut && u8.rhoForm > u8.rb, `z8@14.5 should undercut`);

  // Well above threshold: no crossing, the fillet meets the involute origin at rb.
  const u40 = rootFilletGeometry({ module: 4, teeth: 40, pressureAngle: 20 });
  assert.ok(!u40.undercut && !u40.filletEmpty, 'z40@20 not undercut, fillet present');
  near(u40.rhoForm, u40.rb, 1e-9, 'z40@20 form radius sits at rb');

  // High tooth count rf >= rb: no fillet at all (filletEmpty fallback).
  const u60 = rootFilletGeometry({ module: 3, teeth: 60, pressureAngle: 25 });
  assert.ok(u60.filletEmpty && u60.rf >= u60.rb, 'z60@25 filletEmpty (rf >= rb)');
});

test('form radius never trims above the pitch circle (guard #1 — pathological m6/z8/14.5)', () => {
  // raw crossing here lands ABOVE r; clamping at r-eps keeps the pi*m/2 thickness intact.
  const u = rootFilletGeometry({ module: 6, teeth: 8, pressureAngle: 14.5 });
  assert.ok(u.rhoForm <= u.r, `rhoForm ${u.rhoForm} must not exceed pitch r ${u.r}`);
  near(u.rhoForm, u.r - 1e-6, 1e-6, 'clamped right at the pitch circle');
  // and in general the form radius stays within (rb, r] for every gear.
  for (const p of [...PARAMS, { module: 6, teeth: 8, pressureAngle: 14.5 }]) {
    const g = rootFilletGeometry(p);
    if (g.filletEmpty) continue;
    assert.ok(g.rhoForm <= g.r + 1e-9 && g.rhoForm >= g.rb - 1e-9, `${JSON.stringify(p)}: rhoForm in [rb, r]`);
  }
});

test('pitch-circle tooth thickness stays pi*m/2 even under a clamped severe undercut', () => {
  // Regression for the guard #1 clamp: when rho_form is capped at r-eps the FLANK
  // must still own the pitch circle (else the flank->fillet chord narrows the
  // tooth). Covers clamped pinions (z6/z8 @ 14.5) + an undercut and a clean gear.
  const gears = [
    { module: 4, teeth: 6, pressureAngle: 14.5 }, // clamped
    { module: 6, teeth: 8, pressureAngle: 14.5 }, // clamped (design poster child)
    { module: 4, teeth: 12, pressureAngle: 20 }, // undercut, not clamped
    { module: 4, teeth: 20, pressureAngle: 20 }, // clean
  ];
  for (const p of gears) {
    const { r, ra } = gearMetrics(p);
    const pts = gearContour(p, 240); // fine sampling near the pitch circle
    const win = Math.PI / p.teeth; // half a pitch around tooth 0 (centred at angle 0)
    const band = pts
      .map((q) => ({ rad: Math.hypot(q.x, q.y), ang: Math.atan2(q.y, q.x) }))
      .filter((q) => Math.abs(q.ang) < win && q.rad >= 0.97 * r && q.rad <= ra + 1e-6); // pure-flank band
    const trailing = band.filter((q) => q.ang < 0).sort((a, b) => a.rad - b.rad);
    const leading = band.filter((q) => q.ang > 0).sort((a, b) => a.rad - b.rad);
    const interp = (arr, rad) => {
      for (let i = 0; i + 1 < arr.length; i++)
        if (rad >= arr[i].rad && rad <= arr[i + 1].rad) {
          const t = (rad - arr[i].rad) / (arr[i + 1].rad - arr[i].rad);
          return arr[i].ang + (arr[i + 1].ang - arr[i].ang) * t;
        }
      throw new Error(`${JSON.stringify(p)}: pitch radius ${rad} not bracketed by flank points`);
    };
    const thickness = (interp(leading, r) - interp(trailing, r)) * r;
    near(thickness, (Math.PI * p.module) / 2, 4e-3 * r, `${JSON.stringify(p)} pitch thickness`);
  }
});

test('the leading fillet joins the flank, has no radial fold, and bottoms on the flat root land', () => {
  const g = rootFilletGeometry({ module: 4, teeth: 12, pressureAngle: 20 }); // undercut: join is an exact crossing
  // C0 join: at the form radius the fillet and the involute coincide in angle.
  near(g.filletLead(g.rhoForm), g.psi(g.rhoForm), 1e-6, 'fillet meets flank at rho_form');
  // bottom of the fillet lands on the edge of the flat root land (sigma - L/r).
  near(g.filletLead(g.rf), g.sigma - g.landHalfAng, 1e-9, 'fillet bottoms at the land edge');
  // Radius descends monotonically rho_form -> rf with no fold (sampled along the
  // contour the way gearContour emits it). The ANGLE is NOT monotone on an
  // undercut pinion: near the form circle the trochoid curls back toward the
  // tooth (it cuts UNDER the flank) before sweeping out to the space centre.
  let foldedInside = false;
  let prevRho = Infinity;
  for (let k = 0; k <= 20; k++) {
    const rho = g.rhoForm - (g.rhoForm - g.rf) * (k / 20);
    assert.ok(rho < prevRho + 1e-12, `fillet radius not monotone at step ${k}`);
    prevRho = rho;
    if (g.filletLead(rho) < g.filletLead(g.rhoForm) - 1e-4) foldedInside = true; // dips inside the flank
  }
  assert.ok(foldedInside, 'undercut fillet should curl inside the flank (the undercut notch)');
  assert.ok(g.filletLead(g.rf) > g.filletLead(g.rhoForm), 'net sweep is toward the space centre');
  assert.ok(g.landHalfAng > 0, 'a real flat root land exists');
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

// ---------------------------------------------------------------------------
// Backlash (print clearance) — the "print pack" tooth-thinning parameter.
// params.backlash = TOTAL circumferential play per mesh (mm at the pitch
// circle); each gear of a pair thins its tooth by half of it, so the pair
// splits the play evenly. Mount geometry (radii, centre distances) untouched.
// ---------------------------------------------------------------------------
test('backlash 0 / absent / NaN / negative are byte-identical (the default-off guard)', () => {
  for (const bad of [0, NaN, -0.5]) {
    for (const p of PARAMS) {
      assert.deepEqual(gearContour({ ...p, backlash: bad }, 14), gearContour(p, 14), `${JSON.stringify(p)} backlash=${bad}`);
    }
    for (const p of RINGS) {
      assert.deepEqual(internalGearContour({ ...p, backlash: bad }, 14), internalGearContour(p, 14), `${JSON.stringify(p)} backlash=${bad}`);
    }
  }
});

test('backlash rotates each flank rigidly by b/(4r) and widens the root land to match', () => {
  const p = { module: 4, teeth: 20, pressureAngle: 20 };
  const bl = 0.4;
  const g0 = rootFilletGeometry(p);
  const gb = rootFilletGeometry({ ...p, backlash: bl });
  const { r, rb, ra } = gearMetrics(p);
  const delta = bl / (4 * r);
  // rigid rotation: the same involute, turned delta toward the tooth centre
  for (let k = 0; k <= 10; k++) {
    const rho = rb + 1e-9 + (ra - rb - 1e-9) * (k / 10);
    near(gb.psi(rho), g0.psi(rho) - delta, 1e-12, `flank shift at rho=${rho.toFixed(2)}`);
  }
  // at the pitch circle the involute terms cancel exactly: psi(r) = halfTooth - delta
  near(gb.psi(r), Math.PI / (2 * p.teeth) - delta, 1e-12, 'pitch-circle flank angle');
  // the cutting rack tooth widens by bl/2, so its corner sits bl/4 further from
  // the space centre: the flat root land widens by exactly delta on each side
  near(gb.landHalfAng, g0.landHalfAng + delta, 1e-12, 'root land half-angle');
  // mount geometry never sees backlash
  assert.deepEqual(gearMetrics({ ...p, backlash: bl }), gearMetrics(p));
});

test('backlash thins the measured pitch-circle tooth to pi*m/2 - b/2 (external)', () => {
  const bl = 0.5;
  const p = { module: 4, teeth: 20, pressureAngle: 20, backlash: bl };
  const { r, rb, ra } = gearMetrics(p);
  const sPF = 160;
  const pts = gearContour(p, sPF);
  const perTooth = 2 * sPF + 24;
  const tooth0 = pts.slice(0, perTooth).map((q) => ({ rad: Math.hypot(q.x, q.y), ang: Math.atan2(q.y, q.x) }));
  const onFlank = (q) => q.rad >= rb - 1e-6 && q.rad <= ra + 1e-6;
  const trailing = tooth0.filter((q) => q.ang < 0 && onFlank(q)).sort((a, b) => a.rad - b.rad);
  const leading = tooth0.filter((q) => q.ang > 0 && onFlank(q)).sort((a, b) => a.rad - b.rad);
  const interp = (arr, rad) => {
    for (let i = 0; i + 1 < arr.length; i++)
      if (rad >= arr[i].rad && rad <= arr[i + 1].rad) {
        const t = (rad - arr[i].rad) / (arr[i + 1].rad - arr[i].rad);
        return arr[i].ang + (arr[i + 1].ang - arr[i].ang) * t;
      }
    throw new Error(`radius ${rad} not bracketed`);
  };
  const thickness = (interp(leading, r) - interp(trailing, r)) * r;
  near(thickness, (Math.PI * p.module) / 2 - bl / 2, 2e-3 * r, 'thinned pitch thickness');
});

test('backlash thins the internal (ring) tooth the same way: pi*m/2 - b/2 at pitch', () => {
  const bl = 0.5;
  const p = { module: 4, teeth: 48, pressureAngle: 20, backlash: bl };
  const { r, ra, rf } = internalGearMetrics(p);
  const pts = internalGearContour(p, 400);
  const win = Math.PI / p.teeth;
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
  near(thickness, (Math.PI * p.module) / 2 - bl / 2, 1e-3 * r, 'thinned ring-tooth pitch thickness');
});

test('an absurd backlash degrades safely: clamped near-pointed tip, contours stay valid', () => {
  // 10mm of backlash on small teeth is far beyond what the tip can give — the
  // clamp must cap it at a near-pointed tooth, never fold the contour.
  const pe = { module: 2, teeth: 12, pressureAngle: 20, backlash: 10 };
  {
    const { ra, r } = gearMetrics(pe);
    const pts = gearContour(pe, 14);
    let minEdge = Infinity;
    let area2 = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      minEdge = Math.min(minEdge, Math.hypot(b.x - a.x, b.y - a.y));
      area2 += a.x * b.y - b.x * a.y;
      const rad = Math.hypot(a.x, a.y);
      assert.ok(rad <= ra + 1e-6 && rad >= 0.2 * r - 1e-6, `external: radius ${rad} out of range`);
    }
    assert.ok(minEdge > 1e-6, `external: degenerate edge ${minEdge}`);
    assert.ok(area2 > 0, 'external: not CCW');
  }
  const pi = { module: 4, teeth: 24, pressureAngle: 14.5, backlash: 10 };
  {
    const { ra, rf } = internalGearMetrics(pi);
    const pts = internalGearContour(pi, 14);
    let minEdge = Infinity;
    let area2 = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      minEdge = Math.min(minEdge, Math.hypot(b.x - a.x, b.y - a.y));
      area2 += a.x * b.y - b.x * a.y;
      const rad = Math.hypot(a.x, a.y);
      assert.ok(rad >= ra - 1e-6 && rad <= rf + 1e-6, `internal: radius ${rad} out of [ra,rf]`);
    }
    assert.ok(minEdge > 1e-6, `internal: degenerate edge ${minEdge}`);
    assert.ok(area2 > 0, 'internal: not CCW');
  }
});

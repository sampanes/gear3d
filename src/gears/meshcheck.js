// 2D interference between posed gear contours: how deep the teeth of one gear dig into
// another. Sampling a mechanism over a tooth pitch of rotation with these proves (or
// disproves) that a tooth-count combination turns without teeth passing through each
// other. Pure geometry, no THREE scene needed.

import { gearContour, gearMetrics, internalGearContour, internalGearMetrics } from './involute.js';

// teeth digging deeper than this (x module) collide; sampled outlines at zero backlash read
// up to ~0.007 x module on sets that mesh cleanly
export const DIG_LIMIT = 0.0125;

// contour points rotated by `angle` and moved to (cx, cy)
export function posed(contour, angle, cx = 0, cy = 0) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return contour.map((p) => ({ x: cx + p.x * c - p.y * s, y: cy + p.x * s + p.y * c }));
}

// even-odd point in polygon
export function inside(pt, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) ins = !ins;
  }
  return ins;
}

export function distToPoly(pt, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const b = poly[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = dx * dx + dy * dy;
    const t = L > 0 ? Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(pt.x - a.x - t * dx, pt.y - a.y - t * dy));
  }
  return best;
}

// Deepest point of one external gear inside another (both posed outlines), either way.
export function externalPenetration(a, ca, raA, b, cb, raB) {
  let worst = 0;
  for (const [pts, poly, c, ra] of [[a, b, cb, raB], [b, a, ca, raA]]) {
    for (const p of pts) {
      if (Math.hypot(p.x - c.x, p.y - c.y) >= ra) continue; // outside the other's tips
      if (inside(p, poly)) worst = Math.max(worst, distToPoly(p, poly));
    }
  }
  return worst;
}

// Deepest dig between an external gear (outline `g`, centre cg, tip radius raG) and a ring
// (inner outline `ring`, centred at cr, tip radius raR): gear points in the ring's material
// (outside its inner outline) and ring points inside the gear.
export function internalPenetration(g, cg, raG, ring, cr, raR) {
  let worst = 0;
  for (const p of g) {
    if (Math.hypot(p.x - cr.x, p.y - cr.y) <= raR) continue; // inside the ring's tips: free
    if (!inside(p, ring)) worst = Math.max(worst, distToPoly(p, ring));
  }
  for (const p of ring) {
    if (Math.hypot(p.x - cg.x, p.y - cg.y) >= raG) continue;
    if (inside(p, g)) worst = Math.max(worst, distToPoly(p, g));
  }
  return worst;
}

// The InternalGear mechanism's worst dig over one pinion tooth pitch, using the poses its
// own update() sets.
export function internalGearInterference(mech, params, samples = 24) {
  const { module: m, pressureAngle: pa } = params;
  const bl = params.backlash ?? 0;
  const pin = gearContour({ module: m, teeth: mech.zp, pressureAngle: pa, backlash: bl });
  const ring = internalGearContour({ module: m, teeth: mech.zr, pressureAngle: pa, backlash: bl });
  const raG = gearMetrics({ module: m, teeth: mech.zp, pressureAngle: pa }).ra;
  const raR = internalGearMetrics({ module: m, teeth: mech.zr, pressureAngle: pa }).ra;
  let worst = 0;
  for (let k = 0; k < samples; k++) {
    mech.update(((2 * Math.PI) / mech.zp) * (k / samples));
    const cg = { x: mech.pinion.position.x, y: mech.pinion.position.y };
    const g = posed(pin, mech.pinion.rotation.z, cg.x, cg.y);
    const r = posed(ring, mech.ring.rotation.z);
    worst = Math.max(worst, internalPenetration(g, cg, raG, r, { x: 0, y: 0 }, raR));
  }
  return worst;
}

// The Planetary mechanism's worst dig, each planet against the sun and the ring, over one
// sun tooth pitch, using the poses its own update() sets. `planets` limits how many are
// checked (when the assembly count is whole they all sit alike, so one stands for all).
export function planetaryInterference(mech, params, samples = 12, planets = Infinity) {
  const { module: m, pressureAngle: pa } = params;
  const bl = params.backlash ?? 0;
  const sun = gearContour({ module: m, teeth: mech.zSun, pressureAngle: pa, backlash: bl });
  const pl = gearContour({ module: m, teeth: mech.zPlanet, pressureAngle: pa, backlash: bl });
  const ring = internalGearContour({ module: m, teeth: mech.zRing, pressureAngle: pa, backlash: bl });
  const raS = gearMetrics({ module: m, teeth: mech.zSun, pressureAngle: pa }).ra;
  const raP = gearMetrics({ module: m, teeth: mech.zPlanet, pressureAngle: pa }).ra;
  const raR = internalGearMetrics({ module: m, teeth: mech.zRing, pressureAngle: pa }).ra;
  const o = { x: 0, y: 0 };
  let worst = 0;
  for (let k = 0; k < samples; k++) {
    mech.update(((2 * Math.PI) / mech.zSun) * (k / samples));
    const car = mech.carrier.rotation.z;
    const s = posed(sun, mech.sun.rotation.z);
    const r = posed(ring, mech.ring.rotation.z);
    for (const p of mech.planets.slice(0, planets)) {
      const c = Math.cos(car);
      const sn = Math.sin(car);
      const cp = { x: p.position.x * c - p.position.y * sn, y: p.position.x * sn + p.position.y * c };
      const g = posed(pl, car + p.rotation.z, cp.x, cp.y);
      worst = Math.max(worst, externalPenetration(g, cp, raP, s, o, raS), internalPenetration(g, cp, raP, r, o, raR));
    }
  }
  return worst;
}

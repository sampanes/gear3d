// Involute spur-gear tooth profile generation.
//
// Standard full-depth proportions (module m, teeth z, pressure angle alpha):
//   pitch radius    r  = m * z / 2
//   base radius     rb = r * cos(alpha)     (the involute is unwound from here)
//   addendum/tip    ra = r + m
//   dedendum/root   rf = r - 1.25 * m
//   tooth thickness at the pitch circle = pi * m / 2  (== gap thickness)
//
// A single flank is the involute of the base circle. The polar angle of the
// profile at radius rho, measured from the tooth centre line, is
//   psi(rho) = halfTooth + inv(alpha) - inv(alpha_rho),
// where alpha_rho = acos(rb / rho) is the local pressure angle. At the pitch
// circle psi = halfTooth (= pi / (2z)); the tooth narrows toward the tip.

import * as THREE from 'three';
import { TAU, DEG, involute } from '../math.js';

export function gearMetrics({ module: m, teeth: z, pressureAngle = 20 }) {
  const alpha = pressureAngle * DEG;
  const r = (m * z) / 2;
  const rb = r * Math.cos(alpha);
  const ra = r + m;
  const rf = r - 1.25 * m;
  return { m, z, alpha, r, rb, ra, rf };
}

// Outer contour of the gear as an array of THREE.Vector2, wound CCW, closed.
export function gearContour(params, stepsPerFlank = 14) {
  const { z, alpha, r, rb, ra, rf } = gearMetrics(params);
  const pitch = TAU / z;
  const halfTooth = Math.PI / (2 * z);
  const invAlpha = involute(alpha);

  // The involute exists only for rho >= rb, so the flank starts at the larger of
  // the base circle and the root circle:
  //   rf < rb  (low tooth counts): flanks start at rb; the [rf, rb] gap is
  //            bridged by a short radial drop to the root land at rf.
  //   rf >= rb (high tooth counts): flanks start right at the root circle, so
  //            there is no drop and nothing is drawn below the true dedendum.
  const rStart = Math.max(rb, rf);
  const rootR = Math.max(Math.min(rf, rStart), 0.2 * r);

  const psi = (rho) => {
    const ar = Math.acos(Math.min(1, rb / rho));
    return halfTooth + invAlpha - involute(ar);
  };

  const pts = [];
  const push = (rho, ang) =>
    pts.push(new THREE.Vector2(rho * Math.cos(ang), rho * Math.sin(ang)));

  const psiBase = psi(rStart);
  const psiTip = psi(ra);

  for (let i = 0; i < z; i++) {
    const c = i * pitch; // tooth centre line

    // up the trailing (-) flank, base -> tip
    for (let k = 0; k <= stepsPerFlank; k++) {
      const rho = rStart + (ra - rStart) * (k / stepsPerFlank);
      push(rho, c - psi(rho));
    }
    // tip arc, -psiTip -> +psiTip
    const tipSteps = 4;
    for (let k = 1; k <= tipSteps; k++) {
      push(ra, c - psiTip + 2 * psiTip * (k / tipSteps));
    }
    // down the leading (+) flank, tip -> base (start one step in: the tip arc
    // already emitted the rho=ra vertex, so re-emitting it makes a zero-length edge)
    for (let k = stepsPerFlank - 1; k >= 0; k--) {
      const rho = rStart + (ra - rStart) * (k / stepsPerFlank);
      push(rho, c + psi(rho));
    }
    // radial drop into the root (only when the root sits below the flank base),
    // then the root arc across the gap toward the next tooth.
    if (rootR < rStart) push(rootR, c + psiBase);
    const a0 = c + psiBase;
    const a1 = c + pitch - psiBase;
    const rootSteps = 5;
    // When the root land is at the flank base (rf >= rb, no drop), the final arc
    // vertex at a1 coincides with the next tooth's flank start, so stop one short
    // of it; otherwise emit it as the base of the radial wall back up to the flank.
    const lastRootK = rootR < rStart ? rootSteps : rootSteps - 1;
    for (let k = 1; k <= lastRootK; k++) {
      push(rootR, a0 + (a1 - a0) * (k / rootSteps));
    }
    // The climb back to the flank base at a1 is supplied by the next tooth's
    // first trailing-flank vertex (and by the Shape auto-close on the last
    // tooth), so emitting it here would just duplicate that vertex.
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Internal (ring) gear
// ---------------------------------------------------------------------------
// An internal gear is an annular rim with teeth pointing inward. Addendum and
// dedendum swap versus an external gear: the tip is the INNER radius (ra = r-m)
// and the root opens OUT into the rim (rf = r+1.25m). The flank is the same
// involute of the base circle.
export function internalGearMetrics({ module: m, teeth: z, pressureAngle = 20, rim = 3 }) {
  const alpha = pressureAngle * DEG;
  const r = (m * z) / 2;
  const rb = r * Math.cos(alpha);
  const ra = r - m; // tooth tip (points inward)
  const rf = r + 1.25 * m; // tooth root (out into the rim)
  const rOuter = rf + rim * m; // outer rim radius
  return { m, z, alpha, r, rb, ra, rf, rOuter };
}

// Inner toothed boundary of an internal gear as THREE.Vector2[], wound CCW and
// closed. The tooth angular half-width is phi(rho) = pitch/2 - psi(rho): equal
// to an external tooth at the pitch circle, but it widens toward the outer root
// and narrows to the inner tip — the radial negative of an external tooth. When
// the design tip ra falls below the base circle (low teeth / low pressure
// angle) the involute flank stops at rb and a short radial segment bridges in to
// ra, so the tooth still reaches its true addendum — mirroring how the external
// gear bridges [rf, rb] down to its root. Use this as a (reversed) hole inside a
// plain outer-rim circle.
export function internalGearContour(params, stepsPerFlank = 14) {
  const { z, alpha, rb, ra, rf } = internalGearMetrics(params);
  const pitch = TAU / z;
  const halfPitch = Math.PI / z;
  const halfTooth = Math.PI / (2 * z);
  const invAlpha = involute(alpha);

  const rIn = Math.max(ra, rb); // the involute flank stops at the base circle
  const rTip = ra; // the true (design) addendum the tooth tip must reach
  const rOut = rf;

  // tooth angular half-width at radius rho: narrow at the inner tip, wide at root
  const phi = (rho) => {
    const ar = Math.acos(Math.min(1, rb / rho));
    return halfPitch - (halfTooth + invAlpha - involute(ar));
  };

  const pts = [];
  const push = (rho, ang) => pts.push(new THREE.Vector2(rho * Math.cos(ang), rho * Math.sin(ang)));

  const phiIn = phi(rIn);
  const phiOut = phi(rOut);
  const tipSteps = 4;
  const gapSteps = 5;

  for (let i = 0; i < z; i++) {
    const c = i * pitch; // tooth centre line

    // left flank: outer root -> flank base (base circle), angle c - phi(rho)
    for (let k = 0; k <= stepsPerFlank; k++) {
      const rho = rOut + (rIn - rOut) * (k / stepsPerFlank);
      push(rho, c - phi(rho));
    }
    // when the tip sits below the base circle (ra < rb) the involute can't reach
    // it, so bridge radially in to the true addendum (no-op when ra >= rb)
    if (rIn > rTip) push(rTip, c - phiIn);
    // inner tip arc at the true addendum, -phiIn -> +phiIn (skip first; emitted)
    for (let k = 1; k <= tipSteps; k++) {
      push(rTip, c - phiIn + 2 * phiIn * (k / tipSteps));
    }
    if (rIn > rTip) push(rIn, c + phiIn); // radial climb back to the flank base
    // right flank: flank base -> outer root, angle c + phi(rho) (skip first)
    for (let k = 1; k <= stepsPerFlank; k++) {
      const rho = rIn + (rOut - rIn) * (k / stepsPerFlank);
      push(rho, c + phi(rho));
    }
    // recess (gap) arc at the outer root across to the next tooth; stop one short
    // so the next tooth's left-flank base supplies the final vertex (no duplicate).
    const g0 = c + phiOut;
    const g1 = c + pitch - phiOut;
    for (let k = 1; k <= gapSteps - 1; k++) {
      push(rOut, g0 + (g1 - g0) * (k / gapSteps));
    }
  }
  return pts;
}

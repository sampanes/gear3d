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

  // The involute exists only for rho >= rb. Start flanks at the base circle and
  // clamp the root just below it so the root fillet never crosses the flank.
  const rStart = rb;
  const rootR = Math.max(Math.min(rf, rb * 0.999), 0.2 * r);

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
    // down the leading (+) flank, tip -> base
    for (let k = stepsPerFlank; k >= 0; k--) {
      const rho = rStart + (ra - rStart) * (k / stepsPerFlank);
      push(rho, c + psi(rho));
    }
    // radial drop into the root, then root-fillet arc across the gap, then back
    if (rootR < rStart) push(rootR, c + psiBase);
    const a0 = c + psiBase;
    const a1 = c + pitch - psiBase;
    const rootSteps = 5;
    for (let k = 1; k <= rootSteps; k++) {
      push(rootR, a0 + (a1 - a0) * (k / rootSteps));
    }
    if (rootR < rStart) push(rStart, a1);
  }
  return pts;
}

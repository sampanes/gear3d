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

// Per-tooth sampling resolution for the root fillet + land.
const TIP_STEPS = 4;
const K_FILLET = 8; // trochoid samples per flank (each gap gets two — one each side)
const LAND_STEPS = 4; // flat root-land samples

// Trochoidal root-fillet geometry for an external gear (see docs/fillet-design.md).
// The sharp corner of the basic rack — a depth b below the pitch line, offset L
// to the side of the space centre — traces a trochoid as the gear rolls. In the
// space-centre frame, parameter u = gear roll angle (rad):
//   X  = rf            constant radial line of the corner (= r - b)
//   Lu = L - r*u       lateral position of the corner; 0 at the deepest point
//   rho        = hypot(X, Lu)
//   aboutSigma = atan2(X sin u + Lu cos u,  X cos u - Lu sin u)
// The deepest point (Lu = 0, u = L/r) sits at rho = rf, an angle sigma off the
// tooth centre — so the two fillets bounding a space leave a flat root land of
// half-angle L/r centred on the space line. Returns the closures plus the
// resolved form radius so gearContour and its tests share one source of truth.
export function rootFilletGeometry(params) {
  const { m, z, alpha, r, rb, ra, rf } = gearMetrics(params);
  const halfTooth = Math.PI / (2 * z);
  const invAlpha = involute(alpha);
  const sigma = Math.PI / z; // space (gap) centre line, half a pitch off the tooth centre

  // Backlash (print clearance): params.backlash is the mesh's TOTAL circumferential
  // play in mm at the pitch circle; each gear of the pair contributes half, so this
  // tooth thins by backlash/2 of arc — each flank rotates delta = backlash/(4r)
  // toward the tooth centre (a rigid rotation, so the flank stays a true involute
  // of the same base circle). Equivalently the gear is cut by a rack whose tooth is
  // backlash/2 wider at the pitch line, so the rack corner that traces the root
  // trochoid sits backlash/4 further from the space centre (the +bl/4 in L below) —
  // flank and fillet stay one consistent generated geometry. Mount geometry
  // (r, rb, ra, rf, centre distances) is untouched. Clamped so the tip arc never
  // inverts: an absurd request degrades to a near-pointed tooth, never a fold.
  const psiTip0 = halfTooth + invAlpha - involute(Math.acos(Math.min(1, rb / ra)));
  const blReq = Number.isFinite(params.backlash) ? Math.max(params.backlash, 0) : 0; // NaN/negative -> 0
  const delta = Math.min(blReq / (4 * r), Math.max(0, 0.98 * psiTip0));
  const bl = 4 * r * delta; // effective (post-clamp) backlash

  // involute flank angle off the tooth centre at radius rho (>= rb)
  const psi = (rho) => {
    const ar = Math.acos(Math.min(1, rb / rho));
    return halfTooth - delta + invAlpha - involute(ar);
  };
  const b = 1.25 * m;
  const L = (Math.PI * m) / 4 + bl / 4 - b * Math.tan(alpha);
  const X = rf; // = r - b
  const landHalfAng = Math.max(0, L / r); // flat root-land half-width (rad)

  // rho -> the trochoid's angular offset from the space centre, on the branch
  // u <= L/r (where rho increases monotonically from rf), inverted in closed form.
  const aboutSigmaAt = (rho) => {
    const Lu = Math.sqrt(Math.max(0, rho * rho - X * X));
    const u = (L - Lu) / r;
    return Math.atan2(X * Math.sin(u) + Lu * Math.cos(u), X * Math.cos(u) - Lu * Math.sin(u));
  };
  // fillet angular offset from the TOOTH centre, leading (+) side:
  const filletLead = (rho) => sigma - aboutSigmaAt(rho);

  // Form radius rho_form, where the fillet meets the involute flank:
  //   rf >= rb (high tooth): no involute below rb to fillet into — fall back to
  //            the flank-from-rf + flat-root simplification (filletEmpty).
  //   undercut (rf < rb, low z): the trochoid CROSSES the involute above rb;
  //            rho_form is the largest crossing, the involute below it is cut off.
  //   otherwise: the fillet reaches the involute origin, rho_form = rb.
  let filletEmpty = false;
  let rhoForm;
  if (rf >= rb) {
    filletEmpty = true;
    rhoForm = rf;
  } else {
    const g = (rho) => filletLead(rho) - psi(rho); // sign change above rb = undercut crossing
    const N = 256;
    let cross = null;
    let prevG = g(rb);
    let prevRho = rb;
    for (let i = 1; i <= N; i++) {
      const rho = rb + (ra - rb) * (i / N);
      const gi = g(rho);
      if ((prevG <= 0) !== (gi <= 0)) cross = [prevRho, rho]; // keep the last (largest-rho) bracket
      prevRho = rho;
      prevG = gi;
    }
    if (cross) {
      let [lo, hi] = cross;
      const loNeg = g(lo) <= 0;
      for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2;
        if ((g(mid) <= 0) === loNeg) lo = mid;
        else hi = mid;
      }
      rhoForm = (lo + hi) / 2;
    } else {
      rhoForm = rb;
    }
    // Guard #1: never trim above the pitch circle (preserves the pi*m/2 pitch
    // thickness — psi(r) = halfTooth exactly). Pathological undercuts (e.g.
    // m6/z8/14.5) push the raw crossing above r; capping at r-eps is the safe degrade.
    rhoForm = Math.min(rhoForm, r - 1e-6);
    // A crossing essentially at rb is just the non-undercut origin.
    if (rhoForm < rb) rhoForm = rb;
  }
  const undercut = !filletEmpty && rhoForm > rb + 1e-6;
  return { psi, aboutSigmaAt, filletLead, sigma, landHalfAng, rhoForm, filletEmpty, undercut, rb, rf, r, ra };
}

// Outer contour of the gear as an array of THREE.Vector2, wound CCW, closed.
// The root is a true rack-generated trochoidal fillet (see rootFilletGeometry):
// it replaces the old flat-root-land + radial-wall simplification, and on
// low-tooth pinions it correctly CROSSES the involute (undercut), cutting the
// flank away above the form circle.
export function gearContour(params, stepsPerFlank = 14) {
  const { z, ra, rf } = gearMetrics(params);
  const pitch = TAU / z;
  const { psi, aboutSigmaAt, filletLead, sigma, landHalfAng, rhoForm, filletEmpty } =
    rootFilletGeometry(params);

  const pts = [];
  const push = (rho, ang) => pts.push(new THREE.Vector2(rho * Math.cos(ang), rho * Math.sin(ang)));

  const psiTip = psi(ra);
  // Guard #3: a vanishingly thin land (very high tooth count) collapses to one
  // vertex so its samples don't pile into zero-length edges.
  const landCollapse = !filletEmpty && 2 * landHalfAng <= 1e-9;

  for (let i = 0; i < z; i++) {
    const c = i * pitch; // tooth centre line

    if (filletEmpty) {
      // High tooth count (rf >= rb): the original simplification — flank starts
      // at the root circle, flat root land spans the whole gap, no fillet.
      const psiBase = psi(rf);
      for (let k = 0; k <= stepsPerFlank; k++) {
        const rho = rf + (ra - rf) * (k / stepsPerFlank);
        push(rho, c - psi(rho));
      }
      for (let k = 1; k <= TIP_STEPS; k++) push(ra, c - psiTip + 2 * psiTip * (k / TIP_STEPS));
      for (let k = stepsPerFlank - 1; k >= 0; k--) {
        const rho = rf + (ra - rf) * (k / stepsPerFlank);
        push(rho, c + psi(rho));
      }
      const a0 = c + psiBase;
      const a1 = c + pitch - psiBase;
      const rootSteps = 5;
      for (let k = 1; k <= rootSteps - 1; k++) push(rf, a0 + (a1 - a0) * (k / rootSteps));
      continue;
    }

    // Fillet present. Emit CCW; each segment emits its START vertex + interior
    // but NOT its end (the next segment owns that), so no vertex is duplicated:
    //
    // (0) trailing (-) fillet: rf -> rho_form, climbing out of the gap the
    //     PREVIOUS tooth's land opened. Its start (rf) is that land's far end.
    for (let k = 0; k < K_FILLET; k++) {
      const rho = rf + (rhoForm - rf) * (k / K_FILLET);
      push(rho, c - sigma + aboutSigmaAt(rho));
    }
    // (a) trailing (-) flank: rho_form -> ra (skip ra; the tip arc owns it)
    for (let k = 0; k < stepsPerFlank; k++) {
      const rho = rhoForm + (ra - rhoForm) * (k / stepsPerFlank);
      push(rho, c - psi(rho));
    }
    // (b) tip arc: -psiTip -> +psiTip (skip the far end; the leading flank owns it)
    for (let k = 0; k < TIP_STEPS; k++) push(ra, c - psiTip + 2 * psiTip * (k / TIP_STEPS));
    // (c) leading (+) flank: ra -> rho_form INCLUSIVE. The FLANK (not the fillet)
    //     must own the rho_form vertex: when a severe undercut clamps rho_form to
    //     r-eps (guard #1), this keeps the pitch circle sitting on the involute,
    //     so the pi*m/2 tooth thickness survives. The trailing flank (a) already
    //     owns its rho_form, so both flanks are symmetric.
    for (let k = 0; k <= stepsPerFlank; k++) {
      const rho = ra - (ra - rhoForm) * (k / stepsPerFlank);
      push(rho, c + psi(rho));
    }
    // (d) leading (+) fillet: rho_form -> rf, INTERIOR only (the flank owns
    //     rho_form, the root land owns rf).
    for (let k = 1; k < K_FILLET; k++) {
      const rho = rhoForm - (rhoForm - rf) * (k / K_FILLET);
      push(rho, c + filletLead(rho));
    }
    // (e) flat root land at rf, centred on the space line c+sigma (skip the far
    //     end; the next tooth's trailing fillet owns it as its start).
    if (landCollapse) {
      push(rf, c + sigma);
    } else {
      for (let k = 0; k < LAND_STEPS; k++) {
        push(rf, c + sigma - landHalfAng + 2 * landHalfAng * (k / LAND_STEPS));
      }
    }
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
  const { r, z, alpha, rb, ra, rf } = internalGearMetrics(params);
  const pitch = TAU / z;
  const halfPitch = Math.PI / z;
  const halfTooth = Math.PI / (2 * z);
  const invAlpha = involute(alpha);

  const rIn = Math.max(ra, rb); // the involute flank stops at the base circle
  const rTip = ra; // the true (design) addendum the tooth tip must reach
  const rOut = rf;

  // Backlash: the ring tooth thins by backlash/2 of arc at the pitch circle —
  // the same half-share as an external gear (see rootFilletGeometry), so a
  // meshed pair splits the play evenly: both flanks rotate delta = backlash/(4r)
  // toward the tooth centre. Clamped so the inner tip arc never inverts.
  const phiTip0 = halfPitch - (halfTooth + invAlpha - involute(Math.acos(Math.min(1, rb / rIn))));
  const blReq = Number.isFinite(params.backlash) ? Math.max(params.backlash, 0) : 0; // NaN/negative -> 0
  const delta = Math.min(blReq / (4 * r), Math.max(0, 0.98 * phiTip0));

  // tooth angular half-width at radius rho: narrow at the inner tip, wide at root
  const phi = (rho) => {
    const ar = Math.acos(Math.min(1, rb / rho));
    return halfPitch - (halfTooth + delta + invAlpha - involute(ar));
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

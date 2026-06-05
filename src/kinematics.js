// Pure kinematics — no Three.js here, so the motion math can be reasoned about
// and tested in isolation. Angles are radians, driver angle `theta` is the
// continuously increasing rotation of the input crank/wheel.

import { TAU, mod, clamp, smootherstep } from './math.js';

// ---------------------------------------------------------------------------
// External Geneva drive
// ---------------------------------------------------------------------------
// A driver wheel turns continuously; a single crank pin engages the radial
// slots of an n-slot star wheel, indexing it 360/n per revolution and locking
// it the rest of the time.
//
// Geometry (center distance c normalized to 1):
//   beta  = PI / n          half of one index (the star turns 2*beta per index)
//   gamma = PI/2 - beta      half the driver rotation during engagement
//   s     = sin(beta)        crank radius / center distance  (a = c * s)
//
// During engagement the slot stays radial. An external Geneva counter-rotates,
// so a CCW driver turns the star CW: the star angle relative to the line of
// centers is  phi = -atan2(s*sin x, 1 - s*cos x),  x = driver angle from the
// engagement centre. This reaches -/+beta exactly at x = +/-gamma, and its
// derivative is zero there — the pin enters and leaves with no angular shock.
export function genevaGeometry(n) {
  n = Math.max(3, Math.round(n)); // guard: n < 3 collapses the engagement window
  const beta = Math.PI / n;
  return {
    n,
    beta,
    gamma: Math.PI / 2 - beta,
    crankRatio: Math.sin(beta), // a / c
    // Star radii as fractions of the center distance c:
    rimRatio: Math.cos(beta), // slot mouth (rim) radius / c
    slotBottomRatio: 1 - Math.sin(beta), // deepest pin reach / c
  };
}

// Absolute star-wheel angle for a given (continuous) driver angle.
// One index per driver revolution; engagement centred at theta = 0 (mod TAU).
export function genevaStarAngle(theta, n) {
  const { beta, gamma, crankRatio: s } = genevaGeometry(n);
  const k = Math.round(theta / TAU); // which index cycle we are in/near
  const x = theta - k * TAU; // driver angle relative to this cycle's centre, [-PI, PI]
  const station = -k * 2 * beta; // star angle accumulated by completed indexes (CW)

  if (Math.abs(x) <= gamma) {
    // engaged: pin is in the slot, star is driven (counter to the driver)
    const phi = -Math.atan2(s * Math.sin(x), 1 - s * Math.cos(x));
    return { angle: station + phi, engaged: true };
  }
  // dwell: star is locked at the station it last reached on this side
  return { angle: station + (x > 0 ? -beta : beta), engaged: false };
}

// ---------------------------------------------------------------------------
// Double-Geneva oscillator
// ---------------------------------------------------------------------------
// Two coaxial wheels are joined and turn together; each carries one pin, the
// pins 180 degrees apart. A single output lever is pivoted above the joint.
// As one wheel's pin comes around it drives the lever to one extreme; half a
// revolution later the other wheel's pin drives it back — so the output toggles
// back and forth in place, dwelling briefly at each end.
//
//   amp      output half-swing (radians); the lever rocks between -amp and +amp
//   pushFrac fraction of each half-revolution spent being driven (0..1); the
//            remainder is dwell. Motion uses smootherstep so it eases into the
//            dwell with zero velocity (no slam).
//
// Returns { angle, active, drive } where `active` is 0 (dwell), 1 (wheel 1
// driving), or 2 (wheel 2 driving), and `drive` is 0..1 progress through the
// current push (for visuals). By default the lever rocks between -amp and +amp;
// pass explicit dwell targets { lo, hi } to retarget the two extremes — the
// SATOR O-flip uses { lo: 0, hi: PI } to toggle a tile upright <-> inverted.
export function doubleGenevaOutput(theta, amp, pushFrac = 0.62, { lo = -amp, hi = amp } = {}) {
  const w = clamp(pushFrac, 0.05, 1) * Math.PI; // push duration in driver radians
  const ph = mod(theta, TAU);
  const span = hi - lo;

  if (ph < w) {
    // wheel 1 drives the lever from lo up to hi
    const t = smootherstep(ph / w);
    return { angle: lo + span * t, active: 1, drive: ph / w };
  }
  if (ph < Math.PI) {
    return { angle: hi, active: 0, drive: 0 }; // dwell at hi
  }
  if (ph < Math.PI + w) {
    // wheel 2 drives the lever from hi back down to lo
    const t = smootherstep((ph - Math.PI) / w);
    return { angle: hi - span * t, active: 2, drive: (ph - Math.PI) / w };
  }
  return { angle: lo, active: 0, drive: 0 }; // dwell at lo
}

// Pin offset (added to the shared wheel angle) that puts a wheel's pin at the
// top of its orbit — nearest the output lever — at the midpoint of its push.
// Wheel 1 pushes in [0, w], wheel 2 (180 deg later) in [PI, PI+w].
export function doubleGenevaPinOffset(pushFrac = 0.62) {
  const w = clamp(pushFrac, 0.05, 1) * Math.PI;
  return Math.PI / 2 - w / 2;
}

// True slotted-rocker geometry (the faithful Double Geneva). Two counter-rotating
// wheels each carry a crank pin at orbit radius a about the common centre O; an
// output rocker pivots at P = (0, H) directly above O with one radial slot. A
// pin enters the slot near the top of its orbit and, sliding within it, swings
// the rocker; half a turn later the OTHER pin (on the counter-rotating wheel)
// sweeps it back — a genuine pin-in-slot drive, not a scripted angle.
//
// The engagement IS a Geneva engagement: the rocker angle equals the heading
// from P to the pin, atan2(-a*sin x, H - a*cos x) = atan2(-s*sin x, 1 - s*cos x)
// with s = a/H and x the pin's deviation from top — the same form as
// genevaStarAngle. Choosing a/H = sin(amp) makes the rocker reach exactly ±amp
// with zero velocity at the slot exit (soft entry/exit), so the dwell fraction
// (= 2*amp/PI) follows from the amplitude rather than being a free knob.
//
// pin 1 (front wheel, CCW) crests at theta = PI/2, sweeping the rocker +amp->-amp;
// pin 2 (back wheel, CW) crests at theta = 3*PI/2, sweeping it -amp->+amp.
// Returns { angle, engaged, pin } with pin 1, 2, or 0 (dwell).
export function doubleGenevaRocker(theta, amp) {
  const s = Math.sin(amp); // a / H, the crank ratio
  const gammaP = Math.PI / 2 - amp; // engagement half-window (the slot is filled)
  const ph = mod(theta, TAU);
  const x1 = ph - Math.PI / 2; // pin 1 deviation from the top of its orbit
  const x2 = ph - (3 * Math.PI) / 2; // pin 2 deviation from the top of its orbit

  if (Math.abs(x1) <= gammaP) {
    return { angle: Math.atan2(-s * Math.sin(x1), 1 - s * Math.cos(x1)), engaged: true, pin: 1 };
  }
  if (Math.abs(x2) <= gammaP) {
    return { angle: Math.atan2(s * Math.sin(x2), 1 - s * Math.cos(x2)), engaged: true, pin: 2 };
  }
  // dwell, held at the extreme last reached: -amp between the two pushes, +amp around the wrap
  if (ph > Math.PI / 2 + gammaP && ph < (3 * Math.PI) / 2 - gammaP) {
    return { angle: -amp, engaged: false, pin: 0 };
  }
  return { angle: amp, engaged: false, pin: 0 };
}

// ---------------------------------------------------------------------------
// Spur gear train
// ---------------------------------------------------------------------------
// Gears in a chain, each meshing with the previous one. With equal module the
// center distance is (z_a + z_b) * module / 2 and the speed ratio telescopes:
//   omega_i / omega_0 = (-1)^i * z_0 / z_i
// (alternating direction down the chain). `phaseFor` returns the static
// rotation each gear needs so a tooth of one sits in a space of its neighbour.

// Angular position within a gear's tooth pitch, 0 = tooth centre, 0.5 = gap
// centre, for the gear (rotated by `phase`) pointing in world direction `dir`.
export function toothPhaseAt(phase, dir, teeth) {
  const pitch = TAU / teeth;
  return mod(dir - phase, pitch) / pitch;
}

// Returns the array of static phase offsets (radians) for a list of teeth
// counts, assuming centers are colinear along +x (each gear is +x of the prev).
export function spurTrainPhases(teethList) {
  const phases = [0];
  for (let i = 1; i < teethList.length; i++) {
    const pitch = TAU / teethList[i];
    // What does the previous gear present toward this one (+x direction)?
    const prev = toothPhaseAt(phases[i - 1], 0, teethList[i - 1]);
    // We want the complement (tooth<->gap) facing back (-x, i.e. angle PI).
    const target = mod(0.5 - prev, 1);
    phases.push(Math.PI - target * pitch);
  }
  return phases;
}

// Angle of gear i at driver angle theta0 (the first gear's angle).
export function spurGearAngle(i, theta0, teethList, phases) {
  const ratio = (i % 2 === 0 ? 1 : -1) * (teethList[0] / teethList[i]);
  return phases[i] + ratio * theta0;
}

// ---------------------------------------------------------------------------
// Internal gear pair
// ---------------------------------------------------------------------------
// A pinion (external, driver) meshes inside a ring (internal, driven). Unlike
// an external pair the two turn in the SAME direction, and tooth counts give
//   omega_ring / omega_pinion = z_pinion / z_ring
// (the ring turns slower). The centre distance is (z_ring - z_pinion)*module/2.
export function internalGearRatio(zPinion, zRing) {
  if (zRing <= 0) return 0; // guard: avoid Infinity/NaN on a degenerate ring
  return zPinion / zRing;
}

// ---------------------------------------------------------------------------
// Planetary (epicyclic) gearset
// ---------------------------------------------------------------------------
// A sun (external), N planets (external) and a ring (internal), with the planets
// carried on a rotating carrier. With equal module the ring has
//   zRing = zSun + 2*zPlanet
// and the planet centres orbit at radius (zSun + zPlanet)*module/2. The motion
// obeys the fundamental train equation (carrier as reference frame):
//   (w_sun - w_carrier) / (w_ring - w_carrier) = -zRing / zSun
//
// `fixed` holds one member; the natural input is driven by `theta`:
//   'ring'    -> sun is the input,     carrier the output (classic reduction)
//   'carrier' -> sun is the input,     ring the output (direction reverses)
//   'sun'     -> carrier is the input, ring the output
// Returns absolute angles { sun, ring, carrier, planetSpin, zRing }, where
// planetSpin is a planet's rotation about its own axis in the world frame.
export function planetaryAngles(theta, zSun, zPlanet, fixed = 'ring') {
  zSun = Math.max(1, zSun); // guards: keep the train-equation denominators finite
  zPlanet = Math.max(1, zPlanet);
  const zRing = zSun + 2 * zPlanet;
  let sun;
  let ring;
  let carrier;
  if (fixed === 'ring') {
    ring = 0;
    sun = theta;
    carrier = (theta * zSun) / (zSun + zRing);
  } else if (fixed === 'carrier') {
    carrier = 0;
    sun = theta;
    ring = (-theta * zSun) / zRing;
  } else {
    // sun fixed; the carrier is the input
    sun = 0;
    carrier = theta;
    ring = (theta * (zSun + zRing)) / zRing;
  }
  // planet spin about its own centre: (wp - wc)/(ws - wc) = -zSun/zPlanet
  const planetSpin = carrier - (zSun / zPlanet) * (sun - carrier);
  return { sun, ring, carrier, planetSpin, zRing };
}

// Equal-spaced planets all mesh only if this is an integer (assembly condition).
export function planetaryAssembly(zSun, zRing, nPlanets) {
  return (zSun + zRing) / nPlanets;
}

// ---------------------------------------------------------------------------
// Bevel gear pair (intersecting shafts)
// ---------------------------------------------------------------------------
// Two gears on shafts that meet at angle `shaft` (default 90 deg). Each gear's
// pitch cone half-angle satisfies tan(gammaA) = sin(shaft)/(zB/zA + cos(shaft)),
// and gammaA + gammaB = shaft. The speed ratio is the usual omega_B/omega_A =
// zA/zB (the gears counter-rotate about their own axes).
export function bevelConeAngles(zA, zB, shaft = Math.PI / 2) {
  zA = Math.max(1, zA); // guards: nonzero tooth counts so the ratio/cone are finite
  zB = Math.max(1, zB);
  const gammaA = Math.atan2(Math.sin(shaft), zB / zA + Math.cos(shaft));
  return { gammaA, gammaB: shaft - gammaA, ratio: zA / zB };
}

// ---------------------------------------------------------------------------
// SATOR square — per-tile behaviors (planned mode; see docs/sator-square.md)
// ---------------------------------------------------------------------------
// The board (carrier) turns by Phi; a tile's absolute orientation in the wall
// frame is  absolute = Phi + psi,  where psi is the tile's rotation relative to
// the board (what these helpers return). The square reads upright again at every
// Phi = k*90deg, which requires absolute ≡ 0 (mod 2*PI) at those Phi — i.e.
// absolute = N*Phi with N a multiple of 4. These are the closed forms the gear
// realizations (planetary for spin, idler/ring for upright, double-Geneva for
// the O flip) are built to reproduce.

// Always-upright idler: the tile orbits with the board but holds its orientation
// (absolute = 0), so relative to the board psi = -Phi.
export function alwaysUprightAngle(phi) {
  return -phi;
}

// Spin tile: turns N full revolutions per board revolution, passing through
// upright exactly at each 90deg detent (N must be a multiple of 4). Absolute is
// N*Phi, so relative to the board psi = (N - 1)*Phi.
export function spinAngle(phi, n = 4) {
  return (n - 1) * phi;
}

// Gear ratio zSun/zPlanet for the fixed-sun planetary that realizes an N-spin
// tile: planetaryAngles(...,'sun').planetSpin = Phi*(1 + zSun/zPlanet), and we
// want that = N*Phi, so zSun/zPlanet = N - 1 (e.g. N = 4 -> 3, zSun=36/zPlanet=12).
export function spinSunPlanetRatio(n = 4) {
  return n - 1;
}

// O flip: dwells upright (0), toggles to inverted (PI) and back, driven by the
// double-Geneva with dwell targets {0, PI}. A symmetric letter (O) reads the
// same at 0 and PI, so it stays legible at both dwells. This is the pure toggle;
// see satorTileAngle for the composed tile motion.
export function flipAngle(theta, pushFrac = 0.62) {
  return doubleGenevaOutput(theta, 0, pushFrac, { lo: 0, hi: Math.PI }).angle;
}

// Quarter-turn detents: returns true when the board angle phi is within `tol`
// of a k*90deg detent (where the square must read upright).
export function atQuarterDetent(phi, tol = 1e-9) {
  const q = Math.PI / 2;
  const r = mod(phi, q);
  return Math.min(r, q - r) <= tol;
}

// Index/click tile: a single-Geneva-style stepped spin. The tile winds `n` full
// turns per board revolution (like the smooth spin) but in discrete clicks —
// `clicks` clicks per tile-turn, so each click is 360/clicks (4 -> quarter-turn
// clicks, 8 -> eighth-turn), eased with a soft push-then-dwell. Returns the
// ABSOLUTE orientation (Φ + ψ). Legibility is emergent, not hard-coded: the tile
// reads upright at every 90° detent only when `n` is a multiple of 4 (see
// indexUpright) — the same rule as the smooth spin — so any (clicks, n) can be
// dialed in and watched succeed or fail.
export function indexAbsolute(phi, n, clicks, pushFrac = 0.5) {
  const total = Math.max(1, Math.round(n * clicks)); // clicks per board revolution
  const step = (n * TAU) / total; // orientation gained per click (= TAU / clicks)
  const interval = TAU / total; // board angle per click
  const p = mod(phi, TAU);
  const i = Math.floor(p / interval);
  const frac = (p - i * interval) / interval; // 0..1 within the current click
  const w = clamp(pushFrac, 0.05, 1);
  const ease = frac < w ? smootherstep(frac / w) : 1; // push, then dwell
  return (i + ease) * step;
}

// Whether an n-turn index/spin tile reads upright at every 90° detent.
export function indexUpright(n) {
  return mod(n, 4) === 0;
}

// SATOR O-flip drive (geared double-Geneva). The O is NOT anti-rotated — it rides
// the board — so its only correction is a small rock. A double-Geneva "cross" rocks
// ±amp (default ±22.5°), dwelling at each detent (theta = 2·Φ lands the dwells on
// the 90° detents); an R:1 step-up gear turns that into a 0..90° rock of the tile
// relative to the board. The ratio is not free: R = π/(4·amp), so a SMALLER cross
// swing just needs a TALLER step-up to still produce the same 90° tile rock — that
// 90° is the legibility invariant (combined with the board's own 90°/detent, the O
// reads as a 180° flip-and-hold, upright or inverted, both legible for a symmetric
// O). amp = π/8 → R = 2 is the classic case; the drive exposes amp via its ratio.
export function satorFlipStar(phi, amp = Math.PI / 8) {
  return doubleGenevaRocker(2 * phi, amp).angle; // the driven cross, ±amp (default ±22.5°)
}
export function satorFlipRock(phi, amp = Math.PI / 8) {
  // tile = R:1 gear up from the cross (opposite sign), offset to rock 0..90°:
  //   the cross dwells at +amp at the even detents -> tile 0°;  -amp at the odd -> tile 90°.
  // R = π/(4·amp) keeps the tile swing EXACTLY 90° (2·R·amp = π/2) for ANY amp, so the O still
  // reads upright at every 90° detent — the legibility invariant that pins amp to the ratio.
  // amp = π/8 → R = 2 (the classic 2:1), recovering the original byte-for-byte.
  const R = Math.PI / (4 * amp);
  return Math.PI / 4 - R * satorFlipStar(phi, amp);
}

// SATOR O-flip drive — the reciprocating double-Geneva ENGAGEMENT (the "Maltese math").
// The cross (centred on O_c, output gear coaxial) is rocked ±amp by TWO meshed, counter-
// rotating driver gears, each carrying one crank pin. The KEY fact: each pin/slot pairing
// is a genuine external-Geneva engagement. With the driver centre OFFSET a distance c from
// the cross and the crank radius a = c·sin(amp), the pin rides the slot centreline EXACTLY
// and the cross reaches ±amp with zero angular velocity (soft entry/exit) — the very same
// atan2 law as genevaStarAngle / doubleGenevaRocker, just with the cross (not a rocker) as
// the slotted body. The two pins orbit DIFFERENT centres D1,D2 = (∓rd, −H) so the two gears
// truly mesh and counter-rotate; the slots they enter face the drivers, at rest angles
// σ = dir(O_c→D_i). Pin 1 (the CCW gear) rocks the cross +amp→−amp; pin 2 (the CW gear)
// rocks it −amp→+amp — reciprocation, not indexing (each is the other's mirror across the
// vertical, so their pushes cancel back and forth). The cross output is satorFlipStar, so
// the O-flip stays exact; this geometry is what makes that motion a PROVEN pin-in-slot drive
// rather than a scripted angle. See the standalone genevaStarAngle for the single-pin template.

// Static geometry of the drive. The drivers MESH (centres 2·rd apart) AND sit a distance c
// from the cross so the slot mouth lands on the cross rim at pin entry — that pins H (the
// drivers' depth below the cross), it is not free. Returns the crank radius, the two slot
// rest angles, and the two cam-pocket angles (a cam on D_i nests in pocket_i during the
// dwell that precedes pin_i's push, blocking the cross — the genevaStarAngle lock, per pin).
export function satorDriveGeometry(rim, rd, amp = Math.PI / 8) {
  rim = Math.max(rim, 1e-6); // guard: a degenerate rim collapses the engagement
  const c = rim / Math.cos(amp); // driver distance: at entry the slot mouth sits on the rim
  const H = Math.sqrt(Math.max(0, c * c - rd * rd)); // drivers 2·rd apart (meshed) at distance c
  const a = c * Math.sin(amp); // crank radius → a/c = sin(amp): exact ±amp rock, soft in/out
  const sigmaA = Math.atan2(-H, -rd); // slot A rest (points toward D1, down-left)
  const sigmaB = Math.atan2(-H, rd); // slot B rest (points toward D2, down-right)
  return {
    c, a, H, rd, amp, sigmaA, sigmaB,
    slotBottom: c * (1 - Math.sin(amp)), // deepest pin reach from O_c
    mouth: rim, // slot mouth radius (= rim) where the pin enters
    pocketA: sigmaA - amp, // cam-A pocket: nests on D1 at the +amp dwell
    pocketB: sigmaB + amp, // cam-B pocket: nests on D2 at the −amp dwell
    D1: [-rd, -H], D2: [rd, -H],
  };
}

// Angle of driver gear `which` (1 or 2) at board angle φ. The meshed gears turn ±2·φ — two
// revolutions per board revolution, giving 4 pushes/board (one per 90° detent) — and the pin
// is mounted at the phase that puts it on its slot centreline exactly when pin `which` drives.
export function satorDriverAngle(phi, which, geom) {
  const sign = which === 1 ? 1 : -1;
  const sigma = which === 1 ? geom.sigmaA : geom.sigmaB;
  return sign * 2 * phi + sigma + Math.PI / 2;
}

// Drive state at board angle φ: the cross rock (≡ satorFlipStar), which crank pin is engaged
// (1, 2, or 0 during dwell), and BOTH crank pins' world positions — so the render places the
// pins (provably on the engaged slot's centreline) and tests can verify it.
export function satorDrivePins(phi, geom) {
  const r = doubleGenevaRocker(2 * phi, geom.amp); // the proven rock: ±amp, dwell, reciprocating
  const t1 = satorDriverAngle(phi, 1, geom);
  const t2 = satorDriverAngle(phi, 2, geom);
  return {
    cross: r.angle, engaged: r.engaged, pin: r.pin,
    theta1: t1, theta2: t2,
    pos1: [geom.D1[0] + geom.a * Math.cos(t1), geom.D1[1] + geom.a * Math.sin(t1)],
    pos2: [geom.D2[0] + geom.a * Math.cos(t2), geom.D2[1] + geom.a * Math.sin(t2)],
  };
}

// Locking-cam geometry. Each driver carries a disc (radius camR) on its own axis with ONE
// wedge GAP centred on its crank pin — i.e. at gear-local angle 0, since the pin mounts at
// local (a, 0), so the gap tracks the pin as the gear turns. The gap half-angle is
// gamma·gapFrac with gamma = π/2 − amp the engagement half-window. That is the whole trick:
//   • gapHalf < gamma  → during each dwell the solid still covers the toward-O_c pocket
//     contact (which sits gamma..(gamma+amp) ≈ 67.5°–112.5° off the pin), so the disc nests
//     in the cross pocket and BLOCKS the (stationary) cross — both dwells lock 100%;
//   • gapHalf ≥ the slot-mouth half-angle → the gap clears the slot channel through the whole
//     push, so the moving cross is never fouled.
// A cam centred on the line of centres instead (gap not on the pin) leaves a dwell unlocked.
// Pure — the render feeds thetaStart/thetaLength straight into a CylinderGeometry sweep.
export function satorCamGeometry(geom, gapFrac = 0.6) {
  const gamma = Math.PI / 2 - geom.amp; // engagement half-window
  const gapHalf = gamma * gapFrac; // gap half-angle, centred on the pin
  const pocketR = geom.mouth - (geom.mouth - geom.slotBottom) * 0.55; // pocket dip radius
  const camR = Math.max(geom.c - pocketR, geom.rd * 0.4); // disc inner edge kisses the pocket bottom
  return {
    gamma, gapHalf, pocketR, camR,
    thetaStart: gapHalf, // solid sweeps [gapHalf, TAU−gapHalf] so the GAP is centred on local 0
    thetaLength: TAU - 2 * gapHalf, // (= the pin direction, since the pin is at local (a,0))
    locksAtPlus: 1, // cam on D1 locks the +amp dwell (its pocketA lands on D1 there)
    locksAtMinus: 2, // cam on D2 locks the −amp dwell (its pocketB lands on D2 there)
  };
}

// Per-cell behavior dispatcher: maps a tile behavior to its psi(Phi) — the
// rotation relative to the board, for rendering. The gear network (planetary /
// idler-ring / double-Geneva) is the printable realization of these forms.
//   'fixed'   on-axis hub tile (centre N): held in the wall frame -> psi = -Phi
//   'upright' orbits to a new cell but holds orientation          -> psi = -Phi
//   'spin'    N full turns per board turn (params.n, mult of 4)    -> psi = (N-1)Phi
//   'index'   spin in discrete clicks: params.clicks per tile-turn, params.n
//             turns per board turn (reads upright at the detents iff n mult of 4)
//   'flip'    O tiles: NOT anti-rotated — the O rides the board and a 2:1-geared
//             double-Geneva rocks it 0..90deg (board frame), which with the
//             board's own 90deg/detent reads as a 180deg flip-and-hold (upright
//             or inverted, both legible for a symmetric O). See satorFlipRock.
export function satorTileAngle(behavior, phi, params = {}) {
  switch (behavior) {
    case 'fixed':
    case 'upright':
      return alwaysUprightAngle(phi);
    case 'spin':
      return spinAngle(phi, params.n ?? 4);
    case 'index': // single-Geneva stepped spin; psi = absolute - board angle
      return indexAbsolute(phi, params.n ?? 4, params.clicks ?? 4, params.pushFrac ?? 0.5) - phi;
    case 'flip': // O rides the board; the geared double-Geneva rocks it 0..90° (board frame).
      // params.amp = π/(4·ratio) keeps the tile-side rock in lockstep with the rendered drive's
      // cross (same amp), so the O-gear and output-gear teeth stay meshed; default π/8 (ratio 2).
      return satorFlipRock(phi, params.amp ?? Math.PI / 8);
    default:
      throw new Error(`unknown SATOR tile behavior: ${behavior}`);
  }
}

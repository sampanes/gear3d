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
// current push (for visuals).
export function doubleGenevaOutput(theta, amp, pushFrac = 0.62) {
  const w = clamp(pushFrac, 0.05, 1) * Math.PI; // push duration in driver radians
  const ph = mod(theta, TAU);

  if (ph < w) {
    // wheel 1 drives the lever from -amp up to +amp
    const t = smootherstep(ph / w);
    return { angle: -amp + 2 * amp * t, active: 1, drive: ph / w };
  }
  if (ph < Math.PI) {
    return { angle: amp, active: 0, drive: 0 }; // dwell at +amp
  }
  if (ph < Math.PI + w) {
    // wheel 2 drives the lever from +amp back down to -amp
    const t = smootherstep((ph - Math.PI) / w);
    return { angle: amp - 2 * amp * t, active: 2, drive: (ph - Math.PI) / w };
  }
  return { angle: -amp, active: 0, drive: 0 }; // dwell at -amp
}

// Pin offset (added to the shared wheel angle) that puts a wheel's pin at the
// top of its orbit — nearest the output lever — at the midpoint of its push.
// Wheel 1 pushes in [0, w], wheel 2 (180 deg later) in [PI, PI+w].
export function doubleGenevaPinOffset(pushFrac = 0.62) {
  const w = clamp(pushFrac, 0.05, 1) * Math.PI;
  return Math.PI / 2 - w / 2;
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
  const gammaA = Math.atan2(Math.sin(shaft), zB / zA + Math.cos(shaft));
  return { gammaA, gammaB: shaft - gammaA, ratio: zA / zB };
}

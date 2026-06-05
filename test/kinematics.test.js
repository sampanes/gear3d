// Unit tests for the pure motion math (src/kinematics.js).
// These encode the mechanism theory and act as regression guards for the
// adversarial-review fixes — most notably the Geneva counter-rotation sign.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TAU, mod } from '../src/math.js';
import {
  genevaGeometry,
  genevaStarAngle,
  doubleGenevaOutput,
  doubleGenevaPinOffset,
  doubleGenevaRocker,
  spurTrainPhases,
  spurGearAngle,
  internalGearRatio,
  planetaryAngles,
  planetaryAssembly,
  bevelConeAngles,
  alwaysUprightAngle,
  spinAngle,
  spinSunPlanetRatio,
  flipAngle,
  atQuarterDetent,
  indexAbsolute,
  indexUpright,
  satorFlipStar,
  satorFlipRock,
  satorTileAngle,
  satorDriveGeometry,
  satorDriverAngle,
  satorDrivePins,
  satorCamGeometry,
} from '../src/kinematics.js';

const near = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} !~= ${b}`);

// ---------------------------------------------------------------------------
// Geneva drive
// ---------------------------------------------------------------------------
test('genevaGeometry uses the standard relations', () => {
  for (const n of [3, 4, 6, 8]) {
    const g = genevaGeometry(n);
    near(g.beta, Math.PI / n);
    near(g.gamma, Math.PI / 2 - Math.PI / n);
    near(g.crankRatio, Math.sin(Math.PI / n));
    near(g.rimRatio, Math.cos(Math.PI / n));
    near(g.slotBottomRatio, 1 - Math.sin(Math.PI / n));
  }
});

test('Geneva: at the engagement centre the star is at its station, engaged', () => {
  const r = genevaStarAngle(0, 4);
  near(r.angle, 0);
  assert.equal(r.engaged, true);
});

test('Geneva: star COUNTER-rotates (CW) for a CCW driver — regression for the sign fix', () => {
  // Just after the engagement centre the star angle must be negative (CW),
  // because an external Geneva counter-rotates. The pre-fix bug made it +.
  const small = genevaStarAngle(0.1, 4);
  assert.ok(small.angle < 0, `star angle ${small.angle} should be negative (CW)`);
});

test('Geneva: pin stays exactly on the slot centerline through engagement (HIGH-bug regression)', () => {
  // Transform the world pin position into the star-local frame using the
  // computed star angle; it must remain on slot 0's centerline (local +/-PI)
  // for the whole engagement window, radius sweeping bottom -> rim.
  for (const n of [3, 4, 5, 6]) {
    const c = 1;
    const { gamma, crankRatio: a, slotBottomRatio, rimRatio } = genevaGeometry(n);
    let maxOff = 0;
    let minR = Infinity;
    let maxR = -Infinity;
    for (let i = 0; i <= 400; i++) {
      const theta = -gamma + (2 * gamma) * (i / 400);
      const ang = genevaStarAngle(theta, n).angle;
      const px = a * Math.cos(theta);
      const py = a * Math.sin(theta);
      const dx = px - c;
      const dy = py;
      const lx = dx * Math.cos(-ang) - dy * Math.sin(-ang);
      const ly = dx * Math.sin(-ang) + dy * Math.cos(-ang);
      const off = Math.min(Math.abs(Math.atan2(ly, lx) - Math.PI), Math.abs(Math.atan2(ly, lx) + Math.PI));
      maxOff = Math.max(maxOff, off);
      const rr = Math.hypot(lx, ly);
      minR = Math.min(minR, rr);
      maxR = Math.max(maxR, rr);
    }
    assert.ok(maxOff < 1e-9, `n=${n}: pin drifts ${maxOff} off the slot centerline`);
    near(minR, slotBottomRatio, 1e-6, `n=${n} slot-bottom`);
    near(maxR, rimRatio, 1e-6, `n=${n} rim`);
  }
});

test('Geneva: indexes exactly one station (-2*beta) per driver revolution', () => {
  for (const n of [3, 4, 6]) {
    const { beta } = genevaGeometry(n);
    near(genevaStarAngle(TAU, n).angle, -2 * beta, 1e-9, `n=${n} one rev`);
    near(genevaStarAngle(n * TAU, n).angle, -TAU, 1e-9, `n=${n} full turn after n revs`);
  }
});

test('Geneva: angle is continuous (value) at the engage/dwell boundary and across cycles', () => {
  const n = 5;
  const { gamma } = genevaGeometry(n);
  const eps = 1e-7;
  // engage -> dwell at +gamma
  near(genevaStarAngle(gamma - eps, n).angle, genevaStarAngle(gamma + eps, n).angle, 1e-6, 'at +gamma');
  // dwell on both sides of the cycle boundary at theta = PI
  near(genevaStarAngle(Math.PI - eps, n).angle, genevaStarAngle(Math.PI + eps, n).angle, 1e-6, 'at PI');
});

test('Geneva: dwell outside the engagement window (not engaged)', () => {
  const n = 4;
  const { gamma } = genevaGeometry(n);
  assert.equal(genevaStarAngle(gamma + 0.05, n).engaged, false);
  assert.equal(genevaStarAngle(Math.PI, n).engaged, false);
});

// ---------------------------------------------------------------------------
// Double-Geneva oscillator
// ---------------------------------------------------------------------------
test('double-Geneva: toggles between -amp and +amp at the segment ends', () => {
  const amp = 0.6;
  const pf = 0.62;
  const w = pf * Math.PI; // push duration; dwell A is [w, PI], dwell B is [PI+w, TAU]
  near(doubleGenevaOutput(0, amp, pf).angle, -amp, 1e-9, 'start');
  near(doubleGenevaOutput(w, amp, pf).angle, amp, 1e-9, 'end of push A = +amp');
  near(doubleGenevaOutput((w + Math.PI) / 2, amp, pf).angle, amp, 1e-9, 'dwell at +amp');
  near(doubleGenevaOutput(Math.PI + w, amp, pf).angle, -amp, 1e-9, 'end of push B = -amp');
  near(doubleGenevaOutput((Math.PI + w + TAU) / 2, amp, pf).angle, -amp, 1e-9, 'dwell at -amp');
});

test('double-Geneva: push A goes -amp->+amp, push B goes +amp->-amp (toggle, not ratchet)', () => {
  const amp = 0.5;
  const w = 0.62 * Math.PI;
  // push A is increasing
  assert.ok(doubleGenevaOutput(0.1 * w, amp).angle < doubleGenevaOutput(0.9 * w, amp).angle);
  // push B is decreasing
  assert.ok(
    doubleGenevaOutput(Math.PI + 0.1 * w, amp).angle > doubleGenevaOutput(Math.PI + 0.9 * w, amp).angle
  );
});

test('double-Geneva: output is continuous across all four segment boundaries (incl. wrap)', () => {
  const amp = 0.4;
  const pf = 0.62;
  const w = pf * Math.PI;
  const eps = 1e-7;
  const at = (t) => doubleGenevaOutput(t, amp, pf).angle;
  near(at(w - eps), at(w + eps), 1e-5, 'end of push A');
  near(at(Math.PI - eps), at(Math.PI + eps), 1e-5, 'start of push B');
  near(at(Math.PI + w - eps), at(Math.PI + w + eps), 1e-5, 'end of push B');
  near(at(TAU - eps), at(eps), 1e-5, 'wrap at 2*PI');
});

test('double-Geneva: eases into each dwell with ~zero velocity (smootherstep)', () => {
  const amp = 0.5;
  const pf = 0.62;
  const w = pf * Math.PI;
  const h = 1e-5;
  const at = (t) => doubleGenevaOutput(t, amp, pf).angle;
  const vEndA = (at(w) - at(w - h)) / h; // velocity entering dwell at +amp
  assert.ok(Math.abs(vEndA) < 1e-2, `velocity into dwell ${vEndA} not ~0`);
});

test('double-Geneva: pin offset puts the pin at the top of orbit (PI/2) mid-push', () => {
  const pf = 0.62;
  const w = pf * Math.PI;
  const off = doubleGenevaPinOffset(pf);
  near(off, Math.PI / 2 - w / 2);
  // wheel angle = driverTheta + offset; at the middle of push A (theta=w/2) -> PI/2
  near((w / 2) + off, Math.PI / 2, 1e-12, 'pin crests at push midpoint');
});

test('doubleGenevaRocker: geometric pin-in-slot drive toggles ±amp through 0 at each pin crest', () => {
  const amp = 0.6;
  const gp = Math.PI / 2 - amp;
  const R = (t) => doubleGenevaRocker(t, amp);
  near(R(Math.PI / 2 - gp).angle, amp, 1e-9, 'push 1 start = +amp');
  near(R(Math.PI / 2).angle, 0, 1e-9, 'push 1 mid (pin 1 at top) = 0');
  near(R(Math.PI / 2 + gp).angle, -amp, 1e-9, 'push 1 end = -amp');
  near(R((3 * Math.PI) / 2 - gp).angle, -amp, 1e-9, 'push 2 start = -amp');
  near(R((3 * Math.PI) / 2).angle, 0, 1e-9, 'push 2 mid (pin 2 at top) = 0');
  near(R((3 * Math.PI) / 2 + gp).angle, amp, 1e-9, 'push 2 end = +amp');
  near(R(Math.PI).angle, -amp, 1e-9, 'dwell at -amp between pushes');
  near(R(0).angle, amp, 1e-9, 'dwell at +amp around the wrap');
  assert.equal(R(Math.PI / 2).pin, 1, 'pin 1 drives push 1');
  assert.equal(R((3 * Math.PI) / 2).pin, 2, 'pin 2 drives push 2');
  assert.equal(R(Math.PI).engaged, false, 'dwell is disengaged');
});

test('doubleGenevaRocker: continuous everywhere and eases into each dwell with ~zero velocity', () => {
  const amp = 0.5;
  const gp = Math.PI / 2 - amp;
  const at = (t) => doubleGenevaRocker(t, amp).angle;
  const eps = 1e-7;
  near(at(Math.PI / 2 + gp - eps), at(Math.PI / 2 + gp + eps), 1e-5, 'push 1 end');
  near(at((3 * Math.PI) / 2 - gp - eps), at((3 * Math.PI) / 2 - gp + eps), 1e-5, 'push 2 start');
  near(at((3 * Math.PI) / 2 + gp - eps), at((3 * Math.PI) / 2 + gp + eps), 1e-5, 'push 2 end');
  near(at(TAU - eps), at(eps), 1e-5, 'wrap');
  const h = 1e-5;
  const v = (at(Math.PI / 2 + gp) - at(Math.PI / 2 + gp - h)) / h; // velocity into the -amp dwell
  assert.ok(Math.abs(v) < 1e-2, `velocity into dwell ${v} not ~0 (soft Geneva exit)`);
});

test('doubleGenevaRocker: the engaged pin rides exactly on the slot centerline (true slot)', () => {
  // pivot P=(0,H) above the orbit; a/H = sin(amp). The rocker tracks the pin, so
  // transformed into the rocker frame the pin must lie on the slot axis (x'=0).
  const amp = 0.7;
  const H = 1;
  const a = Math.sin(amp); // a/H = sin(amp)
  for (let i = 0; i <= 240; i++) {
    const theta = (i / 240) * TAU;
    const r = doubleGenevaRocker(theta, amp);
    if (!r.engaged) continue;
    const px = a * Math.cos(theta); // both pins share x = a cos(theta)
    const py = a * (r.pin === 1 ? Math.sin(theta) : -Math.sin(theta));
    const dx = px;
    const dy = py - H;
    const lx = dx * Math.cos(r.angle) + dy * Math.sin(r.angle); // rocker-local x (slot runs along -y')
    assert.ok(Math.abs(lx) < 1e-9, `theta=${theta.toFixed(3)} pin ${r.pin} off centerline by ${lx}`);
  }
});

// ---------------------------------------------------------------------------
// Spur train
// ---------------------------------------------------------------------------
test('spurGearAngle implements omega_i/omega_0 = (-1)^i * z0/zi', () => {
  const teeth = [12, 24, 18, 15];
  const phases = spurTrainPhases(teeth);
  const theta = 1.3;
  for (let i = 0; i < teeth.length; i++) {
    const ratio = (i % 2 === 0 ? 1 : -1) * (teeth[0] / teeth[i]);
    near(spurGearAngle(i, theta, teeth, phases) - phases[i], ratio * theta, 1e-12, `gear ${i}`);
  }
  // adjacent gears spin in opposite directions
  assert.ok(Math.sign(spurGearAngle(1, theta, teeth, phases) - phases[1]) !== Math.sign(theta));
});

// the static tooth-in-gap phase, recomputed locally (matches kinematics.toothPhaseAt)
function toothPhaseAt(phase, dir, teeth) {
  const pitch = TAU / teeth;
  return mod(dir - phase, pitch) / pitch;
}

test('spur train: teeth interlock (tooth-in-gap) and the interlock is PRESERVED under rotation', () => {
  const cases = [
    [12, 24],
    [13, 17], // odd/odd
    [12, 25], // even/odd
    [12, 24, 18],
    [20, 11, 30, 15],
  ];
  for (const teeth of cases) {
    const phases = spurTrainPhases(teeth);
    for (let i = 0; i + 1 < teeth.length; i++) {
      // contact: gear i presents toward +x (dir 0), gear i+1 toward -x (dir PI)
      // The gears counter-rotate, so the meshing invariant is the SUM of the two
      // contact-facing tooth phases (its rate cancels exactly); tooth-in-gap = 0.5.
      const phaseSum = (theta) => {
        const ai = spurGearAngle(i, theta, teeth, phases);
        const aj = spurGearAngle(i + 1, theta, teeth, phases);
        const pa = toothPhaseAt(ai, 0, teeth[i]); // gear i facing +x
        const pb = toothPhaseAt(aj, Math.PI, teeth[i + 1]); // gear i+1 facing -x
        return mod(pa + pb, 1);
      };
      // tooth-of-one in gap-of-other at rest -> sum = 0.5
      assert.ok(Math.abs(phaseSum(0) - 0.5) < 1e-9, `pair ${i}: static interlock ${phaseSum(0)} != 0.5`);
      // and conjugate motion keeps it interlocked at every angle
      for (const theta of [0.2, 0.75, 1.9, 3.6, 5.5]) {
        assert.ok(Math.abs(phaseSum(theta) - 0.5) < 1e-9, `pair ${i}: interlock drifts at theta=${theta}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Internal gear pair
// ---------------------------------------------------------------------------
test('internalGearRatio: ring turns slower by z_pinion/z_ring, same direction', () => {
  near(internalGearRatio(12, 48), 0.25);
  near(internalGearRatio(20, 60), 1 / 3);
  // same sign as the pinion (positive) -> same direction, and |ratio| < 1
  assert.ok(internalGearRatio(12, 48) > 0 && internalGearRatio(12, 48) < 1);
});

// ---------------------------------------------------------------------------
// Planetary gearset
// ---------------------------------------------------------------------------
test('planetaryAngles satisfies the fundamental train equation for each fixed member', () => {
  const zS = 12;
  const zP = 12;
  const zR = zS + 2 * zP;
  const theta = 1.0;
  for (const fixed of ['ring', 'carrier', 'sun']) {
    const a = planetaryAngles(theta, zS, zP, fixed);
    assert.equal(a.zRing, zR);
    near(a[fixed], 0, 1e-12, `${fixed} member is held at 0`);
    // (w_sun - w_carrier) / (w_ring - w_carrier) = -zRing / zSun
    near((a.sun - a.carrier) / (a.ring - a.carrier), -zR / zS, 1e-9, `train eqn (${fixed})`);
    // planet spin about its own axis: (wp - wc) / (ws - wc) = -zSun / zPlanet
    near((a.planetSpin - a.carrier) / (a.sun - a.carrier), -zS / zP, 1e-9, `planet spin (${fixed})`);
  }
});

test('planetaryAngles: ring-fixed reduction ratio is sun:carrier = (zS+zR):zS', () => {
  const zS = 12;
  const zP = 18;
  const zR = zS + 2 * zP; // 48
  const a = planetaryAngles(1, zS, zP, 'ring');
  near(a.ring, 0);
  near(a.sun, 1);
  near(a.carrier, zS / (zS + zR)); // 12 / 60 = 0.2 -> 5:1 reduction
});

test('planetaryAssembly: integer exactly when planets are equally spaceable', () => {
  assert.ok(Number.isInteger(planetaryAssembly(12, 36, 3))); // 48/3 = 16
  assert.ok(Number.isInteger(planetaryAssembly(12, 36, 4))); // 48/4 = 12
  assert.ok(!Number.isInteger(planetaryAssembly(12, 36, 5))); // 48/5
});

// ---------------------------------------------------------------------------
// Bevel pair
// ---------------------------------------------------------------------------
test('bevelConeAngles: half-angles sum to the shaft angle; ratio = zA/zB', () => {
  // miter pair (equal teeth) -> 45 + 45
  const mit = bevelConeAngles(20, 20, Math.PI / 2);
  near(mit.gammaA, Math.PI / 4);
  near(mit.gammaB, Math.PI / 4);
  near(mit.ratio, 1);
  // unequal pair on a 90-degree shaft
  const b = bevelConeAngles(16, 24, Math.PI / 2);
  near(b.gammaA + b.gammaB, Math.PI / 2, 1e-9, 'cone half-angles sum to shaft angle');
  near(Math.tan(b.gammaA), 16 / 24, 1e-9, 'tan(gammaA) = zA/zB at 90 deg');
  near(b.ratio, 16 / 24);
  assert.ok(b.gammaA < b.gammaB, 'the smaller gear has the smaller cone angle');
});

test('kinematics guards: degenerate inputs are clamped, never Infinity/NaN', () => {
  // Geneva n < 3 collapses the engagement window → clamp up to 3
  near(genevaGeometry(2).beta, Math.PI / 3, 1e-12, 'n=2 clamps to 3');
  near(genevaGeometry(1).gamma, Math.PI / 2 - Math.PI / 3, 1e-12, 'n=1 clamps to 3, gamma > 0');
  assert.ok(genevaGeometry(2).gamma > 0);
  // internalGearRatio with a degenerate ring → 0, not Infinity
  assert.equal(internalGearRatio(12, 0), 0);
  // planetary / bevel with zero teeth → finite, not NaN
  assert.ok(Number.isFinite(planetaryAngles(1, 0, 0, 'ring').carrier));
  assert.ok(Number.isFinite(bevelConeAngles(0, 0).ratio));
});

// ---------------------------------------------------------------------------
// SATOR square — per-tile behaviors (P0 kinematics)
// ---------------------------------------------------------------------------
test('doubleGenevaOutput: explicit {lo,hi} retargets the dwells (O-flip {0,π}) and the default is unchanged', () => {
  const pf = 0.62;
  const w = pf * Math.PI;
  const o = (t) => doubleGenevaOutput(t, 0, pf, { lo: 0, hi: Math.PI });
  near(o(0).angle, 0, 1e-9, 'starts at lo = 0');
  near(o(w).angle, Math.PI, 1e-9, 'end of push A = hi = π');
  near(o((w + Math.PI) / 2).angle, Math.PI, 1e-9, 'dwell at hi = π');
  near(o(Math.PI + w).angle, 0, 1e-9, 'end of push B = lo = 0');
  // backward compatible: no opts still rocks between -amp and +amp
  near(doubleGenevaOutput(0, 0.6).angle, -0.6, 1e-9, 'default lo still -amp');
  near(doubleGenevaOutput(w, 0.6).angle, 0.6, 1e-9, 'default hi still +amp');
});

test('alwaysUprightAngle holds orientation: absolute = Φ + ψ = 0 for all Φ', () => {
  for (const phi of [0, 0.5, 1.7, Math.PI, 4.2, -2.1]) {
    near(alwaysUprightAngle(phi), -phi, 1e-12);
    near(phi + alwaysUprightAngle(phi), 0, 1e-12, 'absolute orientation is 0');
  }
});

test('spinAngle: absolute = N·Φ, upright (≡0 mod 2π) at every 90° detent for N≡0 mod 4', () => {
  for (const n of [4, 8]) {
    near(spinSunPlanetRatio(n), n - 1, 1e-12, 'zSun/zPlanet = N - 1');
    for (let k = 0; k < 8; k++) {
      const phi = (k * Math.PI) / 2; // k·90°
      const absolute = phi + spinAngle(phi, n);
      near(absolute, n * phi, 1e-12, 'absolute = N·Φ');
      near(mod(absolute, TAU), 0, 1e-9, `upright at Φ=${k}·90° for N=${n}`);
    }
  }
});

test('spinAngle matches the fixed-sun planetary realization (planetSpin)', () => {
  // zSun/zPlanet = N-1 = 3 -> planetSpin = Φ·(1+3) = 4Φ = absolute = Φ + spinAngle(Φ,4)
  const zSun = 36;
  const zPlanet = 12; // ratio 3
  for (const phi of [0.3, 1.1, 2.7, -0.9]) {
    const a = planetaryAngles(phi, zSun, zPlanet, 'sun');
    near(a.planetSpin, phi + spinAngle(phi, 4), 1e-9, 'planetSpin = absolute spin angle');
  }
});

test('flipAngle toggles between 0 and π via the {0,π} double-Geneva', () => {
  const w = 0.62 * Math.PI;
  near(flipAngle(0), 0, 1e-9);
  near(flipAngle(w), Math.PI, 1e-9);
});

test('atQuarterDetent is true only at k·90°', () => {
  for (const phi of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, TAU, -Math.PI / 2]) {
    assert.ok(atQuarterDetent(phi), `detent at ${phi}`);
  }
  for (const phi of [Math.PI / 4, 0.1, 1.0, 2.0]) {
    assert.ok(!atQuarterDetent(phi), `not a detent at ${phi}`);
  }
});

test('satorTileAngle dispatches each behavior and the square is legible at every 90° detent', () => {
  for (const phi of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    near(satorTileAngle('upright', phi), -phi, 1e-12, 'upright = -Φ');
    near(satorTileAngle('fixed', phi), -phi, 1e-12, 'fixed = -Φ');
    near(satorTileAngle('spin', phi, { n: 4 }), 3 * phi, 1e-12, 'spin = (N-1)Φ');
    // flip tile absolute orientation lands on 0 or π (both legible for the symmetric O)
    const absFlip = mod(phi + satorTileAngle('flip', phi), TAU);
    assert.ok(
      Math.min(absFlip, Math.abs(absFlip - Math.PI), TAU - absFlip) < 1e-6,
      `O flip legible at Φ=${phi} (absolute ${absFlip})`
    );
  }
  assert.throws(() => satorTileAngle('bogus', 0), /unknown SATOR tile behavior/);
});

test('indexAbsolute: stepped spin winds n turns/board and is upright at the detents iff n%4==0', () => {
  // legible case n=4: absolute is a multiple of 2π at every 90° detent
  for (let j = 0; j < 4; j++) {
    near(mod(indexAbsolute((j * Math.PI) / 2, 4, 4), TAU), 0, 1e-9, `n=4 upright at detent ${j}`);
  }
  // illegible windings land the letter sideways/inverted at some detents
  assert.ok(mod(indexAbsolute(Math.PI / 2, 1, 4), TAU) > 1e-3, 'n=1 sideways at 90°');
  assert.ok(mod(indexAbsolute(Math.PI / 2, 2, 4), TAU) > 1e-3, 'n=2 not upright at 90°');
  // wraps continuously across the board revolution (net = n turns ≡ 0 mod 2π)
  near(mod(indexAbsolute(TAU - 1e-9, 4, 4), TAU), 0, 1e-3, 'wraps to upright');
  assert.equal(indexUpright(4), true);
  assert.equal(indexUpright(8), true);
  assert.equal(indexUpright(1), false);
  assert.equal(indexUpright(2), false);
});

test('indexAbsolute: discrete clicks — a staircase that dwells between equal steps', () => {
  const n = 4;
  const clicks = 4;
  const pf = 0.5;
  const interval = TAU / (n * clicks); // board angle per click
  const step = TAU / clicks; // 90° per click
  const at = (m) => indexAbsolute(m * interval, n, clicks, pf);
  near(at(0.9), step, 1e-9, 'after the first click = one step');
  near(at(1.9), 2 * step, 1e-9, 'after the second click = two steps');
  near(at(0.7), at(0.95), 1e-12, 'value is flat (dwell) between clicks');
});

test('satorFlipRock: O rides the board and rocks 0..90° (board frame), legible at every detent', () => {
  // tile dwells at 0° at the even detents, 90° at the odd detents
  near(satorFlipRock(0), 0, 1e-9, 'Φ=0 → 0°');
  near(satorFlipRock(Math.PI / 2), Math.PI / 2, 1e-9, 'Φ=90° → 90°');
  near(satorFlipRock(Math.PI), 0, 1e-9, 'Φ=180° → 0°');
  near(satorFlipRock((3 * Math.PI) / 2), Math.PI / 2, 1e-9, 'Φ=270° → 90°');
  // world orientation (board + rock) reads as O (≡0 or π) at every detent
  for (let k = 0; k < 4; k++) {
    const phi = (k * Math.PI) / 2;
    const world = mod(phi + satorFlipRock(phi), TAU);
    assert.ok(Math.min(world, Math.abs(world - Math.PI), TAU - world) < 1e-6, `flip legible at detent ${k}`);
  }
  // 2:1 gear: the star rocks half the tile's range (±22.5° vs the tile's 0..90°)
  near(satorFlipStar(0), Math.PI / 8, 1e-9, 'star +22.5° at even detent');
  near(satorFlipStar(Math.PI / 2), -Math.PI / 8, 1e-9, 'star −22.5° at odd detent');
  near(satorFlipRock(0), Math.PI / 4 - 2 * satorFlipStar(0), 1e-12, 'tile = 2:1 up from star');
});

test('satorFlipRock: ANY step-up ratio (amp = π/(4·R)) still flips the O 0..90° and reads legibly', () => {
  // the modular knob: a taller ratio rocks the cross less (smaller amp) for the SAME 90° tile
  // flip, so the legibility invariant (2·R·amp = π/2) holds for every ratio, not just R = 2.
  for (const R of [1.5, 2, 3, 4]) {
    const amp = Math.PI / (4 * R);
    // tile still dwells 0° (even detents) / 90° (odd) regardless of ratio
    near(satorFlipRock(0, amp), 0, 1e-9, `R=${R}: Φ=0 → 0°`);
    near(satorFlipRock(Math.PI / 2, amp), Math.PI / 2, 1e-9, `R=${R}: Φ=90° → 90°`);
    near(satorFlipRock(Math.PI, amp), 0, 1e-9, `R=${R}: Φ=180° → 0°`);
    // the cross rocks exactly ±amp (less for a taller ratio)
    near(satorFlipStar(0, amp), amp, 1e-9, `R=${R}: cross +amp at even detent`);
    near(satorFlipStar(Math.PI / 2, amp), -amp, 1e-9, `R=${R}: cross −amp at odd detent`);
    // world orientation reads as O (≡0 or π) at every detent, for every ratio
    for (let k = 0; k < 4; k++) {
      const phi = (k * Math.PI) / 2;
      const world = mod(phi + satorFlipRock(phi, amp), TAU);
      assert.ok(Math.min(world, Math.abs(world - Math.PI), TAU - world) < 1e-6, `R=${R}: flip legible at detent ${k}`);
    }
  }
});

// --- SATOR O-flip drive: the reciprocating double-Geneva engagement (the "Maltese math") ---
test('satorDriveGeometry: a/c = sin(amp), slot mouth = rim, drivers mesh (2·rd apart) at distance c, slots face the drivers', () => {
  const amp = Math.PI / 8;
  for (const [rim, rd] of [[8.64, 5], [12, 6], [20, 7]]) {
    const g = satorDriveGeometry(rim, rd, amp);
    near(g.a / g.c, Math.sin(amp), 1e-12, 'a/c = sin(amp) → soft ±amp Geneva rock');
    near(g.c * Math.cos(amp), rim, 1e-9, 'slot mouth lands on the rim at pin entry');
    near(g.mouth, rim, 1e-12, 'mouth = rim');
    near(Math.hypot(g.rd, g.H), g.c, 1e-9, 'meshed drivers (2·rd apart) sit at distance c');
    near(g.rd, rd, 1e-12, 'driver pitch radius preserved');
    near((g.sigmaA + g.sigmaB) / 2, -Math.PI / 2, 1e-12, 'slots symmetric about straight-down');
    near(g.sigmaB - g.sigmaA, 2 * Math.atan2(rd, g.H), 1e-12, 'slot separation = 2·atan2(rd,H)');
    assert.ok(g.slotBottom > 0 && g.slotBottom < rim, 'pin bottoms out inside the rim');
  }
});

test('satorDrivePins: the engaged crank pin rides EXACTLY on the cross slot centerline (true Maltese drive)', () => {
  const amp = Math.PI / 8;
  const g = satorDriveGeometry(8.64, 5, amp);
  // transform the engaged world pin into the cross-local frame and decompose along/perp to
  // its slot ray (sigmaA for pin 1, sigmaB for pin 2): on the centerline iff perp ≈ 0.
  const local = (phi) => {
    const r = satorDrivePins(phi, g);
    const pos = r.pin === 1 ? r.pos1 : r.pos2;
    const sigma = r.pin === 1 ? g.sigmaA : g.sigmaB;
    const lx = pos[0] * Math.cos(-r.cross) - pos[1] * Math.sin(-r.cross);
    const ly = pos[0] * Math.sin(-r.cross) + pos[1] * Math.cos(-r.cross);
    return { engaged: r.engaged, pin: r.pin, along: lx * Math.cos(sigma) + ly * Math.sin(sigma), perp: -lx * Math.sin(sigma) + ly * Math.cos(sigma) };
  };
  // (a) through every engaged instant the pin stays on the slot centerline
  let maxOff = 0, sawPin1 = false, sawPin2 = false;
  for (let i = 0; i <= 2000; i++) {
    const r = local((i / 2000) * TAU);
    if (!r.engaged) continue;
    if (r.pin === 1) sawPin1 = true; else sawPin2 = true;
    maxOff = Math.max(maxOff, Math.abs(r.perp));
  }
  assert.ok(sawPin1 && sawPin2, 'both pins engage across a board revolution');
  assert.ok(maxOff < 1e-9, `pin drifts ${maxOff} off the slot centerline`);
  // (b) radius sweeps slot-bottom (deepest, at the push centre) → mouth (at the engagement edge)
  const gammaP = Math.PI / 2 - amp;
  near(local(Math.PI / 4).along, g.slotBottom, 1e-9, 'pin 1 deepest at the push centre');
  near(local(Math.PI / 4 - gammaP / 2).along, g.mouth, 1e-9, 'pin 1 at the mouth at the engagement edge');
  near(local((3 * Math.PI) / 4).along, g.slotBottom, 1e-9, 'pin 2 deepest at the push centre');
});

test('satorDrivePins: reciprocates (pin 1 +amp→−amp, pin 2 −amp→+amp) and the cross equals satorFlipStar', () => {
  const g = satorDriveGeometry(8.64, 5);
  for (const phi of [0, 0.3, 0.8, Math.PI / 2, Math.PI, 4.2]) {
    near(satorDrivePins(phi, g).cross, satorFlipStar(phi), 1e-12, `cross = satorFlipStar @${phi}`);
  }
  const h = 1e-4;
  // pin 1 drives around φ=π/4 (cross decreasing: +amp→−amp)
  assert.equal(satorDrivePins(Math.PI / 4, g).pin, 1, 'pin 1 drives near φ=π/4');
  assert.ok(
    satorDrivePins(Math.PI / 4 + h, g).cross < satorDrivePins(Math.PI / 4 - h, g).cross,
    'pin 1: cross +amp→−amp'
  );
  // pin 2 drives around φ=3π/4 (cross increasing: −amp→+amp)
  assert.equal(satorDrivePins((3 * Math.PI) / 4, g).pin, 2, 'pin 2 drives near φ=3π/4');
  assert.ok(
    satorDrivePins((3 * Math.PI) / 4 + h, g).cross > satorDrivePins((3 * Math.PI) / 4 - h, g).cross,
    'pin 2: cross −amp→+amp'
  );
});

test('satorDrivePins: cross ≡ satorFlipStar(φ, amp) at ANY drive amp (so the rendered O-gear stays meshed)', () => {
  // the gear-mesh sync invariant: the rendered cross angle must equal the flip tile-side star at
  // the SAME amp, for every ratio — else the O-gear and output-gear teeth would visibly slip.
  for (const R of [1.5, 2, 3, 4]) {
    const amp = Math.PI / (4 * R);
    const g = satorDriveGeometry(8.64, 5, amp);
    near(g.amp, amp, 1e-15, `R=${R}: geom carries its amp`);
    for (const phi of [0, 0.3, 0.8, Math.PI / 2, Math.PI, 4.2]) {
      near(satorDrivePins(phi, g).cross, satorFlipStar(phi, amp), 1e-12, `R=${R}: cross = satorFlipStar @${phi}`);
    }
  }
});

test('satorDriverAngle: meshed driver gears counter-rotate at ±2φ (two revs/board → 4 pushes/board)', () => {
  const g = satorDriveGeometry(8.64, 5);
  for (const phi of [0.2, 1.0, -0.7, TAU + 0.5]) {
    near(satorDriverAngle(phi, 1, g) - satorDriverAngle(0, 1, g), 2 * phi, 1e-12, 'gear 1 = +2φ');
    near(satorDriverAngle(phi, 2, g) - satorDriverAngle(0, 2, g), -2 * phi, 1e-12, 'gear 2 = −2φ (counter)');
  }
});

test('satorDrive cam lock: each pocket arc-centre lands on its driver axis at the dwell it holds (cam nests, cross blocked)', () => {
  const amp = Math.PI / 8;
  const g = satorDriveGeometry(8.64, 5, amp);
  // pocket A (held at +amp) rotates onto D1; pocket B (held at −amp) onto D2 — so a cam disc
  // centred on D_i nests in the pocket and blocks the (stationary) cross during that dwell.
  const pocketWorld = (rho, psi) => [g.c * Math.cos(rho + psi), g.c * Math.sin(rho + psi)];
  const pA = pocketWorld(g.pocketA, amp);
  const pB = pocketWorld(g.pocketB, -amp);
  near(Math.hypot(pA[0] - g.D1[0], pA[1] - g.D1[1]), 0, 1e-9, 'pocket A nests on D1 at the +amp dwell');
  near(Math.hypot(pB[0] - g.D2[0], pB[1] - g.D2[1]), 0, 1e-9, 'pocket B nests on D2 at the −amp dwell');
  // and the cross is genuinely dwelling (disengaged, stationary) at those holds
  assert.equal(satorDrivePins(0, g).engaged, false, '+amp dwell at φ=0 is disengaged');
  near(satorDrivePins(0, g).cross, amp, 1e-12, 'cross held at +amp');
  assert.equal(satorDrivePins(Math.PI / 2, g).engaged, false, '−amp dwell at φ=π/2 is disengaged');
  near(satorDrivePins(Math.PI / 2, g).cross, -amp, 1e-12, 'cross held at −amp');
});

test('satorCamGeometry: the gap-on-pin cam locks BOTH dwells (100%) and stays within bounds', () => {
  const amp = Math.PI / 8;
  const wrapPi = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  for (const [rim, rd] of [[8.64, 5], [13.57, 7.85]]) {
    const g = satorDriveGeometry(rim, rd, amp);
    const cg = satorCamGeometry(g);
    // bounds: narrower than the engagement window (so the solid covers the pocket at dwell),
    // wide enough for the slot mouth (so it clears the channel at the push)
    const slotW = Math.max(rd * 0.035 * 1.25, rim * 0.05);
    const mouthHalf = Math.asin(Math.min(0.9, slotW / rim));
    assert.ok(cg.gapHalf < cg.gamma, `gapHalf ${cg.gapHalf} must be < gamma ${cg.gamma} (else dwell unlocks)`);
    assert.ok(cg.gapHalf >= mouthHalf, `gapHalf ${cg.gapHalf} must clear the slot mouth ${mouthHalf}`);
    // cam disc: positive, kisses the pocket bottom, two cams never collide (2·camR < 2·rd)
    assert.ok(cg.camR > 0, 'camR > 0');
    assert.ok(2 * cg.camR < 2 * rd, `cams never collide (2·${cg.camR} < ${2 * rd})`);
    near(g.c - cg.pocketR, cg.camR, 1e-9, 'disc inner edge kisses the pocket bottom');
    assert.ok(cg.pocketR > g.slotBottom && cg.pocketR < rim, 'pocket dips inside the rim, above the slot bottom');
    // the holding cam (D1 at +amp, D2 at −amp) keeps its SOLID over the toward-O_c pocket
    // contact at EVERY dwell instant — the gap (on the pin) never exposes it. (A cam centred
    // on the line of centres, or wider than gamma, scores 0% here at one dwell.)
    let sawPlus = false, sawMinus = false, dwellN = 0;
    for (let i = 0; i <= 2000; i++) {
      const phi = (i / 2000) * TAU;
      const r = satorDrivePins(phi, g);
      if (r.engaged) continue;
      dwellN += 1;
      const plus = r.cross > 0; // +amp dwell -> D1 holds; −amp -> D2 holds
      if (plus) sawPlus = true; else sawMinus = true;
      const which = plus ? cg.locksAtPlus : cg.locksAtMinus;
      const D = which === 1 ? g.D1 : g.D2;
      const theta = which === 1 ? r.theta1 : r.theta2; // gap is centred on theta (the pin)
      const block = Math.atan2(-D[1], -D[0]); // toward O_c: where the cam must bear on the pocket
      assert.ok(
        Math.abs(wrapPi(block - theta)) > cg.gapHalf,
        `dwell @φ=${phi.toFixed(2)} (cross ${r.cross.toFixed(3)}): cam gap exposes the pocket — UNLOCKED`
      );
    }
    assert.ok(sawPlus && sawMinus && dwellN > 0, 'saw both +amp and −amp dwells');
  }
});

test('satorCamGeometry: locks BOTH dwells AND clears the slot across EVERY drive ratio (amp = π/(4·R))', () => {
  // the cam guarantees depend on amp (gamma = π/2 − amp, gapHalf = 0.6·gamma): a taller ratio
  // shrinks amp, which only widens the locking margin — but the small-ratio end (amp = 30°) is
  // the tight case, so sweep the whole UI-exposed ratio set to prove both ends hold.
  const wrapPi = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  const rim = 8.64, rd = 5;
  const slotW = Math.max(rd * 0.035 * 1.25, rim * 0.05);
  const mouthHalf = Math.asin(Math.min(0.9, slotW / rim));
  for (const R of [1.5, 2, 3, 4]) {
    const amp = Math.PI / (4 * R);
    const g = satorDriveGeometry(rim, rd, amp);
    const cg = satorCamGeometry(g);
    assert.ok(cg.gapHalf < cg.gamma, `R=${R}: gapHalf ${cg.gapHalf} < gamma ${cg.gamma} (else a dwell unlocks)`);
    assert.ok(cg.gapHalf >= mouthHalf, `R=${R}: gapHalf ${cg.gapHalf} clears the slot mouth ${mouthHalf}`);
    let dwellN = 0;
    for (let i = 0; i <= 1500; i++) {
      const phi = (i / 1500) * TAU;
      const r = satorDrivePins(phi, g);
      if (r.engaged) continue;
      dwellN += 1;
      const which = r.cross > 0 ? cg.locksAtPlus : cg.locksAtMinus;
      const D = which === 1 ? g.D1 : g.D2;
      const theta = which === 1 ? r.theta1 : r.theta2;
      assert.ok(Math.abs(wrapPi(Math.atan2(-D[1], -D[0]) - theta)) > cg.gapHalf, `R=${R}: dwell @φ=${phi.toFixed(2)} UNLOCKED`);
    }
    assert.ok(dwellN > 0, `R=${R}: saw dwells`);
  }
});

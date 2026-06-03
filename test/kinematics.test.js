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
  satorTileAngle,
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

test('satorTileAngle: flip freq must be a positive even integer (odd freq breaks detent legibility)', () => {
  assert.doesNotThrow(() => satorTileAngle('flip', 0, { freq: 2 }));
  assert.doesNotThrow(() => satorTileAngle('flip', 0, { freq: 4 }));
  assert.throws(() => satorTileAngle('flip', 0, { freq: 3 }), /positive even integer/);
  assert.throws(() => satorTileAngle('flip', 0, { freq: 0 }), /positive even integer/);
  assert.throws(() => satorTileAngle('flip', 0, { freq: 2.5 }), /positive even integer/);
});

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
  spurTrainPhases,
  spurGearAngle,
  internalGearRatio,
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

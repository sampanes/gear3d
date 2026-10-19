// Real tooth clearance: posed gear outlines, sampled over a tooth pitch of rotation,
// must not pass through each other wherever the app lets a mechanism export.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpurTrain } from '../src/mechanisms/spurTrain.js';
import { InternalGear } from '../src/mechanisms/internalGear.js';
import { Planetary } from '../src/mechanisms/planetary.js';
import { gearContour, gearMetrics } from '../src/gears/involute.js';
import { DIG_LIMIT, posed, externalPenetration, internalGearInterference, planetaryInterference } from '../src/gears/meshcheck.js';

const TOL = DIG_LIMIT * 4; // mm at module 4, the limit the app uses

test('the checker reads external spur pairs as clear, small undercut pinions included', () => {
  for (const pa of [14.5, 20, 25]) {
    for (const [a, b] of [[8, 8], [12, 24], [8, 40]]) {
      const t = new SpurTrain({ teeth: [a, b], module: 4, pressureAngle: pa, thickness: 8 });
      const [ca, cb] = [a, b].map((z) => gearContour({ module: 4, teeth: z, pressureAngle: pa }));
      const [ra, rb] = [a, b].map((z) => gearMetrics({ module: 4, teeth: z, pressureAngle: pa }).ra);
      let worst = 0;
      for (let k = 0; k < 8; k++) {
        t.update(((2 * Math.PI) / a) * (k / 8));
        const [ga, gb] = t.gears;
        const pa0 = { x: ga.position.x, y: ga.position.y };
        const pb0 = { x: gb.position.x, y: gb.position.y };
        worst = Math.max(worst, externalPenetration(posed(ca, ga.rotation.z, pa0.x, pa0.y), pa0, ra,
          posed(cb, gb.rotation.z, pb0.x, pb0.y), pb0, rb));
      }
      assert.ok(worst < TOL, `${a}/${b} @${pa}: ${worst.toFixed(3)} mm`);
      t.dispose();
    }
  }
});

test('InternalGear reports colliding teeth instead of building them silently', () => {
  const bad = new InternalGear({ module: 4, pinionTeeth: 30, ringTeeth: 32, pressureAngle: 20, thickness: 8 });
  assert.ok(bad.problems.some((s) => s.includes('ring raised')), 'the raised ring count is reported');
  assert.ok(bad.problems.some((s) => s.includes('collide')), 'the collision is reported');
  assert.match(bad.info(), /\[!\]/);
  const good = new InternalGear({ module: 4, pinionTeeth: 12, ringTeeth: 48, pressureAngle: 20, thickness: 8 });
  assert.deepEqual(good.problems, []);
  assert.ok(internalGearInterference(good, { module: 4, pressureAngle: 20 }) < TOL);
});

test('Planetary: every planet clears the sun and the ring when the assembly count is whole', () => {
  for (const [s, p, n] of [[12, 12, 3], [12, 12, 4], [15, 15, 3], [10, 20, 5]]) {
    const prm = { module: 4, sunTeeth: s, planetTeeth: p, planets: n, pressureAngle: 20, thickness: 8, fixed: 'ring' };
    const m = new Planetary(prm);
    assert.deepEqual(m.problems, [], `S${s} P${p} x${n}`);
    const dig = planetaryInterference(m, prm, 6);
    assert.ok(dig < TOL, `S${s} P${p} x${n}: planets dig ${dig.toFixed(3)} mm`);
    m.dispose();
  }
});

test('Planetary: small planets that dig into the ring are reported even with a whole count', () => {
  const prm = { module: 4, sunTeeth: 16, planetTeeth: 8, planets: 4, pressureAngle: 20, thickness: 8, fixed: 'ring' };
  const m = new Planetary(prm);
  assert.ok(m.problems.some((s) => s.includes('collide')), m.problems.join('; '));
  m.dispose();
});

test('Planetary: an unequal set is reported, and its planets really do collide', () => {
  const prm = { module: 4, sunTeeth: 8, planetTeeth: 8, planets: 6, pressureAngle: 20, thickness: 8, fixed: 'ring' };
  const m = new Planetary(prm);
  assert.equal(m.problems.length, 1);
  assert.match(m.info(), /cannot all mesh/);
  assert.ok(planetaryInterference(m, prm, 4) > 1, 'the check this flag stands for is real');
  m.dispose();
});

// Unit tests for the 3D gear mesh builder (src/gears/gear.js), focused on the
// helical twist. Imports three for BufferGeometry; loads fine under node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { gearGeometry, twistAboutZ } from '../src/gears/gear.js';
import { gearMetrics } from '../src/gears/involute.js';

const PARAMS = { module: 4, teeth: 16, pressureAngle: 20 };
const OPTS = { thickness: 10, bore: 4 };

function extents(geo) {
  const pos = geo.attributes.position;
  let maxR = -Infinity;
  let minR = Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const rad = Math.hypot(pos.getX(i), pos.getY(i));
    maxR = Math.max(maxR, rad);
    minR = Math.min(minR, rad);
    minZ = Math.min(minZ, pos.getZ(i));
    maxZ = Math.max(maxZ, pos.getZ(i));
  }
  return { maxR, minR, minZ, maxZ };
}

test('twistAboutZ rotates each vertex about Z by (z/thickness)*totalTwist, preserving radius', () => {
  const thickness = 10;
  const totalTwist = 0.4;
  const R = 5;
  const zs = [-5, -2.5, 0, 2.5, 5];
  const arr = new Float32Array(zs.length * 3);
  zs.forEach((z, i) => {
    arr[i * 3] = R;
    arr[i * 3 + 1] = 0;
    arr[i * 3 + 2] = z;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  twistAboutZ(geo, totalTwist, thickness);
  const pos = geo.attributes.position;
  zs.forEach((z, i) => {
    const a = (z / thickness) * totalTwist;
    // tolerances are float32-sized: position is stored in a Float32 buffer
    assert.ok(Math.abs(pos.getX(i) - R * Math.cos(a)) < 1e-4, `x at z=${z}`);
    assert.ok(Math.abs(pos.getY(i) - R * Math.sin(a)) < 1e-4, `y at z=${z}`);
    assert.ok(Math.abs(Math.hypot(pos.getX(i), pos.getY(i)) - R) < 1e-4, `radius at z=${z}`);
  });
});

test('helical gear: twist is a pure rotation about Z, so radial + axial extents are preserved', () => {
  const straight = extents(gearGeometry(PARAMS, { ...OPTS, helix: 0 }));
  const helical = extents(gearGeometry(PARAMS, { ...OPTS, helix: 25 }));
  // float32-sized tolerance; a real scaling bug would shift these by >> this
  assert.ok(Math.abs(straight.maxR - helical.maxR) < 1e-3, `maxR ${straight.maxR} vs ${helical.maxR}`);
  assert.ok(Math.abs(straight.minR - helical.minR) < 1e-3, `minR ${straight.minR} vs ${helical.minR}`);
  assert.ok(Math.abs(straight.minZ - helical.minZ) < 1e-3, 'minZ preserved');
  assert.ok(Math.abs(straight.maxZ - helical.maxZ) < 1e-3, 'maxZ preserved');
});

test('helical gear subdivides the walls (more vertices than the straight gear)', () => {
  const straight = gearGeometry(PARAMS, { ...OPTS, helix: 0 });
  const helical = gearGeometry(PARAMS, { ...OPTS, helix: 25 });
  assert.ok(
    helical.attributes.position.count > straight.attributes.position.count,
    `helical ${helical.attributes.position.count} !> straight ${straight.attributes.position.count}`
  );
});

test('helix=0 leaves the gear straight (front and back tip vertices share an angle)', () => {
  const geo = gearGeometry(PARAMS, { ...OPTS, helix: 0 });
  const { ra } = gearMetrics(PARAMS);
  const pos = geo.attributes.position;
  // a tip vertex at the front cap and one at the back cap, both near +x, must
  // sit at the same polar angle when there is no twist
  const tipAngle = (zSign) => {
    let best = null;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (Math.sign(z) !== zSign) continue;
      if (Math.abs(Math.hypot(x, y) - ra) > 1e-3) continue;
      const ang = Math.atan2(y, x);
      if (best === null || Math.abs(ang) < Math.abs(best)) best = ang;
    }
    return best;
  };
  const front = tipAngle(1);
  const back = tipAngle(-1);
  assert.ok(front !== null && back !== null, 'found tip vertices on both caps');
  assert.ok(Math.abs(front - back) < 1e-6, `straight gear caps misaligned: ${front} vs ${back}`);
});

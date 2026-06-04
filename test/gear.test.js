// Unit tests for the 3D gear mesh builder (src/gears/gear.js), focused on the
// helical twist. Imports three for BufferGeometry; loads fine under node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { gearGeometry, twistAboutZ, scaleConical, bevelGearGeometry, spokeHoles } from '../src/gears/gear.js';
import { gearMetrics } from '../src/gears/involute.js';
import { TAU, mod } from '../src/math.js';

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

test('scaleConical scales (x,y) by z/zApex so radius is proportional to z', () => {
  const zApex = 20;
  const R = 6;
  const zs = [5, 10, 20];
  const arr = new Float32Array(zs.length * 3);
  zs.forEach((z, i) => {
    arr[i * 3] = R;
    arr[i * 3 + 1] = 0;
    arr[i * 3 + 2] = z;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  scaleConical(geo, zApex);
  const pos = geo.attributes.position;
  zs.forEach((z, i) => {
    assert.ok(Math.abs(pos.getX(i) - R * (z / zApex)) < 1e-4, `x at z=${z}`);
    assert.ok(Math.abs(pos.getY(i)) < 1e-4, `y at z=${z}`);
  });
});

test('bevelGearGeometry tapers toward the apex (front end smaller than back by z ratio)', () => {
  const geo = bevelGearGeometry({ module: 4, teeth: 20, pressureAngle: 20 }, { faceWidth: 14, coneAngle: Math.PI / 4, bore: 4 });
  const pos = geo.attributes.position;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    zMin = Math.min(zMin, pos.getZ(i));
    zMax = Math.max(zMax, pos.getZ(i));
  }
  const maxRadAt = (zTarget) => {
    let maxR = 0;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getZ(i) - zTarget) > 1e-3) continue;
      maxR = Math.max(maxR, Math.hypot(pos.getX(i), pos.getY(i)));
    }
    return maxR;
  };
  const back = maxRadAt(zMax); // large end
  const front = maxRadAt(zMin); // small end
  assert.ok(back > 0 && front > 0, 'found both faces');
  assert.ok(front < back, `front (${front}) should taper smaller than back (${back})`);
  // conical: the radius ratio equals the axial (z) ratio
  assert.ok(Math.abs(front / back - zMin / zMax) < 1e-3, `taper ratio ${front / back} != z ratio ${zMin / zMax}`);
});

// ---------------------------------------------------------------------------
// Lightening cut-outs (spokes)
// ---------------------------------------------------------------------------
test('spokeHoles: N cut-outs clear the bore and the root, never overlap, evenly spaced & equal', () => {
  const params = { module: 5, teeth: 24, pressureAngle: 20 };
  const bore = 4;
  const { rf } = gearMetrics(params);
  for (const n of [3, 4, 5, 6, 8]) {
    const holes = spokeHoles(params, bore, n);
    assert.equal(holes.length, n, `n=${n}: ${n} cut-outs`);
    const ring = Math.hypot(holes[0].x, holes[0].y);
    for (let i = 0; i < n; i++) {
      const h = holes[i];
      const d = Math.hypot(h.x, h.y);
      assert.ok(d - h.r >= bore, `n=${n} hole ${i}: clears the bore/axle (${d - h.r} >= ${bore})`);
      assert.ok(d + h.r <= rf, `n=${n} hole ${i}: stays under the tooth root (${d + h.r} <= ${rf})`);
      assert.ok(Math.abs(d - ring) < 1e-9, `n=${n} hole ${i}: on the one centre ring`);
      assert.ok(Math.abs(h.r - holes[0].r) < 1e-9, `n=${n} hole ${i}: equal radius`);
    }
    // an arm (web) remains between every adjacent pair — they never touch
    for (let i = 0; i < n; i++) {
      const a = holes[i], b = holes[(i + 1) % n];
      const sep = Math.hypot(a.x - b.x, a.y - b.y);
      assert.ok(sep > a.r + b.r, `n=${n}: holes ${i},${(i + 1) % n} overlap (sep ${sep} <= ${a.r + b.r})`);
    }
    // even angular spacing
    const ang = holes.map((h) => Math.atan2(h.y, h.x));
    for (let i = 0; i < n; i++) {
      const da = mod(ang[(i + 1) % n] - ang[i], TAU);
      assert.ok(Math.abs(da - TAU / n) < 1e-9, `n=${n}: even angular spacing`);
    }
  }
});

test('spokeHoles: solid (no cut-outs) for <3 spokes or a web too thin to fit them', () => {
  const big = { module: 5, teeth: 24, pressureAngle: 20 };
  assert.deepEqual(spokeHoles(big, 4, 0), [], '0 spokes → solid');
  assert.deepEqual(spokeHoles(big, 4, 2), [], '<3 spokes → solid');
  // a 6-tooth pinion at this module has almost no web between hub and root → solid
  const tiny = { module: 5, teeth: 6, pressureAngle: 20 };
  assert.deepEqual(spokeHoles(tiny, 4, 5), [], 'tiny gear → solid (web too thin)');
});

test('gearGeometry: spokes punch extra cut-outs (more vertices); default 0 leaves the gear solid', () => {
  const params = { module: 5, teeth: 24, pressureAngle: 20 };
  const solid = gearGeometry(params, { thickness: 8, bore: 4, spokes: 0 });
  const solidDefault = gearGeometry(params, { thickness: 8, bore: 4 });
  assert.equal(
    solid.attributes.position.count,
    solidDefault.attributes.position.count,
    'spokes:0 is identical to the default (solid)'
  );
  const spoked = gearGeometry(params, { thickness: 8, bore: 4, spokes: 5 });
  assert.ok(
    spoked.attributes.position.count > solid.attributes.position.count,
    `5 cut-outs add wall geometry (${spoked.attributes.position.count} > ${solid.attributes.position.count})`
  );
});

// Builds a 3D spur-gear mesh from involute parameters.

import * as THREE from 'three';
import { gearContour, gearMetrics, internalGearContour, internalGearMetrics } from './involute.js';
import { metal } from '../parts.js';
import { DEG, TAU } from '../math.js';

// Returns an extruded BufferGeometry centred on Z, axis along +Z. A non-zero
// `helix` angle (degrees) twists the extrusion into a helical gear; the sign
// selects the hand (meshing parallel-axis gears use an equal angle of opposite
// hand, so a train alternates the sign down the chain).
export function gearGeometry(params, { thickness = 8, bore = 0, helix = 0 } = {}) {
  const shape = new THREE.Shape(gearContour(params));
  if (bore > 0) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, bore, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const bevel = Math.min(0.5, thickness * 0.08);

  // Total twist across the thickness for the requested helix angle at the pitch
  // circle: tan(helix) = (r * twist) / thickness  ->  twist = thickness*tan/r.
  const { r } = gearMetrics(params);
  const twist = helix === 0 ? 0 : (thickness * Math.tan(helix * DEG)) / r;
  // Subdivide the walls so the helix reads smoothly (a straight gear stays 1 step).
  const steps = twist === 0 ? 1 : Math.min(96, Math.max(8, Math.ceil(Math.abs(twist) / (3 * DEG))));

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    steps,
    curveSegments: 24,
  });
  geo.translate(0, 0, -thickness / 2 + bevel);
  if (twist !== 0) twistAboutZ(geo, twist, thickness);
  geo.computeVertexNormals();
  return geo;
}

// Rotate every vertex about the Z axis by an angle proportional to its height,
// turning a straight extrusion into a helix. Rotation about the centre preserves
// each vertex's radius (so the centred bore stays circular) and its z (so the
// flat caps stay planar, each rotating rigidly).
export function twistAboutZ(geo, totalTwist, thickness) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const a = (pos.getZ(i) / thickness) * totalTwist;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    pos.setXY(i, x * ca - y * sa, x * sa + y * ca);
  }
  pos.needsUpdate = true;
}

// A gear mesh wrapped in a pivot Object3D so callers rotate `.rotation.z` to
// spin it. The mesh is the pivot's only child.
export function makeGear(params, color, opts = {}) {
  const pivot = new THREE.Object3D();
  const mesh = new THREE.Mesh(gearGeometry(params, opts), metal(color, opts.material));
  mesh.castShadow = mesh.receiveShadow = true;
  pivot.add(mesh);
  pivot.userData.metrics = gearMetrics(params);
  return pivot;
}

// A ring (internal) gear: a plain outer rim with the inward-pointing tooth
// profile cut out as a hole. Returns a BufferGeometry centred on Z, axis +Z.
export function ringGearGeometry(params, { thickness = 8 } = {}) {
  const { rOuter } = internalGearMetrics(params);
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rOuter, 0, TAU, false); // outer rim, CCW
  const hole = new THREE.Path();
  // the contour is CCW; a hole must wind opposite the shape, so reverse it
  hole.setFromPoints(internalGearContour(params).reverse());
  shape.holes.push(hole);
  const bevel = Math.min(0.5, thickness * 0.08);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 128,
  });
  geo.translate(0, 0, -thickness / 2 + bevel);
  geo.computeVertexNormals();
  return geo;
}

// A ring-gear mesh wrapped in a pivot Object3D (rotate `.rotation.z` to spin).
export function makeRingGear(params, color, opts = {}) {
  const pivot = new THREE.Object3D();
  const mesh = new THREE.Mesh(ringGearGeometry(params, opts), metal(color, opts.material));
  mesh.castShadow = mesh.receiveShadow = true;
  pivot.add(mesh);
  pivot.userData.metrics = internalGearMetrics(params);
  return pivot;
}

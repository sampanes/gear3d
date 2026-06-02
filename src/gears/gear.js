// Builds a 3D spur-gear mesh from involute parameters.

import * as THREE from 'three';
import { gearContour, gearMetrics } from './involute.js';
import { metal } from '../parts.js';

// Returns an extruded BufferGeometry centred on Z, axis along +Z.
export function gearGeometry(params, { thickness = 8, bore = 0 } = {}) {
  const shape = new THREE.Shape(gearContour(params));
  if (bore > 0) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, bore, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const bevel = Math.min(0.5, thickness * 0.08);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 24,
  });
  geo.translate(0, 0, -thickness / 2 + bevel);
  geo.computeVertexNormals();
  return geo;
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

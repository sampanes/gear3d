// Builds a 3D spur-gear mesh from involute parameters.

import * as THREE from 'three';
import { gearContour, gearMetrics, internalGearContour, internalGearMetrics } from './involute.js';
import { metal } from '../parts.js';
import { DEG, TAU } from '../math.js';

// Returns an extruded BufferGeometry centred on Z, axis along +Z. A non-zero
// `helix` angle (degrees) twists the extrusion into a helical gear; the sign
// selects the hand (meshing parallel-axis gears use an equal angle of opposite
// hand, so a train alternates the sign down the chain).
export function gearGeometry(params, { thickness = 8, bore = 0, helix = 0, spokes = 0, bevel: edgeBevel = true } = {}) {
  const shape = new THREE.Shape(gearContour(params));
  if (bore > 0) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, bore, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  // optional lightening cut-outs in the web between the hub and the toothed rim
  for (const h of spokeHoles(params, bore, spokes)) {
    const cut = new THREE.Path();
    cut.absarc(h.x, h.y, h.r, 0, Math.PI * 2, true); // CW: a hole in the CCW gear shape
    shape.holes.push(cut);
  }
  // ExtrudeGeometry's edge bevel DILATES the body outward by bevelSize (only the
  // two cap faces carry the true contour) — pretty on screen, but ~2*bevelSize of
  // mutual interference in a printed mesh, which would eat the whole backlash
  // budget. Print-pose builds pass bevel:false to get the true contour at every z.
  const bevel = edgeBevel ? Math.min(0.5, thickness * 0.08) : 0;

  // Total twist across the thickness for the requested helix angle at the pitch
  // circle: tan(helix) = (r * twist) / thickness  ->  twist = thickness*tan/r.
  const { r } = gearMetrics(params);
  const twist = helix === 0 ? 0 : (thickness * Math.tan(helix * DEG)) / r;
  // Subdivide the walls so the helix reads smoothly (a straight gear stays 1 step).
  const steps = twist === 0 ? 1 : Math.min(96, Math.max(8, Math.ceil(Math.abs(twist) / (3 * DEG))));

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - 2 * bevel,
    bevelEnabled: bevel > 0,
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

// `spokes` evenly-spaced circular lightening cut-outs in the web between the hub
// (around the bore/axle) and the toothed rim. Returns [{ x, y, r }] in the gear's
// own plane, or [] when fewer than 3 are asked for or the web is too thin to fit a
// sensible hole — so small pinions stay solid automatically. The hole radius is
// auto-sized to the TIGHTER of the radial web (hub↔rim) and the tangential web
// (the spoke/arm left between adjacent holes), then filled to 78%, so a hub, a
// rim under the teeth, and an arm between every pair of holes are always preserved.
export function spokeHoles(params, bore = 0, spokes = 0) {
  const n = Math.round(spokes);
  if (n < 3) return [];
  const { r, rf } = gearMetrics(params);
  const rHub = Math.max(bore, 0) + 0.12 * r; // keep a hub around the bore/axle
  const rRim = rf - 0.18 * r; // keep a solid rim under the tooth roots
  if (rRim - rHub < 0.12 * r) return []; // web too thin → leave the gear solid
  const rMid = (rHub + rRim) / 2; // hole-centre ring
  const radial = (rRim - rHub) / 2; // largest hole the radial web allows
  const tangential = rMid * Math.sin(Math.PI / n); // largest the arm between holes allows
  const rHole = 0.78 * Math.min(radial, tangential); // fill, leaving webs all around
  if (rHole < 0.06 * r) return []; // would be a pinhole → skip
  const holes = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + Math.PI / n; // offset so an arm (not a hole) sits on +x
    holes.push({ x: rMid * Math.cos(a), y: rMid * Math.sin(a), r: rHole });
  }
  return holes;
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
  const gm = gearMetrics(params);
  pivot.userData.metrics = gm;
  pivot.userData.pitch = { radius: gm.r, base: gm.rb, z: 0 }; // for educational overlays
  return pivot;
}

// A ring (internal) gear: a plain outer rim with the inward-pointing tooth
// profile cut out as a hole. Returns a BufferGeometry centred on Z, axis +Z.
export function ringGearGeometry(params, { thickness = 8, bevel: edgeBevel = true } = {}) {
  const { rOuter } = internalGearMetrics(params);
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rOuter, 0, TAU, false); // outer rim, CCW
  const hole = new THREE.Path();
  // the contour is CCW; a hole must wind opposite the shape, so reverse it
  hole.setFromPoints(internalGearContour(params).reverse());
  shape.holes.push(hole);
  // bevel:false for print-pose builds — see gearGeometry (the bevel dilates the
  // body; on a ring that SHRINKS the tooth opening, same interference effect).
  const bevel = edgeBevel ? Math.min(0.5, thickness * 0.08) : 0;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - 2 * bevel,
    bevelEnabled: bevel > 0,
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
  const gm = internalGearMetrics(params);
  pivot.userData.metrics = gm;
  pivot.userData.pitch = { radius: gm.r, base: gm.rb, z: 0 };
  return pivot;
}

// Deform a prism into a cone frustum about the Z axis: scale each vertex's (x,y)
// by z/zApex, so a vertex in the apex plane (z = zApex) keeps full size and the
// apex (z = 0) collapses to a point. Radius becomes proportional to z.
// Vertices within `keepR` of the axis (a bore) are left alone, so a bore stays a
// straight cylinder a shaft fits along its whole length instead of tapering with
// the teeth.
export function scaleConical(geo, zApex, keepR = 0) {
  const pos = geo.attributes.position;
  const keep2 = keepR > 0 ? (keepR * (1 + 1e-5)) ** 2 : -1; // positions are float32
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    if (x * x + y * y <= keep2) continue;
    const s = pos.getZ(i) / zApex;
    pos.setXY(i, x * s, y * s);
  }
  pos.needsUpdate = true;
}

// A bevel gear: an involute gear extruded then deformed onto a pitch cone of
// half-angle `coneAngle` (Tredgold approximation — the spur profile scaled
// self-similarly toward the apex). The apex sits at the local origin and the
// gear tapers toward it; the large (back) face faces +Z. Returns a
// BufferGeometry, axis +Z.
export function bevelGearGeometry(params, { faceWidth = 10, coneAngle = Math.PI / 4, bore = 0 } = {}) {
  const { r } = gearMetrics(params);
  const D = r / Math.sin(coneAngle); // slant cone distance to the back pitch circle
  const b = Math.min(faceWidth, 0.45 * D); // slant face width
  const axial = b * Math.cos(coneAngle); // axial length of the frustum
  const zBack = D * Math.cos(coneAngle); // axial apex(origin) -> back face

  const shape = new THREE.Shape(gearContour(params));
  if (bore > 0) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, bore, 0, TAU, true);
    shape.holes.push(hole);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: axial, bevelEnabled: false, steps: 1, curveSegments: 24 });
  geo.translate(0, 0, zBack - axial); // front face -> zBack-axial, back face -> zBack
  scaleConical(geo, zBack, bore); // taper the teeth to the apex at the origin; the bore stays straight
  geo.computeVertexNormals();
  return geo;
}

// A bevel-gear mesh wrapped in a pivot Object3D (rotate `.rotation.z` to spin).
export function makeBevelGear(params, color, opts = {}) {
  const pivot = new THREE.Object3D();
  const mesh = new THREE.Mesh(bevelGearGeometry(params, opts), metal(color, opts.material));
  mesh.castShadow = mesh.receiveShadow = true;
  pivot.add(mesh);
  const gm = gearMetrics(params);
  const cone = opts.coneAngle ?? Math.PI / 4;
  const zBack = (gm.r / Math.sin(cone)) * Math.cos(cone); // back-cone plane (apex at origin)
  pivot.userData.metrics = gm;
  pivot.userData.pitch = { radius: gm.r, base: gm.rb, z: zBack }; // back pitch circle
  return pivot;
}

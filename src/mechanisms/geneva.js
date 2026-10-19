// External Geneva drive: a continuously turning driver wheel with one crank pin
// indexes an n-slot star wheel, locking it between indexes.

import * as THREE from 'three';
import { TAU } from '../math.js';
import { genevaGeometry, genevaStarAngle } from '../kinematics.js';
import { PALETTE, metal, disc, pin, disposeObject } from '../parts.js';

// Geometry of the real Geneva lock. Each inter-slot region of the star carries a
// concave pocket: an arc of radius `pocketR` centred at P_i = c·(cosμ, sinμ), a
// point distance c (the centre distance) out along the region's midline μ. When
// that region rotates to face the driver, P_i lands exactly on the driver axis
// O, so a cam disc of radius `camR` (a hair smaller) centred at O nests in the
// pocket and blocks the star — and clears it only when the cam's wedge gap is
// turned to the slot being indexed. `delta` is the pocket's angular half-width.
export function lockGeometry(c, n, rim) {
  const depth = c * 0.05; // how far the pocket dips inside the rim
  const pocketR = c - rim + depth;
  const cosD = (c * c + rim * rim - pocketR * pocketR) / (2 * c * rim);
  const delta = Math.acos(Math.max(-1, Math.min(1, cosD)));
  return { pocketR, delta, camR: pocketR - c * 0.02 };
}

// Slotted star-wheel outline (extruded, centred on Z). Slot 0 is centred at
// angle PI so that, at rest, it faces the driver sitting along -x. Between slots
// the rim carries a concave locking pocket (see lockGeometry).
function starGeometry(n, rim, bottom, w, bore, thk, c) {
  const pitch = TAU / n;
  const { pocketR, delta } = lockGeometry(c, n, rim);
  const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  const dphi = Math.asin(w / rim);
  const tMouth = Math.sqrt(rim * rim - w * w);
  const pts = [];
  const V = (r, a) => new THREE.Vector2(r * Math.cos(a), r * Math.sin(a));

  for (let i = 0; i < n; i++) {
    const phi = Math.PI + i * pitch;
    const ux = Math.cos(phi), uy = Math.sin(phi); // radial (slot centre line)
    const vx = -Math.sin(phi), vy = Math.cos(phi); // tangential (slot width)

    // dive in along the trailing edge, round the bottom, climb the leading edge
    pts.push(new THREE.Vector2(ux * tMouth - vx * w, uy * tMouth - vy * w));
    pts.push(new THREE.Vector2(ux * bottom - vx * w, uy * bottom - vy * w));
    const bSteps = 6;
    for (let k = 1; k < bSteps; k++) {
      const psi = (Math.PI * k) / bSteps;
      const rr = bottom - w * Math.sin(psi);
      const off = w * Math.cos(psi);
      pts.push(new THREE.Vector2(ux * rr - vx * off, uy * rr - vy * off));
    }
    pts.push(new THREE.Vector2(ux * bottom + vx * w, uy * bottom + vy * w));
    pts.push(new THREE.Vector2(ux * tMouth + vx * w, uy * tMouth + vy * w));

    // rim -> concave locking pocket -> rim, across to the next slot
    const aExit = phi + dphi;
    const aNext = phi + pitch - dphi;
    const mu = phi + pitch / 2; // region midline
    const aLo = mu - delta;
    const aHi = mu + delta;
    for (let k = 1; k <= 4; k++) pts.push(V(rim, aExit + (aLo - aExit) * (k / 4)));
    const Px = c * Math.cos(mu);
    const Py = c * Math.sin(mu);
    const inward = mu + Math.PI; // from the pocket centre toward the star centre (concave side)
    const b1 = inward + wrap(Math.atan2(rim * Math.sin(aLo) - Py, rim * Math.cos(aLo) - Px) - inward);
    const b2 = inward + wrap(Math.atan2(rim * Math.sin(aHi) - Py, rim * Math.cos(aHi) - Px) - inward);
    for (let k = 1; k <= 10; k++) {
      const b = b1 + (b2 - b1) * (k / 10);
      pts.push(new THREE.Vector2(Px + pocketR * Math.cos(b), Py + pocketR * Math.sin(b)));
    }
    for (let k = 1; k <= 4; k++) pts.push(V(rim, aHi + (aNext - aHi) * (k / 4)));
  }

  const shape = new THREE.Shape(pts);
  if (bore > 0) {
    const h = new THREE.Path();
    h.absarc(0, 0, bore, 0, TAU, true);
    shape.holes.push(h);
  }
  const bevel = Math.min(0.5, thk * 0.08);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thk - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 24,
  });
  geo.translate(0, 0, -thk / 2 + bevel);
  geo.computeVertexNormals();
  return geo;
}

export class Geneva {
  constructor(p) {
    this.group = new THREE.Group();
    this.n = p.slots;
    const c = p.centerDistance;
    const g = genevaGeometry(this.n);
    const a = c * g.crankRatio;
    const rim = c * g.rimRatio;
    const bottom = c * g.slotBottomRatio;

    const thk = c * 0.08;
    const pinR = Math.max(c * 0.035, 1.0);
    const w = pinR * 1.5; // slot half-width
    const bore = Math.max(c * 0.06, 1.2);

    const gap = c * 0.04 + 0.6;
    const driverZ = -(thk / 2 + gap + thk / 2);

    // ---- driven star wheel (at center distance c along +x) ----
    this.star = new THREE.Object3D();
    const starMesh = new THREE.Mesh(starGeometry(this.n, rim, bottom, w, bore, thk, c), metal(PALETTE.driven));
    starMesh.castShadow = starMesh.receiveShadow = true;
    this.star.add(starMesh);
    this.star.position.set(c, 0, 0);
    this.group.add(this.star);
    this.group.add(shaftAt(c, 0, 0, bore * 0.9, thk * 1.8));

    // ---- driver wheel + crank pin + locking cam (at origin) ----
    this.driver = new THREE.Object3D();
    const driverR = Math.max(a * 1.16, c * 0.26);
    const dDisc = disc(driverR, thk, PALETTE.driver);
    dDisc.position.z = driverZ;
    this.driver.add(dDisc);

    // locking cam: a disc with a wedge gap, COPLANAR with the star and sized
    // (camR) to ride in the star's concave locking pockets during dwell. The gap
    // (width 2*gamma + margin, centred toward the star) clears the slot exactly
    // during the index window, so the cam blocks the star except while indexing.
    const { camR } = lockGeometry(c, this.n, rim);
    const camGap = 2 * g.gamma + 0.45;
    const camGeo = new THREE.CylinderGeometry(camR, camR, thk * 0.9, 48, 1, false, camGap / 2, TAU - camGap);
    // CylinderGeometry sweeps theta from +z (x = r sin, z = r cos), so rotateX alone would
    // leave the gap at planar -90 deg, a quarter turn behind the pin at +x; rotateZ puts it
    // on the pin (as in satorSquare.js).
    camGeo.rotateX(Math.PI / 2);
    camGeo.rotateZ(Math.PI / 2);
    const cam = new THREE.Mesh(camGeo, metal(PALETTE.lock, { rough: 0.6, metalness: 0.4 }));
    cam.castShadow = true;
    this.cam = cam;
    this.driver.add(cam);

    // crank pin at local (a, 0), reaching forward into the star's slot plane.
    const pinZ0 = driverZ + thk / 2;
    const pinLen = thk / 2 + 1.2 - pinZ0;
    this.driver.add(pin(a, 0, pinR, pinLen, pinZ0));

    this.group.add(this.driver);
    this.group.add(shaftAt(0, 0, driverZ, bore * 0.9, thk * 1.8));

    this.engaged = false;
  }

  update(theta) {
    this.driver.rotation.z = theta;
    const s = genevaStarAngle(theta, this.n);
    this.star.rotation.z = s.angle;
    this.engaged = s.engaged;
  }

  info() {
    const g = genevaGeometry(this.n);
    const idx = (360 / this.n).toFixed(1);
    const dwell = ((1 - (2 * g.gamma) / TAU) * 100).toFixed(0);
    return `${this.n}-slot Geneva\nindex   ${idx}° per turn\ndwell   ${dwell}% of each turn\nstate   ${this.engaged ? 'INDEXING' : 'locked'}`;
  }

  dispose() {
    disposeObject(this.group);
  }
}

function shaftAt(x, y, z, r, len) {
  const m = disc(r, len, PALETTE.shaft, { metalness: 0.85, rough: 0.3 });
  m.position.set(x, y, z);
  return m;
}

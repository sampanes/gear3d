// External Geneva drive: a continuously turning driver wheel with one crank pin
// indexes an n-slot star wheel, locking it between indexes.

import * as THREE from 'three';
import { TAU } from '../math.js';
import { genevaGeometry, genevaStarAngle } from '../kinematics.js';
import { PALETTE, metal, disc, pin, disposeObject } from '../parts.js';

// Slotted star-wheel outline (extruded, centred on Z). Slot 0 is centred at
// angle PI so that, at rest, it faces the driver sitting along -x.
function starGeometry(n, rim, bottom, w, bore, thk) {
  const pitch = TAU / n;
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

    // rim arc across to the next slot
    const aExit = phi + dphi;
    const aNext = phi + pitch - dphi;
    const rSteps = 12;
    for (let k = 1; k <= rSteps; k++) {
      pts.push(V(rim, aExit + (aNext - aExit) * (k / rSteps)));
    }
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
    const starMesh = new THREE.Mesh(starGeometry(this.n, rim, bottom, w, bore, thk), metal(PALETTE.driven));
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

    // locking cam: a disc with a wedge removed, sitting just behind the star.
    const rLock = bottom * 0.95;
    const camGap = 2 * g.gamma + 0.45;
    const camGeo = new THREE.CylinderGeometry(rLock, rLock, thk * 0.7, 48, 1, false, camGap / 2, TAU - camGap);
    camGeo.rotateX(Math.PI / 2);
    const cam = new THREE.Mesh(camGeo, metal(PALETTE.lock, { rough: 0.6, metalness: 0.4 }));
    cam.position.z = -thk * 0.6;
    cam.castShadow = true;
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

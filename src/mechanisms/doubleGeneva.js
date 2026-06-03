// Double-Geneva oscillator (true slotted-rocker drive). Two coaxial wheels
// counter-rotate; each carries one crank pin at orbit radius `a`. An output
// rocker pivots above the axle at P = (0, H) and has a single radial slot. As a
// pin reaches the top of its orbit it enters the slot and, sliding within it,
// swings the rocker; half a turn later the other pin (on the counter-rotating
// wheel) sweeps it back — a genuine pin-in-slot drive. The rocker angle is the
// geometric heading from P to the engaged pin (kinematics.doubleGenevaRocker),
// and a/H = sin(amp) makes it reach exactly ±amp with a soft (zero-velocity)
// Geneva exit, so the dwell is geometric, not scripted.

import * as THREE from 'three';
import { DEG } from '../math.js';
import { doubleGenevaRocker } from '../kinematics.js';
import { PALETTE, metal, disc, pin, disposeObject } from '../parts.js';

// A flat bar (pivot at the local origin) with a radial slot cut open at its
// outer/bottom end, extruded along z and centred on the slot plane.
function rockerGeometry(wBar, wSlot, yTop, yBot, slotInner, thk) {
  const s = new THREE.Shape();
  s.moveTo(-wBar / 2, yTop);
  s.lineTo(-wBar / 2, yBot);
  s.lineTo(-wSlot / 2, yBot); // bottom, left of the slot mouth
  s.lineTo(-wSlot / 2, -slotInner); // up the left slot wall to the closed inner end
  s.lineTo(wSlot / 2, -slotInner); // across the inner end
  s.lineTo(wSlot / 2, yBot); // down the right slot wall
  s.lineTo(wBar / 2, yBot); // bottom, right of the slot mouth
  s.lineTo(wBar / 2, yTop);
  s.closePath();
  const bevel = Math.min(0.5, thk * 0.1);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: thk - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 4,
  });
  geo.translate(0, 0, -thk / 2 + bevel);
  geo.computeVertexNormals();
  return geo;
}

export class DoubleGeneva {
  constructor(p) {
    this.group = new THREE.Group();
    this.amp = Math.min(p.amplitude * DEG, 1.5); // half-swing; < PI/2 so the slot window is valid
    const c = p.size;

    const a = (this.a = c * 0.4); // pin orbit radius
    const H = (this.H = a / Math.sin(this.amp)); // pivot height so a/H = sin(amp)
    const gammaP = Math.PI / 2 - this.amp;
    const dmin = H - a; // closest pin approach to the pivot (pin at top)
    const dmax = Math.hypot(a * Math.sin(gammaP), H - a * Math.cos(gammaP)); // at the slot mouth

    const pinR = c * 0.045;
    const wheelR = a * 1.18;
    const wheelThk = c * 0.09;
    const zGap = wheelThk / 2 + c * 0.06; // each wheel's offset from the rocker plane
    const rockerThk = c * 0.1;

    // central axle through both wheels
    this.group.add(disc(c * 0.05, 2 * zGap + wheelThk, PALETTE.shaft, { metalness: 0.85, rough: 0.25 }));

    // --- two coaxial wheels that counter-rotate, each with one pin ---
    const wheelPinLen = zGap + wheelThk / 2 + rockerThk * 0.3;
    this.front = new THREE.Object3D();
    const fDisc = disc(wheelR, wheelThk, PALETTE.driver);
    fDisc.position.z = zGap;
    this.front.add(fDisc, pin(a, 0, pinR, wheelPinLen, -rockerThk * 0.3));
    this.group.add(this.front);

    this.back = new THREE.Object3D();
    const bDisc = disc(wheelR, wheelThk, PALETTE.driven);
    bDisc.position.z = -zGap;
    this.back.add(bDisc, pin(a, 0, pinR, wheelPinLen, -(zGap + wheelThk / 2)));
    this.group.add(this.back);

    // --- slotted output rocker, pivoted at (0, H) ---
    const wSlot = 2 * pinR + c * 0.02;
    const wBar = wSlot + c * 0.12;
    const slotInner = dmin * 0.78; // closed inner end, just inside the pin's closest approach
    const yTop = c * 0.1; // small counterweight nub above the pivot
    const yBot = -(dmax + c * 0.06); // open slot mouth, just past the pin's farthest reach
    this.rocker = new THREE.Object3D();
    this.rocker.position.set(0, H, 0);
    const bar = new THREE.Mesh(rockerGeometry(wBar, wSlot, yTop, yBot, slotInner, rockerThk), metal(PALETTE.output));
    bar.castShadow = bar.receiveShadow = true;
    this.rocker.add(bar, disc(c * 0.06, c * 0.24, PALETTE.shaft, { metalness: 0.85, rough: 0.3 }));
    this.group.add(this.rocker);

    // static pivot post behind the rocker
    const post = disc(c * 0.05, c * 0.4, PALETTE.lock, { rough: 0.6, metalness: 0.3 });
    post.position.set(0, H, -c * 0.2);
    this.group.add(post);

    this.engaged = false;
    this.activePin = 0;
  }

  update(theta) {
    this.front.rotation.z = theta; // CCW
    this.back.rotation.z = -theta; // CW (counter-rotating)
    const r = doubleGenevaRocker(theta, this.amp);
    this.rocker.rotation.z = r.angle;
    this.engaged = r.engaged;
    this.activePin = r.pin;
  }

  info() {
    const dwell = ((2 * this.amp) / Math.PI) * 100;
    const state = this.engaged
      ? `pin ${this.activePin} → driving`
      : 'dwell (held)';
    return `double Geneva oscillator\nswing   ±${(this.amp / DEG).toFixed(0)}°  (${(2 * this.amp / DEG).toFixed(0)}° total)\ndwell   ${dwell.toFixed(0)}% each end (geometric)\nstate   ${state}`;
  }

  dispose() {
    disposeObject(this.group);
  }
}

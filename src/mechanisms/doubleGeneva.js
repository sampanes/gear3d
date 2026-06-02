// Double-Geneva oscillator: two coaxial wheels are joined and turn together,
// each carrying one pin 180 degrees from the other. A single lever pivoted
// above the central joint is driven to +amp by wheel 1's pin, then half a turn
// later back to -amp by wheel 2's pin — toggling back and forth in place with a
// short dwell at each extreme.

import * as THREE from 'three';
import { DEG } from '../math.js';
import { doubleGenevaOutput, doubleGenevaPinOffset } from '../kinematics.js';
import { PALETTE, metal, disc, pin, disposeObject } from '../parts.js';

function box(w, h, d, color, opts) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), metal(color, opts));
}

export class DoubleGeneva {
  constructor(p) {
    this.group = new THREE.Group();
    this.amp = p.amplitude * DEG;
    this.pushFrac = p.pushFrac;
    this.off = doubleGenevaPinOffset(p.pushFrac);

    const c = p.size;
    const a = c * 0.5; // pin orbit radius
    this.a = a;
    const wheelR = c * 0.62;
    const wheelThk = c * 0.12;
    const pinR = c * 0.05;
    const d = wheelThk * 0.5 + c * 0.06; // half the gap between the two wheels

    // central axle / joint spanning both wheels
    const axle = disc(c * 0.1, 2 * d + 2 * wheelThk, PALETTE.shaft, { metalness: 0.85, rough: 0.25 });
    this.group.add(axle);

    // --- two joined wheels (same rotation); pins mounted 180° apart ---
    this.wheels = new THREE.Object3D();
    const w1 = disc(wheelR, wheelThk, PALETTE.driver);
    w1.position.z = d + wheelThk / 2;
    const w2 = disc(wheelR, wheelThk, PALETTE.driver);
    w2.position.z = -(d + wheelThk / 2);
    this.wheels.add(w1, w2);

    // pin 1 on the front wheel reaches in toward the lever plane (z≈0);
    // pin 2 on the back wheel, at local angle 180°, reaches in from the back.
    const tip = c * 0.05;
    this.wheels.add(pin(a, 0, pinR, d + wheelThk / 2 - tip, tip)); // +x pin, front
    this.wheels.add(pin(-a, 0, pinR, d + wheelThk / 2 - tip, -(d + wheelThk / 2))); // -x pin, back
    this.group.add(this.wheels);

    // --- output lever, pivoted above the joint ---
    const H = a * 1.55; // pivot height above the axis
    const reach = a * 0.78; // tab sits where the pins crest their orbit
    const L = H - reach;
    this.lever = new THREE.Object3D();
    this.lever.position.set(0, H, 0);

    const blade = box(c * 0.05, L, c * 0.16, PALETTE.output);
    blade.position.y = -L / 2;
    const tab = box(c * 0.26, c * 0.12, c * 0.2, PALETTE.output);
    tab.position.y = -L;
    const counter = box(c * 0.16, c * 0.16, c * 0.12, PALETTE.output, { rough: 0.5 });
    counter.position.y = c * 0.12;
    const hub = disc(c * 0.07, c * 0.22, PALETTE.shaft, { metalness: 0.85, rough: 0.3 });
    this.lever.add(blade, tab, counter, hub);
    this.group.add(this.lever);

    // pivot post (static) behind the lever
    const post = disc(c * 0.05, c * 0.4, PALETTE.lock, { rough: 0.6, metalness: 0.3 });
    post.position.set(0, H, -c * 0.18);
    this.group.add(post);

    this.active = 0;
  }

  update(theta) {
    this.wheels.rotation.z = theta + this.off;
    const o = doubleGenevaOutput(theta, this.amp, this.pushFrac);
    this.lever.rotation.z = o.angle;
    this.active = o.active;
  }

  info() {
    const swing = (this.amp / DEG * 2).toFixed(0);
    const state =
      this.active === 1 ? 'wheel 1 → driving' : this.active === 2 ? 'wheel 2 ← driving' : 'dwell';
    return `double Geneva oscillator\nswing   ±${(this.amp / DEG).toFixed(0)}°  (${swing}° total)\ndwell   ${(100 - this.pushFrac * 100).toFixed(0)}% each end\nstate   ${state}`;
  }

  dispose() {
    disposeObject(this.group);
  }
}

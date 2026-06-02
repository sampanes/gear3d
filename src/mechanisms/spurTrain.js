// A chain of meshing involute spur gears with correct center distances,
// telescoping speed ratios and interlocking tooth phase.

import * as THREE from 'three';
import { makeGear } from '../gears/gear.js';
import { gearMetrics } from '../gears/involute.js';
import { spurTrainPhases, spurGearAngle } from '../kinematics.js';
import { PALETTE, disc, disposeObject } from '../parts.js';

export class SpurTrain {
  constructor(p) {
    this.group = new THREE.Group();
    this.teeth = p.teeth.slice();
    this.phases = spurTrainPhases(this.teeth);
    this.gears = [];

    const bore = Math.max(p.module * 0.85, 1.2);
    let x = 0;
    let prevR = 0;
    for (let i = 0; i < this.teeth.length; i++) {
      const gp = { module: p.module, teeth: this.teeth[i], pressureAngle: p.pressureAngle };
      const m = gearMetrics(gp);
      if (i > 0) x += prevR + m.r; // center distance r_{i-1} + r_i
      prevR = m.r;

      // Keep the bore strictly inside the root circle so it never punches
      // through the teeth on a tiny pinion (only bites below the GUI ranges).
      const safeBore = Math.min(bore, m.rf * 0.6);
      const color = i === 0 ? PALETTE.driver : PALETTE.driven;
      // Alternate the helix hand down the chain so adjacent gears mesh.
      const helix = (i % 2 === 0 ? 1 : -1) * (p.helix || 0);
      const gear = makeGear(gp, color, { thickness: p.thickness, bore: safeBore, helix });
      gear.position.set(x, 0, 0);
      this.group.add(gear);
      this.gears.push(gear);

      const shaft = disc(safeBore * 0.92, p.thickness * 1.6, PALETTE.shaft, {
        metalness: 0.85,
        rough: 0.3,
      });
      shaft.position.set(x, 0, 0);
      this.group.add(shaft);
    }
  }

  update(theta0) {
    for (let i = 0; i < this.gears.length; i++) {
      this.gears[i].rotation.z = spurGearAngle(i, theta0, this.teeth, this.phases);
    }
  }

  info() {
    const z = this.teeth;
    const ratio = z[0] / z[z.length - 1];
    return `teeth   ${z.join(' · ')}\nratio   in:out = ${ratio.toFixed(3)} : 1\nlast gear spins ${Math.abs(ratio).toFixed(2)}× the driver`;
  }

  dispose() {
    disposeObject(this.group);
  }
}

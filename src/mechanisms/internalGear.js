// Internal gear pair: a pinion (external, driver) meshing inside a ring gear
// (internal, driven). They turn the same direction; the ring turns slower by
// z_pinion / z_ring. The pinion sits at centre distance (r_ring - r_pinion) so
// the pitch circles touch on +x, where a pinion tooth drops into a ring gap.

import * as THREE from 'three';
import { makeGear, makeRingGear } from '../gears/gear.js';
import { gearMetrics, internalGearMetrics } from '../gears/involute.js';
import { internalGearRatio } from '../kinematics.js';
import { PALETTE, disc, disposeObject } from '../parts.js';
import { DIG_LIMIT, internalGearInterference } from '../gears/meshcheck.js';

export class InternalGear {
  constructor(p) {
    this.group = new THREE.Group();
    const { module: m, pressureAngle: pa, thickness: t } = p;
    this.zp = p.pinionTeeth;
    // Ring must be the larger gear: +4 keeps the geometry valid at all. Whether the
    // teeth actually clear is measured below (a full-depth ring needs a much bigger
    // difference, more so at low pressure angles), and every shortfall is reported in
    // `problems` (shown in the readout; export refuses) rather than hidden.
    this.zr = Math.max(p.ringTeeth, this.zp + 4);
    this.problems = [];
    if (this.zr !== p.ringTeeth) {
      this.problems.push(`ring raised from ${p.ringTeeth} to ${this.zr} teeth (must exceed the pinion by 4+)`);
    }

    const pinM = gearMetrics({ module: m, teeth: this.zp, pressureAngle: pa });
    const ringM = internalGearMetrics({ module: m, teeth: this.zr, pressureAngle: pa });
    this.d = ringM.r - pinM.r; // centre distance (pinion inside ring)
    this.ratio = internalGearRatio(this.zp, this.zr);
    this.ringPhase = Math.PI / this.zr; // rotate a gap to face the pinion at rest

    // ring gear (driven), centred at the origin
    const bl = p.backlash ?? 0;
    this.ring = makeRingGear({ module: m, teeth: this.zr, pressureAngle: pa, backlash: bl }, PALETTE.driven, { thickness: t });
    this.group.add(this.ring);

    // pinion (driver), offset along +x so it meshes there; a tooth points +x at rest
    const bore = Math.min(Math.max(m * 0.85, 1.2), pinM.rf * 0.6);
    this.pinion = makeGear({ module: m, teeth: this.zp, pressureAngle: pa, backlash: bl }, PALETTE.driver, { thickness: t, bore });
    this.pinion.position.set(this.d, 0, 0);
    this.group.add(this.pinion);

    const shaft = disc(bore * 0.92, t * 1.8, PALETTE.shaft, { metalness: 0.85, rough: 0.3 });
    shaft.position.set(this.d, 0, 0);
    this.group.add(shaft);

    const dig = internalGearInterference(this, p, 8);
    this.update(0);
    if (dig > DIG_LIMIT * m) {
      this.problems.push(`teeth collide by ${dig.toFixed(2)} mm: use more ring teeth or a higher pressure angle`);
    }
  }

  update(theta) {
    this.pinion.rotation.z = theta; // pinion is the driver
    this.ring.rotation.z = this.ratio * theta + this.ringPhase; // same direction, slower
  }

  info() {
    const warn = this.problems.map((s) => `\n[!] ${s}`).join('');
    return `internal pair  z ${this.zp} -> ${this.zr}\nring spins ${this.ratio.toFixed(3)}x the pinion (same dir)\ncenter dist ${this.d.toFixed(1)}${warn}`;
  }

  dispose() {
    disposeObject(this.group);
  }
}

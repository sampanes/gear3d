// Bevel gear pair on intersecting (90°) shafts. Both gears are cones with a
// shared apex at the origin: gear A spins about +Z, gear B about +Y. Their pitch
// cones (half-angles gammaA + gammaB = 90°) are tangent along a common element,
// where the teeth mesh. Rolling contact gives omega_B = -(zA/zB)*omega_A.

import * as THREE from 'three';
import { makeBevelGear } from '../gears/gear.js';
import { gearMetrics } from '../gears/involute.js';
import { bevelConeAngles } from '../kinematics.js';
import { PALETTE, disc, disposeObject } from '../parts.js';

export class BevelPair {
  constructor(p) {
    this.group = new THREE.Group();
    const { module: m, pressureAngle: pa } = p;
    this.zA = p.pinionTeeth;
    this.zB = p.gearTeeth;
    const { gammaA, gammaB, ratio } = bevelConeAngles(this.zA, this.zB, Math.PI / 2);
    this.gammaA = gammaA;
    this.gammaB = gammaB;
    this.ratio = ratio; // |omega_B / omega_A| = zA / zB

    const mA = gearMetrics({ module: m, teeth: this.zA, pressureAngle: pa });
    const mB = gearMetrics({ module: m, teeth: this.zB, pressureAngle: pa });
    const D = mA.r / Math.sin(gammaA); // shared slant cone distance (= mB.r / sin gammaB)
    const face = Math.min(p.faceWidth, 0.4 * D);
    const boreA = Math.min(Math.max(m * 0.85, 1.2), mA.rf * 0.5);
    const boreB = Math.min(Math.max(m * 0.85, 1.2), mB.rf * 0.5);

    // gear A (driver), axis +Z, apex at the origin
    const bl = p.backlash ?? 0;
    this.gearA = makeBevelGear({ module: m, teeth: this.zA, pressureAngle: pa, backlash: bl }, PALETTE.driver, {
      faceWidth: face,
      coneAngle: gammaA,
      bore: boreA,
    });
    this.group.add(this.gearA);
    const shaftA = disc(boreA * 0.9, D * 0.5, PALETTE.shaft, { metalness: 0.85, rough: 0.3 });
    shaftA.position.z = D * Math.cos(gammaA) + D * 0.25; // out the back, away from the apex
    this.group.add(shaftA);

    // gear B (driven), axis +Y: orient -90° about X so local +Z -> world +Y, apex still at origin
    this.bOrient = new THREE.Group();
    this.bOrient.rotation.x = -Math.PI / 2;
    this.group.add(this.bOrient);
    this.gearB = makeBevelGear({ module: m, teeth: this.zB, pressureAngle: pa, backlash: bl }, PALETTE.driven, {
      faceWidth: face,
      coneAngle: gammaB,
      bore: boreB,
    });
    this.bOrient.add(this.gearB);
    const shaftB = disc(boreB * 0.9, D * 0.5, PALETTE.shaft, { metalness: 0.85, rough: 0.3 });
    shaftB.position.z = D * Math.cos(gammaB) + D * 0.25;
    this.bOrient.add(shaftB);

    // best-effort static mesh phase (a tooth of B faces the gap at the contact);
    // the ratio/geometry are exact, this offset is a visual nicety.
    this.phaseB = Math.PI / this.zB;
  }

  update(theta) {
    this.gearA.rotation.z = theta;
    this.gearB.rotation.z = -this.ratio * theta + this.phaseB; // rolling contact -> counter-rotate
  }

  info() {
    return `bevel pair  z ${this.zA} : ${this.zB}\nratio ${(1 / this.ratio).toFixed(2)}:1  (pinion → gear)\ncones ${((this.gammaA * 180) / Math.PI).toFixed(0)}° + ${((this.gammaB * 180) / Math.PI).toFixed(0)}° = 90°`;
  }

  dispose() {
    disposeObject(this.group);
  }
}

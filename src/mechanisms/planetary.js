// Planetary (epicyclic) gearset: a central sun, N planets on a rotating carrier,
// and a surrounding internal ring (zRing = zSun + 2*zPlanet). One member is held
// (configurable); the planets mesh with the sun externally and the ring
// internally at the same time. Rates come from kinematics.planetaryAngles; the
// static mesh phases reuse the validated sum (external) / difference (internal)
// tooth-phase conditions, evaluated in the carrier frame at theta = 0.

import * as THREE from 'three';
import { makeGear, makeRingGear } from '../gears/gear.js';
import { gearMetrics } from '../gears/involute.js';
import { planetaryAngles, planetaryAssembly, toothPhaseAt } from '../kinematics.js';
import { TAU } from '../math.js';
import { PALETTE, metal, disc, disposeObject } from '../parts.js';
import { DIG_LIMIT, planetaryInterference } from '../gears/meshcheck.js';

export class Planetary {
  constructor(p) {
    this.group = new THREE.Group();
    const { module: m, pressureAngle: pa, thickness: t } = p;
    const zS = (this.zSun = p.sunTeeth);
    const zP = (this.zPlanet = p.planetTeeth);
    const N = (this.n = p.planets);
    const zR = (this.zRing = zS + 2 * zP);
    this.fixed = p.fixed || 'ring';
    this.assembly = planetaryAssembly(zS, zR, N); // integer => all planets mesh
    // otherwise only some planets can sit in mesh and the rest pass through the sun and
    // ring teeth: reported (readout; export refuses), never built silently
    this.problems = Number.isInteger(this.assembly) ? [] : [
      `planets cannot all mesh: (sun + ring) / planets = ${this.assembly.toFixed(2)} must be whole`,
    ];

    const sunM = gearMetrics({ module: m, teeth: zS, pressureAngle: pa });
    const planetM = gearMetrics({ module: m, teeth: zP, pressureAngle: pa });
    const rc = sunM.r + planetM.r; // planet-centre orbit radius
    this.rc = rc;
    const pitchP = TAU / zP;
    const pitchR = TAU / zR;

    // sun (centre, external)
    const bl = p.backlash ?? 0;
    const sunBore = Math.min(Math.max(m * 0.85, 1.2), sunM.rf * 0.6);
    this.sun = makeGear({ module: m, teeth: zS, pressureAngle: pa, backlash: bl }, PALETTE.driver, { thickness: t, bore: sunBore });
    this.group.add(this.sun);

    // ring (internal), centred
    this.ring = makeRingGear({ module: m, teeth: zR, pressureAngle: pa, backlash: bl }, PALETTE.shaft, { thickness: t });
    this.group.add(this.ring);

    // carrier (rotates), holding the planets and the arms + hub behind them
    this.carrier = new THREE.Group();
    this.group.add(this.carrier);
    const hub = disc(sunM.rf * 0.55, t * 0.6, PALETTE.output, { metalness: 0.5 });
    hub.position.z = -t * 0.85;
    this.carrier.add(hub);

    this.planets = [];
    this.planetPhase = [];
    const planetBore = Math.min(Math.max(m * 0.85, 1.2), planetM.rf * 0.6);
    for (let k = 0; k < N; k++) {
      const phi = (TAU * k) / N; // planet position in the carrier frame
      // mesh with the sun: external sum condition at the contact (dir phi+PI on
      // the planet), with the sun at rotation 0 in the carrier frame.
      const A = toothPhaseAt(0, phi, zS);
      const phase = phi + Math.PI - (0.5 - A) * pitchP;
      this.planetPhase.push(phase);

      const planet = makeGear({ module: m, teeth: zP, pressureAngle: pa, backlash: bl }, PALETTE.driven, { thickness: t, bore: planetBore });
      planet.position.set(rc * Math.cos(phi), rc * Math.sin(phi), 0);
      this.carrier.add(planet);
      this.planets.push(planet);

      const arm = new THREE.Mesh(new THREE.BoxGeometry(rc, m * 1.6, t * 0.5), metal(PALETTE.output, { metalness: 0.5 }));
      arm.position.set((rc / 2) * Math.cos(phi), (rc / 2) * Math.sin(phi), -t * 0.85);
      arm.rotation.z = phi;
      arm.castShadow = true;
      this.carrier.add(arm);
    }

    // ring phase: mesh the ring with planet 0 (internal difference condition at
    // the contact dir 0, where the planet faces outward toward the ring).
    const B = toothPhaseAt(this.planetPhase[0], 0, zP);
    this.ringPhase = -(0.5 + B) * pitchR;

    // a whole assembly count still leaves small planets digging into a full-depth ring
    if (!this.problems.length) {
      const dig = planetaryInterference(this, p, 6, 1);
      this.update(0);
      if (dig > DIG_LIMIT * m) {
        this.problems.push(`teeth collide by ${dig.toFixed(2)} mm: use bigger planets or a higher pressure angle`);
      }
    }
  }

  update(theta) {
    const a = planetaryAngles(theta, this.zSun, this.zPlanet, this.fixed);
    this.sun.rotation.z = a.sun;
    this.ring.rotation.z = a.ring + this.ringPhase;
    this.carrier.rotation.z = a.carrier;
    for (let k = 0; k < this.n; k++) {
      // child of the carrier: world spin = planetSpin + phase, so subtract carrier
      this.planets[k].rotation.z = a.planetSpin + this.planetPhase[k] - a.carrier;
    }
  }

  info() {
    const r = {
      ring: `${((this.zSun + this.zRing) / this.zSun).toFixed(2)}:1  sun→carrier`,
      carrier: `${(this.zRing / this.zSun).toFixed(2)}:1  sun→ring (reversed)`,
      sun: `${((this.zSun + this.zRing) / this.zRing).toFixed(2)}:1  carrier→ring`,
    };
    const warn = this.problems.map((s) => `\n[!] ${s}`).join('');
    return `planetary  S${this.zSun} / P${this.zPlanet} x${this.n} / R${this.zRing}\nfixed ${this.fixed}\n${r[this.fixed]}${warn}`;
  }

  dispose() {
    disposeObject(this.group);
  }
}

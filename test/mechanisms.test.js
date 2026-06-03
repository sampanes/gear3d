// Integration tests for the six mechanism classes (src/mechanisms/*). The pure
// motion math is covered in kinematics.test.js; these assert that each class
// (a) honours the shared contract, (b) wires update(theta) onto the right child
// rotations exactly as the kinematics functions prescribe (the frame/sign
// conversions are where bugs hide), and (c) frees its geometry on dispose().
// three loads fine under node, so this runs headless like gear.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DEG, TAU, mod } from '../src/math.js';
import { SpurTrain } from '../src/mechanisms/spurTrain.js';
import { Geneva } from '../src/mechanisms/geneva.js';
import { DoubleGeneva } from '../src/mechanisms/doubleGeneva.js';
import { InternalGear } from '../src/mechanisms/internalGear.js';
import { Planetary } from '../src/mechanisms/planetary.js';
import { BevelPair } from '../src/mechanisms/bevelGears.js';
import {
  spurTrainPhases,
  spurGearAngle,
  genevaStarAngle,
  doubleGenevaOutput,
  doubleGenevaPinOffset,
  internalGearRatio,
  planetaryAngles,
  bevelConeAngles,
  toothPhaseAt,
} from '../src/kinematics.js';

const near = (a, b, eps = 1e-12, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} !~= ${b}`);

// Default parameters mirroring src/main.js's config object.
const CONFIG = {
  spur: { teeth: [12, 24, 18], module: 5, pressureAngle: 20, thickness: 8, helix: 0 },
  geneva: { slots: 4, centerDistance: 100 },
  double: { amplitude: 35, pushFrac: 0.62, size: 100 },
  internal: { module: 4, pinionTeeth: 12, ringTeeth: 48, pressureAngle: 20, thickness: 8 },
  planetary: { module: 4, sunTeeth: 12, planetTeeth: 12, planets: 3, pressureAngle: 20, thickness: 8, fixed: 'ring' },
  bevel: { module: 4, pinionTeeth: 16, gearTeeth: 24, pressureAngle: 20, faceWidth: 14 },
};

const builders = [
  ['SpurTrain', () => new SpurTrain(CONFIG.spur)],
  ['Geneva', () => new Geneva(CONFIG.geneva)],
  ['DoubleGeneva', () => new DoubleGeneva(CONFIG.double)],
  ['InternalGear', () => new InternalGear(CONFIG.internal)],
  ['Planetary', () => new Planetary(CONFIG.planetary)],
  ['BevelPair', () => new BevelPair(CONFIG.bevel)],
];

// A spread of driver angles incl. zero, negative, and multi-revolution.
const THETAS = [0, 0.37, 2.1, -1.3, TAU + 0.4, 5 * TAU - 0.8];

// ---------------------------------------------------------------------------
// Contract conformance (guards the bar a future 7th mode — e.g. SATOR — meets)
// ---------------------------------------------------------------------------
test('every mechanism follows the contract: group / update / info / dispose', () => {
  for (const [name, make] of builders) {
    const mech = make();
    assert.ok(mech.group instanceof THREE.Group, `${name}: group is a THREE.Group`);
    assert.equal(typeof mech.update, 'function', `${name}: has update()`);
    assert.equal(typeof mech.info, 'function', `${name}: has info()`);
    assert.equal(typeof mech.dispose, 'function', `${name}: has dispose()`);
    const s = mech.info();
    assert.ok(typeof s === 'string' && s.length > 0, `${name}: info() returns a non-empty string`);
    for (const theta of THETAS) {
      assert.doesNotThrow(() => mech.update(theta), `${name}: update(${theta}) throws`);
    }
    mech.dispose();
  }
});

test('dispose() detaches the group from its parent and frees every geometry', () => {
  for (const [name, make] of builders) {
    const mech = make();
    const scene = new THREE.Group();
    scene.add(mech.group);

    // Patch each geometry's dispose to count calls (materials are shared, so
    // disposeObject deliberately only frees geometries — parts.js:60-66).
    const geos = [];
    mech.group.traverse((o) => {
      if (o.geometry) geos.push(o.geometry);
    });
    assert.ok(geos.length > 0, `${name}: built some geometry`);
    let disposed = 0;
    for (const g of geos) {
      const orig = g.dispose.bind(g);
      g.dispose = () => {
        disposed += 1;
        orig();
      };
    }

    mech.dispose();
    assert.equal(mech.group.parent, null, `${name}: group detached from parent`);
    assert.equal(disposed, geos.length, `${name}: all geometries disposed`);
  }
});

// ---------------------------------------------------------------------------
// update(theta) wiring — child rotations must equal the kinematics functions
// ---------------------------------------------------------------------------
test('SpurTrain.update sets each gear angle to spurGearAngle()', () => {
  const m = new SpurTrain(CONFIG.spur);
  const phases = spurTrainPhases(CONFIG.spur.teeth);
  for (const theta of THETAS) {
    m.update(theta);
    for (let i = 0; i < CONFIG.spur.teeth.length; i++) {
      near(m.gears[i].rotation.z, spurGearAngle(i, theta, CONFIG.spur.teeth, phases), 1e-12, `gear ${i} @${theta}`);
    }
  }
});

test('Geneva.update drives the star by genevaStarAngle() and mirrors engaged', () => {
  const m = new Geneva(CONFIG.geneva);
  for (const theta of THETAS) {
    m.update(theta);
    const s = genevaStarAngle(theta, CONFIG.geneva.slots);
    near(m.driver.rotation.z, theta, 1e-12, `driver @${theta}`);
    near(m.star.rotation.z, s.angle, 1e-12, `star @${theta}`);
    assert.equal(m.engaged, s.engaged, `engaged @${theta}`);
  }
});

test('DoubleGeneva.update toggles the lever via doubleGenevaOutput() and offsets the wheels', () => {
  const m = new DoubleGeneva(CONFIG.double);
  const amp = CONFIG.double.amplitude * DEG;
  const off = doubleGenevaPinOffset(CONFIG.double.pushFrac);
  for (const theta of THETAS) {
    m.update(theta);
    const o = doubleGenevaOutput(theta, amp, CONFIG.double.pushFrac);
    near(m.lever.rotation.z, o.angle, 1e-12, `lever @${theta}`);
    near(m.wheels.rotation.z, theta + off, 1e-12, `wheels @${theta}`);
  }
});

test('InternalGear.update spins the pinion 1:1 and the ring by internalGearRatio() (same direction)', () => {
  const m = new InternalGear(CONFIG.internal);
  const zr = Math.max(CONFIG.internal.ringTeeth, CONFIG.internal.pinionTeeth + 4);
  const ratio = internalGearRatio(CONFIG.internal.pinionTeeth, zr);
  for (const theta of THETAS) {
    m.update(theta);
    near(m.pinion.rotation.z, theta, 1e-12, `pinion @${theta}`);
    near(m.ring.rotation.z, ratio * theta + m.ringPhase, 1e-12, `ring @${theta}`);
  }
});

test('Planetary.update places sun/ring/carrier per planetaryAngles() and converts planet spin to the carrier frame', () => {
  const m = new Planetary(CONFIG.planetary);
  for (const theta of THETAS) {
    m.update(theta);
    const a = planetaryAngles(theta, CONFIG.planetary.sunTeeth, CONFIG.planetary.planetTeeth, CONFIG.planetary.fixed);
    near(m.sun.rotation.z, a.sun, 1e-12, `sun @${theta}`);
    near(m.carrier.rotation.z, a.carrier, 1e-12, `carrier @${theta}`);
    near(m.ring.rotation.z, a.ring + m.ringPhase, 1e-12, `ring @${theta}`);
    for (let k = 0; k < CONFIG.planetary.planets; k++) {
      // child of the carrier: world spin = planetSpin + phase, so subtract carrier
      near(m.planets[k].rotation.z, a.planetSpin + m.planetPhase[k] - a.carrier, 1e-12, `planet ${k} @${theta}`);
    }
  }
});

test('BevelPair.update spins gear A 1:1 and counter-rotates gear B by the ratio', () => {
  const m = new BevelPair(CONFIG.bevel);
  const { ratio } = bevelConeAngles(CONFIG.bevel.pinionTeeth, CONFIG.bevel.gearTeeth, Math.PI / 2);
  const phaseB = Math.PI / CONFIG.bevel.gearTeeth;
  for (const theta of THETAS) {
    m.update(theta);
    near(m.gearA.rotation.z, theta, 1e-12, `gearA @${theta}`);
    near(m.gearB.rotation.z, -ratio * theta + phaseB, 1e-12, `gearB @${theta}`);
  }
});

// ---------------------------------------------------------------------------
// Static mesh-phase interlock — recomputed from the RENDERED transforms (the
// rotation.z the scene actually shows), NOT from the constructor's stored
// planetPhase/ringPhase constants, so these catch a wrong assembly-phase
// formula (teeth that visually clash) that the wiring tests above cannot.
// ---------------------------------------------------------------------------
test('Planetary: sun↔planet teeth interlock (tooth-in-gap, sum = 0.5) and stay interlocked under rotation', () => {
  const m = new Planetary(CONFIG.planetary);
  const { sunTeeth: zS, planetTeeth: zP, planets: N } = CONFIG.planetary;
  for (const theta of [0, 0.4, 1.3, -2.0, TAU + 0.6]) {
    m.update(theta);
    const carrier = m.carrier.rotation.z;
    for (let k = 0; k < N; k++) {
      const dir = (TAU * k) / N + carrier; // world contact direction sun → planet k
      const planetWorld = m.planets[k].rotation.z + carrier; // planet is a child of the carrier
      const sunFacing = toothPhaseAt(m.sun.rotation.z, dir, zS); // sun faces the planet
      const planetFacing = toothPhaseAt(planetWorld, dir + Math.PI, zP); // planet faces the sun
      near(mod(sunFacing + planetFacing, 1), 0.5, 1e-9, `sun↔planet ${k} @${theta}`);
    }
  }
});

test('Planetary: planet0↔ring teeth interlock (internal difference = 0.5) — pins the ring mesh phase', () => {
  const m = new Planetary(CONFIG.planetary);
  const { sunTeeth: zS, planetTeeth: zP } = CONFIG.planetary;
  const zR = zS + 2 * zP;
  m.update(0); // planet 0 sits at carrier-frame angle 0; the ring contact is outward at dir 0
  const planetWorld = m.planets[0].rotation.z + m.carrier.rotation.z;
  const planetFacing = toothPhaseAt(planetWorld, 0, zP);
  const ringFacing = toothPhaseAt(m.ring.rotation.z, 0, zR);
  near(mod(ringFacing - planetFacing, 1), 0.5, 1e-9, 'internal difference = 0.5');
});

test('SpurTrain threads a non-zero helix into the gear geometry (twists the walls)', () => {
  const vcount = (m) => {
    let n = 0;
    m.group.traverse((o) => {
      if (o.geometry) n += o.geometry.attributes.position.count;
    });
    return n;
  };
  const straight = new SpurTrain({ ...CONFIG.spur, helix: 0 });
  const helical = new SpurTrain({ ...CONFIG.spur, helix: 25 });
  // twistAboutZ subdivides the gear walls, so a helical train has strictly more
  // vertices — this fails if helix stops reaching makeGear (regression guard).
  assert.ok(vcount(helical) > vcount(straight), `helix subdivides walls (helical ${vcount(helical)} > straight ${vcount(straight)})`);
  straight.dispose();
  helical.dispose();
});

test('InternalGear clamps ringTeeth up to the pinion+4 validity floor', () => {
  const cfg = { module: 4, pinionTeeth: 20, ringTeeth: 18, pressureAngle: 20, thickness: 8 };
  const m = new InternalGear(cfg);
  assert.equal(m.zr, 24, 'ringTeeth (18) clamped up to pinionTeeth+4 (24)');
  const ratio = internalGearRatio(cfg.pinionTeeth, 24);
  near(m.ratio, ratio, 1e-12, 'ratio uses the clamped count');
  for (const theta of THETAS) {
    m.update(theta);
    near(m.ring.rotation.z, ratio * theta + m.ringPhase, 1e-12, `ring @${theta}`);
  }
  m.dispose();
});

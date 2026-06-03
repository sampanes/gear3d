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
import { Geneva, lockGeometry } from '../src/mechanisms/geneva.js';
import { DoubleGeneva } from '../src/mechanisms/doubleGeneva.js';
import { InternalGear } from '../src/mechanisms/internalGear.js';
import { Planetary } from '../src/mechanisms/planetary.js';
import { BevelPair } from '../src/mechanisms/bevelGears.js';
import { SatorSquare, defaultCells, behaviorOptions, cellKey, PRESETS } from '../src/mechanisms/satorSquare.js';
import {
  spurTrainPhases,
  spurGearAngle,
  genevaStarAngle,
  genevaGeometry,
  doubleGenevaRocker,
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
  double: { amplitude: 35, size: 100 },
  internal: { module: 4, pinionTeeth: 12, ringTeeth: 48, pressureAngle: 20, thickness: 8 },
  planetary: { module: 4, sunTeeth: 12, planetTeeth: 12, planets: 3, pressureAngle: 20, thickness: 8, fixed: 'ring' },
  bevel: { module: 4, pinionTeeth: 16, gearTeeth: 24, pressureAngle: 20, faceWidth: 14 },
  sator: { cell: 40, thickness: 6, spinN: 4, indexClicks: 4, pushFrac: 0.62 },
};

const builders = [
  ['SpurTrain', () => new SpurTrain(CONFIG.spur)],
  ['Geneva', () => new Geneva(CONFIG.geneva)],
  ['DoubleGeneva', () => new DoubleGeneva(CONFIG.double)],
  ['InternalGear', () => new InternalGear(CONFIG.internal)],
  ['Planetary', () => new Planetary(CONFIG.planetary)],
  ['BevelPair', () => new BevelPair(CONFIG.bevel)],
  ['SatorSquare', () => new SatorSquare(CONFIG.sator)],
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

test('Geneva lock geometry: the cam nests inside the pocket and the pocket fits between the slots', () => {
  const c = 100;
  for (const n of [3, 4, 5, 6, 8, 12]) {
    const g = genevaGeometry(n);
    const rim = c * g.rimRatio;
    const { pocketR, delta, camR } = lockGeometry(c, n, rim);
    assert.ok(pocketR > 0, `n=${n}: pocketR > 0`);
    assert.ok(camR > 0 && camR < pocketR, `n=${n}: cam nests with clearance (${camR} < ${pocketR})`);
    const deepest = c - pocketR; // the pocket's innermost radius
    assert.ok(deepest < rim, `n=${n}: pocket dips inside the rim`);
    assert.ok(deepest > c * g.slotBottomRatio, `n=${n}: pocket stays above the slot bottom`);
    // pocket half-width must fit within the inter-slot rim (leave a flank either side)
    const dphi = Math.asin((Math.max(c * 0.035, 1.0) * 1.5) / rim);
    const regionHalf = Math.PI / n - dphi;
    assert.ok(delta > 0 && delta < regionHalf, `n=${n}: pocket fits between slots (${delta} < ${regionHalf})`);
  }
});

test('DoubleGeneva.update rocks the slotted output via doubleGenevaRocker and counter-rotates the wheels', () => {
  const m = new DoubleGeneva(CONFIG.double);
  const amp = Math.min(CONFIG.double.amplitude * DEG, 1.5);
  for (const theta of THETAS) {
    m.update(theta);
    const r = doubleGenevaRocker(theta, amp);
    near(m.rocker.rotation.z, r.angle, 1e-12, `rocker @${theta}`);
    near(m.front.rotation.z, theta, 1e-12, `front wheel (CCW) @${theta}`);
    near(m.back.rotation.z, -theta, 1e-12, `back wheel (CW) @${theta}`);
  }
});

test('DoubleGeneva: the engaged pin truly rides on the rocker slot centerline (real slot)', () => {
  const m = new DoubleGeneva(CONFIG.double);
  const amp = Math.min(CONFIG.double.amplitude * DEG, 1.5);
  for (let i = 0; i <= 200; i++) {
    const theta = (i / 200) * TAU;
    m.update(theta);
    const r = doubleGenevaRocker(theta, amp);
    if (!r.engaged) continue;
    const px = m.a * Math.cos(theta); // both pins share x = a·cos(theta)
    const py = m.a * (r.pin === 1 ? Math.sin(theta) : -Math.sin(theta));
    const lx = px * Math.cos(r.angle) + (py - m.H) * Math.sin(r.angle); // rocker-local x; slot runs along -y'
    assert.ok(Math.abs(lx) < 1e-9, `theta=${theta.toFixed(3)} pin ${r.pin} off slot centerline by ${lx}`);
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

// ---------------------------------------------------------------------------
// SATOR square — the 7th mode, wired additively via the MODES registry
// ---------------------------------------------------------------------------
test('SatorSquare: 25 tiles with the default behavior palette (4 O-flips, 1 spin, fixed N)', () => {
  const m = new SatorSquare(CONFIG.sator);
  assert.equal(m.tiles.length, 25, '5×5 grid');
  assert.equal(m.counts.flip, 4, 'the four O tiles flip');
  assert.equal(m.counts.fixed, 1, 'the centre N is the fixed hub');
  assert.equal(m.counts.spin, 1, 'one diversity spin tile');
  assert.equal(m.counts.upright + m.counts.flip + m.counts.spin + m.counts.fixed, 25, 'every cell assigned');
});

test('SatorSquare: every tile reads legibly at each 90° detent (upright, or 0/π for the O flips)', () => {
  const m = new SatorSquare(CONFIG.sator);
  for (let k = 0; k < 4; k++) {
    const phi = (k * Math.PI) / 2;
    m.update(phi);
    for (const t of m.tiles) {
      const world = mod(m.decor.rotation.z + t.letterPivot.rotation.z, TAU); // absolute orientation
      if (t.behavior === 'flip') {
        assert.ok(Math.min(world, Math.abs(world - Math.PI), TAU - world) < 1e-6, `${t.letter} flip legible @${k}·90°`);
      } else {
        assert.ok(Math.min(world, TAU - world) < 1e-6, `${t.letter} (${t.behavior}) upright @${k}·90° (world ${world})`);
      }
    }
  }
});

test('SatorSquare: letters live only in decor, not in the printable (STL) sub-group', () => {
  const m = new SatorSquare(CONFIG.sator);
  const countLetters = (root) => {
    let n = 0;
    root.traverse((o) => {
      if (o.userData && o.userData.isLetter) n += 1;
    });
    return n;
  };
  assert.equal(countLetters(m.printable), 0, 'no letters in the printable sub-group');
  assert.equal(countLetters(m.decor), 25, 'all 25 letters in the decor sub-group');
});

// ----- P5: per-cell editor domain model -----
test('behaviorOptions enforces the design constraints (flip only on symmetric, fixed only centre)', () => {
  assert.deepEqual(behaviorOptions(2, 2), ['fixed'], 'centre is the fixed hub only');
  assert.ok(behaviorOptions(0, 3).includes('flip'), '(0,3) O may flip');
  assert.ok(behaviorOptions(0, 0).includes('flip'), '(0,0) S may flip');
  assert.ok(!behaviorOptions(0, 2).includes('flip'), '(0,2) T may NOT flip (not symmetric)');
  assert.ok(!behaviorOptions(0, 1).includes('fixed'), 'fixed is centre-only');
  assert.ok(behaviorOptions(0, 2).includes('spin'), 'any tile may spin');
});

test('every built-in preset assigns a legal behavior to all 25 cells', () => {
  for (const [name, make] of Object.entries(PRESETS)) {
    const cells = make();
    assert.equal(Object.keys(cells).length, 25, `${name}: 25 cells`);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        assert.ok(behaviorOptions(r, c).includes(cells[cellKey(r, c)]), `${name}: (${r},${c})=${cells[cellKey(r, c)]} illegal`);
      }
    }
  }
});

test('SatorSquare: index (single-Geneva click) tiles report emergent legibility tracking the winding', () => {
  const cells = defaultCells();
  cells[cellKey(0, 3)] = 'index'; // (0,3) is an O — index is allowed
  const legible = new SatorSquare({ ...CONFIG.sator, cells, spinN: 4 });
  const broken = new SatorSquare({ ...CONFIG.sator, cells, spinN: 1 });
  assert.equal(legible.counts.index, 1, 'one index tile');
  assert.equal(legible.legible, true, 'winding 4 → upright at every 90° detent');
  assert.equal(broken.legible, false, 'winding 1 → not upright at the detents');
  // when legible, the index tile actually reads upright at each 90° detent
  for (let j = 0; j < 4; j++) {
    legible.update((j * Math.PI) / 2);
    const t = legible.tiles.find((x) => x.behavior === 'index');
    const world = mod(legible.decor.rotation.z + t.letterPivot.rotation.z, TAU);
    assert.ok(Math.min(world, TAU - world) < 1e-6, `index tile upright at detent ${j} (world ${world})`);
  }
});

test('SatorSquare honors a custom cells map and rejects illegal behaviors', () => {
  const cells = defaultCells();
  cells[cellKey(0, 0)] = 'flip'; // (0,0) S is symmetric — flip is legal
  cells[cellKey(0, 2)] = 'flip'; // (0,2) T is not symmetric — illegal, must fall back
  const m = new SatorSquare({ ...CONFIG.sator, cells });
  const behaviorAt = (r, c) => m.tiles.find((t) => t.row === r && t.col === c).behavior;
  assert.equal(behaviorAt(0, 0), 'flip', 'S accepts flip');
  assert.notEqual(behaviorAt(0, 2), 'flip', 'T rejects flip (falls back to a legal option)');
  assert.ok(behaviorOptions(0, 2).includes(behaviorAt(0, 2)), 'fallback is itself legal');
  assert.equal(behaviorAt(2, 2), 'fixed', 'centre always fixed');
});

// Entry point: builds the viewer, wires the GUI, swaps mechanisms and runs the
// animation loop. The driver angle accumulates continuously so changing speed
// never makes the mechanism jump.

import * as THREE from 'three';
import { createViewer, frame } from './scene.js';
import { buildGUI } from './ui.js';
import { setWireframe } from './parts.js';
import { saveSTL } from './export.js';
import { showOverlays, clearOverlays } from './overlays.js';
import { TAU, mod } from './math.js';
import { SpurTrain } from './mechanisms/spurTrain.js';
import { Geneva } from './mechanisms/geneva.js';
import { DoubleGeneva } from './mechanisms/doubleGeneva.js';
import { InternalGear } from './mechanisms/internalGear.js';
import { Planetary } from './mechanisms/planetary.js';
import { BevelPair } from './mechanisms/bevelGears.js';
import { SatorSquare, defaultCells } from './mechanisms/satorSquare.js';

const config = {
  mode: 'Spur train',
  speed: 0.3, // driver revolutions per second
  paused: false,
  wireframe: false,
  overlays: false, // pitch + base circles
  spur: { gears: 3, t1: 12, t2: 24, t3: 18, t4: 15, t5: 30, module: 5, pressureAngle: 20, thickness: 8, helix: 0, spokes: 0 },
  geneva: { slots: 4, centerDistance: 100 },
  double: { amplitude: 35, size: 100 },
  internal: { module: 4, pinionTeeth: 12, ringTeeth: 48, pressureAngle: 20, thickness: 8 },
  planetary: { module: 4, sunTeeth: 12, planetTeeth: 12, planets: 3, pressureAngle: 20, thickness: 8, fixed: 'ring' },
  bevel: { module: 4, pinionTeeth: 16, gearTeeth: 24, pressureAngle: 20, faceWidth: 14 },
  sator: { cell: 40, thickness: 6, spinN: 4, indexClicks: 4, pushFrac: 0.62, drives: true, preset: 'Default', cells: defaultCells(), drive: { ratio: 2, driverTeeth: 10, pressureAngle: 20 } },
  export: { scale: 1.0 }, // uniform STL multiplier; model units are mm
};

const canvas = document.getElementById('app');
const readout = document.getElementById('readout');

// Headless-screenshot hook: ?mode=...&angle=<deg>&drives=0|1 sets a deterministic
// frozen state for off-screen capture; with no params the app runs normally.
const params = new URLSearchParams(location.search);
if (params.has('mode')) config.mode = params.get('mode');
if (params.has('drives') && config.sator) config.sator.drives = params.get('drives') !== '0';
const frozen = params.has('mode') || params.has('angle');

const viewer = createViewer(canvas, { preserveDrawingBuffer: frozen });
const HOME = viewer.camera.position.clone();

// ?az=<deg>&el=<deg> orbits the capture camera (azimuth around Y, elevation) so
// headless shots can see depth / behind the board; frame() keeps the direction.
if (params.has('az') || params.has('el')) {
  const az = ((parseFloat(params.get('az')) || 0) * Math.PI) / 180;
  const el = ((parseFloat(params.get('el')) || 0) * Math.PI) / 180;
  const r = viewer.camera.position.length();
  viewer.camera.position.set(r * Math.cos(el) * Math.sin(az), r * Math.sin(el), r * Math.cos(el) * Math.cos(az));
  viewer.camera.lookAt(0, 0, 0);
}

let mechanism = null;
let driverAngle = 0;
if (params.has('angle')) {
  driverAngle = ((parseFloat(params.get('angle')) || 0) * Math.PI) / 180;
  config.paused = true; // hold the chosen driver angle for a deterministic shot
}

// One registry mapping each mode name to its mechanism factory — the single
// source of truth for both the build dispatch below and the GUI's mode list, so
// the two cannot drift, and an unknown mode fails loudly instead of silently
// falling through to a default. Adding a mode (e.g. a future SATOR square) is
// one entry here plus its `config` block above.
const MODES = {
  'Spur train': () => {
    const s = config.spur;
    const teeth = [s.t1, s.t2, s.t3, s.t4, s.t5].slice(0, s.gears);
    return new SpurTrain({ teeth, module: s.module, pressureAngle: s.pressureAngle, thickness: s.thickness, helix: s.helix, spokes: s.spokes });
  },
  Geneva: () => new Geneva(config.geneva),
  'Double Geneva': () => new DoubleGeneva(config.double),
  'Internal gear': () => new InternalGear(config.internal),
  Planetary: () => new Planetary(config.planetary),
  Bevel: () => new BevelPair(config.bevel),
  'SATOR square': () => new SatorSquare(config.sator),
};

function build() {
  if (mechanism) mechanism.dispose();
  const make = MODES[config.mode];
  if (!make) throw new Error(`unknown mechanism mode: ${config.mode}`);
  mechanism = make();
  viewer.scene.add(mechanism.group);
  setWireframe(config.wireframe);
  if (config.overlays) showOverlays(mechanism.group);
  frame(viewer.camera, viewer.controls, mechanism.group);
}

const actions = {
  rebuild: build,
  frame: () => mechanism && frame(viewer.camera, viewer.controls, mechanism.group),
  resetView: () => {
    // Snap back to the exact home pose. (Don't call frame() here — it would
    // recompute the position from the home direction and overwrite HOME.)
    viewer.camera.position.copy(HOME);
    viewer.controls.target.set(0, 0, 0);
    viewer.controls.update();
  },
  toggleOverlays: () => {
    if (!mechanism) return;
    if (config.overlays) showOverlays(mechanism.group);
    else clearOverlays(mechanism.group);
  },
  exportSTL: () => {
    if (!mechanism) return;
    const name = config.mode.toLowerCase().replace(/\s+/g, '-');
    const s = config.export.scale;
    const tag = s === 1 ? '' : `-x${s}`; // record the scale in the filename
    // `printable` lets a mechanism export a subset of its parts (e.g. a future
    // SATOR mode prints gears but not the decorative letters); falls back to the
    // whole group for every mechanism that doesn't split itself.
    saveSTL(mechanism.printable ?? mechanism.group, `gear3d-${name}${tag}.stl`, s);
  },
};

buildGUI(config, actions, Object.keys(MODES));
build();

// keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    config.paused = !config.paused;
  } else if (e.key === 'f' || e.key === 'F') {
    actions.frame();
  }
});

const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05); // clamp after tab-switch stalls
  if (!config.paused) driverAngle += TAU * config.speed * dt;
  mechanism.update(driverAngle);

  const rpm = (config.speed * 60).toFixed(0);
  readout.textContent = `driver ${(mod(driverAngle, TAU) / TAU * 360).toFixed(0).padStart(3)}°   ${rpm} rpm\n${mechanism.info()}`;

  viewer.controls.update();
  viewer.renderer.render(viewer.scene, viewer.camera);
  requestAnimationFrame(tick);
}
tick();

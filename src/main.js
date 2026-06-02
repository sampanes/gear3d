// Entry point: builds the viewer, wires the GUI, swaps mechanisms and runs the
// animation loop. The driver angle accumulates continuously so changing speed
// never makes the mechanism jump.

import * as THREE from 'three';
import { createViewer, frame } from './scene.js';
import { buildGUI } from './ui.js';
import { setWireframe } from './parts.js';
import { saveSTL } from './export.js';
import { TAU, mod } from './math.js';
import { SpurTrain } from './mechanisms/spurTrain.js';
import { Geneva } from './mechanisms/geneva.js';
import { DoubleGeneva } from './mechanisms/doubleGeneva.js';
import { InternalGear } from './mechanisms/internalGear.js';

const config = {
  mode: 'Spur train',
  speed: 0.3, // driver revolutions per second
  paused: false,
  wireframe: false,
  spur: { gears: 3, t1: 12, t2: 24, t3: 18, t4: 15, t5: 30, module: 5, pressureAngle: 20, thickness: 8, helix: 0 },
  geneva: { slots: 4, centerDistance: 100 },
  double: { amplitude: 35, pushFrac: 0.62, size: 100 },
  internal: { module: 4, pinionTeeth: 12, ringTeeth: 48, pressureAngle: 20, thickness: 8 },
  export: { scale: 1.0 }, // uniform STL multiplier; model units are mm
};

const canvas = document.getElementById('app');
const readout = document.getElementById('readout');
const viewer = createViewer(canvas);
const HOME = viewer.camera.position.clone();

let mechanism = null;
let driverAngle = 0;

function build() {
  if (mechanism) mechanism.dispose();
  if (config.mode === 'Spur train') {
    const s = config.spur;
    const teeth = [s.t1, s.t2, s.t3, s.t4, s.t5].slice(0, s.gears);
    mechanism = new SpurTrain({ teeth, module: s.module, pressureAngle: s.pressureAngle, thickness: s.thickness });
  } else if (config.mode === 'Geneva') {
    mechanism = new Geneva(config.geneva);
  } else if (config.mode === 'Double Geneva') {
    mechanism = new DoubleGeneva(config.double);
  } else {
    mechanism = new InternalGear(config.internal);
  }
  viewer.scene.add(mechanism.group);
  setWireframe(config.wireframe);
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
  exportSTL: () => {
    if (!mechanism) return;
    const name = config.mode.toLowerCase().replace(/\s+/g, '-');
    const s = config.export.scale;
    const tag = s === 1 ? '' : `-x${s}`; // record the scale in the filename
    saveSTL(mechanism.group, `gear3d-${name}${tag}.stl`, s);
  },
};

buildGUI(config, actions);
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

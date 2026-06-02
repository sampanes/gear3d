// Entry point: builds the viewer, wires the GUI, swaps mechanisms and runs the
// animation loop. The driver angle accumulates continuously so changing speed
// never makes the mechanism jump.

import * as THREE from 'three';
import { createViewer, frame } from './scene.js';
import { buildGUI } from './ui.js';
import { setWireframe } from './parts.js';
import { TAU } from './math.js';
import { SpurTrain } from './mechanisms/spurTrain.js';
import { Geneva } from './mechanisms/geneva.js';
import { DoubleGeneva } from './mechanisms/doubleGeneva.js';

const config = {
  mode: 'Spur train',
  speed: 0.3, // driver revolutions per second
  paused: false,
  wireframe: false,
  spur: { gears: 3, t1: 12, t2: 24, t3: 18, t4: 15, t5: 30, module: 5, pressureAngle: 20, thickness: 8 },
  geneva: { slots: 4, centerDistance: 100 },
  double: { amplitude: 35, pushFrac: 0.62, size: 100 },
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
  } else {
    mechanism = new DoubleGeneva(config.double);
  }
  viewer.scene.add(mechanism.group);
  setWireframe(config.wireframe);
  frame(viewer.camera, viewer.controls, mechanism.group);
}

const actions = {
  rebuild: build,
  frame: () => mechanism && frame(viewer.camera, viewer.controls, mechanism.group),
  resetView: () => {
    viewer.camera.position.copy(HOME);
    viewer.controls.target.set(0, 0, 0);
    actions.frame();
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
  readout.textContent = `driver ${((driverAngle % TAU) / TAU * 360).toFixed(0).padStart(3)}°   ${rpm} rpm\n${mechanism.info()}`;

  viewer.controls.update();
  viewer.renderer.render(viewer.scene, viewer.camera);
  requestAnimationFrame(tick);
}
tick();

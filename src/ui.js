// lil-gui control panel. Structural changes call actions.rebuild(); cheap
// changes (speed, pause, wireframe) are applied live without a rebuild.

import GUI from 'lil-gui';
import { setWireframe } from './parts.js';

export function buildGUI(config, actions) {
  const gui = new GUI({ title: 'gear3d' });

  gui
    .add(config, 'mode', ['Spur train', 'Geneva', 'Double Geneva'])
    .name('mechanism')
    .onChange(() => {
      refresh();
      actions.rebuild();
    });

  const view = gui.addFolder('Playback & view');
  view.add(config, 'speed', -2, 2, 0.01).name('speed (rev/s)');
  view.add(config, 'paused').name('paused (space)').listen();
  view.add(config, 'wireframe').onChange((v) => setWireframe(v));
  view.add(actions, 'frame').name('frame view (F)');
  view.add(actions, 'resetView').name('reset camera');

  // ----- Export -----
  const exp = gui.addFolder('Export (STL)');
  exp.add(config.export, 'scale', 0.1, 10, 0.01).name('scale × (1 = mm)');
  exp.add(actions, 'exportSTL').name('export STL ⤓');

  // ----- Spur train -----
  const spur = gui.addFolder('Spur train');
  const teethCtrls = [];
  spur.add(config.spur, 'gears', 2, 5, 1).name('gear count').onChange(() => {
    refreshTeeth();
    actions.rebuild();
  });
  for (let i = 1; i <= 5; i++) {
    teethCtrls.push(
      spur.add(config.spur, 't' + i, 6, 80, 1).name('teeth ' + i).onChange(actions.rebuild)
    );
  }
  spur.add(config.spur, 'module', 2, 12, 0.5).onChange(actions.rebuild);
  spur.add(config.spur, 'pressureAngle', 14.5, 25, 0.5).name('pressure angle').onChange(actions.rebuild);
  spur.add(config.spur, 'thickness', 2, 20, 0.5).onChange(actions.rebuild);
  spur.add(config.spur, 'helix', 0, 40, 1).name('helix angle °').onChange(actions.rebuild);

  // ----- Geneva -----
  const gen = gui.addFolder('Geneva drive');
  gen.add(config.geneva, 'slots', 3, 12, 1).onChange(actions.rebuild);
  gen.add(config.geneva, 'centerDistance', 50, 200, 1).name('center dist').onChange(actions.rebuild);

  // ----- Double Geneva -----
  const dbl = gui.addFolder('Double Geneva');
  dbl.add(config.double, 'amplitude', 10, 80, 1).name('swing ±°').onChange(actions.rebuild);
  dbl.add(config.double, 'pushFrac', 0.3, 1, 0.01).name('push fraction').onChange(actions.rebuild);
  dbl.add(config.double, 'size', 50, 200, 1).onChange(actions.rebuild);

  const folders = { 'Spur train': spur, Geneva: gen, 'Double Geneva': dbl };

  function refreshTeeth() {
    teethCtrls.forEach((c, i) => c.show(i < config.spur.gears));
  }
  function refresh() {
    for (const [name, f] of Object.entries(folders)) f.show(config.mode === name);
    refreshTeeth();
  }

  refresh();
  return gui;
}

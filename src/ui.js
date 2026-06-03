// lil-gui control panel. Structural changes call actions.rebuild(); cheap
// changes (speed, pause, wireframe) are applied live without a rebuild.

import GUI from 'lil-gui';
import { setWireframe } from './parts.js';

export function buildGUI(config, actions, modeNames) {
  const gui = new GUI({ title: 'gear3d' });

  gui
    .add(config, 'mode', modeNames)
    .name('mechanism')
    .onChange(() => {
      refresh();
      actions.rebuild();
    });

  const view = gui.addFolder('Playback & view');
  view.add(config, 'speed', -2, 2, 0.01).name('speed (rev/s)');
  view.add(config, 'paused').name('paused (space)').listen();
  view.add(config, 'wireframe').onChange((v) => setWireframe(v));
  view.add(config, 'overlays').name('pitch/base circles').onChange(actions.toggleOverlays);
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

  // ----- Internal gear -----
  const int = gui.addFolder('Internal gear');
  int.add(config.internal, 'pinionTeeth', 8, 30, 1).name('pinion teeth').onChange(actions.rebuild);
  int.add(config.internal, 'ringTeeth', 32, 120, 1).name('ring teeth').onChange(actions.rebuild);
  int.add(config.internal, 'module', 2, 12, 0.5).onChange(actions.rebuild);
  int.add(config.internal, 'pressureAngle', 14.5, 25, 0.5).name('pressure angle').onChange(actions.rebuild);
  int.add(config.internal, 'thickness', 2, 20, 0.5).onChange(actions.rebuild);

  // ----- Planetary -----
  const pl = gui.addFolder('Planetary');
  pl.add(config.planetary, 'sunTeeth', 8, 40, 1).name('sun teeth').onChange(actions.rebuild);
  pl.add(config.planetary, 'planetTeeth', 8, 40, 1).name('planet teeth').onChange(actions.rebuild);
  pl.add(config.planetary, 'planets', 3, 6, 1).name('# planets').onChange(actions.rebuild);
  pl.add(config.planetary, 'fixed', ['ring', 'carrier', 'sun']).name('fixed member').onChange(actions.rebuild);
  pl.add(config.planetary, 'module', 2, 12, 0.5).onChange(actions.rebuild);
  pl.add(config.planetary, 'pressureAngle', 14.5, 25, 0.5).name('pressure angle').onChange(actions.rebuild);
  pl.add(config.planetary, 'thickness', 2, 20, 0.5).onChange(actions.rebuild);

  // ----- Bevel -----
  const bev = gui.addFolder('Bevel');
  bev.add(config.bevel, 'pinionTeeth', 8, 40, 1).name('pinion teeth').onChange(actions.rebuild);
  bev.add(config.bevel, 'gearTeeth', 8, 40, 1).name('gear teeth').onChange(actions.rebuild);
  bev.add(config.bevel, 'module', 2, 12, 0.5).onChange(actions.rebuild);
  bev.add(config.bevel, 'pressureAngle', 14.5, 25, 0.5).name('pressure angle').onChange(actions.rebuild);
  bev.add(config.bevel, 'faceWidth', 4, 30, 1).name('face width').onChange(actions.rebuild);

  // ----- SATOR square -----
  const sat = gui.addFolder('SATOR square');
  sat.add(config.sator, 'cell', 24, 60, 1).name('cell size').onChange(actions.rebuild);
  sat.add(config.sator, 'thickness', 2, 12, 0.5).onChange(actions.rebuild);

  const folders = {
    'Spur train': spur,
    Geneva: gen,
    'Double Geneva': dbl,
    'Internal gear': int,
    Planetary: pl,
    Bevel: bev,
    'SATOR square': sat,
  };

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

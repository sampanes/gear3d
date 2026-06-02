// Export the current mechanism as a printable solid. Uses three's STLExporter
// to serialise every mesh under an object (in its current world pose) to a
// binary STL, then triggers a browser download.
//
// The whole mechanism is exported as ONE file, so every part is already at the
// same scale relative to the others. A single uniform `scale` multiplier (model
// units are millimetres, so scale = 1 means 1 unit = 1 mm) is applied to the
// whole export — set it once and every part, across every export, comes out
// matched, with no per-part resizing in the slicer / Blender.

import { STLExporter } from 'three/addons/exporters/STLExporter.js';

const exporter = new STLExporter();

// Serialise `object` (e.g. a mechanism group) to a binary STL and download it,
// uniformly scaled by `scale`. The scale is applied and restored synchronously
// (before the next render) so the on-screen model never visibly changes.
export function saveSTL(object, filename = 'gear3d.stl', scale = 1) {
  if (!object) return;

  let data;
  if (scale === 1) {
    data = exporter.parse(object, { binary: true });
  } else {
    const original = object.scale.clone();
    object.scale.multiplyScalar(scale);
    object.updateMatrixWorld(true);
    data = exporter.parse(object, { binary: true });
    object.scale.copy(original);
    object.updateMatrixWorld(true);
  }

  const blob = new Blob([data], { type: 'model/stl' }); // data is a DataView
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.stl') ? filename : `${filename}.stl`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

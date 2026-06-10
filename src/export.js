// Export the current mechanism as a printable solid. Uses three's STLExporter
// to serialise every mesh under an object (in its current world pose) to a
// binary STL, then triggers a browser download.
//
// The whole mechanism is exported as ONE file, so every part is already at the
// same scale relative to the others. A single uniform `scale` multiplier (model
// units are millimetres, so scale = 1 means 1 unit = 1 mm) is applied to the
// whole export — set it once and every part, across every export, comes out
// matched, with no per-part resizing in the slicer / Blender.

import { Box3, Vector3 } from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { zipBytes } from './zip.js';

const exporter = new STLExporter();

// Serialise `object` (e.g. a mechanism group) to a binary STL DataView,
// uniformly scaled by `scale`. The scale is applied and restored synchronously
// (before the next render) so the on-screen model never visibly changes. This
// is the pure, DOM-free core of the export — unit-tested in test/export.test.js.
export function stlBytes(object, scale = 1) {
  if (scale === 1) return exporter.parse(object, { binary: true });

  const original = object.scale.clone();
  object.scale.multiplyScalar(scale);
  object.updateMatrixWorld(true);
  const data = exporter.parse(object, { binary: true });
  object.scale.copy(original);
  object.updateMatrixWorld(true);
  return data;
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Serialise `object` to a binary STL and trigger a browser download.
export function saveSTL(object, filename = 'gear3d.stl', scale = 1) {
  if (!object) return;
  const data = stlBytes(object, scale);
  download(new Blob([data], { type: 'model/stl' }), filename.endsWith('.stl') ? filename : `${filename}.stl`);
}

// ---------------------------------------------------------------------------
// Per-part kit export: one ZIP of binary STLs, one entry per distinct part.
// `parts` is what a mechanism's parts() returns: [{ name, count, object }] —
// each object a FRESH print-pose build (flat at the origin, +Z = print axis),
// never the live scene. Identical parts are deduplicated by the mechanism and
// carry their print quantity in `count`, which lands in the filename
// (tile-disc-x25.stl => print 25 of it). A README.txt manifest is included.
// ---------------------------------------------------------------------------
const entryName = (p) => `${p.name}${(p.count ?? 1) > 1 ? `-x${p.count}` : ''}.stl`;

export function partsZipBytes(parts, scale = 1) {
  const size = new Vector3();
  const dims = []; // per-part printed bounding box, for the manifest
  const entries = parts.map((p) => {
    // fresh objects have never been rendered, so their child matrices are
    // stale — bake them before serialising or every child lands at the origin
    p.object.updateMatrixWorld(true);
    new Box3().setFromObject(p.object).getSize(size);
    dims.push(`${(size.x * scale).toFixed(1)} x ${(size.y * scale).toFixed(1)} x ${(size.z * scale).toFixed(1)} mm`);
    return { name: entryName(p), data: stlBytes(p.object, scale) };
  });
  const manifest = [
    'gear3d printable kit',
    '',
    `scale: ${scale}  (model units are mm at scale 1)`,
    '',
    'parts (file -> quantity to print, printed size):',
    ...parts.map((p, i) => `  ${entryName(p)}  x${p.count ?? 1}  (${dims[i]})`),
    '',
    'The -xN suffix is the print quantity, not a size. Gear teeth already',
    'include whatever backlash the design was exported with; print at 100%.',
    'Check the largest part against your print bed before slicing.',
    '',
  ].join('\n');
  entries.unshift({ name: 'README.txt', data: new TextEncoder().encode(manifest) });
  return zipBytes(entries);
}

// Serialise a parts kit and trigger a browser download of the ZIP.
export function savePartsZip(parts, filename = 'gear3d-parts.zip', scale = 1) {
  if (!parts || parts.length === 0) return;
  const data = partsZipBytes(parts, scale);
  download(new Blob([data], { type: 'application/zip' }), filename.endsWith('.zip') ? filename : `${filename}.zip`);
}

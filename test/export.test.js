// Unit tests for the pure STL serialiser (src/export.js stlBytes). The DOM
// download tail of saveSTL needs a browser, but the byte-producing core does
// not — STLExporter.parse runs headless under node. STL is the project's actual
// deliverable, so the binary layout and the scale round-trip are worth pinning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { stlBytes } from '../src/export.js';

function boxGroup(size = 10) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(size, size, size)));
  return g;
}

// Binary STL: 80-byte header, uint32 triangle count at offset 80, then 50 bytes
// per triangle (12 float32 = normal + 3 verts, + 2 attribute bytes).
const triangleCount = (dv) => dv.getUint32(80, true);
function maxAbsCoord(dv) {
  const tris = triangleCount(dv);
  let max = 0;
  for (let i = 0; i < tris; i++) {
    const base = 84 + i * 50;
    for (let j = 3; j < 12; j++) {
      // floats 0..2 are the facet normal; 3..11 are the three vertices
      const v = Math.abs(dv.getFloat32(base + j * 4, true));
      if (v > max) max = v;
    }
  }
  return max;
}

test('stlBytes returns a binary STL: DataView, triangle count, 50 bytes/triangle', () => {
  const data = stlBytes(boxGroup(), 1);
  assert.ok(data instanceof DataView, 'binary STL is a DataView');
  const tris = triangleCount(data);
  assert.equal(tris, 12, 'a box is 12 triangles (2 per face × 6 faces)');
  assert.equal(data.byteLength, 84 + 50 * tris, 'byteLength = header(84) + 50 per triangle');
});

test('stlBytes scales coordinates uniformly and restores object.scale afterward', () => {
  const g = boxGroup();
  const at1 = stlBytes(g, 1);
  assert.equal(g.scale.x, 1, 'scale untouched after a scale=1 export');

  const at2 = stlBytes(g, 2);
  assert.equal(g.scale.x, 1, 'object.scale restored after a scaled export');
  assert.equal(g.scale.y, 1);
  assert.equal(g.scale.z, 1);

  assert.equal(triangleCount(at1), triangleCount(at2), 'same geometry → same triangle count');
  const ratio = maxAbsCoord(at2) / maxAbsCoord(at1);
  assert.ok(Math.abs(ratio - 2) < 1e-4, `scaled export is 2× (got ${ratio})`);
});

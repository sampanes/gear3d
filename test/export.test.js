// Unit tests for the pure STL serialiser (src/export.js stlBytes). The DOM
// download tail of saveSTL needs a browser, but the byte-producing core does
// not — STLExporter.parse runs headless under node. STL is the project's actual
// deliverable, so the binary layout and the scale round-trip are worth pinning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { stlBytes, partsZipBytes } from '../src/export.js';
import { crc32 } from '../src/zip.js';

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

// ---------------------------------------------------------------------------
// Per-part kit export (partsZipBytes)
// ---------------------------------------------------------------------------
// Slim central-directory walker — enough to list entries and slice their data.
function zipEntries(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50, 'EOCD signature');
  const count = dv.getUint16(eocd + 8, true);
  let off = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const entries = [];
  for (let i = 0; i < count; i++) {
    const crc = dv.getUint32(off + 16, true);
    const size = dv.getUint32(off + 24, true);
    const nlen = dv.getUint16(off + 28, true);
    const lho = dv.getUint32(off + 42, true);
    const name = dec.decode(bytes.subarray(off + 46, off + 46 + nlen));
    const lnlen = dv.getUint16(lho + 26, true);
    entries.push({ name, crc, data: bytes.subarray(lho + 30 + lnlen, lho + 30 + lnlen + size) });
    off += 46 + nlen;
  }
  return entries;
}

test('partsZipBytes: manifest + one STL entry per part, -xN quantity suffix, valid CRCs', () => {
  const parts = [
    { name: 'plate', count: 1, object: boxGroup(20) },
    { name: 'tile-disc', count: 25, object: boxGroup(10) },
  ];
  const entries = zipEntries(partsZipBytes(parts, 1));
  assert.deepEqual(
    entries.map((e) => e.name),
    ['README.txt', 'plate.stl', 'tile-disc-x25.stl']
  );
  for (const e of entries) assert.equal(crc32(e.data), e.crc, `${e.name}: CRC verifies`);
  // each STL entry is a real binary STL: a box is 12 triangles
  for (const e of entries.slice(1)) {
    const dv = new DataView(e.data.buffer, e.data.byteOffset, e.data.byteLength);
    assert.equal(dv.getUint32(80, true), 12, `${e.name}: triangle count`);
    assert.equal(e.data.length, 84 + 50 * 12, `${e.name}: byteLength`);
  }
  const manifest = new TextDecoder().decode(entries[0].data);
  assert.match(manifest, /tile-disc-x25\.stl {2}x25/, 'manifest lists quantities');
});

test('partsZipBytes bakes fresh-object child transforms (updateMatrixWorld before export)', () => {
  // a child positioned at x=+10 must land at x≈10 in the STL even though the
  // object was never rendered (matrixWorld starts stale on fresh builds)
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  mesh.position.set(10, 0, 0);
  g.add(mesh);
  const entries = zipEntries(partsZipBytes([{ name: 'offset', count: 1, object: g }], 1));
  const e = entries.find((x) => x.name === 'offset.stl');
  const dv = new DataView(e.data.buffer, e.data.byteOffset, e.data.byteLength);
  let maxX = -Infinity;
  for (let i = 0; i < dv.getUint32(80, true); i++) {
    const base = 84 + i * 50;
    for (let j = 3; j < 12; j += 3) maxX = Math.max(maxX, dv.getFloat32(base + j * 4, true));
  }
  assert.ok(Math.abs(maxX - 11) < 1e-5, `offset child baked into the STL (maxX ${maxX})`);
});

test('partsZipBytes applies the uniform export scale to every part', () => {
  const mk = (s) => zipEntries(partsZipBytes([{ name: 'p', count: 1, object: boxGroup(10) }], s));
  const at1 = mk(1).find((e) => e.name === 'p.stl');
  const at2 = mk(2).find((e) => e.name === 'p.stl');
  const dv1 = new DataView(at1.data.buffer, at1.data.byteOffset, at1.data.byteLength);
  const dv2 = new DataView(at2.data.buffer, at2.data.byteOffset, at2.data.byteLength);
  const r = maxAbsCoord(dv2) / maxAbsCoord(dv1);
  assert.ok(Math.abs(r - 2) < 1e-4, `kit scale is uniform (got ${r})`);
});

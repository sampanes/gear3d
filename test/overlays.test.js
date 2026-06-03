// Unit tests for the educational overlay attach/clear logic (src/overlays.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { showOverlays, clearOverlays } from '../src/overlays.js';

function gearLike(radius, base, z) {
  const o = new THREE.Object3D();
  o.userData.pitch = { radius, base, z };
  return o;
}

function countOverlays(group) {
  let n = 0;
  group.traverse((o) => {
    if (o.userData && o.userData.isOverlay) n += 1;
  });
  return n;
}

test('showOverlays attaches pitch+base circles to every gear pivot (incl. nested), and does not accumulate', () => {
  const group = new THREE.Group();
  group.add(gearLike(30, 28, 0));
  const nested = new THREE.Group();
  nested.add(gearLike(50, 47, 5)); // a pivot nested under another group (e.g. carrier/orient)
  group.add(nested);
  group.add(new THREE.Object3D()); // a non-gear object: no userData.pitch -> no overlay

  showOverlays(group, { pitch: true, base: true });
  assert.equal(countOverlays(group), 4, 'pitch + base on each of the two gear pivots');

  showOverlays(group, { pitch: true, base: true }); // re-apply
  assert.equal(countOverlays(group), 4, 'clears before re-adding (no accumulation)');

  clearOverlays(group);
  assert.equal(countOverlays(group), 0, 'all overlays removed');
});

test('pitch-only attaches a single circle per gear; a gear without a base radius gets only pitch', () => {
  const group = new THREE.Group();
  group.add(gearLike(30, 28, 0));
  showOverlays(group, { pitch: true, base: false });
  assert.equal(countOverlays(group), 1);
  clearOverlays(group);

  const noBase = new THREE.Object3D();
  noBase.userData.pitch = { radius: 30, z: 0 }; // no base
  const g2 = new THREE.Group();
  g2.add(noBase);
  showOverlays(g2, { pitch: true, base: true });
  assert.equal(countOverlays(g2), 1, 'base skipped when absent');
});

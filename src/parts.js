// Shared materials and small reusable part builders, plus disposal helpers.

import * as THREE from 'three';

export const PALETTE = {
  driver: 0x4f86c6, // input wheels
  driven: 0xe0883b, // output gears / star wheels
  output: 0x57c785, // oscillating lever
  pin: 0xe5503b, // crank pins
  shaft: 0x8a93a6, // axles
  lock: 0x394150, // locking discs
};

const _materials = new Map();

// One shared MeshStandardMaterial per (color, opacity) — cheaper and lets the
// UI flip wireframe on every gear at once.
export function metal(color, { opacity = 1, rough = 0.45, metalness = 0.6 } = {}) {
  const key = `${color}|${opacity}|${rough}|${metalness}`;
  if (!_materials.has(key)) {
    _materials.set(
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness: rough,
        metalness,
        transparent: opacity < 1,
        opacity,
        side: THREE.DoubleSide,
      })
    );
  }
  return _materials.get(key);
}

export function setWireframe(on) {
  for (const m of _materials.values()) m.wireframe = on;
}

// A cylinder whose axis is +Z (so it matches gears extruded along +Z).
export function disc(radius, thickness, color, opts = {}) {
  const g = new THREE.CylinderGeometry(radius, radius, thickness, 64);
  g.rotateX(Math.PI / 2); // Y-axis -> Z-axis
  const mesh = new THREE.Mesh(g, metal(color, opts));
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// A pin (small cylinder) standing along +Z, centred at (x, y), extending from
// z0 to z0+len.
export function pin(x, y, radius, len, z0, color = PALETTE.pin) {
  const g = new THREE.CylinderGeometry(radius, radius, len, 24);
  g.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(g, metal(color, { rough: 0.3, metalness: 0.7 }));
  mesh.position.set(x, y, z0 + len / 2);
  mesh.castShadow = true;
  return mesh;
}

// Recursively free geometries; materials are shared so they are left alone.
export function disposeObject(obj) {
  obj.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
  });
  if (obj.parent) obj.parent.remove(obj);
}

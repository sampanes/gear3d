// Educational overlays: pitch (solid) and base (dashed) circles drawn on every
// gear. Generic — it traverses a mechanism group for any pivot carrying
// `userData.pitch = { radius, base?, z? }` (set by the make*Gear builders) and
// attaches the circles as children, so they track each gear's transform. Lines
// are ignored by STLExporter, so overlays never pollute an STL export.

import * as THREE from 'three';

const pitchMat = new THREE.LineBasicMaterial({ color: 0x57c785, transparent: true, opacity: 0.95 });
const baseMat = new THREE.LineDashedMaterial({ color: 0xe5503b, transparent: true, opacity: 0.7, dashSize: 2, gapSize: 2 });

function circle(radius, z, material, dashed) {
  const seg = 160;
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push(new THREE.Vector3(radius * Math.cos(a), radius * Math.sin(a), z));
  }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), material);
  if (dashed) line.computeLineDistances();
  line.userData.isOverlay = true;
  return line;
}

// Attach pitch (and base) circles to every gear pivot in `group`.
export function showOverlays(group, { pitch = true, base = true } = {}) {
  clearOverlays(group);
  const targets = [];
  group.traverse((o) => {
    if (o.userData && o.userData.pitch) targets.push(o); // collect before mutating
  });
  for (const o of targets) {
    const p = o.userData.pitch;
    if (pitch) o.add(circle(p.radius, p.z || 0, pitchMat, false));
    if (base && p.base) o.add(circle(p.base, p.z || 0, baseMat, true));
  }
}

// Remove and dispose any overlay lines previously attached to `group`.
export function clearOverlays(group) {
  const overlays = [];
  group.traverse((o) => {
    if (o.userData && o.userData.isOverlay) overlays.push(o);
  });
  for (const o of overlays) {
    o.geometry.dispose();
    if (o.parent) o.parent.remove(o);
  }
}

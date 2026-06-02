// Renderer, scene, camera, lights, grid and OrbitControls wired so the MIDDLE
// mouse button orbits the camera (CAD-style), left/right pan, wheel zooms.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createViewer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x0d1018, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1018);
  scene.fog = new THREE.Fog(0x0d1018, 600, 1400);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 5000);
  camera.position.set(40, 30, 220);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  // Middle button = orbit (the requested mapping). Left/right = pan.
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.ROTATE,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  // Browsers use middle-drag for autoscroll and right-drag for the context
  // menu — suppress both on the canvas so orbiting/panning stay smooth.
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 1 || e.button === 2) e.preventDefault();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('auxclick', (e) => e.preventDefault());

  // Lighting: soft sky/ground fill plus a key light that casts shadows.
  scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x202830, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(120, 220, 180);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 50;
  key.shadow.camera.far = 900;
  const s = 320;
  Object.assign(key.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
  key.shadow.bias = -0.0002;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.5);
  fill.position.set(-160, 60, -120);
  scene.add(fill);

  // Reference grid in the XY plane (behind the mechanism, which lives at z~=0).
  const grid = new THREE.GridHelper(2000, 200, 0x2a3346, 0x1a2030);
  grid.rotation.x = Math.PI / 2; // XZ -> XY
  grid.position.z = -40;
  scene.add(grid);

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return { renderer, scene, camera, controls, grid, resize };
}

// Frame `object` so it fills the view, keeping the current viewing direction.
export function frame(camera, controls, object, margin = 1.35) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const dist =
    (sphere.radius * margin) / Math.sin((camera.fov * Math.PI) / 360);

  const dir = new THREE.Vector3()
    .subVectors(camera.position, controls.target)
    .normalize();
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).addScaledVector(dir, dist);
  camera.near = Math.max(0.5, dist - sphere.radius * 4);
  camera.far = dist + sphere.radius * 8;
  camera.updateProjectionMatrix();
  controls.update();
}

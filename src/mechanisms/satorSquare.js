// SATOR square — a 5×5 turning letter board. The whole board (carrier) rotates
// by Phi; each tile rotates by psi RELATIVE to the board so the square reads
// upright again at every 90° detent. Per-tile motion is the closed-form
// kinematics in kinematics.satorTileAngle (always-upright idler, fixed hub,
// fixed-sun planetary spin, double-Geneva O-flip); see docs/sator-square.md.
//
// The board is a data-driven "pick & place": a 5×5 map of per-cell behaviors
// (editable from the UI, choosable from presets). The mechanism splits into two
// sub-groups that turn together: `printable` (the board + tile gears — what STL
// export serialises) and `decor` (the block-letter glyphs, printed separately).

import * as THREE from 'three';
import { satorTileAngle, indexUpright, satorDriveGeometry, satorDrivePins, satorCamGeometry } from '../kinematics.js';
import { makeGear } from '../gears/gear.js';
import { gearMetrics } from '../gears/involute.js';
import { TAU, mod } from '../math.js';
import { PALETTE, metal, disc, pin, disposeObject } from '../parts.js';

// The two diagonal corner O-pairs (point-symmetric through the centre, so one
// shaft drives both tiles of a pair). Shared by the ctor's drive builder and by
// parts(), which must know which flip tiles a built drive actually covers.
const CLUSTERS = [[[0, 3], [1, 4]], [[3, 0], [4, 1]]];

export const SATOR_WORD = ['SATOR', 'AREPO', 'TENET', 'OPERA', 'ROTAS'];

// Only these letters are 180°-symmetric, so only they may "flip" (a flipped
// non-symmetric letter would read upside-down at half the detents).
export const SYMMETRIC = new Set(['O', 'S', 'N']);

export const letterAt = (row, col) => SATOR_WORD[row][col];
export const cellKey = (row, col) => `${row},${col}`;

// The behaviors a cell may take, honoring the design constraints: the centre
// (the N, on the rotation axis) is the fixed ground hub; flip needs a symmetric
// letter; upright and spin are valid for any tile.
export function behaviorOptions(row, col) {
  if (row === 2 && col === 2) return ['fixed'];
  // 'index' (single-Geneva clicking) is allowed anywhere, like spin; whether it
  // reads upright at the detents is emergent (depends on the turns/board, spinN).
  return SYMMETRIC.has(letterAt(row, col)) ? ['upright', 'flip', 'spin', 'index'] : ['upright', 'spin', 'index'];
}

function mapCells(fn) {
  const cells = {};
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) cells[cellKey(r, c)] = fn(r, c);
  return cells;
}

// The default palette: centre N fixed, the four O's flip, one A spins for
// variety, everything else upright.
export function defaultCells() {
  return mapCells((r, c) => {
    if (r === 2 && c === 2) return 'fixed';
    if (letterAt(r, c) === 'O') return 'flip';
    if (r === 0 && c === 1) return 'spin'; // the diversity tile (an A)
    return 'upright';
  });
}

// Built-in palettes (no persistence — URL/save-load is intentionally out of
// scope per the roadmap). Each returns a fresh, fully-legal cells map.
export const PRESETS = {
  Default: defaultCells,
  'All upright': () => mapCells((r, c) => (r === 2 && c === 2 ? 'fixed' : 'upright')),
  'Max flip': () =>
    mapCells((r, c) => {
      if (r === 2 && c === 2) return 'fixed';
      return SYMMETRIC.has(letterAt(r, c)) ? 'flip' : 'upright';
    }),
  Playful: () =>
    mapCells((r, c) => {
      if (r === 2 && c === 2) return 'fixed';
      const L = letterAt(r, c);
      if (L === 'O') return 'flip';
      if (L === 'S') return 'spin';
      return (r + c) % 4 === 0 ? 'spin' : 'upright';
    }),
  Clockwork: () =>
    mapCells((r, c) => {
      if (r === 2 && c === 2) return 'fixed';
      if (letterAt(r, c) === 'O') return 'index'; // the O's click around
      return SYMMETRIC.has(letterAt(r, c)) ? 'spin' : 'upright';
    }),
};

// 3×5 block-letter bitmaps (rows top→bottom) for the glyphs the square uses.
const GLYPHS = {
  S: ['111', '100', '111', '001', '111'],
  A: ['111', '101', '111', '101', '101'],
  T: ['111', '010', '010', '010', '010'],
  O: ['111', '101', '101', '101', '111'],
  R: ['110', '101', '110', '101', '101'],
  E: ['111', '100', '111', '100', '111'],
  P: ['111', '101', '111', '100', '100'],
  N: ['101', '111', '111', '101', '101'],
};

const TILE_COLOR = {
  fixed: PALETTE.lock,
  flip: PALETTE.driven,
  spin: PALETTE.driver,
  index: PALETTE.pin,
  upright: PALETTE.output,
};

// A block letter built from unit boxes on a 3×5 grid, centred at the origin and
// standing proud of the tile face at +z. Tagged userData.isLetter so the
// printable/decor split (and tests) can identify letter geometry. pixelScale
// sets the box size relative to the grid pitch: the rendered letters use 0.92
// (airy pixel-art gaps); the PRINT kit uses 1.02 so adjacent pixels overlap and
// every glyph comes out of the slicer as one connected piece (each SATOR glyph
// is orthogonally connected on the 3×5 grid, so overlap is all it takes).
function letterGroup(ch, size, depth, z, pixelScale = 0.92) {
  const g = new THREE.Group();
  g.userData.isLetter = true;
  const rows = GLYPHS[ch];
  if (!rows) return g;
  const cw = size / 3;
  const rh = size / 5;
  const mat = metal(0xeef2f7, { metalness: 0.1, rough: 0.7 });
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 3; c++) {
      if (rows[r][c] !== '1') continue;
      const box = new THREE.Mesh(new THREE.BoxGeometry(cw * pixelScale, rh * pixelScale, depth), mat);
      box.position.set((c - 1) * cw, (2 - r) * rh, z);
      box.castShadow = true;
      g.add(box);
    }
  }
  return g;
}

// Reciprocating Geneva "cross": a centred disc with 2 radial PIN-SLOTS (the driver
// crank pins ride these, exactly on the centreline — see kinematics.satorDrivePins)
// and 2 concave DWELL POCKETS (the driver locking-cams nest here to hold the cross
// between strokes). A slot opens at the rim (mouth) and runs inward to `bottom`; a
// pocket dips in from the rim. The four feature ANGLES are passed in (the derivation
// puts the slots facing the two drivers and the pockets `amp` beyond) rather than
// hardcoded — so the rendered slots are the ones the pins provably enter. Extruded.
// `floorExtra` cuts the slot floor deeper than the kinematic slotDepth: the
// derivation's slot bottom is the deepest reach of the pin CENTRE (c−a), so the
// floor must drop at least a pin RADIUS further or the pin surface rams it at
// every mid-push. The pocket depth stays tied to the kinematic slotDepth — the
// locking cam (kinematics.satorCamGeometry) is derived against THAT pocket.
function genevaCrossGeo(R, slotW, slotDepth, thk, slotAngles, pocketAngles, floorExtra = 0) {
  const w = slotW;
  const bottom = R - slotDepth - floorExtra;
  const tMouth = Math.sqrt(Math.max(0, R * R - w * w));
  const dphi = Math.asin(Math.min(0.9, w / R)); // slot-mouth half-angle on the rim
  const pocketR = R - slotDepth * 0.55; // how far the dwell pocket dips in
  const V = (r, a) => new THREE.Vector2(r * Math.cos(a), r * Math.sin(a));
  // walk the rim, inserting each feature's profile in angular order
  const feats = [
    ...slotAngles.map((a) => ({ a: mod(a, TAU), kind: 'slot' })),
    ...pocketAngles.map((a) => ({ a: mod(a, TAU), kind: 'pocket' })),
  ].sort((x, y) => x.a - y.a);
  // smallest gap between adjacent features → clamp the pocket half-width so a pocket can
  // never bleed into a neighbouring slot (the four features crowd into a downward wedge).
  let minGap = TAU;
  for (let i = 0; i < feats.length; i++) {
    const g = feats[(i + 1) % feats.length].a - feats[i].a + (i + 1 === feats.length ? TAU : 0);
    minGap = Math.min(minGap, g);
  }
  const pdphi = Math.max(0.02, Math.min(dphi * 1.6, 0.5, 0.9 * (minGap - dphi))); // pocket half-angle
  const pts = [];
  for (let i = 0; i < feats.length; i++) {
    const f = feats[i];
    if (f.kind === 'slot') {
      const ux = Math.cos(f.a), uy = Math.sin(f.a); // radial (slot centre line)
      const vx = -Math.sin(f.a), vy = Math.cos(f.a); // tangential (slot width)
      pts.push(new THREE.Vector2(ux * tMouth - vx * w, uy * tMouth - vy * w));
      pts.push(new THREE.Vector2(ux * bottom - vx * w, uy * bottom - vy * w));
      pts.push(new THREE.Vector2(ux * bottom + vx * w, uy * bottom + vy * w));
      pts.push(new THREE.Vector2(ux * tMouth + vx * w, uy * tMouth + vy * w));
    } else {
      pts.push(V(R, f.a - pdphi));
      pts.push(V(pocketR, f.a - pdphi * 0.4));
      pts.push(V(pocketR, f.a + pdphi * 0.4));
      pts.push(V(R, f.a + pdphi));
    }
    // rim arc from this feature's exit to the next feature's entry; stop one
    // step short — the next feature's own first vertex owns that point (pushing
    // both creates a near-duplicate -> zero-area sliver triangles in the STL)
    const next = feats[(i + 1) % feats.length];
    const aExit = f.a + (f.kind === 'slot' ? dphi : pdphi);
    let aNext = next.a - (next.kind === 'slot' ? dphi : pdphi);
    if (aNext <= aExit) aNext += TAU;
    for (let k = 1; k <= 5; k++) pts.push(V(R, aExit + (aNext - aExit) * (k / 6)));
  }
  const shape = new THREE.Shape(pts);
  // hub hole from explicit points (CW): absarc's 2π endpoint lands a float-noise
  // hair off its start, leaving a near-duplicate seam vertex -> STL slivers
  const hole = new THREE.Path();
  const hr = R * 0.18;
  const hpts = [];
  for (let k = 0; k < 24; k++) {
    const a = -(k / 24) * TAU;
    hpts.push(new THREE.Vector2(hr * Math.cos(a), hr * Math.sin(a)));
  }
  hole.setFromPoints(hpts);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thk, bevelEnabled: false, curveSegments: 6 });
  geo.translate(0, 0, -thk / 2);
  geo.computeVertexNormals();
  return geo;
}

// One shared drive per corner O-pair: TWO MESHED, counter-rotating driver gears
// (one crank pin + one locking cam each) below a centred reciprocating Geneva CROSS.
// The crank pins ride the cross slots EXACTLY on the centreline and rock it ±22.5°;
// the coaxial output gear meshes a 2:1 gear on each O tile, flipping both O's in sync.
// Geometry is the SOLVED engagement (kinematics.satorDriveGeometry): the drivers mesh
// (centres 2·rd apart) AND sit a distance c below the cross so the slot mouth lands on
// the rim at pin entry, with crank radius a = c·sin(amp). The cross is driven from
// satorDrivePins (≡ satorFlipStar), so the O-flip stays exact and the pins provably
// drive it (proven in kinematics.test.js), no longer just visually aligned.
function buildGearedDrive(p1, p2, oPivots, cell, thickness, gi, drive) {
  const g = new THREE.Group();
  const mid = p1.clone().add(p2).multiplyScalar(0.5);
  const d = Math.max(p1.distanceTo(mid), 1);
  // KNOBS (config.sator.drive). The step-up ratio sets the cross swing amp = π/(4·ratio):
  // a taller ratio = a smaller cross rock for the SAME 90° tile flip (legibility-locked, see
  // kinematics.satorFlipRock). Driver teeth + pressure angle are free (they don't touch the
  // proven cross angle). The SAME amp is fed to the flip tiles so the gear teeth stay meshed.
  const ratio = drive.ratio;
  const amp = Math.PI / (4 * ratio); // cross rock half-swing; ratio 2 → ±22.5°
  const bl = drive.backlash ?? 0; // print clearance: thins every tooth, mount geometry untouched
  const Zo = 12;
  const Zs = Math.round(ratio * Zo); // R:1 step-up (output gear : O gear), integer tooth count
  const m = (2 * d) / (Zs + Zo); // module so the pitch circles meet at distance d
  const pa = drive.pressureAngle;
  const gt = thickness * 0.5;
  const zBack = -thickness * (1.3 + gi * 0.5); // behind the board plate, each pair its own plane

  // a gear on each O tile pivot — rocks 0..90° with the tile (psi = satorFlipRock)
  for (const piv of oPivots) {
    const og = makeGear({ module: m, teeth: Zo, pressureAngle: pa, backlash: bl }, PALETTE.driven, { thickness: gt });
    og.position.z = zBack;
    piv.add(og);
  }

  g.position.set(mid.x, mid.y, zBack);
  g.rotation.z = Math.atan2(-mid.y, -mid.x) + Math.PI / 2; // "down" points toward the board centre

  // the SOLVED drive geometry: cross rim Rm, drivers (Zd teeth) meshing at 2·rd, set
  // a distance c below the cross so the slots line up with the crank pins exactly.
  const Rs = (m * Zs) / 2;
  const Rm = Rs * 0.72; // driven cross rim radius
  // driver teeth: guard so the driver pitch radius rd stays below c = Rm/cos(amp). Above that
  // the two drivers can't both mesh (centres 2·rd apart) AND sit a real depth H below the cross
  // (H = √(c²−rd²) would go imaginary) — so a too-large request is clamped to what fits.
  const c = Rm / Math.cos(amp);
  const ZdMax = Math.max(6, Math.floor((2 * 0.98 * c) / m));
  const Zd = Math.min(Math.max(Math.round(drive.driverTeeth), 6), ZdMax);
  const rd = (m * Zd) / 2; // driver pitch radius (centres 2·rd apart -> meshed)
  const geom = satorDriveGeometry(Rm, rd, amp);
  const pinR = cell * 0.035;

  // star = output gear (meshes the O gears) + the coaxial slotted/pocketed cross
  const star = new THREE.Object3D();
  const outGear = makeGear({ module: m, teeth: Zs, pressureAngle: pa, backlash: bl }, PALETTE.driver, { thickness: gt });
  const slotW = Math.max(pinR * 1.25, Rm * 0.05);
  // slot floor: kinematic slotBottom is the deepest PIN-CENTRE reach (c−a), so cut
  // a pin radius + 25% running clearance deeper or the pin surface bottoms out
  const floorExtra = pinR * 1.25;
  const cross = new THREE.Mesh(
    genevaCrossGeo(Rm, slotW, Rm - geom.slotBottom, gt * 0.9, [geom.sigmaA, geom.sigmaB], [geom.pocketA, geom.pocketB], floorExtra),
    metal(PALETTE.output)
  );
  cross.position.z = -gt; // just behind the output gear
  cross.castShadow = true;
  star.add(outGear, cross);
  g.add(star);

  // the two meshed driver gears at D1=(−rd,−H), D2=(+rd,−H); each crank pin orbits at
  // radius a (mounted at local (a,0) so its world angle == the gear angle), each cam is a
  // disc with a wedge gap CENTRED ON ITS PIN (gear-local 0) and narrower than gamma, so its
  // solid covers the pocket during dwell (locks the cross) yet clears the slot during the
  // push — see kinematics.satorCamGeometry, which proves both dwells lock and every push clears.
  const dz = -gt - gt * 0.9 - thickness * 0.16; // driver plane, behind the cross
  const cg = satorCamGeometry(geom);
  // The two drivers form an external meshing pair (centres 2·rd apart). Their gw rotation is
  // pinned by the engagement (satorDriverAngle) because gw carries the crank pin + cam, so we
  // can't phase the whole gear — instead we phase ONLY driver-2's TOOTH MESH (a child of gw),
  // leaving its pin + cam exactly where the proven kinematics put them. Since the two slot-rest
  // angles satisfy σ_A+σ_B = −π, the interlock phase reduces to mod(π − P/2, P): a half-tooth
  // for EVEN Zd (which would otherwise render tooth-on-tooth), zero for odd. φ cancels (the two
  // ±2φ terms meet at the contact line), so this static offset interlocks the teeth at all φ.
  const pitchD = TAU / Zd;
  const driverMeshPhase = mod(Math.PI - pitchD / 2, pitchD);
  const gears = [];
  for (const which of [1, 2]) {
    const D = which === 1 ? geom.D1 : geom.D2;
    const gw = new THREE.Object3D();
    gw.position.set(D[0], D[1], 0);
    const gear = makeGear({ module: m, teeth: Zd, pressureAngle: pa, backlash: bl }, which === 1 ? PALETTE.driver : PALETTE.driven, { thickness: gt });
    gear.position.z = dz;
    if (which === 2) gear.rotation.z = driverMeshPhase; // interlock the two meshed driver gears (tooth-in-gap)
    const camGeo = new THREE.CylinderGeometry(cg.camR, cg.camR, gt * 0.8, 24, 1, false, cg.thetaStart, cg.thetaLength);
    // CylinderGeometry sweeps theta from the +z axis (x = r·sinθ, z = r·cosθ), so
    // rotateX alone lands the wedge at planar angle θ−π/2 — 90° clockwise of the
    // satorCamGeometry contract (gap centred on local +x = the pin). The rotateZ
    // closes that frame mismatch so the rendered gap truly faces the pin.
    camGeo.rotateX(Math.PI / 2);
    camGeo.rotateZ(Math.PI / 2);
    const cam = new THREE.Mesh(camGeo, metal(PALETTE.lock, { rough: 0.6, metalness: 0.4 }));
    cam.position.z = dz + gt; // locking cam toward the cross
    gw.add(gear, cam, pin(geom.a, 0, pinR, gt + thickness * 0.18, dz)); // crank pin rides the slot
    g.add(gw);
    gears.push(gw);
  }

  // `spec` records everything parts() needs to rebuild this drive's bodies in
  // print pose (fresh geometry, not the live scene meshes).
  const spec = { gi, m, Zo, Zs, Zd, pa, gt, Rm, slotW, floorExtra, geom, cg, pinR, bl };
  return { group: g, star, gears, geom, Zd, driverMeshPhase, spec };
}

export class SatorSquare {
  constructor(p = {}) {
    this.group = new THREE.Group();
    const cell = (this.cell = p.cell ?? 40);
    const thickness = (this.thickness = p.thickness ?? 6);
    this.fit = p.fit ?? 0.25; // radial running clearance for printed fits (boss-in-hole)
    this.spinN = p.spinN ?? 4; // turns per board revolution for spin AND index tiles
    this.indexClicks = p.indexClicks ?? 4; // clicks per tile-turn for index tiles
    this.pushFrac = p.pushFrac ?? 0.62;
    const cells = p.cells ?? defaultCells();

    // O-flip drive knobs (modular). ratio sets the cross swing amp = π/(4·ratio); the SAME amp
    // drives both the rendered cross and the flip tiles so their gears stay meshed. Defaults
    // (ratio 2 → amp π/8, 10 driver teeth, 20° PA) reproduce the original drive exactly.
    this.drive = { ratio: 2, driverTeeth: 10, pressureAngle: 20, backlash: 0, ...(p.drive ?? {}) };
    this.flipAmp = Math.PI / (4 * this.drive.ratio);

    // Two carriers that rotate together by Phi: printable holds the board + tile
    // gears, decor holds the letters (excluded from STL, printed separately).
    this.printable = new THREE.Group();
    this.decor = new THREE.Group();
    this.group.add(this.printable, this.decor);

    // the turning board plate (rotates with the board)
    const span = cell * 5;
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(span, span, thickness * 0.6),
      metal(PALETTE.shaft, { metalness: 0.5, rough: 0.5 })
    );
    plate.position.z = -thickness * 0.55;
    plate.castShadow = plate.receiveShadow = true;
    this.printable.add(plate);

    this.tiles = [];
    const tileR = cell * 0.44;
    const counts = { fixed: 0, flip: 0, spin: 0, index: 0, upright: 0 };
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const letter = letterAt(row, col);
        // honor the requested behavior only if it is legal for this cell
        const opts = behaviorOptions(row, col);
        const requested = cells[cellKey(row, col)];
        const behavior = opts.includes(requested) ? requested : opts[0];
        counts[behavior] += 1;
        const params =
          behavior === 'spin'
            ? { n: this.spinN }
            : behavior === 'index'
              ? { n: this.spinN, clicks: this.indexClicks, pushFrac: this.pushFrac }
              : { freq: 2, pushFrac: this.pushFrac, amp: this.flipAmp }; // amp used by 'flip'
        const x = (col - 2) * cell;
        const y = (2 - row) * cell;

        // printable tile gear/disc — rotates by psi relative to the board
        const gearPivot = new THREE.Object3D();
        gearPivot.position.set(x, y, 0);
        gearPivot.add(disc(tileR, thickness, TILE_COLOR[behavior], { metalness: 0.6, rough: 0.4 }));
        this.printable.add(gearPivot);

        // decor letter — same transform, so the glyph tracks its tile
        const letterPivot = new THREE.Object3D();
        letterPivot.position.set(x, y, 0);
        letterPivot.add(letterGroup(letter, cell * 0.62, thickness * 0.5, thickness * 0.75));
        this.decor.add(letterPivot);

        this.tiles.push({ row, col, letter, behavior, params, gearPivot, letterPivot });
      }
    }
    this.counts = counts;
    // spin/index tiles read upright at the 90° detents only when the winding
    // (spinN) is a multiple of 4; everything else (upright/fixed/flip) always
    // does. So the whole square stays legible iff there are no winders, or the
    // winding is a multiple of 4.
    const hasWinders = counts.spin + counts.index > 0;
    this.legible = !hasWinders || indexUpright(this.spinN);

    // one shared double-Geneva drive per flip diagonal O-pair (both O's of a
    // diagonal are point-symmetric through the centre, so one shaft drives both)
    this.drives = [];
    if (p.drives !== false) {
      const tileAt = (r, c) => this.tiles.find((t) => t.row === r && t.col === c);
      CLUSTERS.forEach(([[r1, c1], [r2, c2]], gi) => {
        const a = tileAt(r1, c1);
        const b = tileAt(r2, c2);
        if (!a || !b || a.behavior !== 'flip' || b.behavior !== 'flip') return;
        const p1 = new THREE.Vector2((c1 - 2) * cell, (2 - r1) * cell);
        const p2 = new THREE.Vector2((c2 - 2) * cell, (2 - r2) * cell);
        const drive = buildGearedDrive(p1, p2, [a.gearPivot, b.gearPivot], cell, thickness, gi, this.drive);
        this.printable.add(drive.group);
        this.drives.push(drive);
      });
    }
  }

  update(phi) {
    this.printable.rotation.z = phi;
    this.decor.rotation.z = phi;
    for (const t of this.tiles) {
      const psi = satorTileAngle(t.behavior, phi, t.params);
      t.gearPivot.rotation.z = psi;
      t.letterPivot.rotation.z = psi;
    }
    for (const d of this.drives) {
      // solved engagement: the meshed gears turn ±2φ so each crank pin rides its slot on
      // the centreline, rocking the cross by satorFlipStar (dwelling ±22.5° at the detents).
      const s = satorDrivePins(phi, d.geom);
      d.star.rotation.z = s.cross;
      d.gears[0].rotation.z = s.theta1; // +2φ + phase (CCW)
      d.gears[1].rotation.z = s.theta2; // −2φ + phase (CW, meshed)
    }
  }

  info() {
    const c = this.counts;
    const motion =
      c.spin + c.index > 0
        ? `\nspin/index winding ${this.spinN} turns/board · ${this.indexClicks} clicks/turn`
        : '';
    // show the O-flip drive design only when there are driven O's to drive
    const driveInfo =
      this.drives.length > 0
        ? `\nO-drive ${this.drive.ratio}:1 step-up → cross rocks ±${((this.flipAmp * 180) / Math.PI).toFixed(1)}° (O flips 90°)`
        : '';
    return `SATOR square (5×5)\nupright ×${c.upright}  flip ×${c.flip}  spin ×${c.spin}  index ×${c.index}  fixed ×${c.fixed}${motion}${driveInfo}\nupright at 90° detents: ${this.legible ? 'yes' : 'NO'}`;
  }

  // The print kit: [{ name, count, object }] consumed by export.partsZipBytes.
  // Every object is a FRESH print-pose build (flat at the origin, +Z = the print
  // axis) — never the live scene — so calling this changes nothing on screen.
  // Identical pieces are deduplicated; `count` is the quantity to print and
  // lands in the STL filename (tile-disc-x25.stl). Print-pose gears are built
  // with bevel:false: the screen's edge bevel dilates the extruded body outward
  // by bevelSize, which would eat the whole backlash clearance in a real mesh
  // (roadmap P2). Caller owns disposal of the returned objects.
  parts() {
    const cell = this.cell;
    const t = this.thickness;
    const fit = this.fit;
    const glue = 0.1; // radial gap for glued joints (vs `fit` for running fits)
    const out = [];

    // --- tile mounting (assembly v1) -------------------------------------
    // Every disc carries an integral rear BOSS riding a plate clearance hole
    // (running fit). Non-driven tiles take a glued tile-cap washer behind the
    // plate; the centre N's boss is glued (it IS the fixed hub). Flip tiles
    // get a LONG boss reaching their drive's z-plane and glue the o-tile-gear
    // flush onto its end — the gear doubles as the retainer AND lands exactly
    // on its mesh plane (self-jigging). Drive shaft mounting is M3b (the
    // driver axes pass through the spinning output gear's disk, so shafts
    // need the rear-bracket + collision model — see roadmap).
    const tileR = cell * 0.44;
    let bossR = cell * 0.1;
    if (this.drives.length > 0) {
      // the boss must fit inside the O-gear's glued bore, which must stay
      // inside the gear web (the same 0.6·rf ceiling the other bores use)
      const rfO = gearMetrics({ module: this.drives[0].spec.m, teeth: this.drives[0].spec.Zo }).rf;
      bossR = Math.min(bossR, rfO * 0.6 - glue);
    }
    const holeR = bossR + fit;

    // exact-closure circle points (absarc's 2π seam leaves sliver vertices)
    const ring = (rr, cw, n = 32) => {
      const ps = [];
      for (let k = 0; k < n; k++) {
        const a = (cw ? -1 : 1) * (k / n) * TAU;
        ps.push(new THREE.Vector2(rr * Math.cos(a), rr * Math.sin(a)));
      }
      return ps;
    };

    // plate: extruded square with one clearance hole per tile boss
    const half = cell * 2.5;
    const plateShape = new THREE.Shape([
      new THREE.Vector2(-half, -half),
      new THREE.Vector2(half, -half),
      new THREE.Vector2(half, half),
      new THREE.Vector2(-half, half),
    ]);
    for (const tile of this.tiles) {
      const hole = new THREE.Path();
      hole.setFromPoints(ring(holeR, true).map((q) => q.add(new THREE.Vector2((tile.col - 2) * cell, (2 - tile.row) * cell))));
      plateShape.holes.push(hole);
    }
    const plateGeo = new THREE.ExtrudeGeometry(plateShape, { depth: t * 0.6, bevelEnabled: false, curveSegments: 24 });
    plateGeo.translate(0, 0, -t * 0.3);
    out.push({ name: 'plate', count: 1, object: new THREE.Mesh(plateGeo, metal(PALETTE.shaft)) });

    // discs with integral bosses. Boss lengths are self-jigging: assembled
    // with the disc back 0.1 off the plate front, the standard boss protrudes
    // 2mm past the plate back (the cap glues over it) and the flip boss tip
    // lands exactly on the O-gear's back face at its drive plane zBack(gi).
    const bossDisc = (bossLen) => {
      const g = new THREE.Group();
      g.add(disc(tileR, t, PALETTE.output));
      const boss = disc(bossR, bossLen + 0.2, PALETTE.shaft); // 0.2 sunk into the disc
      boss.position.z = -t / 2 - bossLen / 2 + 0.1;
      g.add(boss);
      return g;
    };
    const flipGi = new Map(); // 'r,c' -> cluster index, only for tiles a BUILT drive covers
    for (const d of this.drives) for (const [r, c] of CLUSTERS[d.spec.gi]) flipGi.set(cellKey(r, c), d.spec.gi);
    let stdCount = 0;
    const flipCounts = [0, 0];
    for (const tile of this.tiles) {
      const gi = flipGi.get(cellKey(tile.row, tile.col));
      if (gi === undefined) stdCount += 1;
      else flipCounts[gi] += 1;
    }
    const Lstd = 0.1 + t * 0.6 + 2;
    const Lflip = (gi) => 0.1 + t * (1.3 + 0.5 * gi); // boss tip = zBack(gi) − gt/2, the gear's back face
    out.push({ name: 'tile-disc', count: stdCount, object: bossDisc(Lstd) });
    if (flipCounts[0] > 0) out.push({ name: 'tile-disc-flip-a', count: flipCounts[0], object: bossDisc(Lflip(0)) });
    if (flipCounts[1] > 0) out.push({ name: 'tile-disc-flip-b', count: flipCounts[1], object: bossDisc(Lflip(1)) });

    // retainer caps for the non-driven, non-fixed tiles (the centre is glued)
    const washer = (rOut, rIn, thk) => {
      const sh = new THREE.Shape(ring(rOut, false));
      const hole = new THREE.Path();
      hole.setFromPoints(ring(rIn, true));
      sh.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: thk, bevelEnabled: false });
      geo.translate(0, 0, -thk / 2);
      return new THREE.Mesh(geo, metal(PALETTE.lock));
    };
    out.push({ name: 'tile-cap', count: stdCount - 1, object: washer(bossR + 2.5, bossR + glue, 2) });

    // letters, deduplicated by glyph with the board's true counts; pixelScale
    // 1.02 overlaps adjacent pixels so each glyph prints as one connected piece
    const letterCounts = {};
    for (const tile of this.tiles) letterCounts[tile.letter] = (letterCounts[tile.letter] ?? 0) + 1;
    for (const [ch, count] of Object.entries(letterCounts)) {
      out.push({ name: `letter-${ch}`, count, object: letterGroup(ch, cell * 0.62, t * 0.5, 0, 1.02) });
    }

    // drive hardware. The corner drives are geometrically identical (same pair
    // spacing and the one shared drive config), so quantities scale with how
    // many drives the current board actually built.
    if (this.drives.length > 0) {
      const n = this.drives.length;
      const s = this.drives[0].spec;
      const print = { thickness: s.gt, bevel: false }; // true contour at every z
      const gear = (teeth, color, bore = 0) =>
        makeGear({ module: s.m, teeth, pressureAngle: s.pa, backlash: s.bl }, color, { ...print, bore });
      // the O gear glues flush onto the flip tile's boss end (glue gap, not a running fit)
      out.push({ name: 'o-tile-gear', count: 2 * n, object: gear(s.Zo, PALETTE.driven, bossR + glue) });
      out.push({ name: 'drive-output-gear', count: n, object: gear(s.Zs, PALETTE.driver) });

      const cross = new THREE.Mesh(
        genevaCrossGeo(s.Rm, s.slotW, s.Rm - s.geom.slotBottom, s.gt * 0.9, [s.geom.sigmaA, s.geom.sigmaB], [s.geom.pocketA, s.geom.pocketB], s.floorExtra),
        metal(PALETTE.output)
      );
      out.push({ name: 'drive-cross', count: n, object: cross });

      // driver = gear + locking cam + crank pin as ONE rigid printed part. Two
      // print-pose fixes versus the scene: the cam is sunk to overlap the gear
      // face (on screen it floats 0.1·gt above, in its own z-plane), and it is
      // an EXTRUDED solid wedge — the scene's partial CylinderGeometry has no
      // walls on the cut faces, fine to look at but not a watertight STL. The
      // wedge also takes a 0.15mm radial relief: the kinematic camR exactly
      // kisses the pocket bottom (zero design clearance on a sliding fit).
      const camRelief = 0.15;
      const buildDriver = (gearPhase) => {
        const driver = new THREE.Object3D();
        const camShape = new THREE.Shape();
        camShape.moveTo(0, 0);
        camShape.absarc(0, 0, s.cg.camR - camRelief, s.cg.thetaStart, s.cg.thetaStart + s.cg.thetaLength, false);
        camShape.lineTo(0, 0);
        const camGeo = new THREE.ExtrudeGeometry(camShape, { depth: s.gt * 0.8, bevelEnabled: false, curveSegments: 24 });
        camGeo.translate(0, 0, -s.gt * 0.4);
        const cam = new THREE.Mesh(camGeo, metal(PALETTE.lock));
        cam.position.z = s.gt * 0.85; // bottom at 0.45·gt — 0.05·gt into the gear face
        const driverGear = gear(s.Zd, PALETTE.driver);
        driverGear.rotation.z = gearPhase; // baked into the printed part
        driver.add(driverGear, cam, pin(s.geom.a, 0, s.pinR, s.gt + t * 0.18, 0));
        return driver;
      };
      // The two meshed drivers of a pair are NOT interchangeable when the tooth
      // interlock phase is non-zero (even driver teeth): the pin and cam pin the
      // body's clocking, so the phase must live in the printed teeth themselves.
      // One part per role; for odd counts (phase 0) one part covers both.
      const phase = this.drives[0].driverMeshPhase;
      if (phase > 1e-12) {
        out.push({ name: 'drive-driver-a', count: n, object: buildDriver(0) });
        out.push({ name: 'drive-driver-b', count: n, object: buildDriver(phase) });
      } else {
        out.push({ name: 'drive-driver', count: 2 * n, object: buildDriver(0) });
      }
    }
    return out;
  }

  // Assembly instructions for the kit's README (export.partsZipBytes notes).
  printNotes() {
    const notes = [
      'assembly (v1, tile system):',
      '- each tile disc rides a plate hole on its rear boss (running fit; the',
      '  "fit" knob sets the radial clearance, default 0.25mm).',
      '- glue the centre N tile boss into its hole: it is the fixed hub.',
      '- glue a tile-cap over each remaining non-flip boss end behind the plate.',
      '- glue each letter onto its tile disc face.',
    ];
    if (this.drives.length > 0) {
      notes.push(
        '- flip O tiles: glue the o-tile-gear flush onto the long boss end —',
        '  the gear is the retainer AND lands exactly on its mesh plane.',
        '- glue each drive-cross face-to-face onto its drive-output-gear (coaxial;',
        '  drive-driver-a/b differ by a half-tooth — keep the pairs as named).',
        '- drive shafts/bracket are NOT in this kit yet (roadmap M3b): the drive',
        '  stack must be mounted by hand for now.'
      );
    }
    return notes;
  }

  dispose() {
    disposeObject(this.group);
  }
}

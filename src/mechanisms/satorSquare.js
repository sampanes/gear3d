// SATOR square — a 5×5 turning letter board. The whole board (carrier) rotates
// by Phi; each tile rotates by psi RELATIVE to the board so the square reads
// upright again at every 90° detent. Per-tile motion is the closed-form
// kinematics in kinematics.satorTileAngle (always-upright idler, fixed hub,
// fixed-sun planetary spin, double-Geneva O-flip); see docs/sator-square.md.
//
// The mechanism splits into two sub-groups that turn together: `printable` (the
// board + tile gears — what STL export serialises) and `decor` (the block-letter
// glyphs, printed separately). Both carry identical per-tile transforms so the
// letters track their tiles while staying excluded from the export.

import * as THREE from 'three';
import { satorTileAngle } from '../kinematics.js';
import { PALETTE, metal, disc, disposeObject } from '../parts.js';

const WORD = ['SATOR', 'AREPO', 'TENET', 'OPERA', 'ROTAS'];

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

// Default per-cell behavior: the centre N is the fixed hub, the four O tiles
// flip, one A spins for variety, everything else stays upright.
function defaultBehavior(row, col, letter) {
  if (row === 2 && col === 2) return 'fixed';
  if (letter === 'O') return 'flip';
  if (row === 0 && col === 1) return 'spin'; // the diversity tile (an A)
  return 'upright';
}

const TILE_COLOR = {
  fixed: PALETTE.lock,
  flip: PALETTE.driven,
  spin: PALETTE.driver,
  upright: PALETTE.output,
};

// A block letter built from unit boxes on a 3×5 grid, centred at the origin and
// standing proud of the tile face at +z. Tagged userData.isLetter so the
// printable/decor split (and tests) can identify letter geometry.
function letterGroup(ch, size, depth, z) {
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
      const box = new THREE.Mesh(new THREE.BoxGeometry(cw * 0.92, rh * 0.92, depth), mat);
      box.position.set((c - 1) * cw, (2 - r) * rh, z);
      box.castShadow = true;
      g.add(box);
    }
  }
  return g;
}

export class SatorSquare {
  constructor(p = {}) {
    this.group = new THREE.Group();
    const cell = p.cell ?? 40;
    const thickness = p.thickness ?? 6;
    this.spinN = p.spinN ?? 4;
    this.pushFrac = p.pushFrac ?? 0.62;

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
    const counts = { fixed: 0, flip: 0, spin: 0, upright: 0 };
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const letter = WORD[row][col];
        const behavior = defaultBehavior(row, col, letter);
        counts[behavior] += 1;
        const params = behavior === 'spin' ? { n: this.spinN } : { freq: 2, pushFrac: this.pushFrac };
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
  }

  update(phi) {
    this.printable.rotation.z = phi;
    this.decor.rotation.z = phi;
    for (const t of this.tiles) {
      const psi = satorTileAngle(t.behavior, phi, t.params);
      t.gearPivot.rotation.z = psi;
      t.letterPivot.rotation.z = psi;
    }
  }

  info() {
    const c = this.counts;
    return `SATOR square (5×5)\nupright ×${c.upright}  flip ×${c.flip} (O)  spin ×${c.spin}  fixed ×${c.fixed} (N)\nreads upright every 90°`;
  }

  dispose() {
    disposeObject(this.group);
  }
}

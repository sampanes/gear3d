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
import { satorTileAngle, indexUpright, flipAngle } from '../kinematics.js';
import { PALETTE, metal, disc, pin, disposeObject } from '../parts.js';

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

// An illustrative shared double-Geneva drive for a flip diagonal O-pair: two
// counter-rotating wheels + a rocker at the board centre, and one shaft running
// along the pair's diagonal THROUGH the centre to both tiles — so a single drive
// flips both O's. The rocker is driven straight from the flip value (so it stays
// exactly in sync with the tiles); the shaft stands in for the cross-board
// transmission rather than a full gear train. `gi` offsets each pair's drive to
// its own z-plane behind the board so two diagonals don't collide.
function buildFlipDrive(p1, cell, thickness, gi) {
  const g = new THREE.Group();
  const len = p1.length();
  const ang = Math.atan2(p1.y, p1.x);
  const z = -thickness * (1.4 + gi * 0.7);

  // shaft along the diagonal, reaching from one tile through the centre to the other
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(cell * 0.05, cell * 0.05, 2 * len, 16),
    metal(PALETTE.shaft, { metalness: 0.85, rough: 0.3 })
  );
  shaft.rotation.z = ang - Math.PI / 2; // cylinder axis (+Y) -> the diagonal
  shaft.position.z = z;
  shaft.castShadow = true;
  g.add(shaft);

  // two counter-rotating wheels at the centre, each with a crank pin
  const rW = cell * 0.3;
  const wThk = cell * 0.1;
  const front = new THREE.Object3D();
  const fd = disc(rW, wThk, PALETTE.driver);
  fd.position.z = z + wThk;
  front.add(fd, pin(rW * 0.7, 0, cell * 0.05, wThk * 1.6, z + wThk * 0.4));
  const back = new THREE.Object3D();
  const bd = disc(rW, wThk, PALETTE.driven);
  bd.position.z = z - wThk;
  back.add(bd, pin(rW * 0.7, 0, cell * 0.05, wThk * 1.6, z - wThk * 2));
  g.add(front, back);

  // a rocker lever just above the wheels, rocking with the flip toggle
  const rocker = new THREE.Object3D();
  rocker.position.set(0, rW * 1.5, z);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(cell * 0.12, rW * 1.3, thickness * 0.4), metal(PALETTE.output));
  bar.position.y = -rW * 0.65;
  rocker.add(bar);
  g.add(rocker);

  return { group: g, front, back, rocker };
}

export class SatorSquare {
  constructor(p = {}) {
    this.group = new THREE.Group();
    const cell = p.cell ?? 40;
    const thickness = p.thickness ?? 6;
    this.spinN = p.spinN ?? 4; // turns per board revolution for spin AND index tiles
    this.indexClicks = p.indexClicks ?? 4; // clicks per tile-turn for index tiles
    this.pushFrac = p.pushFrac ?? 0.62;
    const cells = p.cells ?? defaultCells();

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
              : { freq: 2, pushFrac: this.pushFrac };
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
      const behaviorAt = (r, c) => {
        const t = this.tiles.find((x) => x.row === r && x.col === c);
        return t ? t.behavior : null;
      };
      const DIAGONALS = [[[0, 3], [4, 1]], [[1, 4], [3, 0]]];
      DIAGONALS.forEach(([[r1, c1], [r2, c2]], gi) => {
        if (behaviorAt(r1, c1) !== 'flip' || behaviorAt(r2, c2) !== 'flip') return;
        const p1 = new THREE.Vector2((c1 - 2) * cell, (2 - r1) * cell);
        const d = buildFlipDrive(p1, cell, thickness, gi);
        this.printable.add(d.group);
        this.drives.push(d);
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
    if (this.drives.length) {
      const flipVal = flipAngle(2 * phi, this.pushFrac); // the {0,π} toggle the drive produces
      for (const d of this.drives) {
        d.front.rotation.z = phi * 3; // counter-rotating wheels (illustrative)
        d.back.rotation.z = -phi * 3;
        d.rocker.rotation.z = flipVal; // rocker swings with the flip, in sync with both tiles
      }
    }
  }

  info() {
    const c = this.counts;
    const motion =
      c.spin + c.index > 0
        ? `\nspin/index winding ${this.spinN} turns/board · ${this.indexClicks} clicks/turn`
        : '';
    return `SATOR square (5×5)\nupright ×${c.upright}  flip ×${c.flip}  spin ×${c.spin}  index ×${c.index}  fixed ×${c.fixed}${motion}\nupright at 90° detents: ${this.legible ? 'yes' : 'NO'}`;
  }

  dispose() {
    disposeObject(this.group);
  }
}

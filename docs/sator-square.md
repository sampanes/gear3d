# SATOR square — mechanism design

> Status: **design / plan** (no implementation yet). This document describes how
> to build a *SATOR square* variant on top of the existing gear3d primitives.

A wall-mounted **5×5 letter board** carrying the Latin SATOR word square. You
turn the whole board on the wall; **every 90° of board rotation the square reads
upright again**. Most letters simply stay upright, the four **O** tiles *click*
back and forth, and a few tiles may *spin* for variety. It is built as a
**per-cell "pick & place" generator**: assign a mechanical *behavior* to each of
the 25 cells and try combinations.

```
S A T O R
A R E P O
T E N E T      O at (1,4) (2,5) (4,1) (5,2);  N at the centre (3,3)
O P E R A
R O T A S
```

## Why 90° is the right number

The SATOR square is a **symmetric palindrome** (the matrix equals its own
transpose, and rotating the grid 180° maps it onto itself). A **90° rotation
maps the grid onto a valid — mirror-image — SATOR square**, so at every quarter
turn the *words still read correctly*. Combine that with per-tile counter-rotation
that brings each letter upright at the same instants, and the whole piece keeps
re-forming a legible SATOR square every 90°.

## Kinematic foundation

Let `Φ` = board (carrier) angle. A tile's orientation in the wall frame is
`absolute = Φ + ψ`, where `ψ` is the tile's rotation **relative to the board**
(set by its drive). A **fixed reference that does not rotate with the board** is
required, or the tiles rigidly follow it — here the **centre cell (the N)** sits
on the rotation axis and doubles as that fixed reference / ground hub.

"Upright at every `Φ = k·90°`" means `absolute ≡ 0 (mod 360°)` at those angles.
Writing `absolute = N·Φ`:

- this holds for all `k` **iff `N ≡ 0 (mod 4)`**;
- `N = 0` → *always* upright (an anti-rotation idler — the tile orbits but never
  changes orientation);
- `N = 4` → the smallest "spinning" case: the tile turns **4 full revolutions per
  board revolution**, passing through upright exactly at each 90°.

> Note: even an *always-upright* tile still **orbits** to a new grid position as
> the board turns (only its orientation is held). So the piece animates even when
> most letters stay upright.

## Per-cell behavior catalog

Only **O, S, N** are 180°-symmetric in this square; **A, T, R, E, P are not**, so
a non-symmetric letter can never be *flipped* (it would read upside-down at half
the detents — exactly what the O trick avoids).

| Behavior | Motion between detents | Realization | Valid letters |
| --- | --- | --- | --- |
| **Fixed** | never moves (on the axis) | bolted to the wall hub | centre only → **N** |
| **Always-upright** | orbits, orientation held | 1:1 anti-rotation referenced to the hub (idler / ring) | **any** (the default) |
| **Flip / click** | dwells, toggles upright ↔ inverted | double-Geneva, dwell `{0, π}` | symmetric only: **O**, S, N |
| **Spin** | spins, upright only *at* each detent | fixed-sun planetary, `zSun/zPlanet = 3` | any (best on symmetric; non-symmetric only if you stop at detents) — the "diversity" exception |

A natural default palette: 4 **O**'s flip; the 2 corner **S**'s may flip or spin
(free, since S is symmetric); one **A**/**T** set to spin as the exception;
everything else always-upright; **N** is the fixed hub.

## Mapping behaviors onto existing primitives

Most of what's needed already exists in the repo (added with the planetary +
internal-ring work):

- **Spin** → `kinematics.planetaryAngles(Φ, zSun, zPlanet, 'sun')`. With the board
  as the carrier and the sun fixed, the returned `planetSpin = Φ·(1 + zSun/zPlanet)`.
  Choosing `zSun/zPlanet = 3` (e.g. `zSun = 36`, `zPlanet = 12`) gives `planetSpin
  = 4·Φ` — the `N = 4` spin. The printable gear is a `mechanisms/Planetary` set
  (`makeGear` planets, `makeRingGear` ring, `zRing = zSun + 2·zPlanet`).
- **Always-upright** → a 1:1 anti-rotation: a tile gear of equal teeth driven from
  the fixed centre **through one idler** (the sign flip an idler provides is why
  `planetSpin = 0` is *not* reachable with a bare sun+planet). In the generator the
  per-tile angle is simply `ψ = -Φ` (absolute 0); the idler/ring train is the
  printable realization. `internalGearRatio` / a fixed ring (`makeRingGear`,
  `mechanisms/InternalGear`) are the cleanest physical route from the central hub.
- **Flip / click** → the existing `mechanisms/DoubleGeneva` + `kinematics.doubleGenevaOutput`,
  with **one small generalization**: its dwell targets are currently `{-amp, +amp}`;
  the O needs them at `{0, π}` (upright / inverted). Either add `(dwellA, dwellB)`
  parameters or wrap it (`amp = π/2` plus a `π/2` offset).
- **Fixed** → no kinematics; the tile is parented to the static hub, not the board.

### Generator kinematics vs. printable gears

The repo deliberately separates **pure motion math** (`kinematics.js`, unit-tested)
from **meshes** (`mechanisms/*`). SATOR follows that: per-tile angles are trivial
closed forms — `ψ = -Φ` (upright), `ψ = (N-1)·Φ` (spin), `ψ = -Φ + flip(Φ)` (O) —
while the *gear network* (planetary for spin tiles, idler/ring for upright tiles,
double-Geneva for O tiles) is the physically faithful, printable realization that
`planetaryAngles` etc. validate.

## Mechanism class (data-driven)

A single `mechanisms/satorSquare.js` following the standard contract
(`constructor` / `update(theta)` / `info()` / `dispose()`):

- Holds a **5×5 grid of `{ letter, behavior, params }`** — this *is* the
  pick-&-place state, editable from the UI and saveable as presets.
- Builds two sub-groups:
  - **`printable`** — board, spindles, gears, ring/hub, Geneva parts.
  - **`decor`** — the block-letter glyphs (visual only).
- `update(Φ)` rotates the board carrier by `Φ` and applies each cell's behavior
  (closed-form `ψ` for rendering; the gear parts move with it).

## Letters & STL export

- **Letters are simple block / strip geometry** (no font dependency) and live in
  the **`decor`** sub-group.
- **STL export excludes the letters** — they are printed separately. Because
  `export.saveSTL(object, …)` serializes whatever object it is given, the export
  action simply passes **`mechanism.printable`** instead of `mechanism.group`.
  No change to the exporter itself.

## New work required (small)

The planetary/ring primitives already exist, so the genuinely new pieces are:

1. **Generalize `doubleGenevaOutput`** dwell targets to `{0, π}` for the O flip
   (+ a unit test, matching the existing kinematics test style).
2. A thin **per-cell behavior dispatcher** + `alwaysUpright` / `spin` angle
   helpers (wrappers over `planetaryAngles`) + a 90° detent helper — in
   `kinematics.js`, with tests.
3. The **`SatorSquare`** mechanism class (grid state, `printable` + `decor`).
4. **Block-letter** geometry (decor only) and the **letters-excluded** export
   wiring (`saveSTL(mechanism.printable)`).
5. UI: a `'SATOR square'` mode with a **per-cell behavior editor + presets**.

## Suggested phases

- **P0** kinematics + tests (double-Geneva `{0,π}`, behavior dispatcher, detents).
- **P1** static board + 25 block letters render in correct positions.
- **P2** motion: always-upright + spin tiles, verified upright at each 90°.
- **P3** the four O tiles flipping via the generalized double-Geneva.
- **P4** illustrative printable gear network + letters-excluded STL split.
- **P5** UI behavior editor, presets, optional educational overlays.

## How it ships

- SATOR is planned as **one more entry in the existing mode switcher**
  (Spur / Geneva / Double Geneva / Internal / Planetary → + SATOR), **not a
  branch**. It is purely additive — a self-contained `mechanisms/satorSquare.js`
  plus tiny wiring in `main.js` / `ui.js` and a fenced section in `kinematics.js`
  — so free-form gear building stays exactly as it is and there is no fork to
  cherry-pick between.
- The one shared change — generalizing `doubleGenevaOutput`'s dwell targets from
  `{−amp, +amp}` to `{0, π}` for the O flip — is **backward-compatible** and also
  makes the existing Double Geneva mode more capable.
- The **Spin** behavior reuses the committed planetary primitive
  (`planetaryAngles`, `Planetary`, `makeRingGear`) rather than duplicating it.
- The repo is **local-only — commit, never push.**

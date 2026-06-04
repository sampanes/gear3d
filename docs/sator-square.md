# SATOR square — mechanism design

> Status: **implemented.** All phases (P0 kinematics → P5 per-cell editor +
> presets) are built and unit-tested as the *SATOR square* mode
> (`src/mechanisms/satorSquare.js`), plus two later additions: an **`index`**
> (single-Geneva clicking) tile behavior, and a rendered **geared O-flip drive**
> — a double-Geneva *reciprocating* mechanism (see [O-flip drive](#o-flip-drive--double-geneva-reciprocating-mechanism)
> below, whose pin-in-slot engagement is now **fully derived and unit-tested**).
> This document is the design it was built from.

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
| **Index / click** | clicks through discrete steps (single Geneva) | stepped spin: `clicks` per tile-turn × `n` turns/board | any — but reads upright at the detents **only when the winding `n` is a multiple of 4** (the readout reports it; a free choice for experimenting with clicking motion) |

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

- **P0 ✅** kinematics + tests (double-Geneva `{0,π}`, behavior dispatcher, detents).
- **P1 ✅** static board + 25 block letters render in correct positions.
- **P2 ✅** motion: always-upright + spin tiles, verified upright at each 90°.
- **P3 ✅** the four O tiles flipping via the generalized double-Geneva.
- **P4 ✅** printable/decor split — STL export passes `mechanism.printable` (letters excluded).
- **P5 ✅** per-cell behavior editor + built-in presets (Default / All upright / Max flip / Playful).

## O-flip drive — double-Geneva *reciprocating* mechanism

> Status: **solved.** Kinematics + render + the pin-in-slot engagement
> derivation, all unit-tested (see *Solved* below).

The four **O** tiles flip (read upright-or-inverted at every 90°). Unlike the
other letters they are **not** held upright by an idler — each **rides the
board**, and a small drive supplies only the correction. The drive is a
*reciprocating* double-Geneva, one per **close corner pair** of O's
(`{(0,3),(1,4)}` and `{(3,0),(4,1)}`):

- **Two meshed driver gears** (counter-rotating from one input), each with a
  **crank pin** and a **locking cam**.
- A driven **Geneva cross**: a disc with **2 radial pin-slots (0°/180°)** and
  **2 concave dwell pockets (90°/270°)** — a 4-pointed star with two grooved
  points.
- The two pins **alternately** enter the slots and **rock** the cross one way
  then back (reciprocation); the cams ride the pockets to **lock** it between
  strokes.
- The cross carries a coaxial **output gear** that meshes a **2:1** gear on each
  O of the pair → both O's flip in sync.

### The numbers (one board quarter-turn)

- A board-riding O ends up **sideways**; the minimum to read again is a **90°**
  correction (board frame). It's 90° — not 45° or 180° — because the O is
  180°-symmetric, so landing on **0° or 180°** both read as "O" (hence the
  correction may go *either* direction).
- So the drive rocks the O **90°** (board frame); with the board's own
  90°/detent that is a **180° flip-and-hold** in the world frame.
- Via the **2:1** gear the **cross rocks 45° (±22.5°)** to produce the O's 90°.
  Chain: **cross 45° → O 90° (board) → 180° world flip.** The O reads at every
  detent because it sits at 0° or 180° there.

### Code

- `kinematics.satorFlipStar(Φ)` / `satorFlipRock(Φ)` — the cross rock (±22.5°,
  `doubleGenevaRocker(2Φ, π/8)`) and the O's 0..90° rock (`π/4 − 2·satorFlipStar`);
  `satorTileAngle('flip')` returns the latter.
- `kinematics.satorDriveGeometry(rim, rd, amp)` — the solved static geometry:
  centre distance `c`, crank radius `a`, driver depth `H`, the two slot rest angles
  `σ_A,σ_B`, the two cam-pocket angles, and the slot-bottom radius.
- `kinematics.satorDriverAngle(Φ, which, geom)` — the ±2Φ (+phase) gear angles;
  `kinematics.satorDrivePins(Φ, geom)` — the cross angle (≡ `satorFlipStar`), the
  engaged pin index, and both crank-pin world positions (on the engaged slot's
  centreline).
- `kinematics.satorCamGeometry(geom)` — the locking-cam geometry: disc radius, and
  the wedge-gap `thetaStart`/`thetaLength` (gap centred on the pin, half-width
  `γ·0.6`) that the render feeds straight to a `CylinderGeometry`.
- `mechanisms/satorSquare.js` — `genevaCrossGeo` (the 2-slot/2-pocket cross, with
  the slot & pocket angles passed in) and `buildGearedDrive` (cross + output gear +
  two meshed cam-and-pin drivers, all placed from `satorDriveGeometry`).

### How we got here (brief)

Earlier passes: holding the O upright + a full `{0, π}` 180° toggle (overkill —
and a *real* Geneva can't swing a full 180°, that's its degenerate limit); a
single-slot **swinging slotted lever** (works, but the offset pivot is taller /
harder to print); coaxial counter-rotating wheels. A reference (a Fusion-360
"Double-Geneva reciprocating mechanism": two meshed gears + a 2-slot/2-pocket
cross + cams) is flatter and printable, so the drive was retopologized to it.

### Solved — the engagement

The two-offset-meshed-driver reciprocation is derived and unit-tested: the pins
*provably* drive the cross (on the slot centerline) and the cams *provably* lock
it during dwell. The drivers are no longer illustrative.

- **Key insight.** Each crank-pin/slot pairing is an ordinary *external Geneva*
  engagement — just with the driver centre **offset** from the centred cross.
  With the driver a distance `c` from the cross centre and the crank radius
  `a = c·sin(amp)`, the cross angle obeys the same `atan2` law as
  `genevaStarAngle`/`doubleGenevaRocker`, so the pin rides the slot centerline
  **exactly** and the cross reaches ±amp with zero angular velocity (soft
  entry/exit). The two pins orbit *different* centres `D₁,D₂ = (∓rd, −H)` — which
  is what lets the two driver gears genuinely **mesh and counter-rotate** — and
  they enter two slots that *face the drivers*, at rest angles `σ = dir(O_c→D_i)`,
  separated by `2·atan2(rd,H)` (not 180°; the earlier "0°/180°" was the
  unsolved placeholder).
- **Reciprocation, not indexing.** Pin 1 (the CCW gear) is the mirror of pin 2
  (the CW gear) across the vertical, so pin 1 rocks the cross +amp→−amp and pin 2
  rocks it −amp→+amp — they alternate, rocking back and forth rather than indexing
  one way.
- **Numbers.** The drivers mesh (centres `2·rd` apart) **and** sit a distance
  `c = rim/cos(amp)` from the cross, which fixes `H = √(c²−rd²)` (it is *not* free)
  and lands the slot mouth on the cross rim at pin entry. amp = π/8, so each push
  rocks the cross ±22.5°. The meshed gears turn **±2Φ** (two revs/board → 4 pushes,
  one per 90° detent) — *not* the old illustrative ±3Φ — phased so the pushes land
  at Φ = 45°,135°,225°,315° and the dwells cover the detents. The cross output is
  still `satorFlipStar` exactly, so the O-flip motion is untouched.
- **Locking.** Each driver carries a cam — a disc on `D_i` with one wedge gap
  **centred on its crank pin** (gear-local angle 0, since the pin mounts at
  `(a,0)`, so the gap tracks the pin as the gear turns), half-width `γ·0.6` with
  `γ = π/2−amp` the engagement half-window. That is the whole trick: the gap is
  *narrower* than `γ`, so during each dwell the solid still covers the toward-`O_c`
  pocket contact (which sits ≈ 67.5°–112.5° off the pin) and **locks** the cross,
  yet it is wide enough to clear the slot channel through the push. A concave
  pocket on the cross at local angle `σ_i ∓ amp` rotates onto `D_i` exactly at the
  dwell it holds (`pocketA`→D₁ at +amp, `pocketB`→D₂ at −amp), so the disc nests
  in it. (Centring the gap on the line of centres instead leaves a dwell unlocked —
  the one defect the adversarial pass caught and corrected.)

**Tests** (`test/kinematics.test.js`, in the `genevaStarAngle` style): the engaged
pin rides the slot centerline to ~1e-15 across the whole window (radius sweeping
slot-bottom → mouth); the drive reciprocates (pin 1 +amp→−amp, pin 2 −amp→+amp)
and the cross equals `satorFlipStar`; the meshed gears counter-rotate at ±2Φ; each
cam pocket lands on its driver axis at the dwell it holds; and the gap-on-pin cam
locks **both** dwells 100% (sampled) while clearing every push.
`test/mechanisms.test.js` checks the render wires `update()` onto these and that
the rendered drive's cam locks the cross at every detent.

> Derivation method: four independent re-derivations (different framings) plus an
> adversarial pass on each load-bearing claim, then an empirical check — the pin
> stays on the slot centerline and the geometry reproduces `satorFlipStar` to
> machine precision.

### Seeing it (offline)

`node tools/shoot.mjs` renders frozen states to `tools/shots/` headlessly via
Playwright (one-time `npx playwright install chromium`; capture is offline). The
live app honours `?mode=SATOR%20square&angle=<deg>&az=&el=&drives=0|1`;
`sator-drive.png` is the 3/4 view of the drives.

## How it ships

- SATOR is planned as **one more entry in the existing mode switcher**
  (Spur / Geneva / Double Geneva / Internal / Planetary → + SATOR), **not a
  branch**. It is purely additive — a self-contained `mechanisms/satorSquare.js`
  plus tiny wiring in `main.js` / `ui.js` and a fenced section in `kinematics.js`
  — so free-form gear building stays exactly as it is and there is no fork to
  cherry-pick between.
- The **O flip** evolved past the simple `{0, π}` toggle into the geared
  reciprocating drive in [O-flip drive](#o-flip-drive--double-geneva-reciprocating-mechanism)
  above; the original `doubleGenevaOutput` `{0, π}` generalization remains in
  `kinematics.js` (with its tests) but is no longer the flip path.
- The **Spin** behavior reuses the committed planetary primitive
  (`planetaryAngles`, `Planetary`, `makeRingGear`) rather than duplicating it.
- The repo is **local-only — commit, never push.**

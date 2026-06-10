# SATOR modular drive — design / spec (Tier 2: per-cell mechanism + cohesion solver)

> Status: **DESIGN — not yet implemented.** No code is written by this document;
> it is the spec the implementation will be built from (the same way
> [fillet-design.md](fillet-design.md) preceded `rootFilletGeometry`). It defines
> how to generalize the single global O-flip drive into **per-cell drive
> mechanisms** held coherent by a small **constraint solver**, so a user can swap
> one cell's mechanism (e.g. "give both E tiles an outer ring gear") and the
> planner either keeps the whole square cohesive or tells them exactly what breaks
> and which setting fixes it.

## Scope

- **In scope:** the data model + solver + UI design for a *per-cell* drive
  mechanism, and the path from today's *one global amp* cohesion to a *per-cell
  mechanism network re-locked by a solver*. The deliverable this run is the doc.
- **Reuse, don't reinvent:** the ring/internal gear mechanism and the
  shared-amplitude cohesion mechanism **already exist** (see Current
  architecture). Tier 2 *generalizes* the existing global lock; it does not invent
  a new kinematic system.
- **Out of scope (this run):** any source change, the cutter/print-tolerance
  layer, multi-board / non-5×5 layouts, persistence (save/load), and the v2
  per-cell *render hardware* for behaviors that today carry none (upright/spin
  discs). Those are noted under [Out of scope](#out-of-scope) with the assumptions
  that bound them.

## Goal & the Tier-2 vision

The confirmed project north star is a **modular, mechanically sound, *adjustable*
SATOR square planner** — *buildable + tweakable*, not *animates on screen*. Two
tiers of "modular" were discussed; **Tier 2 is the target**:

- **Tier 1 (NOT the goal).** Adjust numeric knobs (`ratio`, `driverTeeth`,
  `pressureAngle`) on the *single global* drive the whole wall already shares.
  This already exists (`config.sator.drive`, see Current architecture) and is the
  *floor*, not the goal.
- **Tier 2 (THE GOAL).** Swap an *individual cell's* drive **mechanism** and have
  the planner keep the whole system **cohesive** — or flag exactly what breaks and
  what setting fixes it.

### Motivating example (anchor for the whole doc)

> "I changed my mind — for both the **E** tiles I want an **outer ring gear**, and
> the planner should keep the system cohesive."

The two E tiles in question are non-symmetric letters, so today they can only be
`upright`/`spin`/`index` (see `behaviorOptions`). "Drive them from an outer ring"
means: give each E tile an external gear and a concentric driving ring (an
*internal pair*, which the repo already builds), pick the ring/tile tooth counts
and module, and **re-establish the global lock** so the E tiles still read upright
on the same 90° beat as their neighbours, the ring teeth never slip over a full
board revolution, and the ring's envelope does not foul the adjacent A/N/P tiles.
Today there is **no mechanism** to express any of that per cell; this spec adds it.

## The central thesis

Today the whole wall stays cohesive through **one shared number**:

```
amp = π / (4 · ratio)          // the cross half-swing, derived from the single global ratio
```

Every flip tile **and** the central reciprocating cross run off that *single*
amplitude. That is *why* the gears never slip and the square reads as one coherent
turning piece. **That one global parameter IS the cohesion guarantee today.**

**Tier 2 = generalizing that one global amplitude into a small CONSTRAINT
NETWORK.** Each cell declares its mechanism; the planner solves for parameters
that keep every cell simultaneously:

1. **PHASE-LOCKED** — each cell hits its readable/upright pose on the *same beat*
   (every 90° board detent) as its neighbours (legibility).
2. **MESH / RATIO-CLOSED** — tooth counts and drivers form a clean *rational*
   relationship so nothing slips over a full cycle.
3. **COLLISION-FREE** — the cell's mechanism envelope does not foul neighbouring
   tiles.

Where no solution exists, the planner **flags the cell** (feasibility feedback)
and, ideally, **suggests the nearest feasible setting** (active solving — not just
a red light). The genuinely hard part is the jump from *one global amp drives
everything* to *per-cell mechanism + a solver that re-establishes the global
lock*. The kinematics, the ring gear, and the lock all already exist.

## Current architecture (grounded)

Two-layer split, consistent across the repo: **pure motion math** in
`src/kinematics.js` (no Three.js, unit-tested) feeds **render classes** in
`src/mechanisms/*` that obey one contract (`group` / `update(theta)` / `info()` /
`dispose()`). Tooth geometry lives in `src/gears/involute.js` (metrics + contours)
and `src/gears/gear.js` (extrude + pivot). Config is a single global object in
`src/main.js`; `src/ui.js` binds lil-gui controls to it.

### The SATOR mechanism

`src/mechanisms/satorSquare.js` owns the 5×5 word grid and the cell model:

- **Grid.** `SATOR_WORD = ['SATOR','AREPO','TENET','OPERA','ROTAS']`;
  `letterAt(row,col)`; `cellKey(row,col)` returns the string `"r,c"`. World
  placement `x = (col−2)·cell`, `y = (2−row)·cell`; the centre **N** is at `(2,2)`
  on the axis. `SYMMETRIC = {O,S,N}` are the only 180°-symmetric letters (the only
  ones that may `flip`).
- **Cell data model — TWO representations.**
  - **Input** `config.sator.cells`: a *flat* map `{ "r,c": behavior }` where
    `behavior ∈ {fixed, upright, flip, spin, index}`. **That bare string is the
    entire per-cell input today** — a cell carries no drive, no params, no phase.
  - **Built** `this.tiles[]` (25): `{ row, col, letter, behavior, params,
    gearPivot, letterPivot }`. `params` is **derived at build from board-GLOBAL
    knobs** (`satorSquare.js` tile loop): `spin → {n:spinN}`;
    `index → {n:spinN, clicks:indexClicks, pushFrac}`; everything else →
    `{freq:2, pushFrac, amp:this.flipAmp}` — but on a `flip` tile both `freq:2`
    and `pushFrac` are **inert** (`satorFlipRock` reads only `params.amp`), so a
    per-cell flip override only ever matters for `amp`. `gearPivot` (a coloured
    disc, in `printable`) and `letterPivot` (a block glyph, in `decor`).
- **Legality.** `behaviorOptions(row,col)`: centre `(2,2) → ['fixed']`; symmetric
  letters → `['upright','flip','spin','index']`; everything else →
  `['upright','spin','index']`. At build the requested behavior is honoured only
  if legal, else `opts[0]` — a **double guard** (the UI offers only legal options;
  `SatorSquare` re-validates).
- **What each behavior does** (`satorTileAngle(behavior, phi, params)` in
  `kinematics.js`, applied in `SatorSquare.update`): `fixed`/`upright` →
  `alwaysUprightAngle(phi) = −phi`; `spin → spinAngle(phi,n) = (n−1)φ`;
  `index → indexAbsolute(...)−φ`; `flip → satorFlipRock(phi, params.amp)`. The
  board (printable + decor) rotates by `phi`; each tile then adds `psi` on top, so
  absolute orientation = `phi + psi`.

### The geared O-flip drive (the only mechanism a cell can drive today)

`buildGearedDrive(p1, p2, oPivots, cell, thickness, gi, drive)`
(`src/mechanisms/satorSquare.js`) builds **one shared double-Geneva drive per
corner O-PAIR**, not per cell. `CLUSTERS = [[[0,3],[1,4]],[[3,0],[4,1]]]` hardcodes
the two diagonal point-symmetric O-pairs; a drive is built for a pair **only if
both tiles are `flip`** (a lone flip silently gets no drive). It consumes the
single board-global `this.drive = {ratio:2, driverTeeth:10, pressureAngle:20}`.

Inside, derived from one `ratio`: `amp = π/(4·ratio)`; `Zo = 12` (O tile gear);
`Zs = round(ratio·Zo)` (output gear, integer); module `m = 2d/(Zs+Zo)` (auto-fit
to the half-pair spacing `d`); cross rim `Rm = Rs·0.72`; driver depth via
`c = Rm/cos(amp)`, with `Zd` clamped to `[6, floor(2·0.98·c/m)]` so
`H = √(c²−rd²)` stays real. The proven engagement geometry is
`satorDriveGeometry(Rm, rd, amp)` → `{c, a, H, rd, amp, sigmaA, sigmaB,
slotBottom, mouth, pocketA, pocketB, D1, D2}`; the two meshed driver gears turn
`±2φ` (`satorDriverAngle`), pins ride the slot centreline (`satorDrivePins`), cams
lock the dwells (`satorCamGeometry`). Driver-2's *gear child only* carries a
static tooth-mesh interlock `driverMeshPhase = mod(π − pitchD/2, pitchD)`. Note
`satorDriveGeometry(Rm, rd, amp)` takes **no pressure angle** — `pressureAngle`
reaches only the cosmetic `makeGear` call, never the engagement math. Full
derivation: [sator-square.md](sator-square.md#o-flip-drive--double-geneva-reciprocating-mechanism).

### The mechanism library (what a per-cell drive can draw from)

The seven `src/mechanisms/*` classes share the `group/update/info/dispose`
contract; their motion is `src/kinematics.js`, their teeth `src/gears/*`. For
Tier 2 the load-bearing existing pieces are:

- **Ring / internal gear — ALREADY EXISTS.** `makeRingGear(params, color, opts)`
  (`src/gears/gear.js`) builds a disc of radius `rOuter` with `internalGearContour`
  cut as a reversed hole; `internalGearMetrics` swaps addendum/dedendum
  (`ra = r−m` tip inward, `rf = r+1.25m` root outward, `rOuter = rf+rim·m`).
  `InternalGear` (`src/mechanisms/internalGear.js`) is the reference *external
  pinion inside a ring* pair: centre distance `d = ringM.r − pinM.r`,
  `internalGearRatio(zPinion,zRing) = zPinion/zRing` (**same direction**, no sign
  flip), validity floor `zr = max(ringTeeth, zp+4)`, rest phase `ringPhase = π/zr`.
  `Planetary` (`src/mechanisms/planetary.js`) is the two-constraint reference (an
  *external* sun↔planet SUM-phase mesh **and** an *internal* planet↔ring
  DIFFERENCE-phase mesh).
- **Mesh invariants enforced everywhere a pair is built:** equal `module`, equal
  `pressureAngle`, and the centre-distance/tooth-count relation — external
  `c = (z_a+z_b)·m/2`, internal `c = (z_ring−z_pinion)·m/2`. Static tooth phase:
  external mesh ⇒ `toothPhaseAt` sum `= 0.5`; internal mesh ⇒ difference `= 0.5`.

### Config flow & the update()/phase model

`config` is one global object (`src/main.js`); the active mode's block is read at
build. `config.sator = { cell, thickness, spinN, indexClicks, pushFrac, drives,
preset, cells, drive:{ratio,driverTeeth,pressureAngle} }` — note `spinN`,
`indexClicks`, `pushFrac` and `drive` are **board-global**, not per-cell. lil-gui
(`src/ui.js`) binds the Drive folder to the single `config.sator.drive` and the
per-cell editor to `config.sator.cells["r,c"]` (one dropdown per cell, options
from `behaviorOptions`). Almost every `onChange` calls `actions.rebuild()` →
`new SatorSquare(config.sator)`: **no live retune path — every structural change is
a full dispose+rebuild.** Runtime is a single accumulating scalar `driverAngle`
(`main.js` tick) passed to `update(phi)`; the board carrier rotates by `phi`, each
tile adds `psi = satorTileAngle(...)`, and each drive reads `satorDrivePins(phi,
geom)`. `update()` already iterates `this.drives[]` and reads each `d.geom`, so it
*already* supports **heterogeneous drives** once each is built with its own geom.

### STL split

`SatorSquare` builds `this.printable` (board + tile discs/gears + drive groups)
and `this.decor` (25 block letters, tagged `userData.isLetter`).
`actions.exportSTL` serialises `mechanism.printable ?? mechanism.group`, so letters
are excluded; the split is purely *which sub-group a part is added to*. Adding
per-cell **drive hardware** (gears/rings) injects geometry into `printable`, so it
flows into the STL with **no change to the export selection rule**.

## The cohesion model TODAY — the single shared amp lock

There is **no runtime feedback loop**. Cohesion is enforced **algebraically**: every
per-cell pose is a closed-form pure function of the one master phase `phi`, shaped
so its absolute orientation lands on a legible value at every `phi = k·90°` detent.
Three legibility regimes coexist:

- `upright`/`fixed`: cancel the board exactly (`psi = −phi`, absolute `≡ 0`).
- `spin`/`index`: legible **only** when the winding `n ≡ 0 (mod 4)`
  (`spinAngle → N·φ`; `indexUpright(n) = (n%4===0)`). This is the one place
  legibility can *fail*, and the mechanism **reports** it (`this.legible`,
  surfaced in `info()`) rather than preventing it.
- `flip`: locked by the invariant **`2·R·amp = π/2`** with `R = π/(4·amp)`
  (`satorFlipRock = π/4 − R·satorFlipStar`). The cross rocks `±amp`; the **R:1
  step-up** makes the tile rock **exactly 0..90° for ANY amp**, dwelling at 0 at
  even detents and 90° at odd. Combined with the board's own 90°/detent the O reads
  as a 180° flip-and-hold.

**Why the flip lock holds the whole square together.** The *same* `amp` is
computed from the *same* `ratio` and threaded to **both** consumers: the rendered
cross (via `satorDriveGeometry(Rm, rd, amp)` → `geom.amp`) **and** every flip
tile's `params.amp = this.flipAmp`. Because the O tile gear `Zo=12` meshes the
output gear `Zs=round(ratio·Zo)` on the same shaft, the mesh constraint *is* the
kinematic relation `tile_psi = π/4 − ratio·cross`. As long as both sides share the
one amp, the teeth never slip.

> **Gotcha for the generalizer — the `amp` / `π/8` constant lives in THREE places,
> not two.** It is derived *independently* at: (1) the `SatorSquare` ctor
> (`this.flipAmp`) and (2) `buildGearedDrive`'s local `amp` — both from the same
> `ratio` knob — **and** (3) `satorFlipRock`/`satorTileAngle`, which **default
> `amp = π/8`** when `params.amp` is absent (`kinematics.js`). Coherence today
> relies on all three agreeing. A builder generalizing the lock must update or
> neutralize **all three** sites, not just the two in `satorSquare.js` — a missed
> default is a silent legibility break.

### The limit of today's lock

The single-amp lock is what makes Tier 2 *hard* — it bakes in three assumptions:

1. **Every flip tile uses the same flip mechanism** (the geared double-Geneva).
   There is exactly **one** mechanism style a cell can be driven by; `behavior` is
   a closed enum of 5 names, and only `flip` involves a real drive.
2. **One amp for the whole board.** A *single* `ratio` → a *single* `flipAmp`. A
   per-cell ratio/amp would (a) **slip the gears** (`tile ≠ π/4 − ratio·cross`),
   (b) **break legibility silently** (`this.legible` tracks only spin/index
   winders, *not* a mismatched flip), (c) **dwell off-detent** if the drive speed
   differs from `2φ`, (d) force a fractional `Zs = round(ratio·Zo)`.
3. **The drive is pair-level and topology-fixed** (`CLUSTERS`, the both-O's-flip
   rule, one `this.drive`). There is no seam for a cell to carry its own drive.

So the lock is real and proven — but it is a *constant*, not a *solver*. Tier 2
replaces the constant with a network whose solution *reduces to* today's constant
when every cell is the default flip.

## The generalization — per-cell mechanism + constraint network

### Proposed per-cell drive descriptor (data model)

Promote the cell value from a bare string to an object (the seam the maps
identify: `cells["r,c"]`, all five `PRESETS`, `defaultCells`, and the legality
check must change in lockstep). **Backward-compatible:** a bare string is read as
`{ behavior: <string> }`.

```jsonc
// config.sator.cells["r,c"]  — string OR object (string ≡ { behavior })
{
  "behavior": "flip",           // the existing closed enum (closed set, see Phase 1)
  "mechanism": "geneva-flip",   // OPTIONAL: which DRIVE realizes the behavior.
                                //   default per behavior: flip→'geneva-flip',
                                //   spin→'planetary', upright→'idler-ring',
                                //   index→'single-geneva', fixed→'none'
  "drive": {                    // OPTIONAL per-cell drive params; absent ⇒ inherit
    "ratio": 2,                 //   the board-global config.sator.drive
    "driverTeeth": 10,
    "pressureAngle": 20,
    "ringTeeth": 60             //   NEW: only meaningful for ring/internal mechanisms
  },
  "n": 4, "clicks": 4           // OPTIONAL per-cell spin/index winding overrides
}
```

The build-time `params` derivation (the tile loop, currently reading **only**
board-global `spinN`/`indexClicks`/`pushFrac`/`flipAmp`) becomes the **merge
point**: `params = { ...fromGlobals, ...cellOverrides }`. The kinematics layer
needs **no change** for per-cell *params* — `satorTileAngle`/`satorFlipRock`/
`spinAngle`/`indexAbsolute` already take `amp`/`n`/`clicks`. The blocker is the
**data source**, which is global.

### Minimal mechanism INTERFACE (what `update()` and the solver call)

Formalize the *de-facto* contract already present (`satorTileAngle` + the per-drive
`satorDrivePins` render path) into a small registry keyed by `mechanism`:

```
mechanism = {
  // 1. POSE — the relative tile angle; pure function of the master phase.
  pose(t, params) -> psi            // (radians) === today's satorTileAngle return

  // 2. LEGIBILITY — does absolute = phi + psi read the letter (≡ 0, or ≡ 0/π for a
  //    symmetric glyph) at every phi = k·90° detent? Lets each mechanism self-report
  //    so the planner can give PER-CELL feasibility. Today folded into this.legible
  //    + indexUpright; here it is a per-mechanism hook.
  legibleAtDetents(params, symmetric) -> bool

  // 3. DRIVE STATE (optional) — for mechanisms that render extra meshed bodies
  //    (gears/pins/cams/rings). Mirrors satorDrivePins so update() can place them
  //    and tests can verify true engagement. No extra bodies ⇒ omit.
  driveState(t, geom) -> { transforms, engaged, activePin }

  // 4. CONSTRAINTS — what the solver needs (NEW; this is the Tier-2 surface):
  symmetryRequirement -> Set<char>  // e.g. flip needs {O,S,N}; ring/idler: any
  meshClosure(params) -> { ok, fix } // integer tooth-count / ratio closure check
  envelope(params, cell) -> radius   // bounding envelope for collision checks
  ampOf(params) -> amp | null        // the legibility amp it imposes (null = none)
}
```

`pose` and `driveState` already exist (as `satorTileAngle` and `satorDrivePins`);
`legibleAtDetents`, `meshClosure`, `envelope`, and `ampOf` are the new declarations
each mechanism must supply for the solver.

### The constraint network (the three conditions)

The solver's job is to choose each cell's free parameters so all three hold:

1. **PHASE-LOCK (legibility).** Every cell's absolute orientation must land on a
   legible value at all four detents. The *master phase is shared by construction*
   (one `driverAngle`), so phase-lock reduces to per-mechanism algebra:
   - flip: `2·R·amp = π/2` (any amp legible *by itself*, but see mesh closure);
   - spin/index: winding `n ≡ 0 (mod 4)`;
   - ring/idler upright: the ratio must yield `psi = −phi` at detents (a 1:1
     anti-rotation referenced to the hub, i.e. effective `N = 0`), which an
     internal pair plus an idler can realize — the sign of `internalGearRatio` (no
     flip) is exactly why an idler is needed (see [sator-square.md](sator-square.md)).
2. **MESH / RATIO CLOSURE.** Tooth counts must be integers and form a clean
   rational relation so nothing slips over a full board revolution: external
   `c = (z_a+z_b)·m/2`, internal `c = (z_ring−z_pinion)·m/2`; equal `module`,
   equal `pressureAngle`; integer `Zs = round(ratio·Zo)`; internal validity floor
   `z_ring − z_tile ≥ 4` (`InternalGear`); static tooth phase (external SUM `=0.5`,
   internal DIFFERENCE `=0.5`). For a **ring-driven** cell the kinematic ratio is
   `ω_tile/ω_ring = z_ring/z_tile` (invert `internalGearRatio` when the ring is the
   driver), and the upright requirement pins that ratio.
3. **COLLISION-FREE.** Each mechanism's `envelope(params, cell)` (e.g. a ring's
   `rOuter = rf + rim·m`) must fit inside its cell's footprint plus the inter-cell
   gap, given world placement `x=(col−2)·cell, y=(2−row)·cell`. Note: `tileR =
   cell·0.44` (`satorSquare.js:315`, the radius passed to `disc()` at `:337`) is
   the rendered tile **disc** radius — there is **no** collision/footprint radius
   in the code today, so the collision model here is **entirely proposed** (a
   reasonable first-cut reuse of `tileR` as a footprint). A ring on an E tile must
   not overlap the adjacent A/N/P discs.

When every cell is the default flip with the default `ratio`, the network's only
free variable is the one global amp, and the solution **is** today's constant —
**the byte-for-byte degenerate case** (mandatory guard below).

## Gap analysis — exists vs. must be built

| Capability | Today | Tier 2 needs | Where |
|---|---|---|---|
| Ring / internal gear mechanism | **EXISTS** (`makeRingGear`, `InternalGear`, `internalGearMetrics`, `internalGearRatio`) | reuse; add a *ring-as-driver-of-an-external-cell-gear* builder (only `pinion-inside-ring` + planetary-internal exist) | `src/gears/gear.js`, `src/mechanisms/internalGear.js` |
| Shared-amp cohesion lock | **EXISTS** (`amp = π/(4·ratio)`, threaded to cross + tiles) | *generalize* the constant into a solved network value | `satorSquare.js` ctor + `buildGearedDrive`; `satorFlipRock` |
| Per-tile *params* plumbing | kinematics already takes `amp`/`n`/`clicks` | merge per-cell overrides at the tile-loop `params` derivation | `satorSquare.js` tile loop |
| Cell value | **bare behavior string** | object `{behavior, mechanism?, drive?, n?, clicks?}` (+ string back-compat) | `cells`, `defaultCells`, all `PRESETS`, legality check |
| Per-cell mechanism choice | closed 5-enum, only `flip` drives | a **mechanism registry** + per-cell selection; extend `behaviorOptions`/`TILE_COLOR`/`satorTileAngle` together | `satorSquare.js`, `kinematics.js` |
| Drive ownership | pair-level, one global `this.drive`, fixed `CLUSTERS` | per-cell (or per-cluster) drive descriptor threaded through the build seam | `satorSquare.js` CLUSTERS loop |
| `update()` heterogeneity | **already per-drive** (iterates `this.drives`, reads each `geom`) | **no change** — works once each drive has its own geom | `satorSquare.js update()` |
| Constraint solver | **none** (cohesion is a hardcoded constant) | **BUILD** a pure `solveCohesion(cells, board)` returning per-cell resolved params or a flag | new pure module (kinematics-adjacent) |
| Feasibility feedback | aggregate only (`info()` → `#readout`, already conditional); clamps exist but are silent | **BUILD** a pure `cellFeasibility(...)` predicate + per-cell UI marker | `satorSquare.js`/solver + `ui.js` |
| Live retune | none (rebuild on every change) | keep rebuild-on-change (no live path required) | unchanged |

## Feasibility feedback & active solving

The constraints already exist as code, just **not surfaced per cell**: legality
(`behaviorOptions`), drive realizability (the `ZdMax`/`Zd` clamp and the
`H=√(c²−rd²)` condition in `buildGearedDrive`), the *both-O's-flip-or-no-drive*
rule (`CLUSTERS`), and winding legibility (`this.legible`). The plan factors these
into **one pure predicate** so the builder and the UI share a single source of
truth:

```
cellFeasibility(cell, neighbours, board) -> {
  ok: bool,
  reasons: string[],        // e.g. "ring fouls (1,1) A tile", "Zs not integer",
                            //      "winding 3 not multiple of 4 → illegible"
  nearest: cellPatch | null // ACTIVE SOLVING: the closest feasible setting,
                            //   e.g. { drive: { ratio: 2 } } or { n: 4 } or
                            //   { drive: { ringTeeth: 64 } }
}
```

- **Flagging.** `solveCohesion` runs on every rebuild (the single existing build
  path). For each infeasible cell it produces `reasons` (which condition failed)
  and, where a one-parameter search lands, a `nearest` patch.
- **Active solving (nearest feasible).** For mesh/ratio closure, search the small
  discrete space the UI already exposes (e.g. `ratio ∈ {1.5,2,3,4}`, integer tooth
  counts, winding multiples of 4) for the closest value that closes the mesh and
  preserves legibility. For collision, shrink `module`/`ringTeeth` to the largest
  envelope that clears neighbours. Report `nearest`; the user accepts with one
  click (apply the patch + rebuild).
- **UI surface.** Reuse the 25 controls already collected in `ui.js` (`cellCtrls`).
  After each rebuild, a `refreshFeasibility()` reads the freshly-built mechanism
  (`this.drives`, `this.counts`, `this.legible`, plus the new per-cell results) and
  marks each control — prefix the row label with a green/red glyph and/or toggle a
  CSS class on `ctrl.domElement` (style in `style.css`). The aggregate text stays
  in `#readout` via `info()` — which today already emits the O-drive line **only**
  when `this.drives.length > 0` and the spin/index winding line **only** when
  `counts.spin + counts.index > 0`, so per-cell marking *extends* an existing
  conditional readout rather than adding a parallel surface. A new
  `actions.onRebuilt(mechanism)` hook (passed into `buildGUI`) lets the panel read
  results without `ui.js` importing solver internals.
- **STL split impact.** Marking is cosmetic; the split rule
  (`printable ?? group`) is unchanged. But selecting a *drive-bearing* mechanism
  for a cell **injects geometry into `printable`** (the ring/gears), so it flows
  into the exported STL automatically — and the feasibility predicate is what gates
  whether that hardware is even buildable for the cell before it is added.

## Phased implementation plan

> **Ordering note (2026-06-09).** The **print pack** track (see
> [roadmap.md](roadmap.md)) runs ahead of Phases 3–4: a feasibility solver is
> screen-side polish until the parts it validates can actually be printed
> (per-part export, backlash, assembly hardware). Phases 0–2 stay cheap plumbing
> and may interleave with the print pack.

Each phase is independently testable and **leaves the default board byte-identical**
until the very feature being added is exercised. Style follows the repo:
adversarial breakers + a completeness critic on the load-bearing phases, tests read
**rendered transforms** (not stored constants), 100% tests stay green, lint clean.

- **Phase 0 — descriptor data model (no behavior change).** Accept
  `cells["r,c"]` as **string OR `{behavior, ...}`**; normalize at read
  (`string ⇒ {behavior}`). Update `defaultCells`, all `PRESETS`, and the legality
  check to the object form while emitting the *same* normalized result. *Test:* the
  default + every preset build **byte-identical** to today (same `tiles`,
  `drives`, `counts`, rendered transforms); a mixed string/object map builds the
  same as its all-object equivalent.

- **Phase 1 — per-cell *params* override behind the existing lock.** Read optional
  per-cell `n`/`clicks`/`drive.ratio` at the tile-loop `params` merge and (for
  flip) compute the cell's amp from its own ratio — **but still require the
  per-cell amp to equal the cluster amp** (reject/clamp otherwise). This proves the
  plumbing without yet allowing a mismatch. *Test:* a cell with an explicit
  matching ratio is identical to the global; a deliberately mismatched flip ratio
  is rejected (or clamped) with a recorded reason; spin/index honour a per-cell
  winding and report legibility per cell.

- **Phase 2 — single-cell mechanism swap (the ring-driven E tile).** Add a
  **mechanism registry** with the existing flip plus a new **ring-drive** entry
  (reusing `makeRingGear` + an external tile gear; ratio from inverted
  `internalGearRatio`, internal DIFFERENCE tooth phase, validity floor `≥4`).
  Extend `behaviorOptions`/`TILE_COLOR`/`satorTileAngle` *together* (the four
  coupled spots). Build it for the two E tiles from a per-cell `mechanism:'ring'`.
  *Test:* the E tile reads upright at every detent; ring↔tile teeth interlock
  (rendered transforms, DIFFERENCE `=0.5`); ring envelope reported; default board
  unchanged (no E uses a ring by default).

- **Phase 3 — generalized cohesion solver.** Pure
  `solveCohesion(cells, board) -> { perCell: resolvedParams, infeasible: [...] }`.
  When all cells are default flip, its output **equals today's constant** (assert
  byte-identical). For a mixed board it solves each mechanism's free params for the
  three conditions, or marks the cell infeasible with `reasons`/`nearest`. *Test:*
  degenerate case byte-identical; the ring-E board solves to a legible, mesh-closed,
  collision-free configuration; an over-large ring is flagged with a `nearest`
  patch; the solver is a pure function (no Three.js), unit-tested like `kinematics`.

- **Phase 4 — feasibility UI + active-solve apply.** Surface per-cell red/green via
  `cellCtrls` + `actions.onRebuilt`; show `reasons` on hover and an "apply nearest"
  affordance that patches `cells` and rebuilds. *Test:* a known-infeasible cell
  shows red with the right reason; applying `nearest` yields a feasible green
  rebuild; the STL split is unaffected by marking.

## Risks / MANDATORY guards

1. **Byte-identical default (the load-bearing guard).** With **all cells on the
   shared flip drive at default knobs**, every output — `tiles`, `params`,
   `drives`, `counts`, all rendered `rotation.z`, and the exported STL — must be
   **byte-for-byte identical** to current HEAD. The solver's degenerate solution
   **is** `amp = π/(4·ratio)`. This is the same discipline as the fillet
   `filletEmpty` byte-identity and the drive-knob defaults (`ratio 2`,
   `driverTeeth 10`, `PA 20`) reproducing the original drive.
2. **Legibility must not regress — and must not fail silently.** Today a mismatched
   flip amp would break legibility *silently* (`this.legible` only tracks
   spin/index winders). Any per-cell amp/ratio path **must** route through
   `legibleAtDetents` so a mismatch is *flagged*, never silently illegible.
3. **Mesh closure is integer-exact.** `Zs = round(ratio·Zo)` and every per-cell
   tooth count must be a true integer with a closed ratio; reject/flag fractional
   effective ratios. Preserve the driver-vs-driver `driverMeshPhase` and the
   internal DIFFERENCE / external SUM tooth-phase rules — apply phase to the **gear
   child only**, never to a body carrying a pin/cam.
4. **Geometry validity guards survive generalization.** Keep `H=√(c²−rd²)` real
   (`ZdMax`/`Zd` clamp), `rim ≥ 1e-6`, the internal validity floor `z_ring−z_tile
   ≥ 4`, and `makeRingGear`'s reversed-hole winding. A per-cell module must not
   desync a shared mesh — each mesh pair must agree on `module` + `pressureAngle`.
5. **Pure solver, no Three.js.** `solveCohesion`/`cellFeasibility` live in the pure
   layer (testable like `kinematics.js`); the render reads their output. Tests read
   **rendered transforms**, not stored constants (the repo pattern that caught the
   driver-mesh-phase bug).
6. **100% tests green + lint clean** at every phase; each phase independently
   testable; do not couple phases.

## Open questions & assumptions

- **ASSUMPTION (E-tile ring kinematics).** "Outer ring gear for the E tiles" is
  read as an *internal pair with the ring as driver and the tile gear inside it*,
  realizing an **upright** behavior (the E reads upright at each detent), since E
  is non-symmetric and cannot flip. If the user means a *spin* off the ring, the
  ratio must still satisfy `N ≡ 0 (mod 4)`. **Confirm with the user** which motion
  the ring should produce.
- **ASSUMPTION (descriptor shape).** A cell value becomes `{behavior, mechanism?,
  drive?, n?, clicks?}` with bare-string back-compat. The maps confirm the cell is
  a bare string today; the object shape above is *proposed*, not present.
- **OPEN (per-cell vs. per-cluster drive).** The O-flip drive is *pair*-level
  (`CLUSTERS`, both-O's-flip). For O tiles, is the per-cell descriptor reconciled
  to a per-*cluster* drive (two diagonal O's share one shaft), or do we break that
  shared-shaft assumption? The shared shaft is a real mechanical constraint; the
  default plan keeps it (descriptor at the cluster, validated for agreement).
- **OPEN (active-solve search space).** Nearest-feasible search is proposed over
  the small discrete UI space (ratios, integer teeth, winding ×4). A continuous
  optimizer is *not* proposed; confirm the discrete search is sufficient.
- **OPEN (collision model fidelity).** First cut uses circular `envelope` radii vs.
  the tile footprint + inter-cell gap. True swept-volume collision (rocking arcs,
  gear ODs at depth `zBack`) is heavier; confirm the circular approximation is
  acceptable for v1 feasibility.
- **ASSUMPTION (no live retune).** Every change stays a full rebuild (as today); no
  live-tunable drive path is added.

## Out of scope

- **Source changes this run.** This document is the deliverable; no code is
  written.
- **New render hardware for non-driven behaviors.** Giving `upright`/`spin` cells
  their own printable gear *trains* (beyond the existing disc) is a separate
  effort; Tier 2 focuses on the *drive descriptor + solver*, reusing existing
  builders for the mechanisms it adds.
- **Cutter / print-tolerance layer**, **multi-board or non-5×5 layouts**, and
  **persistence (save/load / URL config)** — the last intentionally not pursued
  (roadmap *Out of scope*).
- **Internal-gear root fillet** (the epicyclic shaper-cutter trochoid) — already
  out of scope per [fillet-design.md](fillet-design.md); a ring-drive cell uses the
  existing simplified internal contour.

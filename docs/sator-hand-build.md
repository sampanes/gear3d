# SATOR hand build -- design facts

Single source of truth for the hand-built (Blender) SATOR mechanism. When a number
changes, change it here first, then in the model. Name Blender objects to match
(e.g. `Gear_Middle_64T`). Working `.blend` files live in `cad/` and are git-ignored;
publish exported STLs/renders instead.

## Gear train

| Part | Teeth | Qty | Mounting | Why |
| --- | --- | --- | --- | --- |
| Middle gear | 64 | 1 | fixed to frame (does not turn with board); no bearing; triple stack: 8 mm teeth + 8 mm toothless spacer + 8 mm teeth (24 mm) | bottom teeth mesh the 96T gears, top teeth mesh the 16T idlers; spacer (cut to root radius - 0.3) leaves room for idler-support hardware |
| Letter gears | 64 | 24 | free on board | equal to middle, so middle -> idler -> letter is 1:1 (upright) |
| Idlers | 16 | as needed | free on board | count is free: only sets spacing and direction, not ratio |
| Big gears | 96 | 4 | free on board, N/S/E/W of middle, rear layer | planet on fixed 64T: turns -2/3 of board angle relative to board |
| Dual-Geneva driver | 16 | 4? | on each 96T, at -45 deg | 96/16 = 6x step-up -> 4 rev per board rev = 1 rev per 90 deg detent (one O flip cycle) |

Ratio check: (64/96) * (96/16) = 4 relative turns per board turn.

## Shared parameters

| Parameter | Value | Notes |
| --- | --- | --- |
| Module | 2.25 | must be identical on every meshing gear (Blender UI truncates it to 2.2 when unfocused) |
| Profile shift | 0 | PrecisionGears defaults to 0.5; set 0 on every gear so the center distances below hold |
| Pressure angle | 25 deg | thicker roots on 16T (20 deg undercuts below 17T); ~28% more radial load than 20 |
| Helix angle | 0 (spur) | drop-in assembly, no axial thrust, no handedness to manage |
| Rim under teeth | >= 8 mm | stiff enough that a large thin wheel does not flex out of mesh; 96T uses bore radius 97 (root radius 105.2) |
| Crossings | `cad/crossings.py` | vary the style between neighbouring gears; layered (raised steps on a thin base web, see below). 96T: `scurve` x6, 2 steps; near (front) 64T letters: `scurve` x4, 1 step; far 64T letters: `ringed` x5, 2 steps; all with 22.3 bearing hole; middle 64T: `gothic` x8, rounded-triangle spandrels, 2 steps on an 8 mm base web, solid hub drum full height (no hole). All: 1.2 mm rounded edges, overlap rim 1 mm (export gear + crossings as one STL) |
| Backlash / fit | TBD | gear3d `sator.fit` default is 0.25 mm; settle with a printed fit coupon |

## Blender scene (`cad/sator_hand_build.blend`)

- Gears are built with `cad/sator_gears.py`, which copies the shared settings from a finished
  template gear (`new_spur`), cuts layer grooves (`add_groove`) and places meshing gears with
  teeth interlocked (`mesh_with`). Crossings come from `cad/crossings.py`.
- Origin = middle gear axis. Bottom tooth layer z -12..-4 (center -8), spacer -4..4, top tooth layer 4..12 (center +8).
- `Gear_96T` (N) sits at (0, 180, -8) and `Gear_96T_W` at (-180, 0, -8), each rotated
  -1.875 deg to mesh.
- 16T idlers (top layer) line up with the 96T contact directions (N/S/E/W).
  `Gear_Idler_16T_N/S/E/W` sit at (0, 90), (0, -90), (90, 0), (-90, 0), z 8, each rotated
  -11.25 deg to mesh; 16.2 bearing hole (bore radius 8.1), solid web (7.1 mm rim to the
  root leaves no room for crossings).
- `Gear_Letter_64T_N` / `_W` mesh off the N / W idlers (top layer) at (0, 180, 8) and
  (-180, 0, 8): each concentric with the 96T below it (90 + 90 = 180). 22.3 bearing hole,
  lighter `scurve` x4 crossings so the 96T below shows through.
- `Gear_Letter_64T_N2` / `_W2` mesh the far side of each 96T (bottom layer) at (0, 360, -8)
  and (-360, 0, -8), `ringed` x5 crossings (2 steps). Fixed middle -> 96T -> 64T is 64:64 through two
  meshes, so these letters stay upright like the idler-driven ones.
- Viewport: scene units are mm, so views clip at `clip_end`; set to 20000 (20 m) with
  `clip_start` 0.5 in every workspace. The Shading workspace uses Material Preview (slow);
  work in Layout (Solid).
- Crossings depth rule (soft): a gear that sits on top of another gets LESS material --
  fewer/thinner spokes, 1 step -- so the gear below shows through its windows. Back-layer
  gears can carry more (2 steps, `holes`, `ringed`) but still keep the windows big.
  Current settings (all `BEARING_HOLE_D=22.3`):
  - front letters N/W: `scurve` x4, `SPOKE_W=6`, `LAYERS=1, BASE_T=3.5, STEP_T=2, STEP_INSET=1.25`
    (~80% of the bore open, was 68% with scurve x6)
  - 96T N/W: `scurve` x6, `SPOKE_W=8.5`, `LAYERS=2, BASE_T=3, STEP_T=1.75, STEP_INSET=1.25` (~77%)
  - far letters N2/W2: `ringed` x5, `SPOKE_W=7`, 2 steps with `STEP_INSET=1.0` (~57%; 1.25 leaves
    the thin outer spokes with no flat top)
  - middle: `gothic` x8, `SPOKE_W=8`, `BEARING_HOLE_D=0`, `LAYERS=2, BASE_T=8, STEP_T=3, STEP_INSET=1.25`
  - Each step narrows a wall by 2 x (STEP_INSET + rounding) in total; `crossings.py` refuses a
    build whose top walls would be under 0.8 mm.
  Layered crossings keep every step on the top face, so they print support-free.
- Reference rods (collection `Reference Rods`, red, unselectable, not exported): 8.1 mm rods
  at all 25 letter centers, named `Rod_R<row>C<col>_<letter>`. The letter grid pitch is
  180 mm: it is both the 64T-96T center distance (72 + 108) and middle -> 16T idler -> letter
  (90 + 90), so every gear center lands on it (cell (row, col) at x = (col - 3) * 180,
  y = (3 - row) * 180). Two 96T on the same layer cannot sit in orthogonally neighbouring
  cells (180 < 220.5 OD); diagonal neighbours (254.6 mm) clear.
- Modeled backlash is 0 (teeth touch exactly); printed parts need the fit value from the coupon.

## Printing: slice ONLY `cad/export/*.stl`

- **Slicer supports ON for the middle double-stack gear.** The top tooth layer overhangs the
  spacer groove flat (z 4, 5.35 mm out from the groove floor at r 68.9 to the tips at r 74.25)
  and droops without support. (Alternative if supports are a pain: slope the groove ceiling
  at 45 deg, at the cost of groove room at the root.)
- Make them with `sator_gears.export_stl(gear)` -> `cad/export/<gear name>.stl`. It unions the
  gear with its crossings into ONE closed solid (and reports shells = 1, non-manifold = 0).
- Never slice a hand export of gear + crossings: those are two shells. The slicer treats each
  shell as a part and gives both perimeters, so the 1 mm overlap prints as a seam of walls
  instead of bonded infill (weak ring where the spokes meet the rim).
- Identical gears share one STL: `Gear_96T.stl` (all 96T), `Gear_Letter_64T_N.stl` (front
  letters), `Gear_Letter_64T_N2.stl` (far letters), `Gear_Idler_16T_N.stl` (all idlers).
  Print as many as the scene has.
- Re-export after changing a gear or its crossings; the STLs do not update themselves.

## Repo hygiene for the binaries

- `cad/sator_hand_build.blend` and `cad/export/*.stl` are tracked; `.blend1` backups are not.
  Commit the .blend at milestones (each version adds ~5 MB to history).
- Blender stores the last Save As folder (an absolute path) inside the .blend. The pre-commit
  hook runs `cad/check_private.py --staged` and blocks a commit that carries one. Fix: point
  every File Browser area back to `//`, then save again.

## Bearings

Printed hole diameters that snugly fit the bearings on hand (tested on the P1S):

| Bearing OD | Printed hole dia | Suggested use | Notes |
| --- | --- | --- | --- |
| 16 mm | 16.2 mm | 16T idlers | 22.3 hole would leave only ~4.0 mm to a 16T root; 16.2 leaves ~7.1 mm |
| 22 mm | 22.3 mm | 64T letter gears, 96T gears | needs hub radius >= ~16 mm (5 mm wall) |

Bearing model numbers and widths: TBD (width matters vs 8 mm gear thickness).

## Derived dimensions (module 2.25, spur, shift 0, clearance 0.25)

| Part | Pitch dia | Outside dia | Root dia |
| --- | --- | --- | --- |
| 96T | 216.0 mm | 220.5 mm | 210.4 mm |
| 64T | 144.0 mm | 148.5 mm | 138.4 mm |
| 16T | 36.0 mm | 40.5 mm | 30.4 mm |

| Pair | Center distance |
| --- | --- |
| 64T - 96T | 180.0 mm |
| 64T - 16T | 90.0 mm |
| 96T - 16T | 126.0 mm |

- 96T OD 220.5 mm on a 256 mm P1S bed: ~18 mm margin per side.
- Coplanar 64T letter gears need >= ~153 mm grid pitch (148.5 OD + clearance), so
  the 5x5 board is roughly 770-820 mm square. Middle -> idler -> letter spans 153-180 mm
  depending on idler offset.
- 96T gears at 180 mm from center overlap the letter layer, so they live on a rear layer.

## Open questions

- How the fixed middle gear mounts to the frame (no bearing; solid hub drum, r 15, full 24 mm height).
- Idler axle support: lives in the spacer layer (z -4..4), outside the middle spacer
  (radius 68.9); the 96T below sweeps under the idler, so nothing can pass through z < -4 there.
- What does each 16T Geneva driver mesh with -- the 96T directly? What does "-45 deg"
  measure from?
- Which O does each of the four 96T gears drive (O's are at (1,4) (2,5) (4,1) (5,2),
  not directly N/S/E/W of center)?
- Letter-gear tree: which letters chain off which (keep paths short, no closed loops)?

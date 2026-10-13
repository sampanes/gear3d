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
| P letter gears (R2C4, R4C2) | 64 | 2 | free on board, bottom layer | far-letter clones; each also feeds an O toggle unit (below) |
| O toggle drivers A/B | 64 | 4 | free on board, below the board | twin drivers of the double-Geneva toggle, mesh each other; 2 turns per board turn |
| O toggle input / P shaft | 27 / 54 | 2 / 2 | 27T on driver A's shaft, 54T on P's shaft | P turns 1 per board turn, x2 |
| O output | 56 (shift +0.29) | 6 | star shaft + both O's of a unit | star -> O is 1:1, so each push turns the O a quarter |

Ratio check: P letter -1, x (54/27) = 2 driver turns per board turn, one toggle push and return
per half board turn (see "O toggle units" below).

## Shared parameters

| Parameter | Value | Notes |
| --- | --- | --- |
| Module | 2.25 | must be identical on every meshing gear (Blender UI truncates it to 2.2 when unfocused) |
| Profile shift | 0 | PrecisionGears defaults to 0.5; set 0 on every gear so the center distances below hold |
| Pressure angle | 25 deg | thicker roots on 16T (20 deg undercuts below 17T); ~28% more radial load than 20 |
| Helix angle | 0 (spur) | drop-in assembly, no axial thrust, no handedness to manage |
| Rim under teeth | >= 8 mm | stiff enough that a large thin wheel does not flex out of mesh; 96T uses bore radius 97 (root radius 105.2) |
| Crossings | `cad/crossings.py` | vary the style between neighbouring gears; layered (raised steps on a thin base web, see below). 96T: `straight` x8 with barbs, 2 steps; near (front) 64T letters: `scurve` x4, 1 step; far 64T letters: `ringed` x5, 2 steps; all with 21.9 bearing hole; middle 64T: `gothic` x8, rounded-triangle spandrels, 2 steps on an 8 mm base web, solid hub drum full height (no hole). All: 1.2 mm rounded edges, overlap rim 1 mm (export gear + crossings as one STL) |
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
  -11.25 deg to mesh; 15.9 bearing hole (bore radius 7.95), solid web (7.1 mm rim to the
  root leaves no room for crossings).
- Idler hub cut: `sator_gears.add_hub_cut(gear, style)` sinks a decorative pocket 3 mm into the
  top face around the bearing hole and leaves the bottom 5 mm as a plain bearing seat (the
  bearings grip only ~5 mm). The bearing's top face shows in the pocket floor. Styles,
  mocked up side by side before choosing:
  - `flower` (in use on all four idlers): 6 round lobes, r 9.25 to 12.6, ~2.6 mm wall to the roots
  - `crown`: 8-point star pocket
  - `sunburst`: round pocket plus 16 shallow rays (half depth) between the teeth
  - `terraces`: three stepped rings down to the bearing
  `style=None` removes it; switching style replaces the cutters.
- `Gear_Letter_64T_N` / `_W` mesh off the N / W idlers (top layer) at (0, 180, 8) and
  (-180, 0, 8): each concentric with the 96T below it (90 + 90 = 180). 21.9 bearing hole,
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
  Current settings (all `BEARING_HOLE_D=21.9`):
  - front letters N/W: `scurve` x4, `SPOKE_W=6`, `LAYERS=1, BASE_T=3.5, STEP_T=2, STEP_INSET=1.25`
    (~80% of the bore open, was 68% with scurve x6)
  - 96T N/W: `straight` x8, `SPOKE_W=8.5`, `LAYERS=2, BASE_T=3, STEP_T=1.75, STEP_INSET=1.25`,
    `BARBS=2, BARB_AT=(1/3, 0.8)` -- pointed barbs on each spoke side, the outer pair at r ~81 in
    the ring that shows around the letter gear on top (r 74 to 97), the inner pair through the
    letter's windows. Replaced `scurve` x6, which matched the letter on top. Runners-up from the
    comparison renders: `quatrefoil` x6 with `FOIL_EXTRA="trefoil"` (lacy, more PLA), `quatrefoil`
    x5 with `FOIL_EXTRA="circle"`, straight x6 with bigger barbs (`BARB_H=6, BARB_L=16`)
  - far letters N2/W2: `ringed` x5, `SPOKE_W=7`, 2 steps with `STEP_INSET=1.0` (~57%; 1.25 leaves
    the thin outer spokes with no flat top)
  - middle: `gothic` x8, `SPOKE_W=8`, `BEARING_HOLE_D=0`, `LAYERS=2, BASE_T=8, STEP_T=3, STEP_INSET=1.25`
  - Each step narrows a wall by 2 x (STEP_INSET + rounding) in total; `crossings.py` refuses a
    build whose top walls would be under 0.8 mm. Sharp points (barbs, foil cusps) fold over
    themselves when a step pulls the edge in; `_untangle` trims those folds. Crossings built
    before that fix (the letter gears) still carry tiny hidden folds until they are rebuilt.
  Layered crossings keep every step on the top face, so they print support-free.
- Rim decoration (all crossing gears): inner rim teeth (`RIM_TEETH` = the gear's tooth count,
  `RIM_TEETH_H=2.5`, lined up with the outer teeth, flush with the step top) where a window
  meets the rim, kept clear of the spokes; plus `sator_gears.add_rim_dots(gear)` -- a ring of
  2.4 mm x 1.2 mm deep dimples in the rim top face, one per tooth (live Boolean). The middle
  gear's gothic web is solid at the rim, so instead of inner teeth it carries rim notches: a
  hidden 64T cutter (`Gear_Middle_64T Rim Cutter`, module 1.75, scaled 1.085 in x/y, teeth
  lined up with the outer teeth) sinks a ring-gear pocket 4.6 mm into the top face (modifier
  `Rim Notches`). Its dots are re-centered between the notch tips (r 63.6) and the tooth roots
  (`add_rim_dots(gear, r=66.4)`), leaving ~1.6 mm wall each side.
- The middle gear mesh is regenerated from its PrecisionGears settings (sharp inner rim edge;
  a hand-made rounding there was removed).
- Reference rods (collection `Reference Rods`, red, unselectable, not exported): 8.1 mm rods
  at all 25 letter centers, named `Rod_R<row>C<col>_<letter>`. The letter grid pitch is
  180 mm: it is both the 64T-96T center distance (72 + 108) and middle -> 16T idler -> letter
  (90 + 90), so every gear center lands on it (cell (row, col) at x = (col - 3) * 180,
  y = (3 - row) * 180). Two 96T on the same layer cannot sit in orthogonally neighbouring
  cells (180 < 220.5 OD); diagonal neighbours (254.6 mm) clear.
- Modeled backlash is 0 (teeth touch exactly); printed parts need the fit value from the coupon.
- Letters (collection `Letters`, objects `Ltr_R<row>C<col>_<letter>`, one shared mesh per
  letter `Letter_<X>`): `cad/sator_letters.py` `build_letters()`, one per cell centered on its
  reference rod. Font: Lithos Pro Regular (carved Greek inscription caps, chosen for the
  "Roman carved in stone" look of surviving SATOR squares); backup: Trajan Pro 3 Bold
  (`build_letters("TrajanPro3-Bold.otf")`). Cap height 100 mm (measured on E; Lithos T is
  ~97 and A ~104 by design), 4 mm thick, 0.8 mm chamfer, bottom at z 14 (2 mm above the top
  gear layer). Each glyph is centered on its bounding box, which sits on the rod (the axis it
  turns about). S and O are averaged with their own half-turned copy, so they are exactly the
  same upside down (Lithos S was 0.7% of letter height off; N is 2.9 mm off but is the fixed
  center). The O is narrowed to 75% of the font's width (`o_width=0.75`, 75 x 101 mm),
  keeping the font's stroke widths, so a quarter turn of the Geneva-driven O is visible while it
  still reads the same upside down. Material `Letter_Gold` (placeholder look).
  The fonts are commercial and installed locally: the script loads them by file
  name, converts the letters to meshes and removes the font datablock, so no font file or
  path is stored in the .blend or the repo.
  - Rotation center: S, T, R, E, N have material there; A (8 mm to the nearest stroke),
    P (3.8 mm) and O (36.8 mm, the counter) do not, so those need a bridge or mount to the gear.
  - Open: 3D style (flat with chamfer for now; chiseled V-ridge strokes or an incised tablet
    are the alternatives), how letters fasten to their gears.

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

Modeled hole diameters for a tight press fit of the bearings on hand. Holes print true to
size on the current printer: 16.2 / 22.3 (snug on the old Ender) let the bearings fall through.
The values below are a first guess at a firm press; confirm with the fit coupons.

| Bearing OD | Modeled hole dia | Suggested use | Notes |
| --- | --- | --- | --- |
| 16 mm | 15.9 mm | 16T idlers | a 22 mm-class hole would leave only ~4 mm to a 16T root; 15.9 leaves ~7.2 mm |
| 22 mm | 21.9 mm | 64T letter gears, 96T gears | needs hub radius >= ~16 mm (5 mm wall) |

Fit coupons (`sator_gears.fit_coupon`, collection `Test Prints`, exported as
`cad/export/Fit_Coupon_16.stl` and `Fit_Coupon_22.stl`): 5 mm bars with holes from 0.2 under
to 0.2 over the guess in 0.1 steps, each size engraved beside its hole. The holes are cut
like the gears' (fine polygon, straight wall, no chamfer), so the winning size carries over:
set `BEARING_HOLE_D` / the idler bore radius to it, rebuild and re-export.

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

## Geneva drives (`cad/geneva_math.py`, `cad/geneva.py`)

- `geneva_math.py` (numpy only; runs outside Blender too, `python cad/geneva_math.py` self-checks)
  holds the geometry and motion. Swing per push 2*amp and centre distance c fix everything:
  crank a = c sin(amp), star rim R = c cos(amp), push = 180 - 2*amp deg of driver turn.
  Slots and pockets are lists of angles, so `index(n)` (plain Geneva, `pins=2` for two
  indexes per turn), `toggle(swing)` (double-Geneva, drivers on opposite sides) and
  `meshed_toggle(swing, pitch_r)` (drivers geared to each other; c = pitch_r / sin(amp)) share
  one code path. Locking discs are carved by sweeping the star through a whole cycle in each
  driver's frame. `check()` samples a cycle for clearances and measures how far each dwell can be
  forced (lock play); `board_motion()` gives a board-riding letter's world angle.
- `geneva.py` builds a set (star + drivers, plate / air gap / star layer, printed pin or
  pin hole), stores its settings on the parent empty (`rebuild()`), and `animate()` keyframes one
  driver turn on a cycle. Each part exports as one shell with `sator_gears.export_stl`
  (`plate_t=0` leaves the pin as a separate shell until it is unioned onto a gear).
- The earlier printed double-Geneva star matches `toggle(90, 50.715, land=7.8)` to 0.05 mm
  median (pin 4, slot 4.8, star 71.7 mm).
- O toggle (board-riding O, letter turns 90/swing x the star so each push is a quarter turn):

  | Swing | Moving | Push (board deg per 90) | O drift each side of a detent | Lock play (deg) |
  | --- | --- | --- | --- | --- |
  | 45 (+-22.5, R 2) | 75% | 67.5 | 11 | 12.7 / 1.4 (barely locks) |
  | 90 (R 1) | 50% | 45 | 22.5 | 3.7 / 0.7 with land 7.8 |

  With drivers on opposite sides, swings over 90 do not fit on the star (pockets collide).
  Bigger swings fit only with meshed drivers, up to 120.
  The O alternates: one quarter it drifts and clicks back (reads upright), the next it drifts
  and is carried through sideways to upside down.
- A toggle's drivers turn once per two detents (2 turns per board turn). On the 96T (2/3 turn
  per board turn) that is a 32T driver; a 16T gives 4 (two pushes per detent, so half the rests
  leave the O sideways), which suits a 4-slot `index` drive instead (one click per detent).
  Chosen: swing 90 at 2 turns per board turn.

## O toggle units (`cad/sator_o_toggle.py`)

One toggle drives two O's: the earlier printed toggle test rig (31T twin drivers, star, 16T
middle mesh between two letter gears) scaled up and put on the board.
`build_o_toggles()` builds both units and the P letter gears that feed them, and `check()`
reports clearances; `layout()` holds the axis positions.

- Unit NE: star axis on the corner point (270, 270) between the O's at R1C4 and R2C5, fed
  from P R2C4. Unit SW is its half turn (O's R5C2 + R4C1, fed from P R4C2): same parts.
- Train: P 64T (bottom layer, meshes its 96T) -> 54T on P's shaft -> 27T on driver A's shaft
  (A at 2 turns per board turn) -> A 64T meshes B 64T at the star axis (they counter-rotate; each
  carries a pin and locking boss) -> star -> 56T on the star shaft meshes both O 56T gears 1:1.
- Toggle: `toggle(90, 72, land=7.8, bore_d=21.9)`: star R 50.9 (102 mm across), crank 50.9,
  pin 4, lock play 3.65 / 0.5 deg (same as the printed rig).
- Drive pins are steel (sourced), 4 mm (`PIN_D`; the slots are 4.8 wide, so change it and
  rebuild if the pins differ). Each presses through a 4.1 mm hole (`PIN_FIT` 1.025) in its 64T
  driver gear at r 50.9 and stands up into the star layer: pin length 16.7 mm (gear bottom
  z -39 to 0.3 below the star top). The printed locking boss carries no pin. Grey `Pin`
  objects in each unit's collection are stand-ins (not exported).
- A and B sit on the grid line through the star (A at (269.3, 198.0), B at (270.7, 342.0) for
  NE), 72 from the star: within 0.6 deg of the grid because |A - P| must be (27 + 54) * 2.25 / 2.
  On the diagonal they covered P's axis. Rule: no part may cover another letter's axis
  (each letter's axis stays open to the sky); the closest is 16.9 mm (A/B tips to P/R axes).
- The O's are 127.28 from the star axis; no whole tooth count fits that at module 2.25, so
  all three 56T carry profile shift +0.29 (`OUT_SHIFT`, from the involute center-distance
  formula; 57T with the star nudged 11 mm along the diagonal was the alternative).
- The unit hangs below the board; the board's layers are unchanged. Top down: 56T output
  gears z -21..-13, star -30..-22 (bosses and pins stand on the A/B gears), A/B 64T -39..-31,
  27T + 54T -48..-40. The O letters reach the letter plane on their own shafts.
- All meshes checked with a BVH overlap test (clear at the modeled distance, colliding 0.15 mm
  closer, same as the 96T-letter pairs). The future 96T E and S, placed by meshing the middle
  gear, also mesh P R2C4 / R4C2 (the loop's tooth phases agree).
- Phase: built at t = 0 (mid-dwell before A's push, star 0); every O rests upright or upside
  down at each board quarter turn.

## Open questions

- How the fixed middle gear mounts to the frame (no bearing; solid hub drum, r 15, full 24 mm height).
- Idler axle support: lives in the spacer layer (z -4..4), outside the middle spacer
  (radius 68.9); the 96T below sweeps under the idler, so nothing can pass through z < -4 there.
- Letter-gear tree: which letters chain off which (keep paths short, no closed loops)?
- Corner R's (R1C5, R5C1), lower priority: each touches only its two O's and, diagonally,
  P, and the O toggle sits on the P -> R path. Idea: a free idler on the star's axis (own
  bearing, own layer) meshing P 64T and R 64T: 49T at module 2.25 spans 127.125 of the needed
  127.28 (0.16 mm loose) -- or shift it like the 56T. R then turns with P (upright).
- O toggle hardware: shafts and supports for the hanging unit (star + 56T on one shaft, A +
  27T, B, P + 54T); union each driver's locking boss onto its 64T for export (A and B
  differ: the pin hole sits at a different tooth phase on each).

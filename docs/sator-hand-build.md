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
| P letter gears (R2C4, R4C2) | 64 | 2 | bottom layer; printed with their 54T as one P stack on 608 bearings | far-letter clones, re-decorated `scurve` x4; each also feeds an O toggle unit (below) |
| O toggle drivers A/B | 64 | 4 | free on board, below the board | twin drivers of the double-Geneva toggle, mesh each other; 2 turns per board turn |
| O toggle input / P shaft | 27 / 54 | 2 / 2 | 27T on driver A's shaft, 54T printed with P (P stack) | P turns 1 per board turn, x2 |
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
  -1.875 deg to mesh. `Gear_96T_E` (180, 0, -8) and `Gear_96T_S` (0, -180, -8) are copies of N
  turned -90 / 180 deg about the middle axis (with their crossings and rim dots), so all four
  arms of the cross match.
- 16T idlers (top layer) line up with the 96T contact directions (N/S/E/W).
  `Gear_Idler_16T_N/S/E/W` sit at (0, 90), (0, -90), (90, 0), (-90, 0), z 8, each rotated
  -11.25 deg to mesh; 16.0 bearing hole (bore radius 8.0), solid web (7.1 mm rim to the
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
  and (-360, 0, -8) (`_E2` / `_S2` at (360, 0, -8) and (0, -360, -8), copied the same way as
  the 96T E/S, as are the front letters `_E` / `_S` on idlers E/S), `ringed` x5 crossings
  (2 steps). Fixed middle -> 96T -> 64T is 64:64 through two meshes, so these letters stay
  upright like the idler-driven ones.
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
- Shared meshes: identical copies (crossings, P tubes, rim-dot and hub cutters, the toggle
  units' carved parts and cutters) share one mesh datablock, so editing one in Edit Mode edits
  them all. Gear tooth meshes are never shared: PrecisionGears deletes a gear's old mesh when
  it regenerates the gear. Scripts that rebuild a part delete its old mesh only once nothing
  else uses it. Sharing took the file from 54 to 30 MB; exports are byte-identical.
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
  gear with its crossings into ONE closed solid (and reports shells = 1, non-manifold = 0,
  missing = []). The EXACT union depends on merge order: some orders silently drop a piece
  (the result is still one closed shell; the first P stack export lost its 54T and the first
  star + S gear export lost its star) or tear the result. So the export checks that points
  just inside every piece lie inside the solid, and tries other orders until one passes.
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
- `cad/sator_lab.blend` is a small sandbox (~0.4 MB) for trying ideas before they touch the main
  file: the SE letters R A A S (same coordinates as the main file) and a keyframed mock of the
  A swap (Open questions). Build things there first, then port the script to the main file.
- Blender stores the last Save As folder (an absolute path) inside the .blend. The pre-commit
  hook runs `cad/check_private.py --staged` and blocks a commit that carries one. Fix: point
  every File Browser area back to `//`, then save again.

## Bearings

Modeled hole diameters for a press fit of the bearings on hand. Holes print true to size on
the current printer: 16.2 / 22.3 (snug on the old Ender) let the bearings fall through.
Settled with the fit coupons: 21.9 is a very tight press for the 22 mm bearings (kept);
16.0 is snug for the 16 mm ones (chosen over the tighter 15.9; the idler's axle hardware
holds the bearing in).

| Bearing OD | Modeled hole dia | Suggested use | Notes |
| --- | --- | --- | --- |
| 16 mm (5 mm bore, likely 625: 5 x 16 x 5) | 16.0 mm | 16T idlers (full board only; the corner kit is all 608) | a 22 mm-class hole would leave only ~4 mm to a 16T root; 16.0 leaves ~7.2 mm |
| 22 mm | 21.9 mm | 64T letter gears, 96T gears | needs hub radius >= ~16 mm (5 mm wall) |

Fit coupons (`sator_gears.fit_coupon`, collection `Test Prints`, exported as
`cad/export/Fit_Coupon_16.stl` and `Fit_Coupon_22.stl`): 5 mm bars with holes from 0.2 under
to 0.2 over the guess in 0.1 steps, each size engraved beside its hole. The holes are cut
like the gears' (fine polygon, straight wall, no chamfer), so the winning size carries over:
set `BEARING_HOLE_D` / the idler bore radius to it, rebuild and re-export.

Bearing model numbers and widths: TBD (width matters vs 8 mm gear thickness). The P stacks
assume 608 (8 x 22 x 7, M8 rod); change `BEARING_W` / `ROD_HOLE_D` in `cad/sator_o_toggle.py`
and rebuild if the bearings on hand differ.

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
- Train: P 64T (bottom layer, meshes its 96T) -> 54T on P's shaft (the P stack, below) ->
  27T on driver A's shaft (A at 2 turns per board turn) -> A 64T meshes B 64T at the star axis (they counter-rotate; each
  carries a pin and locking boss) -> star -> 56T on the star shaft meshes both O 56T gears 1:1.
- Toggle: `toggle(90, 72, land=7.8, bore_d=21.9)`: star R 50.9 (102 mm across), crank 50.9,
  pin 4, lock play 3.65 / 0.5 deg (same as the printed rig).
- Drive pins are steel (sourced), 4 mm (`PIN_D`; the slots are 4.8 wide, so change it and
  rebuild if the pins differ). Each presses through a 4.1 mm hole (`PIN_FIT` 1.025) in its 64T
  driver gear at r 50.9 and stands up through the gap into the star layer: pin length 25.7 mm
  (gear bottom z -48 to 0.3 below the star top; a stock 4 x 25 stops 1 below it). The rods on
  hand are 4 x 30: driver B takes one uncut (nothing under B down to z -54, so 4.3 mm hangs
  below its gear), but driver A must be cut to 25.7 (the P stack's 54T is 1 mm under A's gear
  and sweeps the pin circle; the 56T gears are 1.3 mm over the pin top). Use the 4 x 25 dowels
  in both drivers instead: no cutting. Press each so its bottom is flush with the driver
  gear's bed face (z -48, top at -23, 1.0 under the star top, so 7 of the star's 8 mm is
  engaged; still held 17 by the gear and post). On A it must never stand below the bed face
  (54T 1 mm under); pushed the other way it may sit up to 0.7 inside the hole. It is held
  for 17 of that by the gear and the pin post (below). Grey `Pin` objects in each unit's
  collection are stand-ins (not exported).
- A and B sit on the grid line through the star (A at (269.3, 198.0), B at (270.7, 342.0) for
  NE), 72 from the star: within 0.6 deg of the grid because |A - P| must be (27 + 54) * 2.25 / 2.
  On the diagonal they covered P's axis. Rule: no part may cover another letter's axis
  (each letter's axis stays open to the sky); the closest is 16.9 mm (A/B tips to P/R axes).
- The O's are 127.28 from the star axis; no whole tooth count fits that at module 2.25, so
  all three 56T carry profile shift +0.29 (`OUT_SHIFT`, from the involute center-distance
  formula; 57T with the star nudged 11 mm along the diagonal was the alternative).
- The star's 56T only ever swings 0..90, so it keeps teeth only on the two arcs that pass its
  O meshes: 90 deg of travel plus 2 teeth each end (`SECTOR_MARGIN`), widened to the next tooth
  space, giving 19 teeth / 122 deg per arc, centered 90 and 270 deg in the built pose (the O's
  sit on opposite sides of the star, so the arcs are opposite). Two S-curved arms per arc
  (`ARMS_PER_ARC`; `ARM_*`: 9 wide, curling 70 deg, flared at both ends) tie each arc to the
  hub (r 19), one set 1.5 in from each arc end so both ends are supported; arc rim 6 below the
  tooth roots. Cut by a hidden `Sector Cutter` Boolean, so the teeth are the
  same as the full gear's; `SECTOR_MARGIN = 1` would give 17 teeth / 109 deg.
- Decoration (`DECOR`, built by `build_unit` with `cad/crossings.py`, 21.9 bearing hole, rim
  dots on every gear): P 64T `scurve` x4, 1 step, hub r 22 (mostly window: it tops its stack;
  `straight` x4 at `SPOKE_W=5` was the alternative); 54T under it `ringed` x5, 2 steps, hub
  r 18 (P's old far-letter look); O 56T `holes` x6, 1 step (round windows under the O's; they
  top the unit); A/B 64T `scurve` x6, `SPOKE_W=8`, flat full height (the pin post's arm
  rides a spoke), hub r 36 (under the boss's corbel foot, r <= 34), the spoke that crosses
  r 50.9 turned onto the steel pin (`crossings.spoke_turn`), whose hole is cut in the
  crossings (the pin is inside the opened bore); 27T rim dots only (no room inside its roots).
  Every gear + crossings exports as one closed solid (`export_stl`: shells 1, non-manifold 0).
- Carving of the Geneva parts (`cad/toggle_carve.py`, outlines from `cad/carve.py`: signed
  distance fields on a 0.25 grid, windows opened to a 2.5 corner radius, cutters lofted
  through the outline traced at offsets so their edges are shaped; every cutter crosses the
  part's faces at an angle, never lying on one, and each window grows no closer than 0.4 to
  the midline to its neighbours):
  - Star: a 4.5 frame along the whole outline (slots, pockets, rim), hub r 17 round the 21.9
    bearing hole, an S-curved rib 5 wide from the hub to each lobe without a slot (curling the
    same way as the S gear's arms; the slot walls brace the other two lobes); six windows,
    1.2 round on top, 0.6 x 45 chamfer on the bed side.
  - Locking bosses: the exact locking outline only where the star is (z -31..-22, the crown);
    under it a corbel narrowing to 0.84 of the outline at the gear (49 deg at its steepest,
    prints unsupported) with 20 leaf flutes 1.2 deep, as on the P column's capital. A raised
    border 3 wide runs round the crown's top, the panel inside 1.2 lower; two windows run
    from the panel down through the corbel and the gear's hub to the bed.
  - Pin posts: a collar r 4.5 round each steel pin from 0.2 above the gear's bed face up to
    1 below the star, tied to the corbel by an arm 5 wide that rides the S spoke carrying the
    pin (checked: the arm sits on spoke or hub all the way). The pin is then held for 17 of its
    25.7 mm; only the 8 in the star's slot stand free.
  - S gear: windows as before (toothed arcs, S arms, hub) with the same edges; the arms stand
    2.5 lower than the rims and hub, their top edges rounded, and the rims and hub get a 1.2
    stepped border along the windows.
  - Exports: `export_toggle_parts(unit)` -> `cad/export/`: `Toggle_Star_S_<unit>` (star +
    plug + S gear), `Gear_Driver_A_<unit>` (64T + crossings + boss + post + plug + 27T),
    `Gear_Driver_B_<unit>` (the same with its drum, no 27T), `Gear_O_56T_R<r>C<c>` (O gear +
    drum); each one closed solid; NE and SW match (same volume and extents; not
    byte-identical). Bearing stacks: see "O toggle stand" below.
- P stack: the P 64T (z -12..-4), the 54T (-57..-49) and a tube between them print as ONE part
  (`export_p_stack(unit)` -> `cad/export/Gear_P_Stack_<unit>.stl`; NE and SW are byte-identical,
  so print one design twice). It turns on two 22 mm bearings (608, 8 x 22 x 7, `BEARING_W`) on a
  fixed M8 threaded rod: each gear keeps its 21.9 bearing hole and the tube plugs it 7 below the
  outer face, so each bearing seats 7 deep, on the tube's end. A 16 x 0.6 counterbore
  (`RELIEF_D`) under each seat keeps the shoulder off the inner race; the rod hole is 8.6
  (`ROD_HOLE_D`). The tube is a small carved column (`_column`), top down: abacus band r 20.5
  (`CAP_R`, into P's r 22 hub), echinus cushion down to the neck (39 deg at the top, 50 at the
  foot, so it prints unsupported) with the flutes carried up it as leaves (`LEAF_D` 1.2), an
  astragal bead, a shaft narrowing from r 12.5 (`SHAFT_R`) to r 11 (`WAIST_R`) at mid-height
  with 12 round-ended flutes 1.1 deep (`FLUTES`, `FLUTE_D`, fillets between), then an Attic
  base (torus, scotia, torus) on the 54T. Thinnest wall to the rod hole: 5.6 (flute bottom at
  the waist). The base's lower torus is the widest point in driver A's height band, r 14.5
  (`TUBE_R`): A's tooth tips pass 2.4 from it (they reach 16.9 from P's axis); A turns 1 mm
  above the 54T, so the base cannot spread wider. The 54T keeps P's angle (the stack is built
  that way in both units) and the 27T turns to mesh it. Print it 54T down with supports under
  the P gear (37 mm of air under a 74 mm radius wheel); the column needs none.
  `check()` measures each part's radius only over the height band it shares with another, so
  the capital is not counted against A.
- The unit hangs below the board; the board's layers are unchanged. Top down: 56T output
  gears z -21..-13, star -30..-22, 10 mm of air (`STAR_GAP`; the bosses and pins stand on the
  A/B gears up through it), A/B 64T -48..-40, 27T + 54T -57..-49. The O letters reach the
  letter plane on their own shafts.
- Star gap: the A/B gears mesh right under the star axis, so the star's rod cannot run down
  past them; it ends in the gap, held by the stand's bridge (below). In the gap only the
  pin posts (collar r 4.5 at r 50.9 round each driver axis) and the bosses inside their
  sweep move: around the star axis the gap is clear to r 16.6 (`check()` ->
  `star_gap_clear_r`), and it opens up away from the axis at right angles to the A-B line
  (half-width 20.3 at 20 out, 25.4 at 30, 33.7 at 40, unlimited past 55.4), so an arm up to
  30 wide fits from either side (1.6 clear at the axis; 28 wide leaves 2.6). 1 mm air above
  and below leaves 8 for the bracket. Changing `STAR_GAP` moves the A/B and input
  layers (and the P stack's 54T) with it; the star and everything above stay put.
- All meshes checked with a BVH overlap test (clear at the modeled distance, colliding 0.15 mm
  closer, same as the 96T-letter pairs). 96T E and S, placed by meshing the middle gear, also
  mesh P R2C4 / R4C2 (the loop's tooth phases agree; checked on the model: clear as placed,
  colliding 0.15 closer), so each P is driven from two 96T at the same rate.
- Phase: built at t = 0 (mid-dwell before A's push, star 0); every O rests upright or upside
  down at each board quarter turn.

## O toggle stand (`cad/toggle_stand.py`)

A stand that holds one toggle unit's corner on its own, so it can be built and turned by
hand before the board exists (unit NE: the OPRO corner). `stacks(unit)` adds the bearing
pieces to the unit (`build_unit` calls it); `stand(unit)` builds the stand in collection
`Stand <unit>`; `check_stand(unit, clear)` reports any stand part within `clear` of a turning
part's swept volume; `export_stand(unit)` writes one STL per part design.

- Bearings: every turning group runs on two 608s (8 x 22 x 7) on a fixed M8 rod, one pressed
  into each outer face of the group (the 21.9 holes the gears already have). A plug between
  the two seats carries the outer races; a 16 x 0.6 counterbore keeps each inner race clear;
  the rod hole is 8.6. Each inner race rests on an M8 hex nut sunk in a pocket at the top of
  what holds the rod (13.3 across flats, open at the top, floor 6.5 under the bed face), so
  the nut stands 1 proud of the support, 1 mm under the group's bed face; the nut is the
  spacer and touches only the inner race and the seal. 12 bearings in all for the corner.
  Checked (solid/empty profile at r 10.6 and r 11.4 round each NE axis): all 12 seats are
  open 7 to 7.25 deep with wall all round; the thinnest wall is 4.05 (O drums, r 15 round
  the 21.9 seat), so press those bearings in square and slowly.
  Rod play: M8 threaded rod is typically 7.8 to 7.9 over the thread crests, under the 608's
  8.0 bore. A, B, the star and the O's have their two bearings only 10 apart, so 0.1 of play
  each way could rock a gear about 1 deg (about 1 mm at the rim). Measure the rod; if a group
  rocks, wrap one layer of thin tape (polyimide or foil) round the rod at each bearing. Too
  thin to print.
  - Driver A + 27T: one part (as the P stack); a collar r 14.7 joins them (A's hub windows
    start at r 15.2). Seats in the 27T's bed face and A's top face. The 27T's own outline
    also runs on up through the 1 mm to A (`_fill`, hidden `... Stack Fill`): the gap is
    there to keep A off the 54T, and nothing else ever passes over the 27T, so A does not
    print hanging 1 mm over it. The fill covers the 27T's rim dots.
  - Driver B: a fluted drum under it (z -57..-48, r 16.5) carries the lower bearing.
  - Star + S gear: one part, joined by a collar r 14.7 in the 1 mm between them; seats in the
    star's bed face and the S gear's top face. The star's outline runs on up to the S gear
    the same way (the gap only clears the pin and boss tops, which stay outside the star's
    outline), 1 mm on into the S gear, less both parts' windows: the star's windows (at
    their rounded top width + 0.05) and the S gear's (halfway out its bed chamfer) are cut
    out of the fill, so both go all the way through (hidden cutters `... Stack Fill Star
    Windows` and `... Stack Fill S Windows`, straight copies of the parts' own window
    cutters). The fill joins the two only where both have material. The star's edge
    chamfer is 0.3 (`chamfer=0.3` in `build_unit`): at 0.5 it folded over itself at the
    star's points, and the folded mesh made the union drop the whole star.
  - Each O gear: a drum under it (z -30..-21, r 15) carries the lower bearing.
  - A's and B's upper bearing sits right under the locking boss, which prints with the
    gear: a 22.5 bore (`BOSS_BORE_R`, hidden cutter `... Bearing Bore`) runs down through
    the boss's centre, so the bearing presses in from the top, and a cap nut on the rod
    sits on its inner race inside the bore (3.7 mm clear of the boss).
- Supports. All eight lie on the compass lines through the star axis: A and B on the A-B line
  (r 72), the bridge's columns across it (r 87, `BR_D`), P and R on one diagonal, the two O's
  on the other (r 127.3).
  - Pedestals under P, A and B (part of the floor tiles): Attic base, top 1 below the bed faces.
  - Columns (printed apart, a spigot into a floor socket, the rod through them): under each O
    (shaft r 12.5 with 12 flutes, echinus capital r 17, nut pocket on top; 5+ mm from driver
    B / A); under the corner R up to the letter plane (z 14, the R sits on it, over a nut
    flush with the top); and the bridge's two (spigot into the beam above).
  - Bridge: a beam through the star gap (z -39..-31, 1 mm air to the A/B gears below and the
    star above), waisted round the star to stay 2.5 off the pin posts' sweep (28 wide at the
    star, 40 at the columns), stepped fasciae on its sides, rivets round each end. The star's
    rod hangs from a nut in a pocket in its top (floor 2.5 thick, so nothing can sag onto A
    and B); each end is clamped down by an acorn nut on its rod (room for one: 2+ mm to
    everything that turns, up past its 15 mm height).
    Measured: 1.5 to 2 mm from the pin posts' swept volume, the tightest spot of the stand.
  - Floor: radius 158 round the star axis, 6 thick (z -68..-62), a compass rose: spokes along
    the 8 lines, rings at r 80 and r 127.3, a rim 14 wide with rivets, round windows (r 4
    corners, rounded top edge, bed chamfer) between. Four quadrant tiles (204 x 157, fit the
    256 bed) with their seams between the spokes, so no support sits on a seam; a keystone
    (r 36, compass rose in relief, rivets) sits 3 deep over the point where they meet; eight
    bow-tie keys (3 deep) cross the seams. Bun feet under it, printed apart so the tiles
    print flat: one under each support holds that rod's lower nut (trap 13.3 across flats,
    6.8 deep, open below), four smaller ones near the centre peg in. Every rod runs between
    two nuts (foot trap and support pocket), so the stand can be lifted without the rods,
    feet or tiles dropping out.
- Hardware for the corner: M8 threaded rod (one 1 m length), cut to P 71, A 43, B 43, each
  O 62, R 89, bridge columns 53 (x2), star 25; cut 0 to 1 short, never long (most rod tops end
  0.6 under a turning face). Plain hex nuts (DIN 934 / ISO 4032: 13 across flats, at most 6.8
  tall; not nyloc or flange) x 17: one in each foot, one on top of P, A, B, O1, O2, R and the
  star, and a cap nut over A's and B's top bearing (snug only: it holds the gear on, and the
  bearing takes it). 2 M8 acorn nuts (DIN 1587) on the bridge ends. 12 x 608 bearings, 2 steel 4 x 25.7
  drive pins. Stock bolts do not fit: the lengths fall between standard sizes and would leave a
  bearing short of rod or rub a boss. The nuts sit in hex pockets, so they hold the rods in
  place rather than clamp them (spin a foot nut up snug, then back it off to the nearest flat).
- Print: floor tiles, keystone, keys, feet, columns and beam need no supports (columns stand
  on their spigot; the beam prints bed face down). The P stack needs supports everywhere
  (under the P gear, standing on the 54T). The other turning parts need supports from the
  build plate only: the upper gear's rim stands 9 mm over the bed (A over the 27T, B and the
  O's over their drums, the S gear over the star).
- Print list for the corner, all from `cad/export/`, as exported (each lands right way up):
  - Turning: `Gear_P_Stack_NE`, `Gear_Driver_A_NE`, `Gear_Driver_B_NE`, `Toggle_Star_S_NE`,
    `Gear_O_56T_R1C4`, `Gear_O_56T_R2C5` (one each).
  - Stand: `Stand_Floor_Q1_NE` .. `Q4` (one each), `Stand_Keystone_NE`, `Stand_Key_NE` x8,
    `Stand_Foot_NE` x8, `Stand_Foot_Hub_NE` x4, `Stand_Column_O_NE` x2, `Stand_Column_R_NE`,
    `Stand_Column_Br_NE` x2, `Stand_Bridge_NE`.
  - Bearing seats are 21.9, settled with `Fit_Coupon_22` (see "Bearings").
- Checked: `check_stand` finds nothing within 1.5 mm (rods and nuts left out: they sit in the
  bores on purpose); the rods and nuts stay 2+ mm from every turning part on another axis and
  each nut sits in its pocket without touching the print; the unit's own `check()` still
  reports no overlaps; every exported part is one closed solid.
- Not yet: the letters are not fastened (the O's and P float above their gears), and the
  corner R has no gear (it stands on its column).

## Open questions

- How the fixed middle gear mounts to the frame (no bearing; solid hub drum, r 15, full 24 mm height).
  Use model: a lazy susan. The middle is fixed to a wall or a base board (the susan's bottom)
  and the whole board turns around it, pushed by hand at the corners; so every other support
  (axles, columns, the toggle units' floor) rides on the turning board.
- Idler axle support: lives in the spacer layer (z -4..4), outside the middle spacer
  (radius 68.9); the 96T below sweeps under the idler, so nothing can pass through z < -4 there.
- Letter-gear tree: which letters chain off which (keep paths short, no closed loops)?
- Corner R's (R1C5, R5C1), lower priority: each touches only its two O's and, diagonally,
  P, and the O toggle sits on the P -> R path. Idea: a free idler on the star's axis (own
  bearing, own layer) meshing P 64T and R 64T: 49T at module 2.25 spans 127.125 of the needed
  127.28 (0.16 mm loose) -- or shift it like the 56T. R then turns with P (upright).
- A swap (SE and NW corners, R A / A S): the two A's sit on a diagonal round the block center,
  like the O's round the NE star, so one hand pivoted at the block center (127.28 to each A)
  swaps them with a half turn. Lift, swing, drop: the hand rides a closed ramp slot on a
  board-fixed sleeve, so the lift is tied to the swing angle (6 mm up over the first 35 deg,
  down over the last 35; at letter height the A's bounding box first meets R's or S's at
  ~46 deg). The hand has to be in front of the letters: its path crosses the R and S axes, so
  behind them it would hit their mounts. The A's stay upright on 1:1 belts (or idler gears)
  from a center pulley that turns like a letter gear (-board angle). Swing drive: a copy of
  the O toggle (push, dwell, return) with 2:1 up to the hand gives 0 -> 180 -> 0, one swap
  per quarter board turn. Mock-up in `cad/sator_lab.blend` (motion only, no mechanism yet).
- O toggle hardware on the full board: the standalone stand (above) settles every shaft and
  bearing; on the board the same rods would hang from the turning board instead of standing
  on a floor.

# Gear toys

A pegboard gear set for kids, built on the 16 mm bearings (625: 5 x 16 x 5) with the same
bearing mounting as the SATOR toggle units, so it doubles as a small test of that mounting.
Gears plug into a grid of holes, mesh with their neighbours, and every gear carries a groove
for a small rubber band (the kind that fits round one to four fingers), so bands work as
belts and springs.

Script: `cad/gear_toys.py` (run inside Blender, PrecisionGears add-on for the teeth).
`build(save)` makes the parts (collection `Gear Toys`) and a sample layout
(`Gear Toys Layout`), `check()` runs the checks below, `export(out_dir)` writes the STLs to
`cad/export/gear_toys/`. File: `cad/gear_toys.blend`.

Run it with `cad\make.bat gear_toys save check export` (cmd; any order of steps, see
`cad/make.py`): a clean background Blender, exit status 1 on any problem. `render DIR` adds
four stills; `selftest` proves the shared checks still catch what they are for.

## How it fits together

- Board: 5 x 5 holes, 37.5 apart (13.0 holes, 8 thick, 187.5 square). The edge margin is
  half a pitch, so two boards side by side keep the grid; a bow-tie clip drops into the
  dovetail sockets on the meeting edges (two per edge). Pockets underneath save plastic.
- Posts: a peg presses into a hole (three crush ribs), a body stands 5 off the board, and a
  boss (8.0 across) on top carries the gear's lower inner race. An M5 nut is pushed up into
  a hex pocket in the bottom of the peg.
- Turning parts: two 8 mm layers, 16 tall, with a 625 pressed into each end (16.2 seat, 5
  deep, a 0.4 lead-in at each mouth; 16.0 came out tight in the test gear). The clamp is the
  SATOR one: the top outer race stops on a ledge (13.5 across: a 625's housing shoulder must
  stay under 13.6, and its seal starts at 13.3); the bed-side one stops on a 45 deg cone that
  meets its outer corner (a flat ceiling there has nothing under it while printing, and on
  the test gear it sagged into the seat as strings). A loose printed
  spacer (8.0 x 5.5 x 6.0) runs between the inner races down a 9.4 bore, and a printed
  washer (8.0 x 5.5 x 1.5) sits under the bolt head. Tightened, the load runs bolt head,
  washer, inner race, spacer, inner race, post boss, nut: never through the balls, never on
  a seal. A seal is fixed in its outer race and turns with the gear.
- Layers: every part is symmetric, so turning it over swaps its layers. That is how a gear
  moves up to the top layer. Both outer faces are flat; the bottom layer's top face stands
  0.5 down outside the top layer's reach, so two parts whose layers overlap in plan run
  1 mm apart.

## Parts (module 2.5, 25 deg, 0.1 thinned per flank)

| Part | Bottom layer | Top layer | Notes |
| --- | --- | --- | --- |
| `Gear_15T` | 15T | pulley | 42.5 across the teeth |
| `Gear_45T` | 45T | pulley | 117.5 across; six windows, two crank holes |
| `Compound_45_15` | 45T | 15T | three to one in one part; windows, crank holes |
| `Step_Pulley` | big pulley (groove 48) | pulley | belt ratio about two to one |

Every gear's pulley groove is 25 across the bottom, with 45 deg sides up to flanges 30
across, so a 45T two holes away (it reaches 58.75) clears it by 1.25. That is why every
pulley is that size. The step pulley's big groove (48 across, flanges 53) is the
only place a band changes speed.

What meshes where (center distance = 1.25 x the two tooth counts added):
- 15T + 15T: one hole apart (also turned over, both on the top layer).
- 15T + 45T: two holes apart, in a straight line.
- 45T + 45T: three holes apart.
- Diagonal holes (53) and knight's moves (83.9) mesh nothing: use them for bands.

Locks to avoid: two compounds two holes apart, one turned over, mesh on both layers at
different ratios and jam. A 45T reaches 58.75, so nothing else fits on its layer within
one hole of it.

Sample layout (`LAYOUT`, `gear_toys_layout.png`): a crank turns a compound (45T on top).
Its 15T drives a 45T at a third of the speed; its 45T drives a row of three 15Ts at three
times the speed; the last one's pulley belts the step pulley. A band from the crank handle
to a band post is a spring: wind the crank and let go.

## Print list (one board's set)

`cad/export/gear_toys/`, each file one closed solid; the count is in the name.
- `Toy_Gear_15T_x4`, `Toy_Gear_45T_x2`, `Toy_Compound_45_15_x2`, `Toy_Step_Pulley`: print
  on the bottom layer (the face with the teeth or the big groove down). No supports.
- `Toy_Post_x9`, `Toy_Band_Post_x3`: peg down (the nut pocket opens on the bed).
- `Toy_Crank_x2`: pin down. `Toy_Clip_x4` (only to join boards): flat.
- `Toy_Board`: bottom down (the pockets bridge 20 mm).
- `Toy_Washer_x9`, `Toy_Spacer_x9`, plus the tuning set `Toy_Spacer_5.9` / `6.1` / `6.2` /
  `6.3` (print them in a row so they come off the plate in order).

Hardware: two 625 bearings (5 x 16 x 5) per turning part (18 for the set of 9), one M5 x 30
socket head cap screw and one M5 hex nut (8 across flats, 4 thick) per post (9), rubber
bands. Fewer turning parts need fewer bearings: start with what is on hand.

## Assembly

1. Push an M5 nut up into the bottom of a post. Press the post's peg into a hole (firm; the
   ribs crush).
2. Press a bearing into each end of a turning part, down to its ledge. Drop the spacer into
   the bore between them before pressing the second one in.
3. Washer on the bolt, bolt down through the part, into the post's nut. Tighten firmly with
   a 4 mm hex key and spin the gear: it should run free.
4. Tuning: if a gear spins free while loose but drags once the bolt is tight, the spacer is
   the wrong length. Try the next one up (6.1, 6.2); printed seats tend to come out a little
   long. Keep the one that spins freely when tight. This is the SATOR test in miniature.
5. A crank pin presses into either crank hole of a 45T, from whichever face is up.

## Checks (`check()`)

- Each meshing pair at its spacing turns 0.21 mm each way at the pitch circle (0.23 for two
  45Ts) before the teeth touch, and must stay within 0.17..0.25 (the two flanks' 0.20 of
  thinning, -0.03 / +0.05), so a drift fails: 15T+15T, 45T+15T, 45T+45T, 45T + compound turned over,
  compound turned over + 15T turned over, two compounds three apart.
- Pairs that must not mesh stay clear as they turn: the step pulley next to a 15T, a 15T
  next to one turned over, two 15Ts on the diagonal.
- Round one part on its post: nothing standing still within 0.5 of it (spacer 0.70 from
  the bore, post 1.77, bolt 2.2), each inner race at least 0.6 clear of the part (0.78);
  only the outer races touch it. Gaps are measured both ways, and a part wholly inside
  another (a seat cut that silently failed) counts as 0.
- Export refuses to write a part that is not one closed solid with every piece present (the
  last good STL stays).
- The sample layout: no two parts' sweeps meet except gears meshing on their layer; no
  post, band post or crank sweep inside another part's sweep.

## Safety

Bearings, nuts, washers, spacers, crank pins and clips are small parts: not for children who
still put things in their mouths. The washers and spacers are trapped once a gear is bolted
down; the crank pins and clips come loose.

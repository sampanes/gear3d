# Sheet hook: headphone hanger for a stepped hole

A one-piece hook that hangs headphones from a stepped round hole in a two-layer sheet wall,
with no screw: a plug sits in the front layer's hole, a tongue goes through the inner layer's
hole and a disc drops behind it. Script: `cad/sheet_hook.py`; STL in `cad/export/sheet_hook/`.
File: `cad/sheet_hook.blend`.

Run it with `cad\make.bat sheet_hook save check export render %USERPROFILE%\Downloads`
(cmd; see `cad/make.py`): a clean background Blender, exit status 1 on any problem.

## Why not a screw

The screw coupon (`docs/sheet-screw.md`) found the inner hole: a 16.5 crest pushes straight
in, a 16.8 crest will not go in at all. A plain hole has no thread to follow, so a printed
thread either passes or it does not; nothing in between screws in and holds.

## The site

Front view, mm, hole centre at the origin:

| What | Where |
| --- | --- |
| Front layer | 2.75 thick, hole 22.45 across |
| Inner layer | right behind it, taken as 2.75 thick too, hole 16.6 across (16.5 passes, 16.8 does not) |
| Behind | a screw head 16 behind the front face, the back wall 18.25 |
| Ceiling (desk underside) | 18.0 above the hole centre |
| Side wall | 16.5 to one side of the hole centre, at right angles to the face; reaches 49.2 down from the ceiling at the face, tapering to 34.4 at 156 out |

## Shape

Everything that goes in the hole is round: arcs of circles sized to the holes, so it slides in
without a corner to catch. (The first print had a rectangular tongue and lip and a flat-topped
plug, each within 0.1 of its hole when lifted: no room for print error or support scars.)

- Plate against the face, 14 wide, from 8 above the hole centre down to 60 below.
- Plug (2.5 deep) in the front hole: the overlap of two 22.0 circles 5.15 apart, one above
  the other. Hanging, its bottom rests on the front hole's bottom edge, which
  carries the load. Lifted 5.6 its top stops on the front hole's top edge.
- Disc behind the inner layer, 15.6 across, 5 thick, centred 5.6 below the hole centre. At
  the lift stop it is centred on the 16.6 inner hole (0.5 clear all round; it still passes
  anywhere in the last 0.5 of the lift) and its back edge has a 1.0 chamfer to lead it in.
  Hanging, it overlaps the inner layer's back 5.1 below the hole (4.6 at its flat sides). Its
  front face is 0.5 behind the inner layer's back (5.5 behind the face), its back 11 behind
  the face, 5 short of the screw head.
- Tongue joining them through the inner layer: the overlap of a 15.8 circle on the hole
  centre and a 15.2 circle 5.6 below it, so it clears the inner hole both hanging and lifted.
  It is 14 wide and 10 tall (the first print's was 10 by 5.5).
- To hang it: lift it until the plug stops, push it in until the plate meets the face, let it
  drop. No twist. Hanging, the load tips the hook outward: the disc catches the inner layer,
  the plate's foot bears on the face below. It comes off the same way, up then out.
- Arm out from the foot to a flat saddle 40 long (a headband is about 40 wide), 52 below the
  hole centre: a headband 20 thick with its cushion (85 inner radius) still clears the side
  wall's lower edge where it passes it (38 was too high for a cushioned band). A 6 lip at the
  tip keeps it on. The saddle's top edges are 2.0 45-degree chamfers.
- The plate and arm are one side profile extruded across the width; plug, tongue and disc
  are lofted along the hole's axis and cut flat on both sides at the plate's width. It prints
  lying on its side (the STL is in that pose), so the arm bends along its layers, and the
  flat sides put plug, tongue and disc on the bed with the plate: no supports (the first
  print needed them, and the retractions round them chew silk filament).

## Checked by `check()`

- From the dimensions: at the lift stop the plug fits the front hole and the disc and tongue
  clear the inner hole by 0.4; hanging, the tongue clears the inner hole and the disc reaches
  below it; the disc's back clears the screw head; the lifted plate clears the ceiling; the
  top of a 20-thick headband on the saddle stays 4 below the side wall's lower edge along the
  saddle; the plate's edge clears the side wall.
- Points inside and outside the exported solid: plate, plug, tongue, disc, saddle, tip lip
  solid; the slot for the inner layer, the disc's chamfer, beyond the flat sides, the saddle
  chamfer and above the saddle empty.

# Sheet hook: headphone hanger for a stepped hole

A one-piece hook that hangs headphones from a stepped round hole in a two-layer sheet wall,
with no screw: a plug sits in the front layer's hole, a tongue goes through the inner layer's
hole and a lip drops behind it. Script: `cad/sheet_hook.py`; STL in `cad/export/sheet_hook/`.
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

- Plate against the face, 26 wide, from 8 above the hole centre down to 60 below.
- Plug (22.0 across, 2.5 deep) in the front hole, cut flat 2.6 below the centre: it rests on
  the front hole's bottom edge, which carries the load and centres the hook.
- Tongue (10 wide) on through the inner hole, clear of its edge, and a lip behind the inner
  layer that reaches 3.4 below the inner hole. The lip's front face is 0.5 behind the inner
  layer's back (5.5 behind the face).
- To hang it: lift it 5.6, push it in, drop it. The flat-topped plug still fits the front hole
  when lifted. Hanging, the load tips the hook outward: the lip catches the inner layer, the
  plate's foot bears on the face below. It comes off the same way, up then out.
- Arm out from the foot to a flat saddle 40 long (a headband is about 40 wide), 52 below the
  hole centre: a headband 20 thick with its cushion (85 inner radius) still clears the side
  wall's lower edge where it passes it (38 was too high for a cushioned band). A 6 lip at the
  tip keeps it on. The saddle's top edges are 45-degree chamfers.
- The plate and arm are one side profile extruded across the width; the plug and tongue are
  extruded from it. It prints lying on its side (the STL is in that pose), so the arm bends
  along its layers. The tongue and lip then start 8 above the bed with nothing under them
  (the slicer calls it a floating cantilever): slice with supports. They touch only the
  tongue's and plug's sides, not the faces that bear or set the fit.

## Checked by `check()`

- From the dimensions: the lifted plug and the lifted tongue and lip fit their holes; hanging,
  the tongue clears the inner hole's edge and the lip reaches below it; the lifted plate clears
  the ceiling; the top of a 20-thick headband on the saddle stays 4 below the side wall's
  lower edge along the saddle; the plate's edge clears the side wall.
- Points inside and outside the exported solid: plate, plug, tongue, lip, saddle, tip lip
  solid; the slot for the inner layer, the saddle chamfer and above the saddle empty.

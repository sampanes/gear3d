# Sheet screw coupon

A coarse printed screw for a plain 17 mm hole in a sheet about 2 mm thick, 12 mm of thread,
printed as a row of variants to find the one that fits. Script: `cad/sheet_screw.py`; STLs in
`cad/export/sheet_screw/`. File: `cad/sheet_screw.blend`.

Run it with `cad\make.bat sheet_screw save check export render %USERPROFILE%\Downloads`
(cmd; see `cad/make.py`): a clean background Blender, exit status 1 on any problem.

## Round 2 (2026-10-21): the hole is 16.6

Result: 1 and 2 go in (2 pushes straight in, no twisting), 3 to 5 will not go in at all.
A printed thread cannot screw into a plain hole, so this ends the screw: the hole turned out
to be the inner of two stepped holes, and `docs/sheet-hook.md` hangs from it instead.

Only the thread's outside (crest) diameter changes, in 0.3 steps across the hole:

| Dots on the head | Crest | Root |
| --- | --- | --- |
| 1 | 16.2 | 15.0 |
| 2 | 16.5 | 15.3 |
| 3 | 16.8 | 15.6 |
| 4 | 17.1 | 15.9 |
| 5 | 17.4 | 16.2 |

The thread is the same on all: 0.6 deep, 45-degree flanks, a 0.6 flat on the crest, 2.3 wide
at the root (room for the 2 mm sheet), pitch 4.1; the first turn ramps up from nothing and the
tip is chamfered, so it starts square. Report the result by dot count: which slide in loose,
which thread in snug, which will not go.

## Round 1 (2026-10-20): all too big

Crests 17.6 and 18.2 (two groove widths each), meant to bite into the hole's edge by being
over it: none went in. Their numbers were notches in a ribbed rim, which could not be told
apart. Hence round 2: one variable, bracketing the hole, numbered with dots.

## Shape

- Prints head down with no supports. Fine layers (0.12) give a cleaner thread.
- Head 28 across, 5 tall, 0.5 chamfers, 24 shallow grip ribs. The variant number is that many
  dots (2.6 across, 0.8 deep, in a row) sunk into the head's flat top face.
- Each screw body is one surface r(theta, z) closed by two caps; the dots are cut from it with
  an EXACT difference.

## Checked by `check()`

Rays along four half-planes through each screw's axis measure its profile over the full-depth
thread: crest and root diameter as set (within 0.04), every whole root groove at least 2.3
(less 0.12) and wider than the sheet. Rays up into the head count its dots and their depth.

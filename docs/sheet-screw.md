# Sheet screw coupon

A coarse printed screw for a plain 17 mm hole in a sheet about 2 mm thick, 12 mm of thread,
in four variants to test-print. Script: `cad/sheet_screw.py`; STLs in
`cad/export/sheet_screw/`. File: `cad/sheet_screw.blend`.

Run it with `cad\make.bat sheet_screw save check export render %USERPROFILE%\Downloads`
(cmd; see `cad/make.py`): a clean background Blender, exit status 1 on any problem.

## How it grips

The hole is plain and the sheet is rigid, so no thread can pass its edge without something
giving. The root (16.6) slips through the hole with 0.2 each side; the crest is a little
bigger than the hole, and the plastic teeth flex (or are shaved) as the screw turns in. The
grooves between the teeth are at least 2.3 wide where the sheet's edge sits (radius 8.5), so
the edge has room in them. The first turn ramps up from nothing and the tip is chamfered, so
it starts square.

| # (head notches) | Crest | Oversize each side | Groove at the edge | Pitch |
| --- | --- | --- | --- | --- |
| 1 | 17.6 | 0.3 | 2.3 | 3.5 |
| 2 | 17.6 | 0.3 | 2.8 | 4.0 |
| 3 | 18.2 | 0.6 | 2.3 | 4.1 |
| 4 | 18.2 | 0.6 | 2.8 | 4.6 |

Read it as: if 1 and 2 spin loose, the crest needs to grow; if 3 and 4 will not turn or strip,
it is too big. The groove width changes how much of each turn rubs on the edge.

## Shape

- Flanks 45 degrees, a 0.6 flat on each crest: prints head down with no supports. Fine layers
  (0.12) give a cleaner thread.
- Head 28 across, 5 tall, 0.5 chamfers, 24 shallow grip ribs; 1 to 4 notches in the rim
  number the variant.
- Each screw is one surface r(theta, z) closed by two caps: a single closed solid, no booleans.

## Checked by `check()`

Rays along four half-planes through each screw's axis measure its profile over the full-depth
thread: root diameter 16.6 and crest diameter as set (within 0.04), and every whole groove at
the hole's edge at least its set width less 0.05, and wider than the sheet.

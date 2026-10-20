# gear3d — roadmap

**Goal:** a *practical* generator — accuracy and printable STL export matter as
much as the live 3D demo.

## Status

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Unit tests | ✅ done | `npm test` (node:test, no deps) — kinematics, involute geometry, **mechanism `update()` integration**, STL-export bytes, overlays; regression guards for the Geneva-direction and contour-edge fixes. Plus **ESLint** (`npm run lint`) + a `.githooks/pre-commit` gate, and **offline headless screenshots** (`tools/shoot.mjs`, Playwright — see [sator-square.md](sator-square.md)). |
| 2 | STL export | ✅ done | `src/export.js` `saveSTL` — one binary STL of the live mechanism group; uniform `scale` (model units = mm). |
| 3 | Accuracy | ✅ done (external) | **True trochoidal root fillet / undercut** (`rootFilletGeometry` + `gearContour`, `src/gears/involute.js`): the rack sharp-corner trochoid replaces the old flat-root-land + radial wall; low-tooth pinions correctly undercut (the fillet crosses the involute above the form circle and cuts the flank away), guarded so the form radius never trims above the pitch circle. Derivation + spec in [fillet-design.md](fillet-design.md). **Remaining:** internal-gear fillet (needs an epicyclic shaper-cutter trochoid — out of scope), and a v2 cutter tip-radius for a C1-tangent (vs sharp-corner) join. |
| 4 | Mechanisms | ✅ done | Spur + **helical** ✅, Geneva ✅, Double-Geneva ✅, **Internal / ring** ✅, **Planetary / epicyclic** ✅, **Bevel pair** ✅. Spur gears take optional **lightening cut-outs (spokes)** — auto-fit to the web, small pinions stay solid (`spokeHoles`, `test/gear.test.js`). Unit-tested at the kinematics layer **and** the `update()` integration layer (`test/mechanisms.test.js`). |
| 5 | Educational overlays | ✅ done | Pitch (solid) + base (dashed) **circles** via the *pitch/base circles* toggle (`src/overlays.js`); lines are excluded from STL. *(Numeric labels — ratio / center distance / tooth count — were in the original scope but are not implemented; circles only.)* |
| 6 | Visual upgrade | ✅ done | Procedural studio reflections (`RoomEnvironment` via `PMREMGenerator` — no external HDR asset), shadow-only back wall (`ShadowMaterial`), ACES filmic tone-mapping, richer metals (`src/scene.js`). |
| 7 | SATOR square mode | ✅ done | A 5×5 turning-letter wall piece (`src/mechanisms/satorSquare.js`), the **SATOR square** mode. Tile behaviors upright / flip / spin / **index (clicking)** / fixed; per-cell editor + presets; printable/decor STL split; and a rendered **geared O-flip drive** — a double-Geneva *reciprocating* cross whose **pin-in-slot engagement is now fully derived & unit-tested**, with **adjustable drive knobs** (step-up ratio → cross swing, driver teeth, pressure angle) that keep legibility, the mesh, and the cam lock provably intact across their whole range. Design in [sator-square.md](sator-square.md). |

## Now — the physical build (Blender, `cad/`, since 2026-10-11)

The design-to-print work moved out of the web app and into Blender: real bearings,
rods and screws, parts checked for clearance in the posed assembly, STLs that are
one watertight solid each. The web app stays the place to animate and check a
mechanism; `cad/` is where the printed ones are made. Facts and numbers live in
the per-model docs, which are the source of truth; this table is only status.

| # | Item | Status | Notes |
|---|------|--------|-------|
| H1 | SATOR gear train | ✅ designed, exported | Module 2.25 / 25°, fixed 64T triple-stack middle, 24 × 64T letter gears on 16T idlers, four 96T planets, two P stacks (64T + 54T) on 608 bearings; layered crossings per gear family (`crossings.py`); letters from `sator_letters.py`. Printed fit coupons settled the bearing fits (idler holes 16.0). [sator-hand-build.md](sator-hand-build.md). |
| H2 | O toggle units + stand | ✅ designed, exported (NE unit) | Double-Geneva toggle per O pair: drivers A/B 64T, 27T/54T input off the P stack, 56T (shift +0.29) outputs, Geneva star with 45° slot funnels; a standalone stand (`toggle_stand.py`) settles every shaft and bearing; `sator_o_toggle.check(unit)` + `toggle_stand.check_stand/check_kit`. Kit in `cad/export/*_NE*.stl`. |
| H3 | Gear toys | ✅ built, checked, exported | Pegboard set on 625 bearings, band grooves; `make.bat gear_toys save check export`; doubles as the test of the toggle units' bearing mounting. [gear-toys.md](gear-toys.md). |
| H4 | Planetary fidget | ✅ built, checked, exported | 4:1 ring-held planetary on 625s and #8 screws, printed axles through the bearings. [planetary-fidget.md](planetary-fidget.md). |
| H5 | `cad/make.py` pipeline | ✅ done | build / save / check / export / render / selftest in a clean background Blender, exit 1 on any problem; shared `gap()` measured both ways (a buried part counts as 0); exports fail closed. The SATOR hand build is not under it (built in the UI with the helpers). |
| H6 | Open questions | ⬜ | Listed at the bottom of [sator-hand-build.md](sator-hand-build.md): the fixed middle gear's mount (lazy-susan model), idler axle support in the spacer layer, the letter-gear tree, the corner R's, the A swap (mock in `sator_lab.blend`), toggle hardware hanging from the turning board. |

## Done — web print pack (June 2026)

The 2026-06-09 audit found the project strong on *modular / animates on screen*
and untouched on *printable as a working mechanism*: one fused STL of the
assembled scene, zero clearances, no bores/shafts, no way to export the letters.
This track closed that gap in the web app; the physical answers to what it left
open (shafts, bearings, mounting) were then worked out in Blender instead.

| # | Item | Status | Notes |
|---|------|--------|-------|
| P1 | Backlash / print clearance | ✅ done | `backlash` (mm of circumferential play per mesh; each gear thins its tooth by half) through `gearContour` + `internalGearContour` as a rigid flank rotation `δ = b/(4r)` with the rack-consistent fillet (`L += b/4`, see [fillet-design.md](fillet-design.md)); knobs on spur / internal / planetary / bevel / SATOR drive; clamped degrade on absurd values; **default 0 is byte-identical**. |
| P2 | Per-part STL export | ✅ done | `SatorSquare.parts()` → `partsZipBytes` (`src/zip.js`, store-only writer, independently validated against bsdtar + .NET): one ZIP, one laid-flat STL per distinct part with `-xN` print quantities + a README manifest with printed dimensions. Letters ship as connected glyphs (1.02 pixel overlap; screen keeps 0.92). Print-pose gears use `bevel:false` — THREE's extrude bevel dilates the gear *body* outward by `bevelSize = min(0.5, 0.08·t)`, ~1 mm of mesh interference at t=8 (caps true, walls proud; cosmetic-only on screen). The kit's adversarial review also caught + fixed three mechanical bugs: the printed driver pair needs the `driverMeshPhase` interlock baked into driver-b's teeth (a/b variants for even counts); the scene cam was rendered 90° off the pin (CylinderGeometry θ starts at +z); and the slot floor sat at the pin-CENTRE's deepest reach — the pin *surface* jammed by `pinR` every mid-push (floor now cut `1.25·pinR` deeper, scene + print). |
| P3 | SATOR assembly v1 — tile system | ✅ done (kit-only) | The print kit is now a self-jigging assembly: the plate is an extruded square with a clearance hole per tile (`bossR + fit`, `fit` knob, 0.25mm default); every disc carries an integral rear boss (standard boss + glued `tile-cap` washer behind the plate; the centre N glues in — it IS the fixed hub; flip tiles get long bosses whose tip lands exactly on their drive plane, with the `o-tile-gear` glued flush as retainer + mesh-plane jig). Assembly instructions ship in the ZIP README (`printNotes()`). The live scene is deliberately untouched — the kit is the print truth. |
| P3b | Drive shaft mounting | ⬜ parked | the driver axes pass through the spinning output gear's disk and rear-bracket legs collide with the tile-boss grid — shaft/bracket placement needs the **collision/envelope model the Tier-2 solver introduces** (a motivating case for it). The web kit's drive stack still mounts by hand (noted in the kit README); the physical build answered the same question with rods, 608/625 bearings and a per-unit stand in Blender (H2 above). Carried review notes: slot side clearance (0.0175·cell/side) is decoupled from the backlash knob and becomes the binding fit above ~0.7mm; undriven flip tiles (e.g. 'Max flip' S tiles) ship no hardware and nothing flags it; the crank pin foot overhangs the driver root circle by ~1.1mm (slicers bridge it); ground-driven input (how the drivers get their 2φ from board rotation) is still open — today they are hand-turned. |

## Next (design only, parked behind the physical build)

- **Per-cell modular drive + cohesion solver** — Tier 2 of the *modular, adjustable
  SATOR planner* goal: swap an individual cell's drive **mechanism** (e.g. an outer
  ring gear on the E tiles) and keep the whole square cohesive via a constraint
  solver, or flag what breaks + suggest the fix. Design spec (not yet implemented):
  [sator-modular-drive.md](sator-modular-drive.md). Implementation phases 0–2 are
  cheap plumbing; phases 3–4 need the collision model. Nothing started.

## Repo weight: binaries in history (measured 2026-10-20)

GitHub reports the repository at about 517 MB. Walking every commit that touched a
`.blend` or `.stl` through the GitHub trees API (no blob downloads):

| What | Distinct blobs | Uncompressed |
|---|---|---|
| `cad/sator_hand_build.blend` | 29 versions in eight days (largest 51.7 MB, current 47 MB) | 812 MB |
| other `.blend` (`gear_toys`, `planetary_fidget`, `sator_lab`) | 4 | 5 MB |
| `cad/export/*.stl` (SATOR board, NE toggle kit, stand) | 83 | 396 MB |
| `cad/export/gear_toys/`, `cad/export/planetary_fidget/` | 31 | 14 MB |
| **all binaries in history** | **147** | **1.23 GB** |

The checkout needs 114 MB of STL plus 49 MB of `.blend`; everything above that is
old versions nobody can open, and every milestone commit of the hand build adds
another ~50 MB, every re-export of the board set another ~115 MB.

Plan (John's call; a history rewrite must run on a FULL clone, i.e. the home box,
not the partial + sparse clone on the work PC):

1. **Move the binaries to Git LFS, history included.** GitHub Free includes 10 GiB
   of LFS storage and 10 GiB/month of download bandwidth (docs.github.com, read
   2026-10-20); each pushed version counts in full against storage, each download
   against bandwidth. `git lfs migrate import --everything --include="*.blend,*.stl"`
   rewrites every commit so the blobs live in LFS: the git repository drops to a few
   MB and a fresh clone downloads only the current 163 MB of LFS objects, not the
   1.23 GB of history. Then `git push --force origin main` and re-clone every other
   checkout (sole contributor, so nothing else breaks). `.gitattributes` gains
   `filter=lfs diff=lfs merge=lfs` on both extensions next to the existing `binary`
   lines. Every SHA changes, so notes that cite one go stale.
2. **Or stop versioning the STLs at all.** They are derived (`sator_gears.export_board()`,
   `export_toggle_parts()`, `make.py export`). Untrack `cad/export/`, ignore it, and
   attach the set to a GitHub Release at each print milestone
   (`gh release create print-<date> cad/export/*.stl`). Combine with step 1 for the
   `.blend`: the SATOR one is hand-built in the UI (no `build()`), so it is a real
   source and must stay versioned.
3. **Fix the two scans that read `.blend` content.** After LFS, `git show HEAD:path`
   returns the 130-byte pointer, so `cad/check_private.py --all` in CI would scan
   pointers, not files. Set `lfs: true` on `actions/checkout` in `privacy.yml`
   (~50 MB of bandwidth per push) and read the working tree (or
   `git cat-file --filters`) for LFS-tracked paths; the hook's `--staged` path has
   the same issue for a staged `.blend`.
4. **Optional, independent: coarser STLs.** One P stack is 16 MB (~320k triangles),
   a 96T gear 9.4 MB, mostly the 1.2 mm rounded edges. A coarser edge tessellation
   would shrink the set several-fold; it is a print-surface tradeoff, so measure it
   on a coupon before changing it.

Until then: commit the hand-build `.blend` only at real milestones, and do not
re-export parts that did not change.

## Out of scope

- **Share & presets** (URL config / save-load) — intentionally not pursued.

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

## Now — print pack (the design-to-print track)

The 2026-06-09 audit found the project strong on *modular / animates on screen*
and untouched on *printable as a working mechanism*: one fused STL of the
assembled scene, zero clearances, no bores/shafts, no way to export the letters.
This track closes that gap, and is ordered **ahead of** the Tier-2 solver phases
3–4 (feasibility solving is screen-side polish until parts can actually print).

| # | Item | Status | Notes |
|---|------|--------|-------|
| P1 | Backlash / print clearance | ✅ done | `backlash` (mm of circumferential play per mesh; each gear thins its tooth by half) through `gearContour` + `internalGearContour` as a rigid flank rotation `δ = b/(4r)` with the rack-consistent fillet (`L += b/4`, see [fillet-design.md](fillet-design.md)); knobs on spur / internal / planetary / bevel / SATOR drive; clamped degrade on absurd values; **default 0 is byte-identical**. |
| P2 | Per-part STL export | ✅ done | `SatorSquare.parts()` → `partsZipBytes` (`src/zip.js`, store-only writer, independently validated against bsdtar + .NET): one ZIP, one laid-flat STL per distinct part with `-xN` print quantities + a README manifest with printed dimensions. Letters ship as connected glyphs (1.02 pixel overlap; screen keeps 0.92). Print-pose gears use `bevel:false` — THREE's extrude bevel dilates the gear *body* outward by `bevelSize = min(0.5, 0.08·t)`, ~1 mm of mesh interference at t=8 (caps true, walls proud; cosmetic-only on screen). The kit's adversarial review also caught + fixed three mechanical bugs: the printed driver pair needs the `driverMeshPhase` interlock baked into driver-b's teeth (a/b variants for even counts); the scene cam was rendered 90° off the pin (CylinderGeometry θ starts at +z); and the slot floor sat at the pin-CENTRE's deepest reach — the pin *surface* jammed by `pinR` every mid-push (floor now cut `1.25·pinR` deeper, scene + print). |
| P3 | SATOR assembly v1 | ⬜ next | opt-in `assembly`: gear bores, tile bosses, plate clearance holes, retainers — so the printed parts actually mount and turn. Default OFF stays byte-identical. Review notes to carry: slot side clearance (0.0175·cell/side) is decoupled from the backlash knob and becomes the binding fit above ~0.7mm; undriven flip tiles (e.g. 'Max flip' S tiles) ship no hardware and nothing flags it; the crank pin foot overhangs the driver root circle by ~1.1mm (slicers bridge it). |

## Next (design only)

- **Per-cell modular drive + cohesion solver** — Tier 2 of the *modular, adjustable
  SATOR planner* goal: swap an individual cell's drive **mechanism** (e.g. an outer
  ring gear on the E tiles) and keep the whole square cohesive via a constraint
  solver, or flag what breaks + suggest the fix. Design spec (not yet implemented):
  [sator-modular-drive.md](sator-modular-drive.md). Implementation phases 0–2 are
  cheap plumbing and may interleave with the print pack; phases 3–4 run after it.

## Out of scope

- **Share & presets** (URL config / save-load) — intentionally not pursued.

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
| P2 | Per-part STL export | ⬜ next | one ZIP of binary STLs, each part laid flat at the origin; letters become printable (connected glyphs); the single-file export stays unchanged. **Must build print-pose gears with `bevelEnabled: false`:** the adversarial sweep's critic measured that THREE's extrude bevel dilates the gear *body* outward by `bevelSize = min(0.5, 0.08·t)` (caps are true, walls sit proud) — ~1 mm of mutual interference per mesh at t=8, more than the whole backlash range. Pre-existing, cosmetic-only on screen; fatal in a printed kit. |
| P3 | SATOR assembly v1 | ⬜ | opt-in `assembly`: gear bores, tile bosses, plate clearance holes, retainers — so the printed parts actually mount and turn. Default OFF stays byte-identical. |

## Next (design only)

- **Per-cell modular drive + cohesion solver** — Tier 2 of the *modular, adjustable
  SATOR planner* goal: swap an individual cell's drive **mechanism** (e.g. an outer
  ring gear on the E tiles) and keep the whole square cohesive via a constraint
  solver, or flag what breaks + suggest the fix. Design spec (not yet implemented):
  [sator-modular-drive.md](sator-modular-drive.md). Implementation phases 0–2 are
  cheap plumbing and may interleave with the print pack; phases 3–4 run after it.

## Out of scope

- **Share & presets** (URL config / save-load) — intentionally not pursued.

# gear3d — roadmap

**Goal:** a *practical* generator — accuracy and printable STL export matter as
much as the live 3D demo.

## Status

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Unit tests | ✅ done | `npm test` (node:test, no deps) — kinematics, involute geometry, **mechanism `update()` integration**, STL-export bytes, overlays; regression guards for the Geneva-direction and contour-edge fixes. Plus **ESLint** (`npm run lint`) + a `.githooks/pre-commit` gate, and **offline headless screenshots** (`tools/shoot.mjs`, Playwright — see [sator-square.md](sator-square.md)). |
| 2 | STL export | ✅ done | `src/export.js` `saveSTL` — one binary STL of the live mechanism group; uniform `scale` (model units = mm). |
| 3 | Accuracy | 🟡 partial | Flank starts at `max(rb, rf)` (nothing drawn below the dedendum); internal-tooth addendum truncation fixed. **TODO:** true trochoidal root fillet / undercut (today: flat root land + radial wall). |
| 4 | Mechanisms | ✅ done | Spur + **helical** ✅, Geneva ✅, Double-Geneva ✅, **Internal / ring** ✅, **Planetary / epicyclic** ✅, **Bevel pair** ✅. Spur gears take optional **lightening cut-outs (spokes)** — auto-fit to the web, small pinions stay solid (`spokeHoles`, `test/gear.test.js`). Unit-tested at the kinematics layer **and** the `update()` integration layer (`test/mechanisms.test.js`). |
| 5 | Educational overlays | ✅ done | Pitch (solid) + base (dashed) **circles** via the *pitch/base circles* toggle (`src/overlays.js`); lines are excluded from STL. *(Numeric labels — ratio / center distance / tooth count — were in the original scope but are not implemented; circles only.)* |
| 6 | Visual upgrade | ✅ done | Procedural studio reflections (`RoomEnvironment` via `PMREMGenerator` — no external HDR asset), shadow-only back wall (`ShadowMaterial`), ACES filmic tone-mapping, richer metals (`src/scene.js`). |
| 7 | SATOR square mode | ✅ done | A 5×5 turning-letter wall piece (`src/mechanisms/satorSquare.js`), the **SATOR square** mode. Tile behaviors upright / flip / spin / **index (clicking)** / fixed; per-cell editor + presets; printable/decor STL split; and a rendered **geared O-flip drive** — a double-Geneva *reciprocating* cross whose **pin-in-slot engagement is now fully derived & unit-tested**, with **adjustable drive knobs** (step-up ratio → cross swing, driver teeth, pressure angle) that keep legibility, the mesh, and the cam lock provably intact across their whole range. Design in [sator-square.md](sator-square.md). |

## Out of scope

- **Share & presets** (URL config / save-load) — intentionally not pursued.

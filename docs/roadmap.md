# gear3d — roadmap

**Goal:** a *practical* generator — accuracy and printable STL export matter as
much as the live 3D demo.

## Status

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Unit tests | ✅ done | `npm test` (node:test, no deps) — kinematics + involute geometry; regression guards for the Geneva-direction and contour-edge fixes. |
| 2 | STL export | ✅ done | `src/export.js` `saveSTL` — one binary STL of the live mechanism group; uniform `scale` (model units = mm). |
| 3 | Accuracy | 🟡 partial | Flank starts at `max(rb, rf)` (nothing drawn below the dedendum); internal-tooth addendum truncation fixed. **TODO:** true trochoidal root fillet / undercut (today: flat root land + radial wall). |
| 4 | Mechanisms | ✅ done | Spur + **helical** ✅, Geneva ✅, Double-Geneva ✅, **Internal / ring** ✅, **Planetary / epicyclic** ✅, **Bevel pair** ✅. All six are unit-tested at the kinematics layer; per-mechanism `update()` integration (mesh rotations vs. kinematics) is not yet covered. |
| 5 | Educational overlays | ✅ done | Pitch (solid) + base (dashed) **circles** via the *pitch/base circles* toggle (`src/overlays.js`); lines are excluded from STL. *(Numeric labels — ratio / center distance / tooth count — were in the original scope but are not implemented; circles only.)* |
| 6 | Visual upgrade | ✅ done | Procedural studio reflections (`RoomEnvironment` via `PMREMGenerator` — no external HDR asset), shadow-only back wall (`ShadowMaterial`), ACES filmic tone-mapping, richer metals (`src/scene.js`). |
| 7 | SATOR square mode | 📐 planned | A 5×5 turning-letter wall piece as an additional mode — design in [sator-square.md](sator-square.md). |

## Out of scope

- **Share & presets** (URL config / save-load) — intentionally not pursued.

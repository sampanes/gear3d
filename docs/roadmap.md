# gear3d — roadmap

**Goal:** a *practical* generator — accuracy and printable STL export matter as
much as the live 3D demo.

## Status

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Unit tests | ✅ done | `npm test` (node:test, no deps) — kinematics + involute geometry; regression guards for the Geneva-direction and contour-edge fixes. |
| 2 | STL export | ✅ done | `src/export.js` `saveSTL` — one binary STL of the live mechanism group; uniform `scale` (model units = mm). |
| 3 | Accuracy | 🟡 partial | Flank starts at `max(rb, rf)` (nothing drawn below the dedendum); internal-tooth addendum truncation fixed. **TODO:** true trochoidal root fillet / undercut (today: flat root land + radial wall). |
| 4 | Mechanisms | 🟡 mostly | Spur + **helical** ✅, Geneva ✅, Double-Geneva ✅, **Internal / ring** ✅, **Planetary / epicyclic** ✅ *(not yet visually verified in-browser)*. **TODO: bevel** — the one remaining type. |
| 5 | Educational overlays | ⬜ todo | Pitch circles, gear ratio, center distance, tooth-count labels. |
| 6 | Visual upgrade | ⬜ todo | HDR environment reflections, ground shadow plane, richer metals. |
| 7 | SATOR square mode | 📐 planned | A 5×5 turning-letter wall piece as an additional mode — design in [sator-square.md](sator-square.md). |

## Out of scope

- **Share & presets** (URL config / save-load) — intentionally not pursued.

# gear3d: notes for an agent working in this repo

Two tracks share the repo. The web app (`src/`, `test/`) animates and checks mechanisms;
the Blender scripts under `cad/` make the ones that get printed. Facts about a model live in
its doc under `docs/` and win over code comments or memory: `docs/sator-hand-build.md` is the
single source of truth for the physical SATOR build, `docs/gear-toys.md` and
`docs/planetary-fidget.md` for the two toys, `docs/sheet-screw.md` for the screw coupon, `docs/roadmap.md` for status and the repo-weight
plan, `docs/sator-square.md` and `docs/fillet-design.md` for the web app's SATOR mode and
tooth geometry. When a number changes, change the doc first, then the model.

## Before a commit

- `npm test` (134 node:test cases, no deps) and `npm run lint` must pass. The tracked hook
  `.githooks/pre-commit` runs both plus the privacy scan; enable it once per clone with
  `git config core.hooksPath .githooks`.
- `cad/check_private.py` refuses any file carrying a local path or an email, `.blend` files
  included (Blender stores the last Save As folder; point the file browser at `//` and save
  again). The same scan runs on every push in `.github/workflows/privacy.yml`.
- Work lands on `main`; there are no long-lived branches.

## Binaries are the repo's one weak point

`cad/*.blend` and `cad/export/*.stl` are tracked and never delta-compress. Measured
2026-10-20: 1.23 GB of old binary versions behind a 163 MB checkout, mostly 29 versions of
`sator_hand_build.blend` at 30-52 MB each (`docs/roadmap.md`, "Repo weight"). Until the move
to LFS or Releases, which is John's decision and runs on a full clone:

- Commit the hand-build `.blend` at milestones only: a printed part, a settled fit, a
  finished unit. Not after every carve. Scripts and docs commit as often as you like; stage
  them by pathspec and leave the `.blend` modified in the tree until the milestone.
- Re-export and commit only the STLs of parts that changed; `git restore` the rest. A
  re-export of an unchanged part can differ byte for byte and git stores it whole.
- Before each push: `git diff --stat origin/main..HEAD -- '*.blend' '*.stl'`. Those MB are
  permanent.

## Running the CAD scripts

`cad\make.bat <gear_toys|planetary_fidget|sheet_screw> save check export [render DIR]` builds in a clean
background Blender (PrecisionGears add-on) and exits 1 on any problem; `selftest` proves the
shared checks still catch what they are for. Slice only `cad/export/*.stl`: every export is
one watertight solid or it is not written. The SATOR hand build runs its helpers
(`cad/sator_*.py`, `geneva.py`, `crossings.py`, `toggle_stand.py`) inside the Blender UI;
its doc says how.

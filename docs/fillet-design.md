# Trochoidal root fillet — implementation design (v1)

> Status: **IMPLEMENTED** in `src/gears/involute.js` (`rootFilletGeometry` +
> `gearContour`); verified by an adversarial sweep + unit tests + a visual check
> (undercut renders correctly on low-tooth pinions). Derived by three independent
> derivations + a reconciler (all numerically self-checked in the exact
> `gearContour` convention). Kept as the build/maintenance reference.
>
> Implementation notes vs. this spec:
> - The form-radius logic, the trochoid closures, and the undercut/guard handling
>   live in an exported `rootFilletGeometry(params)` so the contour and its tests
>   share one source of truth. It returns `{psi, aboutSigmaAt, filletLead, sigma,
>   landHalfAng, rhoForm, filletEmpty, undercut, rb, rf, r, ra}`.
> - The gap is emitted **symmetrically**: each tooth emits its trailing fillet,
>   trailing flank, tip, leading flank, leading fillet, and the flat land on its
>   leading side, with an "emit each segment's start vertex, not its end"
>   convention so no vertex is duplicated (no dedup pass needed).
> - Confirmed empirically: on an undercut pinion the fillet **radius** is monotone
>   (rho_form→rf) but the **angle** is NOT — near the form circle the trochoid
>   curls back toward the tooth (cutting under the flank). That curl is the
>   undercut; do not "fix" it.

## Scope
- **v1: external `gearContour` only.** Sharp-corner rack cutter (no tip radius).
- Internal gear (`internalGearContour`) is **out of scope** — a true internal
  fillet is cut by a *pinion-shaped (shaper)* cutter whose generation is
  epicyclic, not the rack-on-a-line motion here. Leave it simplified; follow-up.
- Tip-radius (C1-smooth) fillet is **v2** (documented below, not built).

## Constants (from m, z, alpha[rad]; match `gearMetrics`)
```
r  = m*z/2;  rb = r*cos(alpha);  ra = r + m;  rf = r - 1.25*m
halfTooth = PI/(2z);  pitch = 2*PI/z;  sigma = PI/z   // space-centre line
b  = 1.25*m                                  // corner depth; r - b = rf exactly
L  = PI*m/4 - 1.25*m*tan(alpha)              // corner lateral offset from space centre
                                             //   depends ONLY on m, alpha (= 1.3217 at m4,a20)
```

## Canonical trochoid (space-centre framing; parameter u = gear roll angle, rad)
```
X  = r - b              // = rf, constant radial line of the sharp corner
Lu = L - r*u            // corner lateral position; Lu = 0 at the deepest point
rho(u)        = sqrt(X*X + Lu*Lu)
aboutSigma(u) = atan2( X*sin(u) + Lu*cos(u),  X*cos(u) - Lu*sin(u) )
ang_lead(u)   = sigma - aboutSigma(u)   // LEADING (+) fillet, in the tooth-centre-relative frame
// trailing fillet of the same space is the mirror: sigma + aboutSigma(u)
```
- `u_bottom = L/r` → `Lu=0` → `rho = rf` **exactly** (verified ~1e-15, all gears).
- Fillet branch: sweep `u` from `u_form` **up to** `u_bottom` (rho **decreases**
  rho_form → rf). Only this branch (`u <= u_bottom`); the other side is the
  neighbour tooth. `rho` is monotone on this branch — reparametrize by rho for
  even sampling.
- Bottom angle (tooth-relative) = `sigma - L/r`. The two fillets bounding a space
  bottom at `sigma ± L/r` → a **flat root land at rf** of full width `2*L/r`
  centred on `sigma`. (Half-widths verified: 3.79°@z10 … 0.39°@z60, all > 0.)

## Undercut
- Condition: `z < 2*ha/(m*sin^2 alpha)` → full-depth `z < 2/sin^2(alpha)`.
  Thresholds: 17.10@20°, 31.90@14.5°, 11.20@25°.
- **Detect by geometry, not the integer formula** (z=18 is on the boundary):
  walk u down from `u_bottom`; for samples with `rho >= rb`, evaluate
  `g(u) = ang_lead(u) - psi(rho(u))`. **Undercut iff g changes sign** at some
  `rho_cross > rb` (a transversal CROSSING). Take the **largest** such
  `rho_cross` as `rho_form`, polish by bisection (residual ~1e-16).
  - Undercut: keep involute only for `rho in [rho_form, ra]`; discard the old
    involute between rb and rho_form; trochoid supplies `[rf, rho_form]`. The
    transition is a **genuine sharp notch** (slope break) — correct physics, do
    NOT smooth it.
  - Non-undercut (`rf < rb`): no crossing above rb → `rho_form := rb`. Fillet top
    reaches the involute origin; one ordinary edge closes a sub-degree gap. NOT
    C1 for a sharp corner (~40° at z=40) — acceptable in v1.
  - High tooth (`rf >= rb`, e.g. z=60): `rho_form := rf`, trochoid branch
    collapses to a point → **filletEmpty = true**, emit ZERO fillet points and
    fall back to flank-starts-at-rf + flat land.

## MANDATORY guards (each fires on a real PARAMS gear)
1. **Pitch-crossing clamp:** `rho_form = min(rho_form, r - 1e-6)`. The gear
   `m=6, z=8, alpha=14.5°` gives raw `rho_form = 24.194 > r = 24`; trimming above
   the pitch circle would break the `pi*m/2` thickness invariant. Clamp is
   mandatory (that gear is pathologically undercut; capping at r-eps is the safe
   degrade).
2. **filletEmpty** (`rf >= rb`): emit no trochoid points, else a zero-length-edge
   test fails (the rf→rf branch is a single point).
3. **Land collapse:** if `2*L/r <= eps`, emit a single rf vertex at `c + sigma`.

## Integration into `gearContour` (src/gears/involute.js)
Replace the two simplified blocks in the per-tooth loop (the
`if (rootR < rStart) push(rootR, c+psiBase)` radial drop AND the flat-root-arc
loop). Precompute once: `b`, `L`, `uBottom`, `rho_form` (+clamp), `filletEmpty`,
`halfLand = max(0, L/r)`. New per-tooth emission (CCW, c = i*pitch), flank start
radius becomes `rho_form` (not `rStart`):
1. **Trailing flank up:** involute `rho_form → ra`, angle `c - psi(rho)`.
2. **Tip arc:** unchanged (tipSteps=4, skip-first).
3. **Leading flank down:** `ra → rho_form`, angle `c + psi(rho)`, skip first (ra).
4. **Leading fillet down:** if `!filletEmpty`, sample trochoid `u_form → u_bottom`
   (K_FILLET≈6–8 steps, by rho), push `(rho(u), c + (sigma - aboutSigma(u)))`,
   descending `rho_form → rf`. De-dup the join at rho_form.
5. **Flat root land at rf:** `c+(sigma - L/r) → c+(sigma + L/r)` (landSteps≈3–5),
   stop ONE SHORT of the far end (next tooth's trailing fillet supplies climb-out).

### Invariants preserved (verified by an adversarial 240-gear sweep)
- Closed CCW (positive area). NOTE: the fillet **radius** is monotone (rho_form→rf)
  but the **angle is NOT** on an undercut pinion — near the form circle the trochoid
  curls back toward the tooth (cutting under the flank). That curl is the undercut.
- No zero-length edges (skip-first at tip, next-tooth handoff, flank↔fillet handoff,
  collapse land when `2L/r<eps`, filletEmpty for rf>=rb). Worst min-edge in the
  sweep was ~7e-3 (≫ 1e-6); no self-intersection on any of 240 gears.
- Within `[rf, ra]` (trochoid in `[rf, rho_form]`, involute in `[rho_form, ra]`).
- Pitch thickness `pi*m/2`: **the FLANK must own the rho_form vertex** (sampled
  down to it inclusive; the fillet emits interior points only). This matters under
  guard #1: when a severe undercut clamps `rho_form = r-eps`, the involute — not
  the fillet — owns the pitch circle, so `psi(r)=halfTooth` survives. ⚠️ The naive
  reading ("`rho_form < r` ⇒ thickness untouched") is FALSE: if the fillet owned
  rho_form, the flank↔fillet chord would cut across `r` at the narrower
  `filletLead` angle and thin the tooth (~11% on m4/z6/14.5). Verified ≤3e-6 rel
  error across all 240 gears after the fix.

## Test plan (test/gear.test.js / involute coverage)
- **Root reach:** min fillet rho == rf within 1e-6, all PARAMS.
- **Undercut present** for z<thresh (z=12@20, z=8@14.5 → rho_form>rb), **absent**
  above (z=40@20, z=60@25 → rho_form==max(rb,rf)); z=18 boundary: allow either.
- **Pitch clamp:** rho_form <= r for every gear; specifically m6/z8/14.5 clamped.
- **No zero-length edges** over the new layout (incl. flank↔fillet, fillet↔land).
- **Monotonic fillet radius** rf → rho_form (no fold/cusp).
- **Signed area > 0**, radii in `[0.2r, ra]`.
- **Tooth thickness at pitch == pi*m/2** (update the test's hardcoded perTooth slice).
- **Flat root land** of half-angle ~L/r exists, fillet bottoms straddle it.
- **Point count:** update the count test to the new perTooth (trimmed flanks + tip
  + K_FILLET + landSteps; filletEmpty → K_FILLET=0).

## Known churn / risks
- Two existing tests hardcode per-tooth point counts (the count test + the
  thickness-slice) tied to the OLD drop+flat-root layout — they MUST be updated in
  the same change.
- Do NOT assert C1 for the sharp-corner v1 (non-tangent by design); do NOT smooth
  the undercut notch.
- Branch selection: anchor at `u_bottom = L/r`, sweep one direction only.

## v2 (deferred): cutter tip radius rho_f
Replaces the sharp corner with the curve equidistant (inward offset rho_f) to the
sharp-corner trochoid: generate the trochoid of the arc centre at depth `b-rho_f`,
offset OUT by rho_f along its normal. Root bottoms rho_f shallower than rf, and the
fillet becomes genuinely C1-tangent to the flank (fixes the v1 sharp-corner join).

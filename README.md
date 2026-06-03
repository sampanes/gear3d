# gear3d

A 3D gear generator in the browser — like [geargenerator.com](https://geargenerator.com/),
but in 3D with CAD-style **middle-mouse orbit**. Build involute **spur / helical gear
trains**, external **Geneva drives**, **double-Geneva oscillators**, **internal
(ring) gears**, **planetary (epicyclic) gearsets**, and **bevel gear pairs**.
It also includes a kinematic **SATOR-square** mode — a 5×5 turning-letter wall
piece that reads upright again every 90°, built from those same primitives.

Built with [Three.js](https://threejs.org/) + [Vite](https://vitejs.dev/) +
[lil-gui](https://lil-gui.georgealways.com/).

## Run

```bash
npm install
npm run dev      # opens http://localhost:5173 with hot reload
```

```bash
npm run build    # static bundle in dist/
npm run preview  # serve the built bundle
```

```bash
npm test         # kinematics + involute-geometry unit tests (node:test, no deps)
```

## Controls

| Input | Action |
| --- | --- |
| **Middle-drag** | orbit the camera |
| Left / Right-drag | pan |
| Wheel | zoom |
| `F` | frame the current mechanism |
| `Space` | pause / resume |

Everything else lives in the top-right panel: pick the mechanism, set speed
(negative reverses), and tune each mechanism's parameters live. The **pitch/base
circles** toggle overlays each gear's pitch (solid) and base (dashed) circle for
teaching; the overlay lines are excluded from STL export.

**Export** — the panel's **Export (STL)** folder downloads the current mechanism
as a single binary STL, ready for slicing and 3D printing. Model units are
millimetres, and the **scale ×** field applies one uniform multiplier (`1` = 1 mm)
to the whole export. Because the entire assembly exports together, every part
stays matched to every other — set the scale once and you never have to resize
parts individually.

## Mechanisms

### Spur train
A chain of involute spur gears. Each gear meshes with the previous one at the
correct center distance `(z₁ + z₂)·module/2`; speeds telescope as
`ωᵢ/ω₀ = (−1)ⁱ·z₀/zᵢ`, and the tooth phase is solved so teeth interlock.
Tune gear count, teeth per gear, module, pressure angle, thickness, and the
**helix angle** — `0` is a straight spur gear; a non-zero angle twists the
extrusion into helical gears, with neighbours taking opposite hands so they
still mesh.

### Geneva drive
A driver wheel with one crank pin indexes an *n*-slot star wheel, advancing it
`360/n` per revolution and locking it in between. The slot/crank geometry uses
the standard relations (`crank = c·sin(π/n)`, slot mouth `= c·cos(π/n)`) so the
pin enters and leaves each slot tangentially — no shock. Between indexes a
**locking disc** on the driver rides in a concave pocket on the star's rim —
the disc's wedge gap opens to clear the slot only while indexing — so the star
is held positively during dwell.

### Double Geneva (oscillator)
Two coaxial wheels **counter-rotate**, each carrying one crank pin. As a pin
reaches the top of its orbit it enters a **radial slot** in the output rocker
and, sliding within it, swings the rocker to one extreme; half a revolution
later the other pin (on the counter-rotating wheel) sweeps it back — a genuine
pin-in-slot drive that **toggles back and forth in place** with a dwell at each
end. The engagement is a Geneva engagement (`a/H = sin(amp)`), so the rocker
reaches its extremes with zero velocity and the dwell follows from the swing
amplitude. Tune the swing and the size.

### Internal gear
A pinion (driver) meshing **inside** a ring (internal) gear. Internal pairs turn
the **same** direction, and the ring turns slower by `z_pinion / z_ring`; the
pinion sits at center distance `(z_ring − z_pinion)·module/2` so the pitch
circles touch. The ring's teeth point inward — addendum and dedendum swap, so
the tip is the inner radius and the root opens out into the rim. Tune pinion and
ring teeth, module, pressure angle, and thickness.

### Planetary (epicyclic)
A central **sun**, a set of **planets** on a rotating **carrier**, and a
surrounding internal **ring** gear (`zRing = zSun + 2·zPlanet`). Choose which
member is **fixed**: `ring` (classic reduction — sun in, carrier out), `carrier`
(sun in, ring out, reversed), or `sun` (carrier in, ring out). The planets mesh
with the sun and the ring at the same time; equal spacing requires
`(zSun + zRing)` to be divisible by the planet count (the readout flags it if
not). Tune sun and planet teeth, planet count, module, pressure angle, and
thickness.

### Bevel pair
Two gears on intersecting shafts (90° by default). Each gear's pitch-cone
half-angle comes from the standard relation `tan(γ_A) = sin(Σ)/(z_B/z_A + cos(Σ))`
with `γ_A + γ_B = Σ` (the shaft angle), and the gears counter-rotate about their
own axes at `ω_B/ω_A = z_A/z_B`. The teeth use a Tredgold (back-cone)
approximation — the spur profile extruded and tapered toward the shared apex —
which prints and teaches well without true spherical-involute geometry. Tune
pinion and gear teeth, module, pressure angle, and face width.

### SATOR square
A 5×5 board carrying the Latin SATOR word square, turned on the wall. The whole
board rotates, and each tile counter-rotates relative to it so the square reads
upright again at every 90° — most letters simply stay upright (a 1:1 idler), the
four **O** tiles flip upright↔inverted (a double-Geneva with `{0, π}` dwells),
the centre **N** is the fixed hub, and one tile spins (a fixed-sun planetary, 4
turns per board turn) for variety. The per-tile motion is the closed-form
`kinematics.satorTileAngle`; STL export uses `mechanism.printable`, so the block
letters (decor) are excluded and printed separately. Tune the cell size and
board thickness.

## Layout

```
src/
  main.js              loop, mode switching, GUI wiring
  scene.js             renderer, lights, studio environment, shadow wall, grid, OrbitControls (middle = orbit)
  ui.js                lil-gui panel
  kinematics.js        pure motion math (spur, Geneva, double-Geneva, internal, planetary, bevel)
  math.js              shared helpers
  parts.js             materials + reusable part builders
  overlays.js          educational pitch/base circle overlays
  export.js            binary STL export (whole mechanism, uniform mm scale)
  gears/
    involute.js        involute tooth profile
    gear.js            extruded gear mesh
  mechanisms/
    spurTrain.js
    geneva.js
    doubleGeneva.js
    internalGear.js
    planetary.js
    bevelGears.js
```

## Docs

- [docs/roadmap.md](docs/roadmap.md) — project goal and feature status.
- [docs/sator-square.md](docs/sator-square.md) — design for a planned SATOR-square mode.

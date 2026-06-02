# gear3d

A 3D gear generator in the browser — like [geargenerator.com](https://geargenerator.com/),
but in 3D with CAD-style **middle-mouse orbit**. Build involute **spur gear
trains**, external **Geneva drives**, and **double-Geneva oscillators**.

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
(negative reverses), and tune each mechanism's parameters live.

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
pin enters and leaves each slot tangentially — no shock.

### Double Geneva (oscillator)
Two coaxial wheels are joined and turn together, each carrying one pin 180° out
of phase. A single lever pivoted above the central joint is driven to one
extreme by the first wheel's pin, then half a revolution later back the other
way by the second wheel's pin — so it **toggles back and forth in place**, with
a short dwell at each end. Tune the swing, the push/dwell split, and the size.

### Internal gear
A pinion (driver) meshing **inside** a ring (internal) gear. Internal pairs turn
the **same** direction, and the ring turns slower by `z_pinion / z_ring`; the
pinion sits at center distance `(z_ring − z_pinion)·module/2` so the pitch
circles touch. The ring's teeth point inward — addendum and dedendum swap, so
the tip is the inner radius and the root opens out into the rim. Tune pinion and
ring teeth, module, pressure angle, and thickness.

## Layout

```
src/
  main.js              loop, mode switching, GUI wiring
  scene.js             renderer, lights, grid, OrbitControls (middle = orbit)
  ui.js                lil-gui panel
  kinematics.js        pure motion math (Geneva, double-Geneva, spur ratios)
  math.js              shared helpers
  parts.js             materials + reusable part builders
  gears/
    involute.js        involute tooth profile
    gear.js            extruded gear mesh
  mechanisms/
    spurTrain.js
    geneva.js
    doubleGeneva.js
    internalGear.js
```

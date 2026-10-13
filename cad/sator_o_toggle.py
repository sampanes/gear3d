"""SATOR O toggles for the hand-built board (run inside Blender).

build_o_toggles() -- both toggle units plus the two P letter gears that drive them
layout(unit)      -- where every axis of a unit goes (plain math, no Blender needed)
check(unit)       -- clearance report: letter centers kept clear, no unintended overlaps

One double-Geneva toggle drives two O's. It sits on the corner point between them; the
P cell next to both O's feeds it. Unit "NE" serves the O's at R1C4 and R2C5 (fed from
P R2C4); unit "SW" is the same unit turned a half turn about the middle gear (O's at R5C2
and R4C1, fed from P R4C2), so both units use the same parts.

Train (all module 2.25, the board's gears):
  P 64T letter gear (bottom layer, meshes its 96T, turns -1 x board like every letter)
  -> 54T on P's shaft -> 27T input on driver A's shaft: A turns 2x per board turn
  -> A 64T meshes B 64T (counter-rotating twin drivers, 144 apart) -- each carries a pin
  -> the star between them (swing 90, c 72) toggles +90 / -90
  -> 56T on the star's shaft meshes both O 56T gears 1:1: every board quarter turn each
     O clicks a quarter, so it rests upright or upside down.
The O's are 127.3 from the star axis, which no whole tooth count fits at module 2.25,
so the three 56T carry a profile shift (OUT_SHIFT).

A and B sit on the grid line through the star (not on the diagonal), so no part covers a
letter center: every letter's axis stays open to the sky.

The unit hangs below the board's bottom layer (z -12), top down: 56T output gears, the
star (with the drivers' locking bosses and pins), the A/B gears, the input pair. The O
letters reach the letter plane on their own shafts; the board's layers are unchanged.
"""

import importlib.util
import math
import os

import bmesh
import bpy

_HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(_HERE, name + ".py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


PITCH = 180.0  # letter grid, see docs/sator-hand-build.md
M = 2.25
SWING = 90.0
C = 72.0  # star axis to driver axis = pitch radius of the 64T drivers (they mesh at the star axis)
LAND = 7.8
DRIVER_T, INPUT_T, P_GEAR_T, OUT_T = 64, 27, 54, 56
BEARING_R = 10.95  # 21.9 hole, the 22 mm bearings
GEAR_H = 8.0
# layer centers (gear height 8, 1 mm air between layers); the board's bottom layer ends at z -12
Z_OUT = -17.0       # 56T output gears: -21 .. -13
Z_STAR_BASE = -31.0  # top of the A/B gears; star -30 .. -22 (1 mm air), bosses and pins stand here
Z_DRIVER = -35.0    # A/B 64T: -39 .. -31
Z_INPUT = -44.0     # 27T + 54T: -48 .. -40
TEMPLATE = "Gear_Letter_64T_N2"  # far (bottom layer) letter gear, cloned for the P cells
UNITS = {
    "NE": dict(sign=1, p_cell=(2, 4), o_cells=((1, 4), (2, 5)), big="Gear_96T", big_dir=0.0),
    "SW": dict(sign=-1, p_cell=(4, 2), o_cells=((5, 2), (4, 1)), big="Gear_96T_W", big_dir=270.0),
}
CLEAR = 12.0  # min gap from a part's edge to any other letter's axis (shaft + bearing)
# steel drive pins pressed through the A/B gears; they stand up past the gear top into the
# star layer and stop PIN_TOP_GAP below the star's top face
PIN_D = 4.0
PIN_FIT = 1.025  # hole = PIN_D * PIN_FIT (same press fit as geneva.py's pin holes)
PIN_TOP_GAP = 0.3
# the star's 56T only ever swings 0..SWING, so it keeps teeth just on the two arcs that pass
# its O meshes (plus SECTOR_MARGIN teeth each end); S-curved arms tie each arc to the hub
SECTOR_MARGIN = 2
ARMS_PER_ARC = 2   # 2: one near each end of an arc; 1: one at its middle
HUB_R = 19.0       # solid hub around the bore
RIM_T = 6.0        # arc rim under the tooth roots
ARM_W = 9.0        # arm width (flares near both ends)
ARM_SWEEP = 70.0   # deg the arm curls between rim and hub


def cell_xy(row, col):
    return ((col - 3) * PITCH, (3 - row) * PITCH)


def _inv(a):
    return math.tan(a) - a


def shift_for(center, teeth_sum, pressure_deg=25.0):
    """Total profile shift x1 + x2 that makes a pair mesh tight at `center`."""
    a = math.radians(pressure_deg)
    aw = math.acos(M * teeth_sum / 2 / center * math.cos(a))
    return (_inv(aw) - _inv(a)) * teeth_sum / (2 * math.tan(a))


OUT_CENTER = math.hypot(PITCH / 2, PITCH / 2)  # star axis to each O axis
OUT_SHIFT = shift_for(OUT_CENTER, 2 * OUT_T) / 2


def layout(unit):
    """Axes of one unit: dict of name -> (x, y), plus the driver angles seen from the star."""
    u = UNITS[unit]
    o1, o2 = (cell_xy(*rc) for rc in u["o_cells"])
    px, py = cell_xy(*u["p_cell"])
    sx, sy = (o1[0] + o2[0]) / 2, (o1[1] + o2[1]) / 2
    # A: C from the star and (27 + 54) * M / 2 from P. Both answers sit (within 0.6 deg) on a
    # grid line through the star; take the one below it for NE (its half turn for SW)
    dap = (INPUT_T + P_GEAR_T) * M / 2
    d = math.hypot(px - sx, py - sy)
    a = (C * C - dap * dap + d * d) / (2 * d)
    h = math.sqrt(C * C - a * a)
    ux, uy = (px - sx) / d, (py - sy) / d
    cands = [(sx + a * ux - s * h * uy, sy + a * uy + s * h * ux) for s in (1, -1)]
    ax, ay = min(cands, key=lambda p: u["sign"] * (p[1] - sy))  # NE: A below the star
    bx, by = 2 * sx - ax, 2 * sy - ay
    a_deg = math.degrees(math.atan2(ay - sy, ax - sx)) % 360
    return dict(star=(sx, sy), A=(ax, ay), B=(bx, by), P=(px, py), O1=o1, O2=o2,
                a_deg=a_deg, b_deg=(a_deg + 180) % 360)


def _names(unit):
    u = UNITS[unit]
    (r1, c1), (r2, c2) = u["o_cells"]
    pr, pc = u["p_cell"]
    return dict(col=f"O Toggle {unit}", toggle=f"Toggle_{unit}", A=f"Gear_Toggle_64T_{unit}_A",
                B=f"Gear_Toggle_64T_{unit}_B", input=f"Gear_Input_27T_{unit}", p54=f"Gear_P_54T_{unit}",
                out=f"Gear_Star_56T_{unit}", O1=f"Gear_O_56T_R{r1}C{c1}", O2=f"Gear_O_56T_R{r2}C{c2}",
                P=f"Gear_Letter_64T_R{pr}C{pc}")


def _remove(ob):
    for o in [ob] + list(ob.children_recursive):
        me = o.data if o.type == "MESH" else None
        bpy.data.objects.remove(o)
        if me is not None and me.users == 0:
            bpy.data.meshes.remove(me)


def _clone_gear(src, name):
    """Copy a gear with its children (crossings, rim dot cutter); Booleans follow the copies."""
    new = src.copy()
    new.data = src.data.copy()
    new.name = name
    for c in src.users_collection:
        c.objects.link(new)
    remap = {}
    for ch in src.children:
        c2 = ch.copy()
        if ch.data is not None:
            c2.data = ch.data.copy()
        c2.name = ch.name.replace(src.name, name)
        for c in ch.users_collection:
            c.objects.link(c2)
        c2.parent = new
        c2.matrix_parent_inverse = ch.matrix_parent_inverse.copy()
        c2.hide_set(ch.hide_get())
        remap[ch] = c2
    for mod in new.modifiers:
        if getattr(mod, "object", None) in remap:
            mod.object = remap[mod.object]
    return new


def _cylinder(name, r, z0, z1, n=48):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = [[bm.verts.new((r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), z))
              for i in range(n)] for z in (z0, z1)]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((rings[0][i], rings[0][j], rings[1][j], rings[1][i]))
    bm.faces.new(rings[1])
    bm.faces.new(rings[0][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    return me


def _steel_pin(gear, drive, d, star_xy, star_top, name):
    """Press-fit hole through a driver gear at the pin position (t = 0), plus a steel pin
    stand-in (reference only, not exported) from the gear bottom to just under the star top."""
    px, py = drive.pin_world(d, 0, 0.0)
    wx, wy = star_xy[0] + px, star_xy[1] + py
    z0 = gear.location.z - GEAR_H / 2
    cut = bpy.data.objects.new(f"{gear.name} Pin Hole", _cylinder("pin hole", PIN_D * PIN_FIT / 2, -GEAR_H, GEAR_H))
    for c in gear.users_collection:
        c.objects.link(cut)
    cut.parent = gear  # gear-local position: undo the gear's mesh rotation
    dx, dy, rz = wx - gear.location.x, wy - gear.location.y, gear.rotation_euler.z
    cut.location = (dx * math.cos(rz) + dy * math.sin(rz), -dx * math.sin(rz) + dy * math.cos(rz), 0.0)
    cut.display_type, cut.hide_render = "WIRE", True
    cut.hide_set(True)
    mod = gear.modifiers.new("Pin Hole", "BOOLEAN")
    mod.operation, mod.solver, mod.object = "DIFFERENCE", "EXACT", cut
    pin = bpy.data.objects.new(name, _cylinder(name, PIN_D / 2, z0, star_top - PIN_TOP_GAP))
    for c in gear.users_collection:
        c.objects.link(pin)
    pin.location = (wx, wy, 0.0)
    pin["reference"] = "steel pin stand-in, not printed"
    return pin


def _sector_windows(gear, mesh_dirs):
    """Gear-local (r, theta) outlines of the windows to remove: everything but the hub, the
    toothed arcs that ever pass a mesh in mesh_dirs (world rad), and one arm per arc."""
    sg = _load("sator_gears")
    p = sg.props(gear)
    pitch = 2 * math.pi / p.teeth
    rz = gear.rotation_euler.z
    ph = sg.tooth_phase(gear) - rz  # local angle of a tooth center
    r_rim, r_out = sg.root_radius(p) - RIM_T, sg.tip_radius(p) + 3.0
    swing, margin = math.radians(SWING), SECTOR_MARGIN * pitch
    arcs = []
    for d in mesh_dirs:
        # the star turns +0..swing, so local angles d - swing .. d pass the mesh; widen each end
        # out to the next tooth-space center so no tooth is cut
        lo, hi = d - rz - swing - margin, d - rz + margin
        a0 = ph + (math.floor((lo - ph) / pitch - 0.5) + 0.5) * pitch
        a1 = ph + (math.ceil((hi - ph) / pitch - 0.5) + 0.5) * pitch
        w = a1 - a0
        a0 %= 2 * math.pi
        arcs.append((a0, a0 + w))
    arcs.sort()
    sweep = math.radians(ARM_SWEEP)

    def arm(mid, r):
        """Arm center angle and angular half width at radius r (smoothstep curl, flared ends)."""
        u = (r - HUB_R) / (r_rim - HUB_R)
        s = 3 * u * u - 2 * u ** 3
        th = mid + sweep * (1 - s)
        slope = sweep * (6 * u - 6 * u * u) / (r_rim - HUB_R)  # -d(theta)/dr
        hw = ARM_W / 2 + 2.5 * (math.exp(-(r - HUB_R) / 2.5) + math.exp(-(r_rim - r) / 2.5))
        return th, hw * math.hypot(1, r * slope) / r

    def arc(r, t0, t1):
        n = max(2, int(abs(t1 - t0) / math.radians(1.0)) + 1)
        return [(r, t0 + (t1 - t0) * i / (n - 1)) for i in range(n)]

    gaps = []  # toothless spans, each also one turn later so a window can wrap past 2 pi
    for i, (a0, a1) in enumerate(arcs):
        n0 = arcs[(i + 1) % len(arcs)][0] + (2 * math.pi if i + 1 == len(arcs) else 0.0)
        if n0 <= a1:
            raise ValueError("toothed arcs overlap: the gear needs all its teeth")
        gaps += [(a1, n0), (a1 + 2 * math.pi, n0 + 2 * math.pi)]
    # arm rim ends: one per arc at its middle, or two set in from the arc ends (edge 1.5 in)
    inset = (arm(0.0, r_rim)[1] * r_rim + 1.5) / r_rim
    rims = sorted(m for a0, a1 in arcs
                  for m in (((a0 + a1) / 2,) if ARMS_PER_ARC == 1 else (a0 + inset, a1 - inset)))

    rs = [HUB_R + (r_rim - HUB_R) * i / 40 for i in range(41)]
    windows = []
    for k, m0 in enumerate(rims):
        m1 = rims[(k + 1) % len(rims)] + (2 * math.pi if k + 1 == len(rims) else 0.0)
        t, te = arm(m0, r_rim)[0] + arm(m0, r_rim)[1], arm(m1, r_rim)[0] - arm(m1, r_rim)[1]
        if te <= t:
            raise ValueError("arms overlap: fewer arms or a narrower ARM_W")
        loop = [(r, arm(m0, r)[0] + arm(m0, r)[1]) for r in rs]
        for g0, g1 in sorted(gaps):  # open the rim out past the tips across each toothless span
            if t < g0 and g1 < te:
                loop += arc(r_rim, t, g0)[1:] + [(r_out, g0)] + arc(r_out, g0, g1)[1:] + [(r_rim, g1)]
                t = g1
        loop += arc(r_rim, t, te)[1:]
        loop += [(r, arm(m1, r)[0] - arm(m1, r)[1]) for r in reversed(rs)][1:]
        loop += arc(HUB_R, loop[-1][1], loop[0][1])[1:-1]
        windows.append([(r * math.cos(t), r * math.sin(t)) for r, t in loop])
    return windows, arcs


def _sector_cut(gear, mesh_dirs):
    """Boolean the gear down to its toothed arcs, arms and hub (cutter parented, hidden)."""
    windows, arcs = _sector_windows(gear, mesh_dirs)
    me = bpy.data.meshes.new(f"{gear.name} Sector Cutter")
    bm = bmesh.new()
    for loop in windows:
        lo = [bm.verts.new((x, y, -GEAR_H - 1)) for x, y in loop]
        hi = [bm.verts.new((x, y, GEAR_H + 1)) for x, y in loop]
        n = len(loop)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
        bm.faces.new(hi)
        bm.faces.new(lo[::-1])
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    cut = bpy.data.objects.new(me.name, me)
    for c in gear.users_collection:
        c.objects.link(cut)
    cut.parent = gear
    cut.display_type, cut.hide_render = "WIRE", True
    cut.hide_set(True)
    mod = gear.modifiers.new("Sector Cut", "BOOLEAN")
    mod.operation, mod.solver, mod.object = "DIFFERENCE", "EXACT", cut
    return [(round(math.degrees(a0), 2), round(math.degrees(a1), 2)) for a0, a1 in arcs]


def build_unit(unit):
    sg, gv = _load("sator_gears"), _load("geneva")
    gm = gv.gm
    u, L, n = UNITS[unit], layout(unit), _names(unit)
    if n["P"] in bpy.data.objects:
        _remove(bpy.data.objects[n["P"]])
    old = bpy.data.collections.get(n["col"])
    if old is not None:
        for name in [ob.name for ob in old.objects if ob.parent is None]:
            _remove(bpy.data.objects[name])
    template = bpy.data.objects[TEMPLATE]

    # P letter gear: a far-letter clone meshing its 96T (bottom layer)
    p_gear = _clone_gear(template, n["P"])
    sg.mesh_with(bpy.data.objects[u["big"]], p_gear, u["big_dir"], -8.0)

    # the toggle: star + the two drivers' locking bosses and pins (standing on the A/B gears)
    drive = gm.toggle(SWING, C, a_deg=L["a_deg"], b_deg=L["b_deg"], land=LAND, bore_d=2 * BEARING_R,
                      pin_d=PIN_D)
    root, star, drivers, result = gv.build(drive, n["toggle"], location=(*L["star"], Z_STAR_BASE),
                                           plate_t=0.0, pin="steel", collection=n["col"])
    star_top = Z_STAR_BASE + gv.BUILD_DEFAULTS["z_gap"] + gv.BUILD_DEFAULTS["thick"]

    def spur(key, teeth, xy, z, shift=None):
        g = sg.new_spur(n[key], teeth, GEAR_H, template, n["col"], bore_r=BEARING_R, shift=shift)
        g.location = (*xy, z)
        return g

    ga = spur("A", DRIVER_T, L["A"], Z_DRIVER)
    gb = spur("B", DRIVER_T, L["B"], Z_DRIVER)
    sg.mesh_with(ga, gb, L["b_deg"], Z_DRIVER)
    for g, d, side in ((ga, drive.drivers[0], "A"), (gb, drive.drivers[1], "B")):
        _steel_pin(g, drive, d, L["star"], star_top, f"{n['col']} Pin {side}")

    gi = spur("input", INPUT_T, L["A"], Z_INPUT)
    g54 = spur("p54", P_GEAR_T, L["P"], Z_INPUT)
    sg.mesh_with(gi, g54, math.degrees(math.atan2(L["P"][1] - L["A"][1], L["P"][0] - L["A"][0])), Z_INPUT)

    go = spur("out", OUT_T, L["star"], Z_OUT, shift=OUT_SHIFT)
    for key in ("O1", "O2"):
        g = spur(key, OUT_T, L[key], Z_OUT, shift=OUT_SHIFT)
        sg.mesh_with(go, g, math.degrees(math.atan2(L[key][1] - L["star"][1], L[key][0] - L["star"][0])), Z_OUT)
        g.location = (*L[key], Z_OUT)  # mesh_with spaces by pitch radii; the shift makes it OUT_CENTER
    result["sectors"] = _sector_cut(go, [math.atan2(L[k][1] - L["star"][1], L[k][0] - L["star"][0])
                                         for k in ("O1", "O2")])
    return result


def _footprints(unit):
    """(name, axis xy, radius, z0, z1) for every part of a unit plus its P gear chain."""
    n, L = _names(unit), layout(unit)
    dg = bpy.context.evaluated_depsgraph_get()
    out = []
    names = [n[k] for k in ("A", "B", "input", "p54", "out", "O1", "O2", "P")]
    names += [o.name for o in bpy.data.objects[n["toggle"]].children]
    for name in names:
        ob = bpy.data.objects[name]
        me = ob.evaluated_get(dg).to_mesh()
        mw = ob.matrix_world
        ax = mw.translation
        pts = [mw @ v.co for v in me.vertices]
        r = max(math.hypot(p.x - ax.x, p.y - ax.y) for p in pts)
        z0, z1 = min(p.z for p in pts), max(p.z for p in pts)
        ob.evaluated_get(dg).to_mesh_clear()
        out.append((name, (ax.x, ax.y), r, z0, z1))
    return out


def check(unit):
    """Smallest gap from each part to any letter axis other than its own, and overlaps
    between parts sharing a z range that are not meant to mesh."""
    n = _names(unit)
    centers = [cell_xy(r, c) for r in range(1, 6) for c in range(1, 6)]
    parts = _footprints(unit)
    report = {"letter_gap": {}, "overlaps": []}
    for name, (x, y), r, z0, z1 in parts:
        gaps = [math.hypot(cx - x, cy - y) - r for cx, cy in centers if math.hypot(cx - x, cy - y) > 1.0]
        report["letter_gap"][name] = round(min(gaps), 2)
    meshing = {frozenset(p) for p in ((n["A"], n["B"]), (n["input"], n["p54"]), (n["out"], n["O1"]),
                                      (n["out"], n["O2"]))}
    toggle = {o.name for o in bpy.data.objects[n["toggle"]].children}
    for i, (na, pa, ra, a0, a1) in enumerate(parts):
        for nb, pb, rb, b0, b1 in parts[i + 1:]:
            if min(a1, b1) - max(a0, b0) <= 0.01:
                continue
            if frozenset((na, nb)) in meshing or (na in toggle and nb in toggle):
                continue
            gap = math.hypot(pa[0] - pb[0], pa[1] - pb[1]) - ra - rb
            if gap < 1.0:
                report["overlaps"].append((na, nb, round(gap, 2)))
    report["min_letter_gap"] = min(report["letter_gap"].values())
    return report


def build_o_toggles(save=False):
    results = {}
    for unit in UNITS:
        res = build_unit(unit)
        bpy.context.view_layer.update()
        out = bpy.data.objects[_names(unit)["out"]]
        results[unit] = dict(geneva=res["summary"], locks=res["locks"], non_manifold=res["non_manifold"],
                             sectors=res["sectors"], out_non_manifold=_load("geneva")._non_manifold(out),
                             check=check(unit))
    if save:
        bpy.ops.wm.save_mainfile()
    return results

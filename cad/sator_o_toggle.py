"""SATOR O toggles for the hand-built board (run inside Blender).

build_o_toggles() -- both toggle units plus the two P letter gears that drive them
layout(unit)      -- where every axis of a unit goes (plain math, no Blender needed)
check(unit)       -- clearance report: letter centers kept clear, no unintended overlaps
export_p_stack(unit) -- the P gear, its 54T and the tube between them as one STL

One double-Geneva toggle drives two O's. It sits on the corner point between them; the
P cell next to both O's feeds it. Unit "NE" serves the O's at R1C4 and R2C5 (fed from
P R2C4); unit "SW" is the same unit turned a half turn about the middle gear (O's at R5C2
and R4C1, fed from P R4C2), so both units use the same parts.

Train (all module 2.25, the board's gears):
  P 64T letter gear (bottom layer, meshes its 96T, turns -1 x board like every letter)
  -> 54T on P's shaft (P gear, tube and 54T print as one part) -> 27T input on driver
     A's shaft: A turns 2x per board turn
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
# P stack: the P letter gear, the 54T under it and a tube between them print as ONE part
# (supports under the P gear). A 22 mm bearing (608: 8 x 22 x 7) presses into each outer
# face; the threaded rod runs through the tube. The tube clears driver A's tooth tips, which
# pass 16.9 from P's axis.
BEARING_W = 7.0     # bearing seat depth in each outer face
ROD_HOLE_D = 8.6    # M8 threaded rod clearance
RELIEF_D = 16.0     # shallow counterbore under each seat: the shoulder misses the inner race
RELIEF_H = 0.6
TUBE_EMBED = 1.5    # how far the tube wall reaches into the 54T's hub beside the seat
# the tube is a little carved column: capital (abacus band + echinus cushion, never steeper
# than 50 deg so it prints unsupported) under the P gear, a bead at the neck, a fluted shaft
# that narrows toward its middle, an Attic base (torus, scotia, torus) standing on the 54T
TUBE_R = 14.5       # widest point in driver A's height band (the lower torus): 2.4 from A's tips
CAP_R = 20.5        # abacus, reaching up into the P gear's hub (r 22)
SHAFT_R = 12.5      # shaft radius at its ends
WAIST_R = 11.0      # ... at mid-height
FLUTES = 12
FLUTE_D = 1.1       # groove depth (fillets between the grooves stay at the shaft radius)
FLUTE_FILL = 0.75   # share of each flute pitch that is groove
LEAF_D = 1.2        # depth of the flutes carried up the echinus (they widen with it, like leaves)
# crossings (cad/crossings.py) for the unit's gears: (style, count, settings). The P letter
# gear is mostly window (it sits on top of its stack, over the 54T) with a big hub for the
# column's capital; the 54T under it carries the far letters' ringed x5. The O gears sit on top
# of the unit (1 step, round windows under the O's); the A/B drivers carry the locking boss on
# a solid hub (r 43 > boss 40.4, full height so the boss sits flat) and a spoke turned onto the
# steel pin. The 27T has no room inside its roots for crossings and gets rim dots only.
DECOR = {
    "P": ("scurve", 4, dict(SPOKE_W=6.0, LAYERS=1, BASE_T=3.5, STEP_T=2.0, STEP_INSET=1.25,
                            RIM_TEETH=64, HUB_MIN_R=22.0)),
    "O": ("holes", 6, dict(SPOKE_W=6.0, LAYERS=1, BASE_T=3.5, STEP_T=2.0, STEP_INSET=1.25, RIM_TEETH=OUT_T)),
    "p54": ("ringed", 5, dict(SPOKE_W=7.0, LAYERS=2, BASE_T=3.0, STEP_T=1.75, STEP_INSET=1.0,
                              RIM_TEETH=P_GEAR_T, HUB_MIN_R=18.0)),
    "driver": ("straight", 8, dict(SPOKE_W=9.0, HUB_MIN_R=43.0)),
}


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


def _flute(a):
    """0..1 groove depth at angle a: round-bottomed grooves with flat fillets between."""
    u = (a * FLUTES / (2 * math.pi)) % 1.0
    v = (u - 0.5) / (FLUTE_FILL / 2)
    return (1 - v * v) ** 0.6 if abs(v) < 1 else 0.0


def _revolve(name, profile, n=96):
    """Closed mesh from turning an (r, z) loop (r > 0) once around the z axis. A point given
    as (r, z, w) is fluted: its radius drops by w * _flute(angle)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    angles = [2 * math.pi * i / n for i in range(n)]
    rings = []
    for p in profile:
        r, z, w = p if len(p) == 3 else (*p, 0.0)
        rings.append([bm.verts.new(((r - w * _flute(a)) * math.cos(a), (r - w * _flute(a)) * math.sin(a), z))
                      for a in angles])
    for a, b in zip(rings, rings[1:] + rings[:1]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    return me


def _arc(cr, cz, rad, a0, a1, n=8):
    """(r, z) points on a circle in the profile plane, a0 -> a1 degrees (0 = outward)."""
    return [(cr + rad * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cz + rad * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def _column(z_top, z_bot):
    """Outer (r, z[, flute w]) profile of the column, top (under the P gear) to bottom (on the
    54T): abacus, echinus, neck bead, fluted shaft, Attic base."""
    pts = [(CAP_R, z_top - 1.0)]                       # abacus band
    neck = SHAFT_R + 0.5
    h = CAP_R - neck                                   # echinus: 45 deg on average
    for i in range(1, 25):                             # convex cushion, 39 deg at top, 50 at foot,
        s = 1 - i / 24                                 # the flutes carried up it as leaves
        pts.append((neck + h * (1.19 * s - 0.19 * s * s), z_top - 1.0 - h * (1 - s),
                    LEAF_D * max(0.0, math.sin(math.pi * min(1.0, s / 0.85))) ** 0.7))
    z = z_top - 1.0 - h
    pts.append((neck, z - 0.3))
    pts += _arc(neck, z - 1.1, 0.8, 90, -90)[1:]       # astragal bead
    s_top, s_bot = z - 2.4, z_bot + 5.1                # shaft ends (chamfer above, base below)
    end = 1.2                                          # flutes end in a round, this long
    n = max(8, int((s_top - s_bot) / 0.25))
    for i in range(n + 1):
        zz = s_top - (s_top - s_bot) * i / n
        r = SHAFT_R - (SHAFT_R - WAIST_R) * math.sin(math.pi * i / n) ** 2
        d = min(zz - (s_bot + 0.6), (s_top - 0.6) - zz)  # distance inside the fluted length
        w = FLUTE_D * math.sqrt(max(0.0, 1 - max(0.0, (end - d) / end) ** 2)) if d > 0 else 0.0
        pts.append((r, zz, w))
    pts += _arc(SHAFT_R, s_bot - 0.6, 0.6, 90, -90)[1:]  # upper torus
    pts += [(SHAFT_R - 0.3, s_bot - 1.5), (SHAFT_R - 0.45, s_bot - 1.85),  # scotia
            (SHAFT_R - 0.3, s_bot - 2.2), (SHAFT_R + 0.1, s_bot - 2.45)]
    pts += _arc(TUBE_R - 1.2, z_bot + 1.3, 1.2, 120, -45)[1:]  # lower torus, widest TUBE_R
    return pts


def _p_tube(p_gear, g54):
    """Column joining the P letter gear to the 54T under it (one printed part).

    Each gear's crossings keep their 21.9 bearing hole; the column plugs it below the outer
    BEARING_W, so the bearing sits on the column's end (a RELIEF_D counterbore keeps the inner
    race clear) and the rod runs through ROD_HOLE_D. The capital spreads into P's hub; the
    base stays within TUBE_R, since driver A turns just above the 54T."""
    p_top, p_bot = p_gear.location.z + GEAR_H / 2, p_gear.location.z - GEAR_H / 2
    g_top = g54.location.z + GEAR_H / 2
    f_top = p_top - BEARING_W           # top seat floor
    f_bot = g54.location.z - GEAR_H / 2 + BEARING_W  # bottom seat floor
    seat, relief, rod = BEARING_R + 0.3, RELIEF_D / 2, ROD_HOLE_D / 2
    col = _column(p_bot, g_top)
    foot = col[-1][0]
    prof = ([(relief, f_top), (CAP_R, f_top)] + col
            + [(foot, f_bot - TUBE_EMBED), (seat, f_bot - TUBE_EMBED), (seat, f_bot), (relief, f_bot),
               (relief, f_bot + RELIEF_H), (rod, f_bot + RELIEF_H), (rod, f_top - RELIEF_H),
               (relief, f_top - RELIEF_H)])
    z0 = p_gear.location.z
    name = f"{p_gear.name} Tube"
    tube = bpy.data.objects.new(name, _revolve(name, [(p[0], p[1] - z0, *p[2:]) for p in prof],
                                               n=FLUTES * 24))
    for c in p_gear.users_collection:
        c.objects.link(tube)
    tube.parent = p_gear  # same axis and z origin as the gear
    return tube


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
    # the pin sits inside the bore of a gear with crossings: turn a spoke onto it, cut it there
    target = bpy.data.objects.get(f"{gear.name} Crossings") or gear
    if target is not gear:
        target.rotation_euler.z = math.atan2(cut.location.y, cut.location.x)
    mod = target.modifiers.new("Pin Hole", "BOOLEAN")
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

    def decorate(g, decor):
        style, count, settings = DECOR[decor]
        bpy.context.view_layer.update()
        _load("crossings").build(g, style, count, BEARING_HOLE_D=2 * BEARING_R, **settings)
        sg.add_rim_dots(g)

    # P letter gear: a far-letter clone meshing its 96T (bottom layer), re-decorated
    p_gear = _clone_gear(template, n["P"])
    sg.mesh_with(bpy.data.objects[u["big"]], p_gear, u["big_dir"], -8.0)
    decorate(p_gear, "P")

    # the toggle: star + the two drivers' locking bosses and pins (standing on the A/B gears)
    drive = gm.toggle(SWING, C, a_deg=L["a_deg"], b_deg=L["b_deg"], land=LAND, bore_d=2 * BEARING_R,
                      pin_d=PIN_D)
    root, star, drivers, result = gv.build(drive, n["toggle"], location=(*L["star"], Z_STAR_BASE),
                                           plate_t=0.0, pin="steel", collection=n["col"])
    star_top = Z_STAR_BASE + gv.BUILD_DEFAULTS["z_gap"] + gv.BUILD_DEFAULTS["thick"]

    def spur(key, teeth, xy, z, shift=None, decor=None):
        # decorated gears open the bore to the rim (sator_gears.RIM) and fill it with crossings
        g = sg.new_spur(n[key], teeth, GEAR_H, template, n["col"], bore_r=None if decor else BEARING_R,
                        shift=shift)
        g.location = (*xy, z)
        return g

    ga = spur("A", DRIVER_T, L["A"], Z_DRIVER, decor="driver")
    gb = spur("B", DRIVER_T, L["B"], Z_DRIVER, decor="driver")
    sg.mesh_with(ga, gb, L["b_deg"], Z_DRIVER)
    decorate(ga, "driver")
    decorate(gb, "driver")
    for g, d, side in ((ga, drive.drivers[0], "A"), (gb, drive.drivers[1], "B")):
        _steel_pin(g, drive, d, L["star"], star_top, f"{n['col']} Pin {side}")

    # the 54T is printed with the P gear, so it keeps P's angle (both units then print the same
    # stack); the 27T turns to mesh it
    g54 = spur("p54", P_GEAR_T, L["P"], Z_INPUT, decor="p54")
    g54.rotation_euler.z = p_gear.rotation_euler.z
    gi = spur("input", INPUT_T, L["A"], Z_INPUT)
    bpy.context.view_layer.update()
    sg.mesh_with(g54, gi, math.degrees(math.atan2(L["A"][1] - L["P"][1], L["A"][0] - L["P"][0])), Z_INPUT)
    decorate(g54, "p54")
    _p_tube(p_gear, g54)
    sg.add_rim_dots(gi)

    go = spur("out", OUT_T, L["star"], Z_OUT, shift=OUT_SHIFT)
    for key in ("O1", "O2"):
        g = spur(key, OUT_T, L[key], Z_OUT, shift=OUT_SHIFT, decor="O")
        sg.mesh_with(go, g, math.degrees(math.atan2(L[key][1] - L["star"][1], L[key][0] - L["star"][0])), Z_OUT)
        g.location = (*L[key], Z_OUT)  # mesh_with spaces by pitch radii; the shift makes it OUT_CENTER
        decorate(g, "O")
    result["sectors"] = _sector_cut(go, [math.atan2(L[k][1] - L["star"][1], L[k][0] - L["star"][0])
                                         for k in ("O1", "O2")])
    return result


def _band_r(edges, lo, hi):
    """Largest distance from the axis of the edges [((r, z), (r, z)), ...] within lo <= z <= hi
    (r taken linear along each edge, exact for walls parallel to the axis)."""
    best = 0.0
    for (ra, za), (rb, zb) in edges:
        if max(za, zb) < lo or min(za, zb) > hi:
            continue
        if abs(zb - za) < 1e-9:
            best = max(best, ra, rb)
            continue
        for z in (max(lo, min(za, zb)), min(hi, max(za, zb))):
            best = max(best, ra + (rb - ra) * (z - za) / (zb - za))
    return best


def _footprints(unit):
    """(name, axis xy, radius, z0, z1, edges as ((r, z), (r, z))) for every part of a unit
    plus its P gear chain."""
    n = _names(unit)
    dg = bpy.context.evaluated_depsgraph_get()
    out = []
    names = [n[k] for k in ("A", "B", "input", "p54", "out", "O1", "O2", "P")] + [f"{n['P']} Tube"]
    names += [o.name for o in bpy.data.objects[n["toggle"]].children]
    for name in names:
        ob = bpy.data.objects[name]
        me = ob.evaluated_get(dg).to_mesh()
        mw = ob.matrix_world
        ax = mw.translation
        rz = [(math.hypot(p.x - ax.x, p.y - ax.y), p.z) for p in (mw @ v.co for v in me.vertices)]
        edges = [(rz[e.vertices[0]], rz[e.vertices[1]]) for e in me.edges]
        ob.evaluated_get(dg).to_mesh_clear()
        out.append((name, (ax.x, ax.y), max(r for r, _ in rz), min(z for _, z in rz),
                    max(z for _, z in rz), edges))
    return out


def check(unit):
    """Smallest gap from each part to any letter axis other than its own, and overlaps
    between parts sharing a z range that are not meant to mesh."""
    n = _names(unit)
    centers = [cell_xy(r, c) for r in range(1, 6) for c in range(1, 6)]
    parts = _footprints(unit)
    report = {"letter_gap": {}, "overlaps": []}
    for name, (x, y), r, z0, z1, _ in parts:
        gaps = [math.hypot(cx - x, cy - y) - r for cx, cy in centers if math.hypot(cx - x, cy - y) > 1.0]
        report["letter_gap"][name] = round(min(gaps), 2)
    tube = f"{n['P']} Tube"
    meshing = {frozenset(p) for p in ((n["A"], n["B"]), (n["input"], n["p54"]), (n["out"], n["O1"]),
                                      (n["out"], n["O2"]), (tube, n["P"]), (tube, n["p54"]))}
    toggle = {o.name for o in bpy.data.objects[n["toggle"]].children}
    for i, (na, pa, ra, a0, a1, rza) in enumerate(parts):
        for nb, pb, rb, b0, b1, rzb in parts[i + 1:]:
            lo, hi = max(a0, b0), min(a1, b1)
            if hi - lo <= 0.01:
                continue
            if frozenset((na, nb)) in meshing or (na in toggle and nb in toggle):
                continue
            # radii only over the shared height band (the tube is wide only above driver A)
            gap = math.hypot(pa[0] - pb[0], pa[1] - pb[1]) - _band_r(rza, lo, hi) - _band_r(rzb, lo, hi)
            if gap < 1.0:
                report["overlaps"].append((na, nb, round(gap, 2)))
            elif tube in (na, nb):
                report.setdefault("tube_gaps", {})[nb if na == tube else na] = round(gap, 2)
    report["min_letter_gap"] = min(report["letter_gap"].values())
    return report


def export_p_stack(unit, path=None):
    """P letter gear + tube + 54T as ONE solid (gear-local, P's axis at the origin)."""
    n = _names(unit)
    p = bpy.data.objects[n["P"]]
    if path is None:
        path = os.path.join(_HERE, "export", f"Gear_P_Stack_{unit}.stl")
    return _load("sator_gears").export_stl(p, path, extra=(bpy.data.objects[f"{n['P']} Tube"],
                                                         bpy.data.objects[n["p54"]]))


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

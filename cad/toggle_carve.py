"""Carving for the O toggle's Geneva parts (see docs/sator-hand-build.md): windows, borders and
shaped edges on the star, the drivers' locking bosses and the S gear, plus the pin posts.

Called from sator_o_toggle.build_unit after the parts exist. Every cut is a hidden cutter
object (Boolean DIFFERENCE, EXACT) parented to the part it shapes, so the parts stay
editable and export with sator_gears.export_stl. Outlines come from cad/carve.py.

One language for all of them: a frame along every working edge (the star's slots and
pockets, the S gear's toothed rims, the bosses' locking outline) and a hub, windows between
with a rounded top edge and a 45 deg chamfer on the bed side.

  star   a frame STAR_WALL wide and S-curved ribs from the hub to each lobe without a slot
         (the slot walls brace the other two lobes), curling the same way as the S gear's
         arms above it
  boss   a corbel like the P column's capital: the locking outline only in the star layer,
         narrowing below it to BOSS_FOOT of itself at the gear (flare <= 50 deg, prints
         unsupported), leaf flutes up it, a sunken panel inside a raised border on top,
         windows down through it and the gear's hub
  post   a collar round each steel pin, through the gear and up the star gap, tied to the
         boss by an arm that rides the gear spoke carrying the pin (the pin is then held for
         17 of its 25.7 mm)
  S gear the arms drop ARM_DROP below the toothed rims and the hub, their top edges rounded,
         and the rims and hub get a stepped border at the windows
"""

import importlib.util
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix

_HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(_HERE, name + ".py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


carve = _load("carve")

# ==== settings (mm) ====
GRID = 0.25          # field sampling step
WIN_FILLET = 2.5     # smallest window corner radius
BED_CHAMFER = 0.6    # 45 deg chamfer round each window on the bed side
STEP = 1.2           # S gear: border step on rims and hub (= rounding on the lowered arms)
TOP_ROUND = 0.8      # S gear: rounding on the top edges of rims and hub at the windows
ARM_DROP = 2.5       # S gear: arms stand this much lower than the rims
STAR_WALL = 4.5      # star frame along its outline (slot walls carry the pins)
STAR_ROUND = 1.2     # star: rounding on the windows' top edges
STAR_HUB_R = 17.0    # star hub round the 21.9 bearing hole
STAR_RIB_W = 5.0
STAR_RIB_SWEEP = 36.0  # deg the S rib curls between hub and lobe tip
BOSS_FOOT = 0.84     # corbel foot, share of the locking outline (scaled about the driver axis)
BOSS_FLARE_P = 1.6   # corbel curve: 1 = cone, more = a bell flaring near the top
BOSS_WALL = 4.0      # boss wall round its windows (at the foot; leaves take up to BOSS_LEAF_D)
BOSS_LEAVES = 20     # leaf flutes round the corbel
BOSS_LEAF_D = 1.2    # their depth (they fade out at the foot and below the crown)
BOSS_BORDER = 3.0    # raised border round the crown's top
BOSS_PANEL_D = 1.2   # the panel inside it sits this much lower
BOSS_HUB_R = 16.0    # solid round the driver axis
POST_R = 4.5         # collar round the steel pin (the spoke alone is barely wider than the hole)
POST_ARM_W = 5.0     # arm from the boss to the collar (sits on the spoke's flat top)
POST_ROUND = 1.2     # rounding on the post's top edges
SEGS = 256           # points per lofted outline


def _cutter(parent, name, me, targets):
    """Hidden cutter object parented to `parent` (same local frame), cutting every target."""
    old = bpy.data.objects.get(name)
    if old is not None:
        bpy.data.objects.remove(old)
    cut = bpy.data.objects.new(name, me)
    for c in parent.users_collection:
        c.objects.link(cut)
    cut.parent = parent
    cut.display_type, cut.hide_render = "WIRE", True
    cut.hide_set(True)
    for t in targets:
        mod = t.modifiers.new(name, "BOOLEAN")
        mod.operation, mod.solver, mod.object = "DIFFERENCE", "EXACT", cut
    return cut


def _solid(parent, name, me):
    old = bpy.data.objects.get(name)
    if old is not None:
        bpy.data.objects.remove(old)
    ob = bpy.data.objects.new(name, me)
    for c in parent.users_collection:
        c.objects.link(ob)
    ob.parent = parent
    return ob


def _recess_profile(z_low, z1, over=1.0):
    """Cutter above the lowered ribs/arms: flat floor at z_low, the frames' top edges rounded."""
    prof = [(z_low, 0.0)]
    zc = z1 - TOP_ROUND
    prof += [(zc + TOP_ROUND * math.sin(math.pi / 2 * k / 4), TOP_ROUND * (1 - math.cos(math.pi / 2 * k / 4)))
             for k in range(4)]
    prof += [(z1 + 0.05, TOP_ROUND), (z1 + over, TOP_ROUND)]  # cross the top face at an angle
    return prof


def _s_line(mid, r0, r1, sweep, n=60):
    """S curve from (r0, mid + sweep/2) to (r1, mid - sweep/2): leaves and arrives radially."""
    pts = []
    for i in range(n + 1):
        u = i / n
        r = r0 + (r1 - r0) * u
        th = mid + sweep * (0.5 - (3 * u * u - 2 * u ** 3))
        pts.append((r * math.cos(th), r * math.sin(th)))
    return pts


# ---- star -----------------------------------------------------------------------------------

def star(star_ob, drive, z0, z1):
    """Windows, S ribs and a stepped frame on the Geneva star (mesh z z0..z1, star frame)."""
    loops = drive.star_loops()
    g = carve.Grid.around(loops, h=GRID)
    s = g.sdf(loops, band=(STAR_WALL - 1.0, STAR_WALL + WIN_FILLET + 1.0))
    base = np.minimum(s - STAR_WALL, g.field(-carve.circle_sdf(g.pts, (0.0, 0.0), STAR_HUB_R)))
    pk = sorted(p % (2 * math.pi) for p in drive.pockets)
    lobes = [(a + b + (2 * math.pi if b < a else 0.0)) / 2 for a, b in zip(pk, pk[1:] + pk[:1])]
    ribs = [m for m in lobes
            if min(abs((m - sl + math.pi) % (2 * math.pi) - math.pi) for sl in drive.slots) > 0.3]
    win = base
    for m in ribs:
        line = _s_line(m, STAR_HUB_R - 2.0, drive.R + 2.0, math.radians(STAR_RIB_SWEEP))
        win = np.minimum(win, g.field(carve.polyline_dist(g.pts, line) - STAR_RIB_W / 2))
    windows = carve.Region(g, win, WIN_FILLET, grow=(0.0, 2.0))
    prof = carve.edge_profile(z0, z1, STAR_ROUND, BED_CHAMFER)
    _cutter(star_ob, f"{star_ob.name} Windows", carve.cutter_mesh("star windows", windows, prof, SEGS), [star_ob])
    return dict(windows=len(windows.loops), ribs=len(ribs))


# ---- locking boss ---------------------------------------------------------------------------

def boss(boss_ob, drive, i, z_top, corbel_h, gear_h, crossings):
    """Rebuild driver i's locking boss (mesh z 0 = gear top .. z_top = star top, driver frame)
    as a corbel, and cut windows through it and the gear's crossings hub."""
    loop = carve.resample(drive.disc_loop(i), 720)
    rmax = float(np.hypot(*loop.T).max())
    lift = rmax * (1 - BOSS_FOOT)
    rate = lift * BOSS_FLARE_P / corbel_h  # steepest flare (at the top of the corbel)
    if rate > math.tan(math.radians(50.0)) + 1e-6:
        raise ValueError(f"corbel flares {math.degrees(math.atan(rate)):.0f} deg: raise BOSS_FOOT")
    zs = [-0.5] + [corbel_h * k / 36 for k in range(1, 37)] + [z_top]  # no ring on the gear's top face
    phi = np.arctan2(loop[:, 1], loop[:, 0])
    v = ((phi * BOSS_LEAVES / (2 * math.pi)) % 1.0 - 0.5) / (0.75 / 2)
    leaf = np.where(np.abs(v) < 1, np.clip(1 - v * v, 0, 1) ** 0.6, 0.0)  # same grooves as the column
    rad = np.hypot(loop[:, 0], loop[:, 1])
    bm = bmesh.new()
    rings = []
    for z in zs:
        u = min(max(z / corbel_h, 0.0), 1.0)
        sc = BOSS_FOOT + (1 - BOSS_FOOT) * u ** BOSS_FLARE_P
        w = BOSS_LEAF_D * max(0.0, math.sin(math.pi * min(1.0, u / 0.85))) ** 0.7
        k = (sc * rad - w * leaf) / rad
        rings.append([bm.verts.new((x * kk, y * kk, z)) for (x, y), kk in zip(loop, k)])
    n = len(loop)
    for a, b in zip(rings, rings[1:]):
        for k in range(n):
            j = (k + 1) % n
            bm.faces.new((a[k], a[j], b[j], b[k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    old = boss_ob.data
    me = bpy.data.meshes.new(old.name)
    bm.to_mesh(me)
    bm.free()
    boss_ob.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    # windows through the corbel's foot (so they clear it all the way up) and the gear hub
    foot = loop * BOSS_FOOT
    g = carve.Grid.around([foot], h=GRID)
    s = g.sdf([foot], band=(BOSS_WALL - 1.0, BOSS_WALL + WIN_FILLET + 1.0))
    win = np.minimum(s - BOSS_WALL, g.field(-carve.circle_sdf(g.pts, (0.0, 0.0), BOSS_HUB_R)))
    windows = carve.Region(g, win, WIN_FILLET, grow=(0.0, 2.0))
    z_panel = z_top - BOSS_PANEL_D
    prof = carve.edge_profile(-gear_h, z_panel, TOP_ROUND, BED_CHAMFER)
    if crossings is not None:
        _cutter(boss_ob, f"{boss_ob.name} Hub Windows", carve.cutter_mesh("hub windows", windows, prof, SEGS),
                [crossings])
    # the boss's own cut is 0.05 wider: where the boss dips into the hub its window walls
    # would otherwise lie exactly on the hub's, and an EXACT union leaves slivers there
    prof = [(z, g + 0.05) for z, g in prof]
    _cutter(boss_ob, f"{boss_ob.name} Windows", carve.cutter_mesh("boss windows", windows, prof, SEGS), [boss_ob])
    # sunken panel on the crown, inside a raised border along the locking outline
    gt = carve.Grid.around([loop], h=GRID)
    panel = carve.Region(gt, gt.sdf([loop], band=(BOSS_BORDER - 1.0, BOSS_BORDER + 3.0)) - BOSS_BORDER,
                         WIN_FILLET, grow=(0.0, TOP_ROUND + 0.5))
    _cutter(boss_ob, f"{boss_ob.name} Panel",
            carve.cutter_mesh("boss panel", panel, _recess_profile(z_panel, z_top), SEGS), [boss_ob])
    return dict(windows=len(windows.loops), flare_deg=round(math.degrees(math.atan(rate)), 1))


# ---- pin post -------------------------------------------------------------------------------

def post(boss_ob, drive, i, spoke, post_h, gear_h, pin_fit):
    """A collar round the steel pin from just above the gear's bed face up into the star gap
    (mesh z -gear_h + 0.2 .. post_h), tied to the boss by an arm along the gear spoke that
    carries the pin (below the gear's top face the arm is buried in the spoke and hub); it
    ends 2 mm inside the boss's corbel foot, in the wall round the boss's windows. Boss frame
    (driver i): the pin sits at (drive.a, 0). spoke(r) -> the carrying spoke's centre angle
    at radius r in this frame (0 at the pin; constant inside the gear's hub)."""
    a = drive.a
    prof_r = drive.disc_profiles()[i]
    k0 = int(round((spoke(0.0) % (2 * math.pi)) / (2 * math.pi) * len(prof_r))) % len(prof_r)
    r0 = BOSS_FOOT * float(prof_r[k0]) - 2.0
    line = [(r * math.cos(spoke(r)), r * math.sin(spoke(r))) for r in np.linspace(r0, a, 60)]
    pin = (a, 0.0)
    pts = np.array(line)
    g = carve.Grid(pts[:, 0].min() - 8, pts[:, 1].min() - 8, pts[:, 0].max() + 8, pts[:, 1].max() + 8, GRID)
    arm = POST_ARM_W / 2 - g.field(carve.polyline_dist(g.pts, line))
    col = g.field(carve.circle_sdf(g.pts, pin, POST_R))
    k = 1.5  # smooth union: fillets where the arm meets the collar
    h = np.clip(0.5 + 0.5 * (arm - col) / k, 0.0, 1.0)
    plan = col * (1 - h) + arm * h + k * h * (1 - h)
    shape = carve.Region(g, plan, 0.0, min_area=1.0, grow=(-POST_ROUND - 0.5, 0.5))
    # no face on one of the gear's or the boss's (an EXACT union leaves slivers there)
    prof = [(-gear_h + 0.2, 0.0), (post_h - POST_ROUND, 0.0)]
    prof += [(post_h - POST_ROUND + POST_ROUND * math.sin(math.pi / 2 * q / 4),
              -POST_ROUND * (1 - math.cos(math.pi / 2 * q / 4))) for q in range(1, 5)]
    ob = _solid(boss_ob, f"{boss_ob.name} Pin Post", carve.cutter_mesh("pin post", shape, prof, SEGS))
    hole = bpy.data.meshes.new("post pin hole")
    bm = bmesh.new()
    r_hole = drive.pin_d * pin_fit / 2 + 0.02  # a hair over the gear's own pin hole: no shared wall
    bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=r_hole, radius2=r_hole,
                          depth=gear_h + post_h + 4, matrix=Matrix.Translation((a, 0.0, (post_h - gear_h) / 2)))
    bm.to_mesh(hole)
    bm.free()
    _cutter(boss_ob, f"{boss_ob.name} Post Pin Hole", hole, [ob])
    return ob


# ---- S gear ---------------------------------------------------------------------------------

def sector(gear, windows_xy, hub_r, rim_r, z0, z1):
    """Cut the sector gear's windows (gear-local polygons) with shaped edges, and drop its
    arms ARM_DROP below the toothed rims and the hub."""
    loops = [np.asarray(w, float) for w in windows_xy]
    g = carve.Grid.around(loops, pad=4.0, h=GRID)  # the windows reach out past the tips
    s = g.sdf(loops, band=(-4.0, 1.0))
    windows = carve.Region(g, s, 0.0, min_area=1.0, grow=(0.0, 3.0))
    r = np.hypot(g.pts[:, 0], g.pts[:, 1])
    ring = g.field(np.minimum(r - hub_r, rim_r - r))
    # the arms: the ring between hub and rims less the windows
    recess = carve.Region(g, np.minimum(ring, -s), 0.0, min_area=3.0, grow=(0.0, TOP_ROUND + 1.0))
    z_low = z1 - ARM_DROP
    prof = carve.edge_profile(z0, z1, TOP_ROUND, BED_CHAMFER, step=(z_low, STEP))
    _cutter(gear, f"{gear.name} Sector Cutter", carve.cutter_mesh("sector windows", windows, prof, SEGS), [gear])
    _cutter(gear, f"{gear.name} Arm Recess",
            carve.cutter_mesh("sector recess", recess, _recess_profile(z_low, z1), SEGS), [gear])
    return dict(windows=len(windows.loops))

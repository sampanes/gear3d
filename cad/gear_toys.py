"""Gear toys: a pegboard of gears on 625 bearings, with rubber-band pulleys (run inside
Blender). See docs/gear-toys.md.

build()          -- the parts (collection "Gear Toys") and a sample layout ("Gear Toys Layout")
check()          -- every pair meshes with backlash, nothing still touches anything that turns
export(out_dir)  -- one STL per part design, named by how many a set needs

Every turning part is two 8 mm layers (16 tall) with a 625 bearing (5 x 16 x 5) pressed into
each end, held the way the SATOR toggle groups are: each outer race stops on a narrow ledge
(the bed-side one on a 45 deg cone, so it prints without support),
a loose printed spacer runs between the inner races, and the clamp (an M5 bolt down into a
nut trapped in the post) runs bolt head, washer, inner race, spacer, inner race, post boss,
nut: never through the balls. Each part is symmetric, so turned over it swaps its layers:
that is how a gear moves to the other layer. Both outer faces are flat (each part prints
flat on its bottom layer); the bottom layer's top face stands 0.5 down outside the top
layer's reach, so two parts whose layers overlap in plan run 1 mm apart.

Grid: module 2.5, so 15T + 15T mesh one hole apart (37.5), 15T + 45T two apart, 45T + 45T
three apart. Every pulley groove takes a small rubber band (one to four fingers round).
"""

import importlib.util
import json
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

_HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(_HERE, name + ".py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


sg = _load("sator_gears")

# ==== gears (mm) ====
MODULE = 2.5
PRESSURE = math.radians(25.0)
FACE = 8.0               # one layer
GAP = 0.5                # the bottom layer's top face stands this far down outside the top
FACE_T = FACE - GAP      # layer's reach (1 mm between two parts' layers wherever they overlap
                         # in plan); both outer faces stay flat, so every part prints flat
PART_H = 2 * FACE        # every turning part is two layers
SMALL, BIG = 15, 45
GRID = MODULE * 2 * SMALL / 2   # 37.5: two smalls mesh one hole apart
BACKLASH = 0.1           # each flank thinned this much at the pitch circle
GEAR = dict(module=MODULE, pressure_angle=PRESSURE, helix_angle=0.0, herringbone=False, shift=0.0,
            clearance=0.25, head=0.0, undercut=False, complexity=10, z_resolution=10,
            tooth_mod_enabled=True, tooth_taper=1.0, tooth_taper_offset=0.0, tip_relief=0.1,
            tip_relief_resolution=2, root_relief=0.0, root_relief_resolution=2, bore_enabled=False,
            bool_solver="EXACT", do_crease=True, crease=math.radians(35.0), add_weld=True, weld_dist=0.001)

# ==== 625 bearing (5 x 16 x 5): d1 8.4, D2 13.3, shaft shoulder 7.4..8.3, housing shoulder <= 13.6 ====
BEARING_W = 5.0
SEAT_R = 8.1             # 16.2 hole: 16.0 printed tight in a part (snug only on the fit coupon)
LEAD = 0.4               # 45 deg lead-in at each seat mouth (takes the first-layer squish)
CONE_AT = 7.8            # the cone over a bed-side seat meets the outer race's corner here
LEDGE_R = 13.5 / 2       # outer race stops on a ledge from here out
RELIEF_H = 0.6           # inside the ledge the plug stands back this far
BORE_R = 9.4 / 2         # bore through the plug, round the spacer
KIT_R, KIT_BORE_R = 4.0, 2.75   # washer, spacer and post boss: inner race only (8.0 across)
WASHER_T = 1.5
SPACER_L = PART_H - 2 * BEARING_W
TUNE = (-0.1, 0.1, 0.2, 0.3)

# ==== post and board ====
BED = 5.0                # a part's underside above the board
BOSS_H = 1.0             # the post's boss under the lower inner race
POST_R = 7.0
PEG_R, PEG_L, RIB_R = 6.4, 8.0, 6.65   # board holes are 13.0; three ribs crush to a press fit
HOLE_R = 6.5
NUT_AF, NUT_TOP = 8.1, -3.5            # M5 nut (8 AF, 4 tall) pushed up into the peg from below
BOLT_R = 2.75
BOARD_N, BOARD_T = 5, 8.0
CELL = 20.0              # pockets under the board between holes
SOCKET = (9.0, 13.0, 7.0)  # dovetail at the board edge: narrow, wide, deep
CLIP_GAP = 0.15

# ==== pulleys, windows, crank ====
GROOVE_R, STEP_R = 12.5, 24.0  # band seat: every part's, and the step pulley's big one
GROOVE_D = 2.5           # flange this far out, 45 deg sides, 1 mm flat
WINDOW_R, WINDOW_AT, WINDOWS = 6.5, 34.5, 6
CRANK_AT, CRANK_HOLE_R = 47.5, 3.0
CRANK_PIN_R, CRANK_RIB_R = 2.9, 3.15
CRANK_H = 18.0           # handle above the gear face
PIN_L = FACE_T - 0.5     # pin into the crank hole, stopping short of the far face

# Kinds of turning part: teeth per layer (0 = bottom), pulley groove per layer, windows.
# A 45T reaches 58.75 from its axis, so a part two holes away (75) has 16 to spare on that
# layer: the 15 mm pulley flanges fit there, which is why every gear's pulley is that size.
KINDS = {
    "Gear_15T": dict(layers={0: SMALL}, pulleys={1: GROOVE_R}),
    "Gear_45T": dict(layers={0: BIG}, pulleys={1: GROOVE_R}, windows=True),
    "Compound_45_15": dict(layers={0: BIG, 1: SMALL}, windows=True),
    "Step_Pulley": dict(layers={}, pulleys={0: STEP_R, 1: GROOVE_R}),
}
# How many a set of one board needs (exports are named by it).
SET = {"Gear_15T": 4, "Gear_45T": 2, "Compound_45_15": 2, "Step_Pulley": 1, "Post": 9, "Band_Post": 3,
       "Crank": 2, "Washer": 9, "Spacer": 9, "Board": 1, "Clip": 4}

# Sample layout: (name, kind, hole (i, j), turned over, crank). The crank turns the compound
# (45T on top): its 15T drives the 45T (a third as fast), its 45T drives a row of three 15Ts
# (three times as fast); the last one's pulley belts the step pulley's big groove. A band
# from the crank to a band post is a spring: wind it up and let go.
LAYOUT = [
    ("B", "Compound_45_15", (2, 0), True, True),
    ("A", "Gear_45T", (0, 0), False, False),
    ("C", "Gear_15T", (4, 0), True, False),
    ("D", "Gear_15T", (4, 1), True, False),
    ("E", "Gear_15T", (4, 2), True, False),
    ("F", "Step_Pulley", (2, 2), False, False),
]
BAND_POSTS = [(1, 2)]
BELTS = [("E", 0, "F", 0)]   # (part, world layer, part, world layer)


# ---- mesh helpers ----------------------------------------------------------------------------

def _lathe(name, profile, n=96):
    """Closed mesh from turning an (r, z) loop round the z axis; points with r == 0 lie on it."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    angles = [2 * math.pi * i / n for i in range(n)]
    rings = []
    for r, z in profile:
        rings.append([bm.verts.new((0.0, 0.0, z))] if r == 0 else
                     [bm.verts.new((r * math.cos(a), r * math.sin(a), z)) for a in angles])
    for a, b in zip(rings, rings[1:] + rings[:1]):
        if len(a) == 1 and len(b) == 1:
            continue
        for i in range(n):
            j = (i + 1) % n
            if len(a) == 1:
                bm.faces.new((a[0], b[i], b[j]))
            elif len(b) == 1:
                bm.faces.new((a[i], a[j], b[0]))
            else:
                bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    return me


def _prism(name, loop, z0, z1):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in loop]
    hi = [bm.verts.new((x, y, z1)) for x, y in loop]
    for i in range(len(loop)):
        j = (i + 1) % len(loop)
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    return me


def _circle(cx, cy, r, n=48):
    return [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def _rounded_rect(cx, cy, hw, hh, rad, n=6):
    pts = []
    for sx, sy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ox, oy = cx + sx * (hw - rad), cy + sy * (hh - rad)
        pts += [(ox + rad * math.cos(math.radians(a0 + 90 * k / n)), oy + rad * math.sin(math.radians(a0 + 90 * k / n)))
                for k in range(n + 1)]
    return pts


def _collection(name, parent=None):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(col)
    return col


def _remove(ob):
    for o in [ob] + list(ob.children_recursive):
        me = o.data if o.type == "MESH" else None
        bpy.data.objects.remove(o)
        if me is not None and me.users == 0:
            bpy.data.meshes.remove(me)


def _object(name, me, col, color=None):
    old = bpy.data.objects.get(name)
    if old is not None:
        _remove(old)
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    if color is not None:
        ob.color = color
    return ob


def _join(meshes):
    bm = bmesh.new()
    for me in meshes:
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new("tool")
    bm.to_mesh(me)
    bm.free()
    return me


def _realize(name, base, ops, col, color=None):
    """One static mesh: base, each "UNION" mesh added in turn, then every "DIFFERENCE" mesh
    taken away at once (one joined cutter: EXACT drops cuts when given one modifier each)."""
    unions = [me for op, me in ops if op == "UNION"]
    cuts = [me for op, me in ops if op == "DIFFERENCE"]
    tools = [("UNION", me) for me in unions] + ([("DIFFERENCE", _join(cuts))] if cuts else [])
    tmp = []
    for k, (op, me) in enumerate(tools):
        o = bpy.data.objects.new(f"{name} tool {k}", me)
        bpy.context.scene.collection.objects.link(o)
        tmp.append(o)
        mod = base.modifiers.new(f"{op} {k}", "BOOLEAN")
        mod.operation, mod.solver, mod.object = op, "EXACT", o
        mod.use_self = op == "DIFFERENCE"  # the joined cutter's pieces may cross each other
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(base.evaluated_get(dg))
    for o in tmp:
        m = o.data
        bpy.data.objects.remove(o)
        bpy.data.meshes.remove(m)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.transform(base.matrix_world)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, dist=2e-4, edges=bm.edges[:])
    bm.to_mesh(me)
    bm.free()
    return _object(name, me, col, color)


# ---- gears -----------------------------------------------------------------------------------

def _spur(name, teeth, z0, height):
    """A PrecisionGears spur, solid (no bore), from z0 up `height`. Returns (object,
    tooth-center angle)."""
    from PrecisionGears import gear_definitions

    bpy.ops.object.add_new_gear(gear_type="SPUR")
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    p = sg.props(ob)
    p.editing = True
    for k, v in GEAR.items():
        setattr(p, k, v)
    p.teeth = teeth
    p.height = height
    # the addon turns each flank in by backlash / 4 (rad): BACKLASH mm at the pitch circle
    p.backlash = 4 * BACKLASH / (MODULE * teeth / 2)
    p.editing = False
    gear_definitions.update_gear(p, bpy.context)
    ob.location = (0, 0, 0)
    ob.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    me = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    zs = [v.co.z for v in me.vertices]
    ob.location.z = z0 - min(zs)
    if abs(max(zs) - min(zs) - height) > 1e-3:
        raise ValueError(f"{name}: height {max(zs) - min(zs)}")
    ob.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
    bpy.context.view_layer.update()
    return ob, sg.tooth_phase(ob)


def _plain(ob):
    """An object's evaluated mesh in world coordinates, normals made consistent (the addon's
    bottom caps face inward, which EXACT reads as solid below the gear)."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    me.transform(ob.matrix_world)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    return me


def _pulley_prof(g, z0):
    """A groove for a band in the layer from z0: flanges GROOVE_D proud, 45 deg sides, flat.
    A top-layer pulley reaches 0.5 down into the bottom layer's core."""
    f = g + GROOVE_D
    lip = (FACE - 2 * GROOVE_D - 0.5) / 2
    a, b = (z0 - 0.5 if z0 else z0), z0 + FACE
    lip_a = lip + (z0 - a)
    return [(BOLT_R + 0.5, a), (f, a), (f, a + lip_a), (g, a + lip_a + GROOVE_D), (g, b - lip - GROOVE_D),
            (f, b - lip), (f, b), (BOLT_R + 0.5, b)]


def seat_cut_prof(f0, f1, z_bot, z_top):
    """(r, z) loop cutting a pair of 625 seats: one from z_bot up to f0 (the bed side), one
    from f1 up to z_top. The bed-side seat stops on a 45 deg cone that meets the outer race's
    corner at f0: a flat ceiling there prints as an overhang with nothing under it, and on
    the test gear it sagged into the seat. The far seat stops on a flat ledge; inside it the
    plug stands RELIEF_H back off the seal."""
    s, b, zt = SEAT_R, BORE_R, f1 - RELIEF_H
    zc = f0 - (s - CONE_AT)       # cone at the seat wall
    zb = zc + (s - b)             # cone at the bore
    if zb > zt + 1e-6:
        raise ValueError(f"seats {f0}..{f1} too close for the cone")
    pts = [(0, z_bot - 1.0), (s + LEAD, z_bot - 1.0), (s + LEAD, z_bot), (s, z_bot + LEAD), (s, zc), (b, zb)]
    if zb < zt - 1e-6:
        pts.append((b, zt))
    return pts + [(LEDGE_R, zt), (LEDGE_R, f1), (s, f1), (s, z_top - LEAD), (s + LEAD, z_top), (s + LEAD, z_top + 1.0),
                  (0, z_top + 1.0)]


def _bearing_cut_prof():
    return seat_cut_prof(BEARING_W, PART_H - BEARING_W, 0.0, PART_H)


def _reach(spec, layer):
    """How far from the axis a kind reaches on one of its layers."""
    if layer in spec["layers"]:
        return MODULE * (spec["layers"][layer] / 2 + 1)
    g = spec.get("pulleys", {}).get(layer)
    return 0.0 if g is None else g + GROOVE_D


def _turning(kind, col):
    spec = KINDS[kind]
    gears, phases = {}, {}
    for layer, teeth in spec["layers"].items():
        # a top-layer gear reaches 0.2 down into the bottom layer's core, so the union has no
        # shared face
        z0, h = (0.0, FACE) if layer == 0 else (FACE - 0.2, FACE + 0.2)
        gears[layer], phases[layer] = _spur(f"{kind} {teeth}T src", teeth, z0, h)
    pulleys = {layer: _lathe("pulley", _pulley_prof(g, layer * FACE), 192) for layer, g in spec.get("pulleys", {}).items()}
    if 0 not in gears:
        gears[0] = _object(f"{kind} src", pulleys.pop(0), col)
    bpy.context.view_layer.update()
    meshes = {layer: _plain(ob) for layer, ob in gears.items()}
    for ob in gears.values():
        _remove(ob)
    base = _object(f"{kind} base", meshes.pop(0), col)
    ops = [("UNION", me) for me in list(meshes.values()) + list(pulleys.values())]
    cuts = []
    if spec.get("windows"):
        for k in range(WINDOWS):
            a = 2 * math.pi * k / WINDOWS
            cuts.append(_prism("window", _circle(WINDOW_AT * math.cos(a), WINDOW_AT * math.sin(a), WINDOW_R, 64),
                               -1.0, FACE + 0.5))
        for a in (math.pi / WINDOWS, math.pi / WINDOWS + math.pi):
            cuts.append(_prism("crank hole", _circle(CRANK_AT * math.cos(a), CRANK_AT * math.sin(a), CRANK_HOLE_R, 48),
                               -1.0, FACE + 0.5))
    cuts.append(_lathe("bearing cut", _bearing_cut_prof(), 192))
    # the bottom layer's top face stands GAP down outside the top layer's reach (45 deg step)
    core = _reach(spec, 1) + 0.5
    cuts.append(_lathe("layer gap", [(core, FACE + 0.5), (core, FACE), (core + GAP, FACE - GAP), (200.0, FACE - GAP),
                                     (200.0, FACE + 0.5)], 192))
    for me in cuts:
        ops.append(("DIFFERENCE", me))
    part = _realize(f"Toy_{kind}", base, ops, col)
    part["layers"] = json.dumps({str(k): [spec["layers"][k], phases[k]] for k in spec["layers"]})
    _remove(base)
    return part


# ---- stationary parts ------------------------------------------------------------------------

def _peg_prof(top):
    """(r, z) up the peg's axis from its tip to the board face; the rest is the caller's."""
    return [(0, -PEG_L), (PEG_R - 0.6, -PEG_L), (PEG_R, -PEG_L + 0.6), (PEG_R, 0.0)] + top


def _peg_cuts():
    ribs = []
    for k in range(3):
        a = 2 * math.pi * k / 3
        c, s = math.cos(a), math.sin(a)
        loop = [(r * c - w * s, r * s + w * c) for r, w in ((PEG_R - 0.3, -0.6), (RIB_R, -0.6), (RIB_R, 0.6), (PEG_R - 0.3, 0.6))]
        ribs.append(("UNION", _prism("rib", loop, -PEG_L + 1.0, -0.8)))
    rc = NUT_AF / math.sqrt(3)
    nut = _prism("nut pocket", [(rc * math.cos(math.pi / 3 * i), rc * math.sin(math.pi / 3 * i)) for i in range(6)],
                 -PEG_L - 1.0, NUT_TOP)
    return ribs + [("DIFFERENCE", nut)]


def _post(col):
    prof = _peg_prof([(POST_R + 1.0, 0.0), (POST_R + 1.0, 0.6), (POST_R, 1.6), (POST_R, BED - BOSS_H),
                      (KIT_R, BED - BOSS_H), (KIT_R, BED), (0, BED)])
    base = _object("Toy_Post src", _lathe("post", prof, 96), col)
    ops = _peg_cuts() + [("DIFFERENCE", _prism("bolt hole", _circle(0, 0, BOLT_R, 32), -PEG_L - 1, BED + 1))]
    ob = _realize("Toy_Post", base, ops, col, (0.35, 0.5, 0.75, 1))
    _remove(base)
    return ob


def _band_post(col):
    top = 29.0
    prof = _peg_prof([(POST_R + 1.0, 0.0), (POST_R + 1.0, 0.6), (POST_R, 1.6), (POST_R, 2.0), (5.0, 3.0),
                      (5.0, 24.0), (8.0, 27.0), (8.0, top - 1.0), (7.0, top), (0, top)])
    base = _object("Toy_Band_Post src", _lathe("band post", prof, 96), col)
    ob = _realize("Toy_Band_Post", base, _peg_cuts()[:3], col, (0.35, 0.5, 0.75, 1))
    _remove(base)
    return ob


def _crank(col):
    prof = [(0, 0.0), (CRANK_PIN_R - 0.4, 0.0), (CRANK_PIN_R, 0.4), (CRANK_PIN_R, PIN_L), (5.5, PIN_L),
            (5.5, PIN_L + 1.0), (5.0, PIN_L + 1.5), (5.0, PIN_L + CRANK_H - 2.0)]
    prof += [(5.0 * math.cos(math.pi / 2 * k / 6), PIN_L + CRANK_H - 2.0 + 2.0 * math.sin(math.pi / 2 * k / 6))
             for k in range(1, 6)] + [(0, PIN_L + CRANK_H)]
    base = _object("Toy_Crank src", _lathe("crank", prof, 64), col)
    ribs = []
    for k in range(3):
        a = 2 * math.pi * k / 3
        c, s = math.cos(a), math.sin(a)
        loop = [(r * c - w * s, r * s + w * c) for r, w in ((CRANK_PIN_R - 0.3, -0.5), (CRANK_RIB_R, -0.5),
                                                              (CRANK_RIB_R, 0.5), (CRANK_PIN_R - 0.3, 0.5))]
        ribs.append(("UNION", _prism("rib", loop, 1.0, PIN_L - 0.5)))
    ob = _realize("Toy_Crank", base, ribs, col, (0.85, 0.2, 0.2, 1))
    _remove(base)
    return ob


def _ring(name, length, col):
    return _object(name, _lathe(name, [(KIT_BORE_R, 0.0), (KIT_R, 0.0), (KIT_R, length), (KIT_BORE_R, length)], 96),
                   col, (0.9, 0.45, 0.1, 1))


def _socket_loop(x, y, inward, grow=0.0):
    """Dovetail loop at the board edge point (x, y), opening `inward` (unit vector)."""
    nw, ww, d = SOCKET
    ix, iy = inward
    tx, ty = -iy, ix
    pts = [(-(nw / 2 + grow), -1.0), (nw / 2 + grow, -1.0), (ww / 2 + grow, d + grow), (-(ww / 2 + grow), d + grow)]
    return [(x + u * tx + v * ix, y + u * ty + v * iy) for u, v in pts]


def hole_xy(i, j):
    return ((i + 0.5) * GRID, (j + 0.5) * GRID)


def _board(col):
    size = BOARD_N * GRID
    base = _object("Toy_Board src", _prism("board", _rounded_rect(size / 2, size / 2, size / 2, size / 2, 3.0, 4),
                                            -BOARD_T, 0.0), col)
    ops = []
    for i in range(BOARD_N):
        for j in range(BOARD_N):
            x, y = hole_xy(i, j)
            ops.append(("DIFFERENCE", _lathe("hole", [(0, -BOARD_T - 1), (HOLE_R, -BOARD_T - 1), (HOLE_R, -0.8),
                                                     (HOLE_R + 0.8, 0.0), (HOLE_R + 2.0, 1.0), (0, 1.0)], 64)))
            ops[-1][1].transform(Matrix.Translation((x, y, 0)))
    for i in range(1, BOARD_N):
        for j in range(1, BOARD_N):
            ops.append(("DIFFERENCE", _prism("cell", _rounded_rect(i * GRID, j * GRID, CELL / 2, CELL / 2, 3.0),
                                             -BOARD_T - 1, -3.5)))
    for k in (1, BOARD_N - 1):
        c = k * GRID
        for (x, y), inward in (((c, 0.0), (0, 1)), ((c, size), (0, -1)), ((0.0, c), (1, 0)), ((size, c), (-1, 0))):
            ops.append(("DIFFERENCE", _prism("socket", _socket_loop(x, y, inward), -BOARD_T - 1, 1.0)))
    ob = _realize("Toy_Board", base, ops, col, (0.92, 0.85, 0.65, 1))
    _remove(base)
    return ob


def _clip(col):
    nw, ww, d = SOCKET
    g = -CLIP_GAP
    half = [(-(nw / 2 + g), 0.0), (-(ww / 2 + g), d + g), (ww / 2 + g, d + g), (nw / 2 + g, 0.0)]
    loop = [(u, v) for u, v in half] + [(u, -v) for u, v in reversed(half)]
    loop = [p for k, p in enumerate(loop) if k == 0 or p != loop[k - 1]]
    me = _prism("clip", [(v, u) for u, v in loop][::-1], -BOARD_T, -0.5)
    return _object("Toy_Clip", me, col, (0.92, 0.85, 0.65, 1))


# ---- build -----------------------------------------------------------------------------------

COLORS = [(0.9, 0.25, 0.2, 1), (0.2, 0.45, 0.85, 1), (0.95, 0.75, 0.15, 1), (0.25, 0.7, 0.35, 1),
          (0.6, 0.35, 0.8, 1)]


def build(save=False):
    for c in ("Gear Toys Layout", "Gear Toys"):
        col = bpy.data.collections.get(c)
        if col is not None:
            for o in list(col.all_objects):
                _remove(o)
            bpy.data.collections.remove(col)
    col = _collection("Gear Toys")
    for kind in KINDS:
        _turning(kind, col)
    _post(col)
    _band_post(col)
    _crank(col)
    _ring("Toy_Washer", WASHER_T, col)
    _ring("Toy_Spacer", SPACER_L, col)
    _board(col)
    _clip(col)
    for o in col.objects:
        o.hide_render = True
        o.hide_set(True)
    place(LAYOUT)
    if save:
        # the scene and what it uses, no window/screen data: the startup file's file browsers
        # carry local folders (see cad/check_private.py)
        bpy.data.libraries.write(os.path.join(_HERE, "gear_toys.blend"), {bpy.context.scene}, compress=True)
    return col


def _part_phase(kind, layer_world, flipped):
    """(teeth, tooth-center angle in the part's frame after turning over) on a world layer."""
    layers = {int(k): v for k, v in json.loads(bpy.data.objects[f"Toy_{kind}"]["layers"]).items()}
    layer = 1 - layer_world if flipped else layer_world
    if layer not in layers:
        return None
    teeth, ph = layers[layer]
    return teeth, (-ph if flipped else ph)


def _part_matrix(xy, flipped, rot):
    m = Matrix.Translation((xy[0], xy[1], BED))
    m = m @ Matrix.Rotation(rot, 4, "Z")
    if flipped:
        m = m @ Matrix.Translation((0, 0, PART_H)) @ Matrix.Rotation(math.pi, 4, "X")
    return m


def _solve(layout):
    """Rotation of each part so teeth interlock with every part already placed it meshes."""
    rot = {}
    for name, kind, ij, flip, _ in layout:
        xy = hole_xy(*ij)
        r = 0.0
        for other, okind, oij, oflip, _ in layout:
            if other not in rot:
                continue
            oxy = hole_xy(*oij)
            dist = math.hypot(xy[0] - oxy[0], xy[1] - oxy[1])
            for lw in (0, 1):
                a, b = _part_phase(okind, lw, oflip), _part_phase(kind, lw, flip)
                if a is None or b is None or abs(MODULE * (a[0] + b[0]) / 2 - dist) > 1e-6:
                    continue
                zf, phf = a
                zm, phm = b
                d = math.atan2(xy[1] - oxy[1], xy[0] - oxy[0])
                pf, pm = 2 * math.pi / zf, 2 * math.pi / zm
                off = phf + rot[other] - d
                off -= round(off / pf) * pf
                want = d + math.pi - off * zf / zm + pm / 2
                r = want - phm
                r -= round(r / pm) * pm
        rot[name] = r
    return rot


def place(layout, belts=BELTS, band_posts=BAND_POSTS):
    old = bpy.data.collections.get("Gear Toys Layout")
    if old is not None:
        for o in list(old.all_objects):
            _remove(o)
        bpy.data.collections.remove(old)
    col = _collection("Gear Toys Layout")
    board = bpy.data.objects.new("Lay Board", bpy.data.objects["Toy_Board"].data)
    col.objects.link(board)
    board.color = bpy.data.objects["Toy_Board"].color
    rot = _solve(layout)
    placed = {}
    for k, (name, kind, ij, flip, crank) in enumerate(layout):
        xy = hole_xy(*ij)
        m = _part_matrix(xy, flip, rot[name])
        ob = bpy.data.objects.new(f"Lay {name}", bpy.data.objects[f"Toy_{kind}"].data)
        col.objects.link(ob)
        ob.matrix_world = m
        ob.color = COLORS[k % len(COLORS)]
        ob["turning"] = name
        placed[name] = ob
        post = bpy.data.objects.new(f"Lay {name} Post", bpy.data.objects["Toy_Post"].data)
        col.objects.link(post)
        post.matrix_world = Matrix.Translation((xy[0], xy[1], 0))
        post.color = bpy.data.objects["Toy_Post"].color
        _hardware(col, name, xy)
        if crank:
            # in the first crank hole, standing on the face of the 45T layer that looks up
            layers = {int(q): v for q, v in json.loads(bpy.data.objects[f"Toy_{kind}"]["layers"]).items()}
            big = [q for q, v in layers.items() if v[0] == BIG][0]
            face_z = BED + PART_H if flip else BED + (FACE_T if big == 0 else PART_H)
            a = rot[name] + (-1 if flip else 1) * math.pi / WINDOWS
            cr = bpy.data.objects.new(f"Lay {name} Crank", bpy.data.objects["Toy_Crank"].data)
            col.objects.link(cr)
            cr.matrix_world = Matrix.Translation((xy[0] + CRANK_AT * math.cos(a), xy[1] + CRANK_AT * math.sin(a),
                                                  face_z - PIN_L))
            cr.color = bpy.data.objects["Toy_Crank"].color
            cr["crank"] = name
    for i, j in band_posts:
        x, y = hole_xy(i, j)
        bp = bpy.data.objects.new(f"Lay Band Post {i}{j}", bpy.data.objects["Toy_Band_Post"].data)
        col.objects.link(bp)
        bp.matrix_world = Matrix.Translation((x, y, 0))
        bp.color = bpy.data.objects["Toy_Band_Post"].color
    lay = {name: (kind, ij, flip) for name, kind, ij, flip, _ in layout}
    for na, la, nb, lb in belts:
        ends = []
        for nm, lw in ((na, la), (nb, lb)):
            kind, ij, flip = lay[nm]
            g = KINDS[kind].get("pulleys", {}).get(1 - lw if flip else lw)
            if g is None:
                raise ValueError(f"{nm} has no pulley on layer {lw}")
            ends.append((Vector((*hole_xy(*ij), BED + lw * FACE + FACE / 2)), g + BAND_T / 2))
        _band(col, f"Lay Belt {na}{nb}", *ends)
    cranks = [o for o in col.objects if o.get("crank")]
    if cranks and band_posts:
        c = cranks[0].matrix_world.translation
        x, y = hole_xy(*band_posts[0])
        _band(col, "Lay Spring", (Vector((c.x, c.y, c.z + PIN_L + 7.0)), 5.0 + BAND_T / 2),
              (Vector((x, y, 22.0)), 5.0 + BAND_T / 2))
    return col, rot


BAND_T = 1.6   # rubber band thickness (stand-in)


def _band(col, name, end_a, end_b, n=24):
    """Stand-in band: round the far side of each circle (center, radius), straight between."""
    (ca, ra), (cb, rb) = end_a, end_b
    d = math.hypot(cb.x - ca.x, cb.y - ca.y)
    th = math.atan2(cb.y - ca.y, cb.x - ca.x)
    be = math.asin((ra - rb) / d)
    t = math.pi / 2 + be
    pts = []
    for k in range(n + 1):  # a: from th + t round the back to th - t + 2 pi
        u = th + t + (2 * math.pi - 2 * t) * k / n
        pts.append((ca.x + ra * math.cos(u), ca.y + ra * math.sin(u), ca.z))
    for k in range(n + 1):  # b: from th - t round the front to th + t
        u = th - t + 2 * t * k / n
        pts.append((cb.x + rb * math.cos(u), cb.y + rb * math.sin(u), cb.z))
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = BAND_T / 2
    cu.bevel_resolution = 2
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for q, (x, y, z) in zip(sp.points, pts):
        q.co = (x, y, z, 1)
    sp.use_cyclic_u = True
    ob = bpy.data.objects.new(name, cu)
    col.objects.link(ob)
    ob.color = (0.75, 0.1, 0.1, 1)
    return ob


def _hardware(col, name, xy):
    """Stand-ins: M5 bolt and nut (grey), the kit (orange), 625s (steel, seal black)."""
    x, y = xy
    steel, dark, black = (0.72, 0.72, 0.75, 1), (0.25, 0.25, 0.28, 1), (0.05, 0.05, 0.05, 1)
    top = BED + PART_H
    rc = 8.0 / math.sqrt(3)
    parts = [
        ("Bolt", _lathe("bolt", [(0, -PEG_L + 0.5), (2.5, -PEG_L + 0.5), (2.5, top + WASHER_T), (4.25, top + WASHER_T),
                                  (4.25, top + WASHER_T + 5.0), (0, top + WASHER_T + 5.0)], 32), dark),
        ("Nut", _prism("nut", [(rc * math.cos(math.pi / 3 * i), rc * math.sin(math.pi / 3 * i)) for i in range(6)],
                       NUT_TOP - 4.0, NUT_TOP), dark),
        ("Washer", _lathe("w", [(KIT_BORE_R, top), (KIT_R, top), (KIT_R, top + WASHER_T), (KIT_BORE_R, top + WASHER_T)]),
         (0.9, 0.45, 0.1, 1)),
        ("Spacer", _lathe("s", [(KIT_BORE_R, BED + BEARING_W), (KIT_R, BED + BEARING_W), (KIT_R, top - BEARING_W),
                                (KIT_BORE_R, top - BEARING_W)]), (0.9, 0.45, 0.1, 1)),
    ]
    for z0 in (BED, top - BEARING_W):
        parts += [("625 Outer", _lathe("o", [(13.3 / 2, z0), (8.0, z0), (8.0, z0 + BEARING_W), (13.3 / 2, z0 + BEARING_W)]), steel),
                  ("625 Seal", _lathe("e", [(4.2, z0 + 0.25), (13.3 / 2, z0 + 0.25), (13.3 / 2, z0 + BEARING_W - 0.25),
                                            (4.2, z0 + BEARING_W - 0.25)]), black),
                  ("625 Inner", _lathe("i", [(2.5, z0), (4.2, z0), (4.2, z0 + BEARING_W), (2.5, z0 + BEARING_W)]), steel)]
    for nm, me, c in parts:
        ob = bpy.data.objects.new(f"Lay {name} {nm}", me)
        col.objects.link(ob)
        ob.matrix_world = Matrix.Translation((x, y, 0))
        ob.color = c
        ob["hardware"] = nm


# ---- checks ----------------------------------------------------------------------------------

def _bm_world(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.transform(ob.matrix_world)
    return bm


def _tree(ob):
    bm = _bm_world(ob)
    t = BVHTree.FromBMesh(bm)
    bm.free()
    return t


def _overlap(a, b):
    return len(_tree(a).overlap(_tree(b)))


def _backlash(fixed, moving, axis_xy, r_pitch, step=0.0005):
    """Free turn of `moving` about its axis each way before it touches `fixed` (mm at its pitch circle)."""
    tf = _tree(fixed)
    m0 = moving.matrix_world.copy()
    out = []
    for sgn in (1, -1):
        a = 0.0
        while a < 0.2:
            a += step
            moving.matrix_world = (Matrix.Translation((axis_xy[0], axis_xy[1], 0)) @ Matrix.Rotation(sgn * a, 4, "Z")
                                   @ Matrix.Translation((-axis_xy[0], -axis_xy[1], 0)) @ m0)
            if tf.overlap(_tree(moving)):
                break
        out.append(a * r_pitch)
    moving.matrix_world = m0
    return out


def _layer_of(z):
    """World layer (0, 1) strictly containing z, or None (on a layer face, or outside)."""
    u = (z - BED) / FACE
    if u <= 1e-4 or u >= 2 - 1e-4 or abs(u - 1) < 1e-4:
        return None
    return int(u)


def _envelope(ob):
    """{world layer: largest radius} of a turning part round its own axis. Vertices on the
    layer faces are left out (each layer has vertices inside it: the tooth chamfers, the
    pulley grooves), so a face shared by two layers counts for neither."""
    c = ob.matrix_world.translation
    env = {}
    for v in ob.data.vertices:
        w = ob.matrix_world @ v.co
        lw = _layer_of(w.z)
        if lw is not None:
            env[lw] = max(env.get(lw, 0.0), math.hypot(w.x - c.x, w.y - c.y))
    return env


def _samples(ob, step=0.5):
    """World points along every edge of a mesh, `step` apart."""
    mw = ob.matrix_world
    vs = [mw @ v.co for v in ob.data.vertices]
    for e in ob.data.edges:
        a, b = vs[e.vertices[0]], vs[e.vertices[1]]
        n = max(1, int((b - a).length / step))
        for k in range(n + 1):
            yield a.lerp(b, k / n)


def _meshing(lay, na, nb, lw):
    (ka, ia, fa), (kb, ib, fb) = lay[na], lay[nb]
    pa, pb = _part_phase(ka, lw, fa), _part_phase(kb, lw, fb)
    d = GRID * math.hypot(ia[0] - ib[0], ia[1] - ib[1])
    return bool(pa and pb and abs(MODULE * (pa[0] + pb[0]) / 2 - d) < 1e-6)


def _layout_problems(layout, col, clear):
    """Turning parts that would touch as they turn (other than gears meshing on a layer), and
    anything standing still inside a turning part's sweep (posts, band posts, cranks' sweeps)."""
    out = []
    lay = {name: (kind, ij, flip) for name, kind, ij, flip, _ in layout}
    obs = {o["turning"]: o for o in col.objects if o.get("turning")}
    env = {n: _envelope(o) for n, o in obs.items()}
    names = list(obs)
    for i, na in enumerate(names):
        for nb in names[i + 1:]:
            ca, cb = obs[na].matrix_world.translation, obs[nb].matrix_world.translation
            d = math.hypot(ca.x - cb.x, ca.y - cb.y)
            for lw in set(env[na]) & set(env[nb]):
                if env[na][lw] + env[nb][lw] > d - clear and not _meshing(lay, na, nb, lw):
                    out.append(f"layout {na} / {nb} sweeps meet on layer {lw}: {d - env[na][lw] - env[nb][lw]:.2f}")
            if _meshing(lay, na, nb, 0) or _meshing(lay, na, nb, 1):
                hit = _overlap(obs[na], obs[nb])
                if hit:
                    out.append(f"layout {na} / {nb} teeth touch: {hit}")
    # still things (and each crank's sweep) against every other part's sweep
    for o in col.objects:
        if o.type != "MESH" or o.get("turning") or o.name == "Lay Board":
            continue
        own = o.get("crank") or o.name.split(" ")[1]
        for nb, q in obs.items():
            if nb == own:
                continue
            c = q.matrix_world.translation
            if o.get("crank"):
                pc = obs[own].matrix_world.translation
                dd = math.hypot(c.x - pc.x, c.y - pc.y)
                lws = {_layer_of(p.z) for p in _samples(o)} - {None}
                reach = [env[nb][lw] for lw in lws if lw in env[nb]]
                if reach and dd - max(reach) < CRANK_AT + 5.5 + clear:
                    out.append(f"crank of {own} sweeps into {nb}: {dd - max(reach) - CRANK_AT - 5.5:.2f}")
                continue
            worst = 99.0
            for w in _samples(o):
                r = env[nb].get(_layer_of(w.z))
                if r is not None:
                    worst = min(worst, math.hypot(w.x - c.x, w.y - c.y) - r)
            if worst < clear:
                out.append(f"{o.name} inside the sweep of {nb}: {worst:.2f}")
    return out


def check(clear=0.5):
    """Meshing pairs at their grid spacing, the sample layout, and clearances round one part.
    Returns a list of problems (empty when all is well)."""
    problems = []
    # 1. pairs at their spacing: (kind, over, kind, over, holes apart). Each meshing pair must
    # turn a little each way and not too far; every other layer must stay clear.
    pairs = [("Gear_15T", False, "Gear_15T", False, (1, 0)), ("Gear_45T", False, "Gear_15T", False, (2, 0)),
             ("Gear_45T", False, "Gear_45T", False, (3, 0)), ("Gear_45T", False, "Compound_45_15", True, (2, 0)),
             ("Compound_45_15", True, "Gear_15T", True, (2, 0)), ("Gear_15T", True, "Gear_15T", True, (1, 0)),
             ("Compound_45_15", False, "Compound_45_15", False, (3, 0)), ("Step_Pulley", False, "Gear_15T", False, (2, 0)),
             ("Gear_15T", False, "Gear_15T", True, (1, 0)), ("Gear_15T", False, "Gear_15T", False, (1, 1))]
    for ka, fa, kb, fb, (di, dj) in pairs:
        lay = [("P", ka, (0, 0), fa, False), ("Q", kb, (di, dj), fb, False)]
        col, rot = place(lay, belts=(), band_posts=())
        a, b = bpy.data.objects["Lay P"], bpy.data.objects["Lay Q"]
        lays = {n: (k, ij, f) for n, k, ij, f, _ in lay}
        zq = None
        for lw in (0, 1):
            if _meshing(lays, "P", "Q", lw):
                zq = _part_phase(kb, lw, fb)[0]
        line = f"pair {ka}{' over' if fa else ''} + {kb}{' over' if fb else ''}, {di},{dj} holes apart: "
        found = _layout_problems(lay, col, clear)
        if zq is None:
            line += "no mesh, " + ("clear" if not found else "; ".join(found))
        else:
            bl = _backlash(a, b, hole_xy(di, dj), MODULE * zq / 2)
            line += f"free turn {bl[0]:.2f} / {bl[1]:.2f} mm" + ("" if not found else "; " + "; ".join(found))
            if min(bl) < 0.05 or max(bl) > 0.6:
                found.append("backlash")
        print("[CHECK]", line)
        if found:
            problems.append(line)
    # 2. one part on its post: nothing standing still within `clear` of it, the bearings'
    # inner races clear of it (the outer races sit in it; a seal is fixed in its outer race
    # and turns with it, so it may come close)
    col, rot = place([("S", "Gear_45T", (0, 0), False, False)], belts=(), band_posts=())
    part = bpy.data.objects["Lay S"]
    tp = _tree(part)
    for o in col.objects:
        h = o.get("hardware", "")
        if o is part or o.name == "Lay Board" or h == "625 Outer":
            continue
        worst = min(tp.find_nearest(q)[3] for q in _samples(o))
        hit = len(tp.overlap(_tree(o)))
        need = {"625 Inner": 0.3, "625 Seal": 0.0}.get(h, clear)
        print(f"[CHECK] {o.name}: nearest {worst:.2f}, overlap {hit}")
        if hit or worst < need:
            problems.append(f"{o.name} {worst:.2f}")
    # 3. the sample layout
    col, rot = place(LAYOUT)
    found = _layout_problems(LAYOUT, col, clear)
    print("[CHECK] layout:", "ok" if not found else "; ".join(found))
    problems += found
    for p in problems:
        print("[!]", p)
    return problems


# ---- export ----------------------------------------------------------------------------------

def export(out_dir=None):
    out_dir = out_dir or os.path.join(_HERE, "export", "gear_toys")
    os.makedirs(out_dir, exist_ok=True)
    res = {}
    names = dict(SET)
    for key, n in names.items():
        ob = bpy.data.objects[f"Toy_{key}"]
        count = f"_x{n}" if n > 1 else ""
        res[key] = sg.export_stl(ob, os.path.join(out_dir, f"Toy_{key}{count}.stl"))
    col = bpy.data.collections["Gear Toys"]
    for d in TUNE:
        tmp = _ring("Toy Tune", SPACER_L + d, col)
        res[f"Spacer {SPACER_L + d:.1f}"] = sg.export_stl(tmp, os.path.join(out_dir, f"Toy_Spacer_{SPACER_L + d:.1f}.stl"))
        _remove(tmp)
    for k, v in res.items():
        print(f"[EXPORT] {k}: shells {v[1]}, non-manifold {v[2]}, missing {v[3]}")
    return res

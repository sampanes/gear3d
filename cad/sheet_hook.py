"""Headphone hook for a stepped hole in a two-layer sheet wall (run inside Blender). See
docs/sheet-hook.md.

build(save)      -- the hook in its print pose (collection "Sheet Hook") and, for renders, the
                    hook on a cut-down model of the wall ("Sheet Hook Assembly")
check()          -- points inside / outside the solid, and the fit numbers: the hook goes in
                    when lifted, catches the inner layer when dropped, clears ceiling and side wall
export(out_dir)  -- one STL

Model frame: the wall's front face is y = 0, the hook sits in front (y > 0), the wall behind
(y < 0); z up; the hole's centre at x = z = 0. The plate and arm are one side profile (y, z)
extruded across x; the plug and the tongue are extruded the other ways. Printed lying on its
side (x up): every layer is a side profile, so no overhangs and the arm bends along its layers.
"""

import importlib.util
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


gt = _load("gear_toys")
sg = gt.sg

# ==== the wall (measured) ====
OUTER_D = 22.45          # hole in the front layer
INNER_D = 16.6           # hole in the second layer (a 16.5 crest passes, 16.8 does not)
LAYER = 2.75             # each layer; the inner layer's back is 2 * LAYER behind the face
CEILING = 18.0           # desk underside above the hole centre
SIDE_X = 16.5            # side wall, to one side of the hole centre
BAND_R, BAND_T = 85.0, 20.0   # headband: inner radius, thickness with its cushion
SIDE_DROP = (49.2, 34.4, 156.0)   # side wall reaches this far down from the ceiling: at the face,
                                  # at its far end, and how far out that end is

# ==== the hook ====
LIFT = 5.6               # lift to put it on / take it off
PLUG_R = 11.0            # plug in the front hole (0.22 radial clearance)
PLUG_TOP = -2.6          # plug cut flat here so it still fits the hole when lifted
PLUG_DEPTH = 2.5         # into the 2.75 front layer: the plate seats on the face
TONGUE_W = 10.0          # through the inner hole
TONGUE_Z = (-6.0, -0.5)
LIP_GAP = 0.5            # lip's front face behind the inner layer's back
LIP_T, LIP_BOTTOM = 3.0, -11.5
PLATE_W, PLATE_T = 26.0, 5.0
PLATE_TOP, FOOT = 8.0, -60.0
ARM_TOP = -52.0          # saddle top: the headband's top, cushion and all, clears the
                         # side wall's lower edge
SADDLE = (16.0, 56.0)    # flat saddle along y (a headband is about 40 wide)
TIP, TIP_H = 62.0, 6.0   # tip lip keeps the band on
CHAMFER = 3.0            # 45-degree chamfers on the saddle's top edges

WALL_COLOR = (0.55, 0.55, 0.58, 1)
HOOK_COLOR = (0.9, 0.42, 0.12, 1)


def _prism(name, poly, axis, a0, a1):
    """Closed prism: polygon `poly` (2D, counter-clockwise) extruded from a0 to a1 along axis
    "x" (poly in (y, z)), "y" (poly in (x, z)) or "z" (poly in (x, y))."""
    def co(p, a):
        u, v = p
        return {"x": (a, u, v), "y": (u, a, v), "z": (u, v, a)}[axis]
    bm = bmesh.new()
    lo = [bm.verts.new(co(p, a0)) for p in poly]
    hi = [bm.verts.new(co(p, a1)) for p in poly]
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(lo[::-1])
    bm.faces.new(hi)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def _boolean(me, other, op):
    """me <op> other with the EXACT solver; frees both inputs, returns the result."""
    a = bpy.data.objects.new("Bool A", me)
    b = bpy.data.objects.new("Bool B", other)
    for o in (a, b):
        bpy.context.scene.collection.objects.link(o)
    mod = a.modifiers.new("B", "BOOLEAN")
    mod.operation, mod.solver, mod.object = op, "EXACT", b
    out = bpy.data.meshes.new_from_object(a.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    out.name = me.name
    bpy.data.objects.remove(a)
    bpy.data.objects.remove(b)
    bpy.data.meshes.remove(me)
    bpy.data.meshes.remove(other)
    return out


def side_profile():
    """Plate, gusset, arm and tip lip in (y, z), counter-clockwise."""
    s0, s1 = SADDLE
    return [(0.0, FOOT), (TIP, FOOT), (TIP, ARM_TOP + TIP_H - 2), (TIP - 2, ARM_TOP + TIP_H),
            (s1 + 2, ARM_TOP + TIP_H), (s1, ARM_TOP + TIP_H - 2), (s1, ARM_TOP), (s0, ARM_TOP),
            (PLATE_T, ARM_TOP + (s0 - PLATE_T)), (PLATE_T, PLATE_TOP - 1), (PLATE_T - 1, PLATE_TOP),
            (0.0, PLATE_TOP)]


def lip_y():
    """Front and back face of the lip (y)."""
    front = -2 * LAYER - LIP_GAP
    return front, front - LIP_T


def tongue_profile():
    """Tongue and lip in (y, z): the tongue from inside the plate back through both layers,
    the lip dropping behind the inner layer (its back bottom corner chamfered)."""
    t0, t1 = TONGUE_Z
    f, b = lip_y()
    return [(0.4, t0), (0.4, t1), (b, t1), (b, LIP_BOTTOM + 1.0), (b + 1.0, LIP_BOTTOM),
            (f, LIP_BOTTOM), (f, t0)]


def plug_profile(n=24):
    """Plug in (x, z): the circle PLUG_R below PLUG_TOP."""
    a = math.acos(-PLUG_TOP / PLUG_R)      # half-angle from the bottom to the cut
    pts = [(PLUG_R * math.sin(t), -PLUG_R * math.cos(t)) for t in
           (-a + 2 * a * k / n for k in range(n + 1))]
    return pts


def hook_mesh():
    me = _prism("Sheet Hook", side_profile(), "x", -PLATE_W / 2, PLATE_W / 2)
    s0, s1 = SADDLE
    for sx in (1, -1):        # 45-degree chamfers along the saddle's top edges
        e = PLATE_W / 2
        tri = [(sx * (e - CHAMFER - 0.5), ARM_TOP + 0.5), (sx * (e + 0.5), ARM_TOP - CHAMFER - 0.5),
               (sx * (e + 0.5), ARM_TOP + 0.5)]
        if sx < 0:
            tri = tri[::-1]
        me = _boolean(me, _prism("Chamfer", tri, "y", s0 + 0.5, s1 - 0.5), "DIFFERENCE")
    me = _boolean(me, _prism("Plug", plug_profile(), "y", 0.8, -PLUG_DEPTH), "UNION")
    me = _boolean(me, _prism("Tongue", tongue_profile(), "x", -TONGUE_W / 2, TONGUE_W / 2), "UNION")
    return me


def _ring(name, r_out, r_hole, y0, y1, n=96):
    """A square of wall layer (r_out half-size) with a round hole, from y0 to y1."""
    outer = [(-r_out, -r_out), (r_out, -r_out), (r_out, r_out), (-r_out, r_out)]
    me = _prism(name, outer, "y", y1, y0)
    hole = bmesh.new()
    bmesh.ops.create_cone(hole, cap_ends=True, segments=n, radius1=r_hole, radius2=r_hole, depth=abs(y1 - y0) + 2)
    bmesh.ops.rotate(hole, verts=hole.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "X"))
    bmesh.ops.translate(hole, verts=hole.verts, vec=(0, (y0 + y1) / 2, 0))
    hm = bpy.data.meshes.new(name + " Hole")
    hole.to_mesh(hm)
    hole.free()
    return _boolean(me, hm, "DIFFERENCE")


def wall_meshes():
    """Front and inner layers round the hole, for the renders (marked as hardware)."""
    return [_ring("Front Layer", 22.0, OUTER_D / 2, 0.0, -LAYER),
            _ring("Inner Layer", 22.0, INNER_D / 2, -LAYER, -2 * LAYER)]


def print_matrix():
    """Model frame -> print pose: x up (lying on its side), resting on the bed."""
    return Matrix.Translation((0, 0, PLATE_W / 2)) @ Matrix.Rotation(-math.pi / 2, 4, "Y")


def build(save=False):
    for c in ("Sheet Hook Assembly", "Sheet Hook"):
        col = bpy.data.collections.get(c)
        if col is not None:
            for o in list(col.all_objects):
                gt._remove(o)
            bpy.data.collections.remove(col)
    col = gt._collection("Sheet Hook")
    asm = gt._collection("Sheet Hook Assembly")
    me = hook_mesh()
    pm = me.copy()
    pm.transform(print_matrix())      # the exporter writes object-local coordinates
    ob = gt._object("Sheet_Hook", pm, col, HOOK_COLOR)
    ob.hide_render = True
    ob.hide_set(True)
    # assembly turned a quarter about z (model x -> world -y) so make.py's cutaway at
    # world y = 0 is the hook's side section
    turn = Matrix.Rotation(math.pi / 2, 4, "Z")
    a = gt._object("Asm Hook", me, asm, HOOK_COLOR)
    a.matrix_world = turn
    for wm in wall_meshes():
        w = gt._object("Asm " + wm.name, wm, asm, WALL_COLOR)
        w.matrix_world = turn
        w["hardware"] = True
    if save:
        gt.save_scene(os.path.join(_HERE, "sheet_hook.blend"), ("Sheet Hook", "Sheet Hook Assembly"))
    return col


def _solid(tree, p):
    """Ray parity: is model-frame point p inside the hook (whose mesh is in its print pose)?"""
    hits, o, d = 0, print_matrix() @ Vector(p), Vector((0.31, 0.17, 1.0)).normalized()
    while True:
        loc = tree.ray_cast(o, d)[0]
        if loc is None:
            return hits % 2 == 1
        hits += 1
        o = loc + d * 1e-4


def side_wall_bottom(y):
    """z of the side wall's lower edge at distance y out from the face."""
    at_face, at_end, length = SIDE_DROP
    return CEILING - (at_face + (at_end - at_face) * min(1.0, y / length))


def fit_numbers():
    """[(what, value, limit, ok)] for the fit, from the dimensions alone."""
    out = []
    r_out, r_in = OUTER_D / 2, INNER_D / 2
    drop = r_out - PLUG_R                 # hanging, the plug rests on the front hole's bottom
    # lifted: every plug outline point inside the front hole
    worst = max(math.hypot(x, z + LIFT) for x, z in plug_profile(96))
    out.append(("plug lifted, farthest from the front hole's centre", worst, r_out - 0.1, worst <= r_out - 0.1))
    # lifted: tongue and lip section (x within +-TONGUE_W/2, z from LIP_BOTTOM to the tongue top)
    corners = [(sx * TONGUE_W / 2, z + LIFT - drop) for sx in (1, -1) for z in (LIP_BOTTOM, TONGUE_Z[1])]
    worst = max(math.hypot(x, z) for x, z in corners)
    out.append(("tongue and lip lifted, farthest from the inner hole's centre", worst, r_in - 0.3, worst <= r_in - 0.3))
    # hanging: the tongue clears the inner hole, the lip overlaps the inner layer below it
    edge = -math.sqrt(r_in ** 2 - (TONGUE_W / 2) ** 2)     # inner hole edge under the tongue's corner
    gap = (TONGUE_Z[0] - drop) - edge
    out.append(("tongue above the inner hole's edge, hanging", gap, 0.3, gap >= 0.3))
    overlap = -r_in - (LIP_BOTTOM - drop)
    out.append(("lip below the inner hole, hanging", overlap, 2.5, overlap >= 2.5))
    room = CEILING - (PLATE_TOP - drop + LIFT)
    out.append(("ceiling above the lifted plate", room, 2.0, room >= 2.0))
    # the top of the headband's cushion, where the band passes the side wall, stays below the
    # wall's lower edge
    sag = BAND_R - math.sqrt(BAND_R ** 2 - SIDE_X ** 2)
    worst = max(ARM_TOP - drop + BAND_T - sag - side_wall_bottom(y) for y in range(int(SADDLE[0]), int(TIP) + 1))
    out.append(("headband cushion top below the side wall's lower edge (most negative is best)", worst, -4.0,
                worst <= -4.0))
    out.append(("plate edge from the side wall", SIDE_X - PLATE_W / 2, 2.0, SIDE_X - PLATE_W / 2 >= 2.0))
    return out


def check():
    problems = []
    for what, v, lim, ok in fit_numbers():
        line = f"{what}: {v:.2f} (limit {lim:.2f})"
        print("[CHECK]", line)
        if not ok:
            problems.append(line)
    bm = bmesh.new()
    bm.from_mesh(bpy.data.objects["Sheet_Hook"].data)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    f, b = lip_y()
    probes = [("plate", (0, PLATE_T / 2, 0), True),
              ("plug", (0, -PLUG_DEPTH / 2, -8), True),
              ("tongue in the inner layer", (0, -1.5 * LAYER, -3), True),
              ("lip", (0, (f + b) / 2, LIP_BOTTOM + 1.5), True),
              ("slot for the inner layer", (0, -1.5 * LAYER, -9.5), False),
              ("beside the tongue, above the plug", (8, -1.5, -1.5), False),
              ("saddle", (0, 36, ARM_TOP - 4), True),
              ("above the saddle", (0, 36, ARM_TOP + 1), False),
              ("saddle chamfer", (PLATE_W / 2 - 0.4, 36, ARM_TOP - 0.4), False),
              ("tip lip", (0, TIP - 3, ARM_TOP + TIP_H - 1), True)]
    for what, p, want in probes:
        got = _solid(tree, p)
        line = f"{what} {p}: solid {got} (want {want})"
        print("[CHECK]", line)
        if got != want:
            problems.append(line)
    return problems


def export(out_dir=None):
    out_dir = out_dir or os.path.join(_HERE, "export", "sheet_hook")
    os.makedirs(out_dir, exist_ok=True)
    ob = bpy.data.objects["Sheet_Hook"]
    res = sg.export_stl(ob, os.path.join(out_dir, "Sheet_Hook.stl"))
    print(f"[EXPORT] Sheet_Hook: shells {res[1]}, non-manifold {res[2]}, missing {res[3]}")
    return {"Sheet_Hook": res}


def render_scene():
    return "Sheet Hook Assembly"

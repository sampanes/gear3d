"""Headphone hook for a stepped hole in a two-layer sheet wall (run inside Blender). See
docs/sheet-hook.md.

build(save)      -- the hook in its print pose (collection "Sheet Hook") and, for renders, the
                    hook on a cut-down model of the wall ("Sheet Hook Assembly")
check()          -- points inside / outside the solid, and the fit numbers: the hook goes in
                    when lifted, catches the inner layer when dropped, clears ceiling and side wall
export(out_dir)  -- one STL

Model frame: the wall's front face is y = 0, the hook sits in front (y > 0), the wall behind
(y < 0); z up; the hole's centre at x = z = 0. The plate and arm are one side profile (y, z)
extruded across x; plug, tongue and disc are round sections (x, z) lofted along y, and the
whole is cut flat at x = +-PLATE_W / 2. Printed lying on that flat (x up): the arm bends along
its layers and every part starts on the bed, so no supports.
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

SCREW_HEAD = 16.0        # behind the face, on the hole's axis

# ==== the hook ====
# Sections are overlaps of circles (x, z). Hanging, the hook sits DROP lower than the model
# frame (the plug rests on the front hole's bottom); lifted to the stop, LIFT higher than that.
LIFT = 5.6               # lift to put it on / take it off
PLUG_R = 11.0            # plug's circles, in the 22.45 front hole
DROP = OUTER_D / 2 - PLUG_R
PLUG_DEPTH = 2.5         # into the 2.75 front layer: the plate seats on the face
PLUG_LEAD = 0.5          # chamfer round the plug's back edge
TONGUE_R = (7.9, 7.6)    # tongue's circles: on the hole centre hanging, on it lifted
DISC_R = 7.8             # disc behind the inner layer: on the hole centre lifted
DISC_GAP = 0.5           # disc's front face behind the inner layer's back
DISC_T = 5.0
DISC_LEAD = 1.0          # chamfer round the disc's back edge
PLATE_W, PLATE_T = 14.0, 5.0
PLATE_TOP, FOOT = 8.0, -60.0
ARM_TOP = -52.0          # saddle top: the headband's top, cushion and all, clears the
                         # side wall's lower edge
SADDLE = (16.0, 56.0)    # flat saddle along y (a headband is about 40 wide)
TIP, TIP_H = 62.0, 6.0   # tip lip keeps the band on
CHAMFER = 2.0            # 45-degree chamfers on the saddle's top edges

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


def disc_y():
    """Front and back face of the disc (y)."""
    front = -2 * LAYER - DISC_GAP
    return front, front - DISC_T


def section(hi, lo, w, n=32):
    """(x, z) outline, counter-clockwise, of the overlap of circle hi = (centre z, r) and the
    circle lo below it, clipped to |x| <= w: hi's lower arc, then lo's upper arc."""
    (zh, rh), (zl, rl) = hi, lo
    xs = [-w + 2 * w * k / (n - 1) for k in range(n)]
    return ([(x, zh - math.sqrt(rh * rh - x * x)) for x in xs] +
            [(x, zl + math.sqrt(rl * rl - x * x)) for x in reversed(xs)])


def plug_circles(c=0.0):
    """Plug: the upper circle hangs on the front hole's bottom; the lower one meets the hole's
    top at the lift stop. c shrinks both (chamfer)."""
    return (0.0, PLUG_R - c), (-(LIFT - 2 * DROP), PLUG_R - c)


def tongue_circles():
    return (DROP, TONGUE_R[0]), (DROP - LIFT, TONGUE_R[1])


def disc_circles(c=0.0):
    return (DROP - LIFT, DISC_R - c), (DROP - LIFT, DISC_R - c)


def _loft(name, rings):
    """Closed solid through [(y, outline (x, z))], outlines of equal length."""
    bm = bmesh.new()
    vs = [[bm.verts.new((x, y, z)) for x, z in poly] for y, poly in rings]
    n = len(vs[0])
    for r0, r1 in zip(vs, vs[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    bm.faces.new(vs[0])
    bm.faces.new(vs[-1][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def hook_mesh():
    w = PLATE_W / 2
    me = _prism("Sheet Hook", side_profile(), "x", -w - 0.5, w + 0.5)
    wc = w + 0.3               # sections run past the cut so it makes every flat side at once
    me = _boolean(me, _loft("Plug", [(0.8, section(*plug_circles(), wc)),
                                     (-PLUG_DEPTH + PLUG_LEAD, section(*plug_circles(), wc)),
                                     (-PLUG_DEPTH, section(*plug_circles(PLUG_LEAD), wc - PLUG_LEAD))]), "UNION")
    f, b = disc_y()
    me = _boolean(me, _loft("Tongue", [(-PLUG_DEPTH + 0.3, section(*tongue_circles(), w + 0.15)),
                                       (f - 0.4, section(*tongue_circles(), w + 0.15))]), "UNION")
    me = _boolean(me, _loft("Disc", [(f, section(*disc_circles(), wc)),
                                     (b + DISC_LEAD, section(*disc_circles(), wc)),
                                     (b, section(*disc_circles(DISC_LEAD), wc - DISC_LEAD))]), "UNION")
    for sx in (1, -1):        # the flat sides
        box = [(-40, -80), (90, -80), (90, 40), (-40, 40)]
        me = _boolean(me, _prism("Cut", box, "x", sx * w, sx * (w + 20)), "DIFFERENCE")
    s0, s1 = SADDLE
    for sx in (1, -1):        # 45-degree chamfers along the saddle's top edges
        tri = [(sx * (w - CHAMFER - 0.5), ARM_TOP + 0.5), (sx * (w + 0.5), ARM_TOP - CHAMFER - 0.5),
               (sx * (w + 0.5), ARM_TOP + 0.5)]
        if sx < 0:
            tri = tri[::-1]
        me = _boolean(me, _prism("Chamfer", tri, "y", s0 + 0.5, s1 - 0.5), "DIFFERENCE")
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


def _farthest(poly, dz):
    """Largest distance of the outline, moved up dz, from the hole's axis."""
    return max(math.hypot(x, z + dz) for x, z in poly)


def fit_numbers():
    """[(what, value, limit, ok)] for the fit, from the dimensions alone."""
    out = []
    r_out, r_in = OUTER_D / 2, INNER_D / 2
    w = PLATE_W / 2
    plug, tongue = section(*plug_circles(), w, 96), section(*tongue_circles(), w, 96)
    disc = section(*disc_circles(), w, 96)
    up = LIFT - DROP                       # model frame -> lifted to the stop
    v = r_out - _farthest(plug, up)
    out.append(("plug inside the front hole at the lift stop", v, 0.0, v >= -1e-6))
    v = r_in - max(_farthest(disc, up), _farthest(tongue, up))
    out.append(("disc and tongue clear of the inner hole at the lift stop", v, 0.4, v >= 0.4))
    v = r_in - _farthest(tongue, -DROP)
    out.append(("tongue clear of the inner hole, hanging", v, 0.3, v >= 0.3))
    # hanging, the disc reaches below the inner hole: at the middle and at its flat sides
    zc = -LIFT
    v = -r_in - (zc - DISC_R)
    out.append(("disc below the inner hole, hanging, middle", v, 3.0, v >= 3.0))
    v = -math.sqrt(r_in ** 2 - w * w) - (zc - math.sqrt(DISC_R ** 2 - w * w))
    out.append(("disc below the inner hole, hanging, flat sides", v, 3.0, v >= 3.0))
    v = SCREW_HEAD + disc_y()[1]
    out.append(("disc's back short of the screw head", v, 3.0, v >= 3.0))
    room = CEILING - (PLATE_TOP + up)
    out.append(("ceiling above the lifted plate", room, 2.0, room >= 2.0))
    # the top of the headband's cushion, where the band passes the side wall, stays below the
    # wall's lower edge
    sag = BAND_R - math.sqrt(BAND_R ** 2 - SIDE_X ** 2)
    worst = max(ARM_TOP - DROP + BAND_T - sag - side_wall_bottom(y) for y in range(int(SADDLE[0]), int(TIP) + 1))
    out.append(("headband cushion top below the side wall's lower edge (most negative is best)", worst, -4.0,
                worst <= -4.0))
    out.append(("plate edge from the side wall", SIDE_X - w, 2.0, SIDE_X - w >= 2.0))
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
    f, b = disc_y()
    zd = DROP - LIFT
    probes = [("plate", (0, PLATE_T / 2, 0), True),
              ("plug", (0, -PLUG_DEPTH / 2, -10), True),
              ("tongue in the inner layer", (0, -1.5 * LAYER, 1.5), True),
              ("tongue, near a flat side", (6.8, -1.5 * LAYER, -2.9), True),
              ("disc", (0, (f + b) / 2, zd - DISC_R + 0.5), True),
              ("disc's chamfer", (0, b + 0.2, zd - DISC_R + 0.2), False),
              ("slot for the inner layer", (0, -1.5 * LAYER, -9.0), False),
              ("beyond a flat side", (PLATE_W / 2 + 0.1, (f + b) / 2, zd), False),
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

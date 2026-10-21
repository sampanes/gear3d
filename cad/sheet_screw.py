"""Coarse printed screw for a plain 17 mm hole in thin sheet (run inside Blender). See
docs/sheet-screw.md.

build(save)      -- one screw per CRESTS entry (collection "Sheet Screw"), head down on the bed,
                    and the same row side by side for renders ("Sheet Screw Assembly")
check()          -- measures each screw (rays) against its row: crest and root diameter, groove
                    width, and the dots on the head
export(out_dir)  -- one STL per variant, named by its number and crest diameter

Round 2 (round 1, all crests over the hole at 17.6 / 18.2, did not go in): the variants differ
in one thing only, the thread's outside (crest) diameter, stepping across the hole so the
test print shows which one fits. The thread is the same on all: DEPTH deep, ROOT_GROOVE wide at
the root (room for the 2 mm sheet), 45-degree flanks, a flat on the crest, the first turn
ramping up from nothing so it starts. Each head carries its number as dots sunk into its flat
top face (1 dot = variant 1), in a row, easy to count.

Each screw body is one surface r(theta, z) closed by two caps; the dots are cut from it with an
EXACT difference. Units mm. z = 0 is the head's underside, the thread runs up to LENGTH, the
head sits below 0.
"""

import importlib.util
import math
import os

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

_HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(_HERE, name + ".py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


gt = _load("gear_toys")
sg = gt.sg

# ==== the hole and the sheet ====
HOLE = 17.0              # plain hole diameter
SHEET = 2.0              # sheet thickness: the root groove must be wider

# ==== the screw ====
CRESTS = (16.2, 16.5, 16.8, 17.1, 17.4)   # outside diameters: across the hole in 0.3 steps
DEPTH = 0.6              # thread depth (root diameter = crest - 1.2)
ROOT_GROOVE = 2.3        # groove width at the root
CREST_FLAT = 0.6         # flat on each tooth's tip (1.5 lines of a 0.4 nozzle)
PITCH = CREST_FLAT + 2 * DEPTH + ROOT_GROOVE   # 4.1
LENGTH = 12.0            # thread length into the hole
TIP_CHAMFER = 0.6        # off the root radius over the last 0.6 at the tip
HEAD_D = 28.0
HEAD_H = 5.0
HEAD_CHAMFER = 0.5
RIBS, RIB_DEPTH = 24, 0.3            # finger grip round the head
DOT_D, DOT_DEPTH, DOT_STEP = 2.6, 0.8, 4.2   # variant dots in the head's top face

N_THETA = 120            # 3 degrees: 0.003 off a true circle at the crest
DZ = 0.08                # along the axis: 7 rows across a crest flat
GAP = 34.0               # spacing in the render row


def _thread_r(theta, z, crest_d):
    root = crest_d / 2 - DEPTH
    s = (z - PITCH * theta / (2 * math.pi)) % PITCH
    if s < CREST_FLAT:
        d = DEPTH
    elif s < CREST_FLAT + DEPTH:
        d = DEPTH - (s - CREST_FLAT)
    elif s < CREST_FLAT + DEPTH + ROOT_GROOVE:
        d = 0.0
    else:
        d = s - (CREST_FLAT + DEPTH + ROOT_GROOVE)
    ramp = min(1.0, max(0.0, (LENGTH - z) / PITCH))    # first turn grows from nothing
    tip = max(0.0, z - (LENGTH - TIP_CHAMFER))         # 45-degree chamfer on the root
    return root - tip + d * ramp


def _head_r(theta, chamfer):
    return HEAD_D / 2 - chamfer - RIB_DEPTH * (1 - math.cos(RIBS * theta)) / 2


def dot_xy(n):
    return [((k - (n - 1) / 2) * DOT_STEP, 0.0) for k in range(n)]


def screw_mesh(name, crest_d):
    """One closed surface: rings of N_THETA points from the head's top face up to the tip."""
    thetas = [2 * math.pi * i / N_THETA for i in range(N_THETA)]
    rings = []
    for z, ch in ((-HEAD_H, HEAD_CHAMFER), (-HEAD_H + HEAD_CHAMFER, 0.0), (-HEAD_CHAMFER, 0.0), (0.0, HEAD_CHAMFER)):
        rings.append([(_head_r(t, ch), z) for t in thetas])
    n = int(round(LENGTH / DZ))
    for k in range(n + 1):
        z = LENGTH * k / n
        rings.append([(_thread_r(t, z, crest_d), z) for t in thetas])
    bm = bmesh.new()
    vs = [[bm.verts.new((r * math.cos(t), r * math.sin(t), z)) for (r, z), t in zip(ring, thetas)] for ring in rings]
    for a, b in zip(vs, vs[1:]):
        for i in range(N_THETA):
            j = (i + 1) % N_THETA
            bm.faces.new((a[i], a[j], b[j], b[i]))
    for ring, z, flip in ((vs[0], -HEAD_H, True), (vs[-1], LENGTH, False)):
        c = bm.verts.new((0, 0, z))
        for i in range(N_THETA):
            j = (i + 1) % N_THETA
            bm.faces.new((c, ring[j], ring[i]) if flip else (c, ring[i], ring[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def _cut_dots(me, n):
    """Sink n dots into the head's top face (z = -HEAD_H) with an EXACT difference."""
    bm = bmesh.new()
    for x, y in dot_xy(n):
        geom = bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=DOT_D / 2, radius2=DOT_D / 2,
                                     depth=DOT_DEPTH + 1.0)
        bmesh.ops.translate(bm, vec=(x, y, -HEAD_H + (DOT_DEPTH - 1.0) / 2), verts=geom["verts"])
    cutter_me = bpy.data.meshes.new("Dot Cutter")
    bm.to_mesh(cutter_me)
    bm.free()
    cutter = bpy.data.objects.new("Dot Cutter", cutter_me)
    body = bpy.data.objects.new("Dot Body", me)
    for o in (cutter, body):
        bpy.context.scene.collection.objects.link(o)
    mod = body.modifiers.new("Dots", "BOOLEAN")
    mod.operation, mod.solver, mod.object = "DIFFERENCE", "EXACT", cutter
    dg = bpy.context.evaluated_depsgraph_get()
    out = bpy.data.meshes.new_from_object(body.evaluated_get(dg))
    out.name = me.name
    bpy.data.objects.remove(body)
    bpy.data.objects.remove(cutter)
    bpy.data.meshes.remove(cutter_me)
    bpy.data.meshes.remove(me)
    return out


def part_name(i):
    return f"Sheet_Screw_{i + 1}_D{CRESTS[i]:.1f}"


def build(save=False):
    for c in ("Sheet Screw Assembly", "Sheet Screw"):
        col = bpy.data.collections.get(c)
        if col is not None:
            for o in list(col.all_objects):
                gt._remove(o)
            bpy.data.collections.remove(col)
    col = gt._collection("Sheet Screw")
    asm = gt._collection("Sheet Screw Assembly")
    for i, crest_d in enumerate(CRESTS):
        me = _cut_dots(screw_mesh(part_name(i), crest_d), i + 1)
        shade = 0.35 + 0.12 * i
        ob = gt._object(part_name(i), me, col, (0.9, shade, 0.2, 1))
        ob.location.z = HEAD_H            # print pose: head's top face on the bed
        ob.hide_render = True
        ob.hide_set(True)
        a = gt._object(f"Asm Screw {i + 1}", me, asm, (0.9, shade, 0.2, 1))
        a.location.x = (i - (len(CRESTS) - 1) / 2) * GAP
    if save:
        gt.save_scene(os.path.join(_HERE, "sheet_screw.blend"), ("Sheet Screw", "Sheet Screw Assembly"))
    return col


def _tree(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    return tree


def measure(ob, theta, z0, z1, step=0.01):
    """Radius r(z) of `ob`'s surface along one half-plane through its axis, z0..z1 (local)."""
    tree = _tree(ob)
    d = Vector((math.cos(theta), math.sin(theta), 0))
    out = []
    for k in range(int(round((z1 - z0) / step)) + 1):
        z = z0 + k * step
        hit = tree.ray_cast(d * 40 + Vector((0, 0, z)), -d)
        out.append((z, (hit[0] - Vector((0, 0, z))).length if hit[0] is not None else 0.0))
    return out


def count_dots(ob, step=0.05):
    """Recesses met by a ray along the head's top face row (y = 0), each with its depth."""
    tree = _tree(ob)
    found, inside = [], False
    for k in range(int(HEAD_D / 2 / step) * 2 + 1):
        x = -HEAD_D / 2 + 1 + k * step
        if abs(x) > HEAD_D / 2 - 1:
            continue
        hit = tree.ray_cast(Vector((x, 0, -HEAD_H - 5)), Vector((0, 0, 1)))
        depth = hit[0].z + HEAD_H if hit[0] is not None else 0.0
        if depth > DOT_DEPTH / 2 and not inside:
            found.append(depth)
            inside = True
        elif depth > DOT_DEPTH / 2:
            found[-1] = max(found[-1], depth)
        elif depth < 0.01:
            inside = False
    return found


def check():
    """Each screw's measured profile and dots against its row. Returns a list of problems."""
    problems = []
    for i, crest_d in enumerate(CRESTS):
        ob = bpy.data.objects[part_name(i)]
        lo, hi = 0.3, LENGTH - PITCH      # full-depth thread (past the head step, before the ramp)
        root_r = crest_d / 2 - DEPTH
        for theta in (0.0, 1.3, 2.9, 4.4):
            prof = measure(ob, theta, lo, hi)
            rs = [r for _, r in prof]
            runs, start = [], None        # spans where the surface is at the root
            for z, r in prof:
                if r < root_r + 0.05 and start is None:
                    start = z
                elif r >= root_r + 0.05 and start is not None:
                    runs.append((start, z))
                    start = None
            whole = [b - a for a, b in runs if a > lo + 1e-6]   # cut off by the window's ends: skip
            got = (2 * min(rs), 2 * max(rs), min(whole) if whole else 0.0)
            line = (f"{part_name(i)} at {math.degrees(theta):.0f} deg: crest {got[1]:.2f} (want {crest_d:.2f}, "
                    f"hole {HOLE:.1f}), root {got[0]:.2f} (want {crest_d - 2 * DEPTH:.2f}), root groove "
                    f"{got[2]:.2f} (want {ROOT_GROOVE:.2f}, sheet {SHEET:.1f})")
            print("[CHECK]", line)
            if not (abs(got[1] - crest_d) < 0.04 and abs(got[0] - (crest_d - 2 * DEPTH)) < 0.04
                    and got[2] > ROOT_GROOVE - 0.12 and got[2] > SHEET):
                problems.append(line)
        dots = count_dots(ob)
        line = f"{part_name(i)}: {len(dots)} dot(s) {[round(d, 2) for d in dots]} deep (want {i + 1} at {DOT_DEPTH})"
        print("[CHECK]", line)
        if len(dots) != i + 1 or any(abs(d - DOT_DEPTH) > 0.02 for d in dots):
            problems.append(line)
    return problems


def export(out_dir=None):
    out_dir = out_dir or os.path.join(_HERE, "export", "sheet_screw")
    os.makedirs(out_dir, exist_ok=True)
    res = {}
    for i in range(len(CRESTS)):
        ob = bpy.data.objects[part_name(i)]
        res[part_name(i)] = sg.export_stl(ob, os.path.join(out_dir, part_name(i) + ".stl"))
    for k, v in res.items():
        print(f"[EXPORT] {k}: shells {v[1]}, non-manifold {v[2]}, missing {v[3]}")
    return res


def render_scene():
    """The variants in a row, for cad/make.py render."""
    return "Sheet Screw Assembly"

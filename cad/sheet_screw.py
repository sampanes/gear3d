"""Coarse printed screw for a plain hole in thin sheet (run inside Blender). See docs/sheet-screw.md.

build(save)      -- one screw per VARIANTS row (collection "Sheet Screw"), head down on the bed,
                    and the same row side by side for renders ("Sheet Screw Assembly")
check()          -- measures each screw's profile (rays at several angles) against its row:
                    root clears the hole, crest is the set oversize, grooves at the hole's edge
                    are at least the set width
export(out_dir)  -- one STL per variant, named by its groove width and crest diameter

The hole is plain and the sheet is rigid, so a thread cannot pass the edge without something
giving: the crest is a little bigger than the hole and the plastic teeth flex (or are shaved)
as it turns in. The coupon varies how much bigger (CREST) and how wide the grooves are where the
sheet's edge sits (GROOVE), so a test print shows which grips without stripping. The root stays
CLEAR inside the hole all the way round, and the first turn ramps up from nothing so it starts.

Each screw is one surface r(theta, z) closed by two caps, so it is a single closed solid with no
booleans. Flanks are 45 degrees (they print without support, head down); the crest has a flat.
Notches round the head's rim count the variant (1 notch = row 1).

Units mm. z = 0 is the head's underside, the thread runs up to LENGTH, the head sits below 0.
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
SHEET = 2.0              # sheet thickness its edge brings into the grooves
CLEAR = 0.2              # root to hole wall, each side
ROOT_R = HOLE / 2 - CLEAR            # 8.3
EDGE_R = HOLE / 2                    # 8.5: where the sheet's edge sits

# ==== the screw ====
LENGTH = 12.0            # thread length into the hole
CREST_FLAT = 0.6         # flat on each tooth's tip (1.5 lines of a 0.4 nozzle)
TIP_CHAMFER = 0.6        # off the root radius over the last 0.6 at the tip
HEAD_D = 28.0
HEAD_H = 5.0
HEAD_CHAMFER = 0.5
RIBS, RIB_DEPTH = 24, 0.3            # finger grip round the head
NOTCH_DEPTH, NOTCH_HALF = 1.5, math.radians(6)   # variant notches

# (crest diameter, groove width at the hole's edge): oversize 0.3 / 0.6 each side x groove 2.3 / 2.8
VARIANTS = ((17.6, 2.3), (17.6, 2.8), (18.2, 2.3), (18.2, 2.8))

N_THETA = 120          # 3 degrees: 0.003 off a true circle at the crest
DZ = 0.08               # along the axis: 7 rows across a crest flat
GAP = 34.0               # spacing in the render row


def profile(crest_d, groove):
    """(depth, root groove, tooth root width, pitch) of a 45-degree thread with these targets."""
    h = crest_d / 2 - ROOT_R
    w_root = groove - 2 * (EDGE_R - ROOT_R)   # the groove narrows 1:1 per side toward the root
    t_root = CREST_FLAT + 2 * h
    return h, w_root, t_root, t_root + w_root


def _thread_r(theta, z, crest_d, groove):
    h, w_root, _, pitch = profile(crest_d, groove)
    s = (z - pitch * theta / (2 * math.pi)) % pitch
    if s < CREST_FLAT:
        d = h
    elif s < CREST_FLAT + h:
        d = h - (s - CREST_FLAT)
    elif s < CREST_FLAT + h + w_root:
        d = 0.0
    else:
        d = s - (CREST_FLAT + h + w_root)
    ramp = min(1.0, max(0.0, (LENGTH - z) / pitch))    # first turn grows from nothing
    tip = max(0.0, z - (LENGTH - TIP_CHAMFER))         # 45-degree chamfer on the root
    return ROOT_R - tip + d * ramp


def _head_r(theta, notches, chamfer):
    r = HEAD_D / 2 - chamfer - RIB_DEPTH * (1 - math.cos(RIBS * theta)) / 2
    for j in range(notches):
        a = abs((theta - 2 * math.pi * j / notches + math.pi) % (2 * math.pi) - math.pi)
        r -= NOTCH_DEPTH * max(0.0, 1 - a / NOTCH_HALF)
    return r


def screw_mesh(name, crest_d, groove, notches):
    """One closed surface: rings of N_THETA points from the head's top face up to the tip."""
    thetas = [2 * math.pi * i / N_THETA for i in range(N_THETA)]
    rings = []
    for z, ch in ((-HEAD_H, HEAD_CHAMFER), (-HEAD_H + HEAD_CHAMFER, 0.0), (-HEAD_CHAMFER, 0.0), (0.0, HEAD_CHAMFER)):
        rings.append([(_head_r(t, notches, ch), z) for t in thetas])
    n = int(round(LENGTH / DZ))
    for k in range(n + 1):
        z = LENGTH * k / n
        rings.append([(_thread_r(t, z, crest_d, groove), z) for t in thetas])
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


def part_name(i):
    crest_d, groove = VARIANTS[i]
    return f"Sheet_Screw_{i + 1}_G{groove:.1f}_D{crest_d:.1f}"


def build(save=False):
    for c in ("Sheet Screw Assembly", "Sheet Screw"):
        col = bpy.data.collections.get(c)
        if col is not None:
            for o in list(col.all_objects):
                gt._remove(o)
            bpy.data.collections.remove(col)
    col = gt._collection("Sheet Screw")
    asm = gt._collection("Sheet Screw Assembly")
    colors = ((0.85, 0.55, 0.2, 1), (0.75, 0.62, 0.3, 1), (0.6, 0.6, 0.65, 1), (0.45, 0.5, 0.6, 1))
    for i, (crest_d, groove) in enumerate(VARIANTS):
        me = screw_mesh(part_name(i), crest_d, groove, i + 1)
        ob = gt._object(part_name(i), me, col, colors[i])
        ob.location.z = HEAD_H            # print pose: head's top face on the bed
        ob.hide_render = True
        ob.hide_set(True)
        a = gt._object(f"Asm Screw {i + 1}", me, asm, colors[i])
        a.location.x = (i - (len(VARIANTS) - 1) / 2) * GAP
    if save:
        gt.save_scene(os.path.join(_HERE, "sheet_screw.blend"), ("Sheet Screw", "Sheet Screw Assembly"))
    return col


def measure(ob, theta, z0, z1, step=0.01):
    """Radius r(z) of `ob`'s surface along one half-plane through its axis, z0..z1 (local)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    d = Vector((math.cos(theta), math.sin(theta), 0))
    out = []
    for k in range(int(round((z1 - z0) / step)) + 1):
        z = z0 + k * step
        hit = tree.ray_cast(d * 40 + Vector((0, 0, z)), -d)
        out.append((z, (hit[0] - Vector((0, 0, z))).length if hit[0] is not None else 0.0))
    return out


def check():
    """Each screw's measured profile against its row. Returns a list of problems."""
    problems = []
    for i, (crest_d, groove) in enumerate(VARIANTS):
        ob = bpy.data.objects[part_name(i)]
        pitch = profile(crest_d, groove)[3]
        lo, hi = 0.3, LENGTH - pitch      # full-depth thread (past the head step, before the ramp)
        for theta in (0.0, 1.3, 2.9, 4.4):
            prof = measure(ob, theta, lo, hi)
            rs = [r for _, r in prof]
            runs, start = [], None        # spans where the surface is inside the sheet's edge
            for z, r in prof:
                if r < EDGE_R and start is None:
                    start = z
                elif r >= EDGE_R and start is not None:
                    runs.append((start, z))
                    start = None
            whole = [b - a for a, b in runs if a > lo + 1e-6]   # cut off by the window's ends: skip
            got = (min(rs), max(rs), min(whole) if whole else 0.0)
            want = (ROOT_R, crest_d / 2, groove)
            line = (f"{part_name(i)} at {math.degrees(theta):.0f} deg: root {2 * got[0]:.2f} (hole {HOLE:.1f}), "
                    f"crest {2 * got[1]:.2f} (want {crest_d:.2f}), groove at the edge {got[2]:.2f} (want {groove:.2f}, "
                    f"sheet {SHEET:.1f})")
            print("[CHECK]", line)
            if not (abs(got[0] - want[0]) < 0.02 and abs(got[1] - want[1]) < 0.02
                    and got[2] > want[2] - 0.05 and got[2] > SHEET and len(whole) >= 1):
                problems.append(line)
    return problems


def export(out_dir=None):
    out_dir = out_dir or os.path.join(_HERE, "export", "sheet_screw")
    os.makedirs(out_dir, exist_ok=True)
    res = {}
    for i in range(len(VARIANTS)):
        ob = bpy.data.objects[part_name(i)]
        res[part_name(i)] = sg.export_stl(ob, os.path.join(out_dir, part_name(i) + ".stl"))
    for k, v in res.items():
        print(f"[EXPORT] {k}: shells {v[1]}, non-manifold {v[2]}, missing {v[3]}")
    return res


def render_scene():
    """The four variants in a row, for cad/make.py render."""
    return "Sheet Screw Assembly"

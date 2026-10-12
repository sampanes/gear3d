"""SATOR gear helpers for PrecisionGears (run inside Blender).

new_spur()     -- add a spur gear carrying the shared settings of a template gear
add_groove()   -- cut a tooth-free groove (split one tall gear into stacked layers)
export_stl()   -- union a gear with its crossings into one solid STL for the slicer
mesh_with()    -- place a gear at the correct center distance, rotated so teeth interlock
tooth_phase()  -- angle of a tooth center on a gear
add_rim_dots() -- decorative ring of dimples in the rim top face

Shared settings are copied from a finished template gear so every gear matches
(module, pressure angle, shift, taper, tip relief, bore style, ...). The numbers
themselves live in docs/sator-hand-build.md.
"""

import math

import bmesh
import bpy

# settings copied from the template gear onto every new gear
SHARED = (
    "module", "pressure_angle", "helix_angle", "herringbone", "shift", "clearance",
    "backlash", "head", "undercut", "complexity", "z_resolution",
    "tooth_mod_enabled", "tooth_taper", "tooth_taper_offset", "tip_relief",
    "tip_relief_resolution", "root_relief", "root_relief_resolution",
    "bore_enabled", "bore", "bore_param_a", "bore_param_b", "bore_resolution",
    "bore_subtype", "bool_solver", "do_crease", "crease", "add_weld", "weld_dist",
)
RIM = 8.0  # mm of material between the tooth roots and the bore


def props(ob):
    return ob.gear  # PrecisionGears property group (consts.GEAR_PROPS_ALIAS)


def root_radius(p):
    return p.module * p.teeth / 2 - (1 + p.clearance - p.shift) * p.module


def tip_radius(p):
    return p.module * p.teeth / 2 + (1 + p.shift) * p.module


def pitch_radius(p):
    return p.module * p.teeth / 2


def _collection(name):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def _move_to(ob, col):
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    col.objects.link(ob)


def new_spur(name, teeth, height, template, collection, bore_r=None):
    from PrecisionGears import gear_definitions

    bpy.ops.object.add_new_gear(gear_type="SPUR")
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    _move_to(ob, _collection(collection))
    src, p = props(template), props(ob)
    p.editing = True
    for k in SHARED:
        setattr(p, k, getattr(src, k))
    p.teeth = teeth
    p.height = height
    p.bore_size = bore_r if bore_r is not None else root_radius(p) - RIM
    p.editing = False
    gear_definitions.update_gear(p, bpy.context)
    ob.location = (0, 0, 0)
    ob.rotation_euler = (0, 0, 0)
    return ob


def add_groove(ob, z_center, width, depth_below_root=0.3):
    """Cut a ring groove through the teeth (Boolean modifier, stays live)."""
    p = props(ob)
    r_in = root_radius(p) - depth_below_root
    r_out = tip_radius(p) + 2
    name = f"{ob.name} Groove Cutter"
    old = bpy.data.objects.get(name)
    if old is not None:
        old_me = old.data
        bpy.data.objects.remove(old)
        bpy.data.meshes.remove(old_me)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    n = 256
    z0, z1 = z_center - width / 2, z_center + width / 2
    rings = [[bm.verts.new((r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), z))
              for i in range(n)] for (r, z) in ((r_out, z0), (r_out, z1), (r_in, z1), (r_in, z0))]
    for a, b in zip(rings, rings[1:] + rings[:1]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    cutter = bpy.data.objects.new(name, me)
    for c in ob.users_collection:
        c.objects.link(cutter)
    cutter.parent = ob
    cutter.display_type = "WIRE"
    cutter.hide_render = True
    cutter.hide_set(True)
    mod = ob.modifiers.get("Layer Groove") or ob.modifiers.new("Layer Groove", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    return cutter


def add_rim_dots(ob, count=None, dia=2.4, depth=1.2, segments=16):
    """Ring of round dimples in the rim's top face, midway between bore and tooth roots.

    Decorative only (blind holes, the rim keeps its strength). One dot per tooth by
    default, lined up with the teeth. Boolean modifier, stays live; count=0 removes it.
    """
    p = props(ob)
    name = f"{ob.name} Rim Dots"
    old = bpy.data.objects.get(name)
    if old is not None:
        old_me = old.data
        bpy.data.objects.remove(old)
        bpy.data.meshes.remove(old_me)
    mod = ob.modifiers.get("Rim Dots")
    if count == 0:
        if mod is not None:
            ob.modifiers.remove(mod)
        return None
    count = count or p.teeth
    r = (p.bore_size + root_radius(p)) / 2
    z_top = max(v[2] for v in ob.bound_box)
    phase = tooth_phase(ob) - ob.rotation_euler.z
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    for k in range(count):
        a = phase + 2 * math.pi * k / count
        res = bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=dia / 2,
                                    radius2=dia / 2, depth=depth + 1.0)
        bmesh.ops.translate(bm, verts=res["verts"],
                            vec=(r * math.cos(a), r * math.sin(a), z_top - depth + (depth + 1.0) / 2))
    bm.to_mesh(me)
    bm.free()
    cutter = bpy.data.objects.new(name, me)
    for c in ob.users_collection:
        c.objects.link(cutter)
    cutter.parent = ob
    cutter.display_type = "WIRE"
    cutter.hide_render = True
    cutter.hide_set(True)
    mod = mod or ob.modifiers.new("Rim Dots", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    return cutter


def export_stl(gear, path=None):
    """Union a gear with its crossings into ONE solid and write a binary STL.

    Exporting the gear and crossings as separate shells makes the slicer treat them
    as separate parts: each gets its own perimeters and the overlap becomes a seam of
    walls instead of continuous infill. The union removes that seam.
    Coordinates are gear-local (axis at the origin). Returns (path, shells, non_manifold).
    """
    import os
    import struct

    if path is None:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "export", gear.name + ".stl")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(gear.evaluated_get(dg))
    tmp = bpy.data.objects.new(gear.name + " Export", me)
    bpy.context.scene.collection.objects.link(tmp)
    tmp.matrix_world = gear.matrix_world
    # Crossings faces that are almost (not exactly) coplanar with the gear faces, e.g. a
    # flat back at z -11.999999 vs -12, leave open slivers in an EXACT union. Squeeze each
    # crossings copy 0.01 mm in from top and bottom (far below a print layer) so no face
    # is near-coplanar.
    copies = []
    for c in gear.children:
        if c.type == "MESH" and c.name.endswith(" Crossings"):
            cme = bpy.data.meshes.new_from_object(c.evaluated_get(dg))
            z0 = min(v.co.z for v in cme.vertices)
            z1 = max(v.co.z for v in cme.vertices)
            k = (z1 - z0 - 0.02) / (z1 - z0)
            for v in cme.vertices:
                v.co.z = (z0 + z1) / 2 + (v.co.z - (z0 + z1) / 2) * k
            cc = bpy.data.objects.new(c.name + " Export", cme)
            bpy.context.scene.collection.objects.link(cc)
            cc.matrix_world = c.matrix_world
            copies.append(cc)
            mod = tmp.modifiers.new("Union " + c.name, "BOOLEAN")
            mod.operation = "UNION"
            mod.solver = "EXACT"
            mod.object = cc
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    bm.from_object(tmp, dg)
    for o in [tmp] + copies:
        m = o.data
        bpy.data.objects.remove(o)
        bpy.data.meshes.remove(m)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.verts.index_update()
    non_manifold = sum(1 for e in bm.edges if not e.is_manifold)
    # count shells
    seen, shells = set(), 0
    for v in bm.verts:
        if v.index in seen:
            continue
        shells += 1
        stack = [v]
        seen.add(v.index)
        while stack:
            cur = stack.pop()
            for e in cur.link_edges:
                o = e.other_vert(cur)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
    with open(path, "wb") as f:
        f.write(b"\0" * 80 + struct.pack("<I", len(bm.faces)))
        for face in bm.faces:
            f.write(struct.pack("<3f", *face.normal))
            for v in face.verts:
                f.write(struct.pack("<3f", *v.co))
            f.write(b"\0\0")
    bm.free()
    return path, shells, non_manifold


def tooth_phase(ob):
    """World angle (rad) of a tooth center, from the tip vertices of the evaluated mesh."""
    p = props(ob)
    pitch = 2 * math.pi / p.teeth
    me = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    rs = [(v.co.x, v.co.y) for v in me.vertices]
    r_tip = max(math.hypot(x, y) for x, y in rs)
    sx = sy = 0.0
    for x, y in rs:
        if math.hypot(x, y) > r_tip - 0.05:
            a = math.atan2(y, x) * 2 * math.pi / pitch
            sx += math.cos(a)
            sy += math.sin(a)
    ob.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
    return math.atan2(sy, sx) * pitch / (2 * math.pi) + ob.rotation_euler.z


def mesh_with(fixed, moving, direction_deg, z):
    """Place `moving` around `fixed` at the pitch-circle center distance, teeth interlocked."""
    pf, pm = props(fixed), props(moving)
    dist = pitch_radius(pf) + pitch_radius(pm)
    d = math.radians(direction_deg)
    moving.location = (fixed.location.x + dist * math.cos(d), fixed.location.y + dist * math.sin(d), z)
    pitch_f, pitch_m = 2 * math.pi / pf.teeth, 2 * math.pi / pm.teeth
    # fixed: offset of its nearest tooth from the line of centers
    a = tooth_phase(fixed) - d
    a -= round(a / pitch_f) * pitch_f
    # moving: tooth center wanted half a pitch off the mirrored contact point
    want = d + math.pi - a * pitch_radius(pf) / pitch_radius(pm) + pitch_m / 2
    moving.rotation_euler.z = 0.0
    have = tooth_phase(moving)
    turn = want - have
    turn -= round(turn / pitch_m) * pitch_m
    moving.rotation_euler.z = turn
    return dist

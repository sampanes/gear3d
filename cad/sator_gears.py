"""SATOR gear helpers for PrecisionGears (run inside Blender).

new_spur()     -- add a spur gear carrying the shared settings of a template gear
add_groove()   -- cut a tooth-free groove (split one tall gear into stacked layers)
export_stl()   -- union a gear with its crossings into one solid STL for the slicer
mesh_with()    -- place a gear at the correct center distance, rotated so teeth interlock
tooth_phase()  -- angle of a tooth center on a gear
add_rim_dots() -- decorative ring of dimples in the rim top face
add_hub_cut()  -- decorative pocket in the hub top face (crown / flower / sunburst / terraces)
fit_coupon()   -- labelled test bar of hole sizes (find the bearing press fit)

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


def new_spur(name, teeth, height, template, collection, bore_r=None, shift=None):
    """shift (profile shift coefficient) overrides the template's, e.g. to span a center
    distance that no whole tooth count fits; the bore default then follows the new root."""
    from PrecisionGears import gear_definitions

    bpy.ops.object.add_new_gear(gear_type="SPUR")
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    _move_to(ob, _collection(collection))
    src, p = props(template), props(ob)
    p.editing = True
    for k in SHARED:
        setattr(p, k, getattr(src, k))
    if shift is not None:
        p.shift = shift
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
        if old_me.users == 0:  # copies may share one mesh
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


def add_rim_dots(ob, count=None, dia=2.4, depth=1.2, segments=16, r=None):
    """Ring of round dimples in the rim's top face, midway between bore and tooth roots.

    Decorative only (blind holes, the rim keeps its strength). One dot per tooth by
    default, lined up with the teeth. Boolean modifier, stays live; count=0 removes it.
    r overrides the ring radius (e.g. to re-center it when other cuts narrow the rim).
    """
    p = props(ob)
    name = f"{ob.name} Rim Dots"
    old = bpy.data.objects.get(name)
    if old is not None:
        old_me = old.data
        bpy.data.objects.remove(old)
        if old_me.users == 0:  # copies may share one mesh
            bpy.data.meshes.remove(old_me)
    mod = ob.modifiers.get("Rim Dots")
    if count == 0:
        if mod is not None:
            ob.modifiers.remove(mod)
        return None
    count = count or p.teeth
    r = r or (p.bore_size + root_radius(p)) / 2
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


HUB_CUT_STYLES = ("crown", "flower", "sunburst", "terraces")


def _polar_solid(bm, rfun, z0, z1, n=720):
    """Closed prism whose outline is r = rfun(angle) (must be star-shaped about the axis)."""
    pts = [(rfun(2 * math.pi * k / n), 2 * math.pi * k / n) for k in range(n)]
    bot = [bm.verts.new((r * math.cos(a), r * math.sin(a), z0)) for r, a in pts]
    top = [bm.verts.new((r * math.cos(a), r * math.sin(a), z1)) for r, a in pts]
    bm.faces.new(bot[::-1])
    bm.faces.new(top)
    for k in range(n):
        m = (k + 1) % n
        bm.faces.new((bot[k], bot[m], top[m], top[k]))


def add_hub_cut(ob, style="flower", depth=3.0, count=None, r_in=None, r_out=None):
    """Decorative pocket in the hub's top face, around the bearing hole.

    Only the top `depth` mm is cut, so the bottom stays a plain bearing seat (an 8 mm idler
    with depth 3 keeps 5 mm for a 5 mm wide bearing, whose top face then shows in the pocket).
    Styles (HUB_CUT_STYLES), lobes lined up with the teeth:
      crown    -- star pocket, `count` points (default 8)
      flower   -- round scalloped pocket, `count` lobes (default 6)
      sunburst -- round pocket plus `count` shallow rays between the teeth (default = teeth)
      terraces -- three stepped rings down to the bearing
    style=None removes the cut. Boolean modifiers, stay live.
    """
    p = props(ob)
    for o in [o for o in bpy.data.objects if o.name.startswith(f"{ob.name} Hub Cut")]:
        me = o.data
        bpy.data.objects.remove(o)
        if me.users == 0:  # copies may share one mesh
            bpy.data.meshes.remove(me)
    for m in [m for m in ob.modifiers if m.name.startswith("Hub Cut")]:
        ob.modifiers.remove(m)
    if style is None:
        return []
    if style not in HUB_CUT_STYLES:
        raise ValueError(f"unknown hub cut style: {style}")
    r_in = r_in or p.bore_size + 1.3
    r_out = r_out or root_radius(p) - 2.6
    z_top = max(v[2] for v in ob.bound_box)
    z0 = z_top - depth
    phase = tooth_phase(ob) - ob.rotation_euler.z
    tooth_pitch = 2 * math.pi / p.teeth

    def lobed(n, f):  # f(x) for x in -0.5..0.5 (0 = lobe center) -> radius
        pitch = 2 * math.pi / n
        return lambda a: f(((a - phase) / pitch + 0.5) % 1.0 - 0.5, pitch)

    if style == "crown":
        def f(x, pitch):
            t = min(max((0.30 - abs(x)) / 0.16, 0.0), 1.0)
            return r_in + (r_out - r_in) * t * t * (3 - 2 * t)
        solids = [(lobed(count or 8, f), z0)]
    elif style == "flower":
        rho = 0.75 * (r_out - r_in)
        d = r_out - rho

        def f(x, pitch):
            s = d * math.sin(x * pitch)
            if abs(s) >= rho:
                return r_in
            return max(r_in, d * math.cos(x * pitch) + math.sqrt(rho * rho - s * s))
        solids = [(lobed(count or 6, f), z0)]
    elif style == "sunburst":
        phase += tooth_pitch / 2
        ray_out = r_out + 0.4

        def f(x, pitch):
            return ray_out if abs(x) * pitch * ray_out < 0.7 else r_in
        solids = [(lambda a: r_in, z0), (lobed(count or p.teeth, f), z_top - depth / 2)]
    else:  # terraces
        rs = [r_out, (r_in + r_out) / 2, r_in]
        solids = [(lambda a, r=r: r, z_top - depth * (i + 1) / 3) for i, r in enumerate(rs)]

    cutters = []
    for i, (fn, zb) in enumerate(solids):
        name = f"{ob.name} Hub Cut" + (f" {i + 1}" if i else "")
        me = bpy.data.meshes.new(name)
        bm = bmesh.new()
        _polar_solid(bm, fn, zb, z_top + 1.0)
        bm.to_mesh(me)
        bm.free()
        cutter = bpy.data.objects.new(name, me)
        for c in ob.users_collection:
            c.objects.link(cutter)
        cutter.parent = ob
        cutter.display_type = "WIRE"
        cutter.hide_render = True
        cutter.hide_set(True)
        mod = ob.modifiers.new("Hub Cut" + (f" {i + 1}" if i else ""), "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.solver = "EXACT"
        mod.object = cutter
        cutters.append(cutter)
    return cutters


def fit_coupon(name, sizes, wall=3.0, thick=5.0, label_h=4.0, location=(0, 0, 0)):
    """Flat test bar with one hole per diameter in `sizes`, each labelled in the top face.

    Print it before a gear to find the hole that grips a bearing; holes are cut the same
    way as the gears' (fine polygon, straight wall, no chamfer) so the result carries over.
    Lives in the "Test Prints" collection; export with export_stl().
    """
    old = bpy.data.objects.get(name)
    if old is not None:
        old_me = old.data
        bpy.data.objects.remove(old)
        bpy.data.meshes.remove(old_me)
    d_max = max(sizes)
    pitch = d_max + wall
    w_hole = d_max + 2 * wall
    width = w_hole + label_h + wall
    length = pitch * (len(sizes) - 1) + w_hole
    corner = 4.0
    y0, y1 = -w_hole / 2, -w_hole / 2 + width  # labels sit on the +y side of the holes
    x0, x1 = -length / 2, length / 2

    # plate: rounded rectangle, extruded
    outline = []
    for cx, cy, a0 in ((x1 - corner, y0 + corner, -90), (x1 - corner, y1 - corner, 0),
                       (x0 + corner, y1 - corner, 90), (x0 + corner, y0 + corner, 180)):
        for k in range(9):
            a = math.radians(a0 + 90 * k / 8)
            outline.append((cx + corner * math.cos(a), cy + corner * math.sin(a)))
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bot = [bm.verts.new((x, y, 0.0)) for x, y in outline]
    top = [bm.verts.new((x, y, thick)) for x, y in outline]
    bm.faces.new(bot[::-1])
    bm.faces.new(top)
    n = len(outline)
    for k in range(n):
        m = (k + 1) % n
        bm.faces.new((bot[k], bot[m], top[m], top[k]))
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    _collection("Test Prints").objects.link(ob)

    # cutter: through holes + label text sunk 0.6 mm into the top face
    cme = bpy.data.meshes.new(name + " Cutter")
    bm = bmesh.new()
    xs = [x0 + w_hole / 2 + pitch * i for i in range(len(sizes))]
    for x, d in zip(xs, sizes):
        res = bmesh.ops.create_cone(bm, cap_ends=True, segments=256, radius1=d / 2,
                                    radius2=d / 2, depth=thick + 2)
        bmesh.ops.translate(bm, verts=res["verts"], vec=(x, 0, thick / 2))
        cu = bpy.data.curves.new("_label", "FONT")
        cu.body = f"{d:.1f}"
        cu.size = label_h * 1.35  # font size -> digit height ~ label_h
        cu.align_x, cu.align_y = "CENTER", "CENTER"
        cu.extrude = 0.8
        tob = bpy.data.objects.new("_label", cu)
        bpy.context.scene.collection.objects.link(tob)
        bpy.context.view_layer.update()
        tme = bpy.data.meshes.new_from_object(tob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        bpy.data.objects.remove(tob)
        bpy.data.curves.remove(cu)
        tbm = bmesh.new()
        tbm.from_mesh(tme)
        bpy.data.meshes.remove(tme)
        bmesh.ops.translate(tbm, verts=tbm.verts[:], vec=(x, w_hole / 2 + label_h / 2 + 0.5, thick + 0.2))
        tmp = bpy.data.meshes.new("_label")
        tbm.to_mesh(tmp)
        tbm.free()
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    bm.to_mesh(cme)
    bm.free()
    cutter = bpy.data.objects.new(name + " Cutter", cme)
    _collection("Test Prints").objects.link(cutter)
    mod = ob.modifiers.new("Cut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    bpy.context.view_layer.update()
    final = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    ob.modifiers.remove(mod)
    bpy.data.objects.remove(cutter)
    bpy.data.meshes.remove(cme)
    ob.data = final
    bpy.data.meshes.remove(me)
    final.name = name
    ob.location = location
    return ob


def _shells(bm):
    bm.verts.index_update()
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
    return shells


def _probes(ob, n=300, depth=0.05):
    """World points just inside ob (ob's own triangles pushed in along their normals)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.transform(ob.matrix_world)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    faces = [f for f in bm.faces if f.calc_area() > 1e-4]
    step = max(1, len(faces) // n)
    pts = [f.calc_center_median() - f.normal * depth for f in faces[::step]]
    bm.free()
    return pts


def _missing(bm_world, probes, tol=0.1):
    """Names of pieces whose inside points mostly fall outside the solid (dropped by EXACT)."""
    from mathutils.bvhtree import BVHTree

    tree = BVHTree.FromBMesh(bm_world)
    out = []
    for name, pts in probes.items():
        bad = 0
        for p in pts:
            loc, nrm, _, _ = tree.find_nearest(p)
            if loc is None or (p - loc).dot(nrm) > 0:
                bad += 1
        if bad > tol * len(pts):
            out.append(name)
    return out


def _drop_back_to_back(bm):
    """Delete pairs of triangles on the same three vertices (a zero-volume flap).

    Triangulating an EXACT n-gon that wraps round a hole can leave such a pair lying in a
    flat face (back to back, or two zero-area slivers): no volume, but every edge of it then
    has 4 faces, so the STL is not a clean solid. Returns how many faces were removed."""
    seen, dup = {}, []
    for f in bm.faces:
        k = frozenset(f.verts)
        if len(k) == 3 and k in seen:
            dup += [f, seen.pop(k)]
        else:
            seen[k] = f
    if dup:
        bmesh.ops.delete(bm, geom=dup, context="FACES")
    return len(dup)


def export_stl(gear, path=None, extra=(), tries=24):
    """Union a gear with its crossings into ONE solid and write a binary STL.

    Exporting the gear and crossings as separate shells makes the slicer treat them
    as separate parts: each gets its own perimeters and the overlap becomes a seam of
    walls instead of continuous infill. The union removes that seam.
    `extra`: more objects printed as part of the same piece (another gear on the same
    shaft, a tube joining them); each comes with its own crossings.
    The EXACT union depends on the order it merges the pieces in: some orders silently drop
    a piece (still one closed shell, so shells / non-manifold do not show it) or tear the
    result. Each result is checked (one shell, no open edges, points just inside every
    piece lie inside the solid); on a failure other orders are tried, up to `tries`.
    Coordinates are gear-local (axis at the origin). Returns (path, shells, non_manifold,
    missing pieces).
    """
    import itertools
    import os
    import struct

    if path is None:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "export", gear.name + ".stl")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    dg = bpy.context.evaluated_depsgraph_get()
    base = bpy.data.objects.new(gear.name + " Export", bpy.data.meshes.new_from_object(gear.evaluated_get(dg)))
    bpy.context.scene.collection.objects.link(base)
    base.matrix_world = gear.matrix_world
    # Crossings faces that are almost (not exactly) coplanar with the gear faces, e.g. a
    # flat back at z -11.999999 vs -12, leave open slivers in an EXACT union. Squeeze each
    # crossings copy 0.01 mm in from top and bottom (far below a print layer) so no face
    # is near-coplanar.
    copies = []
    for e in extra:
        ec = bpy.data.objects.new(e.name + " Export", bpy.data.meshes.new_from_object(e.evaluated_get(dg)))
        bpy.context.scene.collection.objects.link(ec)
        ec.matrix_world = e.matrix_world
        copies.append(ec)
    for c in [c for p in (gear, *extra) for c in p.children]:
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
    pieces = [base] + copies
    bpy.context.view_layer.update()
    probes = {p.name: _probes(p) for p in pieces}
    to_gear = gear.matrix_world.inverted()

    def union(order):
        first = order[0]
        tmp = bpy.data.objects.new("Export Union", first.data.copy())
        bpy.context.scene.collection.objects.link(tmp)
        tmp.matrix_world = first.matrix_world
        for o in order[1:]:
            mod = tmp.modifiers.new("Union " + o.name, "BOOLEAN")
            mod.operation, mod.solver, mod.object = "UNION", "EXACT", o
        bpy.context.view_layer.update()
        bm = bmesh.new()
        bm.from_object(tmp, bpy.context.evaluated_depsgraph_get())
        mw = tmp.matrix_world.copy()
        m = tmp.data
        bpy.data.objects.remove(tmp)
        bpy.data.meshes.remove(m)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        # EXACT can leave a few vertices a hair apart (< 1e-5) where they should be one
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
        # and zero-area slivers with an edge just over that: collapse edges under 0.2 um
        bmesh.ops.dissolve_degenerate(bm, dist=2e-4, edges=bm.edges[:])
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        _drop_back_to_back(bm)
        world = bm.copy()
        world.transform(mw)
        if first is not base:
            bm.transform(to_gear @ mw)  # gear-local, as with the base first
        missing = _missing(world, probes)
        world.free()
        nm = sum(1 for e in bm.edges if not e.is_manifold)
        return bm, _shells(bm), nm, missing

    # the given order first (so parts that merge cleanly export as before), then every order,
    # taking each piece as the starting one in turn
    groups = [[list(o) for o in itertools.permutations(pieces) if o[0] is p and list(o) != pieces][::-1]
              for p in pieces]
    orders = [pieces] + [o for row in itertools.zip_longest(*groups) for o in row if o]
    best = None
    for order in orders[:max(1, tries)]:
        bm, shells, nm, missing = union(order)
        score = (len(missing), nm, shells)
        if best is None or score < best[0]:
            if best is not None:
                best[1].free()
            best = (score, bm, shells, nm, missing)
        else:
            bm.free()
        if score == (0, 0, 1):
            break
    for o in pieces:
        m = o.data
        bpy.data.objects.remove(o)
        bpy.data.meshes.remove(m)
    _, bm, shells, non_manifold, missing = best
    missing = [m[:-len(" Export")] for m in missing]
    if missing or non_manifold or shells != 1:
        print(f"[!] {os.path.basename(path)}: shells {shells}, non-manifold {non_manifold}, missing {missing}")
    with open(path, "wb") as f:
        f.write(b"\0" * 80 + struct.pack("<I", len(bm.faces)))
        for face in bm.faces:
            f.write(struct.pack("<3f", *face.normal))
            for v in face.verts:
                f.write(struct.pack("<3f", *v.co))
            f.write(b"\0\0")
    bm.free()
    return path, shells, non_manifold, missing


# Identical board gears share one STL; the name ends in how many the board needs.
BOARD_PRINTS = {
    "Gear_Middle_64T": "Gear_Middle_64T",
    "Gear_96T": "Gear_96T_x4",
    "Gear_Idler_16T_N": "Gear_Idler_16T_x4",
    "Gear_Letter_64T_N": "Gear_Letter_64T_Front_x4",
    "Gear_Letter_64T_N2": "Gear_Letter_64T_Far_x4",
}


def export_board(out_dir=None):
    """The board's own gears (not the toggle units), one STL per design. {file: (path,
    shells, non_manifold, missing)}."""
    import os

    out_dir = out_dir or os.path.join(os.path.dirname(os.path.abspath(__file__)), "export")
    return {f: export_stl(bpy.data.objects[ob], os.path.join(out_dir, f + ".stl"))
            for ob, f in BOARD_PRINTS.items()}


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

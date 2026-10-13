"""Geneva drives in Blender (run inside Blender). Geometry and motion come from geneva_math.

build()    -- star + one driver per Drive.drivers as plain meshes under one parent empty
rebuild()  -- rebuild a set from the settings stored on its parent (edit them, then rebuild)
animate()  -- keyframe one driver turn (cyclic), so scrubbing the timeline shows the motion

Quick start (Blender Python console or a script):

    import geneva_math as gm, geneva
    geneva.build(gm.toggle(90, 50.715, land=7.8, bore_d=16.3), "Geneva Toggle")
    geneva.animate("Geneva Toggle")

Layers, bottom up (z local to the parent): driver plate 0..plate_t, then z_gap of air, then
the star and the locking discs (thick). The locking disc is a boss standing on the plate up
through the gap; the pin stands on the plate and stops 0.3 mm below the star top. plate_t=0
builds only boss + pin (to stand on a gear instead of a plate). pin="hole" leaves a hole for a
steel pin (pin_d * pin_fit) instead of a printed pin.

Every object carries ob["geneva"] (JSON); the parent's copy holds the Drive settings and the
build options, so a set can be rebuilt after the numbers change. Export a part with
sator_gears.export_stl(ob): each part is one closed solid.
"""

import json
import math

import bmesh
import bpy

try:
    import geneva_math as gm
except ImportError:  # run as a file: load the sibling module
    import importlib.util
    import os

    _spec = importlib.util.spec_from_file_location(
        "geneva_math", os.path.join(os.path.dirname(os.path.abspath(__file__)), "geneva_math.py"))
    gm = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(gm)

BUILD_DEFAULTS = dict(thick=8.0, plate_t=4.0, z_gap=1.0, pin="solid", pin_fit=1.025, chamfer=0.5,
                      collection="Geneva")


def _collection(name):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def _prism(name, loops, z0, z1):
    """Closed mesh: the first loop is the outline, any others are holes."""
    bm = bmesh.new()
    edges = []
    for loop in loops:
        vs = [bm.verts.new((float(x), float(y), z0)) for x, y in loop]
        edges += [bm.edges.new((a, b)) for a, b in zip(vs, vs[1:] + vs[:1])]
    bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges)
    ext = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    bmesh.ops.translate(bm, verts=[e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)],
                        vec=(0, 0, z1 - z0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def _circle(r, n=192, cx=0.0, cy=0.0, cw=False):
    s = -1 if cw else 1
    return [(cx + r * math.cos(s * 2 * math.pi * i / n), cy + r * math.sin(s * 2 * math.pi * i / n)) for i in range(n)]


def _union(name, parts):
    """Exact boolean union of (name, mesh) parts into one mesh; temporary objects are removed."""
    scene = bpy.context.scene.collection
    obs = []
    for pname, me in parts:
        ob = bpy.data.objects.new(pname, me)
        scene.objects.link(ob)
        obs.append(ob)
    base = obs[0]
    for o in obs[1:]:
        mod = base.modifiers.new("Union " + o.name, "BOOLEAN")
        mod.operation, mod.solver, mod.object = "UNION", "EXACT", o
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(base.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    me.name = name
    for o in obs:
        m = o.data
        bpy.data.objects.remove(o)
        bpy.data.meshes.remove(m)
    return me


def _chamfer(ob, width):
    if width > 0:
        mod = ob.modifiers.new("Chamfer", "BEVEL")
        mod.width, mod.segments, mod.limit_method, mod.angle_limit = width, 1, "ANGLE", math.radians(60)
        mod.use_clamp_overlap = True


def _non_manifold(ob):
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bm = bmesh.new()
    bm.from_mesh(me)
    n = sum(1 for e in bm.edges if not e.is_manifold)
    bm.free()
    bpy.data.meshes.remove(me)
    return n


def _clear(name):
    root = bpy.data.objects.get(name)
    if root is None:
        return
    for o in [root] + list(root.children_recursive):
        me = o.data if o.type == "MESH" else None
        bpy.data.objects.remove(o)
        if me is not None and me.users == 0:
            bpy.data.meshes.remove(me)


def build(drive, name, location=(0.0, 0.0, 0.0), rotation_deg=0.0, **opts):
    """(Re)build a Geneva set named `name`. Returns (root, star, [drivers], check result)."""
    o = dict(BUILD_DEFAULTS, **opts)
    _clear(name)
    col = _collection(o["collection"])
    root = bpy.data.objects.new(name, None)
    root.empty_display_type, root.empty_display_size = "PLAIN_AXES", drive.R * 0.3
    root.location, root.rotation_euler.z = location, math.radians(rotation_deg)
    col.objects.link(root)
    root["geneva"] = json.dumps({"drive": drive.settings(), "build": o})

    z_star0 = o["plate_t"] + o["z_gap"] if o["plate_t"] > 0 else o["z_gap"]
    z_star1 = z_star0 + o["thick"]

    loops = drive.star_loops()
    star = bpy.data.objects.new(name + " Star", _prism(name + " Star", loops, z_star0, z_star1))
    col.objects.link(star)
    star.parent = root
    star["geneva"] = json.dumps({"role": "star"})
    _chamfer(star, o["chamfer"])

    drivers = []
    for i, d in enumerate(drive.drivers):
        dname = f"{name} Driver {'AB'[i] if len(drive.drivers) <= 2 else i}"
        boss_z0 = o["plate_t"] - 0.5 if o["plate_t"] > 0 else 0.0
        parts = []
        if o["plate_t"] > 0:
            parts.append(("plate", _prism("plate", [_circle(drive.plate_r, 256)], 0.0, o["plate_t"])))
        parts.append(("boss", _prism("boss", [drive.disc_loop(i)], boss_z0, z_star1)))
        pins = [(drive.a * math.cos(j * 2 * math.pi / d.pins), drive.a * math.sin(j * 2 * math.pi / d.pins))
                for j in range(d.pins)]
        if o["pin"] == "solid":
            for j, (px, py) in enumerate(pins):
                parts.append((f"pin{j}", _prism("pin", [_circle(drive.pin_d / 2, 48, px, py)], boss_z0, z_star1 - 0.3)))
        me = _union(dname, parts)
        ob = bpy.data.objects.new(dname, me)
        col.objects.link(ob)
        ob.parent = root
        ob.location = (drive.c * math.cos(d.at), drive.c * math.sin(d.at), 0.0)
        ob.rotation_euler.z = drive.pin_angle(d, 0, 0.0)
        ob["geneva"] = json.dumps({"role": "driver", "index": i})
        if o["pin"] == "hole":
            for j, (px, py) in enumerate(pins):
                cut = bpy.data.objects.new(f"{dname} Pin Hole {j}",
                                           _prism("pin hole", [_circle(drive.pin_d * o["pin_fit"] / 2, 64, px, py)],
                                                  -1.0, z_star1 + 1.0))
                col.objects.link(cut)
                cut.parent, cut.display_type, cut.hide_render = ob, "WIRE", True
                cut.hide_set(True)
                mod = ob.modifiers.new(f"Pin Hole {j}", "BOOLEAN")
                mod.operation, mod.solver, mod.object = "DIFFERENCE", "EXACT", cut
        _chamfer(ob, o["chamfer"])
        drivers.append(ob)
    star.rotation_euler.z = drive.star_angle(0.0)

    result = drive.check()
    result["summary"] = drive.summary()
    result["non_manifold"] = {ob.name: _non_manifold(ob) for ob in [star] + drivers}
    root["geneva_check"] = json.dumps(result, default=float)
    return root, star, drivers, result


def rebuild(name):
    """Rebuild a set from the settings stored on its parent (keeps its place and animation length)."""
    root = bpy.data.objects[name]
    data = json.loads(root["geneva"])
    loc, rot = tuple(root.location), math.degrees(root.rotation_euler.z)
    frames = root.get("geneva_frames")
    out = build(gm.Drive.from_settings(data["drive"]), name, loc, rot, **data["build"])
    if frames:
        animate(name, frames)
    return out


def _fcurves(ob):
    act = ob.animation_data.action
    if hasattr(act, "fcurves"):
        return list(act.fcurves)
    from bpy_extras import anim_utils
    return list(anim_utils.action_get_channelbag_for_slot(act, ob.animation_data.action_slot).fcurves)


def animate(name, frames=240, start=1):
    """Keyframe one driver turn over `frames` frames, repeating forever (Cycles modifier)."""
    root = bpy.data.objects[name]
    root["geneva_frames"] = frames
    drive = gm.Drive.from_settings(json.loads(root["geneva"])["drive"])
    star = bpy.data.objects[name + " Star"]
    drv = sorted((o for o in root.children if json.loads(o.get("geneva", "{}")).get("role") == "driver"),
                 key=lambda o: json.loads(o["geneva"])["index"])
    for ob in [star] + drv:
        ob.animation_data_clear()
    for f in range(frames + 1):
        t = 2 * math.pi * f / frames
        star.rotation_euler.z = drive.star_angle(t)
        star.keyframe_insert("rotation_euler", index=2, frame=start + f)
        for ob, d in zip(drv, drive.drivers):
            ob.rotation_euler.z = drive.pin_angle(d, 0, t)
            ob.keyframe_insert("rotation_euler", index=2, frame=start + f)
    for ob in [star] + drv:
        for fc in _fcurves(ob):
            for k in fc.keyframe_points:
                k.interpolation = "LINEAR"
            mod = fc.modifiers.new("CYCLES")
            mod.mode_before = mod.mode_after = "REPEAT_OFFSET"
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = start, start + frames - 1

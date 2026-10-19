"""Build, check, export and render a cad/ model in a clean Blender session.

    blender -b --python cad/make.py -- MODULE STEP [STEP ...]
    cad\\make.bat MODULE STEP [STEP ...]          (finds the newest Blender)

MODULE is a cad/*.py with build(save), check(), export(out_dir) and render_scene()
(gear_toys, planetary_fidget). Steps run in the order given:

    selftest         prove the shared checks catch what they are for (needs no build): a part
                     buried inside another, a near miss, and the exporter refusing a broken part
    build            build the parts and the assembly
    save             build, then write MODULE.blend next to the script
    check            run check(); any problem fails the run
    export [DIR]     write the STLs (default: the module's own export folder)
    render DIR       workbench renders of the assembly: MODULE.png (3/4 view), MODULE_top.png,
                     MODULE_under.png and MODULE_cutaway.png (cut through the y = 0 plane)

The session starts from an empty file, so nothing from a startup file or an earlier session
can end up in a saved .blend. Exit status 1 if a step raises or check() finds a problem: a
broken build never looks finished.
"""
import importlib.util
import os
import sys
import time
import traceback

import bmesh
import bpy
from mathutils import Vector

_HERE = os.path.dirname(os.path.abspath(__file__))
STEPS = ("selftest", "build", "save", "check", "export", "render")


def load(name):
    path = os.path.join(_HERE, name + ".py")
    if not os.path.exists(path):
        raise SystemExit(f"[X] no cad/{name}.py")
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def parse(args):
    """[(step, argument or None)] from the words after `--`."""
    out, i = [], 0
    while i < len(args):
        step = args[i]
        if step not in STEPS:
            raise SystemExit(f"[X] unknown step {step!r}; steps: {', '.join(STEPS)}")
        arg = None
        if step in ("export", "render") and i + 1 < len(args) and args[i + 1] not in STEPS:
            arg, i = args[i + 1], i + 1
        if step == "render" and arg is None:
            raise SystemExit("[X] render needs an output folder")
        out.append((step, arg))
        i += 1
    return out


def _bbox(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def render(name, col_name, out_dir):
    """Four workbench stills of a collection, framed from its bounding box."""
    os.makedirs(out_dir, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh.light, sh.color_type = "STUDIO", "OBJECT"
    sh.show_cavity, sh.cavity_type = True, "BOTH"
    sh.show_shadows, sh.shadow_intensity = True, 0.35
    sh.background_type = "VIEWPORT"
    if sc.world is None:
        sc.world = bpy.data.worlds.new("World")
    sc.world.color = (0.12, 0.12, 0.14)
    cam = bpy.data.objects.new("Make Camera", bpy.data.cameras.new("Make Camera"))
    sc.collection.objects.link(cam)
    cam.data.clip_end = 5000
    sc.camera = cam
    col = bpy.data.collections[col_name]
    shown = [o for o in col.all_objects if o.type == "MESH"]
    for o in sc.objects:
        o.hide_render = o not in shown
    lo, hi = _bbox(shown)
    c, size = (lo + hi) / 2, max(hi - lo)

    def shoot(fname, eye, target, lens=60, ortho=None, res=(1600, 1200)):
        sc.render.resolution_x, sc.render.resolution_y = res
        cam.location = eye
        cam.rotation_euler = (Vector(target) - Vector(eye)).to_track_quat("-Z", "Y").to_euler()
        if ortho:
            cam.data.type, cam.data.ortho_scale = "ORTHO", ortho
        else:
            cam.data.type, cam.data.lens = "PERSP", lens
        sc.render.filepath = os.path.join(out_dir, fname)
        bpy.ops.render.render(write_still=True)
        print("[OK] render", sc.render.filepath)

    hw = [o for o in shown if o.get("hardware")]
    for o in hw:  # the outside views show the printed parts only
        o.hide_render = True
    shoot(f"{name}.png", c + Vector((-0.55, -0.95, 1.1)) * size * 1.9, c)
    shoot(f"{name}_top.png", c + Vector((0, 0, 4 * size)), c, ortho=size * 1.12, res=(1200, 1200))
    shoot(f"{name}_under.png", c + Vector((-0.5, -0.9, -1.0)) * size * 1.9, c)
    # cutaway: everything (bearings and screws too) cut at y = 0, the far half kept
    cut = bpy.data.collections.new("Make Cut")
    sc.collection.children.link(cut)
    for o in shown:
        o.hide_render = True
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.transform(o.matrix_world)
        res = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0),
                                     plane_no=(0, -1, 0), clear_outer=True)
        if not bm.verts:
            bm.free()
            continue
        edges = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
        if edges:
            bmesh.ops.holes_fill(bm, edges=edges, sides=0)
        me = bpy.data.meshes.new(o.name + " Cut")
        bm.to_mesh(me)
        bm.free()
        q = bpy.data.objects.new(o.name + " Cut", me)
        q.color = o.color
        cut.objects.link(q)
    lo, hi = _bbox(cut.objects)
    cc = (lo + hi) / 2
    shoot(f"{name}_cutaway.png", Vector((cc.x, lo.y - 4 * size, cc.z)), Vector((cc.x, 0, cc.z)),
          ortho=max(hi.x - lo.x, (hi.z - lo.z) * 1.7) * 1.08, res=(1700, 1000))
    for q in list(cut.objects):
        me = q.data
        bpy.data.objects.remove(q)
        bpy.data.meshes.remove(me)
    bpy.data.collections.remove(cut)
    bpy.data.objects.remove(cam)


def _box(name, lo, hi):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector(tuple(lo[i] + (hi[i] - lo[i]) * (v.co[i] + 0.5) for i in range(3)))
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def selftest():
    gt = load("gear_toys")
    sg = gt.sg
    big = _box("T Big", (0, 0, 0), (20, 20, 20))
    inner = _box("T Buried", (5, 5, 5), (8, 8, 8))           # wholly inside: no surface crosses
    near = _box("T Near", (21.3, 0, 0), (25, 20, 20))        # 1.3 off a broad face
    spike = _box("T Spike", (10, 10, 20.4), (10.5, 10.5, 30))  # a thin post 0.4 over the middle
    fails = []
    for a, b, want in ((big, inner, 0.0), (inner, big, 0.0), (big, near, 1.3), (near, big, 1.3),
                       (big, spike, 0.4), (spike, big, 0.4)):
        g = gt.gap(a, b)
        ok = abs(g - want) < 1e-3
        print(f"[{'OK' if ok else 'X'}] gap {a.name} / {b.name}: {g:.3f} (want {want})")
        fails += [] if ok else [f"gap {a.name} / {b.name}"]
    for free, want in (((0.21, 0.22), True), ((0.12, 0.2), False), ((0.2, 0.31), False)):
        ok = gt.backlash_ok(free, 0.2) == want
        print(f"[{'OK' if ok else 'X'}] backlash {free} against 0.20: {'pass' if want else 'fail'}")
        fails += [] if ok else [f"backlash {free}"]
    # an open box (one face gone) must not be exported
    bm = bmesh.new()
    bm.from_mesh(big.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[0]], context="FACES_ONLY")
    bm.to_mesh(big.data)
    bm.free()
    path = os.path.join(bpy.app.tempdir, "selftest_open_box.stl")
    try:
        sg.export_stl(big, path)
        fails.append("export wrote an open box")
        print("[X] export wrote an open box")
    except sg.ExportError as e:
        ok = not os.path.exists(path)
        print(f"[{'OK' if ok else 'X'}] export refused the open box: {e}")
        fails += [] if ok else ["export left a file behind"]
    for o in (big, inner, near, spike):
        me = o.data
        bpy.data.objects.remove(o)
        bpy.data.meshes.remove(me)
    if fails:
        raise SystemExit(f"[X] selftest: {len(fails)} failure(s): {fails}")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if not argv:
        raise SystemExit(__doc__)
    name, steps = argv[0], parse(argv[1:])
    bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
    m = load(name)
    built = False
    for step, arg in steps:
        t = time.time()
        if step == "selftest":
            selftest()
        elif step in ("build", "save"):
            m.build(save=step == "save")
            built = True
        elif not built:
            raise SystemExit(f"[X] {step} needs build or save first")
        elif step == "check":
            problems = m.check()
            if problems:
                raise SystemExit(f"[X] check: {len(problems)} problem(s)")
        elif step == "export":
            m.export(arg)
        elif step == "render":
            render(name, m.render_scene(), arg)
        print(f"[OK] {step} {time.time() - t:.0f}s", flush=True)


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        if e.code not in (None, 0):
            print(e.code if isinstance(e.code, str) else f"[X] exit {e.code}", flush=True)
            sys.stdout.flush()
            os._exit(1)
    except Exception:
        traceback.print_exc()
        sys.stdout.flush()
        os._exit(1)  # Blender's -b otherwise exits 0 after a failed --python script

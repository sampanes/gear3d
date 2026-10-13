"""SATOR letters for the hand-built board (run inside Blender).

build_letters() -- one solid letter per cell of the square, centered on its reference rod

o_width narrows the O (fraction of the font's width) while keeping its stroke widths, so it
still reads the same upside down but visibly changes when it turns a quarter.

Letters are cut from an installed font (looked up by file name in the Windows font
folders) and converted to plain meshes, so the .blend never carries or links the font
file. Each glyph is centered on its own bounding box: that center sits on the rod, the
axis the letter turns about.

symmetric= letters (default S and O) are made exactly symmetric under a half turn, so
they read the same upside down. Each outline loop is averaged point for point with its
own half-turned copy (both resampled by arc length; a half turn moves a point half way
round the loop), which cancels the font's small top/bottom differences.
"""

import math
import os

import bmesh
import bpy

SQUARE = ("SATOR", "AREPO", "TENET", "OPERA", "ROTAS")
PITCH = 180.0  # letter grid, see docs/sator-hand-build.md
FONT_DIRS = (r"C:\Windows\Fonts", os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Windows\Fonts"))


def font_path(file_name):
    for d in FONT_DIRS:
        p = os.path.join(d, file_name)
        if os.path.exists(p):
            return p
    raise FileNotFoundError(f"font {file_name} not found in {FONT_DIRS}")


def _glyph_loops(font, ch, resolution=24):
    """Outline loops (lists of (x, y)) of one character, in font units."""
    cu = bpy.data.curves.new("_glyph", "FONT")
    cu.font = font
    cu.body = ch
    cu.resolution_u = resolution
    ob = bpy.data.objects.new("_glyph", cu)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    boundary = [e for e in bm.edges if e.is_boundary]
    nxt = {}
    for e in boundary:  # walk boundary edges in face order
        f = e.link_faces[0]
        for lp in f.loops:
            if lp.edge is e:
                nxt[lp.vert.index] = lp.link_loop_next.vert.index
    co = {v.index: (v.co.x, v.co.y) for v in bm.verts}
    bm.free()
    loops, seen = [], set()
    for start in nxt:
        if start in seen:
            continue
        loop, v = [], start
        while v not in seen:
            seen.add(v)
            loop.append(co[v])
            v = nxt[v]
        loops.append(loop)
    return loops


def _resample(loop, n):
    pts = loop + loop[:1]
    cum = [0.0]
    for a, b in zip(pts, pts[1:]):
        cum.append(cum[-1] + math.dist(a, b))
    out, seg = [], 0
    for k in range(n):
        s = cum[-1] * k / n
        while seg < len(pts) - 2 and cum[seg + 1] < s:
            seg += 1
        f = (s - cum[seg]) / max(cum[seg + 1] - cum[seg], 1e-12)
        (x0, y0), (x1, y1) = pts[seg], pts[seg + 1]
        out.append((x0 + (x1 - x0) * f, y0 + (y1 - y0) * f))
    return out


def _half_turn_average(loop, cx, cy, n=1200):
    """Average a loop with its half-turned copy about (cx, cy): exactly half-turn symmetric."""
    p = _resample(loop, n)
    # start where the half-turned copy lines up best (the loop maps onto itself, shifted)
    rot = [(2 * cx - x, 2 * cy - y) for x, y in p]
    best = min(range(0, n, 2), key=lambda k: sum(math.dist(p[i], rot[(i + k) % n]) for i in range(0, n, 20)))
    q = [((p[i][0] + rot[(i + best) % n][0]) / 2, (p[i][1] + rot[(i + best) % n][1]) / 2) for i in range(n)]
    return q


def _narrow_o(loops, cx, cy, frac):
    """Narrow an O to `frac` of its width, keeping the font's stroke widths (see module doc).

    The outer edge is scaled across; the counter is scaled across by just enough to keep the
    side strokes at their original width (top and bottom are untouched).
    """
    outer, inner = sorted(loops, key=lambda lp: _bbox([lp])[2] - _bbox([lp])[0], reverse=True)[:2]
    ox0, _, ox1, _ = _bbox([outer])
    ix0, _, ix1, _ = _bbox([inner])
    side = ((ox1 - ox0) - (ix1 - ix0)) / 2
    k_in = (frac * (ox1 - ox0) - 2 * side) / (ix1 - ix0)
    return [[(cx + (x - cx) * frac, y) for x, y in outer],
            [(cx + (x - cx) * k_in, y) for x, y in inner]]


def _bbox(loops):
    xs = [x for lp in loops for x, _ in lp]
    ys = [y for lp in loops for _, y in lp]
    return min(xs), min(ys), max(xs), max(ys)


def _letter_mesh(name, loops, thick, chamfer):
    """Extrude outlines (font fill rule) to a solid with chamfered edges, via a 2D curve."""
    cu = bpy.data.curves.new("_letter", "CURVE")
    cu.dimensions = "2D"
    cu.fill_mode = "BOTH"
    cu.extrude = max(thick / 2 - chamfer, 0.0)
    cu.bevel_depth = chamfer
    cu.bevel_resolution = 0  # 45 deg chamfer
    cu.offset = -chamfer  # keep the outline at the true glyph size
    for loop in loops:
        sp = cu.splines.new("POLY")
        sp.points.add(len(loop) - 1)
        for pt, (x, y) in zip(sp.points, loop):
            pt.co = (x, y, 0.0, 1.0)
        sp.use_cyclic_u = True
    ob = bpy.data.objects.new("_letter", cu)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.translate(bm, verts=bm.verts[:], vec=(0, 0, thick / 2))  # flat bottom at z 0
    bm.to_mesh(me)
    bm.free()
    me.name = name
    return me


def _gold():
    mat = bpy.data.materials.get("Letter_Gold") or bpy.data.materials.new("Letter_Gold")
    mat.diffuse_color = (0.95, 0.70, 0.22, 1.0)  # viewport (Solid shading)
    mat.metallic = 1.0
    mat.roughness = 0.3
    if mat.node_tree is None:
        mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = (1.0, 0.72, 0.29, 1.0)
        bsdf.inputs["Metallic"].default_value = 1.0
        bsdf.inputs["Roughness"].default_value = 0.3
    return mat


def build_letters(font_file="LithosPro-Regular.otf", height=100.0, thick=4.0, z=14.0,
                  chamfer=0.8, symmetric="SO", o_width=0.75, collection="Letters"):
    """(Re)build all 25 letters. height = cap height in mm (measured on E); z = letter bottom."""
    col = bpy.data.collections.get(collection)
    if col is None:
        col = bpy.data.collections.new(collection)
        bpy.context.scene.collection.children.link(col)
    for o in list(col.objects):
        me = o.data
        bpy.data.objects.remove(o)
        if me.users == 0:
            bpy.data.meshes.remove(me)
    gold = _gold()
    font = bpy.data.fonts.load(font_path(font_file), check_existing=False)
    try:
        x0, y0, x1, y1 = _bbox(_glyph_loops(font, "E"))
        scale = height / (y1 - y0)
        meshes = {}
        for ch in sorted(set("".join(SQUARE))):
            loops = _glyph_loops(font, ch)
            bx0, by0, bx1, by1 = _bbox(loops)
            cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
            if ch == "O" and o_width != 1.0:
                loops = _narrow_o(loops, cx, cy, o_width)
            if ch in symmetric:
                loops = [_half_turn_average(lp, cx, cy) for lp in loops]
            loops = [[((x - cx) * scale, (y - cy) * scale) for x, y in lp] for lp in loops]
            old = bpy.data.meshes.get(f"Letter_{ch}")
            if old is not None and old.users == 0:
                bpy.data.meshes.remove(old)
            meshes[ch] = _letter_mesh(f"Letter_{ch}", loops, thick, chamfer)
            meshes[ch].materials.append(gold)
    finally:
        bpy.data.fonts.remove(font)  # keep no font datablock (or path) in the .blend
    for r, word in enumerate(SQUARE):
        for c, ch in enumerate(word):
            ob = bpy.data.objects.new(f"Ltr_R{r + 1}C{c + 1}_{ch}", meshes[ch])
            ob.location = ((c - 2) * PITCH, (2 - r) * PITCH, z)
            col.objects.link(ob)
    col["letters"] = (f"font={font_file} height={height} thick={thick} z={z} chamfer={chamfer} "
                      f"symmetric={symmetric} o_width={o_width}")
    return col

"""Bearing stacks for an O toggle unit, and a stand that holds its corner on its own (run
inside Blender). See docs/sator-hand-build.md, "O toggle stand".

stacks(unit)       -- printed pieces that join the gears turning together and seat their
                      bearings: driver A + the 27T (one part), B's drum, star + S gear (one
                      part), a drum under each O gear; a relief under each locking boss
stand(unit)        -- the standalone stand (unit NE is the OPRO corner): a round floor in four
                      quadrant tiles and a keystone, pedestals, columns, a bridge through the
                      star gap, bow-tie keys; M8 rods and nuts as grey stand-ins
check_stand(unit)  -- clearance from every stand part to everything that turns
export_stand(unit) -- the stand's printed parts as STLs

Every turning group runs on two 608 bearings (8 x 22 x 7) on a fixed M8 threaded rod, one
bearing pressed into each outer face of the group (the 21.9 holes the gears already have).
A plug between the two seats carries each bearing's outer race; a counterbore keeps the inner
race clear. Each inner race rests on a hex nut sunk in a pocket at the top of whatever holds
the rod, standing 1 proud as the spacer (it touches only the inner race and the seal).

Every fixed part hangs off the floor: each rod runs from a nut in a trap under its foot up
through a nut in a pocket at the top of its support, so foot, tile and support stay on the
rod when the stand is lifted; the star's rod hangs from its nut in the bridge's top. The
supports all lie on the eight compass lines through the star axis: A and B on the A-B line,
the bridge's columns across it, P and R on one diagonal, the O's on the other. So the floor is a compass rose: spokes along those lines,
two rings through the supports, a rim; four quadrant tiles meeting under the star (seams
between the spokes), a keystone over the meeting point, bow-tie keys across the seams.

Style: Roman (Attic bases, fluted shafts, echinus capitals, a lintel) with steampunk touches
(rivets, the open grate floor, bow-tie keys, acorn nuts left showing on the bridge).
"""

import importlib.util
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

_HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(_HERE, name + ".py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


sot = _load("sator_o_toggle")
carve = _load("carve")

# ==== hardware (mm) ====
BEARING_W = 7.0          # 608: 8 x 22 x 7, pressed into the gears' 21.9 holes
BEARING_R = sot.BEARING_R
SEAT_R = BEARING_R + 0.3  # plugs reach this far into the part's wall (no shared wall)
RELIEF_R = 8.0           # counterbore over the inner race (608 inner ring is ~12 across)
RELIEF_H = 0.6
ROD_HOLE_R = sot.ROD_HOLE_D / 2  # turning parts: clearance round the rod
ROD_FIT_R = 4.15         # fixed parts: snug on the rod
ROD_R = 4.0
SPACER_H = 1.0           # a nut stands this far proud of each support, under the inner race
NUT_AF = 13.0            # M8 nut across flats / height
NUT_H = 6.5
TRAP_AF = NUT_AF + 0.3
TRAP_H = NUT_H + 0.3
END_BAND = 0.4           # _fill(straight=True): height each squeezed end chamfer takes
ACORN_H = 15.0           # M8 acorn (dome) nut on top of each bridge end (DIN 1587)
# ==== stacks ====
COLLAR_R = 14.7          # joins A to its 27T and the star to its S gear (A's hub windows start at 15.2)
DRUM_TOP_R = 14.5        # drum band under B / an O (inside B's hub windows and the O's hub)
DRUM_B_R = 16.5          # drum body under B (fluted)
DRUM_O_R = 15.0          # drum body under an O
DRUM_FLUTES = 12
BOSS_BORE_R = 11.25      # through each locking boss, so A's / B's top bearing (22 OD) goes in from above
DRUM_FLUTE_D = 0.8
# ==== stand ====
FLOOR_TOP = -62.0        # every turning part ends at z -57 or higher
FLOOR_T = 6.0
FOOT_H = 8.0
PED_TOP = -58.0          # pedestals: 1 below the bearings' bed faces; spacer to -57
R_FLOOR = 158.0          # floor radius round the star axis
RIM_W = 14.0
SEAM = 0.15              # half gap at each seam
SEAM_BAND = 5.0          # solid each side of a seam
HUB_R = 56.0             # solid centre (keystone and the inner keys sit in it)
RING1 = 80.0             # inner ring (A/B pedestals at 72, the bridge's columns at 87)
RING2 = sot.OUT_CENTER   # outer ring through P, R and the O's (127.3)
RING_HW = 4.0
SPOKE_HW = 4.0
PAD = 6.0                # solid round each support's base
WIN_FILLET = 4.0
KEYSTONE_R = 36.0
KEY_DEPTH = 3.0          # keystone and bow-tie keys sit this deep in the tiles
KEY_FIT = 0.15
BOWTIE = (11.0, 6.0, 3.0)  # half length (across the seam), end half width, waist half width
BOWTIE_R = (46.0, 151.0)   # where the keys cross each seam
SPIGOT_R, SPIGOT_H = 11.0, 3.0  # columns plug into the floor
FOOT_R = 13.0
PEG_R, PEG_H = 4.0, 3.0  # the centre feet's pegs
RIVET_R, RIVET_H = 2.0, 1.0
PED_R = 21.0             # pedestal plinth
COL_BASE_R = 22.0
BR_D = 87.0              # bridge columns, from the star axis across the A-B line
BEAM_Z = (-39.0, -31.0)  # bridge beam: 1 mm air to the A/B gears below and the star above
BEAM_HW = 20.0           # beam half width away from the star
BEAM_CLEAR = 2.5         # beam edge to the pin posts' sweep
FLUTES, FLUTE_FILL = 12, 0.75
GRID = 0.5
SEGS = 256
SUPPORT_COL = (0.28, 0.42, 0.62, 1)
HW_COL = (0.3, 0.3, 0.32, 1)


# ---- small geometry helpers -------------------------------------------------------------------

def _flute(a, n=FLUTES):
    u = (a * n / (2 * math.pi)) % 1.0
    v = (u - 0.5) / (FLUTE_FILL / 2)
    return (1 - v * v) ** 0.6 if abs(v) < 1 else 0.0


def _revolve(name, profile, n=96, flutes=FLUTES):
    """Closed mesh from turning an (r, z[, w]) loop once round the z axis; w = flute depth."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    angles = [2 * math.pi * i / n for i in range(n)]
    rings = []
    for p in profile:
        r, z, w = p if len(p) == 3 else (*p, 0.0)
        rings.append([bm.verts.new(((r - w * _flute(a, flutes)) * math.cos(a),
                                    (r - w * _flute(a, flutes)) * math.sin(a), z)) for a in angles])
    for a, b in zip(rings, rings[1:] + rings[:1]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    return me


def _arc(cr, cz, rad, a0, a1, n=8):
    return [(cr + rad * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cz + rad * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def _prism(name, loop, z0, z1):
    """Straight extrusion of a CCW xy loop."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in loop]
    hi = [bm.verts.new((x, y, z1)) for x, y in loop]
    n = len(loop)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    return me


def _cyl(name, r, z0, z1, n=48):
    return _prism(name, [(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n)) for i in range(n)],
                  z0, z1)


def _hex(name, af, z0, z1):
    rc = af / math.sqrt(3)
    return _prism(name, [(rc * math.cos(math.pi / 3 * i), rc * math.sin(math.pi / 3 * i)) for i in range(6)], z0, z1)


def _domes(name, centers, z, r=RIVET_R, h=RIVET_H, n=16, rings=4):
    """Rivet heads: spherical caps of radius r and height h standing on z (sunk 0.3 into it)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    R = (r * r + h * h) / (2 * h)
    for cx, cy in centers:
        layers = []
        for k in range(rings):
            rr = r * math.cos(math.pi / 2 * k / rings)
            zz = z + math.sqrt(max(R * R - rr * rr, 0.0)) - (R - h)
            layers.append([bm.verts.new((cx + rr * math.cos(2 * math.pi * i / n), cy + rr * math.sin(2 * math.pi * i / n), zz))
                           for i in range(n)])
        base = [bm.verts.new((cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n), z - 0.3))
                for i in range(n)]
        top = bm.verts.new((cx, cy, z + h))
        stack = [base] + layers
        for a, b in zip(stack, stack[1:]):
            for i in range(n):
                j = (i + 1) % n
                bm.faces.new((a[i], a[j], b[j], b[i]))
        for i in range(n):
            bm.faces.new((stack[-1][i], stack[-1][(i + 1) % n], top))
        bm.faces.new(list(reversed(base)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    return me


def _object(name, me, col, parent=None, color=None, location=(0.0, 0.0, 0.0)):
    old = bpy.data.objects.get(name)
    if old is not None:
        _remove(old)
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    ob.location = location
    if parent is not None:
        ob.parent = parent
        ob.matrix_parent_inverse = parent.matrix_world.inverted()
    if color is not None:
        ob.color = color
    return ob


def _remove(ob):
    for o in [ob] + list(ob.children_recursive):
        me = o.data if o.type == "MESH" else None
        bpy.data.objects.remove(o)
        if me is not None and me.users == 0:
            bpy.data.meshes.remove(me)


def _bool(target, cutter, op):
    mod = target.modifiers.new(f"{op.title()} {cutter.name}", "BOOLEAN")
    mod.operation, mod.solver, mod.object = op, "EXACT", cutter
    return mod


def _hidden(ob):
    ob.display_type, ob.hide_render = "WIRE", True
    ob.hide_set(True)
    return ob


# ---- bearing stacks ---------------------------------------------------------------------------

def _plug(f_bot, f_top, collar=None):
    """(r, z) loop of the plug between two bearing seats (floors f_bot < f_top); collar
    (z0, z1, r) widens it where two gears meet."""
    pts = [(RELIEF_R, f_bot), (SEAT_R, f_bot)]
    if collar is not None:
        z0, z1, r = collar
        pts += [(SEAT_R, z0), (r, z0), (r, z1), (SEAT_R, z1)]
    pts += [(SEAT_R, f_top), (RELIEF_R, f_top), (RELIEF_R, f_top - RELIEF_H), (ROD_HOLE_R, f_top - RELIEF_H),
            (ROD_HOLE_R, f_bot + RELIEF_H), (RELIEF_R, f_bot + RELIEF_H)]
    return pts


def _drum(z_bot, g_bot, body_r, top_r=DRUM_TOP_R):
    """(r, z[, w]) loop of a drum hanging under a gear (bed face g_bot) down to z_bot: a bottom
    bearing seat, a fluted body between a torus and a bead, a neck into the gear, and the
    plug up to the gear's own seat."""
    f_bot = z_bot + BEARING_W
    f_top = g_bot + sot.GEAR_H - BEARING_W  # the gear's own seat floor
    pts = [(BEARING_R, z_bot), (body_r - 0.8, z_bot)]
    pts += _arc(body_r - 0.3, z_bot + 1.3, 1.3, -60, 90)[1:]           # torus at the foot
    s0, s1 = z_bot + 3.0, g_bot - 2.6                                  # fluted body
    n = max(6, int((s1 - s0) / 0.25))
    for i in range(n + 1):
        z = s0 + (s1 - s0) * i / n
        d = min(z - s0, s1 - z)
        w = DRUM_FLUTE_D * math.sqrt(max(0.0, 1 - max(0.0, (0.8 - d) / 0.8) ** 2)) if d > 0 else 0.0
        pts.append((body_r - 0.6, z, w))
    pts += _arc(body_r - 0.6, g_bot - 1.9, 0.7, -90, 90)[1:]           # bead
    pts += [(top_r, g_bot - 1.0), (top_r, g_bot + 0.5)]               # neck, into the gear
    pts += [(SEAT_R, g_bot + 0.5), (SEAT_R, f_top), (RELIEF_R, f_top), (RELIEF_R, f_top - RELIEF_H),
            (ROD_HOLE_R, f_top - RELIEF_H), (ROD_HOLE_R, f_bot + RELIEF_H), (RELIEF_R, f_bot + RELIEF_H),
            (RELIEF_R, f_bot), (BEARING_R, f_bot)]
    return pts


def _wall_cutter(name, src, ring_a, ring_b, t, z0, z1):
    """Straight-walled copy of a window cutter `src` (a carve.cutter_mesh loft: per window its
    rings bottom to top, the same point count each, a ring per profile step): every ring moved
    to the outline ring_a + t * (ring_b - ring_a) (ring indices bottom to top), the top ring
    at world z z1 and the rest 0.01 apart up from z0 (spread evenly, a ring could land in a
    face plane of a part the fill joins, and the union then leaves slivers). Hidden, not
    cutting anything yet."""
    me = src.data.copy()
    me.name = name
    mw = src.matrix_world
    z = [round(v.co.z, 5) for v in me.vertices]
    rz = sorted(set(z))
    n_ring = len(rz)
    seg = next(i for i, zz in enumerate(z) if zz != z[0])  # points per ring
    if len(z) % (n_ring * seg) or any(z[k * seg] != rz[k] for k in range(n_ring)):
        raise ValueError(f"{src.name}: not a cutter_mesh loft")
    ring_a, ring_b = ring_a % n_ring, ring_b % n_ring
    co = [mw @ v.co for v in me.vertices]
    for w in range(len(co) // (n_ring * seg)):
        for i in range(seg):
            a = co[(w * n_ring + ring_a) * seg + i]
            b = co[(w * n_ring + ring_b) * seg + i]
            x, y = a.x + t * (b.x - a.x), a.y + t * (b.y - a.y)
            for k in range(n_ring):
                me.vertices[(w * n_ring + k) * seg + i].co = (x, y, z1 if k == n_ring - 1 else z0 + 0.01 * k)
    return _hidden(_object(name, me, src.users_collection[0]))


def _fill(name, src, z0, z1, target, shrink=0.998, cuts=(), straight=False):
    """src's own outline (its base mesh, before modifiers) stretched to z0..z1 and unioned into
    target. z0 sits inside src; the outline is scaled by `shrink` about src's axis so no wall
    lies on one of src's (coplanar walls break the union). `cuts`: cutters taken out of the
    fill before the union (each parented to the fill). `straight`: see below."""
    me = src.data.copy()
    me.name = name
    mw = src.matrix_world
    ax = mw.translation
    zs = [(mw @ v.co).z for v in me.vertices]
    lo, hi = min(zs), max(zs)
    # straight: src's end chamfers are the bands below / above where its outline first / last
    # reaches full size. Only the straight band between them is stretched to z0..z1; each
    # chamfer is squeezed into END_BAND just outside it, inside the parts it joins. Stretching
    # the whole outline left the fill's own chamfer beside src's chamfered teeth: a V groove
    # round every tooth (the 27T, whose teeth end in 1.5 mm chamfers).
    rs = [(mw @ v.co - ax).xy.length for v in me.vertices]
    full = max(rs) * 0.999
    zf = [z for z, r in zip(zs, rs) if r >= full]
    a, b = (min(zf), max(zf)) if straight else (lo, hi)

    def zmap(z):
        if z < a:
            return z0 - END_BAND * (a - z) / (a - lo)
        if z > b:
            return z1 + END_BAND * (z - b) / (hi - b)
        return z0 + (z - a) / max(b - a, 1e-9) * (z1 - z0)

    for v in me.vertices:
        q = mw @ v.co
        v.co = (ax.x + (q.x - ax.x) * shrink, ax.y + (q.y - ax.y) * shrink, zmap(q.z))
    ob = _object(name, me, target.users_collection[0])
    ob.parent = target
    ob.matrix_parent_inverse = target.matrix_world.inverted()
    for c in cuts:
        c.parent = ob
        c.matrix_parent_inverse = ob.matrix_world.inverted()
        _bool(ob, c, "DIFFERENCE")
    _bool(target, ob, "UNION")
    ob.hide_render, ob.display_type = True, "BOUNDS"
    ob.hide_set(True)
    return ob


def stacks(unit):
    """Bearing plugs, collars, drums and boss reliefs for one unit (rebuilt each call)."""
    n = sot._names(unit)
    O = bpy.data.objects
    out = {}

    def place(name, prof, parent, xy, flutes=DRUM_FLUTES):
        col = parent.users_collection[0]
        ob = _object(name, _revolve(name, prof, n=DRUM_FLUTES * 16, flutes=flutes), col, location=(*xy, 0.0))
        ob.parent = parent
        ob.matrix_parent_inverse = parent.matrix_world.inverted()
        out[name] = ob
        return ob

    ga, gb, gi = O[n["A"]], O[n["B"]], O[n["input"]]
    za = ga.location.z - sot.GEAR_H / 2            # A / B bed face
    zi = gi.location.z - sot.GEAR_H / 2            # 27T bed face
    place(f"{ga.name} Stack", _plug(zi + BEARING_W, za + sot.GEAR_H - BEARING_W, (zi + sot.GEAR_H - 0.5, za + 0.5, COLLAR_R)),
          ga, ga.location.xy)
    place(f"{gb.name} Drum", _drum(zi, za, DRUM_B_R), gb, gb.location.xy)
    star = O[f"{n['toggle']} Star"]
    go = O[n["out"]]
    zs = min((star.matrix_world @ v.co).z for v in star.data.vertices)
    zo = go.location.z - sot.GEAR_H / 2
    place(f"{star.name} Stack", _plug(zs + BEARING_W, zo + sot.GEAR_H - BEARING_W, (zs + sot.GEAR_H - 0.5, zo + 0.5, COLLAR_R)),
          star, star.matrix_world.translation.xy)
    for key in ("O1", "O2"):
        g = O[n[key]]
        zg = g.location.z - sot.GEAR_H / 2
        place(f"{g.name} Drum", _drum(zs, zg, DRUM_O_R), g, g.location.xy)
    # the 1 mm between two joined gears would leave the upper one hanging over the lower with
    # nothing to print on: the lower gear's own outline fills it (nothing else passes there)
    bpy.context.view_layer.update()
    # (the 27T's fill starts 1.5 down, so it fills the rim dots the 27T's top face would hide,
    # and ends 0.3 up into A, clear of the export's squeezed crossings at A's bed face)
    _fill(f"{ga.name} Stack Fill", gi, zi + sot.GEAR_H - 1.5, za + 0.3, out[f"{ga.name} Stack"], straight=True)
    # (the star's ends 1 up into the S gear: at its bed face, or 0.3 to 0.5 above it, the union
    # leaves slivers where it meets the S gear's cut-away sector)
    # Both layers are windowed, so the fill keeps both sets of windows open: the star's at
    # their rounded top width + 0.05 (the fill's walls stand on the star's flat top), the S
    # gear's halfway out its bed chamfer (no wall on one of S's)
    z0, z1 = zs + sot.GEAR_H - 1.0, zo + 2.0
    cuts = (_wall_cutter(f"{star.name} Stack Fill Star Windows", O[f"{star.name} Windows"], -1, 2, -0.05 / 1.2, z0, z1),
            _wall_cutter(f"{star.name} Stack Fill S Windows", O[f"{go.name} Sector Cutter"], 0, 2, 0.5, z0, z1))
    _fill(f"{star.name} Stack Fill", star, zs + sot.GEAR_H - 0.3, zo + 1.0, out[f"{star.name} Stack"], cuts=cuts)
    # the top bearing of A and B sits right under the locking boss, which prints with the
    # gear: a bore down through the boss lets the bearing in from the top, and the rod's top
    # nut down onto its inner race
    for side in "AB":
        bo = O[f"{n['toggle']} Driver {side}"]
        g = O[n[side]]
        zt = g.location.z + sot.GEAR_H / 2
        boss_top = max((bo.matrix_world @ Vector(c)).z for c in bo.bound_box)
        for nm in ("Seat", "Relief", "Bore"):
            old = O.get(f"{bo.name} Bearing {nm}")
            if old is not None:
                for m in [m for m in bo.modifiers if getattr(m, "object", None) == old]:
                    bo.modifiers.remove(m)
                _remove(old)
        for nm, r, z0, z1 in (("Bore", BOSS_BORE_R, zt - 1.0, boss_top + 1.0),):
            cname = f"{bo.name} Bearing {nm}"
            cut = _object(cname, _cyl(cname, r, z0, z1), bo.users_collection[0], location=(*g.location.xy, 0.0))
            cut.parent = bo
            cut.matrix_parent_inverse = bo.matrix_world.inverted()
            _hidden(cut)
            _bool(bo, cut, "DIFFERENCE")
    return out


# ---- stand ----------------------------------------------------------------------------------

def _frame(unit):
    """Star axis, the compass direction e (from the star across the A-B line, toward the O
    whose cell is on the + side) and every support: name -> (xy, kind)."""
    L = sot.layout(unit)
    sx, sy = L["star"]
    ax, ay = L["A"]
    bx, by = L["B"]
    ab = math.atan2(by - ay, bx - ax)
    o2 = math.atan2(L["O2"][1] - sy, L["O2"][0] - sx)
    e = min((ab - math.pi / 2, ab + math.pi / 2), key=lambda t: abs(math.remainder(t - (o2 + math.pi / 4), 2 * math.pi)))
    r_xy = (2 * sx - L["P"][0], 2 * sy - L["P"][1])
    sup = {"P": (L["P"], "pedestal"), "A": (L["A"], "pedestal"), "B": (L["B"], "pedestal"),
           "O1": (L["O1"], "column"), "O2": (L["O2"], "column"), "R": (r_xy, "letter"),
           "BrE": ((sx + BR_D * math.cos(e), sy + BR_D * math.sin(e)), "bridge"),
           "BrW": ((sx - BR_D * math.cos(e), sy - BR_D * math.sin(e)), "bridge")}
    return (sx, sy), e, sup


def _pedestal_prof():
    z0 = FLOOR_TOP - 0.5
    pts = [(ROD_FIT_R, z0), (PED_R, z0), (PED_R, FLOOR_TOP + 1.0)]
    pts += _arc(PED_R - 1.3, FLOOR_TOP + 2.2, 1.2, -90, 90)[1:]
    pts += [(PED_R - 2.7, FLOOR_TOP + 2.6), (PED_R - 3.0, FLOOR_TOP + 3.0)]
    pts += _arc(PED_R - 3.6, FLOOR_TOP + 3.5, 0.5, -90, 90)[1:]
    pts += [(PED_R - 4.5, PED_TOP), (ROD_FIT_R, PED_TOP)]
    return pts


def _nut_pocket(name, col, x, y, nut_top):
    """Hex pocket open at the top: a nut dropped in stands with its top face at nut_top."""
    return _object(name, _hex("nut pocket", TRAP_AF, nut_top - NUT_H, nut_top + 2.0), col, location=(x, y, 0.0))


def _column_prof(z0, z1, base_r, shaft_r, cap_r, top):
    """Attic base on the floor (z0) with a spigot under it, fluted shaft with a little entasis,
    bead, echinus (<= 50 deg, prints unsupported) and abacus up to z1. top: "embed" (runs
    0.5 on into the part above), "spigot" (plugs into the part above), "flat"."""
    pts = [(ROD_FIT_R, z0 - SPIGOT_H), (SPIGOT_R, z0 - SPIGOT_H), (SPIGOT_R, z0), (base_r, z0), (base_r, z0 + 1.2)]
    pts += _arc(base_r - 1.4, z0 + 2.4, 1.2, -90, 90)[1:]               # lower torus
    pts += [(base_r - 2.8, z0 + 3.9), (base_r - 3.1, z0 + 4.3)]          # scotia
    pts += _arc(shaft_r + 0.3, z0 + 5.0, 0.7, -90, 90)[1:]               # upper torus
    top_r = shaft_r - 0.6
    neck = top_r - 0.1
    h = cap_r - neck
    s0, s1 = z0 + 6.0, z1 - 1.2 - h - 1.8
    if s1 - s0 < 4.0:
        raise ValueError("column too short for its base and capital")
    n = max(8, int((s1 - s0) / 0.3))
    for i in range(n + 1):
        z = s0 + (s1 - s0) * i / n
        r = shaft_r - (shaft_r - top_r) * (i / n) ** 1.5
        d = min(z - (s0 + 0.5), (s1 - 0.5) - z)
        w = 1.0 * math.sqrt(max(0.0, 1 - max(0.0, (1.0 - d) / 1.0) ** 2)) if d > 0 else 0.0
        pts.append((r, z, w))
    pts += _arc(top_r + 0.1, s1 + 0.8, 0.7, -90, 90)[1:]                 # astragal bead
    pts.append((neck, s1 + 1.8))
    for i in range(1, 17):                                              # echinus, convex
        s = i / 16
        pts.append((neck + h * (1.19 * s - 0.19 * s * s), s1 + 1.8 + h * s))
    pts.append((cap_r, z1))                                             # abacus
    if top == "embed":
        pts += [(cap_r, z1 + 0.5), (ROD_FIT_R, z1 + 0.5)]
    elif top == "spigot":
        pts += [(SPIGOT_R, z1), (SPIGOT_R, z1 + SPIGOT_H), (ROD_FIT_R, z1 + SPIGOT_H)]
    else:
        pts.append((ROD_FIT_R, z1))
    return pts


def _bowtie(cx, cy, ang, grow=0.0):
    L, we, ww = BOWTIE
    pts = [(-L, -we), (0.0, -ww), (L, -we), (L, we), (0.0, ww), (-L, we)]
    c, s = math.cos(ang), math.sin(ang)
    out = []
    for x, y in pts:
        out.append((cx + x * c - y * s, cy + x * s + y * c))
    if grow:
        loops = [out]
        g = carve.Grid.around(loops, pad=grow + 2, h=0.1)
        f = g.sdf(loops) + grow
        return max(g.contours(f), key=carve.area)
    return out


def _solid_profile(z0, z1, top_round=1.0, bed=0.6):
    prof = [(z0, -bed), (z0 + bed, 0.0)] if bed > 0 else [(z0, 0.0)]
    prof += [(z1 - top_round + top_round * math.sin(math.pi / 2 * k / 4), -top_round * (1 - math.cos(math.pi / 2 * k / 4)))
             for k in range(5)]
    return prof


def _floor_fields(g, star, e, sup):
    """Region fields over grid g: (tile k -> solid field, windows field)."""
    sx, sy = star
    px, py = g.pts[:, 0] - sx, g.pts[:, 1] - sy
    rho = np.hypot(px, py)
    win = R_FLOOR - RIM_W - rho
    win = np.minimum(win, rho - HUB_R)
    win = np.minimum(win, np.abs(rho - RING1) - RING_HW)
    win = np.minimum(win, np.abs(rho - RING2) - RING_HW)
    for j in range(8):                                   # spokes
        t = e + j * math.pi / 4
        along = px * math.cos(t) + py * math.sin(t)
        across = np.abs(-px * math.sin(t) + py * math.cos(t))
        win = np.minimum(win, np.where(along > 0, across, rho) - SPOKE_HW)
    for name, ((x, y), kind) in sup.items():
        base = PED_R if kind == "pedestal" else COL_BASE_R
        win = np.minimum(win, np.hypot(g.pts[:, 0] - x, g.pts[:, 1] - y) - base - PAD)
    tiles = {}
    for k in range(4):
        a0 = e + math.radians(22.5) + k * math.pi / 2
        a1 = a0 + math.pi / 2
        # inside the wedge a0..a1: + side of both seam lines
        d0 = -px * math.sin(a0) + py * math.cos(a0)     # left of the ray at a0
        d1 = px * math.sin(a1) - py * math.cos(a1)      # right of the ray at a1
        solid = np.minimum(np.minimum(d0, d1) - SEAM, R_FLOOR - rho)
        seam = np.minimum(d0, d1) - SEAM_BAND
        tiles[k] = (g.field(solid), g.field(np.minimum(win, seam)), (a0, a1))
    return tiles


def _beam_field(g, star, e, sweep_r, sweep_c):
    """+ inside the bridge beam's plan: waisted round the star (BEAM_CLEAR off the pin posts'
    sweep circles, radius sweep_r at sweep_c from the star either side), BEAM_HW wide
    beyond, round ends past the columns."""
    sx, sy = star
    px, py = g.pts[:, 0] - sx, g.pts[:, 1] - sy
    d = px * math.cos(e) + py * math.sin(e)
    h = np.abs(-px * math.sin(e) + py * math.cos(e))
    lim = np.full(len(d), BEAM_HW)
    inside = np.abs(d) < sweep_r
    lim[inside] = np.minimum(BEAM_HW, sweep_c - BEAM_CLEAR - np.sqrt(sweep_r ** 2 - d[inside] ** 2))
    f = np.minimum(lim - h, BR_D - np.abs(d))
    for sgn in (1, -1):
        f = np.maximum(f, BEAM_HW - np.hypot(d - sgn * BR_D, h))
    return g.field(f)


def stand(unit="NE"):
    """Build (or rebuild) the unit's stand in collection 'Stand <unit>'."""
    star, e, sup = _frame(unit)
    sx, sy = star
    n = sot._names(unit)
    O = bpy.data.objects
    cname = f"Stand {unit}"
    col = bpy.data.collections.get(cname)
    if col is None:
        col = bpy.data.collections.new(cname)
        bpy.context.scene.collection.children.link(col)
    for ob in [o for o in col.objects if o.parent is None]:
        _remove(ob)
    pre = f"Stand_{unit}"
    made = {}

    # ---- floor tiles ----
    g = carve.Grid(sx - R_FLOOR - 3, sy - R_FLOOR - 3, sx + R_FLOOR + 3, sy + R_FLOOR + 3, GRID)
    tiles = _floor_fields(g, star, e, sup)
    z0, z1 = FLOOR_TOP - FLOOR_T, FLOOR_TOP
    seams = [e + math.radians(22.5) + k * math.pi / 2 for k in range(4)]
    for k, (solid, win, (a0, a1)) in tiles.items():
        name = f"{pre} Floor Q{k + 1}"
        body = carve.Region(g, solid, 2.0, min_area=100.0, grow=(-1.5, 0.5))
        tile = _object(name, carve.cutter_mesh(name, body, _solid_profile(z0, z1), 1024), col, color=SUPPORT_COL)
        unions, cuts = [], []
        mine = {nm: v for nm, v in sup.items()
                if (math.atan2(v[0][1] - sy, v[0][0] - sx) - a0) % (2 * math.pi) < math.pi / 2}
        for nm, ((x, y), kind) in mine.items():
            if kind == "pedestal":
                unions.append(_object(f"{name} Pedestal {nm}", _revolve("pedestal", _pedestal_prof(), 96), col,
                                      location=(x, y, 0.0)))
            else:
                cuts.append(_object(f"{name} Socket {nm}", _cyl("socket", SPIGOT_R + 0.2, FLOOR_TOP - SPIGOT_H - 0.2, FLOOR_TOP + 1),
                                    col, location=(x, y, 0.0)))
            cuts.append(_object(f"{name} Rod Hole {nm}", _cyl("rod hole", ROD_FIT_R, z0 - 1, PED_TOP + SPACER_H + 1, 32),
                                col, location=(x, y, 0.0)))
            if kind == "pedestal":
                cuts.append(_nut_pocket(f"{name} Nut Pocket {nm}", col, x, y, PED_TOP + SPACER_H))
            # a bun foot under it (printed apart, so the tile prints flat) holds the rod's nut
            foot = _object(f"{pre} Foot {nm}", _revolve("foot", _foot_prof(), 64), col, color=SUPPORT_COL, location=(x, y, 0.0))
            trap = _object(f"{pre} Foot {nm} Nut Trap", _hex("nut trap", TRAP_AF, z0 - FOOT_H - 1, z0 - FOOT_H + TRAP_H),
                           col)
            trap.parent = foot  # in the foot's frame
            _hidden(trap)
            _bool(foot, trap, "DIFFERENCE")
            made[foot.name] = foot
        mid = (a0 + a1) / 2
        hx, hy = sx + 30 * math.cos(mid), sy + 30 * math.sin(mid)
        cuts.append(_object(f"{name} Peg Hole", _cyl("peg hole", PEG_R + 0.15, z0 - 1, z0 + PEG_H + 0.2, 32), col,
                            location=(hx, hy, 0.0)))
        made[f"{pre} Foot Hub {k + 1}"] = _object(f"{pre} Foot Hub {k + 1}", _revolve("foot", _foot_prof(peg=True), 64), col,
                                                  color=SUPPORT_COL, location=(hx, hy, 0.0))
        rivets = [(sx + 151 * math.cos(t), sy + 151 * math.sin(t))
                  for t in np.arange(a0 + math.radians(13), a1 - math.radians(12), math.radians(7.5))]
        unions.append(_object(f"{name} Rivets", _domes("rivets", rivets, FLOOR_TOP), col))
        if win.max() > 0:
            windows = carve.Region(g, win, WIN_FILLET, min_area=30.0, grow=(0.0, 1.5))
            cuts.append(_object(f"{name} Windows",
                                carve.cutter_mesh("floor windows", windows, carve.edge_profile(z0, z1, 1.2, 0.6), 512), col))
        # keystone recess at the tips, and half of each bow-tie at both seams of the tile
        cuts.append(_object(f"{name} Keystone Recess", _cyl("keystone recess", KEYSTONE_R + KEY_FIT, FLOOR_TOP - KEY_DEPTH - 0.2,
                                                            FLOOR_TOP + 1, 128), col, location=(sx, sy, 0.0)))
        for t in (a0, a1):
            for rk in BOWTIE_R:
                loop = _bowtie(sx + rk * math.cos(t), sy + rk * math.sin(t), t + math.pi / 2, KEY_FIT)
                cuts.append(_object(f"{name} Key Recess {math.degrees(t):.0f} {rk:.0f}",
                                    _prism("key recess", loop, FLOOR_TOP - KEY_DEPTH - 0.2, FLOOR_TOP + 1), col))
        for u in unions:
            u.parent = tile
            u.hide_set(False)
            _bool(tile, u, "UNION")
            u.hide_render = True
            u.display_type = "BOUNDS"
            u.hide_set(True)
        for c in cuts:
            c.parent = tile
            _hidden(c)
            _bool(tile, c, "DIFFERENCE")
        made[name] = tile

    # ---- keystone: a compass rose in relief, a ring of rivets ----
    name = f"{pre} Keystone"
    gk = carve.Grid(sx - KEYSTONE_R - 2, sy - KEYSTONE_R - 2, sx + KEYSTONE_R + 2, sy + KEYSTONE_R + 2, 0.2)
    disc = carve.Region(gk, gk.field(carve.circle_sdf(gk.pts, star, KEYSTONE_R)), 0.0, grow=(-1.0, 0.0))
    ks = _object(name, carve.cutter_mesh(name, disc, _solid_profile(FLOOR_TOP - KEY_DEPTH, FLOOR_TOP, 0.8, 0.4), 512),
                 col, color=SUPPORT_COL)
    rose = []
    for j in range(16):
        t = e + j * math.pi / 8
        rr = (KEYSTONE_R - 7) if j % 4 == 0 else (KEYSTONE_R - 14 if j % 2 == 0 else 9.0)
        rose.append((sx + rr * math.cos(t), sy + rr * math.sin(t)))
    rr = carve.Region(gk, gk.sdf([rose]), 0.6, grow=(-0.6, 0.0))
    rose_ob = _object(f"{name} Rose", carve.cutter_mesh("rose", rr, _solid_profile(FLOOR_TOP - 0.3, FLOOR_TOP + 1.0, 0.5, 0.0), 512), col)
    riv = _object(f"{name} Rivets", _domes("rivets", [(sx + (KEYSTONE_R - 3.5) * math.cos(e + math.pi / 8 * j),
                                                          sy + (KEYSTONE_R - 3.5) * math.sin(e + math.pi / 8 * j)) for j in range(16)],
                                             FLOOR_TOP, 1.4, 0.7), col)
    for u in (rose_ob, riv):
        u.parent = ks
        _bool(ks, u, "UNION")
        u.hide_render, u.display_type = True, "BOUNDS"
        u.hide_set(True)
    made[name] = ks

    # ---- bow-tie keys (one design, 8 of them) ----
    for k, t in enumerate(seams):
        for rk in BOWTIE_R:
            name = f"{pre} Key {k + 1}{'io'[BOWTIE_R.index(rk)]}"
            loop = _bowtie(0.0, 0.0, 0.0)
            gb = carve.Grid.around([loop], pad=2, h=0.1)
            reg = carve.Region(gb, gb.sdf([loop]), 1.0, grow=(-0.8, 0.0))
            ob = _object(name, carve.cutter_mesh("bowtie", reg, _solid_profile(FLOOR_TOP - KEY_DEPTH, FLOOR_TOP, 0.6, 0.3), 256),
                         col, color=(0.72, 0.55, 0.25, 1), location=(sx + rk * math.cos(t), sy + rk * math.sin(t), 0.0))
            ob.rotation_euler.z = t + math.pi / 2
            rv = _object(f"{name} Rivets", _domes("rivets", [(-7.0, 0.0), (7.0, 0.0)], FLOOR_TOP, 1.4, 0.7), col)
            rv.parent = ob
            _bool(ob, rv, "UNION")
            rv.hide_render, rv.display_type = True, "BOUNDS"
            rv.hide_set(True)
            made[name] = ob

    # ---- columns: under the O's (a nut pocket: the nut carries the drum's bearing), the
    # corner R (the letter sits on it, over its nut), the bridge's two ----
    z_o = O[n["O1"]].location.z - sot.GEAR_H / 2 - 9.0 - SPACER_H     # drum bed face - 1
    specs = {"O1": (z_o, 12.5, 17.0, "flat"), "O2": (z_o, 12.5, 17.0, "flat"),
             "R": (14.0, 11.5, 12.0, "flat"), "BrE": (BEAM_Z[0], 12.0, 16.0, "spigot"), "BrW": (BEAM_Z[0], 12.0, 16.0, "spigot")}
    nut_tops = {"P": PED_TOP + SPACER_H, "A": PED_TOP + SPACER_H, "B": PED_TOP + SPACER_H,
                "O1": z_o + SPACER_H, "O2": z_o + SPACER_H, "R": 14.0, "Star": BEAM_Z[1] + SPACER_H}
    for nm, (z_top, shaft_r, cap_r, top) in specs.items():
        (x, y), kind = sup[nm]
        name = f"{pre} Column {nm}"
        c = _object(name, _revolve(name, _column_prof(FLOOR_TOP, z_top, COL_BASE_R, shaft_r, cap_r, top), FLUTES * 24),
                    col, color=SUPPORT_COL, location=(x, y, 0.0))
        if nm in nut_tops:
            k = _nut_pocket(f"{name} Nut Pocket", col, 0.0, 0.0, nut_tops[nm])
            k.parent = c  # in the column's frame
            _hidden(k)
            _bool(c, k, "DIFFERENCE")
        made[name] = c

    # ---- bridge beam through the star gap, waisted between the pin posts' sweeps ----
    L = sot.layout(unit)
    sweep_c = math.hypot(L["A"][0] - sx, L["A"][1] - sy)
    pins = [O[f"{n['col']} Pin {s}"].location for s in "AB"]
    sweep_r = max(math.hypot(p.x - L[s][0], p.y - L[s][1]) for p, s in zip(pins, "AB")) + _load("toggle_carve").POST_R
    gbm = carve.Grid(sx - BR_D - BEAM_HW - 3, sy - BR_D - BEAM_HW - 3, sx + BR_D + BEAM_HW + 3, sy + BR_D + BEAM_HW + 3, 0.25)
    plan = carve.Region(gbm, _beam_field(gbm, star, e, sweep_r, sweep_c), 3.0, min_area=100.0, grow=(-1.6, 0.0))
    bz0, bz1 = BEAM_Z
    prof = [(bz0, -1.6), (bz0 + 2.0, -1.6), (bz0 + 2.1, -0.8), (bz0 + 4.4, -0.8), (bz0 + 4.5, 0.0)]  # fasciae
    prof += [(bz1 - 0.8 + 0.8 * math.sin(math.pi / 2 * k / 4), -0.8 * (1 - math.cos(math.pi / 2 * k / 4))) for k in range(5)]
    name = f"{pre} Bridge"
    beam = _object(name, carve.cutter_mesh(name, plan, prof, 1024), col, color=SUPPORT_COL)
    for nm in ("BrE", "BrW"):  # the columns print apart and plug in from below
        (x, y), _ = sup[nm]
        c = _object(f"{name} Socket {nm}", _cyl("socket", SPIGOT_R + 0.2, bz0 - 1, bz0 + SPIGOT_H + 0.2), col, location=(x, y, 0.0))
        c.parent = beam
        _hidden(c)
        _bool(beam, c, "DIFFERENCE")
        rv = _object(f"{name} Rivets {nm}", _domes("rivets", [(x + 13 * math.cos(e + math.pi / 4 * j), y + 13 * math.sin(e + math.pi / 4 * j))
                                                             for j in range(8)], bz1, 1.6, 0.8), col)
        rv.parent = beam
        _bool(beam, rv, "UNION")
        rv.hide_render, rv.display_type = True, "BOUNDS"
        rv.hide_set(True)
    for c in (_nut_pocket(f"{name} Nut Pocket", col, sx, sy, nut_tops["Star"]),
              _object(f"{name} Rod Hole", _cyl("rod hole", ROD_FIT_R, bz0 - 1, bz1 + SPACER_H + 1, 32), col, location=(sx, sy, 0.0))):
        c.parent = beam
        _hidden(c)
        _bool(beam, c, "DIFFERENCE")
    for nm in ("BrE", "BrW"):  # the end rods pass through
        (x, y), _ = sup[nm]
        c = _object(f"{name} Rod Hole {nm}", _cyl("rod hole", ROD_FIT_R, FLOOR_TOP - SPIGOT_H - 1, bz1 + 2, 32), col, location=(x, y, 0.0))
        c.parent = beam
        _hidden(c)
        _bool(beam, c, "DIFFERENCE")
    made[name] = beam

    # ---- M8 rods and nuts (stand-ins, not printed) ----
    hw = []
    zf = FLOOR_TOP - FLOOR_T - FOOT_H
    # A's and B's rods run on up through a cap nut on the top bearing (in the boss's bore)
    caps = {k: O[n[k]].location.z + sot.GEAR_H / 2 for k in "AB"}
    tops = {"P": O[n["P"]].location.z + sot.GEAR_H / 2 - 0.6, "A": caps["A"] + NUT_H + 1.0,
            "B": caps["B"] + NUT_H + 1.0, "O1": O[n["O1"]].location.z + sot.GEAR_H / 2 - 0.6,
            "O2": O[n["O2"]].location.z + sot.GEAR_H / 2 - 0.6, "R": 13.5, "BrE": bz1 + NUT_H + 1.5, "BrW": bz1 + NUT_H + 1.5}
    for nm, ((x, y), _) in sup.items():
        hw.append(_object(f"{pre} Rod {nm}", _cyl("rod", ROD_R, zf + 0.5, tops[nm], 24), col, color=HW_COL, location=(x, y, 0.0)))
        hw.append(_object(f"{pre} Nut {nm}", _hex("nut", NUT_AF, zf + TRAP_H - NUT_H, zf + TRAP_H), col, color=HW_COL,
                          location=(x, y, 0.0)))
        if nm.startswith("Br"):
            hw.append(_object(f"{pre} Nut {nm} Top", _revolve("acorn nut", _acorn_prof(bz1), 6, 0), col, color=HW_COL,
                              location=(x, y, 0.0)))
        else:
            hw.append(_object(f"{pre} Nut {nm} Top", _hex("nut", NUT_AF, nut_tops[nm] - NUT_H, nut_tops[nm]), col, color=HW_COL,
                              location=(x, y, 0.0)))
        if nm in caps:
            hw.append(_object(f"{pre} Nut {nm} Cap", _hex("nut", NUT_AF, caps[nm], caps[nm] + NUT_H), col, color=HW_COL,
                              location=(x, y, 0.0)))
    go = O[n["out"]]
    hw.append(_object(f"{pre} Rod Star", _cyl("rod", ROD_R, bz0 + 0.5, go.location.z + sot.GEAR_H / 2 - 0.6, 24), col,
                      color=HW_COL, location=(sx, sy, 0.0)))
    hw.append(_object(f"{pre} Nut Star", _hex("nut", NUT_AF, nut_tops["Star"] - NUT_H, nut_tops["Star"]), col, color=HW_COL,
                      location=(sx, sy, 0.0)))
    for h in hw:
        h["reference"] = "hardware stand-in, not printed"
    rods = {o.name: round(o.dimensions.z, 1) for o in hw if " Rod " in o.name}
    return dict(parts=sorted(made), rods=rods)


def _acorn_prof(z0):
    """Rough acorn nut standing on z0 (turned with 6 sides: the hex, then a dome)."""
    rc = NUT_AF / math.sqrt(3)
    pts = [(0.0, z0), (rc, z0), (rc, z0 + NUT_H), (NUT_AF / 2, z0 + NUT_H + 0.8)]
    dr = NUT_AF / 2
    pts += [(dr * math.cos(math.pi / 2 * i / 6), z0 + ACORN_H - dr + dr * math.sin(math.pi / 2 * i / 6)) for i in range(1, 7)]
    return pts


def _foot_prof(peg=False):
    """Bun foot under the floor: a rod hole (its nut trap is cut from below), or for the feet
    near the centre a peg into the tile and a small vent hole."""
    z0 = FLOOR_TOP - FLOOR_T
    zb = z0 - FOOT_H
    r_in = 1.0 if peg else ROD_FIT_R
    pts = [(r_in, z0 + PEG_H), (PEG_R, z0 + PEG_H), (PEG_R, z0)] if peg else [(r_in, z0)]
    pts += [(FOOT_R - 1.0, z0)]
    pts += _arc(FOOT_R - 2.0, z0 - 3.0, 3.0, 70, -60, 10)[1:]  # bun
    pts += [(FOOT_R - 2.5, zb + 0.6), (FOOT_R - 3.1, zb), (r_in, zb)]
    return pts


# ---- checks and export ----------------------------------------------------------------------

def _turning_groups(unit):
    n = sot._names(unit)
    O = bpy.data.objects
    t = n["toggle"]

    def fam(*names):
        out = []
        for nm in names:
            ob = O.get(nm)
            if ob is None:
                continue
            out.append(ob)
            out += [c for c in ob.children_recursive if c.type == "MESH" and not c.hide_render]
        return out
    return {"P": (O[n["P"]].location.xy, fam(n["P"], n["p54"])),
            "A": (O[n["A"]].location.xy, fam(n["A"], n["input"], f"{t} Driver A", f"{n['col']} Pin A")),
            "B": (O[n["B"]].location.xy, fam(n["B"], f"{t} Driver B", f"{n['col']} Pin B")),
            "star": (O[f"{t} Star"].matrix_world.translation.xy, fam(f"{t} Star", n["out"])),
            "O1": (O[n["O1"]].location.xy, fam(n["O1"])), "O2": (O[n["O2"]].location.xy, fam(n["O2"]))}


def _sweep_bm(axis, obs, clear, dz=0.5):
    """Annular slabs (every dz) round `axis` covering everything in obs as it turns, grown
    by `clear` -- the volume a stand part must stay out of."""
    dg = bpy.context.evaluated_depsgraph_get()
    edges = []
    for ob in obs:
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        mw = ob.matrix_world
        pts = [mw @ v.co for v in me.vertices]
        rz = [(math.hypot(p.x - axis.x, p.y - axis.y), p.z) for p in pts]
        edges += [(rz[e.vertices[0]], rz[e.vertices[1]]) for e in me.edges]
        ev.to_mesh_clear()
    E = np.array([(a[0], a[1], b[0], b[1]) for a, b in edges])
    zlo, zhi = E[:, [1, 3]].min(), E[:, [1, 3]].max()
    bm = bmesh.new()
    n = 96
    z = zlo
    while z < zhi - 1e-6:
        z2 = min(z + dz, zhi)
        za, zb = np.minimum(E[:, 1], E[:, 3]), np.maximum(E[:, 1], E[:, 3])
        sel = (zb >= z) & (za <= z2)
        if sel.any():
            S = E[sel]
            rs = []
            for zz in (z, z2, (z + z2) / 2):
                t = np.clip(np.where(np.abs(S[:, 3] - S[:, 1]) > 1e-9, (zz - S[:, 1]) / np.where(np.abs(S[:, 3] - S[:, 1]) > 1e-9, S[:, 3] - S[:, 1], 1), 0.5), 0, 1)
                rs.append(S[:, 0] + (S[:, 2] - S[:, 0]) * t)
            rs.append(S[:, 0])
            rs.append(S[:, 2])
            r_in = max(0.3, float(np.min(rs)) - clear)
            r_out = float(np.max(rs)) + clear
            rings = []
            for rr, zz in ((r_in, z + 0.02), (r_out, z + 0.02), (r_out, z2 - 0.02), (r_in, z2 - 0.02)):
                rings.append([bm.verts.new((axis.x + rr * math.cos(2 * math.pi * i / n), axis.y + rr * math.sin(2 * math.pi * i / n), zz))
                              for i in range(n)])
            for a, b in zip(rings, rings[1:] + rings[:1]):
                for i in range(n):
                    j = (i + 1) % n
                    bm.faces.new((a[i], a[j], b[j], b[i]))
        z = z2
    return bm


def check_stand(unit="NE", clear=1.0):
    """Stand parts that come within `clear` of anything that turns (rods and nuts left out:
    they sit in the bores on purpose). {stand part: [turning groups it hits]}."""
    from mathutils.bvhtree import BVHTree
    dg = bpy.context.evaluated_depsgraph_get()
    col = bpy.data.collections[f"Stand {unit}"]
    parts = [o for o in col.objects if o.parent is None and "reference" not in o.keys()]
    sweeps = {}
    for g, (axis, obs) in _turning_groups(unit).items():
        bm = _sweep_bm(Vector((axis.x, axis.y, 0.0)), obs, clear)
        sweeps[g] = BVHTree.FromBMesh(bm)
        bm.free()
    hits = {}
    for p in parts:
        bm = bmesh.new()
        bm.from_object(p, dg)
        bm.transform(p.matrix_world)
        t = BVHTree.FromBMesh(bm)
        bm.free()
        hit = [g for g, s in sweeps.items() if t.overlap(s)]
        if hit:
            hits[p.name] = hit
    return hits


def export_stand(unit="NE", out_dir=None):
    """Printed stand parts, each one solid (world frame). {name: (path, shells, non_manifold)}."""
    sg = _load("sator_gears")
    out_dir = out_dir or os.path.join(_HERE, "export")
    col = bpy.data.collections[f"Stand {unit}"]
    res = {}
    pre = f"Stand_{unit} "
    for ob in sorted((o for o in col.objects if o.parent is None and "reference" not in o.keys()), key=lambda o: o.name):
        short = ob.name[len(pre):].replace(" ", "_")
        # one file per design: the 8 keys, the 2 O columns, the 2 bridge columns, the support
        # feet and the centre feet are each alike
        for stem, keep in (("Key_", "Key_1i"), ("Column_O", "Column_O1"), ("Column_Br", "Column_BrE"),
                           ("Foot_Hub_", "Foot_Hub_1"), ("Foot_", "Foot_P")):
            if short.startswith(stem):
                short = stem.rstrip("_") if short == keep else None
                break
        if short is None:
            continue
        res[short] = sg.export_stl(ob, os.path.join(out_dir, f"Stand_{short}_{unit}.stl"))
    return res

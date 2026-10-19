"""Planetary fidget spinner on 625 bearings and #8 screws (run inside Blender). See
docs/planetary-fidget.md.

build(save)      -- the parts (collection "Planetary Fidget"), each in its print pose, and the
                    assembly ("Planetary Fidget Assembly")
check()          -- every mesh turns a little each way, nothing else touches
export(out_dir)  -- one STL per part design, named by how many the toy needs

Hold the frame (a 45T ring gear round a back plate), turn the sun with a thumb: three planets
roll round inside the ring and the carrier under them turns at a quarter of the sun's speed.
Five turning parts (sun, three planets, carrier), two 625s (5 x 16 x 5) in each.

#8 screws are thinner than a 625's 5 mm bore, so nothing is screwed through a bearing: a
printed axle (5.0 shank, an 8.0 flange on top) carries each stack, and a #8 screw comes up
from underneath and cuts its own thread into the axle's lower end. Tightened, it pulls the
axle down: flange, inner race, spacer, inner race, ... down to a shoulder (the frame's boss
for the center stack, a spacer on the carrier for a planet). The load stays on the inner
races, never through the balls; the outer races sit on their seats' stops (gear_toys).

Every gear part is 16 tall and the frame's top is flush with them; the axle flanges stand
0.5 down in the gears' bores. Assembly z: frame top face 0, everything below it is the back
plate.
"""

import importlib.util
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

_HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(_HERE, name + ".py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


gt = _load("gear_toys")
sg = gt.sg

# ==== gears (mm) ====
MODULE = 2.0
SUN, PLANET, RING, N = 15, 15, 45, 3       # (SUN + RING) / N whole: the planets sit 120 apart
CENTER = MODULE * (SUN + PLANET) / 2       # 30: sun to planet axis
BACKLASH = 0.1           # each sun / planet flank thinned this much at the pitch circle
RING_EXTRA = 0.05        # and each ring tooth space widened this much (it prints as a hole)
GEAR = dict(gt.GEAR, module=MODULE)
CUTTER = dict(GEAR, head=0.25, clearance=0.0, tooth_mod_enabled=False)  # an external 45T whose
#   teeth are the ring's spaces: tip 47.5 (the ring's root), root 43 (the ring's tips)
RING_TIP_R = MODULE * RING / 2 - MODULE    # 43

# ==== bearing stacks ====
BW = gt.BEARING_W        # 5
SPACER = 4.0             # between a part's two inner races (the cone over the bed-side seat
STACK = 2 * BW + SPACER  # needs the room); 14: one part's pair of seats
GEAR_H = STACK + 2.0     # 16: the flange sits in the 2 above the top bearing
FLANGE_T = 1.5
SHIM = 1.0               # spacer under each gear's lower inner race
KIT_R, KIT_BORE_R = gt.KIT_R, gt.KIT_BORE_R
TUNE = (-0.2, -0.1, 0.1, 0.2)

# ==== axles and #8 screws (thread 4.17, head up to 8.6 across) ====
AXLE_R = 2.5             # the 625's bore
SOCKET_R = 2.65          # holes the axles' lower ends stand in
PILOT_R = 1.8            # a #8 machine screw cuts its thread in this
SCREW_R = 2.25           # clearance
HEAD_R = 4.75            # pocket for the center screw's head
SCREW_SPACER_T = 3.0     # under a planet screw's head when the screw is longer than the pilot

# ==== assembly z (frame top face 0 is the back plate's top; the plate is 5 thick) ====
PLATE_T = 5.0
BOSS_Z = 1.0             # frame boss (8.0 across) under the carrier's lower inner race
CARRIER_Z0 = BOSS_Z      # carrier stack 1..15
CARRIER_TOP = CARRIER_Z0 + STACK       # 15
CARRIER_T = 5.0          # plate 10..15, hub below it
GEAR_Z0 = CARRIER_TOP + SHIM           # 16: sun and planets 16..32
TOP = GEAR_Z0 + GEAR_H                 # 32: frame top
FLANGE_Z = GEAR_Z0 + STACK             # 30
FLOOR_Z = CARRIER_TOP + 0.5            # ring tooth spaces' floor, 0.5 under the planets
CAVITY_R = RING_TIP_R - 0.5            # 42.5: inside the ring under the teeth
CARRIER_R = CAVITY_R - 1.5             # 41
HUB_R = gt.SEAT_R + 3.0
WINDOW_R, WINDOW_AT = 9.5, 25.0        # three windows in the carrier, between the planets
FRAME_R = MODULE * RING / 2 + 1.25 * MODULE + 4.0   # 51.5: 4 of wall outside the ring's root
# center axle: lower end 0.5 off its socket's floor; screw head in a pocket under the plate
CA_LOW = -0.5
SOCKET_FLOOR = -1.0
POCKET_TOP = -2.5
# planet axles: socket in the carrier plate, screw head under it
PA_LOW = CARRIER_TOP - CARRIER_T + 2.5          # 12.5
PA_SOCKET_FLOOR = PA_LOW - 0.5                  # 12
CA_PILOT_TOP, PA_PILOT_TOP = FLANGE_Z - 3.0, FLANGE_Z - 2.0   # solid under each flange

SET = {"Frame": 1, "Carrier": 1, "Gear_15T": 4, "Axle_Center": 1, "Axle_Planet": 3,
       "Spacer_4.0": 5, "Spacer_1.0": 4, "Screw_Spacer": 3}


def planet_xy(i):
    a = 2 * math.pi * i / N
    return CENTER * math.cos(a), CENTER * math.sin(a)


# ---- parts (each built in its print pose: bed at z 0) ---------------------------------------

def _spur(name, teeth, z0, height, gear, backlash):
    from PrecisionGears import gear_definitions

    bpy.ops.object.add_new_gear(gear_type="SPUR")
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    p = sg.props(ob)
    p.editing = True
    for k, v in gear.items():
        setattr(p, k, v)
    p.teeth = teeth
    p.height = height
    p.backlash = 4 * backlash / (MODULE * teeth / 2)
    p.editing = False
    gear_definitions.update_gear(p, bpy.context)
    ob.location = (0, 0, 0)
    ob.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    me = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    zs = [v.co.z for v in me.vertices]
    ob.location.z = z0 - min(zs)
    if abs(max(zs) - min(zs) - height) > 1e-3:
        raise ValueError(f"{name}: height {max(zs) - min(zs)}")
    ob.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
    bpy.context.view_layer.update()
    return ob, sg.tooth_phase(ob)


def _cyl(name, x, y, r, z0, z1, n=48):
    return gt._prism(name, gt._circle(x, y, r, n), z0, z1)


def _gear(col):
    """Sun and planets: 15T, 16 tall, prints on its bottom (the teeth's bed-side taper)."""
    ob, ph = _spur("Spinner gear src", PLANET, 0.0, GEAR_H, GEAR, BACKLASH)
    base = gt._object("Spinner_Gear_15T base", gt._plain(ob), col)
    gt._remove(ob)
    cut = gt._lathe("seats", gt.seat_cut_prof(BW, BW + SPACER, 0.0, GEAR_H), 192)
    part = gt._realize("Spinner_Gear_15T", base, [("DIFFERENCE", cut)], col, (0.95, 0.75, 0.15, 1))
    gt._remove(base)
    part["phase"] = ph
    return part


def _frame(col):
    """Ring gear and back plate, one piece; prints on the plate. Print z = assembly z + 5."""
    o = PLATE_T
    prof = [(0, 0.0), (FRAME_R - 0.6, 0.0), (FRAME_R, 0.6), (FRAME_R, o + TOP - 1.0), (FRAME_R - 1.0, o + TOP), (0, o + TOP)]
    base = gt._object("Spinner_Frame base", gt._lathe("frame", prof, 256), col)
    cuts = []
    # under the teeth: room for the carrier, round the boss under the carrier's inner race
    cuts.append(gt._lathe("cavity", [(0, o + BOSS_Z), (KIT_R, o + BOSS_Z), (KIT_R, o + 0.5), (7.0, o + 0.5), (7.0, o),
                                     (CAVITY_R, o), (CAVITY_R, o + FLOOR_Z + 0.25), (0, o + FLOOR_Z + 0.25)], 256))
    cuts.append(gt._lathe("socket", [(0, o + SOCKET_FLOOR), (SOCKET_R, o + SOCKET_FLOOR), (SOCKET_R, o + BOSS_Z + 0.5),
                                     (0, o + BOSS_Z + 0.5)], 64))
    cuts.append(_cyl("screw", 0, 0, SCREW_R, o + POCKET_TOP - 0.1, o + SOCKET_FLOOR + 0.1, 48))
    cuts.append(_cyl("head", 0, 0, HEAD_R, -1.0, o + POCKET_TOP, 64))
    # the ring: two cutters turned apart widen each space RING_EXTRA per flank
    ob, ph = _spur("Spinner cutter src", RING, o + FLOOR_Z, TOP - FLOOR_Z + 1.0, CUTTER, 0.0)
    me = gt._plain(ob)
    gt._remove(ob)
    d = RING_EXTRA / (MODULE * RING / 2)
    for k, s in enumerate((1, -1)):
        m = me.copy() if k == 0 else me
        m.transform(Matrix.Rotation(s * d, 4, "Z"))
        cuts.append(m)
    part = gt._realize("Spinner_Frame", base, [("DIFFERENCE", c) for c in cuts], col, (0.2, 0.45, 0.85, 1))
    gt._remove(base)
    part["phase"] = ph      # tooth center of the cutter = a ring tooth SPACE center
    return part


def _carrier(col):
    """Prints on its top face. Print z = 15 - assembly z (turned over about x)."""
    pt = CARRIER_T
    hub_h = STACK
    prof = [(0, 0.0), (CARRIER_R - 0.5, 0.0), (CARRIER_R, 0.5), (CARRIER_R, pt), (HUB_R + 1.0, pt), (HUB_R, pt + 1.0),
            (HUB_R, hub_h - 0.5), (HUB_R - 0.5, hub_h), (0, hub_h)]
    base = gt._object("Spinner_Carrier base", gt._lathe("carrier", prof, 256), col)
    cuts = [gt._lathe("seats", gt.seat_cut_prof(BW, BW + SPACER, 0.0, STACK), 192)]
    sock = CARRIER_TOP - PA_SOCKET_FLOOR     # 3 deep from the top face
    for i in range(N):
        x, y = planet_xy(i)
        cuts.append(_cyl("socket", x, y, SOCKET_R, -1.0, sock, 48))
        cuts.append(_cyl("screw", x, y, SCREW_R, sock - 0.1, pt + 1.0, 48))
        a = 2 * math.pi * (i + 0.5) / N
        cuts.append(_cyl("window", WINDOW_AT * math.cos(a), WINDOW_AT * math.sin(a), WINDOW_R, -1.0, pt + 1.0, 96))
    part = gt._realize("Spinner_Carrier", base, [("DIFFERENCE", c) for c in cuts], col, (0.85, 0.2, 0.2, 1))
    gt._remove(base)
    return part


def _axle(name, low, pilot_top, col):
    """Prints flange down. Print z = 31.5 - assembly z. The pilot opens at the lower end."""
    top = FLANGE_Z + FLANGE_T
    length = top - low
    pilot = top - pilot_top
    prof = [(0, 0.0), (KIT_R - 0.3, 0.0), (KIT_R, 0.3), (KIT_R, FLANGE_T), (AXLE_R + 0.2, FLANGE_T),
            (AXLE_R, FLANGE_T + 0.2), (AXLE_R, length - 0.4), (AXLE_R - 0.4, length), (PILOT_R, length),
            (PILOT_R, pilot), (0, pilot)]
    return gt._object(name, gt._lathe(name, prof, 64), col, (0.9, 0.45, 0.1, 1))


def _ring(name, r0, r1, t, col):
    return gt._object(name, gt._lathe(name, [(r0, 0.0), (r1, 0.0), (r1, t), (r0, t)], 96), col, (0.9, 0.45, 0.1, 1))


# ---- build and assembly ----------------------------------------------------------------------

def build(save=False):
    for c in ("Planetary Fidget Assembly", "Planetary Fidget"):
        col = bpy.data.collections.get(c)
        if col is not None:
            for o in list(col.all_objects):
                gt._remove(o)
            bpy.data.collections.remove(col)
    col = gt._collection("Planetary Fidget")
    _gear(col)
    _frame(col)
    _carrier(col)
    _axle("Spinner_Axle_Center", CA_LOW, CA_PILOT_TOP, col)
    _axle("Spinner_Axle_Planet", PA_LOW, PA_PILOT_TOP, col)
    _ring("Spinner_Spacer_4.0", KIT_BORE_R, KIT_R, SPACER, col)
    _ring("Spinner_Spacer_1.0", KIT_BORE_R, KIT_R, SHIM, col)
    _ring("Spinner_Screw_Spacer", SCREW_R, 4.6, SCREW_SPACER_T, col)
    for o in col.objects:
        o.hide_render = True
        o.hide_set(True)
    assemble()
    if save:
        gt.save_scene(os.path.join(_HERE, "planetary_fidget.blend"), ("Planetary Fidget", "Planetary Fidget Assembly"))
    return col


def _phases(sun_rot=0.0, carrier_rot=0.0):
    """Rotations of the sun, each planet and the ring so all of them interlock."""
    ph = bpy.data.objects["Spinner_Gear_15T"]["phase"]
    ph_c = bpy.data.objects["Spinner_Frame"]["phase"]
    ps, pp, pr = 2 * math.pi / SUN, 2 * math.pi / PLANET, 2 * math.pi / RING
    planets = []
    ring = None
    for i in range(N):
        d = carrier_rot + 2 * math.pi * i / N
        # sun to planet (external): as gear_toys._solve
        off = ph + sun_rot - d
        off -= round(off / ps) * ps
        r = d + math.pi - off * SUN / PLANET + pp / 2 - ph
        r -= round(r / pp) * pp
        planets.append(r)
        if ring is None:
            # planet to ring (internal): at the pitch point both surfaces move the same way, so
            # a planet tooth offset o from the line of centers faces a ring space at o * zp / zr
            o = ph + r - d
            o -= round(o / pp) * pp
            ring = d + o * PLANET / RING - ph_c
            ring -= round(ring / pr) * pr
    return planets, ring


def _flip(z_top):
    """Turned over about x, the print face's z 0 landing at z_top."""
    return Matrix.Translation((0, 0, z_top)) @ Matrix.Rotation(math.pi, 4, "X")


def assemble(sun_rot=0.0, carrier_rot=0.0, hardware=True):
    old = bpy.data.collections.get("Planetary Fidget Assembly")
    if old is not None:
        for o in list(old.all_objects):
            gt._remove(o)
        bpy.data.collections.remove(old)
    col = gt._collection("Planetary Fidget Assembly")
    planets, ring = _phases(sun_rot, carrier_rot)
    src = bpy.data.objects

    def put(name, part, m, role, color=None):
        ob = bpy.data.objects.new(name, src[part].data)
        col.objects.link(ob)
        ob.matrix_world = m
        ob.color = color or src[part].color
        ob["role"] = role
        return ob

    put("Asm Frame", "Spinner_Frame", Matrix.Translation((0, 0, -PLATE_T)) @ Matrix.Rotation(ring, 4, "Z"), "frame")
    put("Asm Sun", "Spinner_Gear_15T", Matrix.Translation((0, 0, GEAR_Z0)) @ Matrix.Rotation(sun_rot, 4, "Z"), "sun",
        (0.95, 0.75, 0.15, 1))
    put("Asm Carrier", "Spinner_Carrier", _flip(CARRIER_TOP) @ Matrix.Rotation(-carrier_rot, 4, "Z"), "carrier")
    put("Asm Axle Center", "Spinner_Axle_Center", _flip(FLANGE_Z + FLANGE_T), "frame-fixed")
    for z0 in (BOSS_Z + BW, GEAR_Z0 + BW):
        put(f"Asm Spacer Center {z0:.0f}", "Spinner_Spacer_4.0", Matrix.Translation((0, 0, z0)), "kit")
    put("Asm Shim Center", "Spinner_Spacer_1.0", Matrix.Translation((0, 0, CARRIER_TOP)), "kit")
    for i in range(N):
        a = carrier_rot + 2 * math.pi * i / N
        x, y = CENTER * math.cos(a), CENTER * math.sin(a)
        put(f"Asm Planet {i}", "Spinner_Gear_15T", Matrix.Translation((x, y, GEAR_Z0)) @ Matrix.Rotation(planets[i], 4, "Z"),
            "planet", (0.25, 0.7, 0.35, 1))
        put(f"Asm Axle Planet {i}", "Spinner_Axle_Planet", Matrix.Translation((x, y, 0)) @ _flip(FLANGE_Z + FLANGE_T),
            "carrier-fixed")
        put(f"Asm Shim Planet {i}", "Spinner_Spacer_1.0", Matrix.Translation((x, y, CARRIER_TOP)), "kit")
        put(f"Asm Spacer Planet {i}", "Spinner_Spacer_4.0", Matrix.Translation((x, y, GEAR_Z0 + BW)), "kit")
    if hardware:
        _hardware(col, carrier_rot)
    return col


def _hardware(col, carrier_rot):
    """Stand-ins: 625s (steel, seal black) and #8 screws (dark)."""
    steel, dark, black = (0.72, 0.72, 0.75, 1), (0.25, 0.25, 0.28, 1), (0.05, 0.05, 0.05, 1)
    stacks = [((0, 0), (CARRIER_Z0, CARRIER_Z0 + BW + SPACER, GEAR_Z0, GEAR_Z0 + BW + SPACER), POCKET_TOP,
               CA_PILOT_TOP - 1.0)]
    for i in range(N):
        a = carrier_rot + 2 * math.pi * i / N
        stacks.append(((CENTER * math.cos(a), CENTER * math.sin(a)), (GEAR_Z0, GEAR_Z0 + BW + SPACER),
                       CARRIER_TOP - CARRIER_T, PA_PILOT_TOP - 1.0))
    for k, ((x, y), z0s, head_z, tip) in enumerate(stacks):
        parts = []
        for z0 in z0s:
            parts += [("625 Outer", gt._lathe("o", [(13.3 / 2, z0), (8.0, z0), (8.0, z0 + BW), (13.3 / 2, z0 + BW)]), steel),
                      ("625 Seal", gt._lathe("e", [(4.2, z0 + 0.25), (13.3 / 2, z0 + 0.25), (13.3 / 2, z0 + BW - 0.25),
                                                  (4.2, z0 + BW - 0.25)]), black),
                      ("625 Inner", gt._lathe("i", [(2.5, z0), (4.2, z0), (4.2, z0 + BW), (2.5, z0 + BW)]), steel)]
        parts.append(("Screw", gt._lathe("s", [(0, head_z - 2.8), (4.1, head_z - 2.8), (4.1, head_z), (2.08, head_z),
                                                (2.08, tip), (0, tip)], 32), dark))
        for nm, me, c in parts:
            ob = bpy.data.objects.new(f"Asm HW {k} {nm}", me)
            col.objects.link(ob)
            ob.matrix_world = Matrix.Translation((x, y, 0))
            ob.color = c
            ob["hardware"] = nm
    return col


# ---- checks ----------------------------------------------------------------------------------

# least gaps the check accepts, a margin under what the design gives (in brackets), so a
# drift fails the check long before parts touch
RUN = 0.8      # printed parts turning against each other (1.0)
KIT = 0.5      # spacers and shims in a bore (0.70)
INNER = 0.6    # a steel inner race and the part turning round it (0.78)
OUTER = 0.4    # an outer race and anything standing still (0.5)
SCREW = 2.0    # a screw and the parts turning round it (2.62)
HEAD = 5.0     # a planet screw's head over the frame plate (7.2)


def check(clear=RUN):
    """At a few sun / carrier angles: free turn of every mesh, and gaps between parts that
    turn against each other (bigger than the constants above). Returns a list of problems."""
    problems = []
    for sun_rot, car_rot in ((0.0, 0.0), (0.07, 0.31), (0.19, 1.1)):
        col = assemble(sun_rot, car_rot, hardware=True)
        O = bpy.data.objects
        tag = f"sun {sun_rot:.2f} carrier {car_rot:.2f}"
        sun, frame, car = O["Asm Sun"], O["Asm Frame"], O["Asm Carrier"]
        for i in range(N):
            pl = O[f"Asm Planet {i}"]
            c = pl.matrix_world.translation
            # one flank of each gear: planet + sun both thinned, planet thinned + ring space widened
            for other, nm, flanks in ((sun, "sun", 2 * BACKLASH), (frame, "ring", BACKLASH + RING_EXTRA)):
                bl = gt._backlash(other, pl, (c.x, c.y), MODULE * PLANET / 2)
                line = f"{tag}: planet {i} / {nm} free turn {bl[0]:.2f} / {bl[1]:.2f} mm (want {flanks:.2f})"
                print("[CHECK]", line)
                if not gt.backlash_ok(bl, flanks):
                    problems.append(line)
        # turning against each other: (a, b, least gap)
        pairs = [("Asm Sun", "Asm Carrier", clear), ("Asm Sun", "Asm Axle Center", clear), ("Asm Sun", "Asm Shim Center", KIT),
                 ("Asm Sun", "Asm Spacer Center 21", KIT), ("Asm Frame", "Asm Carrier", clear),
                 ("Asm Carrier", "Asm Axle Center", clear), ("Asm Carrier", "Asm Spacer Center 6", KIT),
                 ("Asm Carrier", "Asm Shim Center", KIT)]
        for i in range(N):
            pairs += [(f"Asm Planet {i}", "Asm Carrier", clear), (f"Asm Planet {i}", f"Asm Axle Planet {i}", clear),
                      (f"Asm Planet {i}", f"Asm Spacer Planet {i}", KIT), (f"Asm Planet {i}", f"Asm Shim Planet {i}", KIT),
                      (f"Asm Planet {i}", "Asm Axle Center", clear), (f"Asm Planet {(i + 1) % N}", f"Asm Planet {i}", clear),
                      ("Asm Frame", f"Asm Axle Planet {i}", clear), (f"Asm Axle Planet {i}", "Asm Sun", clear)]
        # each screw against the parts turning round it, and the frame under the carrier
        for o in col.objects:
            h = o.get("hardware")
            k = o.name.split(" ")[2] if h else None
            if h == "Screw":
                pairs += [("Asm Carrier", o.name, SCREW), ("Asm Sun", o.name, SCREW)] if k == "0" else \
                         [("Asm Frame", o.name, HEAD), (f"Asm Planet {int(k) - 1}", o.name, SCREW)]
            if h == "625 Inner":
                turning = "Asm Carrier" if k == "0" and o.matrix_world.translation.z + o.data.vertices[0].co.z < CARRIER_TOP \
                    else ("Asm Sun" if k == "0" else f"Asm Planet {int(k) - 1}")
                pairs.append((turning, o.name, INNER))
            if h == "625 Outer":
                fixed = "Asm Frame" if k == "0" else "Asm Carrier"
                pairs.append((fixed, o.name, OUTER))
        for a, b, need in pairs:
            g = gt.gap(O[a], O[b])
            if g < need:
                problems.append(f"{tag}: {a} / {b} gap {g:.2f} (want {need})")
            print(f"[CHECK] {tag}: {a} / {b} gap {g:.2f}")
    for p in problems:
        print("[!]", p)
    return problems


# ---- export ----------------------------------------------------------------------------------

def export(out_dir=None):
    out_dir = out_dir or os.path.join(_HERE, "export", "planetary_fidget")
    os.makedirs(out_dir, exist_ok=True)
    res = {}
    for key, n in SET.items():
        ob = bpy.data.objects[f"Spinner_{key}"]
        count = f"_x{n}" if n > 1 else ""
        res[key] = sg.export_stl(ob, os.path.join(out_dir, f"Spinner_{key}{count}.stl"))
    col = bpy.data.collections["Planetary Fidget"]
    for d in TUNE:
        t = SPACER + d
        tmp = _ring("Spinner Tune", KIT_BORE_R, KIT_R, t, col)
        res[f"Spacer {t:.1f}"] = sg.export_stl(tmp, os.path.join(out_dir, f"Spinner_Spacer_{t:.1f}.stl"))
        gt._remove(tmp)
    for k, v in res.items():
        print(f"[EXPORT] {k}: shells {v[1]}, non-manifold {v[2]}, missing {v[3]}")
    return res


def render_scene():
    """The assembly at rest, with its hardware, for cad/make.py render."""
    assemble()
    return "Planetary Fidget Assembly"

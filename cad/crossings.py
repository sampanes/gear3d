"""Decorative wheel crossings (clock-style spokes) for PrecisionGears gears.

Fills a gear's bore with a hub plus decorative crossings, as a separate object
parented to the gear. The crossings overlap the gear rim by RIM_OVERLAP so the
two export/slice as one solid (select both, export as one STL).

Use: open in Blender's Text Editor, select a PrecisionGears gear, edit the
settings below, press Run Script. Re-running replaces the previous crossings.

Styles:
  spiral  -- curved spokes that sweep around, flared and filleted where they
             meet the hub and rim
  scurve  -- spokes leave the hub and meet the rim radially, curving between
  blades  -- many thin crescent blades (steampunk turbine)
  gothic  -- pointed lancet windows (rose-window tracery) with oculi between
             the arch tops
  ringed  -- clock wheel: straight tapered spokes to a middle ring, twice as
             many (offset) from the ring to the rim
  trefoil / quatrefoil -- a ring of gothic foil windows, optionally with small
             cut-outs in the solid wedges between them (FOIL_EXTRA)
  flame   -- flamboyant-gothic mouchettes: curved daggers, pointed at the hub,
             round-headed near the rim (curl set by SWEEP_DEG)
  straight -- classic machine-wheel spokes, tapered from hub to rim; optional
             pointed barbs along each side (BARBS / BARB_AT)
  holes   -- pierced disc: a ring of big round holes, small ones nestled between

Any style can be layered (LAYERS > 0): a thin base web flat on the bed, each raised
step narrower than the one below, and a stepped boss around the bearing. Steps sit
on the top face only, so layered crossings print without supports.
"""

import math

import bpy

# ==== settings (mm) ====
STYLE = "spiral"
COUNT = 5            # spokes / blades / windows
BEARING_HOLE_D = 21.9  # printed hole that grips the bearing (22 mm OD -> 21.9, 16 mm OD -> 15.9; 0 = none)
HUB_WALL = 5.0       # solid ring around the bearing hole
HUB_MIN_R = 16.0     # smallest solid hub radius (also used when there is no hole)
SPOKE_W = 7.0        # spoke width (gothic: wall between windows)
SWEEP_DEG = 60.0     # how far a spoke swings around from hub to rim
FLARE = 0.8          # extra width where spokes meet hub/rim, x SPOKE_W
FILLET = 2.5         # corner rounding of the openings
RIM_OVERLAP = 1.0    # how far the crossings reach into the gear rim
RIM_LIP = 0.0        # solid band kept just inside the bore (gothic uses 4)
BEVEL = 1.2          # rounding on the spoke/hub edges, top and bottom (0 = sharp)
BEVEL_SEGMENTS = 3   # 1 = 45 deg chamfer (prints cleanest on the bed side), 2-4 = round
SPANDREL = "triangle"  # gothic: cut-out between arch tops -- "triangle", "circle" or "none"
THICK_RIM = 0.0      # crossings thickness where they meet the rim (0 = full gear height)
THICK_HUB = 0.0      # thickness at the hub; differs from THICK_RIM -> smooth taper (0 = same as rim)
ALIGN = "back"       # where thinner crossings sit: "back" (flat on the bed, prints support-free),
                     # "center" (sunken both faces, needs supports), or "front"
LAYERS = 0           # layered look: raised steps on top of a thin base web (0 = off)
BASE_T = 3.5         # layered: base web thickness (flat on the bed)
STEP_T = 2.0         # layered: height of each raised step
STEP_INSET = 1.5     # layered: each step is this much narrower (per side) than the one below
RIM_TEETH = 0        # layered: decorative inner teeth along the rim edge, count (0 = off; try the gear's tooth count)
RIM_TEETH_H = 2.5    # layered: how far the inner teeth reach in from the bore
BARBS = 0            # straight: pointed spurs along each spoke side (2 -> at 1/3 and 2/3; 0 = off)
BARB_AT = ()         # straight: spur positions as fractions of the spoke, hub 0 .. rim 1 (overrides BARBS)
BARB_H = 4.0         # straight: how far a spur sticks out sideways from the spoke edge
BARB_L = 12.0        # straight: spur length along the spoke, at its base
BARB_SWEEP = 0.0     # straight: spur tip position, 0 = symmetric point, + toward the rim, - toward the hub
BARB_FILLET = 0.8    # straight with barbs: corner rounding (small, so the points stay sharp)
FOIL_EXTRA = "none"  # trefoil / quatrefoil: extra cut-outs in the solid wedges between the foils --
                     # "trefoil", "circle" or "none"
# ========================

TAU = 2.0 * math.pi


def _gear_props(ob):
    for name in ("gear", "precision_gears"):
        p = getattr(ob, name, None)
        if p is not None and getattr(p, "is_gear", False):
            return p
    try:
        from PrecisionGears import consts
        p = getattr(ob, consts.GEAR_PROPS_ALIAS, None)
        if p is not None and p.is_gear:
            return p
    except ImportError:
        pass
    return None


# ---- 2D helpers -------------------------------------------------------------

def _arc(r, a0, a1, step_deg=1.0):
    n = max(2, int(abs(a1 - a0) / math.radians(step_deg)) + 1)
    return [(r * math.cos(a0 + (a1 - a0) * i / (n - 1)),
             r * math.sin(a0 + (a1 - a0) * i / (n - 1))) for i in range(n)]


def _circle(cx, cy, r, step_deg=4.0):
    n = max(12, int(360 / step_deg))
    return [(cx + r * math.cos(TAU * i / n), cy + r * math.sin(TAU * i / n)) for i in range(n)]


def _resample(poly, spacing):
    out = []
    for i in range(len(poly)):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % len(poly)]
        seg = math.hypot(x1 - x0, y1 - y0)
        n = max(1, int(seg / spacing))
        for j in range(n):
            t = j / n
            out.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    return out


def _smooth(poly, radius):
    """Round corners: gaussian-smooth a closed outline over ~radius of arc length."""
    if radius <= 0:
        return poly
    spacing = 0.25
    pts = _resample(poly, spacing)
    sigma = radius / spacing
    half = int(3 * sigma)
    w = [math.exp(-0.5 * (k / sigma) ** 2) for k in range(-half, half + 1)]
    ws = sum(w)
    n = len(pts)
    out = []
    for i in range(n):
        sx = sy = 0.0
        for k, wk in zip(range(-half, half + 1), w):
            x, y = pts[(i + k) % n]
            sx += wk * x
            sy += wk * y
        out.append((sx / ws, sy / ws))
    return out[::2]


def _clip_radial(edge, r_in, r_out):
    """Cut a polyline (running outward) to the part between r_in and r_out."""
    def cross(a, b, r):
        ra, rb = math.hypot(*a), math.hypot(*b)
        t = (r - ra) / (rb - ra)
        return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

    out = []
    for a, b in zip(edge, edge[1:]):
        ra, rb = math.hypot(*a), math.hypot(*b)
        if ra < r_in <= rb:
            out.append(cross(a, b, r_in))
        if r_in <= rb <= r_out:
            out.append(b)
        if ra <= r_out < rb:
            out.append(cross(a, b, r_out))
            break
    return out


# ---- spoke-style openings (spiral / scurve / blades) ---------------------------

def _spoke_openings(style, count, r_in, r_out):
    sweep = math.radians(SWEEP_DEG)

    def g(t):  # angular progress along the spoke
        if style == "scurve":
            c = min(max(t, 0.0), 1.0)
            return c * c * (3 - 2 * c)
        return t

    def width(t):
        c = min(max(t, 0.0), 1.0)
        if style == "blades":
            return SPOKE_W * (0.35 + 0.65 * math.sin(math.pi * c))
        return SPOKE_W * (1 + FLARE * (math.exp(-c / 0.08) + math.exp(-(1 - c) / 0.08)))

    def edges(k):
        phi = TAU * k / count
        ts = [-0.2 + 1.4 * i / 600 for i in range(601)]
        pts = []
        for t in ts:
            r = r_in + (r_out - r_in) * t
            th = phi + sweep * g(t)
            pts.append((r * math.cos(th), r * math.sin(th)))
        plus, minus = [], []
        for i, t in enumerate(ts):
            a = pts[max(i - 1, 0)]
            b = pts[min(i + 1, len(pts) - 1)]
            tx, ty = b[0] - a[0], b[1] - a[1]
            ln = math.hypot(tx, ty)
            nx, ny = -ty / ln, tx / ln
            h = width(t) / 2
            x, y = pts[i]
            plus.append((x + nx * h, y + ny * h))
            minus.append((x - nx * h, y - ny * h))
        return _clip_radial(plus, r_in, r_out), _clip_radial(minus, r_in, r_out)

    return _between([edges(k) for k in range(count)], r_in, r_out)


def _between(all_edges, r_in, r_out, fillet=None):
    """Openings between neighbouring spokes; all_edges = [(leading, trailing), ...] by angle."""
    fillet = FILLET if fillet is None else fillet
    count = len(all_edges)
    holes = []
    for k in range(count):
        a = all_edges[k][0]                  # leading edge of spoke k
        b = all_edges[(k + 1) % count][1]    # trailing edge of spoke k+1
        ang = lambda p: math.atan2(p[1], p[0])
        a_out, b_out = ang(a[-1]), ang(b[-1])
        while b_out <= a_out:
            b_out += TAU
        a_in, b_in = ang(a[0]), ang(b[0])
        if (b_in - a_in) % TAU > math.pi:
            # wide (flared) spokes overlap at the hub: the opening starts where they cross
            ia, jb, p = _first_crossing(a, b)
            poly = [p] + a[ia + 1:] + _arc(r_out, a_out, b_out)[1:-1] + b[:jb:-1]
        else:
            while b_in <= a_in:
                b_in += TAU
            poly = a + _arc(r_out, a_out, b_out)[1:-1] + b[::-1] + _arc(r_in, b_in, a_in)[1:-1]
        holes.append(_smooth(poly, fillet))
    return holes


def _first_crossing(a, b):
    """First intersection of two outward-running polylines: (segment in a, segment in b, point)."""
    for i in range(len(a) - 1):
        (x0, y0), (x1, y1) = a[i], a[i + 1]
        for j in range(len(b) - 1):
            (u0, v0), (u1, v1) = b[j], b[j + 1]
            den = (x1 - x0) * (v1 - v0) - (y1 - y0) * (u1 - u0)
            if den == 0:
                continue
            t = ((u0 - x0) * (v1 - v0) - (v0 - y0) * (u1 - u0)) / den
            s = ((u0 - x0) * (y1 - y0) - (v0 - y0) * (x1 - x0)) / den
            if 0 <= t <= 1 and 0 <= s <= 1:
                return i, j, (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)
    raise ValueError("spokes overlap at the hub but never part -- reduce SPOKE_W or FLARE")


# ---- gothic lancet openings ---------------------------------------------------

def _lancet(count, r_in, r_out):
    """One pointed-arch window on the +x axis, between spokes at +/- pi/count."""
    beta = math.pi / count
    s = SPOKE_W / 2
    d = (math.cos(beta), math.sin(beta))
    nb = (math.sin(beta), -math.cos(beta))

    def side(u):  # upper side line (offset s inside the sector boundary)
        return (u * d[0] + s * nb[0], u * d[1] + s * nb[1])

    def apex_of(u):
        sx, sy = side(u)
        rr = 2 * sy  # equilateral arch: radius = window width at springing
        cx, cy = sx + rr * nb[0], sy + rr * nb[1]
        disc = rr * rr - cy * cy
        if disc <= 0:
            return None
        return (sx, sy), (cx, cy), rr, cx + math.sqrt(disc)

    # springing point so the apex lands at r_out
    lo, hi = r_in, r_out
    for _ in range(60):
        mid = (lo + hi) / 2
        res = apex_of(mid)
        if res is None or res[3] > r_out:
            hi = mid
        else:
            lo = mid
    (sx, sy), (cx, cy), rr, ax = apex_of(lo)

    # sill: where the side line crosses r_in
    lo2, hi2 = 0.0, lo
    for _ in range(60):
        mid = (lo2 + hi2) / 2
        if math.hypot(*side(mid)) < r_in:
            lo2 = mid
        else:
            hi2 = mid
    sill_up = side(hi2)
    a_sill = math.atan2(sill_up[1], sill_up[0])

    a0 = math.atan2(sy - cy, sx - cx)
    a1 = math.atan2(0 - cy, ax - cx)
    n = 60
    arch_up = [(cx + rr * math.cos(a0 + (a1 - a0) * i / n),
                cy + rr * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]
    upper = [sill_up, (sx, sy)] + arch_up[1:]
    lower = [(x, -y) for (x, y) in upper[::-1]][1:]
    sill = _arc(r_in, -a_sill, a_sill)[1:-1]
    return sill + upper + lower


def _rotate(poly, a):
    c, s = math.cos(a), math.sin(a)
    return [(x * c - y * s, x * s + y * c) for (x, y) in poly]


def _gothic_openings(count, r_in, r_out, bore_r):
    base = _lancet(count, r_in, r_out)
    holes = [_rotate(_smooth(base, min(FILLET, 0.6)), TAU * k / count) for k in range(count)]
    wall = max(2.5, SPOKE_W * 0.5) + 2 * STEP_INSET * max(LAYERS, 0)  # steps eat into both sides
    if SPANDREL == "triangle":
        return holes + _spandrel_triangles(holes, count, r_in, bore_r, wall)
    if SPANDREL != "circle":
        return holes
    # oculus in each spandrel between arch tops, on the spoke axis
    best = None
    for i in range(200):
        rc = r_in + (bore_r - r_in) * i / 199
        p = (rc * math.cos(math.pi / count), rc * math.sin(math.pi / count))
        dist = min(math.hypot(p[0] - x, p[1] - y) for h in holes[:2] for (x, y) in h)
        rho = min(dist, bore_r - rc) - wall
        if best is None or rho > best[0]:
            best = (rho, rc)
    if best and best[0] >= 2.0:
        rho, rc = best
        for k in range(count):
            a = TAU * k / count + math.pi / count
            holes.append(_circle(rc * math.cos(a), rc * math.sin(a), rho))
    return holes


def _rounded_triangle(size, rho):
    """Equilateral triangle (circumradius `size`) pointing toward -x, corners rounded by rho."""
    h = math.sqrt(3) / 2
    tri = [(-size, 0.0), (size / 2, -size * h), (size / 2, size * h)]  # counter-clockwise
    out = []
    for i in range(3):
        (px, py), (vx, vy), (nx, ny) = tri[i - 1], tri[i], tri[(i + 1) % 3]
        a0 = math.atan2(-(vx - px), vy - py)  # outward normal of incoming edge
        a1 = math.atan2(-(nx - vx), ny - vy)  # outward normal of outgoing edge
        while a1 < a0:
            a1 += TAU
        for k in range(13):
            a = a0 + (a1 - a0) * k / 12
            out.append((vx + rho * math.cos(a), vy + rho * math.sin(a)))
    return out


def _spandrel_triangles(holes, count, r_in, r_lim, wall):
    """Largest rounded triangle that fits between neighbouring arch tops, one per spandrel."""
    import numpy as np
    axis = math.pi / count  # spandrel axis between window 0 and window 1
    near = np.array([pt for h in holes[:2] for pt in h
                     if math.hypot(*pt) > r_in + 0.3 * (r_lim - r_in)])

    def fits(rc, size):
        shape = _resample(_rounded_triangle(size, 0.35 * size), 0.75)
        pts = np.array(_rotate([(x + rc, y) for (x, y) in shape], axis))
        if np.hypot(pts[:, 0], pts[:, 1]).max() > r_lim:
            return False
        d = np.sqrt(((pts[:, None, :] - near[None, :, :]) ** 2).sum(-1)).min()
        return d >= wall

    best = (0.0, None)
    for i in range(40):
        rc = r_in + (r_lim - r_in) * (0.35 + 0.65 * i / 39)
        lo, hi = 0.0, (r_lim - r_in) / 2
        if not fits(rc, 0.3):
            continue
        for _ in range(16):
            mid = (lo + hi) / 2
            if fits(rc, mid):
                lo = mid
            else:
                hi = mid
        if lo > best[0]:
            best = (lo, rc)
    size, rc = best
    if rc is None or size * 1.35 < 2.0:
        return []
    shape = [(x + rc, y) for (x, y) in _rounded_triangle(size, 0.35 * size)]
    return [_rotate(shape, axis + TAU * k / count) for k in range(count)]


# ---- more tracery: ringed clock wheel, foils, flames ------------------------------

def _barb_positions():
    return list(BARB_AT) if BARB_AT else [k / (BARBS + 1) for k in range(1, BARBS + 1)]


def _barb(u, r0, r1):
    """Extra half-width of a barbed spoke at radius u (pointed spurs at _barb_positions())."""
    at = _barb_positions()
    if not at:
        return 0.0
    half = BARB_L / 2
    tip = max(-0.9, min(0.9, BARB_SWEEP))  # tip position inside the spur, -1 hub end .. 1 rim end
    out = 0.0
    for f_at in at:
        s = (u - (r0 + (r1 - r0) * f_at)) / half
        if -1.0 < s < 1.0:
            f = (1 + s) / (1 + tip) if s < tip else (1 - s) / (1 - tip)
            out = max(out, BARB_H * f)
    return out


def _ray_edges(angle, r0, r1, w0, w1, barbs=False):
    """(leading, trailing) edges of a straight spoke along `angle`, width w0 at r0 -> w1 at r1."""
    c, s = math.cos(angle), math.sin(angle)
    plus, minus = [], []
    for i in range(401):
        u = (r1 + 5.0) * i / 400
        t = min(max((u - r0) / (r1 - r0), 0.0), 1.0)
        h = (w0 + (w1 - w0) * t) / 2 + (_barb(u, r0, r1) if barbs else 0.0)
        plus.append((u * c - h * s, u * s + h * c))
        minus.append((u * c + h * s, u * s - h * c))
    return _clip_radial(plus, r0, r1), _clip_radial(minus, r0, r1)


def _ringed_openings(count, r_in, r_out):
    w = SPOKE_W
    r_mid = (r_in + r_out) / 2
    a_lo, a_hi = r_mid - w / 2, r_mid + w / 2
    inner = [_ray_edges(TAU * k / count, r_in, a_lo, w * (1 + FLARE), w) for k in range(count)]
    n2 = 2 * count
    outer = [_ray_edges(TAU * (k + 0.5) / n2, a_hi, r_out, w * 0.8, w * (1 + FLARE / 2))
             for k in range(n2)]
    return _between(inner, r_in, a_lo) + _between(outer, a_hi, r_out)


def _straight_openings(count, r_in, r_out):
    w = SPOKE_W
    spokes = [_ray_edges(TAU * k / count, r_in, r_out, w * (1 + FLARE), w * (1 + FLARE / 3), True)
              for k in range(count)]
    return _between(spokes, r_in, r_out, BARB_FILLET if _barb_positions() else FILLET)


def _holes_openings(count, r_in, r_out):
    w = SPOKE_W
    sn = math.sin(math.pi / count)
    # outer ring: biggest circles that keep a w wall to each other and w/2 to the rim
    big = min(((r_out - w / 2) * sn - w / 2) / (1 + sn), (r_out - r_in - w) / 2)
    rc_big = r_out - w / 2 - big
    holes = [_circle(rc_big * math.cos(TAU * k / count), rc_big * math.sin(TAU * k / count), big, 2.0)
             for k in range(count)]
    # inner ring, half a pitch over: as big as the walls to the hub and big holes allow
    best = (0.0, 0.0)
    for i in range(400):
        rc = r_in + (rc_big - r_in) * i / 399
        gap = math.hypot(rc * math.cos(math.pi / count) - rc_big, rc * math.sin(math.pi / count))
        rho = min(rc - r_in - w / 2, gap - big - w, rc * sn - w / 2)
        if rho > best[0]:
            best = (rho, rc)
    rho, rc = best
    if rho >= 2.0:
        holes += [_circle(rc * math.cos(TAU * (k + 0.5) / count), rc * math.sin(TAU * (k + 0.5) / count),
                          rho, 3.0) for k in range(count)]
    return holes


def _foil(lobes, rho, c, rot):
    """Outline of a gothic foil: `lobes` circles of radius rho, centers c from the origin (c < rho)."""
    centers = [(c * math.cos(rot + TAU * i / lobes), c * math.sin(rot + TAU * i / lobes))
               for i in range(lobes)]
    pts = []
    for j in range(720):
        dx, dy = math.cos(TAU * j / 720), math.sin(TAU * j / 720)
        far = 0.0
        for cx, cy in centers:
            b = dx * cx + dy * cy
            disc = b * b - (cx * cx + cy * cy - rho * rho)
            if disc >= 0:
                far = max(far, b + math.sqrt(disc))
        pts.append((far * dx, far * dy))
    return pts


def _foil_openings(lobes, count, r_in, r_out):
    w = SPOKE_W
    rc = (r_in + r_out) / 2
    ext = min((r_out - r_in) / 2 - w / 2, rc * math.sin(math.pi / count) - w / 2)
    rho = ext / 1.8
    holes = []
    for k in range(count):
        a = TAU * k / count
        f = _smooth(_foil(lobes, rho, 0.8 * rho, a), min(FILLET, 1.0))
        holes.append([(x + rc * math.cos(a), y + rc * math.sin(a)) for (x, y) in f])
    if FOIL_EXTRA == "none":
        return holes
    # extra cut-outs in the solid wedges between neighbouring foils, toward the rim and the hub
    extras = []
    for k in range(count):
        a = TAU * (k + 0.5) / count
        near = holes[k][::4] + holes[(k + 1) % count][::4]
        for lo, hi, outward in ((rc, r_out, True), (r_in, rc, False)):
            best = (0.0, 0.0)
            for i in range(160):
                r = lo + (hi - lo) * i / 159
                cx, cy = r * math.cos(a), r * math.sin(a)
                ext = min(min(math.hypot(x - cx, y - cy) for x, y in near) - w,
                          (r_out - r - w / 2) if outward else (r - r_in - w / 2))
                if ext > best[0]:
                    best = (ext, r)
            ext, r = best
            if ext < 2.5:
                continue
            if FOIL_EXTRA == "circle":
                shape = _circle(0, 0, ext, 3.0)
            else:  # small trefoil, a lobe pointing along the wedge
                r3 = ext / 1.8
                shape = _smooth(_foil(3, r3, 0.8 * r3, a if outward else a + math.pi), min(FILLET, 0.8))
            extras.append([(x + r * math.cos(a), y + r * math.sin(a)) for (x, y) in shape])
    return holes + extras


def _flame_openings(count, r_in, r_out):
    w = SPOKE_W
    sweep = math.radians(SWEEP_DEG)
    L = r_out - r_in - w / 2
    # round head as big as the gap between neighbours allows near the rim
    head = min(L / 4, (r_out - w / 2 - L / 8) * math.sin(math.pi / count) - w / 2)
    s_head = L - head
    n = 240
    holes = []
    for k in range(count):
        phi = TAU * k / count
        axis = []
        for i in range(n + 1):
            t = i / n
            r = r_in + L * t
            th = phi + sweep * t * t
            axis.append((r * math.cos(th), r * math.sin(th)))
        left, right = [], []
        for i in range(n + 1):
            sl = L * i / n
            if sl >= s_head:
                hw = head * math.sqrt(max(0.0, 1 - ((sl - s_head) / head) ** 2))
            else:
                hw = head * (sl / s_head) ** 1.5
            a = axis[max(i - 1, 0)]
            b = axis[min(i + 1, n)]
            tx, ty = b[0] - a[0], b[1] - a[1]
            ln = math.hypot(tx, ty)
            nx, ny = -ty / ln, tx / ln
            x, y = axis[i]
            left.append((x + nx * hw, y + ny * hw))
            right.append((x - nx * hw, y - ny * hw))
        poly = left + right[::-1][1:-1]
        holes.append(_smooth(poly, min(FILLET, 1.5)))
    return holes


# ---- build ----------------------------------------------------------------------

def _grow_hole(loop, d, r_max=None, r_min=None, fixed=None):
    """Offset an opening outline away from its interior by d (enlarges the opening).

    Points are kept inside r_max (and outside r_min) so openings never cross the outer
    boundary (or the hub boss). Points flagged in `fixed` stay put (inner rim teeth).
    """
    if d == 0:
        return loop
    area = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(loop, loop[1:] + loop[:1]))
    sgn = 1.0 if area > 0 else -1.0
    n = len(loop)
    out = []
    for i in range(n):
        (ax, ay), (bx, by), (cx, cy) = loop[i - 1], loop[i], loop[(i + 1) % n]
        if fixed is not None and fixed[i]:
            out.append((bx, by))
            continue
        tx, ty = cx - ax, cy - ay
        ln = math.hypot(tx, ty)
        x, y = bx + sgn * ty / ln * d, by - sgn * tx / ln * d
        r = math.hypot(x, y)
        if r_max is not None and r > r_max:
            x, y = x * r_max / r, y * r_max / r
        elif r_min is not None and r < r_min:
            x, y = x * r_min / r, y * r_min / r
        out.append((x, y))
    return _untangle(out)


def _seg_cross(p0, p1, q0, q1):
    """Intersection point of segments p0-p1 and q0-q1, or None."""
    rx, ry = p1[0] - p0[0], p1[1] - p0[1]
    sx, sy = q1[0] - q0[0], q1[1] - q0[1]
    den = rx * sy - ry * sx
    if den == 0:
        return None
    t = ((q0[0] - p0[0]) * sy - (q0[1] - p0[1]) * sx) / den
    u = ((q0[0] - p0[0]) * ry - (q0[1] - p0[1]) * rx) / den
    if 0 < t < 1 and 0 < u < 1:
        return p0[0] + rx * t, p0[1] + ry * t
    return None


def _untangle(loop, window=120):
    """Remove the little self-crossing loops ("swallowtails") that offsetting leaves at sharp
    points (barbs, foil cusps). The point count stays the same -- the walls bridge rings point
    for point -- so the stretch around a loop is redrawn through the crossing point and its
    points are spread evenly along it (packing them into the gap breaks the cap fill)."""
    n = len(loop)
    out = list(loop)
    window = min(window, n // 3)
    pad = min(20, n // 8)
    i = 0
    while i < n:
        a0, a1 = out[i], out[(i + 1) % n]
        ax0, ax1 = min(a0[0], a1[0]), max(a0[0], a1[0])
        ay0, ay1 = min(a0[1], a1[1]), max(a0[1], a1[1])
        hit = None
        for j in range(i + 2, min(i + window, i + n - 1)):
            b0, b1 = out[j % n], out[(j + 1) % n]
            if max(b0[0], b1[0]) < ax0 or min(b0[0], b1[0]) > ax1 or \
               max(b0[1], b1[1]) < ay0 or min(b0[1], b1[1]) > ay1:
                continue
            p = _seg_cross(a0, a1, b0, b1)
            if p is not None:
                hit, cross = j, p
        if hit is not None:
            lo, hi = i - pad, hit + 1 + pad  # indices (mod n) redrawn, ends kept
            path = [out[k % n] for k in range(lo, i + 1)] + [cross] + \
                   [out[k % n] for k in range(hit + 1, hi + 1)]
            cum = [0.0]
            for a, b in zip(path, path[1:]):
                cum.append(cum[-1] + math.dist(a, b))
            m = hi - lo
            seg = 0
            for k in range(1, m):
                s = cum[-1] * k / m
                while seg < len(path) - 2 and cum[seg + 1] < s:
                    seg += 1
                f = (s - cum[seg]) / max(cum[seg + 1] - cum[seg], 1e-12)
                (x0, y0), (x1, y1) = path[seg], path[seg + 1]
                out[(lo + k) % n] = (x0 + (x1 - x0) * f, y0 + (y1 - y0) * f)
            i = hit + pad
        i += 1
    return out


def _flat_fill(loops):
    """Triangulate 2D outlines (even-odd: nested loops become holes); returns (verts, faces).

    Blender's curve fill occasionally drops a stretch of edges on long nearly-straight runs
    (seen on barbed spokes). Every outline edge must come out as a boundary edge exactly
    once; if not, refill with the input turned a fraction of a degree (the fill sweeps
    along an axis, so that changes its decisions) and turn the result back."""
    total = sum(len(loop) for loop in loops)
    first = None
    for deg in (0.0, 0.37, 1.13, 2.71, 5.3):
        c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
        turned = [[(x * c - y * s, x * s + y * c) for (x, y) in loop] for loop in loops]
        verts, faces = _curve_fill(turned)
        verts = [(x * c + y * s, -x * s + y * c) for (x, y) in verts]
        first = first or (verts, faces)
        edges = {}
        for f in faces:
            for a, b in zip(f, f[1:] + f[:1]):
                k = (a, b) if a < b else (b, a)
                edges[k] = edges.get(k, 0) + 1
        if len(verts) == total and sum(1 for n in edges.values() if n == 1) == total:
            return verts, faces
    return first  # no clean fill found: keep the plain result


def _curve_fill(loops):
    cu = bpy.data.curves.new("_crossings_fill", "CURVE")
    cu.dimensions = "2D"
    cu.fill_mode = "BOTH"
    for loop in loops:
        sp = cu.splines.new("POLY")
        sp.points.add(len(loop) - 1)
        for p, (x, y) in zip(sp.points, loop):
            p.co = (x, y, 0.0, 1.0)
        sp.use_cyclic_u = True
    tmp = bpy.data.objects.new("_crossings_fill", cu)
    bpy.context.collection.objects.link(tmp)
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    verts = [(v.co.x, v.co.y) for v in me.vertices]
    faces = [tuple(f.vertices) for f in me.polygons]
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    bpy.data.meshes.remove(me)
    return verts, faces


def _solid(plain_loops, bevel_loops, height, bevel, segments, r_max, surface=None):
    """Extrude outlines to a watertight solid; bevel_loops get rounded top/bottom edges.

    surface(r) -> (z_bottom, z_top) reshapes the faces (sunken / tapered crossings);
    edge rounding keeps its size because vertices keep their distance from the face.
    """
    import bmesh
    h2 = height / 2
    if bevel > 0:
        top = [(h2 - bevel + bevel * math.sin(a), bevel * (1 - math.cos(a)))
               for a in (k * (math.pi / 2) / segments for k in range(segments + 1))]
        levels = [(-z, d) for (z, d) in reversed(top)] + top
    else:
        levels = [(-h2, 0.0), (h2, 0.0)]
    flat = [(-h2, 0.0), (h2, 0.0)]

    bm = bmesh.new()
    cap_bot, cap_top = [], []
    for loop, lv in [(l, flat) for l in plain_loops] + [(l, levels) for l in bevel_loops]:
        rings = []
        for z, d in lv:
            pts = _grow_hole(loop, d, r_max)
            rings.append([bm.verts.new((x, y, z)) for (x, y) in pts])
        cap_bot.append(_grow_hole(loop, lv[0][1], r_max))
        cap_top.append(_grow_hole(loop, lv[-1][1], r_max))
        n = len(loop)
        for ra, rb in zip(rings, rings[1:]):
            for i in range(n):
                j = (i + 1) % n
                bm.faces.new((ra[i], ra[j], rb[j], rb[i]))
    for z, caps in ((-h2, cap_bot), (h2, cap_top)):
        verts, faces = _flat_fill(caps)
        vs = [bm.verts.new((x, y, z)) for (x, y) in verts]
        for f in faces:
            bm.faces.new([vs[i] for i in f])
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-4)
    if surface is not None:
        _refine_caps(bm, 3.0)
        for v in bm.verts:
            bot, top = surface(math.hypot(v.co.x, v.co.y))
            v.co.z = top - (h2 - v.co.z) if v.co.z > 0 else bot + (v.co.z + h2)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("_crossings")
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    try:
        me.set_sharp_from_angle(angle=math.radians(35))
    except (AttributeError, TypeError):
        pass
    return me


def _refine_caps(bm, max_len):
    """Split long edges inside the flat faces so a curved (tapered) face can follow the profile."""
    import bmesh
    for _ in range(10):
        bm.normal_update()
        long_edges = [e for e in bm.edges
                      if len(e.link_faces) == 2
                      and all(abs(f.normal.z) > 0.99 for f in e.link_faces)
                      and e.calc_length() > max_len]
        if not long_edges:
            return
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=True)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])


def _round_over(z_top, d0, b, segments):
    """(z, d) points rounding a convex edge of radius b that ends at height z_top."""
    return [(z_top - b + b * math.sin(a), d0 + b * (1 - math.cos(a)))
            for a in (k * (math.pi / 2) / segments for k in range(segments + 1))]


def _rim_teeth(hole, bore_r, phase, margin):
    """Give an opening a toothed edge where it meets the rim; returns (outline, fixed flags).

    Only the stretch of outline running along the bore gets teeth, and only teeth that
    sit `margin` mm clear of the spokes, so the growing step edges never reach them.
    Rounded trapezoid teeth, top land ~36% of the pitch; between teeth the outline sits
    0.3 mm inside the rim (hidden, no surface coincident with the gear bore).
    """
    pts = _resample(hole, 0.3)
    n = len(pts)
    on_rim = [math.hypot(x, y) >= bore_r - 0.5 for x, y in pts]
    fixed = [False] * n
    if all(on_rim) or not any(on_rim):
        return pts, fixed
    start = next(i for i in range(n) if not on_rim[i])
    order = [(start + k) % n for k in range(n)]
    runs, cur = [], []
    for i in order:
        if on_rim[i]:
            cur.append(i)
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    pitch = TAU / RIM_TEETH
    for run in runs:
        ang = [math.atan2(pts[run[0]][1], pts[run[0]][0])]
        for i in run[1:]:
            a = math.atan2(pts[i][1], pts[i][0])
            ang.append(ang[-1] + (a - ang[-1] + math.pi) % TAU - math.pi)
        lo, hi = min(ang) + margin / bore_r, max(ang) - margin / bore_r
        for i, a in zip(run, ang):
            if not lo <= a <= hi:
                continue
            k = round((a - phase) / pitch)
            c = phase + k * pitch
            t = 0.0
            if c - 0.32 * pitch >= lo and c + 0.32 * pitch <= hi:
                t = min(max((0.32 - abs(a - c) / pitch) / 0.14, 0.0), 1.0)
            r = bore_r + 0.3 - (RIM_TEETH_H + 0.3) * t * t * (3 - 2 * t)
            pts[i] = (r * math.cos(a), r * math.sin(a))
            fixed[i] = True
    return pts, fixed


def _tooth_phase(gear, props):
    """Local angle (rad) of an outer tooth center, so inner rim teeth line up with them."""
    if RIM_TEETH <= 0:
        return 0.0
    pitch = TAU / props.teeth
    ev = gear.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    rs = [(v.co.x, v.co.y) for v in me.vertices]
    r_tip = max(math.hypot(x, y) for x, y in rs)
    sx = sy = 0.0
    for x, y in rs:
        if math.hypot(x, y) > r_tip - 0.05:
            a = math.atan2(y, x) * TAU / pitch
            sx += math.cos(a)
            sy += math.sin(a)
    ev.to_mesh_clear()
    return math.atan2(sy, sx) * pitch / TAU


def _check_walls(loops, min_wall=0.8):
    """Raise if two openings come closer than min_wall (top step walls eaten away)."""
    from mathutils import kdtree
    pts = [(x, y, i) for i, loop in enumerate(loops) for (x, y) in loop]
    kd = kdtree.KDTree(len(pts))
    for k, (x, y, _) in enumerate(pts):
        kd.insert((x, y, 0.0), k)
    kd.balance()
    for x, y, i in pts:
        for _, k, dist in kd.find_range((x, y, 0.0), min_wall):
            if pts[k][2] != i:
                raise ValueError(f"layered walls thinner than {min_wall} mm near ({x:.1f}, {y:.1f}): "
                                 "raise SPOKE_W or lower STEP_INSET / LAYERS")


def _layered(holes, height, bore_r, hub_r, segments, teeth_phase=0.0):
    """Terraced crossings: thin base web, narrower raised steps, a stepped bearing boss.

    Built as ONE welded loft (no booleans): every outline gets a wall with its own (z, d)
    profile -- openings terraced (wall, round-over, ledge, wall, ...), boss and collar
    rising from the step top, bearing hole full height -- and flat caps join the walls
    at each height. d > 0 recedes the material edge (openings grow, bosses shrink).
    """
    import bmesh
    h2 = height / 2
    t_base = min(BASE_T, height)
    z_body = min(-h2 + t_base + STEP_T * LAYERS, h2 - 1.5)
    b_bot = max(0.0, min(BEVEL, t_base / 2 - 0.2))
    b_step = max(0.0, min(BEVEL, 0.6 * STEP_INSET, STEP_T / 2 - 0.2))

    # opening walls: rounded bed edge, then a round-over + ledge per level
    lv = [(-z, d) for (z, d) in reversed(_round_over(h2, 0.0, b_bot, segments))]
    z_top = -h2 + t_base
    lv += _round_over(z_top, 0.0, min(b_bot, b_step) if LAYERS else b_bot, segments)[1:]
    for i in range(1, LAYERS + 1):
        z_next = min(-h2 + t_base + STEP_T * i, z_body)
        lv.append((z_top + 0.01, STEP_INSET * i))  # ledge (tiny rise: no zero-area faces)
        lv += _round_over(z_next, STEP_INSET * i, b_step, segments)
        z_top = z_next

    hole_r = BEARING_HOLE_D / 2
    boss_r = hub_r - 1.0
    collar_r = hole_r + 2.5 if hole_r > 0 else boss_r * 0.6
    z_boss = h2 - 1.0
    b_boss = max(0.0, min(BEVEL, 0.8, (boss_r - collar_r) / 2, (z_boss - z_body) / 2 - 0.1))
    b_col = max(0.0, min(BEVEL, (collar_r - hole_r) / 2 - 0.2, (h2 - z_boss) - 0.2))
    r_max, r_min = bore_r + RIM_OVERLAP / 2, boss_r + 0.6
    fixed = [None] * len(holes)
    if RIM_TEETH > 0:
        margin = STEP_INSET * LAYERS + BEVEL + 1.0  # keep teeth clear of the growing spoke edges
        for i, h in enumerate(holes):
            holes[i], fixed[i] = _rim_teeth(h, bore_r, teeth_phase, margin)

    outer = _circle(0, 0, bore_r + RIM_OVERLAP, 1.0)
    boss = _circle(0, 0, boss_r, 1.0)
    collar = _circle(0, 0, collar_r, 1.0)
    bore = _circle(0, 0, hole_r, 1.0) if hole_r > 0 else None
    boss_lv = [(z_body, 0.0)] + _round_over(z_boss, 0.0, b_boss, segments)
    col_lv = [(z_boss, 0.0)] + _round_over(h2, 0.0, b_col, segments)

    # (loop, profile, sign, r_max, r_min); sign -1 = material inside the loop
    walls = [(outer, [(-h2, 0.0), (z_body, 0.0)], 1, None, None, None),
             (boss, boss_lv, -1, None, None, None),
             (collar, col_lv, -1, None, None, None)]
    walls += [(h, lv, 1, r_max, r_min, fx) for h, fx in zip(holes, fixed)]
    if bore:
        walls.append((bore, [(-h2, 0.0), (h2, 0.0)], 1, None, None, None))

    def ring(loop, d, sg, rmax, rmin, fx=None):
        return _grow_hole(loop, sg * d, rmax, rmin, fx)

    _check_walls([ring(h, lv[-1][1], 1, r_max, r_min, fx) for h, fx in zip(holes, fixed)])
    caps = {-h2: [ring(outer, 0, 1, None, None)]
                  + [ring(h, lv[0][1], 1, r_max, r_min, fx) for h, fx in zip(holes, fixed)],
            z_body: [ring(outer, 0, 1, None, None), ring(boss, 0, -1, None, None)]
                    + [ring(h, lv[-1][1], 1, r_max, r_min, fx) for h, fx in zip(holes, fixed)],
            z_boss: [ring(boss, boss_lv[-1][1], -1, None, None), ring(collar, 0, -1, None, None)],
            h2: [ring(collar, col_lv[-1][1], -1, None, None)]}
    if bore:
        caps[-h2].append(ring(bore, 0, 1, None, None))
        caps[h2].append(ring(bore, 0, 1, None, None))

    bm = bmesh.new()
    for loop, prof, sg, rmax, rmin, fx in walls:
        rings = [[bm.verts.new((x, y, z)) for (x, y) in ring(loop, d, sg, rmax, rmin, fx)] for z, d in prof]
        n = len(loop)
        for ra, rb in zip(rings, rings[1:]):
            for k in range(n):
                m = (k + 1) % n
                bm.faces.new((ra[k], ra[m], rb[m], rb[k]))
    for z, loops in caps.items():
        verts, faces = _flat_fill(loops)
        vs = [bm.verts.new((x, y, z)) for (x, y) in verts]
        for f in faces:
            bm.faces.new([vs[k] for k in f])
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("_crossings")
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    try:
        me.set_sharp_from_angle(angle=math.radians(35))
    except (AttributeError, TypeError):
        pass
    return me


SETTINGS = ("BEARING_HOLE_D", "HUB_WALL", "HUB_MIN_R", "SPOKE_W", "SWEEP_DEG", "FLARE", "FILLET",
            "RIM_OVERLAP", "RIM_LIP", "BEVEL", "BEVEL_SEGMENTS", "SPANDREL",
            "THICK_RIM", "THICK_HUB", "ALIGN", "LAYERS", "BASE_T", "STEP_T", "STEP_INSET",
            "RIM_TEETH", "RIM_TEETH_H", "BARBS", "BARB_AT", "BARB_H", "BARB_L", "BARB_SWEEP", "BARB_FILLET", "FOIL_EXTRA")


def build(gear, style=None, count=None, **settings):
    """Build crossings for `gear`; keyword settings (e.g. BEARING_HOLE_D=0) override the header."""
    import json
    g = globals()
    unknown = set(settings) - set(SETTINGS)
    if unknown:
        raise ValueError(f"unknown settings: {sorted(unknown)}")
    saved = {k: g[k] for k in settings}
    g.update(settings)
    try:
        ob = _build(gear, style or STYLE, count or COUNT)
        ob["crossings_settings"] = json.dumps({k: g[k] for k in SETTINGS})
        return ob
    finally:
        g.update(saved)


def _build(gear, style, count):
    props = _gear_props(gear)
    if props is None:
        raise RuntimeError(f"{gear.name} is not a PrecisionGears gear")
    if not props.bore_enabled:
        raise RuntimeError("enable the gear's bore first -- the crossings fill the bore")
    bore_r = props.bore_size  # PrecisionGears labels this field "Radius"

    zs = [v[2] for v in gear.bound_box]
    z0, z1 = min(zs), max(zs)

    lip = 4.0 if style == "gothic" and RIM_LIP == 0 else RIM_LIP
    hub_r = max(BEARING_HOLE_D / 2 + HUB_WALL, HUB_MIN_R)
    r_in, r_out = hub_r, bore_r - lip
    if style == "gothic":
        holes = _gothic_openings(count, r_in, r_out, bore_r - lip)
    elif style == "ringed":
        holes = _ringed_openings(count, r_in, r_out)
    elif style in ("trefoil", "quatrefoil"):
        holes = _foil_openings(3 if style == "trefoil" else 4, count, r_in, r_out)
    elif style == "flame":
        holes = _flame_openings(count, r_in, r_out)
    elif style == "straight":
        holes = _straight_openings(count, r_in, r_out)
    elif style == "holes":
        holes = _holes_openings(count, r_in, r_out)
    elif style in ("spiral", "scurve", "blades"):
        holes = _spoke_openings(style, count, r_in, r_out)
    else:
        raise ValueError(f"unknown crossings style: {style}")

    # outer edge hides inside the gear rim and the bearing wall must stay straight,
    # so only the decorative openings get rounded edges
    plain = [_circle(0, 0, bore_r + RIM_OVERLAP, 1.0)]
    if BEARING_HOLE_D > 0:
        plain.append(_circle(0, 0, BEARING_HOLE_D / 2, 1.0))
    height = z1 - z0
    t_rim = min(THICK_RIM or height, height)
    t_hub = min(THICK_HUB or t_rim, height)
    bevel = max(0.0, min(BEVEL, min(t_rim, t_hub) / 2 - 0.2))
    surface = None
    if t_rim < height or t_hub < height:
        def surface(r, h2=height / 2):
            c = min(max((r - hub_r) / max(bore_r - hub_r, 1e-6), 0.0), 1.0)
            t = t_hub + (t_rim - t_hub) * c * c * (3 - 2 * c)
            if ALIGN == "center":
                return -t / 2, t / 2
            if ALIGN == "front":
                return h2 - t, h2
            return -h2, -h2 + t
    if LAYERS > 0:
        me = _layered(holes, height, bore_r, hub_r, max(1, BEVEL_SEGMENTS), _tooth_phase(gear, props))
    else:
        me = _solid(plain, holes, height, bevel, max(1, BEVEL_SEGMENTS), bore_r + RIM_OVERLAP / 2, surface)

    name = f"{gear.name} Crossings"
    old = bpy.data.objects.get(name)
    if old is not None:
        old_data = old.data
        bpy.data.objects.remove(old)
        if old_data.users == 0:
            bpy.data.meshes.remove(old_data)

    me.name = name
    ob = bpy.data.objects.new(name, me)
    for col in gear.users_collection:
        col.objects.link(ob)
    ob.parent = gear
    ob.location = (0, 0, (z0 + z1) / 2)
    ob["crossings_style"] = style
    ob["crossings_count"] = count
    return ob


if __name__ == "__main__":
    target = bpy.context.active_object
    if target is not None and _gear_props(target) is None and target.parent is not None:
        target = target.parent  # crossings selected: rebuild for its gear
    result = build(target)
    print(f"[OK] built {result.name} ({STYLE}, {COUNT})")

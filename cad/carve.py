"""2D carving for arbitrary outlines: windows with rounded corners and cutters with shaped edges.

Shapes are described by signed distance fields sampled on a grid (positive inside), so any
outline works: a Geneva star, a locking disc, a gear sector. A window region is built by
combining fields (min = intersection), then opened by a radius (every corner rounds to at
least that radius) and traced back to polygons with marching squares. Offsetting a window
is just tracing another level of the same field, which is how the cutters get their edges:
a cutter is a loft through the window outline traced at several offsets up its height
(a round-over at the top, a 45 deg chamfer at the bed side).

numpy only; cutter_mesh() needs bpy/bmesh and runs in Blender.
"""

import math

import numpy as np

TAU = 2 * math.pi


# ---- fields ---------------------------------------------------------------------------------

def _segments(loops):
    a = np.concatenate([np.asarray(l, float) for l in loops])
    b = np.concatenate([np.roll(np.asarray(l, float), -1, 0) for l in loops])
    return a, b


def poly_sdf(pts, loops, chunk=4096):
    """Signed distance from pts (N, 2) to the polygon set `loops` (even-odd fill): + inside."""
    pts = np.asarray(pts, float)
    a, b = _segments(loops)
    ab = b - a
    ll = np.maximum((ab ** 2).sum(1), 1e-18)
    out = np.empty(len(pts))
    for s in range(0, len(pts), chunk):
        p = pts[s:s + chunk, None, :]
        t = np.clip(((p - a) * ab).sum(2) / ll, 0.0, 1.0)
        d = np.sqrt((((a + ab * t[..., None]) - p) ** 2).sum(2)).min(1)
        y, x = p[..., 1], p[..., 0]
        cross = (a[:, 1] > y) != (b[:, 1] > y)
        with np.errstate(divide="ignore", invalid="ignore"):
            xi = a[:, 0] + ab[:, 0] * (y - a[:, 1]) / ab[:, 1]
        inside = (cross & (x < xi)).sum(1) % 2 == 1
        out[s:s + chunk] = np.where(inside, d, -d)
    return out


def circle_sdf(pts, c, r):
    """+ inside a disc of radius r at c."""
    return r - np.hypot(pts[:, 0] - c[0], pts[:, 1] - c[1])


def polyline_dist(pts, line, chunk=4096):
    """Unsigned distance from pts to an open polyline."""
    line = np.asarray(line, float)
    a, b = line[:-1], line[1:]
    ab = b - a
    ll = np.maximum((ab ** 2).sum(1), 1e-18)
    out = np.empty(len(pts))
    for s in range(0, len(pts), chunk):
        p = pts[s:s + chunk, None, :]
        t = np.clip(((p - a) * ab).sum(2) / ll, 0.0, 1.0)
        out[s:s + chunk] = np.sqrt((((a + ab * t[..., None]) - p) ** 2).sum(2)).min(1)
    return out


class Grid:
    """A sampling grid over [x0, x1] x [y0, y1] with spacing h."""

    def __init__(self, x0, y0, x1, y1, h=0.2):
        self.h = h
        self.xs = np.arange(x0 - 2 * h, x1 + 2 * h, h)
        self.ys = np.arange(y0 - 2 * h, y1 + 2 * h, h)
        X, Y = np.meshgrid(self.xs, self.ys)
        self.pts = np.stack([X.ravel(), Y.ravel()], 1)
        self.shape = X.shape

    @classmethod
    def around(cls, loops, pad=3.0, h=0.2):
        a = np.concatenate([np.asarray(l, float) for l in loops])
        return cls(a[:, 0].min() - pad, a[:, 1].min() - pad, a[:, 0].max() + pad, a[:, 1].max() + pad, h)

    def field(self, values):
        return np.asarray(values, float).reshape(self.shape)

    def sdf(self, loops, band=None):
        """poly_sdf of loops over the grid. band=(lo, hi): exact only where the value may lie
        in [lo, hi] (decided on a 1 mm subgrid, linearly interpolated); elsewhere the
        interpolated value, which is off by well under the margin and only ever used for its
        side of the levels in the band."""
        if band is None:
            return self.field(poly_sdf(self.pts, loops))
        k = max(1, int(round(1.0 / self.h)))
        ny, nx = self.shape
        iy, ix = np.arange(0, ny + k - 1, k).clip(max=ny - 1), np.arange(0, nx + k - 1, k).clip(max=nx - 1)
        iy, ix = np.unique(iy), np.unique(ix)
        X, Y = np.meshgrid(self.xs[ix], self.ys[iy])
        coarse = poly_sdf(np.stack([X.ravel(), Y.ravel()], 1), loops).reshape(len(iy), len(ix))
        rows = np.stack([np.interp(np.arange(nx), ix, c) for c in coarse])
        full = np.stack([np.interp(np.arange(ny), iy, rows[:, j]) for j in range(nx)], 1)
        m = 1.5 * k * self.h
        sel = np.flatnonzero(((full > band[0] - m) & (full < band[1] + m)).ravel())
        flat = full.ravel()
        flat[sel] = poly_sdf(self.pts[sel], loops)
        return flat.reshape(self.shape)

    def contours(self, f, level=0.0, min_area=0.0):
        """Closed loops where f == level, each CCW around the f > level side (outer loops CCW,
        holes CW). Loops smaller than min_area (mm^2) are dropped."""
        loops = _march(f - level, self.xs, self.ys)
        out = []
        for l in loops:
            ar = area(l)
            if abs(ar) >= min_area:
                out.append(l)
        return out


# ---- marching squares -----------------------------------------------------------------------

def _march(F, xs, ys):
    ny, nx = F.shape
    F = np.where(F == 0, 1e-12, F)  # no vertex exactly on the level
    pos = F > 0
    pts, nxt = {}, {}

    def ept(kind, i, j):
        # kind 0: edge (i, j)-(i, j+1) along x; kind 1: edge (i, j)-(i+1, j) along y
        key = (kind, i, j)
        if key not in pts:
            if kind == 0:
                f0, f1 = F[i, j], F[i, j + 1]
                t = f0 / (f0 - f1)
                pts[key] = (xs[j] + t * (xs[j + 1] - xs[j]), ys[i])
            else:
                f0, f1 = F[i, j], F[i + 1, j]
                t = f0 / (f0 - f1)
                pts[key] = (xs[j], ys[i] + t * (ys[i + 1] - ys[i]))
        return key

    idx = (pos[:-1, :-1].astype(int) | (pos[:-1, 1:] << 1) | (pos[1:, 1:] << 2) | (pos[1:, :-1] << 3))
    cells = np.argwhere((idx != 0) & (idx != 15))
    for i, j in cells:
        c = idx[i, j]
        b, r, t, l = (0, i, j), (1, i, j + 1), (0, i + 1, j), (1, i, j)  # cell edges
        # table entries run with the positive side on the right; they are walked backwards
        # below so every loop runs CCW round its positive region
        segs = {1: [(l, b)], 2: [(b, r)], 3: [(l, r)], 4: [(r, t)], 6: [(b, t)], 7: [(l, t)],
                8: [(t, l)], 9: [(t, b)], 11: [(t, r)], 12: [(r, l)], 13: [(r, b)], 14: [(b, l)]}
        if c in (5, 10):
            centre = F[i:i + 2, j:j + 2].mean() > 0
            if c == 5:
                seg = [(l, t), (r, b)] if centre else [(l, b), (r, t)]
            else:
                seg = [(b, l), (t, r)] if centre else [(b, r), (t, l)]
        else:
            seg = segs[c]
        for e0, e1 in seg:
            nxt[ept(*e1)] = ept(*e0)
    loops = []
    seen = set()
    for start in nxt:
        if start in seen:
            continue
        loop, k = [], start
        while k not in seen and k in nxt:
            seen.add(k)
            loop.append(pts[k])
            k = nxt[k]
        if k == start and len(loop) > 2:
            loops.append(np.array(loop))
    return loops


# ---- polygon helpers ------------------------------------------------------------------------

def area(loop):
    x, y = loop[:, 0], loop[:, 1]
    return 0.5 * (x * np.roll(y, -1) - np.roll(x, -1) * y).sum()


def centroid(loop):
    x, y = loop[:, 0], loop[:, 1]
    c = x * np.roll(y, -1) - np.roll(x, -1) * y
    a = c.sum() / 2
    return np.array([((x + np.roll(x, -1)) * c).sum() / (6 * a), ((y + np.roll(y, -1)) * c).sum() / (6 * a)])


def resample(loop, n):
    """n points evenly spaced by arc length round a closed loop."""
    p = np.vstack([loop, loop[:1]])
    s = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(p, axis=0).T))])
    u = np.linspace(0, s[-1], n, endpoint=False)
    return np.stack([np.interp(u, s, p[:, 0]), np.interp(u, s, p[:, 1])], 1)


def point_in(p, loop):
    return poly_sdf(np.array([p]), [loop])[0] > 0


# ---- windows --------------------------------------------------------------------------------

class Region:
    """Outlines of the + side of a region field, with offsets.

    region: grid values, + inside (for windows: where material may go, already minus the
    walls, hub and ribs). fillet: every convex corner of the region rounds to at least this
    radius (a morphological opening; 0 keeps the outline as traced). min_area: drop slivers
    smaller than this (mm^2). grow: the range of offsets offset() will be asked for.
    Each outline grows only up to GAP short of the midline to its neighbours, so neighbouring
    windows never merge, however far they grow.
    """

    GAP = 0.4

    def __init__(self, grid, region, fillet=2.0, min_area=8.0, grow=(-2.0, 3.0)):
        self.grid, self.fillet = grid, fillet
        cores = [l for l in grid.contours(region, fillet) if area(l) > 0]  # outer loops only
        band = (-fillet - grow[1] - 1.0, -fillet - grow[0] + 0.5)
        fields = [grid.sdf([c], band=band) for c in cores]  # distance to each eroded piece
        none = grid.field(np.full(len(grid.pts), -1e9))
        self.field = np.max(np.stack(fields), 0) if fields else none
        # each window is a loop of the whole opening (pieces whose roundings meet through a
        # neck make one window); it grows from its own pieces, capped short of the others'
        self.loops, self.fields = [], []
        for loop in grid.contours(self.field, -fillet, min_area):
            if area(loop) <= 0:
                continue
            mine = [k for k, f in enumerate(fields) if point_in(grid.pts[np.argmax(f)], loop)]  # deepest point
            rest = [fields[k] for k in range(len(cores)) if k not in mine]
            self.loops.append(loop)
            self.fields.append((np.max(np.stack([fields[k] for k in mine]), 0) if mine else none, rest))

    def _trace(self, f, others, d):
        g = f + self.fillet + d
        if others:
            g = np.minimum(g, f - np.max(np.stack(others), 0) - self.GAP)
        cand = [l for l in self.grid.contours(g, 0.0) if area(l) > 0]
        return max(cand, key=area) if cand else None

    def offset(self, d):
        """The outlines grown by d (mm; < 0 shrinks), one loop each, in self.loops order."""
        if abs(d) < 1e-9:
            return list(self.loops)
        return [self._trace(f, others, d) for f, others in self.fields]


# ---- cutters --------------------------------------------------------------------------------

def edge_profile(z0, z1, top_round=1.2, bed_chamfer=0.6, step=None, segs=4, over=1.0, eps=0.05):
    """(z, grow) pairs bottom to top for a window cutter through a plate z0..z1: a 45 deg
    chamfer of bed_chamfer at z0 and a quarter-round of top_round at z1, running `over` past
    both faces (straight, so neighbouring windows never merge there) so the boolean cuts clean.
    step=(z_s, r_s) adds a quarter-round of r_s ending at z_s with the window r_s wider above
    it: a stepped border on the walls, and the rounded top edge of an arm lowered to z_s.
    No ring lies on either face: the cutter crosses each face plane at an angle (eps past it),
    since a ring in a face that is only nearly flat leaves slivers in an EXACT boolean."""
    prof = [(z0 - over, bed_chamfer + eps), (z0 - eps, bed_chamfer + eps)]
    if bed_chamfer > 0:
        prof.append((z0 + bed_chamfer, 0.0))
    g = 0.0

    def quarter(z_end, r, g):
        return [(z_end - r + r * math.sin(math.pi / 2 * k / segs), g + r * (1 - math.cos(math.pi / 2 * k / segs)))
                for k in range(segs + 1)]

    if step is not None:
        prof += quarter(step[0], step[1], g)
        g += step[1]
    if top_round > 0:
        prof += quarter(z1, top_round, g)[:-1]
        g += top_round
    prof += [(z1 + eps, g), (z1 + over, g)]
    out = []
    for z, gr in prof:  # drop repeats (a quarter starts where the last segment ended)
        if out and z <= out[-1][0] + 1e-9:
            continue
        out.append((z, gr))
    return out


def loft_rings(rings):
    """Align a stack of closed rings (each (n, 2) CCW, same n): rotate each ring's start to
    best match the ring below."""
    out = [rings[0]]
    for r in rings[1:]:
        prev = out[-1]
        n = len(r)
        best = min(range(0, n, max(1, n // 256)),
                   key=lambda s: ((np.roll(r, -s, 0) - prev) ** 2).sum())
        lo, hi = best - n // 256, best + n // 256
        best = min(range(lo, hi + 1), key=lambda s: ((np.roll(r, -s, 0) - prev) ** 2).sum())
        out.append(np.roll(r, -best, 0))
    return out


def cutter_mesh(name, windows, profile, n=256):
    """One mesh holding a loft per outline of `windows` (a Region): each outline traced at the
    profile's offsets, (z, grow) bottom to top. Window cutters grow toward their open faces;
    a solid shrinks (grow < 0) toward its rounded top."""
    import bmesh
    import bpy

    grows = sorted({g for _, g in profile})
    traced = {g: windows.offset(g) for g in grows}
    bm = bmesh.new()
    for k in range(len(windows.loops)):
        rings = loft_rings([resample(traced[g][k], n) for _, g in profile])
        vs = [[bm.verts.new((x, y, z)) for x, y in ring] for ring, (z, _) in zip(rings, profile)]
        for a, b in zip(vs, vs[1:]):
            for i in range(n):
                j = (i + 1) % n
                bm.faces.new((a[i], a[j], b[j], b[i]))
        bm.faces.new(list(reversed(vs[0])))
        bm.faces.new(vs[-1])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me

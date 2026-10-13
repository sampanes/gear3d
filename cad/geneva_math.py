"""Geneva drives: closed-form outlines plus a kinematic sweep (numpy only; also runs in Blender).

A Drive is one star (the driven wheel, axis at the origin) and one or more drivers around it,
each a distance c from the star axis. Everything follows from a few numbers:

  amp     half the star's turn per push (an n-slot index drive has amp = 180/n deg)
  c       centre distance, star axis to each driver axis
  a       crank (pin orbit) radius     = c * sin(amp)
  R       star rim radius              = c * cos(amp)  (the pin enters and leaves here, tangentially)
  gamma   half the engagement window   = 90 deg - amp  (each push takes 2 * gamma of driver turn)

While a pin is in its slot the star turns with the pin's direction from the star axis:
  star = atan2(sin(amp) * sin(t), 1 - sin(amp) * cos(t))   (t = driver turn from mid-push)
so it starts and stops with zero speed. Between pushes each driver's locking disc rides in a
concave pocket on the star, centred where that driver's axis sits at rest; `land` sets how much
rim is left beside each slot mouth (the pocket radius follows from it).

Slots and pockets are lists of star-frame angles, so one code path makes:
  index(n)       plain Geneva: n slots, one driver (pins=2 indexes twice per driver turn)
  toggle(swing)  double-Geneva toggle: two drivers turning opposite ways; A pushes the star
                 +swing, half a driver turn later B pushes it back
The locking discs are not drawn. Each starts as a full disc and is carved by the star swept
through a whole cycle in that driver's turning frame, so every notch is exactly as big as it
needs to be (the way a rack generates a gear). check() then samples the cycle to show the pins
clear the star, the parts clear each other, and every dwell is locked both ways.

Angles are radians inside; the factories take degrees. Lengths are mm.
"""

import math

import numpy as np

TAU = 2 * math.pi


def _wrap(x):
    return (x + math.pi) % TAU - math.pi


def _rot(pts, ang):
    c, s = math.cos(ang), math.sin(ang)
    return pts @ np.array([[c, s], [-s, c]])


class Driver:
    """A driver axis at world angle `at` (distance c from the star), turning `sense` (+1 CCW,
    -1 CW) at one turn per cycle. Pin j sits at driver angle phase + sense*t + j*TAU/pins."""

    def __init__(self, at, sense, phase, pins=1):
        self.at, self.sense, self.phase, self.pins = at, sense, phase, pins


class Drive:
    def __init__(self, amp, c, slots, pockets, drivers, pin_d=4.0, gap=0.4, land=3.0,
                 trim=0.0, bore_d=0.0, plate_r=None, kind="custom", seg=24):
        self.amp, self.c = amp, c
        self.slots, self.pockets, self.drivers = list(slots), list(pockets), list(drivers)
        self.pin_d, self.gap, self.land, self.trim, self.bore_d = pin_d, gap, land, trim, bore_d
        self.kind, self.seg = kind, seg
        self.a = c * math.sin(amp)
        self.R = c * math.cos(amp) - trim
        self.gamma = math.pi / 2 - amp
        self.w = pin_d / 2 + gap  # slot half-width
        self.bottom = c - self.a - pin_d / 2 - gap  # slot floor: deepest pin edge plus gap
        self.mouth = math.asin(self.w / self.R)  # slot half-width as an angle at the rim
        self.delta = amp - self.mouth - land / self.R  # pocket half-width at the rim
        if self.delta <= 0:
            raise ValueError(f"land {land} leaves no pocket (amp too small for this pin/land)")
        R, d = self.R, self.delta
        self.rp = math.sqrt(c * c + R * R - 2 * c * R * math.cos(d))  # pocket radius
        self.rl = self.rp - gap  # locking disc radius before carving
        self.plate_r = plate_r if plate_r is not None else self.a + pin_d / 2 + 3.0
        if self.bottom - self.w < bore_d / 2 + 1.0:
            raise ValueError("slots reach the bore: raise c or shrink bore_d")
        self._windows = self._find_windows()
        self._discs = None

    # ---- kinematics -------------------------------------------------------------------------

    def pin_angle(self, d, j, t):
        return d.phase + d.sense * t + j * TAU / d.pins

    def pin_world(self, d, j, t):
        p = self.pin_angle(d, j, t)
        return np.array([self.c * math.cos(d.at) + self.a * math.cos(p),
                         self.c * math.sin(d.at) + self.a * math.sin(p)])

    def _find_windows(self):
        """Pushes in one cycle, in time order: (t_in, t_out, driver, pin, slot)."""
        mids = []
        for d in self.drivers:
            for j in range(d.pins):
                # pin points at the star when its angle = at + pi
                t = ((d.at + math.pi - d.phase - j * TAU / d.pins) * d.sense) % TAU
                mids.append((t, d, j))
        mids.sort(key=lambda m: m[0])
        g = self.gamma
        for (t0, _, _), (t1, _, _) in zip(mids, mids[1:] + [(mids[0][0] + TAU, None, None)]):
            if t1 - t0 < 2 * g + 1e-9:
                raise ValueError("two pushes overlap: re-phase the drivers")
        if any(t - g < 0 or t + g > TAU for t, _, _ in mids):
            raise ValueError("a push straddles t = 0: re-phase so the cycle starts in a dwell")
        wins, star = [], 0.0
        for t, d, j in mids:
            t_in, t_out = t - g, t + g
            p = self.pin_world(d, j, t_in)
            th = math.atan2(p[1], p[0])
            slot = min(self.slots, key=lambda s: abs(_wrap(s + star - th)))
            if abs(_wrap(slot + star - th)) > 1e-6:
                raise ValueError(f"pin {j} of the driver at {math.degrees(d.at):.1f} deg meets no slot "
                                 f"(star at {math.degrees(star):.2f} deg)")
            p = self.pin_world(d, j, t_out)
            star += _wrap(math.atan2(p[1], p[0]) - slot - star)  # continuous (no 2*pi jumps)
            wins.append((t_in, t_out, d, j, slot))
        self.advance = star  # star turn per cycle (0 for a toggle)
        return wins

    def star_angle(self, t):
        k = math.floor(t / TAU)
        tt = t - k * TAU
        base = k * self.advance
        star = 0.0
        for t_in, t_out, d, j, slot in self._windows:
            if tt < t_in:
                break
            p = self.pin_world(d, j, min(tt, t_out))
            ang = math.atan2(p[1], p[0]) - slot
            star = star + _wrap(ang - star)
        return base + star

    def engaged(self, t):
        tt = t % TAU
        return any(t_in <= tt <= t_out for t_in, t_out, *_ in self._windows)

    def dwells(self):
        """Mid-times of the dwells (between consecutive pushes)."""
        w = self._windows
        out = []
        for (_, t_out, *_), (t_in, *_) in zip(w, w[1:] + [(w[0][0] + TAU,)]):
            out.append(((t_out + t_in) / 2) % TAU)
        return out

    # ---- outlines ---------------------------------------------------------------------------

    def star_loops(self):
        """[outer] or [outer, bore] as (N, 2) arrays, star frame (angle 0 = cycle start pose)."""
        seg, R, w, c = self.seg, self.R, self.w, self.c
        feats = [(s, "slot") for s in self.slots] + [(p, "pocket") for p in self.pockets]
        feats.sort(key=lambda f: f[0] % TAU)
        half = {"slot": self.mouth, "pocket": self.delta}
        for (a0, k0), (a1, k1) in zip(feats, feats[1:] + [(feats[0][0] + TAU, feats[0][1])]):
            if (a1 - a0) % TAU < half[k0] + half[k1] - 1e-9 and len(feats) > 1:
                raise ValueError(f"{k0} at {math.degrees(a0):.1f} and {k1} at {math.degrees(a1):.1f} deg overlap")
        rim = lambda x: np.array([R * math.cos(x), R * math.sin(x)])
        pts = []
        prev_end = None
        for ang, kind in feats:
            start = ang - half[kind]
            if prev_end is not None:
                span = (start - prev_end) % TAU
                n = max(2, int(span * R / 1.0))  # ~1 mm rim steps
                pts += [rim(prev_end + span * i / n) for i in range(1, n)]
            u = np.array([math.cos(ang), math.sin(ang)])
            v = np.array([-u[1], u[0]])
            if kind == "slot":
                t = math.sqrt(R * R - w * w)
                b = self.bottom + w  # centre of the round slot end
                pts += [u * t - v * w, u * b - v * w]
                for j in range(1, seg):
                    s = math.pi * j / seg
                    pts.append(u * (b - w * math.sin(s)) - v * (w * math.cos(s)))
                pts += [u * b + v * w, u * t + v * w]
            else:
                P = c * u
                e0, e1 = rim(start) - P, rim(ang + self.delta) - P
                t0, t1 = math.atan2(e0[1], e0[0]), math.atan2(e1[1], e1[0])
                if t1 > t0:
                    t1 -= TAU  # concave: round the side facing the star axis
                n = max(seg, int((t0 - t1) * self.rp / 0.5))
                pts += [P + self.rp * np.array([math.cos(x), math.sin(x)]) for x in np.linspace(t0, t1, n + 1)]
            prev_end = ang + half[kind]
        span = (feats[0][0] - half[feats[0][1]] - prev_end) % TAU
        n = max(2, int(span * R / 1.0))
        pts += [rim(prev_end + span * i / n) for i in range(1, n)]
        loops = [np.array(pts)]
        if self.bore_d > 0:
            n = 128
            loops.append(np.array([[self.bore_d / 2 * math.cos(-TAU * i / n), self.bore_d / 2 * math.sin(-TAU * i / n)]
                                   for i in range(n)]))
        return loops

    def _dense_star(self, step=0.15):
        loop = self.star_loops()[0]
        out = []
        for p, q in zip(loop, np.roll(loop, -1, 0)):
            n = max(1, int(math.dist(p, q) / step))
            out.append(p + (q - p) * (np.arange(n)[:, None] / n))
        return np.concatenate(out)

    def disc_profiles(self, rays=1440, steps=1440):
        """Polar radius r[k] (ray k at angle k*TAU/rays, driver frame: pin 0 on +x) per driver."""
        if self._discs is not None:
            return self._discs
        star = self._dense_star()
        ts = np.arange(steps) / steps * TAU
        stars = [self.star_angle(t) for t in ts]
        out = []
        for d in self.drivers:
            D = np.array([self.c * math.cos(d.at), self.c * math.sin(d.at)])
            r = np.full(rays, self.rl)
            for t, sa in zip(ts, stars):
                Q = _rot(star, sa) - D
                Q = _rot(Q, -self.pin_angle(d, 0, t))
                k = np.round(np.arctan2(Q[:, 1], Q[:, 0]) / TAU * rays).astype(int) % rays
                np.minimum.at(r, k, np.hypot(Q[:, 0], Q[:, 1]) - self.gap)
            # a ray can slip between sampled points: take the min of each ray and its neighbours
            r = np.minimum(r, np.minimum(np.roll(r, 1), np.roll(r, -1)))
            out.append(np.maximum(r, 0.0))
        self._discs = out
        return out

    def disc_loop(self, i, rays=1440):
        r = self.disc_profiles(rays)[i]
        ang = np.arange(len(r)) / len(r) * TAU
        return np.stack([r * np.cos(ang), r * np.sin(ang)], 1)

    # ---- checks -----------------------------------------------------------------------------

    def _inside_disc(self, i, world_pts, t):
        """Penetration depth (mm, >0 = inside) of world points into driver i's locking disc."""
        d = self.drivers[i]
        r = self.disc_profiles()[i]
        D = np.array([self.c * math.cos(d.at), self.c * math.sin(d.at)])
        Q = _rot(world_pts - D, -self.pin_angle(d, 0, t))
        k = np.round(np.arctan2(Q[:, 1], Q[:, 0]) / TAU * len(r)).astype(int) % len(r)
        return r[k] - np.hypot(Q[:, 0], Q[:, 1])

    def check(self, steps=720):
        """Sample one cycle. Returns worst clearances (mm, negative = collision) and, for each
        dwell, how far the star can be forced each way before a locking disc stops it (deg)."""
        star = self._dense_star(0.3)
        loop = self.star_loops()[0]
        seg_a, seg_b = loop, np.roll(loop, -1, 0)
        res = {"pin_star": 1e9, "pin_disc": 1e9, "pin_pin": 1e9, "disc_disc": 1e9, "star_disc": 1e9}
        discs = [self.disc_loop(i) for i in range(len(self.drivers))]
        for t in np.arange(steps) / steps * TAU:
            sa = self.star_angle(t)
            A, B = _rot(seg_a, sa), _rot(seg_b, sa)
            pins = [(i, self.pin_world(d, j, t)) for i, d in enumerate(self.drivers) for j in range(d.pins)]
            for i, p in pins:
                # distance from the pin centre to the star outline, minus the pin radius
                ab = B - A
                f = np.clip(((p - A) * ab).sum(1) / (ab * ab).sum(1), 0, 1)
                dist = np.hypot(*(A + ab * f[:, None] - p).T).min()
                if _point_in(p, A):
                    dist = -dist
                res["pin_star"] = min(res["pin_star"], dist - self.pin_d / 2)
                for k in range(len(self.drivers)):
                    if k != i:
                        res["pin_disc"] = min(res["pin_disc"], -self._inside_disc(k, p[None], t)[0] - self.pin_d / 2)
            for (i, p), (k, q) in ((x, y) for x in pins for y in pins if x[0] < y[0]):
                res["pin_pin"] = min(res["pin_pin"], math.dist(p, q) - self.pin_d)
            S = _rot(star, sa)
            for i in range(len(self.drivers)):
                res["star_disc"] = min(res["star_disc"], -self._inside_disc(i, S, t).max())
                for k in range(len(self.drivers)):
                    if k != i:
                        d = self.drivers[i]
                        D = np.array([self.c * math.cos(d.at), self.c * math.sin(d.at)])
                        W = _rot(discs[i], self.pin_angle(d, 0, t)) + D
                        res["disc_disc"] = min(res["disc_disc"], -self._inside_disc(k, W, t).max())
        locks = []
        for t in self.dwells():
            sa = self.star_angle(t)
            play = []
            for sgn in (1, -1):
                for k in range(1, 301):  # 0.05 deg steps up to 15 deg
                    S = _rot(star, sa + sgn * math.radians(0.05 * k))
                    if max(self._inside_disc(i, S, t).max() for i in range(len(self.drivers))) > 0:
                        play.append(round(0.05 * k, 2))
                        break
                else:
                    play.append(None)  # not locked this way
            locks.append({"t_deg": round(math.degrees(t), 1), "star_deg": round(math.degrees(sa), 2),
                          "play_deg": play})
        res["locks"] = locks
        res["plate_to_star_axis"] = self.c - self.plate_r - self.bore_d / 2
        return res

    def summary(self):
        push = 2 * self.gamma
        n_push = len(self._windows)
        return {
            "kind": self.kind, "swing_deg": round(2 * math.degrees(self.amp), 3), "c": round(self.c, 3),
            "crank_a": round(self.a, 3), "rim_R": round(self.R, 3), "slot_w": round(2 * self.w, 3),
            "slot_floor_r": round(self.bottom, 3), "pocket_r": round(self.rp, 3), "lock_r": round(self.rl, 3),
            "pushes_per_turn": n_push, "push_deg_of_driver": round(math.degrees(push), 1),
            "moving_fraction": round(n_push * push / TAU, 3),
            "peak_speed_ratio": round(math.sin(self.amp) / (1 - math.sin(self.amp)), 3),
            "advance_per_turn_deg": round(math.degrees(self.advance), 3),
        }

    def settings(self):
        return {"kind": self.kind, "amp": self.amp, "c": self.c, "slots": self.slots, "pockets": self.pockets,
                "drivers": [[d.at, d.sense, d.phase, d.pins] for d in self.drivers], "pin_d": self.pin_d,
                "gap": self.gap, "land": self.land, "trim": self.trim, "bore_d": self.bore_d,
                "plate_r": self.plate_r}

    @classmethod
    def from_settings(cls, s):
        s = dict(s)
        s["drivers"] = [Driver(*d) for d in s["drivers"]]
        return cls(**s)


def _point_in(p, poly):
    x, y = p
    xs, ys = poly[:, 0], poly[:, 1]
    xn, yn = np.roll(xs, -1), np.roll(ys, -1)
    cross = (ys > y) != (yn > y)
    xi = xs + (y - ys) * (xn - xs) / np.where(yn == ys, 1e-12, yn - ys)
    return bool(np.sum(cross & (x < xi)) % 2)


# ---- factories ------------------------------------------------------------------------------

def index(n, c, pins=1, at_deg=0.0, sense=-1, **kw):
    """Plain n-slot Geneva: one driver at world angle at_deg; the star turns 360/n per pin pass."""
    amp = math.pi / n
    at = math.radians(at_deg)
    pockets = [at + k * TAU / n for k in range(n)]  # at rest a pocket faces the driver
    slots = [p + amp for p in pockets]
    # first push centred at t = pi/pins, so the cycle starts in a dwell
    phase = at + math.pi - sense * math.pi / pins
    return Drive(amp, c, slots, pockets, [Driver(at, sense, phase, pins)], kind=f"index{n}", **kw)


def toggle(swing_deg, c, a_deg=225.0, b_deg=45.0, **kw):
    """Double-Geneva toggle: A (at a_deg) pushes the star +swing, B (at b_deg) pushes it back.

    A turns CW and B CCW (gear them so they counter-rotate). A's push is centred at t = 90 deg
    of driver turn and B's at 270, so the cycle starts in the dwell before A's push.
    Slots face each driver at the middle of its push; pockets sit beside each slot, one
    for each rest pose that driver has to hold.
    """
    amp = math.radians(swing_deg) / 2
    a, b = math.radians(a_deg), math.radians(b_deg)
    slots = [a - amp, b - amp]
    pockets = sorted({round(x % TAU, 9) for x in (a, b, a - 2 * amp, b - 2 * amp)})
    da = Driver(a, -1, a + math.pi + math.pi / 2)        # mid-push at t = pi/2
    db = Driver(b, +1, b + math.pi - 3 * math.pi / 2)    # mid-push at t = 3*pi/2
    return Drive(amp, c, slots, pockets, [da, db], kind=f"toggle{swing_deg:g}", **kw)


def meshed_toggle(swing_deg, pitch_r, mid_deg=-90.0, **kw):
    """Toggle whose two drivers mesh with each other (equal gears, pitch radius pitch_r).

    Meshing fixes their spacing at 2 * pitch_r. Placing them +-swing/2 either side of mid_deg
    makes that spacing 2 * c * sin(swing/2) = 2 * crank, so c = pitch_r / sin(swing/2) and the
    crank radius equals the pitch radius. The two slots then sit side by side and the middle
    pocket is shared by both drivers.
    """
    amp = math.radians(swing_deg) / 2
    c = pitch_r / math.sin(amp)
    return toggle(swing_deg, c, mid_deg + swing_deg / 2, mid_deg - swing_deg / 2, **kw)


def board_motion(drive, ratio=None, steps=3600):
    """A toggle carrying a letter that rides a turning board (the SATOR O).

    One driver turn = one push and one return = half a board turn (two 90 deg detents), so
    the driver turns twice per board turn. The letter turns `ratio` x the star, against the
    board; ratio = 90 / swing (the default) makes each push a quarter turn, so at every
    detent the letter sits at 0 or 180 deg. Returns (board_deg, world_deg) over one driver turn,
    starting mid-dwell at a detent.
    """
    ratio = math.pi / (4 * drive.amp) if ratio is None else ratio
    t = np.arange(steps + 1) / steps * TAU
    s0 = drive.star_angle(0.0)
    world = [math.degrees(tt / 2 - ratio * (drive.star_angle(tt) - s0)) for tt in t]
    return np.degrees(t / 2), np.array(world)


if __name__ == "__main__":
    import json
    legacy = toggle(90, 50.715, land=7.8, bore_d=16.3)  # the printed Inventor double-Geneva star
    for dr in (legacy, index(4, 50.715, land=3.0), index(6, 60.0, pins=2), meshed_toggle(45, 18.0)):
        print(json.dumps(dr.summary()))
        chk = dr.check(steps=240)
        print("  ", {k: (round(v, 3) if isinstance(v, float) else v) for k, v in chk.items()})

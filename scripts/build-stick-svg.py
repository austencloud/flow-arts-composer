"""Generate the stick pictograph and button SVGs from measurements.

Same discipline as the fire double staff: every proportion below is a number
off the reference photograph, and the drawings are emitted from that table.
scripts/build-stick-model.py builds the 3D from the JSON this writes, and both
paint their bark with scripts/stick_bark.py, so the two renderings can never
drift into different objects.

Source
  A pair of found branches, photographed held in one hand (a friend's first
  double-staff set, sent 2026-10-06). Read against the hand that holds them:
    taper     about 30mm across at the thick end, 21mm at the thin end
    bark      smooth young bark, warm grey-brown with a dense dark and pale
              stipple and pale lenticels; no deep fissures
    nodes     a bud knob every 55-100mm, alternating sides, each a rounded
              swelling with a dark bud on its crown
    scars     snapped side twigs leave tan discs flush with the bark
    ends      saw cuts showing pale wood; a thick end can carry a short stub
              of the fork it was cut from
    shape     neither branch is straight: each kinks at its nodes and carries
              a slow bow end to end

  Two sticks, because nobody finds the same stick twice. They are cut as a
  pair: same length, same thickness within a millimetre or two, the same bark
  off the same kind of tree, the same tape. Everything a tree decides -- where
  the nodes fall, which way the branch leans, where a twig snapped off, the
  stub at the thick end -- differs. The left hand holds stick.svg, the right
  hand stick-right.svg (packages/render-core/src/handed-prop-artwork.ts).

  The length is NOT read off the photo. A stick spins at the performer's staff
  length, so it is authored at the Fire Staff's 90cm and Prop3D stretches its
  long axis to whatever the performer's staff is, the same way it stretches the
  Fire Staff. The drawing spans the staff's 252.8 for the same reason.

The tape is the one addition to the photograph. Found sticks carry no left or
right, and the app needs one, so a wrap of grip tape over the middle carries the
hand color and the bark stays bark.

CROSS_EXAGGERATION is the one drawing decision rather than a measurement. It is
applied EQUALLY to every cross-section -- branch, knobs and tape -- which is what
keeps the silhouette honest.
"""

from __future__ import annotations

import base64
import io
import json
import math
import pathlib
import sys
from dataclasses import dataclass, field

import numpy as np
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import stick_bark  # noqa: E402

# -- Shared by both sticks ---------------------------------------------------
HALF_LENGTH_MM = 450.0          # authored at 90cm; Prop3D stretches it
NODE_SIGMA_MM = 5.5             # how far along the branch a knob swells
NODE_SWELL_MM = 1.2             # the whole branch thickens slightly at a node
KINK_SPREAD_MM = 7.0            # a kink turns over this much wood, not a corner
TIP_BEND_SPREAD_MM = 35.0

GRIP_HALF_MM = 60.0             # one hand's width of tape at the middle
TAPE_MM = 1.1                   # two layers of cloth grip tape
TAPE_PITCH_MM = 19.0            # one wrap
TAPE_SLANT_MM = 8.0             # a spiral wrap starts and ends on a diagonal

#: 3D sides, as angles round the long axis: face toward the front camera (+Z),
#: top and bottom on X. The drawing is the model seen from its face side.
SIDE_ANGLE_DEG = {"bottom": 0.0, "face": 90.0, "top": 180.0}


@dataclass(frozen=True)
class Fork:
    """The stub of the fork at the thumb end: where it leaves the branch, its
    angle off the long axis toward the thumb end, its length and diameters."""

    station: float
    side: str
    angle_deg: float
    length_mm: float
    base_d_mm: float
    tip_d_mm: float


@dataclass(frozen=True)
class StickSpec:
    hand: str
    svg: str
    glb: str
    butt_d_mm: float            # thumb end: the thick end the branch grew from
    tip_d_mm: float             # pinky end
    taper_power: float          # wood thins faster toward the tip below 1
    #: Bud knobs as (station, side, crown height in mm, kink in degrees).
    #: Stations run from -1 at the pinky end to +1 at the thumb end; sides are
    #: as drawn, "face" being the side toward the viewer.
    #:
    #: The kink is why a branch is not straight. Each year's growth leaves a
    #: bud, and the stem changes heading slightly there, away from the bud;
    #: the run between two nodes is nearly straight. Integrated end to end
    #: those kinks are the zigzag every reference branch has. A face bud kinks
    #: the branch toward or away from the viewer, which the drawing cannot
    #: show and the 3D does. None sits under the tape.
    nodes: tuple[tuple[float, str, float, float], ...]
    #: One long sweep on top of the kinks, and the thin young end bending back
    #: the other way on its own: the S a branch grows into when it leans one
    #: way and then reaches for light.
    bow_deg: float
    tip_bend_deg: float
    tip_bend_station: float
    depth_bow_deg: float
    #: Wood is not turned on a lathe. Diameter wanders a millimetre either way
    #: between nodes, and the centreline carries a fine wobble on top of the
    #: kinks. Fixed sums of incommensurate sines, so a stick is the same every
    #: build.
    girth_wander: tuple[tuple[float, float, float], ...]
    line_wander: tuple[tuple[float, float, float], ...]
    depth_wander: tuple[tuple[float, float, float], ...]
    #: Snapped side twigs: (station, side, disc mm).
    scars: tuple[tuple[float, str, float], ...]
    fork: Fork
    pinky_cut_deg: float        # the diagonal saw cut at the thin end
    pinky_cut_long_side: str
    thumb_cut_deg: float        # nearly square at the thick end
    thumb_cut_long_side: str
    bark_seed: int
    #: A few percent browner (+) or greyer (-): the same tree, a different day.
    tone: float = 0.0
    #: Where bark rubbed through to wood: (station, side, length mm, width mm).
    peels: tuple[tuple[float, str, float, float], ...] = field(default=())


STICKS = (
    StickSpec(
        hand="left",
        svg="stick",
        glb="stick.glb",
        butt_d_mm=31.0,
        tip_d_mm=21.0,
        taper_power=0.8,
        nodes=(
            (-0.92, "top", 4.0, 3.5),
            (-0.80, "face", 3.6, 3.0),
            (-0.66, "bottom", 4.6, 4.5),
            (-0.51, "top", 3.9, 3.5),
            (-0.36, "face", 3.4, 2.5),
            (-0.22, "bottom", 4.0, 3.0),
            (0.21, "top", 3.6, 3.0),
            (0.35, "face", 3.8, 3.5),
            (0.49, "bottom", 4.3, 4.0),
            (0.62, "top", 4.8, 4.5),
            (0.76, "face", 3.4, 3.0),
        ),
        bow_deg=5.0,
        tip_bend_deg=-7.0,
        tip_bend_station=-0.70,
        depth_bow_deg=-3.0,
        girth_wander=((0.7, 2.3, 0.4), (0.45, 5.1, 1.7), (0.25, 9.7, 2.9)),
        line_wander=((0.35, 6.3, 0.5), (0.2, 13.1, 2.2)),
        depth_wander=((0.3, 4.9, 1.1), (0.2, 11.7, 0.3)),
        scars=((-0.585, "face", 9.0), (0.69, "bottom", 7.0)),
        fork=Fork(0.87, "bottom", 42.0, 30.0, 12.0, 9.0),
        pinky_cut_deg=40.0,
        pinky_cut_long_side="top",
        thumb_cut_deg=12.0,
        thumb_cut_long_side="bottom",
        bark_seed=20261006,
    ),
    StickSpec(
        hand="right",
        svg="stick-right",
        glb="stick-right.glb",
        butt_d_mm=30.0,
        tip_d_mm=20.0,
        taper_power=0.9,
        nodes=(
            (-0.95, "bottom", 3.4, 3.0),
            (-0.84, "face", 4.2, 3.5),
            (-0.71, "top", 3.8, 4.0),
            (-0.57, "bottom", 4.4, 3.5),
            (-0.44, "face", 3.2, 2.5),
            (-0.30, "top", 4.1, 4.5),
            (-0.18, "face", 3.0, 2.0),
            (0.19, "bottom", 3.9, 3.5),
            (0.31, "face", 3.5, 3.0),
            (0.44, "top", 4.5, 5.0),
            (0.58, "bottom", 3.8, 3.0),
            (0.70, "face", 4.4, 3.5),
            (0.82, "top", 3.6, 2.5),
        ),
        bow_deg=-4.0,
        tip_bend_deg=6.0,
        tip_bend_station=-0.62,
        depth_bow_deg=2.5,
        girth_wander=((0.6, 2.9, 1.3), (0.5, 4.3, 0.2), (0.3, 8.9, 2.0)),
        line_wander=((0.3, 5.7, 1.9), (0.25, 11.3, 0.7)),
        depth_wander=((0.35, 5.3, 2.4), (0.15, 12.9, 1.6)),
        scars=((-0.40, "top", 8.0), (0.52, "face", 8.5), (-0.77, "face", 6.0)),
        fork=Fork(0.84, "top", 38.0, 22.0, 11.0, 8.5),
        pinky_cut_deg=30.0,
        pinky_cut_long_side="bottom",
        thumb_cut_deg=7.0,
        thumb_cut_long_side="top",
        bark_seed=7311,
        tone=-0.05,
        peels=((0.625, "face", 15.0, 8.0),),
    ),
)

# -- Drawing decisions -------------------------------------------------------
SPAN = 252.8                    # matches staff, so mandala radius and beta hold
VB_H = 24.0
CY = VB_H / 2
CROSS_EXAGGERATION = 1.15
U_PER_MM = (SPAN / 2) / HALF_LENGTH_MM
PIVOT = SPAN / 2
TRACKED_TIP = PIVOT             # the very ends: there is no wick to aim at
GRIP_END = round(U_PER_MM * GRIP_HALF_MM, 2)

#: The bark picture: 6 pixels per unit is about 1.7 per mm along the stick,
#: sharp at four times a pictograph cell's usual size. Painted at twice that
#: and averaged down so the stipple does not alias.
BARK_PX_PER_UNIT = 6
BARK_SUPERSAMPLE = 2
BARK_JPEG_QUALITY = 74
#: Lit from above and a little in front, the light the staff family's tubes
#: take. (x right toward the thumb end, y down the drawing, z toward the eye.)
LIGHT = np.array([-0.3, -0.62, 0.72]) / np.linalg.norm([-0.3, -0.62, 0.72])
AMBIENT = 0.34
DIFFUSE = 0.8
#: The bark's grain is a fraction of a millimetre deep; doubling its slope is
#: what lets it read at pictograph size. Knobs already read in the silhouette,
#: so their slope is drawn true: steeper, and a face knob's shaded underside
#: reads as a stain instead of a swelling.
RELIEF_GAIN = 2.0
KNOB_GAIN = 1.0


def axial(mm: float) -> float:
    return mm * U_PER_MM


def across(mm: float) -> float:
    return mm * U_PER_MM * CROSS_EXAGGERATION


def wander(u: float, terms: tuple[tuple[float, float, float], ...]) -> float:
    return sum(a * math.sin(math.tau * f * u + phase) for a, f, phase in terms)


def smoothstep(x: float) -> float:
    """0 -> 1 across x in [-1, 1], with zero slope at both ends."""
    t = min(1.0, max(0.0, (x + 1) / 2))
    return t * t * (3 - 2 * t)


def fmt(v: float) -> str:
    text = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if text == "-0" else text


def polyline(points: list[tuple[float, float]]) -> str:
    head, *rest = points
    return f"M{fmt(head[0])} {fmt(head[1])}" + "".join(
        f"L{fmt(x)} {fmt(y)}" for x, y in rest
    )


def signed_area(points: list[tuple[float, float]]) -> float:
    return sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(points, points[1:] + points[:1])) / 2


def stations(u0: float, u1: float, step_mm: float = 2.5) -> list[float]:
    count = max(2, round(abs(u1 - u0) * HALF_LENGTH_MM / step_mm))
    return [u0 + (u1 - u0) * i / count for i in range(count + 1)]


class Stick:
    def __init__(self, spec: StickSpec):
        self.spec = spec
        self._bottomward = self._integrate("drawing", spec.line_wander)
        self._toward_viewer = self._integrate("depth", spec.depth_wander)

        # The cut ends. A diagonal cut leaves one edge longer than the other;
        # the run is how far along the branch the cut travels, end to end.
        pinky_run = spec.tip_d_mm * math.tan(math.radians(spec.pinky_cut_deg)) / HALF_LENGTH_MM
        thumb_run = spec.butt_d_mm * math.tan(math.radians(spec.thumb_cut_deg)) / HALF_LENGTH_MM
        self.pinky_run, self.thumb_run = pinky_run, thumb_run

        def span(side: str) -> tuple[float, float]:
            start = -1.0 if spec.pinky_cut_long_side == side else -1.0 + pinky_run
            end = 1.0 if spec.thumb_cut_long_side == side else 1.0 - thumb_run
            return start, end

        self.top_u = span("top")
        self.bottom_u = span("bottom")

    # -- shape --------------------------------------------------------------

    def diameter_mm(self, u: float) -> float:
        """Branch diameter at station u, before any one-sided knob."""
        s = self.spec
        d = s.tip_d_mm + (s.butt_d_mm - s.tip_d_mm) * ((u + 1) / 2) ** s.taper_power
        sigma = NODE_SIGMA_MM * 1.8 / HALF_LENGTH_MM
        for station, _side, _crown, _kink in s.nodes:
            d += NODE_SWELL_MM * math.exp(-(((u - station) / sigma) ** 2))
        return d + wander(u, s.girth_wander)

    def heading_deg(self, u: float, plane: str) -> float:
        """The branch's heading at u, in the drawing plane or in depth,
        measured from its pinky end: the slow bow plus every kink already
        passed. Positive turns toward the bottom side (drawing) or toward the
        viewer (depth)."""
        s = self.spec
        y = u * HALF_LENGTH_MM
        if plane == "drawing":
            h = s.bow_deg * (u + 1) / 2
            h += s.tip_bend_deg * smoothstep(
                (y - s.tip_bend_station * HALF_LENGTH_MM) / TIP_BEND_SPREAD_MM
            )
            # the stem turns AWAY from the bud: a top bud sends it toward the bottom
            sides = {"top": 1.0, "bottom": -1.0}
        else:
            h = s.depth_bow_deg * (u + 1) / 2
            sides = {"face": 1.0}
        alternate = 1.0
        for station, side, _crown, kink in s.nodes:
            if side not in sides:
                continue
            sign = sides[side]
            if plane == "depth":
                # face buds sit on alternate sides of the depth plane in turn
                sign, alternate = alternate, -alternate
            h += sign * kink * smoothstep((y - station * HALF_LENGTH_MM) / KINK_SPREAD_MM)
        return h

    def _integrate(self, plane: str, wobble) -> list[float]:
        """Centreline offset every 0.5mm, normalised so the hand pivot sits on
        the centreline and the two ends sit level. The prop's long axis is the
        line through its ends, which is what the tip table and the spin read."""
        n = 1800
        us = [-1 + 2 * i / n for i in range(n + 1)]
        offsets = [0.0]
        step = 2 * HALF_LENGTH_MM / n
        for a, b in zip(us, us[1:]):
            mid = math.radians(self.heading_deg((a + b) / 2, plane))
            offsets.append(offsets[-1] + math.tan(mid) * step)
        offsets = [o + wander(u, wobble) for o, u in zip(offsets, us)]
        pivot = offsets[n // 2]
        offsets = [o - pivot for o in offsets]
        tilt = (offsets[-1] - offsets[0]) / 2
        return [o - tilt * u for o, u in zip(offsets, us)]

    @staticmethod
    def _lookup(offsets: list[float], u: float) -> float:
        f = (u + 1) / 2 * (len(offsets) - 1)
        i = min(len(offsets) - 2, max(0, int(f)))
        t = f - i
        return offsets[i] * (1 - t) + offsets[i + 1] * t

    def centre_top_mm(self, u: float) -> float:
        """How far the branch's centreline sits toward its top side at u."""
        return -self._lookup(self._bottomward, u)

    def centre_face_mm(self, u: float) -> float:
        """How far the centreline sits toward the viewer at u. 3D only."""
        return self._lookup(self._toward_viewer, u)

    def knob_mm(self, u: float, side: str) -> float:
        sigma = NODE_SIGMA_MM / HALF_LENGTH_MM
        return sum(
            crown * math.exp(-(((u - station) / sigma) ** 2))
            for station, node_side, crown, _kink in self.spec.nodes
            if node_side == side
        )

    @staticmethod
    def x_at(u: float) -> float:
        return PIVOT + axial(u * HALF_LENGTH_MM)

    def y_centre(self, u: float) -> float:
        return CY - axial(self.centre_top_mm(u))

    def top_y(self, u: float, extra_mm: float = 0.0) -> float:
        return self.y_centre(u) - across(
            self.diameter_mm(u) / 2 + self.knob_mm(u, "top") + extra_mm
        )

    def bottom_y(self, u: float, extra_mm: float = 0.0) -> float:
        return self.y_centre(u) + across(
            self.diameter_mm(u) / 2 + self.knob_mm(u, "bottom") + extra_mm
        )

    # -- outlines -----------------------------------------------------------

    def silhouette_points(self) -> list[tuple[float, float]]:
        top = [(self.x_at(u), self.top_y(u)) for u in stations(*self.top_u)]
        bottom = [
            (self.x_at(u), self.bottom_y(u)) for u in reversed(stations(*self.bottom_u))
        ]
        return top + bottom

    def silhouette(self) -> str:
        return polyline(self.silhouette_points()) + "Z"

    def tape_path(self) -> str:
        """The tape follows the branch, a little proud of it, with diagonal ends."""
        g = GRIP_HALF_MM / HALF_LENGTH_MM
        slant = TAPE_SLANT_MM / HALF_LENGTH_MM
        top = [(self.x_at(u), self.top_y(u, TAPE_MM)) for u in stations(-g, g - slant, 4.0)]
        bottom = [
            (self.x_at(u), self.bottom_y(u, TAPE_MM))
            for u in reversed(stations(-g + slant, g, 4.0))
        ]
        return polyline(top + bottom) + "Z"

    def side_point(self, u: float, side: str) -> tuple[float, float]:
        if side == "top":
            return self.x_at(u), self.top_y(u)
        if side == "bottom":
            return self.x_at(u), self.bottom_y(u)
        return self.x_at(u), self.y_centre(u)

    def fork_frame(self):
        """Base point, unit direction, unit normal, reach and the two half
        widths of the fork stub, in drawing units."""
        f = self.spec.fork
        u = f.station
        angle = math.radians(f.angle_deg)
        sign = 1 if f.side == "bottom" else -1
        direction = (math.cos(angle), sign * math.sin(angle))
        normal = (-direction[1], direction[0])
        # start buried inside the branch so the joint reads as growth, not glue
        base = (self.x_at(u), self.y_centre(u) + sign * across(self.diameter_mm(u) * 0.15))
        reach = axial(f.length_mm) + across(self.diameter_mm(u) / 2) * 0.65
        return base, direction, normal, reach, across(f.base_d_mm / 2), across(f.tip_d_mm / 2)

    def fork(self) -> tuple[str, str]:
        """The fork stub: a short tapered twig, and the pale cut on its end."""
        base, direction, normal, reach, hb, ht = self.fork_frame()
        tip = (base[0] + direction[0] * reach, base[1] + direction[1] * reach)
        corners = [
            (base[0] + normal[0] * hb, base[1] + normal[1] * hb),
            (tip[0] + normal[0] * ht, tip[1] + normal[1] * ht),
            (tip[0] - normal[0] * ht, tip[1] - normal[1] * ht),
            (base[0] - normal[0] * hb, base[1] - normal[1] * hb),
        ]
        # Wind it the way the branch winds. The two share one clip path, and a
        # renderer that merges a clip's children into one path (librsvg does)
        # cancels the overlap of two shapes wound against each other.
        if (signed_area(corners) > 0) != (signed_area(self.silhouette_points()) > 0):
            corners.reverse()
        rotation = math.degrees(math.atan2(direction[1], direction[0]))
        cap = (
            f'<ellipse cx="{fmt(tip[0])}" cy="{fmt(tip[1])}" rx="{fmt(ht * 0.4)}" ry="{fmt(ht)}"'
            f' transform="rotate({fmt(rotation)} {fmt(tip[0])} {fmt(tip[1])})"'
            f' fill="#DDB98A" stroke="#5E4835" stroke-width="0.35"/>'
        )
        return polyline(corners) + "Z", cap

    def cut_face(self, u_top: float, u_bottom: float, bulge: float) -> str:
        """The pale wood of a saw cut: the cut line, and an arc bowing back into
        the branch, which is the near rim of the cut face turned to the eye. A
        darker ring just inside the rim is the bark's own thickness."""
        a = (self.x_at(u_top), self.top_y(u_top))
        b = (self.x_at(u_bottom), self.bottom_y(u_bottom))
        mid = ((a[0] + b[0]) / 2 + bulge, (a[1] + b[1]) / 2)
        inner = ((a[0] + b[0]) / 2 + bulge * 1.45, (a[1] + b[1]) / 2)
        return (
            f'<path d="M{fmt(a[0])} {fmt(a[1])} L{fmt(b[0])} {fmt(b[1])}'
            f' Q{fmt(mid[0] + bulge)} {fmt(mid[1])} {fmt(a[0])} {fmt(a[1])}Z"'
            f' fill="#DDB98A" stroke="#5E4835" stroke-width="0.4"/>'
            f'\n  <path d="M{fmt(a[0] + bulge * 0.25)} {fmt(a[1] + 0.45)}'
            f' Q{fmt(inner[0])} {fmt(inner[1])} {fmt(b[0] + bulge * 0.25)} {fmt(b[1] - 0.45)}"'
            f' fill="none" stroke="#B48A5C" stroke-width="0.3" opacity="0.8"/>'
        )

    def edge_buds(self) -> str:
        """An edge knob is already in the silhouette; it gets a dark bud on its
        crown, drawn over the outline because the crown IS the outline. Face
        buds are in the bark picture."""
        out: list[str] = []
        for station, side, _crown, _kink in self.spec.nodes:
            if side == "face":
                continue
            x, y = self.side_point(station, side)
            sign = -1 if side == "top" else 1
            out.append(
                f'  <ellipse cx="{fmt(x)}" cy="{fmt(y - sign * across(0.9))}" rx="{fmt(across(3.0))}" ry="{fmt(across(1.9))}" fill="#3B2D22"/>'
            )
            out.append(
                f'  <ellipse cx="{fmt(x - 0.25)}" cy="{fmt(y - sign * across(1.3))}" rx="{fmt(across(1.1))}" ry="{fmt(across(0.6))}" fill="#7C6450" opacity="0.8"/>'
            )
        return chr(10).join(out)

    # -- bark ---------------------------------------------------------------

    def bark_input(self) -> dict:
        s = self.spec
        return {
            "length_mm": HALF_LENGTH_MM * 2,
            "profile": self.profile(),
            "side_angle_deg": SIDE_ANGLE_DEG,
            "nodes": self.nodes_json(),
            "scars": self.scars_json(),
            "peels": self.peels_json(),
        }

    def profile(self) -> list[list[float]]:
        return [
            [
                round(u * HALF_LENGTH_MM, 3),
                round(self.diameter_mm(u), 3),
                round(self.centre_top_mm(u), 3),
                round(self.centre_face_mm(u), 3),
            ]
            for u in stations(-1.0, 1.0)
        ]

    def nodes_json(self) -> list[dict]:
        return [
            {"y_mm": round(u * HALF_LENGTH_MM, 2), "side": side, "crown_mm": crown, "kink_deg": kink}
            for u, side, crown, kink in self.spec.nodes
        ]

    def scars_json(self) -> list[dict]:
        return [
            {"y_mm": round(u * HALF_LENGTH_MM, 2), "side": side, "disc_mm": disc}
            for u, side, disc in self.spec.scars
        ]

    def peels_json(self) -> list[dict]:
        return [
            {"y_mm": round(u * HALF_LENGTH_MM, 2), "side": side, "length_mm": length, "width_mm": width}
            for u, side, length, width in self.spec.peels
        ]

    def bark_picture(self) -> tuple[str, tuple[float, float, float, float]]:
        """The branch and fork, lit, as one JPEG and the box it fills.

        Every pixel is a point on the round branch: its column gives the
        station along the stem, its height between the two silhouette edges
        gives the angle round it (an edge is seen side-on, the middle
        head-on). That point's bark comes from the same painting the 3D wraps
        round the model, and it is lit by the branch's own normal, tipped by
        the knobs and the bark's relief."""
        albedo, relief = stick_bark.paint(self.bark_input(), self.spec.bark_seed, self.spec.tone)
        heights = relief * RELIEF_GAIN + self._knob_heights() * KNOB_GAIN
        mm_row = 2 * HALF_LENGTH_MM / stick_bark.HEIGHT
        rows_radius = np.interp(
            (np.arange(stick_bark.HEIGHT) + 0.5) * mm_row - HALF_LENGTH_MM,
            [p[0] for p in self.profile()],
            [p[1] / 2 for p in self.profile()],
        )
        grad_along = np.gradient(heights, mm_row, axis=0)
        grad_around = (
            (np.roll(heights, -1, axis=1) - np.roll(heights, 1, axis=1))
            / 2
            / (math.tau * rows_radius[:, None] / stick_bark.WIDTH)
        )

        base, direction, normal, reach, hb, ht = self.fork_frame()
        tip = (base[0] + direction[0] * reach, base[1] + direction[1] * reach)
        ys_all = [self.top_y(u) for u in stations(-1, 1)] + [self.bottom_y(u) for u in stations(-1, 1)]
        ys_all += [base[1] + normal[1] * hb, base[1] - normal[1] * hb, tip[1] + normal[1] * ht, tip[1] - normal[1] * ht]
        y0 = math.floor(min(ys_all) - 0.6)
        y1 = math.ceil(max(ys_all) + 0.6)
        x0, x1 = 0.0, SPAN

        scale = BARK_PX_PER_UNIT * BARK_SUPERSAMPLE
        width, height = round((x1 - x0) * scale), round((y1 - y0) * scale)
        xs = x0 + (np.arange(width) + 0.5) / scale
        ys = y0 + (np.arange(height) + 0.5) / scale

        u = np.clip((xs - PIVOT) / (SPAN / 2), -1, 1)
        top = np.array([self.top_y(v) for v in u])
        bottom = np.array([self.bottom_y(v) for v in u])
        f_raw = (ys[:, None] - top[None, :]) / (bottom - top)[None, :] * 2 - 1
        f = np.clip(f_raw, -0.995, 0.995)
        theta = np.pi / 2 - np.arcsin(f)
        y_mm = np.broadcast_to((u * HALF_LENGTH_MM)[None, :], f.shape)
        branch = self._shade(albedo, grad_along, grad_around, y_mm, theta, (0.0, 0.0))

        # The fork, wherever the branch is not: a small round twig of its own.
        px = np.broadcast_to(xs[None, :], f.shape) - base[0]
        py = np.broadcast_to(ys[:, None], f.shape) - base[1]
        t = (px * direction[0] + py * direction[1]) / reach
        half = hb + (ht - hb) * np.clip(t, 0, 1)
        q = np.clip((px * normal[0] + py * normal[1]) / half, -0.995, 0.995)
        fork_theta = np.pi / 2 - np.arcsin(q)
        # The twig's own bark: the stretch the tape hides on the branch, so no
        # knob or scar of the branch's repeats on it.
        fork_mm = -45.0 + np.clip(t, 0, 1) * self.spec.fork.length_mm
        fork = self._shade(
            albedo, grad_along, grad_around, fork_mm, fork_theta, (normal[0], normal[1])
        )
        in_branch = np.abs(f_raw) <= 1.02
        in_fork = (t >= -0.1) & (t <= 1.05) & ~in_branch
        picture = np.where(in_fork[..., None], fork, branch)

        image = Image.fromarray((np.clip(picture, 0, 1) * 255 + 0.5).astype(np.uint8))
        image = image.resize(
            (round((x1 - x0) * BARK_PX_PER_UNIT), round((y1 - y0) * BARK_PX_PER_UNIT)),
            Image.Resampling.LANCZOS,
        )
        buffer = io.BytesIO()
        image.save(buffer, "JPEG", quality=BARK_JPEG_QUALITY, optimize=True, progressive=True)
        data = base64.b64encode(buffer.getvalue()).decode("ascii")
        return data, (x0, y0, x1 - x0, y1 - y0)

    def _knob_heights(self) -> np.ndarray:
        """Every knob as a height in mm on the bark painting's grid: the
        drawing's axial bump, made round by measuring the same sigma round
        the stem as along it -- exactly the swelling the 3D sweeps."""
        mm_row = 2 * HALF_LENGTH_MM / stick_bark.HEIGHT
        y = (np.arange(stick_bark.HEIGHT) + 0.5) * mm_row - HALF_LENGTH_MM
        theta = (np.arange(stick_bark.WIDTH) + 0.5) / stick_bark.WIDTH * math.tau
        radius = np.interp(y, [p[0] for p in self.profile()], [p[1] / 2 for p in self.profile()])
        heights = np.zeros((stick_bark.HEIGHT, stick_bark.WIDTH))
        for station, side, crown, _kink in self.spec.nodes:
            along = (y - station * HALF_LENGTH_MM) / NODE_SIGMA_MM
            angle = np.abs((theta - math.radians(SIDE_ANGLE_DEG[side]) + math.pi) % math.tau - math.pi)
            around = angle[None, :] * radius[:, None] / NODE_SIGMA_MM
            heights += crown * np.exp(-(along[:, None] ** 2) - around**2)
        return heights

    def _shade(self, albedo, grad_along, grad_around, y_mm, theta, axis_normal):
        """Bark at (y_mm, theta), lit. axis_normal is the drawing direction the
        surface faces at theta=0 for the fork; zero for the branch, whose
        theta=0 side faces straight down the drawing."""
        rowf = np.clip((y_mm + HALF_LENGTH_MM) / (2 * HALF_LENGTH_MM) * stick_bark.HEIGHT - 0.5, 0, stick_bark.HEIGHT - 1.001)
        colf = (theta / math.tau * stick_bark.WIDTH - 0.5) % stick_bark.WIDTH
        r0 = np.floor(rowf).astype(int)
        c0 = np.floor(colf).astype(int)
        fr, fc = rowf - r0, colf - c0
        c1 = (c0 + 1) % stick_bark.WIDTH

        def sample(field):
            def w(x):
                return x[..., None] if field.ndim == 3 else x

            near = field[r0, c0] * w(1 - fc) + field[r0, c1] * w(fc)
            far = field[r0 + 1, c0] * w(1 - fc) + field[r0 + 1, c1] * w(fc)
            return near * w(1 - fr) + far * w(fr)

        colour = sample(albedo)
        g_along = sample(grad_along)
        g_around = sample(grad_around)

        # radial normal: theta=0 faces the drawing's "down" (or the fork's
        # normal), theta=pi/2 faces the eye
        if axis_normal == (0.0, 0.0):
            down = (0.0, 1.0)
            along_dir = (1.0, 0.0)
        else:
            down = axis_normal
            along_dir = (axis_normal[1], -axis_normal[0])
        cos_t, sin_t = np.cos(theta), np.sin(theta)
        n = np.stack(
            [
                cos_t * down[0] - g_along * along_dir[0] + g_around * sin_t * down[0],
                cos_t * down[1] - g_along * along_dir[1] + g_around * sin_t * down[1],
                sin_t - g_around * cos_t,
            ],
            axis=-1,
        )
        n /= np.linalg.norm(n, axis=-1, keepdims=True)
        lambert = np.clip(n @ LIGHT, 0, None)
        light = AMBIENT + DIFFUSE * lambert
        return colour * light[..., None]

    # -- output -------------------------------------------------------------

    def svg(self) -> str:
        s = self.spec
        branch_d = self.silhouette()
        tape_d = self.tape_path()
        fork_d, fork_cap = self.fork()
        pinky_cut = self.cut_face(self.top_u[0], self.bottom_u[0], 1.0)
        thumb_cut = self.cut_face(self.top_u[1], self.bottom_u[1], -0.7)
        g_u = GRIP_HALF_MM / HALF_LENGTH_MM
        tape_top = round(min(self.top_y(u, TAPE_MM) for u in stations(-g_u, g_u)), 2)
        tape_bottom = round(max(self.bottom_y(u, TAPE_MM) for u in stations(-g_u, g_u)), 2)
        pitch = round(axial(TAPE_PITCH_MM), 2)
        bark, (bx, by, bw, bh) = self.bark_picture()
        other = "stick-right.svg" if s.hand == "left" else "stick.svg"
        return f"""<?xml version="1.0" encoding="utf-8"?>
<!--
  Stick ({s.hand} hand) - a found branch, spun as a staff. Staff family: a PAIR
  of these is a first double-staff set, before anyone buys a real one. The
  other hand holds {other}: the same length, thickness, bark and tape, a
  different branch.

  GENERATED by scripts/build-stick-svg.py. Edit the measurements there and
  re-run it. scripts/build-stick-model.py builds the 3D from
  scripts/stick-stations.json, which that script writes, and both paint
  their bark with scripts/stick_bark.py, so the drawing and the model are one
  object by construction.

  Geometry:
    viewBox {SPAN} x {VB_H:.0f}, hand pivot at ({PIVOT}, {CY:.0f}), spanning exactly as far
    as staff so the mandala radius and beta spacing stay on the staff family's
    numbers. The tips are the ends of the branch, +/- {TRACKED_TIP} from the pivot.
    Authored at 90cm, {U_PER_MM:.5f} units per mm; the 3D stretches to the
    performer's staff length.

    Thick end (thumb) at +x, {s.butt_d_mm:.0f}mm across; thin end (pinky) at -x, {s.tip_d_mm:.0f}mm.
    One hand's width of tape at the middle, +/- {GRIP_END} units ({GRIP_HALF_MM:.0f}mm).

    Cross-sections are exaggerated {CROSS_EXAGGERATION}x against length, applied EQUALLY to
    branch, knobs and tape. The bends are lengths, so they are not.

    Not straight, on purpose: the branch kinks a few degrees at every node,
    away from the bud, and carries a slow bow with a second bend in its
    young thin end. The line through its two ends is level and passes the
    hand, so the tips sit on the staff family's axis.

  Thumb end: the thick end, marked by the stub of the fork it was cut from.
  No marker bands. Nobody puts them on a found stick.

  Bark: one JPEG of the lit branch and fork, clipped to their outlines. It is
  the front half of the painting the 3D wraps round the model, lit from above.
  The outlines, cut faces, edge buds and tape stay vector.

  Color contract (packages/render-core/src/svg-color.ts, selective mode):
    Selective mode preserves a fill that is dark (luminance below 0.4) OR
    tinted (saturation above 0.05), and repaints everything else to the motion
    color.
      Asks for the motion color (neutral #B4B4B4): the tape, and nothing else.
      Stays wood (every fill tinted): buds and cut faces. The bark picture is
      an image, which no fill rewrite reaches. Bark is never blue or red.
    Every id is prefixed stk and gets suffixed per motion color when the loader
    inlines both props into one document. Nothing is <use>d: the loader's
    makeClassNamesUnique rewrites id= and url(#...) but not href=.
-->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SPAN} {VB_H:.0f}">
  <defs>
    <clipPath id="stkWood"><path d="{branch_d}"/><path d="{fork_d}"/></clipPath>
    <clipPath id="stkTape"><path d="{tape_d}"/></clipPath>

    <!-- Cloth grip tape wound in a spiral: a seam and a lit overlap edge per
         wrap. Strands over TRANSPARENCY, never over a base rect - the tape's
         color comes from the recolored fill underneath. -->
    <pattern id="stkWrap" width="{pitch}" height="{VB_H:.0f}" patternUnits="userSpaceOnUse" patternTransform="skewX(-24)">
      <path d="M0.4 0 V{VB_H:.0f}" stroke="#05070A" stroke-width="0.55" opacity="0.38"/>
      <path d="M1.1 0 V{VB_H:.0f}" stroke="#FFF8EC" stroke-width="0.4" opacity="0.22"/>
    </pattern>
    <pattern id="stkWeave" width="0.9" height="0.9" patternUnits="userSpaceOnUse">
      <path d="M0 0.45 h0.9" stroke="#05070A" stroke-width="0.18" opacity="0.14"/>
    </pattern>
    <linearGradient id="stkTapeShade" x1="0" y1="{tape_top}" x2="0" y2="{tape_bottom}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#05070A" stop-opacity="0.3"/>
      <stop offset="0.16" stop-color="#FFF8EC" stop-opacity="0.32"/>
      <stop offset="0.36" stop-color="#FFF8EC" stop-opacity="0.06"/>
      <stop offset="0.66" stop-color="#05070A" stop-opacity="0.26"/>
      <stop offset="1" stop-color="#05070A" stop-opacity="0.58"/>
    </linearGradient>
  </defs>

  <!-- The fork stub's outline goes UNDER the bark: the bark covers its inner
       half, and all of it where the stub is buried in the branch. -->
  <path d="{fork_d}" fill="none" stroke="#2E251D" stroke-width="0.6" opacity="0.6"/>
  <g clip-path="url(#stkWood)">
    <image href="data:image/jpeg;base64,{bark}" x="{fmt(bx)}" y="{fmt(by)}" width="{fmt(bw)}" height="{fmt(bh)}" preserveAspectRatio="none"/>
  </g>
  {fork_cap}

  <!-- Saw cuts: pale wood at both ends -->
  {pinky_cut}
  {thumb_cut}
  <path d="{branch_d}" fill="none" stroke="#2E251D" stroke-width="0.3" opacity="0.6"/>

  <!-- Buds on the crowns of the edge knobs -->
{self.edge_buds()}

  <!-- Grip tape over the middle: the one part that takes left or right -->
  <path d="{tape_d}" fill="#B4B4B4"/>
  <g clip-path="url(#stkTape)">
    <rect x="0" y="0" width="{SPAN}" height="{VB_H:.0f}" fill="url(#stkWeave)"/>
    <rect x="0" y="0" width="{SPAN}" height="{VB_H:.0f}" fill="url(#stkWrap)"/>
    <rect x="0" y="0" width="{SPAN}" height="{VB_H:.0f}" fill="url(#stkTapeShade)"/>
  </g>
  <path d="{tape_d}" fill="none" stroke="#05070A" stroke-width="0.4" opacity="0.55"/>
</svg>
"""

    def stations_json(self) -> dict:
        s = self.spec
        f = s.fork
        return {
            "svg": f"{s.svg}.svg",
            "glb": s.glb,
            "butt_d_mm": s.butt_d_mm,
            "tip_d_mm": s.tip_d_mm,
            # [axial mm from the pivot (+ = thumb end), diameter mm, centreline
            # offset toward the top side mm, centreline offset toward the face
            # side mm], every 2.5mm. Knobs are separate because they are
            # one-sided.
            "profile": self.profile(),
            "nodes": self.nodes_json(),
            "scars": self.scars_json(),
            "peels": self.peels_json(),
            "fork": {
                "y_mm": round(f.station * HALF_LENGTH_MM, 2),
                "side": f.side,
                "angle_deg": f.angle_deg,
                "length_mm": f.length_mm,
                "base_d_mm": f.base_d_mm,
                "tip_d_mm": f.tip_d_mm,
            },
            "pinky_cut_deg": s.pinky_cut_deg,
            "pinky_cut_long_side": s.pinky_cut_long_side,
            "thumb_cut_deg": s.thumb_cut_deg,
            "thumb_cut_long_side": s.thumb_cut_long_side,
            "bark_seed": s.bark_seed,
            "tone": s.tone,
        }


def main() -> None:
    sticks = {spec.hand: Stick(spec) for spec in STICKS}
    for stick in sticks.values():
        svg = stick.svg()
        targets = [f"static/images/props/pictograph/{stick.spec.svg}.svg"]
        if stick.spec.hand == "left":
            targets.append("static/images/props/buttons/stick.svg")
        for target in targets:
            out = pathlib.Path(target)
            out.write_text(svg, encoding="utf-8", newline="\n")
            print(f"wrote {out}  ({len(svg)} bytes)")
        top = min(stick.top_y(u) for u in stations(-1, 1))
        bottom = max(stick.bottom_y(u) for u in stations(-1, 1))
        print(f"  {stick.spec.hand}: branch y {top:.2f} -> {bottom:.2f}")

    stations_out = pathlib.Path("scripts/stick-stations.json")
    stations_out.write_text(
        json.dumps(
            {
                "_": "GENERATED by scripts/build-stick-svg.py. Do not edit.",
                "span_units": SPAN,
                "viewbox_height": VB_H,
                "units_per_mm": round(U_PER_MM, 6),
                "cross_exaggeration": CROSS_EXAGGERATION,
                "grip_end": GRIP_END,
                "tracked_tip": TRACKED_TIP,
                # The real props, in real millimetres, with no exaggeration
                # applied. 3D reads THESE; the unit stations above exist for
                # the drawing.
                "length_mm": HALF_LENGTH_MM * 2,
                "half_length_mm": HALF_LENGTH_MM,
                "side_angle_deg": SIDE_ANGLE_DEG,
                "node_sigma_mm": NODE_SIGMA_MM,
                "node_swell_mm": NODE_SWELL_MM,
                "grip_half_mm": GRIP_HALF_MM,
                "tape_mm": TAPE_MM,
                "tape_pitch_mm": TAPE_PITCH_MM,
                "tape_slant_mm": TAPE_SLANT_MM,
                "tracked_tip_mm": HALF_LENGTH_MM,
                "sticks": {hand: stick.stations_json() for hand, stick in sticks.items()},
            },
            indent=2,
        )
        + chr(10),
        encoding="utf-8",
    )
    print(f"wrote {stations_out}")


if __name__ == "__main__":
    main()

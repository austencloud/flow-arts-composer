"""Bark for the stick props, painted in a stick's own texture space.

Both renderings sample this one painting. The 3D model wraps it round the
branch: u runs round the stem, v along it. The pictograph drawing is the same
branch seen from its face, so it samples the front half of the same image and
lights it. The two can show different light, never different bark.

Read off the reference photograph (scripts/build-stick-svg.py names it):
  tone      warm grey-brown, about #9A8872 lit and #8E7863 in half shade, with
            browner and greyer patches a few centimetres long
  grain     a crust of fine grains under a millimetre across: dark in the
            crevices, pale on the bumps, gritty from arm's length
  lenticels faint pale dashes a few millimetres long running ROUND the stem
  streaks   faint lines along the stem
  buds      a dark bud on each knob's crown, ringed by a paler leaf scar
  scars     snapped side twigs leave a tan disc with a dark rim and a pith dot
  peel      where bark has rubbed off, orange-tan wood with a torn dark edge

numpy only, so it runs in Blender's Python as well as the system one.
"""

from __future__ import annotations

import math

import numpy as np

#: Texels round the stem and along it: about 4 per mm round a stem 66-100mm in
#: circumference and 4.5 per mm along 900mm. Square enough that a round grain
#: stays round, and fine enough that the grain is a texture up close, not a
#: mosaic of texels.
WIDTH = 256
HEIGHT = 4096


def srgb(hex_colour: str) -> np.ndarray:
    return np.array([int(hex_colour[i : i + 2], 16) / 255 for i in (1, 3, 5)])


def _noise(rng, sigma_v: float, sigma_u: float) -> np.ndarray:
    """Gaussian-filtered white noise, sigmas in texels, unit variance.
    Filtered in frequency space so it wraps round the stem without a seam."""
    white = rng.standard_normal((HEIGHT, WIDTH))
    fv = np.fft.fftfreq(HEIGHT)[:, None]
    fu = np.fft.fftfreq(WIDTH)[None, :]
    response = np.exp(-2 * np.pi**2 * ((sigma_v * fv) ** 2 + (sigma_u * fu) ** 2))
    field = np.real(np.fft.ifft2(np.fft.fft2(white) * response))
    field -= field.mean()
    return field / (field.std() + 1e-9)


def _smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def _mix(colour: np.ndarray, target: np.ndarray, amount: np.ndarray) -> np.ndarray:
    return colour * (1 - amount[..., None]) + target * amount[..., None]


class _Space:
    """Millimetre distances on the bark, per texel."""

    def __init__(self, stick: dict):
        self.length = stick["length_mm"]
        self.half = self.length / 2
        profile = stick["profile"]
        ys = [row[0] for row in profile]
        ds = [row[1] for row in profile]
        rows = np.arange(HEIGHT)
        #: y_mm (pivot-relative, + toward the thumb end) of each texel row
        self.y = (rows + 0.5) / HEIGHT * self.length - self.half
        self.radius = np.interp(self.y, ys, ds) / 2
        self.theta = (np.arange(WIDTH) + 0.5) / WIDTH * math.tau
        self.mm_per_row = self.length / HEIGHT
        self.sides = {k: math.radians(v) for k, v in stick["side_angle_deg"].items()}

    def row(self, y_mm: float) -> float:
        return (y_mm + self.half) / self.mm_per_row - 0.5

    def mm_per_column(self, y_mm: float) -> float:
        return math.tau * self.radius_at(y_mm) / WIDTH

    def radius_at(self, y_mm: float) -> float:
        i = int(np.clip(round(self.row(y_mm)), 0, HEIGHT - 1))
        return float(self.radius[i])

    def window(self, y_mm: float, theta: float, half_mm: float):
        """Row and column index arrays covering half_mm round a point, and
        each texel's offset from it in mm (along, around). Columns wrap."""
        r0 = int(math.floor(self.row(y_mm - half_mm)))
        r1 = int(math.ceil(self.row(y_mm + half_mm)))
        rows = np.arange(max(0, r0), min(HEIGHT, r1 + 1))
        mmc = self.mm_per_column(y_mm)
        c_centre = theta / math.tau * WIDTH - 0.5
        span = int(math.ceil(half_mm / mmc)) + 1
        cols = np.arange(int(math.floor(c_centre)) - span, int(math.ceil(c_centre)) + span + 1)
        along = (self.y[rows] - y_mm)[:, None]
        around = ((cols - c_centre) * mmc)[None, :]
        return rows, cols % WIDTH, along, around


def paint(stick: dict, seed: int, tone: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
    """Albedo, (HEIGHT, WIDTH, 3) sRGB in 0..1, and relief, (HEIGHT, WIDTH) in
    mm proud of the round stem. Row 0 is the pinky end; column 0 is the bottom
    side and columns run toward the face, as side_angle_deg describes.

    `tone` shifts the whole branch greyer (negative) or browner (positive) by a
    few percent: two sticks off the same tree, not two trees."""
    rng = np.random.default_rng(seed)
    space = _Space(stick)
    mm_row = space.mm_per_row
    mm_col = float(math.tau * space.radius.mean() / WIDTH)

    def noise(sigma_along_mm: float, sigma_around_mm: float) -> np.ndarray:
        return _noise(rng, sigma_along_mm / mm_row, sigma_around_mm / mm_col)

    # Tone: greyer and browner patches a few centimetres long.
    grey = srgb("#9C9286")
    brown = srgb("#9A876F")
    patches = noise(26.0, 7.0) * 0.8 + noise(9.0, 4.0) * 0.45
    mix = np.clip(0.5 + 0.3 * patches + tone, 0, 1)
    colour = grey * (1 - mix[..., None]) + brown * mix[..., None]

    # Value: broad blotches, and faint streaks along the stem.
    value = 1.0 + 0.07 * noise(6.0, 3.5) + 0.035 * noise(16.0, 0.5)
    colour *= value[..., None]

    # The grain. Bark this age is a crust of fine grains, not a smooth skin
    # with spots on it: the photo reads as grit at arm's length. A grain is
    # a fraction of a millimetre across, a crust bump a little under one, and
    # both are continuous fields, so up close they are a surface, never a
    # mosaic. Crevices between the bumps hold dirt and go dark; the bump tops
    # catch dust and go pale.
    crust = noise(0.5, 0.45)
    grit = noise(0.22, 0.2)
    colour *= (1 + 0.09 * crust + 0.08 * grit)[..., None]
    colour = _mix(colour, srgb("#4F443A"), 0.42 * _smoothstep(0.5, 2.0, -crust - 0.35 * grit))
    colour = _mix(colour, srgb("#C8BAA4"), 0.38 * _smoothstep(1.0, 2.3, 0.7 * crust + 0.6 * grit))
    # Dark specks, clumped the way lichen and soot collect.
    clump = np.clip(0.6 + 0.4 * noise(4.0, 3.0), 0, 1)
    colour = _mix(colour, srgb("#3A312A"), 0.5 * clump * _smoothstep(1.7, 2.7, noise(0.32, 0.3)))

    relief = 0.11 * crust + 0.035 * grit + 0.05 * noise(2.2, 1.6)

    # Lenticels: a few faint pale dashes round the stem, each with a shadow
    # on its lower lip because it stands a hair proud of the bark. On bark
    # this age they have mostly weathered into the grain.
    pale = srgb("#CDBFA8")
    area = space.length * float(math.tau * space.radius.mean())
    for _ in range(int(area / 110)):
        y = rng.uniform(-space.half + 4, space.half - 4)
        theta = rng.uniform(0, math.tau)
        length = rng.uniform(0.8, 2.4)
        rows, cols, along, around = space.window(y, theta, length)
        weight = np.exp(-((along / 0.26) ** 2) - (around / (length / 2)) ** 4)
        lip = np.exp(-(((along - 0.45) / 0.24) ** 2) - (around / (length / 2)) ** 4)
        strength = rng.uniform(0.2, 0.5)
        block = colour[np.ix_(rows, cols)]
        block = _mix(block, pale, strength * weight)
        block *= (1 - 0.18 * strength * lip)[..., None]
        colour[np.ix_(rows, cols)] = block
        relief[np.ix_(rows, cols)] += 0.05 * weight

    # Every node: a slight darkening round the stem where the collar wrinkles,
    # then the bud and the leaf scar it grew over.
    bud_colour = srgb("#3B2D22")
    leaf_scar = srgb("#BDA98D")
    for node in stick["nodes"]:
        y = node["y_mm"]
        theta = space.sides[node["side"]]
        collar = np.exp(-(((space.y - y) / 5.0) ** 2))
        colour *= (1 - 0.07 * collar)[:, None, None]
        rows, cols, along, around = space.window(y, theta, 6.0)
        ring = np.hypot(along / 1.8, around / 1.5)
        block = colour[np.ix_(rows, cols)]
        # the leaf scar sits on the thumb side of the bud: the thumb end is the
        # older wood, and a bud forms above the leaf that fed it
        scar = np.hypot((along - 2.2) / 1.9, around / 3.0)
        block = _mix(block, leaf_scar, 0.7 * _smoothstep(1.0, 0.65, scar))
        block = _mix(block, bud_colour, 0.95 * _smoothstep(1.0, 0.75, ring))
        block = _mix(block, srgb("#6B5240"), 0.5 * _smoothstep(1.35, 1.05, ring) * _smoothstep(0.75, 1.0, ring))
        colour[np.ix_(rows, cols)] = block

    # Snapped twigs: a tan disc of wood flush with the bark, a dark rim of
    # bark round it, one faint ring and the pith.
    for scar in stick["scars"]:
        y = scar["y_mm"]
        theta = space.sides[scar["side"]]
        r = scar["disc_mm"] / 2
        rows, cols, along, around = space.window(y, theta, r * 1.5)
        angle = np.arctan2(along, around)
        ragged = 1 + sum(
            rng.uniform(0.015, 0.05) / math.sqrt(k) * np.sin(k * angle + rng.uniform(0, math.tau))
            for k in range(2, 7)
        )
        d = np.hypot(along, around) / (r * ragged)
        block = colour[np.ix_(rows, cols)]
        wood = _mix(
            np.broadcast_to(srgb("#B08D66"), block.shape).copy(),
            srgb("#8C6845"),
            np.clip(d, 0, 1),
        )
        block = _mix(block, srgb("#4E3D30"), 0.8 * _smoothstep(1.3, 1.02, d))
        block = _mix(block, wood, _smoothstep(1.0, 0.9, d))
        block = _mix(block, srgb("#9C7148"), 0.35 * np.exp(-(((d - 0.55) / 0.06) ** 2)))
        block = _mix(block, srgb("#6E4E31"), _smoothstep(0.2, 0.12, d))
        colour[np.ix_(rows, cols)] = block
        # sawn-smooth wood where the twig broke off: no grain on the disc
        inside = _smoothstep(1.0, 0.85, d)
        lip = np.exp(-(((d - 1.12) / 0.12) ** 2))
        relief[np.ix_(rows, cols)] = relief[np.ix_(rows, cols)] * (1 - 0.85 * inside) - 0.25 * inside + 0.3 * lip

    # Rubbed bark: the patch where bark wore through to the wood. Longer than
    # it is wide because bark tears along the grain, with a ragged edge of
    # torn bark round weathered wood.
    for peel in stick.get("peels", []):
        y = peel["y_mm"]
        theta = space.sides[peel["side"]]
        half_length, half_width = peel["length_mm"] / 2, peel["width_mm"] / 2
        rows, cols, along, around = space.window(y, theta, half_length * 1.3)
        angle = np.arctan2(along / half_length, around / half_width)
        jag = 1 + sum(
            rng.uniform(0.04, 0.1) / math.sqrt(k) * np.sin(k * angle + rng.uniform(0, math.tau))
            for k in (2, 3, 5, 8, 13)
        )
        d = np.hypot(along / half_length, around / half_width) / jag
        block = colour[np.ix_(rows, cols)]
        block = _mix(block, srgb("#4E3C2E"), 0.75 * _smoothstep(1.2, 1.0, d))
        # the wood shows fibres along the stem
        fibres = np.clip(0.45 + 0.25 * np.sin(around * 3.1 + seed) + 0.15 * grit[np.ix_(rows, cols)], 0, 1)
        wood = _mix(np.broadcast_to(srgb("#B08A62"), block.shape).copy(), srgb("#8E6B48"), fibres)
        inside = _smoothstep(1.0, 0.88, d)
        block = _mix(block, wood, inside)
        colour[np.ix_(rows, cols)] = block
        relief[np.ix_(rows, cols)] = relief[np.ix_(rows, cols)] * (1 - 0.6 * inside) - 0.3 * inside

    # Handled ends go a shade darker, the last centimetre or two.
    end = np.minimum(space.y + space.half, space.half - space.y)
    colour *= (1 - 0.1 * np.exp(-end / 12.0))[:, None, None]

    return np.clip(colour, 0, 1), relief

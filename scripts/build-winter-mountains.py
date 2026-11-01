"""Replace Blue Hour Lodge's three ridges with eroded alpine ranges and a far ring.

Run from the repository root:

  & 'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe' --background --factory-startup --threads 8 --python scripts/build-winter-mountains.py
  node scripts/optimize-winter-bluehour.mjs

The script opens the committed venue source, removes every object whose
bluehourRole is "mountain", generates new meshes, saves the .blend, writes the
heightfields the Unreal port rebuilds from, and runs the shared exporter. It is
deterministic: the same source produces the same mountains.

Geometry only. The runtime material (winter-mountain-material.ts) owns snow,
rock, rim light and aerial perspective. Each vertex carries three baked terrain
signals in a color attribute (exported as COLOR_0), which the shader reads as data:
  r = small-scale convexity (0 gully or couloir, 0.5 plane, 1 rib or crest)
  g = large-scale exposure (0 sheltered hollow, 1 exposed spur or summit)
  b = scree, where the erosion pass deposited material at the foot of a face
"""
from pathlib import Path
import json
import math
import os
import runpy
import struct
import zlib

import bpy
import numpy as np
from mathutils import Vector
from mathutils import noise

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "blender/winter/blue-hour-lodge.blend"
HEIGHTFIELDS = ROOT / "blender/winter/mountain-heightfields"
EXPORTER = ROOT / "scripts/blender-export-winter-bluehour.py"
NEAR_MATERIAL = "Alpine massif rock"
FAR_MATERIAL = "Distant blue range"
BASIS = "PERLIN_ORIGINAL"


# --- Basin reference -------------------------------------------------------
def terrain_z(x, y):
    """Vectorised copy of build-winter-bluehour.py's basin, extrapolated."""
    d = np.hypot(x, y)
    clear = np.clip((d - 8.7) / 12, 0, 1)
    waves = 0.9 + 0.75 * np.sin(x * 0.074 + y * 0.025) + 0.6 * np.cos(y * 0.113 - x * 0.016)
    foothills = np.maximum(0, (np.abs(x) - 35) / 45) ** 1.4 * 3 + np.maximum(0, (y - 35) / 60) * 5
    return clear * (waves + foothills)


def floor_z(x, y):
    """Ground the ranges stand on: the basin inside its square, capped outside."""
    return np.minimum(terrain_z(x, y), 22.0)


# --- Small numeric helpers -------------------------------------------------
def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def sample(fn, xs, ys):
    out = np.empty(xs.shape, dtype=np.float64)
    flat_x, flat_y, flat_o = xs.ravel(), ys.ravel(), out.ravel()
    for i in range(flat_x.size):
        flat_o[i] = fn(float(flat_x[i]), float(flat_y[i]))
    return out


def sample3(fn, us, vs, ws):
    out = np.empty(us.shape, dtype=np.float64)
    flat_u, flat_v, flat_w, flat_o = us.ravel(), vs.ravel(), ws.ravel(), out.ravel()
    for i in range(flat_u.size):
        flat_o[i] = fn(float(flat_u[i]), float(flat_v[i]), float(flat_w[i]))
    return out


def normalise(a, lo_pct=2, hi_pct=98):
    lo, hi = np.percentile(a, lo_pct), np.percentile(a, hi_pct)
    return np.clip((a - lo) / max(hi - lo, 1e-6), 0, 1)


def blur(a, sigma):
    """Separable Gaussian blur with edge padding."""
    radius = max(1, int(math.ceil(sigma * 3)))
    k = np.exp(-0.5 * (np.arange(-radius, radius + 1) / sigma) ** 2)
    k /= k.sum()
    p = np.pad(a, ((0, 0), (radius, radius)), mode="edge")
    a = np.apply_along_axis(lambda r: np.convolve(r, k, mode="valid"), 1, p)
    p = np.pad(a, ((radius, radius), (0, 0)), mode="edge")
    return np.apply_along_axis(lambda c: np.convolve(c, k, mode="valid"), 0, p)


def thermal_erode(h, cell, iterations, talus_low, talus_high, rate=0.5):
    """Move material downhill wherever a slope exceeds its talus angle.

    The talus angle rises with altitude, so the lower slopes relax into scree
    aprons while upper faces and crests keep their steep, sharp rock.
    """
    rows, cols = h.shape
    offsets = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    for _ in range(iterations):
        hn = np.clip(h / max(h.max(), 1e-6), 0, 1)
        tan_talus = np.tan(np.radians(talus_low + (talus_high - talus_low) * hn ** 1.5))
        padded = np.pad(h, 1, mode="edge")
        excess = []
        for dy, dx in offsets:
            neighbour = padded[1 + dy:1 + dy + rows, 1 + dx:1 + dx + cols]
            e = h - neighbour - tan_talus * cell * math.hypot(dx, dy)
            excess.append(np.maximum(e, 0))
        total = np.sum(excess, axis=0)
        moved = rate * 0.5 * np.max(excess, axis=0)
        gained = np.zeros_like(padded)
        safe_total = np.where(total > 0, total, 1)
        for (dy, dx), e in zip(offsets, excess):
            share = moved * e / safe_total
            gained[1 + dy:1 + dy + rows, 1 + dx:1 + dx + cols] += share
        h = h - moved + gained[1:-1, 1:-1]
    return h


def terrain_signals(h, cell, gain=(1.1, 7.0)):
    """Bake convexity (ribs vs couloirs) and exposure (spurs vs hollows).

    `gain` sets the tanh scales in metres; smaller values give harder contrast,
    so the material can split rock from snow more decisively.
    """
    small = h - blur(h, max(1.0, 2.4 / cell * 1.5))
    large = h - blur(h, max(2.0, 18.0 / cell))
    convexity = 0.5 + 0.5 * np.tanh(small / gain[0])
    exposure = 0.5 + 0.5 * np.tanh(large / gain[1])
    return convexity, exposure


# --- Mountain forms --------------------------------------------------------
def lobe_height(x, y, lobe):
    """Pyramidal summit: polygonal distance gives faces and aretes."""
    cx, cy, height, radius, sides, aim_deg, power = lobe[:7]
    # Optional east-west stretch turns a point summit into a short summit
    # ridge, so the top reads as part of a massif.
    stretch = lobe[7] if len(lobe) > 7 else 1.0
    dx, dy = (x - cx) / stretch, y - cy
    aim = math.radians(aim_deg)
    poly = np.full(x.shape, -1e9)
    for k in range(sides):
        # Face normals sit between aretes; one arete points along `aim`.
        a = aim + (k + 0.5) * 2 * math.pi / sides
        poly = np.maximum(poly, dx * math.cos(a) + dy * math.sin(a))
    poly /= math.cos(math.pi / sides)
    dist = 0.62 * poly + 0.38 * np.hypot(dx, dy)
    return height * np.clip(1 - dist / radius, 0, 1) ** power


def range_heights(spec, X, Y):
    seed = spec["seed"]
    warp_x = sample(lambda x, y: noise.noise(Vector((x * 0.011, y * 0.011, seed)), noise_basis=BASIS), X, Y)
    warp_y = sample(lambda x, y: noise.noise(Vector((x * 0.011 + 31.7, y * 0.011, seed + 5)), noise_basis=BASIS), X, Y)
    Xw, Yw = X + warp_x * 11, Y + warp_y * 9

    crest = spec["crest_y"] + 7 * np.sin(Xw * 0.021 + seed) + 3.5 * np.sin(Xw * 0.057 + 2 * seed)
    toward = np.sign(spec["basin_side"])
    front_edge, back_edge = (spec["y0"], spec["y1"]) if toward < 0 else (spec["y1"], spec["y0"])
    front_span = np.abs(crest - front_edge)
    back_span = np.abs(back_edge - crest)
    on_front = (Yw - crest) * toward > 0
    across = np.where(on_front, np.abs(Yw - crest) / front_span, np.abs(Yw - crest) / back_span)
    crest_height = spec["spine"] * (0.62 + 0.38 * normalise(
        sample(lambda x, y: noise.noise(Vector((x * 0.017, 4.2, seed)), noise_basis=BASIS), Xw, Yw)))
    for col_x, col_width, col_depth in spec.get("cols", []):
        crest_height *= 1 - col_depth * np.exp(-((Xw - col_x) / col_width) ** 2)
    # Rhythm along the crest: peaks gather in groups of two or three and the
    # spine sinks to long saddles between groups instead of repeating evenly.
    if "groups" in spec:
        floor, groups = spec["groups"]
        rise = np.max(np.stack([np.exp(-((Xw - gx) / gw) ** 2) for gx, gw in groups]), axis=0)
        crest_height *= floor + (1 - floor) * rise
    spine = crest_height * np.clip(1 - across, 0, 1) ** 1.7
    lobe_fields = np.stack([lobe_height(Xw, Yw, lobe) for lobe in spec["lobes"]])
    owner = np.argmax(lobe_fields, axis=0)
    lobes = np.max(lobe_fields, axis=0)

    # Ridged noise stretched across the range so ribs and couloirs run downhill.
    # It serrates the spine into aretes and only ribs the summit faces, so each
    # summit keeps its pyramid.
    ridged = normalise(sample(lambda x, y: noise.ridged_multi_fractal(
        Vector((x * 0.03, y * 0.011, seed * 1.7)), 0.92, 2.05, 6, 1.0, 2.1, noise_basis=BASIS), Xw, Yw))
    hetero = normalise(sample(lambda x, y: noise.hetero_terrain(
        Vector((x * 0.05, y * 0.05, seed * 2.3)), 0.8, 2.0, 4, 0.4, noise_basis=BASIS), Xw, Yw))
    # Spurs: ridged noise stretched across the range so the lower slopes carry
    # rock ribs running downhill instead of round lumps.
    spurs = normalise(sample(lambda x, y: noise.ridged_multi_fractal(
        Vector((x * 0.07, y * 0.016, seed * 4.1)), 0.9, 2.1, 3, 1.0, 2.0, noise_basis=BASIS), Xw, Yw))
    base = np.maximum(spine, lobes)
    relief = base / max(base.max(), 1e-6)
    h = np.maximum(spine * (0.45 + 0.8 * ridged ** 1.3), lobes * (0.82 + 0.3 * ridged))

    # Couloirs follow the fall line: radial around the summit that owns a
    # point, across the spine elsewhere. Ribs keep their height, the gullies
    # between them are cut back; the tip and the foot are left alone.
    centres = np.array([(lobe[0], lobe[1]) for lobe in spec["lobes"]])
    angle = np.arctan2(Yw - centres[owner, 1], Xw - centres[owner, 0])
    radius = np.hypot(Xw - centres[owner, 0], Yw - centres[owner, 1])
    on_summit = lobes >= spine
    cu = np.where(on_summit, np.cos(angle) * 2.4 + owner * 11.0, Xw * 0.05)
    cv = np.where(on_summit, np.sin(angle) * 2.4, Yw * 0.004)
    cw = np.where(on_summit, radius * 0.018, Yw * 0.012)
    gullies = normalise(sample3(lambda u, v, w: noise.ridged_multi_fractal(
        Vector((u, v, w + seed * 3.3)), 0.9, 2.1, 4, 1.0, 2.0, noise_basis=BASIS), cu, cv, cw))
    face = smoothstep(0.06, 0.3, relief) * (1 - smoothstep(0.82, 1.0, relief))
    h = h * (1 - 0.24 * (1 - gullies) ** 2 * face)
    h = h + (hetero - 0.5) * 1.2 * relief + (spurs - 0.5) * 5.0 * np.sqrt(relief)
    # Optional extra high-frequency ridged octave (low lacunarity, squared so
    # its folds stay knife-edged): serrates crests and breaks faces into
    # angular facets at the 30 to 80 m a basin viewer sees them from.
    if "sharp" in spec:
        sharp = normalise(sample(lambda x, y: noise.ridged_multi_fractal(
            Vector((x * 0.085, y * 0.034, seed * 5.9)), 1.0, 1.7, 3, 1.0, 2.2, noise_basis=BASIS), Xw, Yw))
        h = h + (sharp ** 2 - 0.33) * spec["sharp"] * smoothstep(0.12, 0.55, relief)

    # Blend into the basin over the last 20 m instead of a flat cut line.
    mask = (smoothstep(spec["y0"], spec["y0"] + 22, Y) * smoothstep(spec["y1"], spec["y1"] - 22, Y)
            * smoothstep(spec["x0"], spec["x0"] + 36, X) * smoothstep(spec["x1"], spec["x1"] - 36, X))
    h = np.maximum(h * mask, 0)
    carved = h.copy()
    # Faces top out around 50 to 55 degrees so summits read as rock pyramids
    # on a massif rather than needles.
    h = thermal_erode(h, spec["cell"], spec["erosion"], spec.get("talus_low", 36.0), spec.get("talus", 56.0))
    scree = smoothstep(0.25, 2.5, h - carved)
    border = (smoothstep(spec["y0"], spec["y0"] + 4, Y) * smoothstep(spec["y1"], spec["y1"] - 4, Y)
              * smoothstep(spec["x0"], spec["x0"] + 4, X) * smoothstep(spec["x1"], spec["x1"] - 4, X))
    return h * border, scree


NEAR_RANGES = [
    {
        # In front of the massif, behind the lodge: serrated, lower, with a
        # low col so the summit behind it stays dominant from the hero view.
        "name": "front-aretes", "seed": 3.1, "x0": -210, "x1": 210, "y0": 73, "y1": 146,
        "crest_y": 112, "basin_side": -1, "spine": 28, "cell": 1.25, "erosion": 90,
        # Seen from 30 to 80 m: a sharp ridged octave, harder thermal erosion
        # so steep faces settle into planar rock over talus aprons, and harder
        # baked signals so the material splits rock from snow cleanly.
        "sharp": 7.0, "talus_low": 33.0, "talus": 50.0, "signal_gain": (0.55, 3.5),
        "groups": (0.3, [(-160, 38), (-22, 30), (84, 34), (170, 26)]),
        "lobes": [
            (92, 114, 30, 32, 3, -70, 1.15),
            (-166, 110, 33, 34, 4, -80, 1.15),
            (-18, 116, 26, 28, 3, -95, 1.15),
            (166, 118, 25, 28, 3, -60, 1.15),
        ],
    },
    {
        # The massif: one dominant four-faced summit with aretes either side.
        "name": "summit-massif", "seed": 7.9, "x0": -210, "x1": 210, "y0": 138, "y1": 272,
        "crest_y": 198, "basin_side": -1, "spine": 38, "cell": 1.3, "erosion": 52,
        "cols": [(-40, 24, 0.35), (110, 34, 0.35)],
        "lobes": [
            # Main summit, a secondary peak to the east and a broad western
            # shoulder, with saddles between them: one massif, not a needle.
            (-114, 204, 61, 60, 4, -58, 1.1, 1.3),
            (-70, 214, 49, 46, 3, -85, 1.1),
            (-158, 200, 41, 50, 4, -100, 0.85, 1.25),
            (-14, 192, 36, 40, 3, -80, 1.15),
            (54, 206, 40, 44, 4, -75, 1.15),
            (152, 194, 34, 38, 3, -60, 1.15),
        ],
    },
    {
        # Across the tarn behind the arrival path, lit by the moon, and the
        # first thing the product camera sees from the stage. A broad
        # serrated wall with three summits, aretes and couloirs between them,
        # and a lower foreground shoulder so the wall has depth.
        "name": "south-range", "seed": 12.4, "x0": -210, "x1": 210, "y0": -210, "y1": -104,
        "crest_y": -158, "basin_side": 1, "spine": 36, "cell": 1.25, "erosion": 80,
        "sharp": 6.0, "talus_low": 34.0, "talus": 53.0, "signal_gain": (0.6, 4.0),
        "groups": (0.45, [(-150, 46), (-30, 52), (95, 46), (185, 30)]),
        "cols": [(-92, 22, 0.25), (38, 20, 0.22), (150, 22, 0.25)],
        "lobes": [
            # Three summits along the wall, the middle one highest.
            (-34, -166, 50, 54, 4, 100, 1.1, 1.35),
            (96, -170, 45, 50, 4, 112, 1.1, 1.25),
            (-142, -164, 42, 48, 3, 80, 1.1, 1.3),
            # Lesser tops so the wall stays serrated at its ends.
            (14, -160, 38, 34, 3, 95, 1.15),
            (-186, -170, 32, 40, 4, 70, 1.15),
            (176, -162, 33, 38, 3, 120, 1.15),
            # Foreground shoulder: low, broad, in front of the summits.
            (-60, -126, 19, 40, 4, 90, 0.95, 1.7),
            (128, -128, 16, 34, 3, 100, 0.95, 1.5),
        ],
    },
]

FAR_RING = {
    "name": "far-ring", "seed": 21.7, "segments": 312,
    "radii": [175, 200, 225, 250, 270, 285, 298, 310, 320, 330, 340, 350, 360, 371, 384, 397, 410],
}


def far_ring_heights(R, T):
    seed = FAR_RING["seed"]
    X, Y = R * np.sin(T), R * np.cos(T)
    # Low where the near ranges already fill the view (north and south), tall
    # to the east and west where the far ring is the only skyline, and lowest
    # behind the hero massif so its summit stays dominant.
    behind_massif = np.exp(-((((T + math.radians(30)) + math.pi) % (2 * math.pi) - math.pi) / math.radians(48)) ** 2)
    azimuth = normalise(sample(lambda x, y: noise.noise(Vector((x * 0.0042, y * 0.0042, seed)), noise_basis=BASIS), X, Y), 0, 100)
    envelope = (42 + 38 * azimuth) * (1 - 0.42 * np.cos(T) ** 2) * (1 - 0.25 * behind_massif)
    crest_r = 338 + 22 * sample(lambda x, y: noise.noise(Vector((x * 0.006, y * 0.006, seed + 3)), noise_basis=BASIS), X, Y)
    profile = smoothstep(250, crest_r, R) * (1 - 0.35 * smoothstep(crest_r, 412, R))
    ridged = normalise(sample(lambda x, y: noise.ridged_multi_fractal(
        Vector((x * 0.019, y * 0.019, seed)), 0.95, 2.1, 6, 1.0, 2.0, noise_basis=BASIS), X, Y))
    h = envelope * profile * (0.35 + 0.8 * ridged ** 1.5)
    return X, Y, h


# --- Mesh and file output ---------------------------------------------------
def build_mesh(name, coords, faces, signals, material):
    data = bpy.data.meshes.new(name)
    data.from_pydata([tuple(c) for c in coords], [], faces)
    data.update()
    data.shade_smooth()
    # Exported as COLOR_0 (the exporter writes every color attribute and the
    # optimizer keeps COLOR_0); the runtime material reads it as terrain data.
    layer = data.color_attributes.new(name="TerrainSignals", type="FLOAT_COLOR", domain="POINT")
    rgba = np.concatenate([signals, np.ones((signals.shape[0], 1))], axis=1)
    layer.data.foreach_set("color", rgba.ravel().astype(np.float32))
    data.materials.append(material)
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj["bluehourRole"] = "mountain"
    return obj


def grid_faces(rows, cols, wrap=False):
    faces = []
    span = cols if wrap else cols - 1
    for j in range(rows - 1):
        for i in range(span):
            a = j * cols + i
            b = j * cols + (i + 1) % cols
            faces.append((a, b, b + cols, a + cols))
    return faces


def write_png16(path, values):
    rows, cols = values.shape
    raw = b"".join(b"\x00" + row.astype(">u2").tobytes() for row in values)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", cols, rows, 16, 0, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def encode_heights(z):
    lo, hi = float(z.min()), float(z.max())
    return np.round((z - lo) / max(hi - lo, 1e-6) * 65535).astype(np.uint16), lo, hi


# --- Run -------------------------------------------------------------------
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
for obj in [o for o in bpy.data.objects if o.get("bluehourRole") == "mountain"]:
    mesh = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if mesh.users == 0:
        bpy.data.meshes.remove(mesh)

def signal_material(name, preview_color, roughness):
    """A material whose base color reads TerrainSignals.

    The glTF exporter writes a color attribute only when a material uses it, so
    the signals ride out as COLOR_0. The runtime replaces the shading entirely;
    the preview color only matters inside Blender's solid view.
    """
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (*preview_color, 1)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    # Distinct factors also stop the optimizer deduplicating the two materials.
    bsdf.inputs["Roughness"].default_value = roughness
    attribute = nodes.get("Terrain signals") or nodes.new("ShaderNodeVertexColor")
    attribute.name = "Terrain signals"
    attribute.layer_name = "TerrainSignals"
    links.new(attribute.outputs["Color"], bsdf.inputs["Base Color"])
    return material


# Separate materials (not the lodge's shared granite) so the runtime patch
# never reaches the lodge plinth and benches, and so the exporter keeps the
# near ranges and the far ring as two meshes.
near_material = signal_material(NEAR_MATERIAL, (0.26, 0.32, 0.38), 0.95)
far_material = signal_material(FAR_MATERIAL, (0.47, 0.53, 0.66), 1.0)

HEIGHTFIELDS.mkdir(parents=True, exist_ok=True)
manifest = {
    "description": "Blue Hour Lodge mountains. Heights are Blender metres (Z up); "
                   "Blender X maps to Three X and Blender Y to Three -Z. Pixel row 0 is the "
                   "largest Y (north, away from the hero camera for the near ranges).",
    "generator": "scripts/build-winter-mountains.py",
    "encoding": "16-bit grayscale PNG; height = minHeight + value / 65535 * (maxHeight - minHeight)",
    "ranges": [],
}
stats = []

for spec in NEAR_RANGES:
    cell = spec["cell"]
    cols = int(round((spec["x1"] - spec["x0"]) / cell)) + 1
    rows = int(round((spec["y1"] - spec["y0"]) / cell)) + 1
    xs = np.linspace(spec["x0"], spec["x1"], cols)
    ys = np.linspace(spec["y0"], spec["y1"], rows)
    X, Y = np.meshgrid(xs, ys)
    h, scree = range_heights(spec, X, Y)
    z = floor_z(X, Y) - 2.5 + h
    convexity, exposure = terrain_signals(h, cell, spec.get("signal_gain", (1.1, 7.0)))
    coords = np.stack([X.ravel(), Y.ravel(), z.ravel()], axis=1)
    signals = np.stack([convexity.ravel(), exposure.ravel(), scree.ravel()], axis=1)
    build_mesh(f"Alpine range {spec['name']}", coords, grid_faces(rows, cols), signals, near_material)
    encoded, lo, hi = encode_heights(z[::-1])
    write_png16(HEIGHTFIELDS / f"{spec['name']}.png", encoded)
    manifest["ranges"].append({
        "name": spec["name"], "file": f"{spec['name']}.png", "layout": "cartesian",
        "center": [(spec["x0"] + spec["x1"]) / 2, (spec["y0"] + spec["y1"]) / 2],
        "size": [spec["x1"] - spec["x0"], spec["y1"] - spec["y0"]], "pixels": [cols, rows],
        "minHeight": round(lo, 4), "maxHeight": round(hi, 4), "rotationDegrees": 0,
        "material": NEAR_MATERIAL,
    })
    gy, gx = np.gradient(z, cell)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    mountain = h > 4
    stats.append((spec["name"], (rows - 1) * (cols - 1) * 2, round(float(h.max()), 1),
                  round(float((slope[mountain] > 45).mean()), 3), round(float((slope[mountain] > 55).mean()), 3)))

segments = FAR_RING["segments"]
radii = np.array(FAR_RING["radii"], dtype=np.float64)
thetas = np.arange(segments) * (2 * math.pi / segments)
T, R = np.meshgrid(thetas, radii)
X, Y, h = far_ring_heights(R, T)
z = floor_z(X, Y) - 1.2 + h
convexity, exposure = terrain_signals(h, 9.0)
coords = np.stack([X.ravel(), Y.ravel(), z.ravel()], axis=1)
signals = np.stack([convexity.ravel(), exposure.ravel(), np.zeros(convexity.size)], axis=1)
build_mesh("Alpine far ring", coords, grid_faces(len(radii), segments, wrap=True), signals, far_material)
encoded, lo, hi = encode_heights(z)
write_png16(HEIGHTFIELDS / "far-ring.png", encoded)
manifest["ranges"].append({
    "name": "far-ring", "file": "far-ring.png", "layout": "polar",
    "center": [0, 0], "pixels": [segments, len(radii)],
    "columns": "theta = column / columns * 360 degrees, measured from Blender +Y toward +X",
    "rows": "radius in metres per row", "radii": FAR_RING["radii"],
    "minHeight": round(lo, 4), "maxHeight": round(hi, 4), "material": FAR_MATERIAL,
})
stats.append(("far-ring", (len(radii) - 1) * segments * 2, round(float(h.max()), 1)))
(HEIGHTFIELDS / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

bpy.ops.wm.save_mainfile(filepath=str(SOURCE))
print("MOUNTAINS", json.dumps(stats), flush=True)
if os.environ.get("WINTER_MOUNTAINS_SKIP_EXPORT") != "1":
    runpy.run_path(str(EXPORTER))

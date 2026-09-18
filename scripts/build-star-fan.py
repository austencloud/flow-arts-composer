"""Build the Renegade star fan's 2D artwork and Blender GLB from one reference.

blender --background --factory-startup --python scripts/build-star-fan.py
The vendor photograph is a visual reference only; the shipped assets are authored here.
"""
import importlib.util
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("fan_builder", ROOT / "scripts/build-fan-model.py")
fan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fan)
reference_path = ROOT / "scripts/assets/star-fire-reference.json"
ref = json.loads(reference_path.read_text())

HUB = ref["hub_m"]


def polar(center, radius, degrees):
    angle = math.radians(degrees)
    return [center[0] + radius * math.cos(angle), center[1] + radius * math.sin(angle)]


def geometry():
    """Return (rails, rings) in metres from the manipulation ring's centre; +Y is the fan's reach."""
    wire = ref["frame_wire_radius_m"]
    rails = []
    # Each spoke runs from the hub weld into the middle of its rolled wick.
    for center in ref["wick_centers_m"]:
        rails.append(([HUB, center], wire))
    # Every fold is one bent wire from wick end to wick end (or a single wick end
    # for the two folds under the horizontal spokes) plus a brace back to the hub.
    # Lattice wires stop a few millimetres inside the roll like the spokes do.
    inset = 0.006
    for fold in ref["folds_m"]:
        point = fold["point"]
        ends = []
        for index in fold["spokes"]:
            base = ref["wick_bases_m"][index]
            direction = ref["wick_directions"][index]
            ends.append([b + d * inset for b, d in zip(base, direction)])
        rails.append(([ends[0], point, *ends[1:]], wire))
        rails.append(([HUB, point], wire))
    ring = ref["ring_m"]
    tube = ref["ring_tube_radius_m"]
    center = ring["center"]
    outer_mean = ring["outer_radius"] - tube
    inner_mean = ring["inner_ring_outer_radius"] - tube
    # Two short legs carry the hub weld down onto the manipulation ring.
    for degrees in ring["hub_leg_angles_deg"]:
        rails.append(([HUB, polar(center, outer_mean, degrees)], wire))
    # Three V links hold the inner spinning ring inside the manipulation ring.
    for degrees in ring["link_angles_deg"]:
        apex = polar(center, inner_mean, degrees)
        for sign in (-1, 1):
            foot = polar(center, outer_mean, degrees + sign * ring["link_half_spread_deg"])
            rails.append(([apex, foot], wire))
    rings = [
        (center, outer_mean - tube, tube),
        (center, inner_mean - tube, tube),
    ]
    return rails, rings


def write_svg(rails, rings):
    # Physical +Y becomes the notation's rightward reach, about its hand pivot.
    # 23.5 inches of span is wider than the shared 260 x 207 fan box allows at
    # the DoodleGrip's 417.3 px/m, so the star fits the box the way Moon does.
    scale = ref["svg_scale_px_per_m"]
    def point(p):
        return f"{130+p[1]*scale:.4f},{103.5+p[0]*scale:.4f}"
    frame = []
    for points, radius in rails:
        frame.append(f'<polyline points="{" ".join(point(p) for p in points)}" stroke-width="{2*radius*scale:.4f}"/>')
    for center, inside, tube in rings:
        x, y = point(center).split(',')
        frame.append(f'<circle cx="{x}" cy="{y}" r="{(inside+tube)*scale:.4f}" stroke-width="{2*tube*scale:.4f}"/>')
    wicks = []
    for index, (center, direction) in enumerate(zip(ref["wick_centers_m"], ref["wick_directions"])):
        angle = math.degrees(math.atan2(direction[0], direction[1]))
        length, radius = ref["wick_length_m"]*scale, ref["wick_radius_m"]*scale
        wicks.append(f'<rect data-star-wick="{index+1}" x="{-length/2:.4f}" y="{-radius:.4f}" width="{length:.4f}" height="{2*radius:.4f}" rx="0.7" transform="translate({point(center)}) rotate({angle:.4f})"/>')
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 207" data-generated-from="scripts/assets/star-fire-reference.json">\n'
    svg += '<title>Renegade star fire fan</title>\n<g data-fan-frame="" fill="none" stroke="#2E3192" stroke-linecap="round" stroke-linejoin="round">\n'
    svg += '\n'.join(frame) + '\n</g>\n<g data-fan-wicks="" fill="#f5e6b8">\n'
    svg += '\n'.join(wicks) + '\n</g>\n</svg>\n'
    (ROOT / "static/images/props/appearances/fan-star.svg").write_text(svg, newline="\n")


def main():
    fan.reset_scene()
    root = fan.add_empty("TKA_Fan")
    group = fan.add_empty("Fan_Star", root)
    group["tka_source"] = ref["source"]
    group["tka_published_dimensions_m"] = ref["published_dimensions_m"]
    group["tka_ring_outside_diameter_m"] = 2*ref["ring_m"]["outer_radius"]
    group["tka_wick_centers_m"] = [[x,y,0] for x,y in ref["wick_centers_m"]]
    steel = fan.make_material("TKA_Fan_Star_Steel", (0.012, 0.013, 0.014, 1), roughness=0.38, metallic=0.55, coat=0.35)
    ring_steel = fan.make_material("TKA_Fan_Star_Ring", (0.012, 0.013, 0.014, 1), roughness=0.3, metallic=0.6, coat=0.45)
    wick = fan.make_woven_wick_material("TKA_Fan_Star_Wick")
    rails, rings = geometry()
    objects = []
    for index, (points, radius) in enumerate(rails):
        objects.append(fan.add_round_rod(f"Fan_Star_Rail_{index}", [(x,y,0) for x,y in points], radius, steel, group))
    for index, (center, inside, tube) in enumerate(rings):
        objects.append(fan.add_torus(f"Fan_Star_Ring_{index}", (*center,0), inside, tube, tube*2, ring_steel, group))
    for index, (center, direction) in enumerate(zip(ref["wick_centers_m"], ref["wick_directions"])):
        c, d = Vector((*center,0)), Vector((*direction,0))
        half = ref["wick_length_m"] / 2
        objects.append(fan.add_woven_cylinder_between(f"Fan_Star_Wick_{index+1}", c-d*half, c+d*half, ref["wick_radius_m"], wick, group, radial_segments=40, axial_segments=28))
    objects.append(fan.add_weld_boss("Fan_Star_Weld_Hub", (*HUB, 0), (.006, .006, .0035), 0, steel, group))
    fan.export_glb(ROOT / "static/models/props/fan-star.glb", root, {"star":group}, objects)
    write_svg(rails, rings)
    camera = fan.configure_proof_scene()
    camera.location = (0, .15, .9)
    fan.point_at(camera, Vector((0,.15,0)))
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = .66
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.render.resolution_x = 640
    scene.render.resolution_y = 440
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.view_settings.exposure = -2.5
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(ROOT / "scratchpad/star-fan/preview.png")
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()

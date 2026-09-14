"""Build Flat Grip Fire's 2D artwork and Blender GLB from one reference.

blender --background --factory-startup --python scripts/build-flat-grip-fan.py
The source photograph is a visual reference only; the shipped assets are authored here.
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
reference_path = ROOT / "scripts/assets/flat-grip-fire-reference.json"
ref = json.loads(reference_path.read_text())


def geometry():
    rails = []
    for controls in ref["outer_curves_m"]:
        curve = []
        for i in range(65):
            t = i / 64
            weights = [(1-t)**3, 3*(1-t)**2*t, 3*(1-t)*t*t, t**3]
            curve.append([sum(p[axis]*w for p, w in zip(controls, weights)) for axis in [0, 1]])
        rails.append((curve, ref["outer_stock_radius_m"]))
    rails += [(points, ref["inner_stock_radius_m"]) for points in ref["rails_m"]]
    # Each welded fork continues inside the roll, so no wire stops short of its cap.
    for center, direction, length in zip(ref["wick_centers_m"], ref["wick_directions"], ref["wick_lengths_m"]):
        rails.append(([[c-d*length/2 for c,d in zip(center,direction)], center], ref["inner_stock_radius_m"]))
    rings = [([0, 0], ref["ring_inside_radius_m"], ref["outer_stock_radius_m"])]
    rings += [(center, ref["rear_ring_inside_radius_m"], ref["inner_stock_radius_m"])
              for center in ref["rear_ring_centers_m"]]
    return rails, rings


def write_svg(rails, rings):
    # Physical +Y becomes the notation's rightward reach, about its hand pivot.
    scale = 417.3
    def point(p):
        return f"{130+p[1]*scale:.4f},{103.5+p[0]*scale:.4f}"
    frame = []
    for points, radius in rails:
        frame.append(f'<polyline points="{" ".join(point(p) for p in points)}" stroke-width="{2*radius*scale:.4f}"/>')
    for center, inside, tube in rings:
        x, y = point(center).split(',')
        frame.append(f'<circle cx="{x}" cy="{y}" r="{(inside+tube)*scale:.4f}" stroke-width="{2*tube*scale:.4f}"/>')
    grip = ref["flat_grip_m"]
    x, y = [float(v) for v in point(grip["center"]).split(',')]
    frame.append(f'<path d="M {x},{y-grip["width"]*scale/2} V {y+grip["width"]*scale/2}" stroke-width="{grip["height"]*scale}"/>')
    wicks = []
    for index, (center, direction) in enumerate(zip(ref["wick_centers_m"], ref["wick_directions"])):
        angle = math.degrees(math.atan2(direction[0], direction[1]))
        length, radius = ref["wick_lengths_m"][index]*scale, ref["wick_radii_m"][index]*scale
        wicks.append(f'<rect data-flat-grip-wick="{index+1}" x="{-length/2}" y="{-radius}" width="{length}" height="{2*radius}" rx="0.7" transform="translate({point(center)}) rotate({angle})"/>')
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 207" data-generated-from="scripts/assets/flat-grip-fire-reference.json">\n'
    svg += '<title>Flat Grip Fire fan</title>\n<g data-fan-frame="" fill="none" stroke="#2E3192" stroke-linecap="round" stroke-linejoin="round">\n'
    svg += '\n'.join(frame) + '\n</g>\n<g data-fan-wicks="" fill="#f5e6b8">\n'
    svg += '\n'.join(wicks) + '\n</g>\n</svg>\n'
    (ROOT / "static/images/props/appearances/fan-flat-grip.svg").write_text(svg, newline="\n")


def main():
    fan.reset_scene()
    root = fan.add_empty("TKA_Fan")
    group = fan.add_empty("Fan_FlatGrip", root)
    group["tka_source"] = ref["source"]
    group["tka_published_dimensions_m"] = ref["published_dimensions_m"]
    group["tka_ring_inside_diameter_m"] = 2*ref["ring_inside_radius_m"]
    group["tka_wick_centers_m"] = [[x,y,0] for x,y in ref["wick_centers_m"]]
    steel = fan.make_material("TKA_Fan_FlatGrip_Steel", (0.012, 0.013, 0.014, 1), roughness=0.52, metallic=0.55)
    grip_steel = fan.make_material("TKA_Fan_FlatGrip_Handle", (0.32, 0.28, 0.22, 1), roughness=0.32, metallic=0.85)
    wick = fan.make_woven_wick_material("TKA_Fan_FlatGrip_Wick")
    rails, rings = geometry()
    objects = []
    for index, (points, radius) in enumerate(rails):
        objects.append(fan.add_round_rod(f"Fan_FlatGrip_Rail_{index}", [(x,y,0) for x,y in points], radius, steel, group))
    for index, (center, inside, tube) in enumerate(rings):
        objects.append(fan.add_torus(f"Fan_FlatGrip_Ring_{index}", (*center,0), inside, tube, tube*2, grip_steel, group))
    grip = ref["flat_grip_m"]
    bpy.ops.mesh.primitive_cube_add(size=1, location=(*grip["center"], 0))
    bar = bpy.context.object
    bar.name = "Fan_FlatGrip_FlatHandle"
    bar.scale = (grip["width"], grip["height"], grip["depth"])
    bar.parent = group
    objects.append(fan.finish_mesh(bar, grip_steel, bevel=0.001))
    for index, (center, direction) in enumerate(zip(ref["wick_centers_m"], ref["wick_directions"])):
        c, d = Vector((*center,0)), Vector((*direction,0))
        half = ref["wick_lengths_m"][index] / 2
        objects.append(fan.add_woven_cylinder_between(f"Fan_FlatGrip_Wick_{index+1}", c-d*half, c+d*half, ref["wick_radii_m"][index], wick, group, radial_segments=40, axial_segments=28))
    for index, center in enumerate(ref["weld_centers_m"]):
        objects.append(fan.add_weld_boss(f"Fan_FlatGrip_Weld_{index}", (*center, 0), (.004, .005, .002), index, steel, group))
    fan.export_glb(ROOT / "static/models/props/fan-flat-grip.glb", root, {"flat-grip":group}, objects)
    write_svg(rails, rings)
    camera = fan.configure_proof_scene()
    camera.location = (0, .11, .9)
    fan.point_at(camera, Vector((0,.11,0)))
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = .58
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.render.resolution_x = 640
    scene.render.resolution_y = 440
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.view_settings.exposure = -2.5
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(ROOT / "scratchpad/flat-grip/preview.png")
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()

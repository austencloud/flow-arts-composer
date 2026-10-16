"""Build the Flow DNA Sense Fan's 2D artwork and Blender GLB from one reference.

blender --background --factory-startup --python scripts/build-sense-fan.py
The shell is unlit: Flow DNA's LED layout is not part of the reference.
"""
import importlib.util
import json
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("fan_builder", ROOT / "scripts/build-fan-model.py")
fan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fan)
reference_path = ROOT / "scripts/assets/sense-fan-reference.json"
ref = json.loads(reference_path.read_text())


def write_svg():
    # Physical +Y becomes the notation's rightward reach, about the grip centre.
    # The 468 mm span fits the shared 260 x 207 fan box at the DoodleGrip's 417.3 px/m.
    scale = ref["svg_scale_px_per_m"]

    def ring(points):
        coords = " ".join(f"{130+y*scale:.2f},{103.5+x*scale:.2f}" for x, y in points)
        return f"M{coords}Z"

    path = "".join(ring(points) for points in [ref["outline_m"], *ref["holes_m"]])
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 207" data-generated-from="scripts/assets/sense-fan-reference.json">\n'
    svg += '<title>Flow DNA Sense Fan</title>\n'
    svg += '<desc>Shell outline of the Flow DNA Sense Fan, used with permission. Design credit: Flow DNA.</desc>\n'
    svg += '<g data-fan-frame="" fill="#2E3192" fill-rule="evenodd" stroke="none">\n'
    svg += f'<path data-sense-shell="" d="{path}"/>\n'
    svg += '</g>\n</svg>\n'
    (ROOT / "static/images/props/appearances/fan-sense.svg").write_text(svg, newline="\n")


def main():
    fan.reset_scene()
    root = fan.add_empty("TKA_Fan")
    group = fan.add_empty("Fan_Sense", root)
    group["tka_source"] = ref["source"]
    group["tka_prop_length_m"] = ref["prop_length_m"]
    group["tka_rim_points_m"] = [[x, y, 0] for x, y in ref["rim_points_m"]]
    shell = fan.make_material("TKA_Fan_Sense_Shell", (0.06, 0.062, 0.068, 1), roughness=0.62, coat=0.1)
    objects = [
        fan.add_cut_sheet(
            "Fan_Sense_Shell",
            [tuple(p) for p in ref["outline_m"]],
            [[tuple(p) for p in hole] for hole in ref["holes_m"]],
            ref["sheet_thickness_m"],
            shell,
            group,
        )
    ]
    fan.export_glb(ROOT / "static/models/props/fan-sense.glb", root, {"sense": group}, objects)
    write_svg()
    camera = fan.configure_proof_scene()
    center_y = (ref["base_offset_m"] + ref["prop_length_m"]) / 2
    camera.location = (0, center_y, .9)
    fan.point_at(camera, Vector((0, center_y, 0)))
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = .56
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.render.resolution_x = 640
    scene.render.resolution_y = 440
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.view_settings.exposure = -1.5
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(ROOT / "scratchpad/sense-fan/preview.png")
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()

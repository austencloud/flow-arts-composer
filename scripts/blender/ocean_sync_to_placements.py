"""
Sync Blender ocean object transforms back to placements.ts.
Reads all objects in Flora, Rocks, Formations, and Decorations collections,
converts Z-up -> Y-up, and prints a complete placements.ts file between
sentinel markers.

Execute via: mcp__blender__execute_blender_code (paste full content)

Coordinate conversion: Blender Z-up -> Three.js Y-up
  position: (x, y, z)_blender -> (x, z, -y)_three
  Z-axis rotation in Blender = Y-axis rotation in Three.js

Output file: src/lib/shared/3d/environments/scenes/ocean-v2/authored/placements.ts
"""

import bpy
import math

COLLECTIONS_TO_READ = ["Flora", "Rocks", "Formations", "Decorations"]


def fmt(v):
    r = round(v, 4)
    return int(r) if r == int(r) else r


def blender_to_three_pos(loc):
    return (fmt(loc.x), fmt(loc.z), fmt(-loc.y))


def blender_quat_to_rotY(quat):
    return fmt(2 * math.atan2(quat.z, quat.w))


def main():
    placements = []

    for col_name in COLLECTIONS_TO_READ:
        col = bpy.data.collections.get(col_name)
        if not col:
            print(f"WARNING: No '{col_name}' collection found, skipping.")
            continue

        for obj in col.objects:
            tka_id = obj.get("tka_id")
            object_key = obj.get("tka_objectKey")

            if not tka_id or not object_key:
                # Try to infer from object name
                print(f"  SKIP (no tka_id/tka_objectKey): {obj.name}")
                continue

            # Ensure quaternion mode for accurate rotation read
            if obj.rotation_mode != 'QUATERNION':
                obj.rotation_mode = 'QUATERNION'

            pos = blender_to_three_pos(obj.location)
            rot_y = blender_quat_to_rotY(obj.rotation_quaternion)
            s = fmt(obj.scale[0])

            placements.append({
                "id": tka_id,
                "objectKey": object_key,
                "position": pos,
                "rotY": rot_y,
                "scale": s,
                "sort_idx": int(tka_id.split("-")[-1]) if tka_id.split("-")[-1].isdigit() else 0,
                "collection": col_name,
            })

    placements.sort(key=lambda p: p["sort_idx"])

    # Build TypeScript output
    lines = []
    lines.append('import type { ComposerPlacement } from "#lib/shared/3d/scene-composer/types.js";')
    lines.append("")
    lines.append("function q(rotY: number): [number, number, number, number] {")
    lines.append("\treturn [0, Math.sin(rotY / 2), 0, Math.cos(rotY / 2)];")
    lines.append("}")
    lines.append("")
    lines.append("// <!-- PLACEMENTS_START -->")
    lines.append("export const OCEAN_PLACEMENTS: ComposerPlacement[] = [")

    current_collection = None
    for p in placements:
        # Add collection header comments
        if p["collection"] != current_collection:
            current_collection = p["collection"]
            lines.append(f"\t// ── {current_collection} ──")

        pos = p["position"]
        pos_str = f"[{pos[0]}, {pos[1]}, {pos[2]}]"
        lines.append("\t{")
        lines.append(f'\t\tid: "{p["id"]}",')
        lines.append(f'\t\tobjectKey: "{p["objectKey"]}",')
        lines.append(f"\t\tposition: {pos_str},")
        lines.append(f"\t\trotation: q({p['rotY']}),")
        lines.append(f"\t\tscale: [{p['scale']}, {p['scale']}, {p['scale']}],")
        lines.append("\t},")

    lines.append("];")
    lines.append("// <!-- PLACEMENTS_END -->")
    lines.append("")

    output = "\n".join(lines)
    print("__PLACEMENTS_TS_START__")
    print(output)
    print("__PLACEMENTS_TS_END__")
    print(f"\nSynced {len(placements)} ocean placements from collections: {', '.join(COLLECTIONS_TO_READ)}")
    print("Copy the content between __PLACEMENTS_TS_START__ and __PLACEMENTS_TS_END__")
    print("into: src/lib/shared/3d/environments/scenes/ocean-v2/authored/placements.ts")


main()

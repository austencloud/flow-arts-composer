"""
Sync Blender crystal transforms back to placements.ts.
Reads all objects in the 'Crystals' collection, converts Z-up → Y-up,
and prints a complete placements.ts file between sentinel markers.

Execute via: mcp__blender__execute_blender_code (paste full content)

Coordinate conversion: Blender Z-up → Three.js Y-up
  position: (x, y, z)_blender → (x, z, -y)_three
  Z-axis rotation in Blender = Y-axis rotation in Three.js
"""

import bpy
import math

ZONE_COMMENTS = {
    0: "\t// ── Back-left garden (primary focal — amethyst + emerald zone) ──",
    5: "\t// ── Back-left secondary (connecting — cyan zone) ──",
    8: "\t// ── Far left wall (prismatic + blue zone) ──",
    11: "\t// ── Right flank (stage framing — blue/prismatic) ──",
    14: "\t// ── Left-front accent (aurora/moonlit) ──",
    16: "\t// ── Distant sentinel back-right (amethyst) ──",
    18: "\t// ── Far right lone crystal (cyan) ──",
    19: "\t// ── Foreground right (moonlit/emerald — small, depth) ──",
    21: "\t// ── Sparse singles (break up negative space) ──",
}


def fmt(v):
    r = round(v, 4)
    return int(r) if r == int(r) else r


def blender_to_three_pos(loc):
    return (fmt(loc.x), fmt(loc.z), fmt(-loc.y))


def blender_quat_to_rotY(quat):
    return fmt(2 * math.atan2(quat.z, quat.w))


def main():
    crystals_col = bpy.data.collections.get("Crystals")
    if not crystals_col:
        print("ERROR: No 'Crystals' collection found.")
        return

    placements = []
    for obj in crystals_col.objects:
        tka_id = obj.get("tka_id")
        object_key = obj.get("tka_objectKey")
        if not tka_id or not object_key:
            parts = obj.name.rsplit("_", 1)
            if len(parts) == 2:
                object_key = parts[0]
                tka_id = f"cosmic-{parts[1]}"
            else:
                continue

        pos = blender_to_three_pos(obj.location)
        rot_y = blender_quat_to_rotY(obj.rotation_quaternion)
        s = fmt(obj.scale[0])

        placements.append({
            "id": tka_id,
            "objectKey": object_key,
            "position": pos,
            "rotY": rot_y,
            "scale": s,
            "sort_idx": int(tka_id.split("-")[-1]),
        })

    placements.sort(key=lambda p: p["sort_idx"])

    lines = []
    lines.append('import type { ComposerPlacement } from "#lib/shared/3d/scene-composer/types.js";')
    lines.append("")
    lines.append("function q(rotY: number): [number, number, number, number] {")
    lines.append("\treturn [0, Math.sin(rotY / 2), 0, Math.cos(rotY / 2)];")
    lines.append("}")
    lines.append("")
    lines.append("export const COSMIC_PLACEMENTS: ComposerPlacement[] = [")

    for p in placements:
        idx = p["sort_idx"]
        if idx in ZONE_COMMENTS:
            lines.append(ZONE_COMMENTS[idx])

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
    lines.append("")

    output = "\n".join(lines)
    print("__PLACEMENTS_TS_START__")
    print(output)
    print("__PLACEMENTS_TS_END__")
    print(f"\nSynced {len(placements)} crystal placements.")


main()

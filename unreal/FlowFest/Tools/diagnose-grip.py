"""Editor asset and raw-capture landmarks for a focused Flow Fest grip check.

Run after the editor build with:
  UnrealEditor-Cmd.exe FlowFest.uproject -run=pythonscript -script=Tools/diagnose-grip.py

The native socket landmarks come from FlowFest.Motion.AllNativeFamilies with
-FlowFestGripProbe. This script provides independent source positions and
imported mesh bounds to compare against those runtime logs.

Put raw PerformanceCaptures-v3 JSON under Saved/PerformanceCaptures-v3, or set
FLOWFEST_RAW_CAPTURE_DIR to its existing directory before running the commandlet.
"""

import json
import math
import os
from pathlib import Path

import unreal as u


PROJECT = Path(u.Paths.project_dir()).resolve()
RAW = Path(os.environ.get("FLOWFEST_RAW_CAPTURE_DIR",
                          str(PROJECT / "Saved/PerformanceCaptures-v3"))).resolve()
SOURCE_HEIGHT_M = {
    "x-bot": 1.809234345,
    "y-bot": 1.804734300,
    "ch01": 1.763981210,
}
FRAMES = (0, 30, 60, 120, 180, 240, 360, 420)
BONES = (
    "Hips", "Head", "LeftArm", "LeftForeArm", "LeftHand",
    "LeftHandMiddle1", "RightArm", "RightForeArm", "RightHand",
    "RightHandMiddle1",
)


def vector(values):
    return [float(value) for value in (values.split() if isinstance(values, str) else values)]


def add(a, b):
    return [x + y for x, y in zip(a, b)]


def scale(a, amount):
    return [x * amount for x in a]


def multiply(a, b):
    return [x * y for x, y in zip(a, b)]


def quat_mul(a, b):
    x, y, z, w = a
    X, Y, Z, W = b
    return [w * X + x * W + y * Z - z * Y,
            w * Y - x * Z + y * W + z * X,
            w * Z + x * Y - y * X + z * W,
            w * W - x * X - y * Y - z * Z]


def rotate(q, v):
    x, y, z, w = q
    uv = x * v[0] + y * v[1] + z * v[2]
    uu = x * x + y * y + z * z
    return [2 * uv * x + (w * w - uu) * v[0] + 2 * w * (y * v[2] - z * v[1]),
            2 * uv * y + (w * w - uu) * v[1] + 2 * w * (z * v[0] - x * v[2]),
            2 * uv * z + (w * w - uu) * v[2] + 2 * w * (x * v[1] - y * v[0])]


def source_to_unreal(p):
    return [round(100 * p[2], 4), round(-100 * p[0], 4), round(100 * p[1], 4)]


def source_frame(frame, root_scale):
    nodes = {bone["name"].split("mixamorig", 1)[-1].lstrip("0123456789"): bone
             for bone in frame["bones"]}
    cache = {}

    def world(name):
        if name in cache:
            return cache[name]
        bone = nodes[name]
        parent_name = bone["parent"]
        if parent_name:
            prefixless = parent_name.split("mixamorig", 1)[-1].lstrip("0123456789")
            parent_position, parent_rotation, parent_scale = world(prefixless)
        else:
            parent_position, parent_rotation, parent_scale = [0, 0, 0], [0, 0, 0, 1], [1, 1, 1]
        local = bone["local"]
        position = add(parent_position, rotate(parent_rotation,
                         multiply(parent_scale, vector(local["position"]))))
        rotation = quat_mul(parent_rotation, vector(local["quaternion"]))
        result = (position, rotation, multiply(parent_scale, vector(local["scale"])))
        cache[name] = result
        return result

    performer = frame["performerWorld"]
    mesh = frame["skinnedMeshLocal"]
    # The browser's cached GLTF root scale is outside both captured transforms.
    # This factor was measured from the original decoded GLB bounds.
    origin = add(performer["position"],
                 rotate(performer["quaternion"],
                        multiply(performer["scale"], mesh["position"])))
    rotation = quat_mul(performer["quaternion"], mesh["quaternion"])
    result = {}
    for name in BONES:
        position = world(name)[0]
        point = add(origin, rotate(rotation, scale(position, root_scale)))
        result[name] = source_to_unreal(point)
    for side in ("left", "right"):
        result[side + "CapturedWrist"] = source_to_unreal(frame[side + "HandWorld"])
        result[side + "PropPivot"] = source_to_unreal(
            frame[side + "Prop"]["propRootWorld"]["position"])
    return result


def xyz(v):
    return [round(v.x, 4), round(v.y, 4), round(v.z, 4)]


if not RAW.is_dir():
    raise RuntimeError(f"Raw capture directory unavailable: {RAW}; set FLOWFEST_RAW_CAPTURE_DIR")

catalog = json.loads((PROJECT / "Content/Data/characters.json").read_text())
by_id = {entry["id"]: entry for entry in catalog["characters"]}
report = {"schema": "flow-fest-grip-diagnostic-v1", "characters": {}}
for character_id, source_height in SOURCE_HEIGHT_M.items():
    asset = u.EditorAssetLibrary.load_asset(by_id[character_id]["mesh"])
    if not isinstance(asset, u.SkeletalMesh):
        raise RuntimeError(f"Missing imported skeletal mesh: {character_id}")
    bounds = asset.get_bounds()
    ue_height = 2 * bounds.box_extent.z
    factor = 190.5 / (100 * source_height)
    raw = json.loads((RAW / f"{character_id}_family-staff-A.json").read_text())
    landmarks = {str(index): source_frame(raw["frames"][index], factor)
                 for index in FRAMES}
    reconstruction_error = max(
        math.dist(sample[side + "Hand"], sample[side.lower() + "CapturedWrist"])
        for sample in landmarks.values() for side in ("Left", "Right")
    )
    report["characters"][character_id] = {
        "importedBoundsCm": {
            "origin": xyz(bounds.origin), "extent": xyz(bounds.box_extent),
            "height": round(ue_height, 5),
            "nativePresentationScale": round(190.5 / ue_height, 8),
        },
        "sourceDecodedHeightCm": round(source_height * 100, 5),
        "sourceRootScale": round(factor, 8),
        "sourceWristReconstructionPeakCm": round(reconstruction_error, 5),
        "staffALandmarksAvatarLocalCm": landmarks,
    }
    u.log(f"FLOWFEST_GRIP_PROBE {character_id} importedHeight={ue_height:.5f} "
          f"nativeScale={190.5 / ue_height:.8f} sourceRootScale={factor:.8f} "
          f"sourceWristReconstructionPeak={reconstruction_error:.4f}cm")

staff_catalog = json.loads((PROJECT / "Content/Data/props.json").read_text())
staff = next(prop for prop in staff_catalog["props"] if prop["id"] == "staff")
variant = staff["variants"][0]
staff_mesh = u.EditorAssetLibrary.load_asset(variant["mesh"])
if not isinstance(staff_mesh, u.StaticMesh):
    raise RuntimeError("Missing imported staff static mesh")
staff_bounds = staff_mesh.get_bounds()
report["staffMeshBoundsCm"] = {
    "origin": xyz(staff_bounds.origin), "extent": xyz(staff_bounds.box_extent),
    "asset": variant["mesh"],
}
out = PROJECT / "Saved/diagnose-grip-report.json"
out.write_text(json.dumps(report, indent=2))
u.log(f"FLOWFEST_GRIP_PROBE report={out}")

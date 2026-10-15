import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import {
  Matrix4,
  Object3D,
  Quaternion,
  Vector3,
  type InstancedMesh,
} from "three";
import {
  FAN_BUILDS,
  COMPACT_FAN_LOOKS,
  DEFAULT_FAN_APPEARANCE,
  fanBuildPreviewOptions,
  normalizeFanAppearance,
} from "#lib/shared/pictograph/prop/domain/fan-appearance.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { TRIANGLE_STATIONS_M } from "#lib/shared/pictograph/prop/domain/hoop-family-geometry.generated.js";
import {
  normalizeInternalFanAppearance,
  type InternalFanBuild,
} from "./fan-appearance";
import { INTERNAL_LED_PROP_BUILDS } from "./scene-prop-catalog";
import {
  ASTRAL_FAN_BLADE_LED_COUNT,
  ASTRAL_FAN_SIDES_LED_COUNT,
  ASTRAL_FAN_LED_COUNT,
  ASTRAL_FAN_LED_POINTS,
  astralFanBladePoint,
} from "./astral-fan-geometry";
import {
  manufacturedShapeLedCount,
  manufacturedShapeLedPoints,
  manufacturedTriangleVertices,
  type ManufacturedLedShapeKind,
} from "./manufactured-shape-geometry";
import { AstralFanLedRenderer3D } from "../effects/led/astral-fan-led-renderer-3d";
import { ManufacturedShapeLedRenderer3D } from "../effects/led/manufactured-shape-led-renderer-3d";
import { resolveBuildTipAnchors3D } from "../effects/prop-build-tip-geometry-3d";
import { buildForEffect } from "./build-for-effect";

const BASE_BUILD = {
  finish: "day",
  fanBuild: "pictograph",
  fanFrameColor: "black",
  fanCover: "bare",
  triangleGrip: "corner",
} as const;

describe("internal LED build registration", () => {
  it("keeps all public choices and LED defaults unchanged", () => {
    expect(FAN_BUILDS).not.toContain("astral");
    expect(COMPACT_FAN_LOOKS).not.toContain("astral");
    expect(
      fanBuildPreviewOptions(DEFAULT_FAN_APPEARANCE).map((option) => option.id)
    ).not.toContain("astral");
    expect(
      buildForEffect(PropType.FAN, "led", { ...BASE_BUILD, fanBuild: "fire" })
        ?.propBuild?.fanBuild
    ).toBe("moon");
    for (const prop of [
      PropType.TRIQUETRA,
      PropType.TRIQUETRA2,
      PropType.TRIANGLE,
    ]) {
      expect(buildForEffect(prop, "led", BASE_BUILD)).toBeNull();
    }
    expect(normalizeFanAppearance({ build: "astral" as never }).build).toBe(
      DEFAULT_FAN_APPEARANCE.build
    );
  });

  it("normalizes the internal Astral build without offering a fabric cover", () => {
    expect(
      normalizeInternalFanAppearance({
        build: "astral",
        cover: "covered",
        frameColor: "white",
      })
    ).toEqual({ build: "astral", cover: "bare", frameColor: "white" });
    expect(
      normalizeInternalFanAppearance({ build: "invalid" as InternalFanBuild })
    ).toEqual(DEFAULT_FAN_APPEARANCE);
    expect(normalizeInternalFanAppearance(null)).toEqual(
      DEFAULT_FAN_APPEARANCE
    );
    expect(
      buildForEffect(PropType.FAN, "led", {
        ...BASE_BUILD,
        fanBuild: "astral",
        fanCover: "bare",
      })
    ).toBeNull();
    expect(
      buildForEffect(PropType.FAN, "led", {
        ...BASE_BUILD,
        fanBuild: "astral",
        fanCover: "covered",
      })
    ).toEqual({ propBuild: { fanCover: "bare" } });
    for (const build of FAN_BUILDS) {
      expect(
        normalizeInternalFanAppearance({ build, cover: "covered" })
      ).toEqual(normalizeFanAppearance({ build, cover: "covered" }));
    }
  });

  it("registers the new assemblies alongside existing prop identities", () => {
    expect(INTERNAL_LED_PROP_BUILDS.map((entry) => entry.id)).toEqual([
      "fan-astral",
      "triquetra-tubing",
      "triangle-tubing",
    ]);
    expect(INTERNAL_LED_PROP_BUILDS[0].props).toEqual([
      PropType.FAN,
      PropType.BIGFAN,
    ]);
    expect(INTERNAL_LED_PROP_BUILDS[1].props).toEqual([
      PropType.TRIQUETRA,
      PropType.TRIQUETRA2,
    ]);
    expect(INTERNAL_LED_PROP_BUILDS[2].props).toEqual([PropType.TRIANGLE]);
  });
});

describe("manufactured LED geometry", () => {
  it("retains the authored 30 + 36 Astral sample topology", () => {
    expect(ASTRAL_FAN_BLADE_LED_COUNT).toBe(30);
    expect(ASTRAL_FAN_SIDES_LED_COUNT).toBe(36);
    expect(ASTRAL_FAN_LED_COUNT).toBe(66);
    expect(ASTRAL_FAN_LED_POINTS).toHaveLength(ASTRAL_FAN_LED_COUNT);
    expect(
      ASTRAL_FAN_LED_POINTS.every(
        ({ x, y }) => Number.isFinite(x) && Number.isFinite(y)
      )
    ).toBe(true);
    expect(ASTRAL_FAN_LED_POINTS[0]!.x).toBeCloseTo(0.2273, 9);
    expect(ASTRAL_FAN_LED_POINTS[29]!.x).toBeCloseTo(-0.2273, 9);
    for (let index = 0; index < 30; index++) {
      expect(ASTRAL_FAN_LED_POINTS[index]).toEqual(
        astralFanBladePoint(index / 29)
      );
    }
  });

  it("matches the actual fan builder's emitter positions without importing Blender", () => {
    const script = `
import ast, json, math
from pathlib import Path
source = ast.parse(Path("scripts/build-fan-model.py").read_text())
selected = [ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)]
for node in source.body:
    if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id.startswith("ASTRAL_") for t in node.targets):
        selected.append(node)
    if isinstance(node, ast.FunctionDef) and node.name in ("ellipse_arc", "build_astral_fan"):
        selected.append(node)
pixels = []
def pixel(name, centre, *args):
    pixels.append(centre)
namespace = {"math": math, "add_led_pixel": pixel, "add_round_rod": lambda *args: None, "add_torus": lambda *args: None}
exec(compile(ast.fix_missing_locations(ast.Module(body=selected, type_ignores=[])), "fan-layout", "exec"), namespace)
namespace["build_astral_fan"]({}, None, None, [None])
print(json.dumps(pixels))
`;
    const result = spawnSync("python", ["-c", script], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const pixels = JSON.parse(result.stdout) as number[][];
    expect(pixels).toHaveLength(ASTRAL_FAN_LED_COUNT);
    ASTRAL_FAN_LED_POINTS.forEach((point, index) => {
      expect(point.x).toBeCloseTo(pixels[index]![0]!, 9);
      expect(point.y).toBeCloseTo(pixels[index]![1]!, 9);
    });
  });

  it("scales Astral anchors by the fan group, independently of staff length", () => {
    const build = { fanBuild: "astral", finish: "day" } as const;
    const small = resolveBuildTipAnchors3D(PropType.FAN, 0.4, build)!;
    const big = resolveBuildTipAnchors3D(PropType.BIGFAN, 1.2, build)!;
    expect(small).toHaveLength(5);
    expect(resolveBuildTipAnchors3D(PropType.FAN, 1.2, build)).toEqual(small);
    expect(small[2]!.offset.y).toBeCloseTo(0.306, 9);
    big.forEach((anchor, index) => {
      expect(anchor.offset.x).toBeCloseTo(small[index]!.offset.x * 1.4, 9);
      expect(anchor.offset.y).toBeCloseTo(small[index]!.offset.y * 1.4, 9);
    });
    // Current Triangle tip ownership stays on the existing grip-aware bridge.
    expect(resolveBuildTipAnchors3D(PropType.TRIANGLE, 1, build)).toBeNull();
  });

  it("keeps the generator and runtime emitter positions identical for every grip", () => {
    const result = spawnSync(
      "python",
      ["scripts/build-led-shape-models.py", "--layout-json"],
      { encoding: "utf8" }
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    const layouts = JSON.parse(result.stdout) as Record<string, number[][]>;
    for (const [key, kind, grip] of [
      ["triquetra", "triquetra", "corner"],
      ["triquetra2", "triquetra2", "corner"],
      ["triangle", "triangle", "corner"],
      ["triangle_side", "triangle", "side"],
    ] as const) {
      const runtime = manufacturedShapeLedPoints(kind, grip);
      expect(runtime).toHaveLength(manufacturedShapeLedCount(kind));
      expect(layouts[key]).toHaveLength(runtime.length);
      runtime.forEach((point, index) => {
        [point.x, point.y, point.z].forEach((value, axis) =>
          expect(value).toBeCloseTo(layouts[key]![index]![axis]!, 9)
        );
      });
    }
  });

  it("uses today's bowed 22-inch Triangle and hand pivots for both grips", () => {
    const stations = JSON.parse(
      readFileSync("scripts/hoop-family-stations.json", "utf8")
    );
    expect(TRIANGLE_STATIONS_M.sideChord).toBeCloseTo(
      stations.triangle_side_mm.value / 1000,
      9
    );
    const corner = manufacturedTriangleVertices("corner");
    const side = manufacturedTriangleVertices("side");
    expect(corner[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(side[2]!.y).toBeCloseTo(TRIANGLE_STATIONS_M.reach, 9);
    const cornerPixels = manufacturedShapeLedPoints("triangle", "corner");
    const sidePixels = manufacturedShapeLedPoints("triangle", "side");
    expect(cornerPixels).toHaveLength(48);
    expect(sidePixels).toHaveLength(48);
    expect(Math.max(...cornerPixels.map((point) => point.y))).toBeCloseTo(
      TRIANGLE_STATIONS_M.reach,
      9
    );
    expect(Math.min(...sidePixels.map((point) => point.y))).toBeCloseTo(0, 9);
    expect(Math.max(...sidePixels.map((point) => point.y))).toBeCloseTo(
      TRIANGLE_STATIONS_M.reach,
      9
    );
  });

  it("places the triquetra tip grip on the knot and keeps both variants at the same physical size", () => {
    const normal = manufacturedShapeLedPoints("triquetra");
    const tip = manufacturedShapeLedPoints("triquetra2");
    expect(normal).toHaveLength(60);
    expect(tip).toHaveLength(60);
    normal.forEach((point, index) => {
      expect(tip[index]!.x).toBeCloseTo(-point.x, 9);
      expect(tip[index]!.z).toBeCloseTo(point.z, 9);
    });
    expect(Math.min(...tip.map((point) => point.y))).toBeCloseTo(0, 9);
  });
});

describe("LED renderer transforms and lifecycle without WebGL", () => {
  const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.7);
  const center = { x: 1, y: 2, z: 3 };
  const positionAt = (mesh: InstancedMesh, index: number) => {
    const matrix = new Matrix4();
    mesh.getMatrixAt(index, matrix);
    return new Vector3().setFromMatrixPosition(matrix);
  };

  it("transforms both Astral faces, blanks missing colors, resets, and disposes", () => {
    const parent = new Object3D();
    const renderer = new AstralFanLedRenderer3D();
    renderer.initialize(parent);
    renderer.initialize(parent);
    expect(parent.children).toHaveLength(2);
    renderer.update({
      propState: { worldRotation: rotation },
      rigLocalCenter: center,
      ledColors: [{ r: 1, g: 0.5, b: 0 }],
      brightness: 0.5,
      scale: 1.4,
    });
    const core = parent.children[0] as InstancedMesh;
    expect(core.count).toBe(132);
    const expected = new Vector3(-0.04, 0.2273, -0.014)
      .multiplyScalar(1.4)
      .applyQuaternion(rotation)
      .add(new Vector3(1, 2, 3));
    expect(positionAt(core, 0).distanceTo(expected)).toBeLessThan(1e-6);
    expect(positionAt(core, 0).distanceTo(positionAt(core, 66))).toBeCloseTo(
      0.028 * 1.4,
      6
    );
    expect(Array.from(core.instanceColor!.array.slice(0, 6))).toEqual([
      expect.closeTo(1.2),
      expect.closeTo(0.6),
      0,
      0,
      0,
      0,
    ]);
    renderer.reset();
    expect(parent.children.every((mesh) => !mesh.visible)).toBe(true);
    const dispose = vi.spyOn(core.geometry, "dispose");
    const disposeInstances = vi.spyOn(core, "dispose");
    renderer.dispose();
    renderer.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(disposeInstances).toHaveBeenCalledOnce();
    expect(parent.children).toHaveLength(0);
  });

  it("updates per-grip tubing transforms and instance counts without stale pixels", () => {
    const parent = new Object3D();
    const renderer = new ManufacturedShapeLedRenderer3D();
    renderer.initialize(parent);
    const core = parent.children[0] as InstancedMesh;
    for (const [kind, triangleGrip] of [
      ["triquetra", "corner"],
      ["triquetra2", "corner"],
      ["triangle", "side"],
      ["triangle", "corner"],
    ] as const) {
      renderer.update({
        kind,
        triangleGrip,
        propState: { worldRotation: rotation },
        rigLocalCenter: center,
        ledColors: [],
        brightness: 1,
      });
      expect(core.count).toBe(
        manufacturedShapeLedCount(kind as ManufacturedLedShapeKind) * 2
      );
      const first = manufacturedShapeLedPoints(kind, triangleGrip)[0]!;
      const expected = new Vector3(
        -first.y,
        first.x,
        first.z - (kind === "triangle" ? 0.0094375 : 0.016)
      )
        .applyQuaternion(rotation)
        .add(new Vector3(1, 2, 3));
      expect(positionAt(core, 0).distanceTo(expected)).toBeLessThan(1e-6);
    }
    renderer.update({
      kind: "triangle",
      propState: { worldRotation: rotation },
      rigLocalCenter: center,
      ledColors: [],
      brightness: -1,
    });
    expect(parent.children.every((mesh) => !mesh.visible)).toBe(true);
    renderer.dispose();
    expect(parent.children).toHaveLength(0);
  });
});

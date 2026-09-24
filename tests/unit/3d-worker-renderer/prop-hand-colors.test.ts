import {
  DEFAULT_PROP_HAND_PALETTES,
  derivePropHandPalette,
  propHandPalette,
  setPropHandColors,
} from "@austencloud/scene-3d/worker";
import { Color, Group, Scene, type Material, type Mesh, type Object3D } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkerPerformerSnapshot } from "$lib/shared/3d/worker-renderer/domain/worker-renderer-protocol";
import {
  WorkerPerformerStage,
  createWorkerPerformerProp,
} from "$lib/shared/3d/worker-renderer/worlds/worker-performer";

function snapshot(
  handColors?: WorkerPerformerSnapshot["handColors"]
): WorkerPerformerSnapshot {
  return {
    id: "performer",
    avatarId: "x-bot",
    position: [0, 0, 0],
    facingAngle: 0,
    avatarHeightCm: 190.5,
    groundY: -1.5,
    staffLength: 0.86,
    staffThickness: 0.0125,
    propBuild: {
      finish: "fire",
      fanBuild: "pictograph",
      fanFrameColor: "black",
      fanCover: "bare",
    },
    handColors,
    leftPropType: "staff",
    rightPropType: "staff",
    leftProp: null,
    rightProp: null,
    stanceYaw: 0,
    stanceSegments: null,
    spinePitchOffset: 0,
  };
}

function materialHexes(root: Object3D): Set<string> {
  const hexes = new Set<string>();
  root.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    const materials = (
      Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    ) as (Material & { color?: Color })[];
    for (const material of materials) {
      if (material.color) hexes.add(`#${material.color.getHexString()}`);
    }
  });
  return hexes;
}

afterEach(() => setPropHandColors({}));

describe("prop hand colors", () => {
  it("derives a shade and highlight around the chosen color", () => {
    const palette = derivePropHandPalette("#22C55E");
    expect(palette.main).toBe("#22c55e");
    const lightness = (hex: string) => new Color(hex).getHSL({ h: 0, s: 0, l: 0 }).l;
    expect(lightness(palette.dark)).toBeLessThan(lightness(palette.main));
    expect(lightness(palette.light)).toBeGreaterThan(lightness(palette.main));
  });

  it("restores a hand's authored palette for a missing or invalid color", () => {
    setPropHandColors({ blue: "#22c55e", red: "#a855f7" });
    setPropHandColors({ blue: null, red: "not a color" });
    expect(propHandPalette("blue")).toEqual(DEFAULT_PROP_HAND_PALETTES.blue);
    expect(propHandPalette("red")).toEqual(DEFAULT_PROP_HAND_PALETTES.red);
  });

  it("paints a worker prop in the hand color and repaints it on change", async () => {
    setPropHandColors({ blue: "#22c55e" });
    const prop = await createWorkerPerformerProp("left", snapshot());
    expect(materialHexes(prop.anchor)).toContain("#22c55e");

    setPropHandColors({ blue: "#a855f7" });
    const repainted = materialHexes(prop.anchor);
    expect(repainted).toContain("#a855f7");
    expect(repainted).not.toContain("#22c55e");
    prop.dispose();
  });

  it("applies the snapshot's hand colors before building performers", async () => {
    const stage = new WorkerPerformerStage(new Scene(), vi.fn(async (next) => {
      // The palette is already the snapshot's when a performer is built.
      expect(propHandPalette("red").main).toBe("#a855f7");
      return {
        id: next.id,
        root: new Group(),
        matchesConfiguration: () => true,
        setSnapshot: vi.fn(),
        update: vi.fn(),
        dispose: vi.fn(),
      };
    }) as never);

    await stage.setSnapshots([snapshot({ blue: "#22c55e", red: "#a855f7" })]);
    expect(propHandPalette("blue").main).toBe("#22c55e");
    stage.dispose();
  });
});

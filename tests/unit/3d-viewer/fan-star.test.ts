import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Quaternion, Vector3 } from "three";
import { PropType } from "@austencloud/scene-3d";
import {
  normalizeFanAppearance,
  resolveFanRenderKey,
  parseFanRenderKey,
  fanAppearanceArtwork,
} from "$lib/shared/pictograph/prop/domain/fan-appearance";
import { resolvePropTipAnchors3D } from "$lib/shared/3d/effects/prop-tip-geometry-3d";
import { buildForEffect } from "$lib/shared/3d/domain/build-for-effect";
import { PROP_RENDER_KEY_TIP_POINTS } from "$lib/shared/animation-engine/domain/types/prop-tip-points";

const appearance = {
  build: "star",
  frameColor: "black",
  cover: "bare",
} as const;
const build = {
  fanBuild: "star",
  fanFrameColor: "black",
  fanCover: "bare",
  finish: "fire",
} as const;
const reference = JSON.parse(
  readFileSync("scripts/assets/star-fire-reference.json", "utf8")
);

describe("Renegade Star Fire", () => {
  it("keeps the exported wick transforms and physical scale aligned with effects", () => {
    const buffer = readFileSync("static/models/props/fan-star.glb");
    const jsonLength = buffer.readUInt32LE(12);
    const gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString());
    const group = gltf.nodes.find(
      (node: { name: string }) => node.name === "Fan_Star"
    );
    const root = gltf.nodes.find(
      (node: { name: string }) => node.name === "TKA_Fan"
    );
    // The published 4-inch manipulation ring is what the hand holds.
    expect(group.extras.tka_ring_outside_diameter_m).toBeCloseTo(0.1016, 7);
    const anchors = resolvePropTipAnchors3D("fan", 0.4, build);
    anchors.forEach(({ offset }, index) => {
      const wick = gltf.nodes.find(
        (node: { name: string }) => node.name === `Fan_Star_Wick_${index + 1}`
      );
      const actual = new Vector3()
        .fromArray(wick.translation)
        .applyQuaternion(new Quaternion().fromArray(root.rotation))
        .toArray();
      [offset.x, offset.y, offset.z].forEach((value, axis) => {
        expect(actual[axis]).toBeCloseTo(value, 6);
      });
    });
    const svg = readFileSync(
      "static/images/props/appearances/fan-star.svg",
      "utf8"
    );
    reference.wick_directions.forEach((direction: number[], index: number) => {
      const wick = gltf.nodes.find(
        (node: { name: string }) => node.name === `Fan_Star_Wick_${index + 1}`
      );
      const axis = new Vector3(0, 1, 0)
        .applyQuaternion(new Quaternion().fromArray(wick.rotation))
        .applyQuaternion(new Quaternion().fromArray(root.rotation));
      expect(axis.x).toBeCloseTo(direction[0], 5);
      expect(axis.y).toBeCloseTo(direction[1], 5);
      expect(axis.z).toBeCloseTo(0, 5);
      const svgAngle = Number(
        svg.match(
          new RegExp(`data-star-wick="${index + 1}"[^>]*rotate\\(([^)]+)\\)`)
        )?.[1]
      );
      expect(svgAngle).toBeCloseTo(
        (Math.atan2(direction[0], direction[1]) * 180) / Math.PI,
        6
      );
    });
    // Straight spokes every 45 degrees: each wick sits centred on its spoke's
    // ray, half a roll short of the published tip radius.
    reference.wick_centers_m.forEach(([x, y]: number[], index: number) => {
      const spoke = (reference.spoke_angles_deg[index] * Math.PI) / 180;
      const [hx, hy] = reference.hub_m;
      expect(Math.hypot(x - hx, y - hy)).toBeCloseTo(
        reference.wick_tip_radius_m - reference.wick_length_m / 2,
        6
      );
      expect(Math.atan2(y - hy, x - hx)).toBeCloseTo(spoke, 6);
    });
    const big = resolvePropTipAnchors3D("bigfan", 0.4, build);
    big.forEach(({ offset }, index) => {
      expect(offset.x).toBeCloseTo(anchors[index].offset.x * 1.4, 6);
      expect(offset.y).toBeCloseTo(anchors[index].offset.y * 1.4, 6);
    });
  });

  it("maps the 2D wick centres through the artwork's box fit", () => {
    const scale = reference.svg_scale_px_per_m;
    expect(scale).toBe(340);
    const tips = PROP_RENDER_KEY_TIP_POINTS["fan__star"]!.points;
    expect(tips).toHaveLength(5);
    reference.wick_centers_m.forEach(([x, y]: number[], index: number) => {
      expect(tips[index]!.dx).toBeCloseTo(y * scale, 2);
      expect(tips[index]!.dy).toBeCloseTo(x * scale, 2);
    });
    const svg = readFileSync(
      "static/images/props/appearances/fan-star.svg",
      "utf8"
    );
    tips.forEach((tip, index) => {
      const translate = svg
        .match(
          new RegExp(`data-star-wick="${index + 1}"[^>]*translate\\(([^)]+)\\)`)
        )?.[1]
        ?.split(",")
        .map(Number);
      expect(translate?.[0]).toBeCloseTo(130 + tip.dx, 2);
      expect(translate?.[1]).toBeCloseTo(103.5 + tip.dy, 2);
    });
  });

  it("survives saved appearance normalization and both fan render keys", () => {
    expect(normalizeFanAppearance(appearance)).toEqual(appearance);
    for (const prop of ["fan", "bigfan"]) {
      const key = resolveFanRenderKey(prop, appearance);
      expect(key).toBe(`${prop}__star`);
      expect(parseFanRenderKey(key)).toEqual({ propType: prop, ...appearance });
    }
    expect(fanAppearanceArtwork("star")).toContain("fan-star.svg");
  });

  it("keeps the selected fan when fire is enabled", () => {
    expect(buildForEffect(PropType.FAN, "fire", build)).toBeNull();
  });

  it("places effects on its five physical wicks, independent of staff length", () => {
    const anchors = resolvePropTipAnchors3D("fan", 0.4, build);
    expect(anchors).toHaveLength(5);
    expect(anchors).toEqual(resolvePropTipAnchors3D("fan", 0.8, build));
    anchors.forEach(({ offset }, index) => {
      expect([offset.x, offset.y]).toEqual(reference.wick_centers_m[index]);
    });
  });
});

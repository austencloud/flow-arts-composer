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

const appearance = {
  build: "flat-grip",
  frameColor: "black",
  cover: "bare",
} as const;
const build = {
  fanBuild: "flat-grip",
  fanFrameColor: "black",
  fanCover: "bare",
  finish: "fire",
} as const;

describe("Flat Grip Fire", () => {
  it("keeps the exported wick transforms and physical scale aligned with effects", () => {
    const buffer = readFileSync("static/models/props/fan-flat-grip.glb");
    const jsonLength = buffer.readUInt32LE(12);
    const gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString());
    const group = gltf.nodes.find(
      (node: { name: string }) => node.name === "Fan_FlatGrip"
    );
    const root = gltf.nodes.find(
      (node: { name: string }) => node.name === "TKA_Fan"
    );
    expect(group.extras.tka_ring_inside_diameter_m).toBeCloseTo(0.0508, 7);
    const anchors = resolvePropTipAnchors3D("fan", 0.4, build);
    anchors.forEach(({ offset }, index) => {
      const wick = gltf.nodes.find(
        (node: { name: string }) =>
          node.name === `Fan_FlatGrip_Wick_${index + 1}`
      );
      const actual = new Vector3()
        .fromArray(wick.translation)
        .applyQuaternion(new Quaternion().fromArray(root.rotation))
        .toArray();
      [offset.x, offset.y, offset.z].forEach((value, axis) => {
        expect(actual[axis]).toBeCloseTo(value, 6);
      });
    });
    const reference = JSON.parse(
      readFileSync("scripts/assets/flat-grip-fire-reference.json", "utf8")
    );
    const svg = readFileSync(
      "static/images/props/appearances/fan-flat-grip.svg",
      "utf8"
    );
    reference.wick_directions.forEach((direction: number[], index: number) => {
      const wick = gltf.nodes.find(
        (node: { name: string }) =>
          node.name === `Fan_FlatGrip_Wick_${index + 1}`
      );
      const axis = new Vector3(0, 1, 0)
        .applyQuaternion(new Quaternion().fromArray(wick.rotation))
        .applyQuaternion(new Quaternion().fromArray(root.rotation));
      expect(axis.x).toBeCloseTo(direction[0], 5);
      expect(axis.y).toBeCloseTo(direction[1], 5);
      expect(axis.z).toBeCloseTo(0, 5);
      const svgAngle = Number(
        svg.match(
          new RegExp(
            `data-flat-grip-wick="${index + 1}"[^>]*rotate\\(([^)]+)\\)`
          )
        )?.[1]
      );
      expect(svgAngle).toBeCloseTo(
        (Math.atan2(direction[0], direction[1]) * 180) / Math.PI,
        6
      );
    });
    // The photographed diagonal rolls follow their mounting forks, not 45-degree spokes.
    expect(Math.abs(reference.wick_directions[1][0])).toBeLessThan(0.65);
    expect(Math.abs(reference.wick_directions[3][0])).toBeLessThan(0.6);
    const big = resolvePropTipAnchors3D("bigfan", 0.4, build);
    big.forEach(({ offset }, index) => {
      expect(offset.x).toBeCloseTo(anchors[index].offset.x * 1.4, 6);
      expect(offset.y).toBeCloseTo(anchors[index].offset.y * 1.4, 6);
    });
  });

  it("survives saved appearance normalization and both fan render keys", () => {
    expect(normalizeFanAppearance(appearance)).toEqual(appearance);
    for (const prop of ["fan", "bigfan"]) {
      const key = resolveFanRenderKey(prop, appearance);
      expect(key).toBe(`${prop}__flat-grip`);
      expect(parseFanRenderKey(key)).toEqual({ propType: prop, ...appearance });
    }
    expect(fanAppearanceArtwork("flat-grip")).toContain("fan-flat-grip.svg");
  });

  it("keeps the selected fan when fire is enabled", () => {
    expect(buildForEffect(PropType.FAN, "fire", build)).toBeNull();
  });

  it("places effects on its five physical wicks, independent of staff length", () => {
    const anchors = resolvePropTipAnchors3D("fan", 0.4, build);
    expect(anchors).toHaveLength(5);
    expect(anchors).toEqual(resolvePropTipAnchors3D("fan", 0.8, build));
    const reference = JSON.parse(
      readFileSync("scripts/assets/flat-grip-fire-reference.json", "utf8")
    );
    anchors.forEach(({ offset }, index) => {
      expect([offset.x, offset.y]).toEqual(reference.wick_centers_m[index]);
    });
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PropType } from "@austencloud/scene-3d";
import {
  normalizeFanAppearance,
  resolveFanRenderKey,
  parseFanRenderKey,
  fanAppearanceArtwork,
  fanBuildPreviewOptions,
  COMPACT_FAN_LOOKS,
  DEFAULT_FAN_APPEARANCE,
} from "#lib/shared/pictograph/prop/domain/fan-appearance.js";
import { resolvePropTipAnchors3D } from "#lib/shared/3d/effects/prop-tip-geometry-3d.js";
import { buildForEffect } from "#lib/shared/3d/domain/build-for-effect.js";
import { PROP_RENDER_KEY_TIP_POINTS } from "#lib/shared/animation-engine/domain/types/prop-tip-points.js";
import { fanModelUrl } from "#lib/shared/3d/worker-renderer/worlds/props/worker-gltf-props.js";

const appearance = {
  build: "sense",
  frameColor: "black",
  cover: "bare",
} as const;
const build = {
  fanBuild: "sense",
  fanFrameColor: "black",
  fanCover: "bare",
  finish: "day",
} as const;
const reference = JSON.parse(
  readFileSync("scripts/assets/sense-fan-reference.json", "utf8")
);
const SVG_PATH = "static/images/props/appearances/fan-sense.svg";
const MCP_SVG_PATH = "mcp-server-pkg/assets/images/props/appearances/fan-sense.svg";

describe("Flow DNA Sense Fan", () => {
  it("exports one shell group whose rim points match the effect anchors", () => {
    const buffer = readFileSync("static/models/props/fan-sense.glb");
    const jsonLength = buffer.readUInt32LE(12);
    const gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString());
    const group = gltf.nodes.find(
      (node: { name: string }) => node.name === "Fan_Sense"
    );
    expect(group.extras.tka_source).toBe("Flow DNA Sense Fan");
    expect(
      gltf.nodes.some(
        (node: { name: string }) => node.name === "Fan_Sense_Shell"
      )
    ).toBe(true);
    const anchors = resolvePropTipAnchors3D("fan", 0.4, build);
    expect(anchors).toHaveLength(5);
    anchors.forEach(({ offset }, index) => {
      const [x, y, z] = group.extras.tka_rim_points_m[index];
      expect(offset.x).toBeCloseTo(x, 6);
      expect(offset.y).toBeCloseTo(y, 6);
      expect(offset.z).toBeCloseTo(z, 6);
    });
    const big = resolvePropTipAnchors3D("bigfan", 0.4, build);
    big.forEach(({ offset }, index) => {
      expect(offset.x).toBeCloseTo(anchors[index]!.offset.x * 1.4, 6);
      expect(offset.y).toBeCloseTo(anchors[index]!.offset.y * 1.4, 6);
    });
    expect(anchors).toEqual(resolvePropTipAnchors3D("fan", 0.8, build));
    expect(fanModelUrl("sense")).toBe("/models/props/fan-sense.glb");
  });

  it("maps the rim points into 2D at the DoodleGrip scale", () => {
    const scale = reference.svg_scale_px_per_m;
    expect(scale).toBe(417.3);
    const tips = PROP_RENDER_KEY_TIP_POINTS["fan__sense"]!.points;
    expect(tips).toHaveLength(5);
    reference.rim_points_m.forEach(([x, y]: number[], index: number) => {
      expect(tips[index]!.dx).toBeCloseTo(y * scale, 1);
      expect(tips[index]!.dy).toBeCloseTo(x * scale, 1);
    });
  });

  it("draws one even-odd shell inside the shared fan box", () => {
    const svg = readFileSync(SVG_PATH, "utf8");
    expect(svg).toContain('viewBox="0 0 260 207"');
    expect(svg).toMatch(/<g data-fan-frame=""[^>]*fill-rule="evenodd"/);
    const d = svg.match(/data-sense-shell="" d="([^"]+)"/)?.[1] ?? "";
    // The silhouette plus every lattice hole kept by the reference.
    expect(d.match(/M/g)).toHaveLength(1 + reference.holes_m.length);
    const numbers = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    for (let i = 0; i < numbers.length; i += 2) {
      expect(numbers[i]).toBeGreaterThanOrEqual(0);
      expect(numbers[i]).toBeLessThanOrEqual(260);
      expect(numbers[i + 1]).toBeGreaterThanOrEqual(0);
      expect(numbers[i + 1]).toBeLessThanOrEqual(207);
    }
    expect(readFileSync(MCP_SVG_PATH, "utf8")).toBe(svg);
  });

  it("survives saved appearance normalization and both fan render keys", () => {
    expect(normalizeFanAppearance(appearance)).toEqual(appearance);
    for (const prop of ["fan", "bigfan"]) {
      const key = resolveFanRenderKey(prop, appearance);
      expect(key).toBe(`${prop}__sense`);
      expect(parseFanRenderKey(key)).toEqual({ propType: prop, ...appearance });
    }
    expect(fanAppearanceArtwork("sense")).toContain("fan-sense.svg");
  });

  it("is offered in the pickers, credited to Flow DNA with no link yet", () => {
    expect(COMPACT_FAN_LOOKS).toContain("sense");
    const option = fanBuildPreviewOptions(DEFAULT_FAN_APPEARANCE).find(
      (entry) => entry.id === "sense"
    );
    expect(option?.label).toBe("Sense Fan");
    expect(option?.image).toContain("fan-sense-complete.webp");
    expect(option?.designCredit).toEqual({ originator: "Flow DNA" });
  });

  it("swaps to DoodleGrip Fire when fire is enabled, like the other unlit fans", () => {
    expect(buildForEffect(PropType.FAN, "fire", build)).toEqual({
      propBuild: { fanBuild: "fire" },
    });
  });
});

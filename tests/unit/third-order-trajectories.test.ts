import { describe, expect, it } from "vitest";
import { FALLBACK_DEMO } from "#lib/shared/landing/data/per-visit-demo.js";
import { ThirdOrderCompositionSampler } from "#lib/features/toys/tabs/third-order/services/implementations/ThirdOrderCompositionSampler.js";
import {
  bakeThirdOrderTrajectories,
  thirdOrderWorldFrame,
} from "#lib/features/toys/tabs/third-order/services/third-order-trajectories.js";
import type { ThirdOrderCompositionDraft } from "#lib/features/toys/tabs/third-order/domain/third-order-composition.js";
import { getTipPoints } from "#lib/shared/animation-engine/domain/types/prop-tip-points.js";
import {
  revealTrajectoryPoints,
  renderTrajectoryMandalaSVG,
} from "#lib/shared/mandala/services/trajectory-mandala-renderer.js";

function composition(): ThirdOrderCompositionDraft {
  return {
    version: 2,
    carrier: FALLBACK_DEMO,
    carrierPath: {
      mode: "flower",
      ratio: "2:3",
      style: "anti",
      strength: 1,
      phase: 0,
      relationship: "SO",
      showConstruction: false,
    },
    bpm: 60,
    children: ["grid-blue", "grid-red"].map((id, index) => ({
      id: id as "grid-blue" | "grid-red",
      label: id,
      lane: index === 0 ? "left" : "right",
      sequence: FALLBACK_DEMO,
      orientationMode: "world",
      timingMode: "phrase",
      rate: 1,
      visible: true,
    })),
  };
}

describe("third-order tip trajectories", () => {
  it("composes child translation, rotation, scale and canonical prop ends", () => {
    const sampler = new ThirdOrderCompositionSampler();
    const frame = sampler.sample(composition(), 0);
    const child = frame.children[0]!;
    child.pose = {
      centerX: 575,
      centerY: 375,
      rotation: Math.PI / 2,
      scale: 0.5,
    };
    child.props.left = { centerPathAngle: 0, staffRotationAngle: 0 };
    const world = thirdOrderWorldFrame(frame, {
      left: "staff",
      right: "staff",
    });
    const tip = getTipPoints("staff").points[0]!;
    const endpoint = world.streams["grid-blue:left"]!.endpoints[0]!;
    expect(endpoint.position[0]).toBeCloseTo(100, 8);
    expect(endpoint.position[1]).toBeCloseTo(100 - (150 + tip.dx) * 0.5, 8);
  });

  it("bakes all eight staff tips over the full two-cycle flower and matches a sought frame", () => {
    const sampler = new ThirdOrderCompositionSampler();
    const draft = composition();
    const types = { left: "staff", right: "staff" };
    const baked = bakeThirdOrderTrajectories(draft, sampler, types);
    expect(baked.layers).toHaveLength(8);
    expect(baked.durationBeats).toBe(32);
    const sought = thirdOrderWorldFrame(sampler.sample(draft, 5.5), types);
    for (const layer of baked.layers) {
      const point = layer.points.find((candidate) => candidate.beat === 5.5)!;
      const expected = sought.streams[layer.streamId]!.endpoints.find(
        (tip) => tip.id === layer.tipId
      )!;
      expect(point.x).toBeCloseTo(expected.position[0], 8);
      expect(point.y).toBeCloseTo(expected.position[1], 8);
    }
  });

  it("respects hidden children and the actual tip count of each prop", () => {
    const sampler = new ThirdOrderCompositionSampler();
    const draft = composition();
    draft.children[1]!.visible = false;
    const baked = bakeThirdOrderTrajectories(draft, sampler, {
      left: "fan",
      right: "hand",
    });
    expect(baked.layers).toHaveLength(getTipPoints("fan").points.length);
    expect(
      baked.layers.every((layer) => layer.streamId === "grid-blue:left")
    ).toBe(true);
  });

  it("lifts the pen across an inner sequence restart instead of drawing a closing chord", () => {
    const sampler = new ThirdOrderCompositionSampler();
    const draft = composition();
    draft.children[0]!.timingMode = "beats";
    const baked = bakeThirdOrderTrajectories(draft, sampler, {
      left: "staff",
      right: "staff",
    });
    const left = baked.layers.find(
      (layer) => layer.streamId === "grid-blue:left"
    )!;
    expect(left.points.find((point) => point.beat === 16)?.breakBefore).toBe(
      true
    );
    const svg = renderTrajectoryMandalaSVG(baked, 950);
    expect(svg).not.toContain(" Z");
    expect(svg.match(/<path /g)).toHaveLength(8);
  });

  it("reveals by elapsed time when speeds differ, and never bridges a discontinuity", () => {
    const points = [
      { beat: 0, x: 0, y: 0 },
      { beat: 1, x: 100, y: 0 },
      { beat: 4, x: 103, y: 0 },
    ];
    expect(revealTrajectoryPoints(points, 2.5, 4).at(-1)?.x).toBe(101.5);
    expect(
      revealTrajectoryPoints(
        [...points, { beat: 5, x: -20, y: 0, breakBefore: true }],
        4.5,
        5
      ).at(-1)?.x
    ).toBe(103);
    expect(revealTrajectoryPoints(points, 0.5, 4).at(-1)?.x).toBe(50);
  });
});

import { describe, expect, it } from "vitest";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import {
  createDerivedTunnelPerformer,
  createIndependentTunnelPerformer,
  createTunnelComposition,
  TunnelCompositionSchema,
  primaryTunnelSourceSequenceId,
  resolveTunnelLayerPlans,
  tunnelCompositionCycleSteps,
  validateTunnelComposition,
} from "$lib/shared/sequence-viewer/tunnel/tunnel-composition";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { buildTunnelCompositionLayers } from "$lib/shared/sequence-viewer/tunnel/tunnel-layer-builder";
import { resolveTunnelPerformerDisplays } from "$lib/features/create/tunnel/domain/tunnel-performer-displays";

function sequence(id: string, steps: number): SequenceData {
  return createSequenceData({
    id,
    name: id,
    word: id,
    steps: Array.from(
      { length: steps },
      (_, index) =>
        ({
          id: `${id}-${index}`,
          stepNumber: index + 1,
          duration: 1,
          motions: {},
          isBlank: false,
          leftReversal: false,
          rightReversal: false,
        }) as StepData
    ),
  });
}

function geometricSequence(id: string): SequenceData {
  return createSequenceData({
    id,
    name: id,
    word: "A",
    gridMode: GridMode.DIAMOND,
    steps: [
      createStepData({
        id: `${id}-1`,
        stepNumber: 1,
        motions: {
          [HandSide.LEFT]: createMotionData({
            hand: HandSide.LEFT,
            startLocation: GridLocation.NORTH,
            endLocation: GridLocation.EAST,
            arrowLocation: GridLocation.NORTH,
            gridMode: GridMode.DIAMOND,
          }),
          [HandSide.RIGHT]: createMotionData({
            hand: HandSide.RIGHT,
            startLocation: GridLocation.SOUTH,
            endLocation: GridLocation.WEST,
            arrowLocation: GridLocation.SOUTH,
            gridMode: GridMode.DIAMOND,
          }),
        },
      }),
    ],
  });
}

describe("tunnel composition", () => {
  it("stages one visible instance for each newly authored performer", () => {
    const lead = createIndependentTunnelPerformer(sequence("lead", 8), 0);
    const partner = createIndependentTunnelPerformer(sequence("partner", 8), 1);
    const composition = createTunnelComposition([lead, partner], {
      formation: {
        fold: 8,
        mirror: false,
        flip: false,
        invert: false,
        echo: false,
        staggerSteps: 0,
        speedOverrides: {},
      },
    });

    const plans = resolveTunnelLayerPlans(composition);

    expect(lead.label).toBe("Performer 1");
    expect(plans).toHaveLength(2);
    expect(plans.map((plan) => plan.sequence.id)).toEqual(["lead", "partner"]);
    expect(plans.map((plan) => plan.arm)).toEqual([0, 4]);
  });

  it("materializes every historical arm when migrating a generated cast", () => {
    const lead = createIndependentTunnelPerformer(sequence("lead", 8), 0);
    const partner = createIndependentTunnelPerformer(sequence("partner", 8), 1);
    const composition = createTunnelComposition([lead, partner], {
      formation: {
        fold: 8,
        mirror: false,
        flip: false,
        invert: false,
        echo: false,
        staggerSteps: 0,
        speedOverrides: {},
      },
      legacyGeneratedStage: true,
    });

    const plans = resolveTunnelLayerPlans(composition);

    expect(plans).toHaveLength(8);
    expect(plans.map((plan) => plan.sequence.id)).toEqual([
      "lead",
      "partner",
      "lead",
      "partner",
      "lead",
      "partner",
      "lead",
      "partner",
    ]);
  });

  it("preserves a version-one three-person four-arm result exactly", () => {
    const performers = ["p1", "p2", "p3"].map((id, index) => {
      const performer = createIndependentTunnelPerformer(
        sequence(id, 8),
        index
      );
      performer.id = id;
      return performer;
    });
    const parsed = TunnelCompositionSchema.parse({
      version: 1,
      id: "oregano",
      name: "Oregano",
      performers,
      formation: {
        fold: 4,
        mirror: false,
        flip: false,
        invert: false,
        echo: false,
        staggerSteps: 0,
        speedOverrides: {},
      },
      createdAt: 1,
      updatedAt: 1,
    });

    expect(parsed.version).toBe(2);
    expect(
      parsed.stage.instances.map((instance) => instance.performerId)
    ).toEqual(["p1", "p2", "p3", "p1"]);
    expect(
      resolveTunnelLayerPlans(parsed).map((plan) => plan.sequence.id)
    ).toEqual(["p1", "p2", "p3", "p1"]);
  });

  it("resolves a linked performer through its ordered transform recipe", () => {
    const lead = createIndependentTunnelPerformer(sequence("lead", 8), 0);
    const partner = createDerivedTunnelPerformer(lead.id, 1, [
      { kind: "rotate", amount: 2 },
      { kind: "mirror" },
    ]);
    const composition = createTunnelComposition([lead, partner]);

    const plans = resolveTunnelLayerPlans(composition);

    expect(plans[1]?.sequence.id).toBe("lead");
    expect(plans[1]?.ops.slice(0, 2)).toEqual([
      { kind: "rotate", amount: 2 },
      { kind: "mirror" },
    ]);
    expect(plans[1]?.sourceOps).toEqual([
      { kind: "rotate", amount: 2 },
      { kind: "mirror" },
    ]);
    expect(plans[1]?.formationOps).toEqual([{ kind: "rotate", amount: 4 }]);
  });

  it("keeps pairing choreography separate from formation placement and reconciles 45-degree geometry", async () => {
    const performerOne = createIndependentTunnelPerformer(
      geometricSequence("performer-one"),
      0
    );
    const performerTwo = createDerivedTunnelPerformer(performerOne.id, 1, [
      { kind: "rotate", amount: 1 },
    ]);

    const layers = await buildTunnelCompositionLayers(
      createTunnelComposition([performerOne, performerTwo]),
      {
        fold: 2,
        mirror: false,
        flip: false,
        invert: false,
        echo: false,
        staggerSteps: 0,
        speedOverrides: {},
      }
    );
    const partner = layers.find((layer) => layer.authoredPerformerIndex === 1)!;
    const pairedBlue =
      partner.performerSequence.steps[0]!.motions[HandSide.LEFT]!;
    const placedBlue = partner.sequence.steps[0]!.motions[HandSide.LEFT]!;

    expect(partner.performerSequence.gridMode).toBe(GridMode.BOX);
    expect(partner.performerSequence.steps[0]!.gridMode).toBe(GridMode.BOX);
    expect(pairedBlue.gridMode).toBe(GridMode.BOX);
    expect(pairedBlue.startLocation).toBe(GridLocation.NORTHEAST);
    expect(pairedBlue.arrowLocation).toBe(GridLocation.NORTHEAST);
    expect(placedBlue.startLocation).toBe(GridLocation.SOUTHWEST);
  });

  it("shows the rotated and mirrored stage sequences on partner cards", async () => {
    const lead = createIndependentTunnelPerformer(geometricSequence("lead"), 0);
    const rotated = createDerivedTunnelPerformer(lead.id, 1, [
      { kind: "rotate", amount: 1 },
    ]);
    const mirrored = createIndependentTunnelPerformer(
      geometricSequence("mirrored"),
      2
    );
    const layers = await buildTunnelCompositionLayers(
      createTunnelComposition([lead, rotated, mirrored]),
      {
        fold: 2,
        mirror: true,
        flip: false,
        invert: false,
        echo: false,
        staggerSteps: 2,
        speedOverrides: {},
      }
    );
    const displays = resolveTunnelPerformerDisplays(layers);
    const rotatedLayer = layers.find(
      (layer) => layer.performerId === rotated.id
    )!;
    const mirroredLayer = layers.find(
      (layer) => layer.performerId === mirrored.id
    )!;

    expect(rotatedLayer.formationOps).toEqual([{ kind: "rotate", amount: 4 }]);
    expect(mirroredLayer.formationOps).toContainEqual({ kind: "mirror" });
    for (const layer of [rotatedLayer, mirroredLayer]) {
      expect(displays[layer.performerId]?.sequence).toBe(layer.sequence);
      expect(
        displays[layer.performerId]?.sequence?.steps[0]?.motions
      ).not.toEqual(layer.performerSequence.steps[0]?.motions);
      expect(displays[layer.performerId]?.stageArms).toEqual([layer.arm]);
      expect(layer.stepOffset).toBeGreaterThan(0);
    }
  });

  it("rejects relationship cycles before rendering", () => {
    const lead = createIndependentTunnelPerformer(sequence("lead", 8), 0);
    const partner = createDerivedTunnelPerformer(lead.id, 1, []);
    lead.source = {
      kind: "derived",
      performerId: partner.id,
      transforms: [],
    };
    const composition = createTunnelComposition([lead, partner]);

    const result = validateTunnelComposition(composition);

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("relationship cycle");
  });

  it("supports eight authored performers without pair-shaped fields", () => {
    const performers = Array.from({ length: 8 }, (_, index) =>
      createIndependentTunnelPerformer(sequence(`p${index + 1}`, 8), index)
    );
    const composition = createTunnelComposition(performers, {
      formation: {
        fold: 8,
        mirror: false,
        flip: false,
        invert: false,
        echo: false,
        staggerSteps: 0,
        speedOverrides: {},
      },
    });

    expect(validateTunnelComposition(composition)).toEqual({
      valid: true,
      errors: [],
    });
    expect(
      resolveTunnelLayerPlans(composition).map((plan) => plan.sequence.id)
    ).toEqual(
      performers.map((performer) =>
        performer.source.kind === "independent"
          ? performer.source.sequence.id
          : ""
      )
    );
  });

  it("uses the least common multiple for independent loop lengths and speeds", () => {
    const lead = createIndependentTunnelPerformer(sequence("lead", 8), 0);
    const partner = createIndependentTunnelPerformer(
      sequence("partner", 12),
      1
    );
    partner.timing.speed = 0.5;
    const composition = createTunnelComposition([lead, partner]);

    expect(tunnelCompositionCycleSteps(composition)).toBe(24);
  });

  it("plays an 8-step and 10-step pair for 40 steps before repeating", () => {
    const performerOne = createIndependentTunnelPerformer(
      sequence("performer-one", 8),
      0
    );
    const performerTwo = createIndependentTunnelPerformer(
      sequence("performer-two", 10),
      1
    );

    expect(
      tunnelCompositionCycleSteps(
        createTunnelComposition([performerOne, performerTwo])
      )
    ).toBe(40);
  });

  it("uses authored source lineage instead of a constructed realization id", () => {
    const performer = createIndependentTunnelPerformer(
      sequence("shape-matrix:realization", 4),
      0,
      "Performer 1",
      { sourceSequenceId: "l1-tnd-base-word" }
    );
    const composition = createTunnelComposition([performer]);

    expect(primaryTunnelSourceSequenceId(composition, "viewer-fallback")).toBe(
      "l1-tnd-base-word"
    );
    expect(primaryTunnelSourceSequenceId(null, "viewer-fallback")).toBe(
      "viewer-fallback"
    );
  });
});

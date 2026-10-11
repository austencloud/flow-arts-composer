import {
  FORMATION_PRESET_INFO,
  PRESET_VALID_COUNTS,
  createFormationFromPreset,
  type FormationPreset,
} from "@austencloud/scene-3d";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createDefaultCosmicNightConfig,
  createDefaultEmberConfig,
  createDefaultRainbowConfig,
  createDefaultVoidConfig,
  createDefaultWinterConfig,
} from "#lib/shared/3d/environments/domain/models/scene-configs.js";
import {
  getPerformerStageBounds,
  getPerformerStageClearance,
  resolveCircularStageRadius,
  type PerformerStageBounds,
  type PerformerStagePosition,
} from "#lib/shared/3d/environments/domain/performer-stage-bounds.js";

interface CloudbreakLayout {
  performanceTerrace: {
    centerXZ: [number, number];
  };
}

type StageSpec =
  | {
      id: "forest" | "autumn" | "ocean" | "blossom";
      shape: "rectangle";
      minimumWidth: number;
      minimumDepth: number;
    }
  | {
      id: "cosmic" | "winter" | "ember" | "rainbow" | "celestial" | "void";
      shape: "circle";
      minimumRadius: number;
      center: PerformerStagePosition;
    };

const layout = JSON.parse(
  readFileSync(resolve("scripts/seraphic-vault-cloudbreak-layout.json"), "utf8")
) as CloudbreakLayout;

const [celestialCenterX, celestialCenterZ] = layout.performanceTerrace.centerXZ;

const STAGES: readonly StageSpec[] = [
  {
    id: "forest",
    shape: "rectangle",
    minimumWidth: 6,
    minimumDepth: 4.5,
  },
  {
    id: "autumn",
    shape: "rectangle",
    minimumWidth: 6,
    minimumDepth: 6,
  },
  {
    id: "ocean",
    shape: "rectangle",
    minimumWidth: 8,
    minimumDepth: 6,
  },
  {
    id: "blossom",
    shape: "rectangle",
    minimumWidth: 6,
    minimumDepth: 6,
  },
  {
    id: "cosmic",
    shape: "circle",
    minimumRadius: createDefaultCosmicNightConfig().platform.radius,
    center: { x: 0, z: 0 },
  },
  {
    id: "winter",
    shape: "circle",
    minimumRadius: createDefaultWinterConfig().platform.radius,
    center: { x: 0, z: 0 },
  },
  {
    id: "ember",
    shape: "circle",
    minimumRadius: createDefaultEmberConfig().platform.radius,
    center: { x: 0, z: 0 },
  },
  {
    id: "rainbow",
    shape: "circle",
    minimumRadius: createDefaultRainbowConfig().platform.radius,
    center: { x: 0, z: 0 },
  },
  {
    id: "celestial",
    shape: "circle",
    minimumRadius: 6.08,
    center: { x: celestialCenterX, z: celestialCenterZ },
  },
  {
    id: "void",
    shape: "circle",
    minimumRadius: createDefaultVoidConfig().platform.radius,
    center: { x: 0, z: 0 },
  },
] as const;

// UserProportionsState accepts 100-250 cm. Its avatar scale is relative to the
// package's 188 cm base model, so these cover the complete supported range.
const PERFORMER_SIZES = [
  { label: "100cm", avatarScale: 100 / 188 },
  { label: "188cm", avatarScale: 1 },
  { label: "250cm", avatarScale: 250 / 188 },
] as const;

const EPSILON = 1e-9;

function assertStageContainsFormation(
  stage: StageSpec,
  bounds: PerformerStageBounds,
  positions: readonly PerformerStagePosition[],
  performerClearance: number,
  caseLabel: string
): void {
  if (stage.shape === "rectangle") {
    const halfWidth = Math.max(stage.minimumWidth, bounds.width) / 2;
    const halfDepth = Math.max(stage.minimumDepth, bounds.depth) / 2;

    for (const [performerIndex, position] of positions.entries()) {
      expect(
        Math.abs(position.x) + performerClearance,
        `${caseLabel}, ${stage.id}, performer ${performerIndex + 1}: x clearance`
      ).toBeLessThanOrEqual(halfWidth + EPSILON);
      expect(
        Math.abs(position.z) + performerClearance,
        `${caseLabel}, ${stage.id}, performer ${performerIndex + 1}: z clearance`
      ).toBeLessThanOrEqual(halfDepth + EPSILON);
    }
    return;
  }

  const stageRadius = resolveCircularStageRadius(
    bounds.radius,
    stage.minimumRadius,
    stage.center
  );
  for (const [performerIndex, position] of positions.entries()) {
    expect(
      Math.hypot(position.x - stage.center.x, position.z - stage.center.z) +
        performerClearance,
      `${caseLabel}, ${stage.id}, performer ${performerIndex + 1}: radial clearance`
    ).toBeLessThanOrEqual(stageRadius + EPSILON);
  }
}

function getPresetPositions(
  preset: FormationPreset,
  performerCount: number
): PerformerStagePosition[] {
  return createFormationFromPreset(preset, performerCount).slots.map(
    ({ position }) => position
  );
}

describe("performer-aware morphing stages", () => {
  it("keeps the empty and solo stage at the canonical footprint", () => {
    expect(getPerformerStageBounds([])).toEqual({
      width: 6,
      depth: 6,
      radius: 3,
      zOffset: 0,
    });
    expect(getPerformerStageBounds([{ x: 0, z: 0 }])).toEqual({
      width: 6,
      depth: 6,
      radius: 3,
      zOffset: 0,
    });
  });

  it("contains every built-in formation, valid count, stage, and performer size", () => {
    let evaluatedStageCases = 0;

    for (const { id: preset } of FORMATION_PRESET_INFO) {
      for (const performerCount of PRESET_VALID_COUNTS[preset]) {
        const positions = getPresetPositions(preset, performerCount);

        for (const size of PERFORMER_SIZES) {
          const performerClearance = getPerformerStageClearance(
            size.avatarScale
          );
          const bounds = getPerformerStageBounds(positions, {
            performerClearance,
          });
          const caseLabel = `${preset}/${performerCount}/${size.label}`;

          for (const stage of STAGES) {
            assertStageContainsFormation(
              stage,
              bounds,
              positions,
              performerClearance,
              caseLabel
            );
            evaluatedStageCases += 1;
          }
        }
      }
    }

    expect(evaluatedStageCases).toBe(1620);
  });

  it("contains every compatible formation morph at five transition samples", () => {
    let evaluatedStageCases = 0;

    for (let performerCount = 1; performerCount <= 8; performerCount += 1) {
      const compatiblePresets = FORMATION_PRESET_INFO.map(
        ({ id }) => id
      ).filter((preset) =>
        PRESET_VALID_COUNTS[preset].includes(performerCount)
      );

      for (
        let fromIndex = 0;
        fromIndex < compatiblePresets.length;
        fromIndex += 1
      ) {
        for (
          let toIndex = fromIndex + 1;
          toIndex < compatiblePresets.length;
          toIndex += 1
        ) {
          const fromPreset = compatiblePresets[fromIndex]!;
          const toPreset = compatiblePresets[toIndex]!;
          const from = getPresetPositions(fromPreset, performerCount);
          const to = getPresetPositions(toPreset, performerCount);

          for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
            const positions = from.map((position, index) => ({
              x: position.x + (to[index]!.x - position.x) * progress,
              z: position.z + (to[index]!.z - position.z) * progress,
            }));

            for (const size of PERFORMER_SIZES) {
              const performerClearance = getPerformerStageClearance(
                size.avatarScale
              );
              const bounds = getPerformerStageBounds(positions, {
                performerClearance,
              });
              const caseLabel = `${fromPreset}->${toPreset}/${performerCount}/${progress}/${size.label}`;

              for (const stage of STAGES) {
                assertStageContainsFormation(
                  stage,
                  bounds,
                  positions,
                  performerClearance,
                  caseLabel
                );
                evaluatedStageCases += 1;
              }
            }
          }
        }
      }
    }

    expect(evaluatedStageCases).toBe(24_300);
  });

  it("grows around manual off-center custom positions without moving the stage", () => {
    const positions = [
      { x: 7, z: -4 },
      { x: -1, z: 6 },
    ];

    for (const size of PERFORMER_SIZES) {
      const performerClearance = getPerformerStageClearance(size.avatarScale);
      const bounds = getPerformerStageBounds(positions, {
        performerClearance,
      });

      expect(bounds.zOffset).toBe(0);
      for (const stage of STAGES) {
        assertStageContainsFormation(
          stage,
          bounds,
          positions,
          performerClearance,
          `custom/${size.label}`
        );
      }
    }
  });
});

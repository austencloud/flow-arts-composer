import type { SceneEnvironmentId } from "#lib/shared/3d/environments/domain/scene-environment.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

import type { FormationPresetId, StageChoreography } from "./stage-types";

/**
 * The small, versioned envelope shared by every 3D Studio entry point.
 *
 * Stage remains the document owner. The envelope gives future Director and
 * JSON handoffs one stable name and version without inventing a second scene
 * representation for the guided surface.
 */
export const STUDIO_PROJECT_SCHEMA = "tka.studio-project";
export const STUDIO_PROJECT_VERSION = 1 as const;

export interface StudioProjectV1 {
  schema: typeof STUDIO_PROJECT_SCHEMA;
  version: typeof STUDIO_PROJECT_VERSION;
  stage: StageChoreography;
}

export type StudioStartingMaterial = "recommended" | "choose-sequence";

export const STUDIO_PERFORMER_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type StudioPerformerCount = (typeof STUDIO_PERFORMER_COUNTS)[number];

/** Only combinations the canonical Stage and performer manager can fulfil. */
export interface StudioStarter {
  startingMaterial: StudioStartingMaterial;
  performerCount: StudioPerformerCount;
  formation: FormationPresetId;
  environmentId: SceneEnvironmentId;
  prop: PropType;
}

export const RECOMMENDED_STUDIO_STARTER: StudioStarter = {
  startingMaterial: "recommended",
  performerCount: 4,
  formation: "v-shape",
  environmentId: "ember",
  prop: PropType.STAFF,
};

export function studioProjectFromStage(
  stage: StageChoreography
): StudioProjectV1 {
  return {
    schema: STUDIO_PROJECT_SCHEMA,
    version: STUDIO_PROJECT_VERSION,
    stage,
  };
}

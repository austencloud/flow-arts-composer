import type { ViewerPerformerAppearanceAssignment } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";
import { resolveArrangeTargetIndex } from "../domain/active-formation";
import type { FormationPresetId } from "../domain/stage-types";
import type {
  TikaDirectorAction,
  TikaDirectorResponse,
} from "../domain/tika-director";
import type {
  PerformerSequenceAssignment,
  StageChoreographyState,
} from "../state/stage-choreography-state.svelte";
import { resolveDirectorAppearanceAssignments } from "./tika-director-service";

/**
 * Every action type this executor knows how to apply. The registry contract
 * test checks each registered verb against it, so a verb cannot be planned
 * without a way to run.
 */
export const TIKA_EXECUTED_ACTION_TYPES: ReadonlySet<string> = new Set([
  "assign-distinct-props",
  "assign-distinct-characters",
  "assign-distinct-sequences",
  "formation-transition",
  "arrange-formation",
]);

/** One fixed spacing step; "more" repeats it. */
const SPACING_STEP = 1.15;
/** One nudge in stage metres. Audience left is -x; toward the audience is -z. */
const SHIFT_METRES = 1;

export interface TikaDirectorExecutionContext {
  stageState: Pick<
    StageChoreographyState,
    | "choreography"
    | "assertFormationTransitionAllowed"
    | "applyFormationTransition"
    | "applyPresetToFormation"
    | "transformFormationSpots"
    | "assignPerformerSequences"
    | "undo"
  >;
  viewer: {
    applyPerformerAppearanceAssignments(
      assignments: ViewerPerformerAppearanceAssignment[]
    ): boolean;
    performerManager: { cancelFormationTransition(): void };
    undo(): void;
  };
  /** The playhead when the direction was submitted, not when it resolved. */
  requestBeat: number;
  selectedFormationId: string | null;
  seedKey: string;
  /** Hydrated sequences picked while the plan resolved; applied synchronously. */
  sequencePicks: readonly PerformerSequenceAssignment[];
  preloadSequence?: (pick: PerformerSequenceAssignment) => void;
}

type ApplyResponse = Extract<TikaDirectorResponse, { kind: "apply" }>;
type ArrangeAction = Extract<TikaDirectorAction, { type: "arrange-formation" }>;
type MoveAction = Extract<TikaDirectorAction, { type: "formation-transition" }>;

/**
 * Apply an accepted plan to the live scene. Returns one closure that undoes
 * everything the plan changed, or undefined when nothing changed.
 */
export function executeTikaDirectorPlan(
  response: ApplyResponse,
  ctx: TikaDirectorExecutionContext
): (() => void) | undefined {
  const moves = response.actions.filter(
    (action): action is MoveAction => action.type === "formation-transition"
  );
  const arranges = response.actions.filter(
    (action): action is ArrangeAction => action.type === "arrange-formation"
  );
  if (moves.length > 1) {
    throw new Error(
      "TIKA returned competing formation moves. Ask for one transition at a time."
    );
  }
  if (moves.length > 0 && arranges.length > 0) {
    throw new Error(
      "TIKA tried to arrange and move the same set at once. Ask for the shape now, or the move with its count."
    );
  }

  const { choreography } = ctx.stageState;
  const performerIds = choreography.performers.map((performer) => performer.id);
  const assignments = resolveDirectorAppearanceAssignments({
    actions: response.actions,
    performerIds,
    seedKey: ctx.seedKey,
  });
  const move = moves[0];
  if (move) {
    ctx.stageState.assertFormationTransitionAllowed(
      move.startFormation,
      ctx.requestBeat
    );
  }
  const target =
    arranges.length > 0
      ? choreography.formations[
          resolveArrangeTargetIndex(
            choreography.formations,
            ctx.selectedFormationId,
            ctx.requestBeat
          )
        ]
      : undefined;
  if (arranges.length > 0 && !target) {
    throw new Error("There is no formation set to arrange yet.");
  }

  const viewerChanged =
    assignments.length > 0 &&
    ctx.viewer.applyPerformerAppearanceAssignments(assignments);
  for (const pick of ctx.sequencePicks) ctx.preloadSequence?.(pick);

  // Every stage mutation below pushes exactly one history entry.
  let stageUndos = 0;
  if (
    ctx.sequencePicks.length > 0 &&
    ctx.stageState.assignPerformerSequences(ctx.sequencePicks)
  ) {
    stageUndos++;
  }
  if (
    move &&
    ctx.stageState.applyFormationTransition(
      move.endFormation,
      move.durationBeats,
      move.startFormation,
      ctx.requestBeat
    )
  ) {
    stageUndos++;
  }
  for (const arrange of arranges) {
    if (arrange.shape) {
      ctx.stageState.applyPresetToFormation(
        target!.id,
        arrange.shape as FormationPresetId
      );
      stageUndos++;
    } else if (arrange.spacing) {
      if (
        ctx.stageState.transformFormationSpots(target!.id, {
          scale: arrange.spacing === "wider" ? SPACING_STEP : 1 / SPACING_STEP,
        })
      ) {
        stageUndos++;
      }
    } else if (arrange.shift) {
      const dx =
        arrange.shift === "left"
          ? -SHIFT_METRES
          : arrange.shift === "right"
            ? SHIFT_METRES
            : 0;
      const dz =
        arrange.shift === "forward"
          ? -SHIFT_METRES
          : arrange.shift === "back"
            ? SHIFT_METRES
            : 0;
      if (ctx.stageState.transformFormationSpots(target!.id, { dx, dz })) {
        stageUndos++;
      }
    }
  }
  if (arranges.length > 0) {
    // Like the Formation tool: the reseeded set wins over any in-flight walk.
    ctx.viewer.performerManager.cancelFormationTransition();
  }

  if (!viewerChanged && stageUndos === 0) return undefined;
  return () => {
    for (let i = 0; i < stageUndos; i++) ctx.stageState.undo();
    if (viewerChanged) ctx.viewer.undo();
  };
}

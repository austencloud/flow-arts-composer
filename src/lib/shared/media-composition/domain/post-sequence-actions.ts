import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  POST_MAX_SEQUENCE_ACTIONS,
  type PostProject,
  type PostSequenceAction,
} from "$lib/shared/media-composition/domain/post-project";
import {
  finish,
  type EditContext,
} from "$lib/shared/media-composition/domain/post-project-edits";

/**
 * The whole-sequence changes a post makes to its notation, in the order they
 * were pressed. They turn the post's animation, moves and card together and
 * never touch the saved sequence or the footage, so lining the notation up
 * with a clip stays the author's call. Rotations turn a quarter, which keeps
 * the grid's shape.
 */

const UNDOES: Record<PostSequenceAction, PostSequenceAction> = {
  mirror: "mirror",
  flip: "flip",
  swap: "swap",
  "rotate-left": "rotate-right",
  "rotate-right": "rotate-left",
};

/**
 * The list after one more press. A press that undoes the last one removes it,
 * and a fourth quarter turn the same way removes all four, so pressing back to
 * where the post started leaves nothing to replay.
 */
export function withSequenceAction(
  actions: readonly PostSequenceAction[],
  action: PostSequenceAction
): PostSequenceAction[] {
  if (actions.at(-1) === UNDOES[action]) return actions.slice(0, -1);
  const next = [...actions, action];
  const lastFour = next.slice(-4);
  if (
    action.startsWith("rotate") &&
    lastFour.length === 4 &&
    lastFour.every((entry) => entry === action)
  ) {
    return next.slice(0, -4);
  }
  return next.slice(-POST_MAX_SEQUENCE_ACTIONS);
}

function withActions(
  project: PostProject,
  actions: readonly PostSequenceAction[]
): PostProject {
  const { sequenceActions: _previous, ...rest } = project;
  return actions.length ? { ...rest, sequenceActions: [...actions] } : rest;
}

export function pressSequenceAction(
  project: PostProject,
  action: PostSequenceAction,
  ctx: EditContext
): PostProject {
  return finish(
    withActions(
      project,
      withSequenceAction(project.sequenceActions ?? [], action)
    ),
    ctx
  );
}

export function resetSequenceActions(
  project: PostProject,
  ctx: EditContext
): PostProject {
  return finish(withActions(project, []), ctx);
}

/** The Composer's transforms, injected so the domain stays free of services. */
export interface PostSequenceTransforms {
  mirror(sequence: SequenceData): Promise<SequenceData>;
  flip(sequence: SequenceData): Promise<SequenceData>;
  /** A quarter turn: 1 to the right, -1 to the left. */
  rotate(sequence: SequenceData, quarterTurns: 1 | -1): Promise<SequenceData>;
  swap(sequence: SequenceData): SequenceData;
}

export async function applySequenceActions(
  sequence: SequenceData,
  actions: readonly PostSequenceAction[],
  transforms: PostSequenceTransforms
): Promise<SequenceData> {
  let result = sequence;
  for (const action of actions) {
    switch (action) {
      case "mirror":
        result = await transforms.mirror(result);
        break;
      case "flip":
        result = await transforms.flip(result);
        break;
      case "rotate-left":
        result = await transforms.rotate(result, -1);
        break;
      case "rotate-right":
        result = await transforms.rotate(result, 1);
        break;
      case "swap":
        result = transforms.swap(result);
        break;
    }
  }
  return result;
}

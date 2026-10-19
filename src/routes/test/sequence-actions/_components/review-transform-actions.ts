import {
  createSequenceTransformActionDispatcher,
  type SequenceTransformActionState,
} from "#lib/features/create/shared/services/sequence-transform-action-dispatcher.js";

export function createReviewTransformActions(
  getSequenceState: () => SequenceTransformActionState
) {
  return createSequenceTransformActionDispatcher({
    getSequenceState,
    getCreateMode: () => "sequence-actions-review",
    // The review frame has no undo history, but the dispatcher still needs a
    // transaction callback so an action can run and finish normally.
    beginUndoSnapshot: () => () => {},
    hapticService: null,
    setGridRotationDirection: () => {},
  });
}

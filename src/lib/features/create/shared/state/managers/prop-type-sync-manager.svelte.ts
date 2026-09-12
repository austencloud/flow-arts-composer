/**
 * Prop Type Sync Manager
 *
 * Watches for prop type changes in settings and bulk updates all motions.
 *
 * Stamping the new prop onto every motion rewrites the current sequence, which
 * advances its revision. Anything watching that revision for "the user edited
 * the sequence" would misread a prop swap as an edit, so this manager reports
 * the revision delta it caused through `onPropTypeSequenceRewrite`.
 */

import { untrack } from "svelte";
import { getSettings } from "$lib/shared/application/state/app-state.svelte";
import type { StepOperator } from "$lib/features/create/shared/services/step-operator";
import type { CreateModuleState } from "../create-module-state.svelte";

export interface PropTypeSyncConfig {
  getStepOperator: () => StepOperator | null;
  getCreateModuleState: () => CreateModuleState | null;
  isServicesInitialized: () => boolean;
  /** Revision of the sequence the workspace is currently showing. */
  getSequenceRevision?: () => number;
  /**
   * Called only when a prop swap actually rewrote the sequence, with the
   * revision before and after the rewrite.
   */
  onPropTypeSequenceRewrite?: (fromRevision: number, toRevision: number) => void;
}

export function createPropTypeSyncEffect(
  config: PropTypeSyncConfig
): () => void {
  const {
    getStepOperator,
    getCreateModuleState,
    isServicesInitialized,
    getSequenceRevision,
    onPropTypeSequenceRewrite,
  } = config;

  let previousLeftPropType: string | undefined = undefined;
  let previousRightPropType: string | undefined = undefined;

  // The revision is read for bookkeeping only. Tracking it would re-run this
  // effect on every sequence edit for no reason.
  const readRevision = () =>
    getSequenceRevision ? untrack(() => getSequenceRevision()) : null;

  const cleanup = $effect.root(() => {
    $effect(() => {
      if (!isServicesInitialized()) return;

      const StepOperator = getStepOperator();
      const createModuleState = getCreateModuleState();
      if (!StepOperator || !createModuleState) return;

      const settings = getSettings();
      const newLeftPropType = settings.leftPropType;
      const newRightPropType = settings.rightPropType;

      const revisionBefore = readRevision();
      let rewroteSequence = false;

      // Sync on initial load AND when prop type changes
      // Removed `previousPropType !== undefined` check - we need to sync on mount
      // to ensure start positions (created with default STAFF) match user settings
      if (newLeftPropType && newLeftPropType !== previousLeftPropType) {
        StepOperator.bulkUpdatePropType(
          "blue",
          newLeftPropType,
          createModuleState
        );
        rewroteSequence = true;
      }
      previousLeftPropType = newLeftPropType;

      if (newRightPropType && newRightPropType !== previousRightPropType) {
        StepOperator.bulkUpdatePropType(
          "red",
          newRightPropType,
          createModuleState
        );
        rewroteSequence = true;
      }
      previousRightPropType = newRightPropType;

      if (!rewroteSequence || revisionBefore === null) return;

      const revisionAfter = readRevision();
      if (revisionAfter === null || revisionAfter === revisionBefore) return;

      onPropTypeSequenceRewrite?.(revisionBefore, revisionAfter);
    });
  });

  return cleanup;
}

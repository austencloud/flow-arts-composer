import {
  reportViewerControlChange,
  type ViewerControlSink,
} from "#lib/shared/sequence-viewer/domain/viewer-control-analytics.js";

interface BeatPlaneStepSelectionArgs {
  currentStep: number;
  targetStep: number;
  goToStep: (step: number) => void;
  onSettingChange?: ViewerControlSink;
}

/**
 * Move the beat-plane editor once, then report that editor-local selection.
 * This deliberately does not call the shared timeline seek callback.
 */
export function selectBeatPlaneStep({
  currentStep,
  targetStep,
  goToStep,
  onSettingChange,
}: BeatPlaneStepSelectionArgs): boolean {
  goToStep(targetStep);
  return reportViewerControlChange(
    onSettingChange,
    "viewer_3d_planes",
    "beat_step",
    currentStep,
    targetStep
  );
}

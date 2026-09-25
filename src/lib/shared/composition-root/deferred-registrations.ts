/**
 * Deferred Registrations
 *
 * Service registrations that are NOT needed for initial Browse/Create render.
 * Loaded via requestIdleCallback after the critical path completes.
 *
 * Moved out of index.ts to cut ~3s off composition-root import time:
 * - VideoExportOrchestrator pulls mediabunny + WebCodecs at import
 * - FeedbackTesterWorkflow pulls Firestore + notification services
 * - TagMigrator pulls tag-manager
 */

import { registerTagMigrator } from "$lib/shared/library/get-tag-migrator";
import { migrateSequenceTags } from "$lib/features/library/services/migrations/tag-migration";

import { registerFeedbackTesterWorkflow } from "$lib/shared/feedback/services/IFeedbackTesterWorkflow";
import { feedbackTesterWorkflowService } from "$lib/features/feedback/services/feedback-tester-workflow";

import { registerVideoExportOrchestratorFactory } from "../animation-engine/get-video-export-orchestrator";
import { getVideoExporter } from "../animation-engine/get-video-exporter";
import { getCompositeVideoRenderer } from "../animation-engine/get-composite-video-renderer";
import { getExportGlyphPrerenderer } from "../animation-engine/get-export-glyph-prerenderer";
import { getBackgroundVideoEncoder } from "../animation-engine/get-background-video-encoder";
import { VideoExportOrchestrator } from "$lib/features/compose/services/video-export-orchestrator";

import { registerAnimationOverlayPainterFactory } from "../media-composition/services/animation-overlay-painter-registry";
import { PostAnimationOverlayPainter } from "$lib/features/compose/services/post-animation-overlay-painter";

import { getQRCodeGenerator } from "../qr/get-qr-code-generator";
import { getImageComposer } from "../render/get-image-composer";

import { getTipPointOverrideProvider } from "$lib/features/lab/effects-lab/get-tip-point-override-provider";

// Register tip-point + trail-point override providers globally so tip-lab
// assignments (e.g. fan trails emit from tip 3) apply in the sequence viewer,
// not just while the effects-lab editor tab is mounted.
try {
  getTipPointOverrideProvider();
} catch (error) {
  console.warn(
    "[DeferredRegistrations] Tip point override provider init failed:",
    error
  );
}

registerTagMigrator(migrateSequenceTags);
registerFeedbackTesterWorkflow(feedbackTesterWorkflowService);

registerVideoExportOrchestratorFactory(
  () =>
    new VideoExportOrchestrator(
      getVideoExporter(),
      getCompositeVideoRenderer(),
      getExportGlyphPrerenderer(),
      getBackgroundVideoEncoder()
    )
);

// Post Studio's animation panel paints trails/props/grid on its own canvas
// but not the beat number, letter glyph, element icon or progress bar (those
// are DOM overlays elsewhere in AnimatorCanvas) - this factory gives it a
// painter that draws the same overlays the Animate export bakes in. See
// post-animation-overlay-painter.ts for why it lives in features/compose
// instead of shared/.
registerAnimationOverlayPainterFactory(
  (sequence) => new PostAnimationOverlayPainter(sequence)
);

try {
  const composer = getImageComposer();
  if (composer) {
    (
      composer as unknown as { setQRCodeGenerator: (g: unknown) => void }
    ).setQRCodeGenerator(getQRCodeGenerator());
  }
} catch {
  // ImageComposer not yet initialized - QR injection will happen on first use
}

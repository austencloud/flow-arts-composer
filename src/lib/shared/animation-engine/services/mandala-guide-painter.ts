import type { MandalaOverlayCanvas } from "#lib/shared/mandala/services/mandala-overlay-canvas.js";
import { MandalaPathPreparer } from "#lib/shared/mandala/services/mandala-path-preparer.js";
import { mandalaOffsetsFromHandUnits } from "#lib/shared/mandala/services/mandala-grid-join.js";
import {
  DEFAULT_MANDALA_OVERLAY_CONFIG,
  type MandalaOverlayConfig,
  MANDALA_GUIDE_FLOOR_OPACITY,
} from "#lib/shared/mandala/domain/mandala-overlay-types.js";
import type { MandalaHandVisibility } from "#lib/shared/mandala/domain/mandala-types.js";
import type { CanvasFrame } from "../domain/types/canvas-frame";
import type { RenderFrameParams } from "./IAnimationRenderLoop";

const MANDALA_GUIDE_CONFIG: MandalaOverlayConfig = {
  ...DEFAULT_MANDALA_OVERLAY_CONFIG,
  enabled: true,
  mode: "guide",
  // Shared with the Shape Matrix hero floor so the live trail remains the
  // brightest read while it runs directly over the mandala path, and the
  // still floor → live guide handoff changes nothing on screen.
  opacity: MANDALA_GUIDE_FLOOR_OPACITY,
};

/**
 * Paint the complete engine-aligned path guide beneath the scene. Geometry is
 * cached by sequence, path policy, prop types, and resolved trail endpoints,
 * so the per-frame path is an identity check after the first preparation.
 */
export class MandalaGuidePainter {
  private overlay: MandalaOverlayCanvas | null = null;
  private readonly pathPreparer = new MandalaPathPreparer();
  private previousPaths: ReturnType<MandalaPathPreparer["prepare"]> = null;
  private guideConfigByStroke: MandalaOverlayConfig = MANDALA_GUIDE_CONFIG;

  /** Adopt the host's overlay canvas (or none) and size it to the frame. */
  setOverlay(overlay: MandalaOverlayCanvas | null, frame: CanvasFrame): void {
    this.overlay = overlay;
    this.overlay?.resize(frame.width, frame.height);
  }

  /** The painted frame changed: geometry prepared for the old square is stale. */
  resize(frame: CanvasFrame): void {
    this.overlay?.resize(frame.width, frame.height);
    this.forgetPreparedPaths();
  }

  forgetPreparedPaths(): void {
    this.pathPreparer.clearCache();
    this.previousPaths = null;
  }

  isTransitioning(): boolean {
    return this.overlay?.isTransitioning() ?? false;
  }

  dispose(): void {
    this.overlay = null;
    this.forgetPreparedPaths();
  }

  /** The guide config, with the post's per-animation line width when set. */
  private guideConfig(params: RenderFrameParams): MandalaOverlayConfig {
    const strokeWidth =
      params.mandalaStrokeWidth ?? MANDALA_GUIDE_CONFIG.strokeWidth;
    if (this.guideConfigByStroke.strokeWidth !== strokeWidth) {
      this.guideConfigByStroke = { ...MANDALA_GUIDE_CONFIG, strokeWidth };
    }
    return this.guideConfigByStroke;
  }

  render(
    params: RenderFrameParams,
    deltaTime: number,
    currentTime: number,
    showLeft: boolean,
    showRight: boolean,
    renderKeys: { left: string | null; right: string | null } | null,
    canvasSize: number
  ): void {
    const overlay = this.overlay;
    if (!overlay) return;

    const steps = params.mandalaSteps;
    if (
      !params.mandalaVisible ||
      params.suppress2DOverlays ||
      !steps ||
      steps.length === 0 ||
      (!showLeft && !showRight)
    ) {
      overlay.setVisible(false);
      return;
    }

    // Joined grids: each hand's figure sits on its own grid, moved exactly as
    // that hand's props are (sliding with them while the layout changes).
    const handOffsets = mandalaOffsetsFromHandUnits(params.gridJoinOffsets);

    // A prop type becomes reactive before its replacement texture finishes
    // loading. Keep the old guide in place during that gap so the mandala and
    // prop begin their crossfades together once the new artwork is ready.
    if (params.trailsSuppressedUntilTextureLoad && this.previousPaths) {
      overlay.setVisible(true);
      overlay.renderFrame({
        preparedPaths: this.previousPaths,
        progress: 1,
        config: this.guideConfig(params),
        deltaTime,
        currentTime,
        canvasSize,
        currentStep: params.currentStep,
        handOffsets,
      });
      return;
    }

    const show: MandalaHandVisibility =
      showLeft && showRight ? "both" : showLeft ? "left" : "right";
    const preparedPaths = this.pathPreparer.prepare(steps, canvasSize, {
      show,
      leftPropType: params.leftPropType,
      rightPropType: params.rightPropType,
      leftPropRenderKey: renderKeys?.left ?? null,
      rightPropRenderKey: renderKeys?.right ?? null,
      leftPropFlipped: params.leftPropFlipped ?? false,
      rightPropFlipped: params.rightPropFlipped ?? false,
      trackingMode: params.trailSettings.trackingMode,
      pathOptions: params.mandalaPathOptions,
      leftColor:
        params.primaryPropColors?.left ?? params.trailSettings.leftColor,
      rightColor:
        params.primaryPropColors?.right ?? params.trailSettings.rightColor,
      sequenceKey: params.sequenceContentHash,
    });

    if (!preparedPaths) {
      overlay.setVisible(false);
      return;
    }

    if (
      MANDALA_GUIDE_CONFIG.mode === "drawing" &&
      this.previousPaths !== preparedPaths
    ) {
      overlay.clear();
    }
    this.previousPaths = preparedPaths;
    overlay.setVisible(true);
    overlay.renderFrame({
      preparedPaths,
      progress: 1,
      config: this.guideConfig(params),
      deltaTime,
      currentTime,
      canvasSize,
      currentStep: params.currentStep,
      handOffsets,
    });
  }
}

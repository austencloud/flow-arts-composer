import type { CanvasResizer } from "./canvas-resizer.svelte";
import type { EffectRendererManager } from "./effect-renderer-manager";
import type { TrailCapturer } from "./trail-capturer";
import type { IAnimationRenderLoop } from "$lib/shared/animation-engine/services/IAnimationRenderLoop";
import {
  sameFrame,
  squareFrame,
  type CanvasFrame,
} from "../domain/types/canvas-frame";

export interface SyncServiceDeps {
  canvasResizerService: CanvasResizer | null;
  trailCapturer: TrailCapturer | null;
  renderLoopService: IAnimationRenderLoop | null;
  effectRendererManager: EffectRendererManager;
}

export class StateSynchronizer {
  private frame: CanvasFrame = squareFrame(500);

  syncResizeState(deps: SyncServiceDeps): number {
    if (deps.canvasResizerService) {
      const next = deps.canvasResizerService.state.frame;
      if (next.size && !sameFrame(next, this.frame)) {
        this.frame = next;
        deps.trailCapturer?.updateConfig({ canvasSize: next.size });
        deps.renderLoopService?.updateConfig({
          canvasSize: next.size,
          canvasFrame: next,
        });
        deps.effectRendererManager.resizeAll(next);
      }
    }
    return this.frame.size;
  }

  getCanvasSize(): number {
    return this.frame.size;
  }

  setCanvasSize(size: number): void {
    this.frame = squareFrame(size);
  }
}

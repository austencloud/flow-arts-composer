import { describe, expect, it, vi } from "vitest";
import type { AnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
import type { VideoExporter } from "$lib/shared/animation-engine/services/video-exporter";
import type { CompositeVideoRenderer } from "$lib/shared/animation-engine/services/composite-video-renderer";
import type { ExportGlyphPrerenderer } from "$lib/shared/animation-engine/services/export-glyph-prerenderer";
import type { BackgroundVideoEncoder } from "$lib/shared/animation-engine/services/background-video-encoder";

vi.mock(
  "$lib/shared/animation-engine/state/animation-visibility-state.svelte",
  () => ({
    getAnimationVisibilityManager: () => ({ getVisibility: () => false }),
  })
);

import { VideoExportOrchestrator } from "./video-export-orchestrator";

describe("video export setup", () => {
  it("releases a failed encoder initialization so a later export can retry", async () => {
    const encoder = {
      initialize: vi.fn().mockRejectedValue(new Error("codec unavailable")),
      cancel: vi.fn(),
      onProgress: null,
    } as unknown as BackgroundVideoEncoder;
    const orchestrator = new VideoExportOrchestrator(
      { cancelExport: vi.fn() } as unknown as VideoExporter,
      {} as CompositeVideoRenderer,
      {} as ExportGlyphPrerenderer,
      encoder
    );
    const canvas = { width: 320, height: 320 } as HTMLCanvasElement;
    const playback = {
      isSeamlesslyLoopable: false,
    } as AnimationPlaybackController;
    const panel = {
      sequenceData: null,
      sequenceWord: "test",
      totalSteps: 1,
      speed: 1,
      exportLoopCount: 1,
    } as AnimationPanelState;
    const run = () =>
      orchestrator.executeExport(canvas, playback, panel, vi.fn(), {
        filename: "test.mp4",
        overlayOverrides: { wordHeader: false, progressBar: false },
      });

    await expect(run()).rejects.toThrow("codec unavailable");
    expect(orchestrator.isExporting()).toBe(false);
    expect(encoder.onProgress).toBeNull();

    await expect(run()).rejects.toThrow("codec unavailable");
    expect(encoder.initialize).toHaveBeenCalledTimes(2);

    let finishInitialization!: () => void;
    vi.mocked(encoder.initialize).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishInitialization = resolve;
        })
    );
    const cancelledRun = run();
    orchestrator.cancelExport();
    finishInitialization();

    await expect(cancelledRun).rejects.toThrow("Export cancelled");
    expect(orchestrator.isExporting()).toBe(false);
    expect(encoder.onProgress).toBeNull();
  });
});

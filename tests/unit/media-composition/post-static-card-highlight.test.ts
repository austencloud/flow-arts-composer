import { describe, expect, it } from "vitest";
import { compilePostProject } from "$lib/shared/media-composition/domain/post-project-compiler";
import { POST_STUDIO_PRESETS } from "$lib/shared/media-composition/domain/post-studio-presets";
import { evaluatePresetFrame } from "$lib/shared/media-composition/services/frame-evaluator";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { postCardHighlightedStepIndex } from "$lib/shared/share/components/post-studio/post-card-highlight";
import { NOW, card, project, video } from "./post-project-fixtures";

describe("post card playback highlight", () => {
  it("does not attach a beat to a standalone end card, while linked cards keep theirs", () => {
    const result = compilePostProject(
      project([
        video("performance", { sourceOut: 72.694 }),
        card("end-card", 5, { start: 72.694 }),
      ]),
      { now: NOW }
    )!;
    const alignment = {
      timeMap: {
        schemaVersion: 1 as const,
        id: "performance-timing",
        sequenceRef: { sequenceId: "sequence", contentHash: "revision" },
        mediaSourceId: "performance-video",
        anchors: [
          { mediaTimeSeconds: 0, sequencePosition: 0 },
          { mediaTimeSeconds: 72.694, sequencePosition: 16 },
        ],
        source: "manual" as const,
        positionConvention: "engine" as const,
        boundaryPolicy: "clamp" as const,
        updatedAt: 1,
      },
      steps: Array.from({ length: 16 }, () => ({ duration: 1 })) as StepData[],
      startPlacementDuration: 1,
    };

    const endCard = evaluatePresetFrame(
      result.preset,
      result.durationSeconds,
      73.07,
      alignment
    ).find((layer) => layer.clipId === "end-card");
    expect(endCard?.sequenceFrame).toBeUndefined();
    expect(endCard?.displayedBeatNumber).toBeUndefined();
    expect(
      postCardHighlightedStepIndex(endCard?.displayedBeatNumber)
    ).toBeNull();

    const linkedPreset = POST_STUDIO_PRESETS.find(
      (preset) => preset.id === "performance-breakdown"
    )!;
    const linkedCard = evaluatePresetFrame(linkedPreset, 10, 5, alignment).find(
      (layer) => layer.clipId === "card"
    );
    expect(linkedCard?.displayedBeatNumber).toBeGreaterThanOrEqual(0);
    expect(
      postCardHighlightedStepIndex(linkedCard?.displayedBeatNumber)
    ).not.toBeNull();
    expect(postCardHighlightedStepIndex(0)).toBe(-1);
    expect(postCardHighlightedStepIndex(2)).toBe(1);
  });
});

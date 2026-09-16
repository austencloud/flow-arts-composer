import { describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  buildViewerBrowserUrl,
  buildViewerWebUrl,
  buildViewerShareDetails,
  calculateSinglePlayDuration,
  hasSameResolvedCardLayout,
  resolveCurrentStepData,
  resolveEditingPane,
  resolveExportType,
  resolveSceneBpmIntent,
} from "$lib/shared/sequence-viewer/services/viewer-orchestrator-model";

function sequence(overrides: Partial<SequenceData> = {}): SequenceData {
  return {
    id: "sequence-1",
    word: "ABCD",
    name: "ABCD",
    displayName: "Air Bridge",
    ownerDisplayName: "Austen",
    steps: [
      { letter: "A", duration: 1 },
      { letter: "B", duration: 0.5 },
      { letter: "C", duration: 1.5 },
    ],
    ...overrides,
  } as SequenceData;
}

describe("viewer orchestrator model", () => {
  it("accepts only positive finite scene BPM intents", () => {
    expect(resolveSceneBpmIntent(null)).toBeNull();
    expect(resolveSceneBpmIntent("120")).toBe(120);
    expect(resolveSceneBpmIntent("0")).toBeNull();
    expect(resolveSceneBpmIntent("-10")).toBeNull();
    expect(resolveSceneBpmIntent("fast")).toBeNull();
  });

  it("derives edit and export modes from the canonical viewer state", () => {
    expect(resolveEditingPane("split", "animation-export", false)).toBe(
      "animation"
    );
    expect(resolveEditingPane("split", "image-export", false)).toBe("image");
    // Videos mode alone is the gallery; the pane only opens once upload does.
    expect(resolveEditingPane("videos", null, true)).toBe("video-upload");
    expect(resolveEditingPane("videos", null, false)).toBeNull();
    expect(resolveEditingPane("card", null, false)).toBeNull();
    expect(resolveExportType("animation")).toBe("animation");
    expect(resolveExportType("image")).toBe("image");
    expect(resolveExportType("video-upload")).toBeNull();
  });

  it("calculates a full play duration from weighted steps and BPM", () => {
    expect(calculateSinglePlayDuration(sequence(), 60)).toBe(3);
    expect(calculateSinglePlayDuration(sequence(), 120)).toBe(1.5);
    expect(calculateSinglePlayDuration(sequence(), 0)).toBe(0);
    expect(calculateSinglePlayDuration(null, 60)).toBe(0);
  });

  it("compares only the resolved card geometry that affects rendering", () => {
    const current = {
      stepCount: 16,
      cols: 4,
      rows: 4,
      startPlacement: "header" as const,
    };
    expect(hasSameResolvedCardLayout(current, { ...current })).toBe(true);
    expect(hasSameResolvedCardLayout(current, { ...current, cols: 8 })).toBe(
      false
    );
    expect(hasSameResolvedCardLayout(null, null)).toBe(true);
  });

  it("builds stable share metadata while delegating URL encoding", () => {
    const details = buildViewerShareDetails({
      sequence: sequence({ birthday: new Date("2026-08-09T12:00:00Z") }),
      bpm: 90,
      darkMode: true,
      fallbackUrl: "https://tka.run/q/fallback",
      buildUrl: (_sequence, metadata) =>
        `https://tka.run/q/encoded?bpm=${metadata.bpm}`,
    });

    expect(details).toEqual({
      url: "https://tka.run/q/encoded?bpm=90",
      title: "Air Bridge",
      text: "Flow Arts Composer sequence: Air Bridge",
      activityMetadata: {
        sequenceId: "sequence-1",
        sequenceWord: "ABCD",
        sequenceLength: 3,
      },
    });
  });

  it("preserves pending actions in the Android browser handoff", () => {
    expect(
      buildViewerBrowserUrl("https://tka.run/q/ABCD?demo=1", "download")
    ).toBe(
      "intent://tka.run/q/ABCD?demo=1&pending=download#Intent;scheme=https;end"
    );
    expect(buildViewerBrowserUrl("", "download")).toBeNull();
    expect(buildViewerWebUrl("https://tka.run/q/ABCD?demo=1", "download")).toBe(
      "https://tka.run/q/ABCD?demo=1&pending=download"
    );
  });

  it("resolves the visible step without mutating sequence data", () => {
    const seq = sequence({
      startPlacement: { letter: "α" },
    } as Partial<SequenceData>);
    expect(resolveCurrentStepData(seq, 0, false)?.letter).toBe("α");
    expect(resolveCurrentStepData(seq, 1, false)?.letter).toBe("A");
    expect(resolveCurrentStepData(seq, 2, true)?.letter).toBe("A");
  });
});

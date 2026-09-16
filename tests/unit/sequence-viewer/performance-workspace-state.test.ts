import { flushSync } from "svelte";
import { describe, expect, it, vi } from "vitest";
import type {
  CollaborativeVideo,
  StepMap,
} from "$lib/shared/video-collaboration/domain/collaborative-video";
import { createPerformanceWorkspaceHarness } from "./performance-workspace-state-harness.svelte";

function performance(id: string, beatMap?: StepMap): CollaborativeVideo {
  return {
    id,
    sequenceId: "performance-sequence",
    creatorId: "creator",
    videoUrl: `/performance-${id}.mp4`,
    duration: 12,
    createdAt: new Date("2026-09-01T12:00:00Z"),
    updatedAt: new Date("2026-09-01T12:00:00Z"),
    beatMap,
  } as CollaborativeVideo;
}

describe("performance workspace state", () => {
  it("moves selection to the next real performance after deletion", async () => {
    const harness = createPerformanceWorkspaceHarness([
      performance("first"),
      performance("second"),
    ]);
    try {
      flushSync();
      expect(harness.state.selectedVideo?.id).toBe("first");

      harness.state.requestDelete("first");
      await harness.state.confirmDelete();
      flushSync();

      expect(harness.state.selectedVideo?.id).toBe("second");
      expect(harness.state.pendingDeleteVideo).toBeNull();
    } finally {
      harness.dispose();
    }
  });

  it("uses one work-mode signal for upload and mapping", async () => {
    const beatMap = {
      source: "manual",
      beatTimestamps: [0, 1],
    } as StepMap;
    const harness = createPerformanceWorkspaceHarness([performance("first")]);
    try {
      flushSync();
      harness.state.requestUpload();
      expect(harness.openChanges).toEqual([true]);

      harness.setUploadRequested(true);
      flushSync();
      expect(harness.state.view).toBe("upload");

      harness.setUploadRequested(false);
      harness.state.startMapping("first");
      flushSync();
      expect(harness.state.view).toBe("map");

      await harness.state.saveStepMap(beatMap);
      flushSync();
      expect(harness.state.view).toBe("browse");
      expect(harness.state.selectedVideo?.beatMap).toEqual(beatMap);
      expect(harness.timingSaved).toEqual(["saved"]);
      expect(harness.openChanges).toEqual([true, true, false]);
    } finally {
      harness.dispose();
    }
  });

  it("tells the playhead about a labeling change without re-attaching the step map", async () => {
    const beatMap = {
      source: "manual",
      beatTimestamps: [0, 1],
    } as StepMap;
    const harness = createPerformanceWorkspaceHarness([
      performance("first", beatMap),
    ]);
    try {
      flushSync();
      expect(harness.attachedMaps.at(-1)).toEqual(beatMap);
      expect(harness.labelings.at(-1)).toBe("mirror-me");
      const attachCount = harness.attachedMaps.length;

      await harness.state.persistHandLabeling("as-performed");
      flushSync();

      // Re-attaching would reset the playhead; the flip is presentation only.
      expect(harness.attachedMaps.length).toBe(attachCount);
      expect(harness.labelings.at(-1)).toBe("as-performed");
    } finally {
      harness.dispose();
    }
  });

  it("pauses and releases a mounted player when Performances becomes inactive", () => {
    const harness = createPerformanceWorkspaceHarness([performance("first")]);
    const player = {
      pause: vi.fn(),
      currentTime: 0,
    } as unknown as HTMLVideoElement;
    try {
      flushSync();
      harness.state.adoptPlayer(player);
      flushSync();

      harness.setActive(false);
      flushSync();

      expect(player.pause).toHaveBeenCalled();
      expect(harness.attachedMaps.at(-1)).toBeNull();
    } finally {
      harness.dispose();
    }
  });
});

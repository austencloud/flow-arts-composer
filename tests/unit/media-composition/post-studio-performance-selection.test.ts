import { describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { CollaborativeVideo } from "$lib/shared/video-collaboration/domain/collaborative-video";
import {
  createCatalogPerformanceSelection,
  createPostStudioSequenceRef,
  createUnmappedPerformanceSelection,
} from "$lib/shared/share/components/post-studio/post-studio-performance-selection";

const sequence = {
  id: "sequence-1",
  word: "ABCD",
  steps: [{ letter: "A" }, { letter: "B" }, { letter: "C" }, { letter: "D" }],
} as SequenceData;

function video(
  overrides: Partial<CollaborativeVideo> = {}
): CollaborativeVideo {
  return {
    id: "video-1",
    videoUrl: "https://media.example/video.mp4",
    storagePath: "videos/video-1.mp4",
    duration: 8,
    fileSize: 1024,
    mimeType: "video/mp4",
    sequenceId: sequence.id,
    creatorId: "user-1",
    collaborators: [],
    pendingInvites: [],
    visibility: "private",
    createdAt: new Date("2026-08-15T00:00:00Z"),
    updatedAt: new Date("2026-08-15T00:00:00Z"),
    ...overrides,
  };
}

describe("Post Studio performance selection", () => {
  it("preserves database identity and migrates a complete manual map", () => {
    const selection = createCatalogPerformanceSelection(
      video({
        beatMap: {
          beatTimestamps: [0.5, 1.4, 3.1, 5.8],
          stepCount: 4,
          source: "manual",
          updatedAt: new Date("2026-08-15T01:00:00Z"),
        },
      }),
      createPostStudioSequenceRef(sequence)
    );

    expect(selection.id).toBe("collaborative-video:video-1");
    expect(selection.alignmentStatus).toBe("saved-manual");
    expect(selection.alignmentDetail).toBe("Saved manual map");
    expect(selection.sequenceTimeMap?.mediaSourceId).toBe(
      "collaborative-video:video-1"
    );
    expect(
      selection.sequenceTimeMap?.anchors.map(
        (anchor) => anchor.mediaTimeSeconds
      )
    ).toEqual([0.5, 1.4, 3.1, 5.8, 7.5]);
  });

  it("marks videos without a map as unmapped instead of leaking another video's map", () => {
    const mapped = createCatalogPerformanceSelection(
      video({
        beatMap: {
          beatTimestamps: [0.5, 1.4, 3.1, 5.8],
          stepCount: 4,
          source: "manual",
          updatedAt: new Date(),
        },
      }),
      createPostStudioSequenceRef(sequence)
    );
    const unmapped = createCatalogPerformanceSelection(
      video({ id: "video-2", beatMap: undefined }),
      createPostStudioSequenceRef(sequence)
    );

    expect(mapped.sequenceTimeMap).not.toBeNull();
    expect(unmapped.id).toBe("collaborative-video:video-2");
    expect(unmapped.sequenceTimeMap).toBeNull();
    expect(unmapped.alignmentStatus).toBe("unmapped");
  });

  it("contains an invalid saved map and reports that it needs repair", () => {
    const selection = createCatalogPerformanceSelection(
      video({
        beatMap: {
          beatTimestamps: [0.5, 1.4],
          stepCount: 4,
          source: "manual",
          updatedAt: new Date(),
        },
      }),
      createPostStudioSequenceRef(sequence)
    );

    expect(selection.sequenceTimeMap).toBeNull();
    expect(selection.alignmentDetail).toContain("needs repair");
  });
});

describe("post studio performance selection hand labeling", () => {
  it("a catalog video without a stored choice reads as mirror me", () => {
    const selection = createCatalogPerformanceSelection(
      video(),
      createPostStudioSequenceRef(sequence)
    );
    expect(selection.handLabeling).toBe("mirror-me");
    expect(selection.videoId).toBe("video-1");
  });

  it("a catalog video keeps its stored choice", () => {
    const selection = createCatalogPerformanceSelection(
      video({ handLabeling: "as-performed" }),
      createPostStudioSequenceRef(sequence)
    );
    expect(selection.handLabeling).toBe("as-performed");
  });

  it("a local upload starts as mirror me", () => {
    const selection = createUnmappedPerformanceSelection({
      id: "local",
      url: "blob:x",
      label: "Local",
    });
    expect(selection.handLabeling).toBe("mirror-me");
    expect(selection.videoId).toBeNull();
  });
});

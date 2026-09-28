import { beforeEach, describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PostVideoItem } from "$lib/shared/media-composition/domain/post-project";
import { createPostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
import { isCovered } from "$lib/shared/share/components/post-studio/editor/post-crop-geometry";
import { createCropSession } from "$lib/shared/share/components/post-studio/editor/post-crop-session.svelte";

function sequence(): SequenceData {
  return {
    id: "seq-crop",
    displayName: "DCK",
    steps: Array.from({ length: 8 }, () => ({ duration: 1 })),
  } as unknown as SequenceData;
}

describe("crop session", () => {
  let clock = 1_000;

  beforeEach(() => localStorage.clear());

  /** A landscape phone take on the post's main slot, as the screen opens it. */
  function openCrop() {
    const editor = createPostEditorState({
      getSequence: sequence,
      now: () => (clock += 1),
    });
    editor.addCatalogVideo({
      videoId: "take-1",
      label: "Take",
      url: "https://example.test/take.mp4",
      durationSeconds: 40,
    });
    const clip = editor.project.tracks
      .flatMap((track) => track.items)
      .find((item): item is PostVideoItem => item.kind === "video")!;
    const session = createCropSession({
      editor,
      getItemId: () => clip.id,
      getSource: () => ({ width: 1920, height: 1080 }),
      now: () => clock,
    });
    return { editor, session };
  }

  it("lands one slider drag as one undo step, and undo puts it back", () => {
    const { editor, session } = openCrop();
    const before = session.pose!.zoom;

    session.setZoom(before * 1.5);
    clock += 100;
    session.setZoom(before * 2);
    expect(session.pose!.zoom).toBeCloseTo(before * 2, 6);

    editor.undo();
    expect(session.pose!.zoom).toBeCloseTo(before, 6);
  });

  it("zooms Fill up as it straightens, so no corner opens", () => {
    const { session } = openCrop();
    expect(isCovered(session.pose!)).toBe(true);

    session.setStraighten(12);

    expect(session.parts.straighten).toBeCloseTo(12, 6);
    expect(isCovered(session.pose!)).toBe(true);
  });

  it("nudges the picture with the arrow keys and stops at its edge", () => {
    const { session } = openCrop();
    session.setZoom(session.pose!.zoom * 1.2);
    const start = session.pose!.offset.x;

    expect(session.nudge({ x: 1, y: 0 }, false)).toBe(true);
    expect(session.pose!.offset.x).toBeGreaterThan(start);

    for (let i = 0; i < 50; i += 1) session.nudge({ x: 1, y: 0 }, true);
    expect(isCovered(session.pose!)).toBe(true);
    expect(session.nudge({ x: 1, y: 0 }, true)).toBe(false);
  });
});

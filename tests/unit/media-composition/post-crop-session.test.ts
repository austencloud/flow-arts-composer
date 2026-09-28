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

  it("says how far out the zoom goes, and holds Fill there", () => {
    const { session } = openCrop();
    expect(session.zoomFloor).toBeCloseTo(session.pose!.zoom, 6);

    session.setZoom(session.zoomFloor * 0.6);
    expect(session.pose!.zoom).toBeCloseTo(session.zoomFloor, 6);
    expect(isCovered(session.pose!)).toBe(true);

    // Turned a quarter, the landscape take's long side runs down the tall
    // window, so it fills it from further out.
    const flat = session.zoomFloor;
    session.rotateQuarter();
    expect(session.zoomFloor).toBeLessThan(flat);
    clock += 1_000;
    session.setZoom(session.zoomFloor * 2);
    session.setZoom(0.01);
    expect(session.pose!.zoom).toBeCloseTo(session.zoomFloor, 6);
    expect(isCovered(session.pose!)).toBe(true);
  });

  it("zooms Fill up as it straightens, so no corner opens", () => {
    const { session } = openCrop();
    expect(isCovered(session.pose!)).toBe(true);

    session.setStraighten(12);

    expect(session.parts.straighten).toBeCloseTo(12, 6);
    expect(isCovered(session.pose!)).toBe(true);
  });

  it("moves the frame with the arrow keys and stops at the picture's edge", () => {
    const { session } = openCrop();
    session.setZoom(session.pose!.zoom * 1.2);
    const start = session.pose!.offset.x;

    // The frame moves right, so the picture sits further left of it.
    expect(session.nudge({ x: 1, y: 0 }, false)).toBe(true);
    expect(session.pose!.offset.x).toBeLessThan(start);

    for (let i = 0; i < 50; i += 1) session.nudge({ x: 1, y: 0 }, true);
    expect(isCovered(session.pose!)).toBe(true);
    expect(session.nudge({ x: 1, y: 0 }, true)).toBe(false);
  });

  it("drags the frame the way the pointer goes", () => {
    const { session } = openCrop();
    session.setZoom(session.pose!.zoom * 1.5);
    const start = session.pose!.offset;

    expect(session.startGesture(0)).toBe(true);
    session.dragTo({ x: 10, y: -5 });
    session.endGesture(true);

    expect(session.pose!.offset.x).toBeCloseTo(start.x - 10, 6);
    expect(session.pose!.offset.y).toBeCloseTo(start.y + 5, 6);
  });

  it("gives the clip a ratio's shape, filled, and Reset takes it off", () => {
    const { editor, session } = openCrop();
    const box = session.window!;

    session.setShape("1:1");
    expect(session.shapeKind).toBe("1:1");
    expect(session.window!.width / session.window!.height).toBeCloseTo(1, 6);
    expect(isCovered(session.pose!)).toBe(true);

    session.setShape("original");
    expect(session.window!.width / session.window!.height).toBeCloseTo(1920 / 1080, 6);

    session.reset();
    const clip = editor.project.tracks
      .flatMap((track) => track.items)
      .find((item): item is PostVideoItem => item.kind === "video")!;
    expect(clip.shape).toBeUndefined();
    expect(session.window).toEqual(box);
  });

  it("reshapes a free clip from a side, as one undo step", () => {
    const { editor, session } = openCrop();
    session.setShape("free");
    const ratio = session.window!.width / session.window!.height;

    expect(session.startGesture(0)).toBe(true);
    session.handleTo("e", 0.8);
    session.endGesture(true);
    expect(session.window!.width / session.window!.height).toBeCloseTo(ratio * 0.8, 6);

    editor.undo();
    expect(session.window!.width / session.window!.height).toBeCloseTo(ratio, 6);
  });
});

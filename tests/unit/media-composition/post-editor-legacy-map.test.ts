import { beforeEach, describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepMap } from "#lib/shared/video-collaboration/domain/collaborative-video.js";
import type { PostProject } from "@austencloud/video-editor/core";
import {
  createPostEditorState,
  type CatalogTakeSource,
} from "#lib/shared/media-composition/state/post-editor-state.svelte.js";

const sequence = () =>
  ({
    id: "legacy-map-post",
    steps: Array.from({ length: 8 }, () => ({ duration: 1 })),
  }) as unknown as SequenceData;

/** An older editor's map: the opening pose at 1 s, a landing each second, the end at 10 s. */
const MAP: StepMap = {
  beatTimestamps: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  endTimestamp: 10,
  stepCount: 8,
  source: "manual",
  updatedAt: new Date(0),
};
/** The taps a timing seeded from MAP holds: every landing and the end. */
const SEEDED_TAPS = [2, 3, 4, 5, 6, 7, 8, 9, 10];

function video(legacyStepMap?: StepMap): CatalogTakeSource {
  return {
    videoId: "v1",
    label: "Take one",
    url: "https://example.test/v1.mp4",
    durationSeconds: 20,
    ...(legacyStepMap ? { legacyStepMap } : {}),
  };
}

function editor(
  getCatalogVideo: (videoId: string) => CatalogTakeSource | null,
  initialProject?: PostProject
) {
  let clock = 1_000;
  return createPostEditorState({
    getSequence: sequence,
    getCatalogVideo,
    now: () => (clock += 1),
    ...(initialProject ? { initialProject } : {}),
  });
}

/** A saved post with one catalog take and no timing for it anywhere. */
function postWithUntimedCatalogTake(): PostProject {
  const first = editor(() => null);
  first.addCatalogVideo(video());
  const saved = { ...first.snapshot, timings: undefined };
  first.dispose();
  localStorage.clear();
  sessionStorage.clear();
  return saved;
}

describe("post editor legacy step maps", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("seeds a catalog video's timing from the map it was added with", () => {
    const state = editor(() => null);
    state.addCatalogVideo(video(MAP));
    const takeId = state.takes[0]!.id;
    expect(state.timing(takeId)?.sections[0]?.taps).toEqual(SEEDED_TAPS);
    state.dispose();
  });

  it("seeds a library video's timing from the catalog's map", () => {
    const state = editor(() => video(MAP));
    state.addLibraryVideo(video());
    const takeId = state.takes[0]!.id;
    expect(state.timing(takeId)?.sections[0]?.taps).toEqual(SEEDED_TAPS);
    state.dispose();
  });

  it("seeds a saved catalog take from the catalog's map when the post opens", () => {
    const saved = postWithUntimedCatalogTake();
    const state = editor(() => video(MAP), saved);
    const takeId = state.takes[0]!.id;
    expect(state.mediaUrl(takeId)).toBe("https://example.test/v1.mp4");
    expect(state.timing(takeId)?.sections[0]?.taps).toEqual(SEEDED_TAPS);
    state.dispose();
  });

  it("waits for the catalog, then seeds the timing from its map", () => {
    const saved = postWithUntimedCatalogTake();
    let catalogReady = false;
    const state = editor(() => (catalogReady ? video(MAP) : null), saved);
    const takeId = state.takes[0]!.id;
    // Without its video yet, the timing waits so the map can still seed it.
    expect(state.mediaUrl(takeId)).toBeNull();
    expect(state.timing(takeId)).toBeNull();

    catalogReady = true;
    state.attachCatalogTakes();
    expect(state.mediaUrl(takeId)).toBe("https://example.test/v1.mp4");
    expect(state.timing(takeId)?.sections[0]?.taps).toEqual(SEEDED_TAPS);
    state.dispose();
  });

  it("seeds the timing from the catalog's map when an undo reloads the take", () => {
    const saved = postWithUntimedCatalogTake();
    let catalogReady = false;
    const state = editor(() => (catalogReady ? video(MAP) : null), saved);
    const takeId = state.takes[0]!.id;
    state.renameTake(takeId, "Renamed");
    expect(state.timing(takeId)).toBeNull();

    catalogReady = true;
    state.undo();
    expect(state.takes[0]?.label).toBe("Take one");
    expect(state.timing(takeId)?.sections[0]?.taps).toEqual(SEEDED_TAPS);
    state.dispose();
  });

  it("opens a fresh timing for a catalog video whose map does not fit the sequence", () => {
    const state = editor(() => null);
    state.addCatalogVideo(video({ ...MAP, stepCount: 4 }));
    const takeId = state.takes[0]!.id;
    expect(state.timing(takeId)?.sections[0]?.taps).toEqual([]);
    state.dispose();
  });
});

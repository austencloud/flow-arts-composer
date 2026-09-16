import { beforeEach, describe, expect, it, vi } from "vitest";

const getVideosForSequence = vi.fn();
const updateHandLabeling = vi.fn();

vi.mock(
  "$lib/shared/video-collaboration/services/collaborative-video-manager",
  () => ({
    getVideosForSequence: (id: string) => getVideosForSequence(id),
    deleteVideo: vi.fn(),
    saveVideo: vi.fn(),
    updateStepMap: vi.fn(),
    updateHandLabeling: (id: string, labeling: string) =>
      updateHandLabeling(id, labeling),
  })
);

const { getSequenceVideosStore, resetSequenceVideoStores } = await import(
  "$lib/shared/video-collaboration/state/sequence-videos-store.svelte"
);

describe("sequence videos store", () => {
  beforeEach(() => {
    resetSequenceVideoStores();
    getVideosForSequence.mockReset();
    updateHandLabeling.mockReset();
  });

  it("reports a failed load as an error, not an empty gallery", async () => {
    // The surface renders "No videos yet" beside an upload button whenever the
    // list is empty and no error is held. A denied read that resolves to []
    // therefore tells a performer their footage does not exist.
    getVideosForSequence.mockRejectedValue(
      new Error("Missing or insufficient permissions.")
    );

    const store = getSequenceVideosStore("X-BΦ-θ-");
    await store.load();

    expect(store.videos).toEqual([]);
    expect(store.error).toBe("Missing or insufficient permissions.");
    expect(store.loading).toBe(false);
  });

  it("retries after a failure instead of holding the empty list", async () => {
    getVideosForSequence.mockRejectedValueOnce(new Error("offline"));
    const store = getSequenceVideosStore("X-BΦ-θ-");
    await store.load();
    expect(store.error).toBe("offline");

    getVideosForSequence.mockResolvedValueOnce([{ id: "video-1" }]);
    await store.load();

    expect(store.error).toBe("");
    expect(store.videos).toHaveLength(1);
  });

  it("keeps a genuine empty list free of any error", async () => {
    getVideosForSequence.mockResolvedValue([]);
    const store = getSequenceVideosStore("no-videos-here");
    await store.load();

    expect(store.videos).toEqual([]);
    expect(store.error).toBe("");
  });

  it("applyHandLabeling persists and patches the held record", async () => {
    updateHandLabeling.mockResolvedValue(undefined);
    const store = getSequenceVideosStore("seq-a");
    store.add({
      id: "v1",
      videoUrl: "https://example.test/v1.mp4",
      storagePath: "videos/v1.mp4",
      duration: 10,
      fileSize: 1,
      mimeType: "video/mp4",
      sequenceId: "seq-a",
      associations: [],
      performers: [],
      creatorId: "u1",
      collaborators: [],
      pendingInvites: [],
      visibility: "private",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });

    await store.applyHandLabeling("v1", "as-performed");

    expect(updateHandLabeling).toHaveBeenCalledWith("v1", "as-performed");
    expect(store.videos[0]?.handLabeling).toBe("as-performed");
    expect(store.videos[0]?.updatedAt.getTime()).toBeGreaterThan(0);
  });

  it("applyHandLabeling leaves the held record untouched when the write fails", async () => {
    updateHandLabeling.mockRejectedValue(new Error("offline"));
    const store = getSequenceVideosStore("seq-a");
    store.add({
      id: "v1",
      videoUrl: "https://example.test/v1.mp4",
      storagePath: "videos/v1.mp4",
      duration: 10,
      fileSize: 1,
      mimeType: "video/mp4",
      sequenceId: "seq-a",
      associations: [],
      performers: [],
      creatorId: "u1",
      collaborators: [],
      pendingInvites: [],
      visibility: "private",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });

    await expect(
      store.applyHandLabeling("v1", "as-performed")
    ).rejects.toThrow();

    expect(store.videos[0]?.handLabeling).toBeUndefined();
  });
});

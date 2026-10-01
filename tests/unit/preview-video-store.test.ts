import { Blob as NodeBlob } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import Dexie from "dexie";
import { PreviewVideoLocalStore } from "../../src/lib/shared/media-composition/services/preview-video-store";
import {
  previewVideoCacheKey,
  type PreviewVideoCopy,
} from "../../src/lib/shared/media-composition/domain/preview-video";

vi.mock(
  "../../src/lib/shared/media-composition/domain/preview-video",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../src/lib/shared/media-composition/domain/preview-video")
    >()),
    MAX_PREVIEW_CACHE_BYTES: 20,
    MAX_PREVIEW_VIDEO_BYTES: 8,
  })
);

function copy(): PreviewVideoCopy {
  return {
    blob: new NodeBlob(["preview"], { type: "video/mp4" }) as unknown as Blob,
    width: 1280,
    height: 720,
    sourceWidth: 1920,
    sourceHeight: 1080,
    durationSeconds: 10,
  };
}

beforeEach(() => {
  const factory = new IDBFactory();
  vi.stubGlobal("indexedDB", factory);
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  Dexie.dependencies.indexedDB = factory;
  Dexie.dependencies.IDBKeyRange = IDBKeyRange;
});

describe("preview video device cache", () => {
  it("round-trips proxy bytes and source geometry across store instances", async () => {
    const store = new PreviewVideoLocalStore();
    const key = previewVideoCacheKey("source", "take");
    await store.write(key, "take", copy());
    const restored = await new PreviewVideoLocalStore().read(key);
    expect(restored).toMatchObject({
      sourceWidth: 1920,
      sourceHeight: 1080,
      durationSeconds: 10,
    });
    expect(await restored!.blob.text()).toBe("preview");
  });

  it("removes a replaced source's persisted copy without disturbing another take", async () => {
    const store = new PreviewVideoLocalStore();
    await store.write("old", "take", copy());
    await store.write("other", "other-take", copy());
    await store.write("new", "take", copy());
    expect(await store.read("old")).toBeNull();
    expect(await store.read("new")).not.toBeNull();
    expect(await store.read("other")).not.toBeNull();
  });

  it("evicts the least recently read take when the byte budget fills", async () => {
    let time = 0;
    const now = vi.spyOn(Date, "now").mockImplementation(() => ++time);
    const store = new PreviewVideoLocalStore();
    try {
      await store.write("a", "a", copy());
      await store.write("b", "b", copy());
      await store.read("a");
      await store.write("c", "c", copy());
      expect(await store.read("b")).toBeNull();
      expect(await store.read("a")).not.toBeNull();
      expect(await store.read("c")).not.toBeNull();
    } finally {
      now.mockRestore();
    }
  });

  it("does not persist copies over the per-video budget", async () => {
    const store = new PreviewVideoLocalStore();
    await store.write("too-big", "take", {
      ...copy(),
      blob: new NodeBlob(["123456789"]) as unknown as Blob,
    });
    expect(await store.read("too-big")).toBeNull();
  });

  it("removes proxy bytes and metadata after a playback failure", async () => {
    const store = new PreviewVideoLocalStore();
    await store.write("failed", "take", copy());
    await store.remove("failed");
    expect(await new PreviewVideoLocalStore().read("failed")).toBeNull();
  });
});

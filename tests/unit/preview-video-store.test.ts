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

/** A key made under the current policy, as the cache makes them. */
const key = (name: string) => previewVideoCacheKey(`/${name}.mp4`, name);

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
    await store.write(key("source"), "take", copy());
    const restored = await new PreviewVideoLocalStore().read(key("source"));
    expect(restored).toMatchObject({
      sourceWidth: 1920,
      sourceHeight: 1080,
      durationSeconds: 10,
    });
    expect(await restored!.blob.text()).toBe("preview");
  });

  it("removes a replaced source's persisted copy without disturbing another take", async () => {
    const store = new PreviewVideoLocalStore();
    await store.write(key("old"), "take", copy());
    await store.write(key("other"), "other-take", copy());
    await store.write(key("new"), "take", copy());
    expect(await store.read(key("old"))).toBeNull();
    expect(await store.read(key("new"))).not.toBeNull();
    expect(await store.read(key("other"))).not.toBeNull();
  });

  it("evicts the least recently read take when the byte budget fills", async () => {
    let time = 0;
    const now = vi.spyOn(Date, "now").mockImplementation(() => ++time);
    const store = new PreviewVideoLocalStore();
    try {
      await store.write(key("a"), "a", copy());
      await store.write(key("b"), "b", copy());
      await store.read(key("a"));
      await store.write(key("c"), "c", copy());
      expect(await store.read(key("b"))).toBeNull();
      expect(await store.read(key("a"))).not.toBeNull();
      expect(await store.read(key("c"))).not.toBeNull();
    } finally {
      now.mockRestore();
    }
  });

  it("does not persist copies over the per-video budget", async () => {
    const store = new PreviewVideoLocalStore();
    await store.write(key("too-big"), "take", {
      ...copy(),
      blob: new NodeBlob(["123456789"]) as unknown as Blob,
    });
    expect(await store.read(key("too-big"))).toBeNull();
  });

  it("removes proxy bytes and metadata after a playback failure", async () => {
    const store = new PreviewVideoLocalStore();
    await store.write(key("failed"), "take", copy());
    await store.remove(key("failed"));
    expect(await new PreviewVideoLocalStore().read(key("failed"))).toBeNull();
  });

  it("drops copies made under an older policy when it writes", async () => {
    const store = new PreviewVideoLocalStore();
    const old = JSON.stringify(["avc-720p-v1", "take", "/source.mp4"]);
    await store.write(old, "old-take", copy());
    await store.write(key("current"), "take", copy());
    expect(await store.read(old)).toBeNull();
    expect(await store.read(key("current"))).not.toBeNull();
  });
});

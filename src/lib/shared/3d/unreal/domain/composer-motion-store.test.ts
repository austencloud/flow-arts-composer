import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import Dexie from "dexie";
import {
  COMPOSER_MOTION_STORE_SCHEMA,
  ComposerMotionStore,
  composerMotionKeysToEvict,
  composerMotionStoreKey,
  storedComposerPose,
} from "./composer-motion-store";
import type { CapturedPoseClip } from "../../native-capture/captured-pose-player";

// The store only round-trips frames; their contents are opaque to it.
const clip = (durationSeconds: number): CapturedPoseClip => ({
  frames: [{ frame: 0 } as unknown as CapturedPoseClip["frames"][number]],
  durationSeconds,
  loop: true,
});

let databaseCount = 0;
const freshStore = (limit?: number) =>
  new ComposerMotionStore({
    limit,
    databaseName: `composer-motion-test-${++databaseCount}`,
  });

beforeEach(() => {
  const factory = new IDBFactory();
  vi.stubGlobal("indexedDB", factory);
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  Dexie.dependencies.indexedDB = factory;
  Dexie.dependencies.IDBKeyRange = IDBKeyRange;
});

describe("Composer motion device store", () => {
  it("keys rows by a stable hash of the signature, not the signature itself", async () => {
    const key = await composerMotionStoreKey('{"sequence":"long"}');
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(await composerMotionStoreKey('{"sequence":"long"}')).toBe(key);
    expect(await composerMotionStoreKey('{"sequence":"other"}')).not.toBe(key);
  });

  it("reads rows from another schema version or with a damaged clip as misses", () => {
    const pose = clip(4);
    const row = { schema: COMPOSER_MOTION_STORE_SCHEMA, pose };
    expect(storedComposerPose(row)).toBe(pose);
    expect(
      storedComposerPose({ ...row, schema: COMPOSER_MOTION_STORE_SCHEMA + 1 })
    ).toBeNull();
    expect(
      storedComposerPose({ ...row, pose: { ...pose, frames: [] } })
    ).toBeNull();
    expect(
      storedComposerPose({
        ...row,
        pose: { ...pose, durationSeconds: Number.NaN },
      })
    ).toBeNull();
    expect(storedComposerPose(undefined)).toBeNull();
  });

  it("evicts only the least recently used keys past the cap", () => {
    expect(composerMotionKeysToEvict(["a", "b", "c"], 2)).toEqual(["a"]);
    expect(composerMotionKeysToEvict(["a", "b"], 2)).toEqual([]);
  });

  it("round-trips a clip across store instances on the same device", async () => {
    const name = `composer-motion-test-${++databaseCount}`;
    await new ComposerMotionStore({ databaseName: name }).save("sig", clip(4));
    expect(
      await new ComposerMotionStore({ databaseName: name }).load("sig")
    ).toEqual(clip(4));
    expect(
      await new ComposerMotionStore({ databaseName: name }).load("missing")
    ).toBeNull();
  });

  it("keeps clips that were read recently when the cap evicts", async () => {
    const store = freshStore(2);
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1);
    await store.save("a", clip(1));
    now.mockReturnValue(2);
    await store.save("b", clip(2));
    now.mockReturnValue(3);
    expect(await store.load("a")).toEqual(clip(1));
    // The read's touch is fire-and-forget; let it commit before the next write.
    await new Promise((resolve) => setTimeout(resolve, 0));
    now.mockReturnValue(4);
    await store.save("c", clip(3));
    now.mockRestore();
    expect(await store.load("a")).toEqual(clip(1));
    expect(await store.load("b")).toBeNull();
    expect(await store.load("c")).toEqual(clip(3));
  });

  it("behaves as an empty store when the browser has no IndexedDB", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const store = freshStore();
    await expect(store.save("sig", clip(4))).resolves.toBeUndefined();
    expect(await store.load("sig")).toBeNull();
  });
});

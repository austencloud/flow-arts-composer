import { describe, expect, it } from "vitest";
import type { PostTake } from "#lib/shared/media-composition/domain/post-plan.js";
import {
  createLocalFootageVault,
  type FootageVaultStorage,
} from "#lib/shared/media-composition/services/local-footage-vault.js";

/** Just enough of the origin private file system for the vault. */
class FakeFile {
  readonly kind = "file";
  data: Blob = new Blob([]);
  keptAt = 0;
  constructor(
    readonly name: string,
    private readonly clock: () => number
  ) {}
  async getFile(): Promise<File> {
    return new File([this.data], this.name, { lastModified: this.keptAt });
  }
  async createWritable() {
    let pending: Blob | null = null;
    return {
      write: async (blob: Blob) => {
        pending = blob;
      },
      close: async () => {
        if (pending) this.data = pending;
        this.keptAt = this.clock();
      },
      abort: async () => undefined,
    };
  }
}

class FakeDirectory {
  readonly kind = "directory";
  readonly children = new Map<string, FakeDirectory | FakeFile>();
  constructor(private readonly clock: () => number) {}
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    let child = this.children.get(name);
    if (!child && options?.create) {
      child = new FakeDirectory(this.clock);
      this.children.set(name, child);
    }
    if (!(child instanceof FakeDirectory)) throw new Error("NotFoundError");
    return child;
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    let child = this.children.get(name);
    if (!child && options?.create) {
      child = new FakeFile(name, this.clock);
      this.children.set(name, child);
    }
    if (!(child instanceof FakeFile)) throw new Error("NotFoundError");
    return child;
  }
  async removeEntry(name: string) {
    this.children.delete(name);
  }
  async *entries() {
    yield* this.children.entries();
  }
}

function fakeStorage(): FootageVaultStorage & { files(): FakeFile[] } {
  let time = 1_000;
  const root = new FakeDirectory(() => ++time);
  const files = (directory: FakeDirectory): FakeFile[] =>
    [...directory.children.values()].flatMap((child) =>
      child instanceof FakeFile ? [child] : files(child)
    );
  return {
    root: async () => root as unknown as FileSystemDirectoryHandle,
    files: () => files(root),
  };
}

function deviceTake(file: File, id = "take-1"): PostTake {
  return {
    id,
    label: file.name,
    ref: {
      kind: "local",
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
    },
    takeKey: `local:${file.name}:${file.size}:${file.lastModified}`,
    durationSeconds: 4,
  };
}

const video = (name: string, bytes: number, lastModified = 42) =>
  new File(["x".repeat(bytes)], name, { lastModified, type: "video/mp4" });

describe("local footage vault", () => {
  it("brings a kept video back with its original name and date", async () => {
    const storage = fakeStorage();
    const vault = createLocalFootageVault("account:owner", storage);
    const file = video("fire.mp4", 12);
    await vault.keep(deviceTake(file), file);

    const reopened = await vault.open(deviceTake(file));
    expect(reopened?.name).toBe("fire.mp4");
    expect(reopened?.size).toBe(12);
    expect(reopened?.lastModified).toBe(42);
    // The private file system keeps no media type; the name gives it back.
    expect(reopened?.type).toBe("video/mp4");
  });

  it("never opens another account's copy", async () => {
    const storage = fakeStorage();
    const file = video("fire.mp4", 12);
    await createLocalFootageVault("account:owner", storage).keep(
      deviceTake(file),
      file
    );

    expect(
      await createLocalFootageVault("account:other", storage).open(
        deviceTake(file)
      )
    ).toBeNull();
    expect(
      await createLocalFootageVault("guest", storage).open(deviceTake(file))
    ).toBeNull();
  });

  it("keeps one copy for takes cut from the same recording", async () => {
    const storage = fakeStorage();
    const vault = createLocalFootageVault("guest", storage);
    const file = video("fire.mp4", 12);
    await vault.keep(deviceTake(file, "take-1"), file);
    await vault.keep(
      { ...deviceTake(file, "take-2"), takeKey: "local:fire.mp4:cut-2" },
      file
    );
    expect(storage.files()).toHaveLength(1);
    expect(await vault.open(deviceTake(file, "take-2"))).not.toBeNull();
  });

  it("refuses a file that is not the take's and a copy cut short", async () => {
    const storage = fakeStorage();
    const vault = createLocalFootageVault("guest", storage);
    const file = video("fire.mp4", 12);
    await vault.keep(deviceTake(file), video("fire.mp4", 5));
    expect(storage.files()).toHaveLength(0);

    await vault.keep(deviceTake(file), file);
    storage.files()[0]!.data = new Blob(["short"]);
    expect(await vault.open(deviceTake(file))).toBeNull();
  });

  it("drops the oldest copies to stay within its room", async () => {
    const storage = fakeStorage();
    const vault = createLocalFootageVault("guest", storage, 25);
    const first = video("first.mp4", 10, 1);
    const second = video("second.mp4", 10, 2);
    const third = video("third.mp4", 10, 3);
    for (const file of [first, second, third])
      await vault.keep(deviceTake(file), file);

    expect(await vault.open(deviceTake(first))).toBeNull();
    expect(await vault.open(deviceTake(second))).not.toBeNull();
    expect(await vault.open(deviceTake(third))).not.toBeNull();
  });

  it("does nothing where the browser has no private file system", async () => {
    const vault = createLocalFootageVault("guest", null);
    const file = video("fire.mp4", 12);
    await vault.keep(deviceTake(file), file);
    expect(await vault.open(deviceTake(file))).toBeNull();
  });
});

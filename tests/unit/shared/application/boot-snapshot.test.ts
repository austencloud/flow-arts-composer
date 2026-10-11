import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  readBootSnapshot,
  writeBootSnapshot,
  clearBootSnapshot,
  BOOT_SNAPSHOT_KEY,
  BOOT_SNAPSHOT_VERSION,
} from "#lib/shared/application/services/boot-snapshot.js";

describe("boot-snapshot", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns null when nothing is stored", () => {
    expect(readBootSnapshot()).toBeNull();
  });

  it("round-trips a written snapshot", () => {
    writeBootSnapshot({ uid: "abc", role: "premium", activeModule: "browse" });
    expect(readBootSnapshot()).toEqual({
      uid: "abc",
      role: "premium",
      activeModule: "browse",
      version: BOOT_SNAPSHOT_VERSION,
    });
  });

  it("ignores a snapshot written under a different version", () => {
    localStorage.setItem(
      BOOT_SNAPSHOT_KEY,
      JSON.stringify({ uid: "x", role: "user", activeModule: "create", version: -1 })
    );
    expect(readBootSnapshot()).toBeNull();
  });

  it("returns null on malformed JSON instead of throwing", () => {
    localStorage.setItem(BOOT_SNAPSHOT_KEY, "{not json");
    expect(readBootSnapshot()).toBeNull();
  });

  it("clear() removes the snapshot", () => {
    writeBootSnapshot({ uid: null, role: "guest", activeModule: "create" });
    clearBootSnapshot();
    expect(readBootSnapshot()).toBeNull();
  });
});

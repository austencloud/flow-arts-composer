// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHUNK_HARD_RELOAD_KEY,
  CHUNK_RECOVERY_RELOAD_MARKER_KEY,
  CHUNK_SOFT_RELOAD_KEY,
  claimChunkRecoveryStep,
  consumeChunkRecoveryReloadMarker,
  markChunkRecoveryReload,
  printChunkRecoveryReloadBreadcrumb,
  takeChunkRecoveryReloadForSession,
} from "./chunk-recovery-marker";

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as Storage;
}

describe("chunk recovery reload marker", () => {
  afterEach(() => {
    sessionStorage.clear();
    takeChunkRecoveryReloadForSession();
    vi.restoreAllMocks();
  });

  it("survives the reload boundary and is consumed exactly once", () => {
    const storage = fakeStorage();
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    markChunkRecoveryReload("soft", storage);
    expect(storage.getItem(CHUNK_RECOVERY_RELOAD_MARKER_KEY)).toBe("1000:soft");

    expect(consumeChunkRecoveryReloadMarker(storage, 1_125)).toEqual({
      occurred: true,
      ageMs: 125,
      stage: "soft",
    });
    expect(consumeChunkRecoveryReloadMarker(storage, 1_200)).toEqual({
      occurred: false,
      ageMs: null,
      stage: null,
    });
  });

  it("records which recovery stage fired, reading a bare timestamp as soft", () => {
    const storage = fakeStorage();
    vi.spyOn(Date, "now").mockReturnValue(2_000);
    markChunkRecoveryReload("hard", storage);
    expect(consumeChunkRecoveryReloadMarker(storage, 2_050)).toEqual({
      occurred: true,
      ageMs: 50,
      stage: "hard",
    });

    // A marker written by the build before stages existed.
    storage.setItem(CHUNK_RECOVERY_RELOAD_MARKER_KEY, "2000");
    expect(consumeChunkRecoveryReloadMarker(storage, 2_100)).toEqual({
      occurred: true,
      ageMs: 100,
      stage: "soft",
    });
  });

  it("prints a breadcrumb at boot and parks the result for session_start", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    sessionStorage.setItem(
      CHUNK_RECOVERY_RELOAD_MARKER_KEY,
      String(Date.now() - 800)
    );

    printChunkRecoveryReloadBreadcrumb();

    expect(info).toHaveBeenCalledTimes(1);
    const [message] = info.mock.calls[0] ?? [];
    expect(String(message)).toContain("why did it reload?");
    expect(String(message)).toContain("stale chunk after a deploy");
    expect(sessionStorage.getItem(CHUNK_RECOVERY_RELOAD_MARKER_KEY)).toBeNull();

    const forSession = takeChunkRecoveryReloadForSession();
    expect(forSession.occurred).toBe(true);
    expect(forSession.ageMs).toBeGreaterThanOrEqual(800);
    // Handed over exactly once.
    expect(takeChunkRecoveryReloadForSession()).toEqual({
      occurred: false,
      ageMs: null,
      stage: null,
    });
  });

  it("stays silent when no recovery reload happened", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    printChunkRecoveryReloadBreadcrumb();
    expect(info).not.toHaveBeenCalled();
    expect(takeChunkRecoveryReloadForSession()).toEqual({
      occurred: false,
      ageMs: null,
      stage: null,
    });
  });
});

describe("chunk recovery ladder", () => {
  it("allows one soft and one hard reload per minute, then gives up", () => {
    const storage = fakeStorage();
    expect(claimChunkRecoveryStep(storage, 0)).toBe("soft");
    // The reload that the soft step started hit the same dead chunk.
    expect(claimChunkRecoveryStep(storage, 5_000)).toBe("hard");
    expect(claimChunkRecoveryStep(storage, 10_000)).toBe("give-up");
    expect(claimChunkRecoveryStep(storage, 59_000)).toBe("give-up");
  });

  it("starts a new ladder once the minute has passed", () => {
    const storage = fakeStorage();
    claimChunkRecoveryStep(storage, 0);
    claimChunkRecoveryStep(storage, 5_000);

    expect(claimChunkRecoveryStep(storage, 60_000)).toBe("soft");
    // The earlier window's hard reload no longer counts.
    expect(storage.getItem(CHUNK_HARD_RELOAD_KEY)).toBeNull();
    expect(claimChunkRecoveryStep(storage, 61_000)).toBe("hard");
    expect(claimChunkRecoveryStep(storage, 62_000)).toBe("give-up");
  });

  it("keeps reading the soft stamp the old build wrote", () => {
    const storage = fakeStorage();
    storage.setItem(CHUNK_SOFT_RELOAD_KEY, "1000");
    expect(claimChunkRecoveryStep(storage, 2_000)).toBe("hard");
  });

  it("gives up rather than reload uncounted when storage is unusable", () => {
    expect(claimChunkRecoveryStep(null, 0)).toBe("give-up");
    const denied = fakeStorage();
    denied.setItem = () => {
      throw new DOMException("denied", "SecurityError");
    };
    expect(claimChunkRecoveryStep(denied, 0)).toBe("give-up");
  });
});

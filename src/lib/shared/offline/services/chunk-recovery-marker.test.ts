import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHUNK_RECOVERY_RELOAD_MARKER_KEY,
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
    markChunkRecoveryReload(storage);
    expect(storage.getItem(CHUNK_RECOVERY_RELOAD_MARKER_KEY)).toBe("1000");

    expect(consumeChunkRecoveryReloadMarker(storage, 1_125)).toEqual({
      occurred: true,
      ageMs: 125,
    });
    expect(consumeChunkRecoveryReloadMarker(storage, 1_200)).toEqual({
      occurred: false,
      ageMs: null,
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
    });
  });

  it("stays silent when no recovery reload happened", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    printChunkRecoveryReloadBreadcrumb();
    expect(info).not.toHaveBeenCalled();
    expect(takeChunkRecoveryReloadForSession()).toEqual({
      occurred: false,
      ageMs: null,
    });
  });
});

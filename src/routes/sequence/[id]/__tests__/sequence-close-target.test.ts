import { describe, expect, it } from "vitest";
import {
  resolveSequenceCloseTarget,
  SEQUENCE_CLOSE_FALLBACK,
} from "../sequence-close-target";

describe("sequence page Back target", () => {
  // A scanner pressed Back and the same scanned card reloaded.
  it("sends a scan to the gallery even with history behind it", () => {
    expect(
      resolveSequenceCloseTarget({ scanOrigin: true, historyLength: 4 })
    ).toEqual({ kind: "path", path: SEQUENCE_CLOSE_FALLBACK });
  });

  it("keeps an explicit handoff return path, scan or not", () => {
    expect(
      resolveSequenceCloseTarget({
        returnPath: "/browse/collections",
        scanOrigin: true,
        historyLength: 4,
      })
    ).toEqual({ kind: "path", path: "/browse/collections" });
  });

  it("goes back in history for an ordinary visit", () => {
    expect(
      resolveSequenceCloseTarget({ scanOrigin: false, historyLength: 3 })
    ).toEqual({ kind: "history-back" });
  });

  it("falls back to the gallery when there is no history", () => {
    expect(
      resolveSequenceCloseTarget({ scanOrigin: false, historyLength: 1 })
    ).toEqual({ kind: "path", path: SEQUENCE_CLOSE_FALLBACK });
  });
});

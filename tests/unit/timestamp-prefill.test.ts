import { describe, it, expect } from "vitest";
import { beatIndexToTimestamp, prefillTimestamps } from "#lib/features/write/services/timestamp-prefill.js";

describe("timestamp prefill", () => {
  it("converts a beat index to M:SS at a given BPM", () => {
    // 120 BPM = 2 beats/sec. Beat 0 = 0:00, beat 16 = 8 beats late... 16/2 = 8s.
    expect(beatIndexToTimestamp(0, 120)).toBe("0:00");
    expect(beatIndexToTimestamp(16, 120)).toBe("0:08");
    expect(beatIndexToTimestamp(240, 120)).toBe("2:00");
  });

  it("prefills only blank timestamps, never overwriting user text", () => {
    const bands = [
      { key: "a:0", firstBeatIndex: 0, timestamp: "" },
      { key: "a:1", firstBeatIndex: 8, timestamp: "0:05" }, // user-set, keep
      { key: "b:0", firstBeatIndex: 16, timestamp: "" },
    ];
    const out = prefillTimestamps(bands, 120);
    expect(out["a:0"]).toBe("0:00");
    expect(out["a:1"]).toBeUndefined(); // untouched → caller keeps existing
    expect(out["b:0"]).toBe("0:08");
  });

  it("returns an empty map when BPM is missing or non-positive", () => {
    expect(prefillTimestamps([{ key: "a:0", firstBeatIndex: 0, timestamp: "" }], 0)).toEqual({});
    expect(prefillTimestamps([{ key: "a:0", firstBeatIndex: 0, timestamp: "" }], undefined)).toEqual({});
  });
});

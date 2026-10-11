import { describe, expect, it } from "vitest";
import {
  MAX_TEMPO_TAP_HISTORY,
  NUMERIC_TEMPO_PRESETS,
  SEMANTIC_TEMPO_PRESETS,
  calculateTapTempo,
  clampTempoBpm,
  recordTempoTap,
} from "#lib/shared/animation-engine/domain/tempo-behavior.js";
import {
  PLAYBACK_MAX_BPM,
  PLAYBACK_MIN_BPM,
} from "#lib/shared/animation-engine/domain/constants/timing.js";

describe("tempo behavior", () => {
  it("uses engine timing bounds for every tempo presentation", () => {
    expect(clampTempoBpm(-10)).toBe(PLAYBACK_MIN_BPM);
    expect(clampTempoBpm(1_000)).toBe(PLAYBACK_MAX_BPM);
    expect(clampTempoBpm(90)).toBe(90);
  });

  it("supports narrower bounds without inventing another clamp", () => {
    expect(clampTempoBpm(20, 30, 120)).toBe(30);
    expect(clampTempoBpm(140, 30, 120)).toBe(120);
  });

  it("calculates tap tempo from the average interval", () => {
    expect(calculateTapTempo([0, 500, 1_000, 1_500])).toBe(120);
    expect(calculateTapTempo([0, 1_000, 2_000])).toBe(60);
    expect(calculateTapTempo([0])).toBeNull();
  });

  it("clamps tap tempo through the same engine bounds", () => {
    expect(calculateTapTempo([0, 100])).toBe(PLAYBACK_MAX_BPM);
    expect(calculateTapTempo([0, 20_000])).toBeNull();
  });

  it("resets after a stale tap and trims long histories", () => {
    expect(recordTempoTap([0, 500], 3_000)).toEqual([3_000]);

    let taps: number[] = [];
    for (let index = 0; index < 12; index += 1) {
      taps = recordTempoTap(taps, index * 250);
    }

    expect(taps).toHaveLength(MAX_TEMPO_TAP_HISTORY);
    expect(taps[0]).toBe(1_000);
    expect(taps.at(-1)).toBe(2_750);
  });

  it("keeps the established numeric and semantic preset choices", () => {
    expect(NUMERIC_TEMPO_PRESETS).toEqual([15, 30, 60, 90, 120, 150]);
    expect(SEMANTIC_TEMPO_PRESETS).toEqual([
      { label: "Slow", bpm: 15 },
      { label: "Med", bpm: 60 },
      { label: "Fast", bpm: 120 },
    ]);
  });

  it("rejects invalid values instead of turning them into a plausible tempo", () => {
    expect(() => clampTempoBpm(Number.NaN)).toThrow("finite");
    expect(() => clampTempoBpm(60, 120, 30)).toThrow("ordered");
    expect(calculateTapTempo([0, 500, 500])).toBeNull();
  });
});

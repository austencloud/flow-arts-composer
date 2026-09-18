import { describe, expect, it } from "vitest";
import {
  normalizePersistedGenerationConfig,
  normalizePersistedStartEndOptions,
} from "./generator-persistence-normalizer";

describe("normalizePersistedGenerationConfig", () => {
  it("clamps a persisted level 4 (SKEWED) down to the available max", () => {
    // Level 4 pictograph data does not exist yet (MAX_AVAILABLE_LEVEL in
    // config-mapper.ts). A config saved before that gate existed — old
    // localStorage, an old Firestore favorite — can still carry level: 4.
    // It must degrade to level 3 instead of round-tripping into a build
    // request the generator can't fulfill.
    const result = normalizePersistedGenerationConfig({
      mode: "freeform",
      length: 8,
      level: 4,
    });
    expect(result.level).toBe(3);
  });

  it("leaves an in-range level untouched", () => {
    const result = normalizePersistedGenerationConfig({ level: 2 });
    expect(result.level).toBe(2);
  });

  it("clamps a level below 1 up to 1", () => {
    const result = normalizePersistedGenerationConfig({ level: 0 });
    expect(result.level).toBe(1);
  });

  it("leaves a config with no level field alone", () => {
    const result = normalizePersistedGenerationConfig({ mode: "freeform" });
    expect(result.level).toBeUndefined();
  });

  it("returns {} for non-record input without throwing", () => {
    expect(normalizePersistedGenerationConfig(null)).toEqual({});
    expect(normalizePersistedGenerationConfig(undefined)).toEqual({});
    expect(normalizePersistedGenerationConfig("skewed")).toEqual({});
  });
});

describe("normalizePersistedStartEndOptions", () => {
  it("moves the pre-rename multi-select arrays onto their placement keys", () => {
    const result = normalizePersistedStartEndOptions({
      blockedStartPositions: ["alpha1"],
      endPositions: ["beta3", "gamma7"],
    });
    expect(result).toMatchObject({
      blockedStartPlacements: ["alpha1"],
      endPlacements: ["beta3", "gamma7"],
    });
    expect(result).not.toHaveProperty("blockedStartPositions");
    expect(result).not.toHaveProperty("endPositions");
  });

  it("prefers the current arrays when both spellings are present", () => {
    const result = normalizePersistedStartEndOptions({
      blockedStartPositions: ["alpha1"],
      blockedStartPlacements: ["gamma7"],
      endPositions: ["beta3"],
      endPlacements: ["zeta2"],
    });
    expect(result).toMatchObject({
      blockedStartPlacements: ["gamma7"],
      endPlacements: ["zeta2"],
    });
    expect(result).not.toHaveProperty("blockedStartPositions");
    expect(result).not.toHaveProperty("endPositions");
  });

  it("defaults both arrays to empty when a legacy setup never had either", () => {
    // Pre-rename setups saved before these arrays existed at all must still
    // produce [] so downstream .length reads (hasAnyConstraints, setOptions)
    // cannot throw on undefined.
    const result = normalizePersistedStartEndOptions({ mustContainLetters: [] });
    expect(result).toMatchObject({
      blockedStartPlacements: [],
      endPlacements: [],
    });
  });

  it("moves the pre-rename single-select step fields onto their placement keys", () => {
    const result = normalizePersistedStartEndOptions({
      startPosition: { id: "start-cell", gridPosition: "alpha1" },
      endPosition: { id: "end-cell", gridPosition: "beta3" },
    });
    expect(result).not.toHaveProperty("startPosition");
    expect(result).not.toHaveProperty("endPosition");
    expect((result as Record<string, unknown>).startPlacement).toMatchObject({
      id: "start-cell",
      gridPlacement: "alpha1",
    });
    expect((result as Record<string, unknown>).endPlacement).toMatchObject({
      id: "end-cell",
      gridPlacement: "beta3",
    });
  });

  it("prefers the current single-select step fields over legacy siblings", () => {
    const result = normalizePersistedStartEndOptions({
      startPosition: { id: "legacy-start" },
      startPlacement: { id: "canonical-start" },
    });
    expect((result as Record<string, unknown>).startPlacement).toMatchObject({
      id: "canonical-start",
    });
    expect(result).not.toHaveProperty("startPosition");
  });
});

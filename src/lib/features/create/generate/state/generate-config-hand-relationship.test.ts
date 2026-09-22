import { beforeEach, describe, expect, it } from "vitest";
import {
  createGenerationConfigState,
  GENERATE_DEFAULT_CONFIG,
} from "./generate-config.svelte";
import { uiConfigToGenerationOptions } from "../shared/utils/config-mapper";
import { normalizePersistedGenerationConfig } from "../domain/generator-persistence-normalizer";

beforeEach(() => localStorage.clear());

describe("TnD selections in the Generate config", () => {
  it("starts with both selections Free and turns unmatched", () => {
    expect(GENERATE_DEFAULT_CONFIG.handRelationship).toBe("free");
    expect(GENERATE_DEFAULT_CONFIG.propRelationship).toBe("free");
    expect(GENERATE_DEFAULT_CONFIG.matchHandTurns).toBe(false);
    expect(GENERATE_DEFAULT_CONFIG).not.toHaveProperty(
      "handRelationshipInverted"
    );
    const state = createGenerationConfigState();
    expect(state.config.handRelationship).toBe("free");
    expect(state.config.propRelationship).toBe("free");
  });

  it("round-trips both selections through localStorage", () => {
    const first = createGenerationConfigState();
    first.updateConfig({
      handRelationship: "QO",
      propRelationship: "SS",
      matchHandTurns: true,
    });
    const second = createGenerationConfigState();
    expect(second.config.handRelationship).toBe("QO");
    expect(second.config.propRelationship).toBe("SS");
    expect(second.config.matchHandTurns).toBe(true);
  });

  it("round-trips through a saved setup and ignores malformed saved fields", () => {
    const state = createGenerationConfigState();
    state.updateConfig({ handRelationship: "SO", propRelationship: "TS" });
    const saved = JSON.parse(JSON.stringify(state.config));
    state.resetConfig();
    state.replaceConfig(saved);
    expect(state.config.handRelationship).toBe("SO");
    expect(state.config.propRelationship).toBe("TS");
    state.replaceConfig({
      ...saved,
      handRelationship: "sideways",
      propRelationship: 3,
      matchHandTurns: "yes",
    });
    expect(state.config.handRelationship).toBe("free");
    expect(state.config.propRelationship).toBe("free");
    expect(state.config.matchHandTurns).toBe(false);
  });

  it("restores an older setup with default selections instead of inheriting the live ones", () => {
    const state = createGenerationConfigState();
    state.updateConfig({ handRelationship: "TO", propRelationship: "QS" });
    state.replaceConfig({ length: 16, level: 3, loopEnabled: false });
    expect(state.config.handRelationship).toBe("free");
    expect(state.config.propRelationship).toBe("free");
    expect(state.config.length).toBe(16);
  });

  it("reaches GenerationOptions", () => {
    const state = createGenerationConfigState();
    state.updateConfig({ handRelationship: "TS", propRelationship: "TO" });
    const options = uiConfigToGenerationOptions(state.config);
    expect(options.handRelationship).toBe("TS");
    expect(options.propRelationship).toBe("TO");
    expect(options).not.toHaveProperty("handRelationshipInverted");
  });

  it("forces matched turns while a prop mode is set", () => {
    const state = createGenerationConfigState();
    state.updateConfig({ propRelationship: "QS", matchHandTurns: false });
    expect(uiConfigToGenerationOptions(state.config).matchHandTurns).toBe(true);
    state.updateConfig({ propRelationship: "free" });
    expect(uiConfigToGenerationOptions(state.config).matchHandTurns).toBe(
      false
    );
  });

  it("frees the left start orientation so a prop timing can be reached", () => {
    // The engine derives the left prop's start orientation from the right's
    // to land the requested phase, but only when the caller has not already
    // pinned both. The app's start-end defaults pin both to "in", which fixes
    // the phase before the search runs and makes most timings unreachable.
    const state = createGenerationConfigState();
    const startEnd = {
      blockedStartPlacements: [],
      startPlacement: null,
      endPlacement: null,
      endPlacements: [],
      mustContainLetters: [],
      mustNotContainLetters: [],
      leftStartOrientation: "in",
      rightStartOrientation: "in",
    } as never;

    state.updateConfig({ propRelationship: "TS" });
    const timed = uiConfigToGenerationOptions(
      state.config,
      undefined,
      startEnd
    );
    expect(timed.leftStartOrientation).toBeUndefined();
    expect(timed.rightStartOrientation).toBe("in");

    state.updateConfig({ propRelationship: "free" });
    const free = uiConfigToGenerationOptions(state.config, undefined, startEnd);
    expect(free.leftStartOrientation).toBe("in");
    expect(free.rightStartOrientation).toBe("in");
  });

  it("sends Free hands when the LOOP rules the hand mode out", () => {
    const state = createGenerationConfigState();
    state.updateConfig({
      handRelationship: "QS",
      loopEnabled: true,
      loopType: "mirrored",
    });
    expect(uiConfigToGenerationOptions(state.config).handRelationship).toBe(
      "free"
    );
    expect(state.config.handRelationship).toBe("QS");
    state.updateConfig({ loopEnabled: false });
    expect(uiConfigToGenerationOptions(state.config).handRelationship).toBe(
      "QS"
    );
    state.updateConfig({ loopEnabled: true, loopType: "rotated" });
    expect(uiConfigToGenerationOptions(state.config).handRelationship).toBe(
      "QS"
    );
  });

  it("coerces the default quartered rotation to halved for a reflection hand mode", () => {
    const state = createGenerationConfigState();
    state.updateConfig({
      loopEnabled: true,
      loopType: "rotated",
      period: "quartered",
      handRelationship: "TO",
    });
    expect(uiConfigToGenerationOptions(state.config).period).toBe("halved");
    state.updateConfig({ handRelationship: "QS" });
    expect(uiConfigToGenerationOptions(state.config).period).toBe("quartered");
  });

  it("reset puts both selections back to Free", () => {
    const state = createGenerationConfigState();
    state.updateConfig({ handRelationship: "SS", propRelationship: "SO" });
    state.resetConfig();
    expect(state.config.handRelationship).toBe("free");
    expect(state.config.propRelationship).toBe("free");
  });
});

describe("normalizePersistedGenerationConfig and the legacy hand relationship", () => {
  it.each([
    ["mirrored", "TO"],
    ["flipped", "SO"],
    ["unison", "TS"],
    ["opposite", "SS"],
  ])("migrates %s to %s", (legacy, mode) => {
    expect(
      normalizePersistedGenerationConfig({ handRelationship: legacy })
    ).toEqual({ handRelationship: mode });
  });

  it("derives the prop mode an inverted flag implied", () => {
    expect(
      normalizePersistedGenerationConfig({
        handRelationship: "mirrored",
        handRelationshipInverted: true,
      })
    ).toEqual({ handRelationship: "TO", propRelationship: "TS" });
    expect(
      normalizePersistedGenerationConfig({
        handRelationship: "flipped",
        handRelationshipInverted: true,
      })
    ).toEqual({ handRelationship: "SO", propRelationship: "TS" });
    expect(
      normalizePersistedGenerationConfig({
        handRelationship: "unison",
        handRelationshipInverted: true,
      })
    ).toEqual({ handRelationship: "TS", propRelationship: "TO" });
    expect(
      normalizePersistedGenerationConfig({
        handRelationship: "opposite",
        handRelationshipInverted: true,
      })
    ).toEqual({ handRelationship: "SS", propRelationship: "TO" });
  });

  it("does not override a prop mode that is already stored", () => {
    expect(
      normalizePersistedGenerationConfig({
        handRelationship: "mirrored",
        handRelationshipInverted: true,
        propRelationship: "QS",
      })
    ).toEqual({ handRelationship: "TO", propRelationship: "QS" });
  });

  it("always drops the inverted flag", () => {
    expect(
      normalizePersistedGenerationConfig({
        handRelationship: "TO",
        handRelationshipInverted: false,
      })
    ).toEqual({ handRelationship: "TO" });
    expect(
      normalizePersistedGenerationConfig({ handRelationshipInverted: true })
    ).toEqual({});
  });

  it("keeps current modes and drops unknown values", () => {
    expect(
      normalizePersistedGenerationConfig({
        handRelationship: "QO",
        propRelationship: "SS",
        matchHandTurns: true,
      })
    ).toEqual({
      handRelationship: "QO",
      propRelationship: "SS",
      matchHandTurns: true,
    });
    expect(
      normalizePersistedGenerationConfig({
        handRelationship: "sideways",
        propRelationship: 3,
        matchHandTurns: "yes",
      })
    ).toEqual({});
  });
});

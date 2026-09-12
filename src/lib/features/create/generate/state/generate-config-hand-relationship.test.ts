import { beforeEach, describe, expect, it } from "vitest";
import {
  createGenerationConfigState,
  GENERATE_DEFAULT_CONFIG,
} from "./generate-config.svelte";
import { uiConfigToGenerationOptions } from "../shared/utils/config-mapper";
import { normalizePersistedGenerationConfig } from "../domain/generator-persistence-normalizer";

beforeEach(() => localStorage.clear());

describe("Hand relationship in the Generate config", () => {
  it("starts Free and not inverted", () => {
    expect(GENERATE_DEFAULT_CONFIG.handRelationship).toBe("free");
    expect(GENERATE_DEFAULT_CONFIG.handRelationshipInverted).toBe(false);
    const state = createGenerationConfigState();
    expect(state.config.handRelationship).toBe("free");
    expect(state.config.handRelationshipInverted).toBe(false);
  });

  it("round-trips through localStorage", () => {
    const first = createGenerationConfigState();
    first.updateConfig({
      handRelationship: "mirrored",
      handRelationshipInverted: true,
    });
    const second = createGenerationConfigState();
    expect(second.config.handRelationship).toBe("mirrored");
    expect(second.config.handRelationshipInverted).toBe(true);
  });

  it("reaches GenerationOptions", () => {
    const state = createGenerationConfigState();
    state.updateConfig({ handRelationship: "unison" });
    const options = uiConfigToGenerationOptions(state.config);
    expect(options.handRelationship).toBe("unison");
    expect(options.handRelationshipInverted).toBe(false);
  });

  it("drops an unknown persisted value so the default wins", () => {
    expect(
      normalizePersistedGenerationConfig({
        handRelationship: "sideways",
        handRelationshipInverted: "yes",
      })
    ).toEqual({});
    expect(
      normalizePersistedGenerationConfig({
        handRelationship: "flipped",
        handRelationshipInverted: true,
      })
    ).toEqual({ handRelationship: "flipped", handRelationshipInverted: true });
  });

  it("coerces the default quartered rotation to halved once the hands are mirrored", () => {
    const state = createGenerationConfigState();
    state.updateConfig({
      loopEnabled: true,
      loopType: "rotated",
      period: "quartered",
      handRelationship: "mirrored",
    });
    expect(uiConfigToGenerationOptions(state.config).period).toBe("halved");
    state.updateConfig({ handRelationship: "unison" });
    expect(uiConfigToGenerationOptions(state.config).period).toBe("quartered");
  });

  it("reset puts the relationship back to Free", () => {
    const state = createGenerationConfigState();
    state.updateConfig({
      handRelationship: "opposite",
      handRelationshipInverted: true,
    });
    state.resetConfig();
    expect(state.config.handRelationship).toBe("free");
    expect(state.config.handRelationshipInverted).toBe(false);
  });
});

describe("Match turns in the Generate config", () => {
  it("starts off, round-trips, reaches GenerationOptions, and resets", () => {
    expect(GENERATE_DEFAULT_CONFIG.matchHandTurns).toBe(false);
    const first = createGenerationConfigState();
    expect(first.config.matchHandTurns).toBe(false);
    first.updateConfig({ matchHandTurns: true });
    const second = createGenerationConfigState();
    expect(second.config.matchHandTurns).toBe(true);
    expect(uiConfigToGenerationOptions(second.config).matchHandTurns).toBe(true);
    second.resetConfig();
    expect(second.config.matchHandTurns).toBe(false);
  });

  it("drops a non-boolean persisted value", () => {
    expect(normalizePersistedGenerationConfig({ matchHandTurns: "yes" })).toEqual({});
    expect(normalizePersistedGenerationConfig({ matchHandTurns: true })).toEqual({
      matchHandTurns: true,
    });
  });
});

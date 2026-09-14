import { beforeEach, describe, expect, it } from "vitest";
import { buildCardDescriptors } from "../card-configurator";
import { createGenerationConfigState } from "../../../state/generate-config.svelte";
import { DifficultyLevel } from "../../domain/models/generate-models";
import {
  LOOPType,
  Period,
} from "../../../circular/domain/models/circular-models";
import type { CardHandlers } from "$lib/shared/create/domain/generator-contract-types";

describe("LOOP length increments", () => {
  beforeEach(() => localStorage.clear());

  function lengthProps(state: ReturnType<typeof createGenerationConfigState>) {
    return buildCardDescriptors(
      state.config,
      DifficultyLevel.INTERMEDIATE,
      true,
      {} as CardHandlers,
      [0, 1],
      false,
      false,
      state.config.loopEnabled
    ).find((card) => card.id === "length")!.props as {
      stepOverride?: number;
      minOverride?: number;
    };
  }

  it("keeps quartered rotation while stepping from 8 to 16 and back", () => {
    const state = createGenerationConfigState({
      length: 8,
      loopEnabled: true,
      loopType: LOOPType.ROTATED,
      period: Period.QUARTERED,
    });
    for (const expected of [12, 16, 12, 8]) {
      const step = lengthProps(state).stepOverride ?? 2;
      state.updateConfig({
        length:
          state.config.length + (expected > state.config.length ? step : -step),
      });
      expect(state.config.length).toBe(expected);
      expect(state.config.period).toBe(Period.QUARTERED);
      expect(state.config.loopEnabled).toBe(true);
    }
  });

  it("still reaches 10 steps with halved rotation", () => {
    const state = createGenerationConfigState({
      length: 8,
      loopEnabled: true,
      loopType: LOOPType.ROTATED,
      period: Period.HALVED,
    });
    state.updateConfig({
      length: state.config.length + (lengthProps(state).stepOverride ?? 2),
    });
    expect(state.config.length).toBe(10);
    expect(state.config.period).toBe(Period.HALVED);
  });

  it("preserves both expansion intervals for combined rotation and inversion", () => {
    const state = createGenerationConfigState({
      length: 16,
      loopEnabled: true,
      loopType: LOOPType.ROTATED_INVERTED,
      period: Period.QUARTERED,
      inversionInterval: 2,
      inversionMode: "expand",
    });
    expect(lengthProps(state).stepOverride).toBe(8);
    state.updateConfig({ length: 16 + (lengthProps(state).stepOverride ?? 2) });
    expect(state.config.length).toBe(24);
    expect(state.config.period).toBe(Period.QUARTERED);
    expect(state.config.inversionInterval).toBe(2);
  });

  it("uses the ordinary stepper when LOOP is off", () => {
    const state = createGenerationConfigState({ loopEnabled: false });
    expect(lengthProps(state).stepOverride).toBeUndefined();
  });

  it("keeps the minimum compatible with mixed expansion intervals", () => {
    const state = createGenerationConfigState({
      length: 24,
      level: 2,
      loopEnabled: true,
      loopType: LOOPType.ROTATED_INVERTED,
      period: Period.QUARTERED,
      inversionInterval: 2,
      inversionMode: "expand",
    });
    const minimum = lengthProps(state).minOverride!;
    state.updateConfig({ length: minimum });
    expect(state.config.period).toBe(Period.QUARTERED);
    expect(state.config.inversionInterval).toBe(2);
    expect(state.config.loopEnabled).toBe(true);
  });
});

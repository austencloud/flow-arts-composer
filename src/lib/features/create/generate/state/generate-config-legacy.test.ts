import { beforeEach, describe, expect, it } from "vitest";
import { createGenerationConfigState } from "./generate-config.svelte";
import { uiConfigToGenerationOptions } from "../shared/utils/config-mapper";

beforeEach(() => localStorage.clear());

describe("Generate config compatibility", () => {
  it.each([
    { left: [0], right: [0] },
    { left: [1, 0], right: [0, 1] },
    { blue: [1, 0], red: [0.5] },
  ])("drops old turn patterns from restored sessions and applied setups: %j", (turnPattern) => {
    localStorage.setItem("tka-generate-config", JSON.stringify({
      mode: "freeform", length: 16, level: 2, turnIntensity: 1, turnPattern,
    }));
    const state = createGenerationConfigState();
    expect(state.config).not.toHaveProperty("turnPattern");

    state.updateConfig({ turnIntensity: 2, turnPattern } as never);
    expect(state.config).not.toHaveProperty("turnPattern");
    const options = uiConfigToGenerationOptions(state.config);
    expect(options.turnIntensity).toBe(2);
    expect(options).not.toHaveProperty("turnPattern");
    expect(JSON.parse(localStorage.getItem("tka-generate-config")!))
      .not.toHaveProperty("turnPattern");

    const initialized = createGenerationConfigState({ level: 2, turnPattern } as never);
    expect(initialized.config).not.toHaveProperty("turnPattern");
  });

  it("ignores a stale pattern even when a caller bypasses config restoration", () => {
    const state = createGenerationConfigState({ level: 2, turnIntensity: 1 });
    const options = uiConfigToGenerationOptions({
      ...state.config,
      turnPattern: { left: [0], right: [0] },
    } as never);
    expect(options.turnIntensity).toBe(1);
    expect(options).not.toHaveProperty("turnPattern");
  });
});

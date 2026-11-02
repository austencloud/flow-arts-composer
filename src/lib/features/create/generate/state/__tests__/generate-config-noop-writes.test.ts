// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { createGenerationConfigState } from "../generate-config.svelte";
import { LOOPType, Period } from "../../circular/domain/models/circular-models";

/**
 * `updateConfig` used to reassign `config` on every call, so a write that
 * changed nothing still handed every downstream `$derived` a fresh object
 * reference. That rebuilt every card descriptor and every handler closure
 * inside it, which re-armed effects that read one of those callbacks — the
 * amplifier that turned one bad clamp call into the infinite loop that crashed
 * the generator panel. See LengthCard.svelte.test.ts for the crash itself.
 */
describe("updateConfig identity", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps the same object reference when nothing changes", () => {
    const state = createGenerationConfigState({ length: 16 });
    const before = state.config;

    state.updateConfig({ length: 16 });

    expect(state.config).toBe(before);
  });

  it("ignores an all-undefined update", () => {
    const state = createGenerationConfigState({ length: 16 });
    const before = state.config;

    state.updateConfig({ length: undefined, level: undefined });

    expect(state.config).toBe(before);
  });

  it("still produces a new reference and value on a real change", () => {
    const state = createGenerationConfigState({ length: 16 });
    const before = state.config;

    state.updateConfig({ length: 12 });

    expect(state.config).not.toBe(before);
    expect(state.config.length).toBe(12);
  });

  it("applies a partial update where only one field actually differs", () => {
    const state = createGenerationConfigState({ length: 16, level: 2 });
    const before = state.config;

    state.updateConfig({ length: 16, level: 3 });

    expect(state.config).not.toBe(before);
    expect(state.config.level).toBe(3);
    expect(state.config.length).toBe(16);
  });

  it("keeps an exact 10-step request by fitting a quartered rotated LOOP", () => {
    const state = createGenerationConfigState({
      length: 8,
      loopEnabled: true,
      loopType: LOOPType.ROTATED,
      period: Period.QUARTERED,
    });

    state.updateConfig({ length: 10 });

    expect(state.config.length).toBe(10);
    expect(state.config.loopEnabled).toBe(true);
    expect(state.config.period).toBe(Period.HALVED);
  });
});

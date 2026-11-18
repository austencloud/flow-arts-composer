// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock(
  "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js",
  () => ({
    getAnimationVisibilityManager: () => ({ getVisibility: () => false }),
  })
);
vi.mock("#lib/shared/3d/undo/get-scene-undo-manager.js", () => ({
  getSceneUndoManager: () => ({
    registerDomain: vi.fn(),
    captureState: vi.fn(),
    commitState: vi.fn(),
    commitStateCoalescing: vi.fn(),
  }),
}));

const { VideoExportOrchestrator } = await import("./video-export-orchestrator");
const { createEffectsConfigState } = await import(
  "#lib/shared/effects/state/effects-config-state.svelte.js"
);

type Overrides = { fire?: boolean; led?: boolean; trails?: boolean; charcoal?: boolean };
type Priv = {
  applyEffectOverrides(vm: unknown, o?: Overrides): unknown;
  restoreEffectState(vm: unknown, saved: unknown): void;
};

function setup() {
  const orchestrator = new VideoExportOrchestrator(
    {} as never,
    {} as never,
    {} as never,
    {} as never
  ) as unknown as Priv;
  const ecs = createEffectsConfigState(undefined, { persist: false });
  return { orchestrator, ecs, vm: { effectsConfigState: ecs } };
}

describe("export effect overrides", () => {
  it("with matching props, an override writes the one-effect map as before", () => {
    for (const [o, effect] of [
      [{ fire: true }, "fire"],
      [{ led: true }, "led"],
      [{ trails: true }, "trails"],
      [{ charcoal: true, fire: false }, "charcoal"],
    ] as const) {
      const { orchestrator, ecs, vm } = setup();
      ecs.setActiveEffect("sparkles");
      const saved = orchestrator.applyEffectOverrides(vm, o);
      expect(ecs.tipEffectMap).toEqual({ "*": { effect } });
      expect(ecs.activeEffect).toBe(effect);
      orchestrator.restoreEffectState(vm, saved);
      expect(ecs.tipEffectMap).toEqual({ "*": { effect: "sparkles" } });
    }
    const { orchestrator, ecs, vm } = setup();
    orchestrator.applyEffectOverrides(vm, {});
    expect(ecs.tipEffectMap).toEqual({});
  });

  it("with no overrides, a two-effect map is left as the viewer has it", () => {
    const { orchestrator, ecs, vm } = setup();
    ecs.setEffectFor(0, "fire");
    ecs.setEffectFor(1, "trails");
    const before = structuredClone(plain(ecs.tipEffectMap));
    expect(orchestrator.applyEffectOverrides(vm, undefined)).toBeNull();
    expect(ecs.tipEffectMap).toEqual(before);
  });
});

function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

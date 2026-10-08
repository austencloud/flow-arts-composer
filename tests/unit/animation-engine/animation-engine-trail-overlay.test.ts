/**
 * An engine builds the GPU trail layer unless its host opts out before
 * initialize(): the host's choice has to reach the lifecycle manager's init
 * context.
 */
import { describe, it, expect, vi } from "vitest";

// ── Block transitive imports that crash in jsdom (protobuf/Firebase) ──────────
vi.mock("$lib/shared/di", () => ({ container: {} }));
vi.mock(
  "$lib/shared/animation-engine/state/animation-visibility-state.svelte",
  () => ({
    getAnimationVisibilityManager: vi.fn(),
  })
);
vi.mock("$lib/features/compose/utils/animation-panel-persistence", () => ({
  loadTrailSettings: vi.fn(() => ({})),
}));
vi.mock(
  "$lib/features/compose/services/implementations/Canvas2DAnimationRenderer",
  () => ({ Canvas2DAnimationRenderer: class {} })
);
vi.mock("$lib/shared/animation-engine/services/animator-loader", () => ({
  loadAnimatorServices: vi.fn(),
}));
vi.mock("@firebase/firestore", () => ({}));
vi.mock("@firebase/firestore/lite", () => ({}));
vi.mock("$lib/shared/application/state/app-state.svelte", () => ({
  getSettings: vi.fn(() => ({})),
}));
vi.mock(
  "$lib/shared/settings/services/implementations/FirebaseSettingsPersister",
  () => ({ FirebaseSettingsPersister: class {} })
);
vi.mock("$lib/shared/di/containers/core-container", () => ({}));

import { AnimationEngine } from "$lib/shared/animation-engine/services/animation-engine.svelte";
import type { LifecycleInitCtx } from "$lib/shared/animation-engine/services/canvas-lifecycle-manager";
import type { AnimationVisibilityStateManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";

/** A visibility manager that answers every read with "off". */
function makeVisibilityStub(): AnimationVisibilityStateManager {
  return new Proxy(
    {},
    { get: () => () => false }
  ) as unknown as AnimationVisibilityStateManager;
}

/** Initialize an engine, returning the context it handed the lifecycle manager. */
async function initContext(
  configure: (engine: AnimationEngine) => void
): Promise<LifecycleInitCtx> {
  const engine = new AnimationEngine();
  engine.setVisibilityManager(makeVisibilityStub());
  const initialize = vi.fn(async () => {});
  (
    engine as unknown as { lifecycleManager: { initialize: typeof initialize } }
  ).lifecycleManager.initialize = initialize;
  configure(engine);
  await engine.initialize(document.createElement("div"));
  expect(initialize).toHaveBeenCalledOnce();
  return (initialize.mock.calls[0] as unknown as [LifecycleInitCtx])[0];
}

describe("AnimationEngine trail overlay", () => {
  it("asks for the GPU trail layer by default", async () => {
    const ctx = await initContext(() => {});
    expect(ctx.trailOverlay).toBe(true);
  });

  it("passes an opt-out to the lifecycle manager", async () => {
    const ctx = await initContext((engine) =>
      engine.setTrailOverlayEnabled(false)
    );
    expect(ctx.trailOverlay).toBe(false);
  });
});

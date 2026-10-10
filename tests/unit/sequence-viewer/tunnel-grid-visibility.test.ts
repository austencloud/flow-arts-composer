import { afterEach, describe, expect, it } from "vitest";
import { flushSync } from "svelte";
import { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
import { DEFAULT_TUNNEL_VIEW_STATE } from "#lib/shared/sequence-viewer/tunnel/tunnel-view-state.js";
import { createRootedTunnelViewController } from "#lib/shared/sequence-viewer/services/viewer-url-slices/tn-slice-test-harness.svelte.js";

const disposals: Array<() => void> = [];

afterEach(() => {
  while (disposals.length) disposals.pop()!();
});

describe("Tunnel grid visibility ownership", () => {
  it("uses one visibility setting in both directions", () => {
    const visibility = new AnimationVisibilityStateManager({ ephemeral: true });
    visibility.setGridMode("8point");
    const rooted = createRootedTunnelViewController({
      getSequence: () => null,
      visibilityManager: visibility,
      initialViewState: {
        ...DEFAULT_TUNNEL_VIEW_STATE,
        gridVisible: false,
      },
      persistViewState: false,
    });
    disposals.push(rooted.dispose);
    flushSync();

    // The Animator preference wins over the legacy Tunnel-local value.
    expect(rooted.controller.gridVisible).toBe(true);

    rooted.controller.gridVisible = false;
    flushSync();
    expect(visibility.isGridVisible()).toBe(false);

    visibility.setGridMode("8point");
    flushSync();
    expect(rooted.controller.gridVisible).toBe(true);
  });

  it("keeps snapshot-local visibility for standalone previews", () => {
    const rooted = createRootedTunnelViewController({
      getSequence: () => null,
      initialViewState: {
        ...DEFAULT_TUNNEL_VIEW_STATE,
        gridVisible: true,
      },
      persistViewState: false,
    });
    disposals.push(rooted.dispose);
    flushSync();

    expect(rooted.controller.gridVisible).toBe(true);
    rooted.controller.gridVisible = false;
    expect(rooted.controller.gridVisible).toBe(false);
  });
});

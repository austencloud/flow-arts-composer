import { describe, expect, it } from "vitest";

import { createShapeMatrixAnimationState } from "#lib/shared/shape-matrix/app/state/shape-matrix-animation-state.svelte.js";

describe("Shape Matrix animation state", () => {
  it("starts as an ephemeral, playing 60 BPM trail presentation", () => {
    const state = createShapeMatrixAnimationState();

    expect(state.playing).toBe(true);
    expect(state.bpm).toBe(60);
    expect(state.playbackMode).toBe("continuous");
    expect(state.scope.effects.config.activeEffect).toBe("trails");
    expect(state.scope.effects.trails.trackingMode).toBe("right_end");
    expect(state.scope.visibility.getPathPolicy()).toEqual({
      pathShape: "arc",
      motionAwarePaths: false,
    });
  });

  it("keeps playback settings in one workspace owner", () => {
    const state = createShapeMatrixAnimationState();

    state.togglePlaying();
    state.setBpm(84);
    state.setPlaybackMode("step");

    expect(state.playing).toBe(false);
    expect(state.bpm).toBe(84);
    expect(state.scope.visibility.getBpm()).toBe(84);
    expect(state.playbackMode).toBe("step");
    expect(state.scope.visibility.getPlaybackMode()).toBe("step");
  });

  it("keeps settings open while applying disassembly", () => {
    const state = createShapeMatrixAnimationState();

    state.setActiveSection("effects");
    state.requestDisassembled(true);

    expect(state.closeRequest).toBe(0);
    expect(state.disassembled).toBe(true);
    expect(state.activeSection).toBe("effects");
  });

  it("changes disassembly directly when no tray is open", () => {
    const state = createShapeMatrixAnimationState();

    state.requestDisassembled(true);
    expect(state.disassembled).toBe(true);

    state.requestDisassembled(false);
    expect(state.disassembled).toBe(false);
  });

  it("uses the relationship header to close whichever control tray is open", () => {
    const state = createShapeMatrixAnimationState();

    state.setActiveSection("playback");
    state.showRelationships();

    expect(state.closeRequest).toBe(1);
    expect(state.activeSection).toBeNull();
  });
});

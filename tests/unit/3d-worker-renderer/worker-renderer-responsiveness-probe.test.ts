import { describe, expect, it } from "vitest";
import {
  createWorkerRendererResponsivenessState,
  recordMainThreadTimer,
  recordOutgoingWorkerFrame,
} from "$lib/shared/3d/worker-renderer/services/worker-renderer-responsiveness-probe";

describe("worker renderer responsiveness accounting", () => {
  it("counts application-thread timer stalls above the 50ms contract", () => {
    const state = createWorkerRendererResponsivenessState(7, 100);

    recordMainThreadTimer(state, 116);
    state.currentPhase = "performer";
    recordMainThreadTimer(state, 181);
    state.currentPhase = "compile";
    recordMainThreadTimer(state, 214);

    expect(state.mainThreadMaxGapMs).toBe(65);
    expect(state.mainThreadMaxGapPhase).toBe("performer");
    expect(state.mainThreadGapsOver50Ms).toBe(1);
  });

  it("keeps the worst outgoing-scene frame gap during a handoff", () => {
    const state = createWorkerRendererResponsivenessState(9, 200);

    recordOutgoingWorkerFrame(state, 16.7, 216.7);
    state.currentPhase = "compile";
    recordOutgoingWorkerFrame(state, 84.2, 300.9);
    state.currentPhase = "first-frame";
    recordOutgoingWorkerFrame(state, 33.4, 334.3);

    expect(state.outgoingWorkerMaxFrameGapMs).toBe(84.2);
    expect(state.outgoingWorkerMaxFrameGapPhase).toBe("compile");
  });
});

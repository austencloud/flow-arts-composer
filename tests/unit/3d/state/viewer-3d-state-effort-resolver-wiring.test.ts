import { describe, it, expect, vi } from "vitest";
import { installPerformerEffortResolver } from "#lib/shared/3d/state/viewer-3d-state-effort-wiring.js";

describe("installPerformerEffortResolver", () => {
  it("registers a resolver that looks up performer effort by id", () => {
    const fakeEngine = { setPerformerEffortResolver: vi.fn() };
    const performerManager = {
      performers: [
        { id: "p1", effectiveEffortId: "linear" },
        { id: "p2", effectiveEffortId: "glide" },
      ],
    };
    installPerformerEffortResolver(fakeEngine as any, performerManager as any);
    expect(fakeEngine.setPerformerEffortResolver).toHaveBeenCalledTimes(1);
    const [resolver] = fakeEngine.setPerformerEffortResolver.mock.calls[0];
    expect(resolver("p1")).toBe("linear");
    expect(resolver("p2")).toBe("glide");
  });

  it("returns 'linear' fallback for unknown performer id", () => {
    const fakeEngine = { setPerformerEffortResolver: vi.fn() };
    const performerManager = { performers: [] };
    installPerformerEffortResolver(fakeEngine as any, performerManager as any);
    const [resolver] = fakeEngine.setPerformerEffortResolver.mock.calls[0];
    expect(resolver("does-not-exist")).toBe("linear");
  });
});

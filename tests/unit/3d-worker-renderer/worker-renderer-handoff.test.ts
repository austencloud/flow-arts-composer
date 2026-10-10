import { describe, expect, it } from "vitest";
import {
  acceptWorkerFirstFrame,
  createWorkerRendererHandoffState,
  rejectWorkerEnvironment,
  requestWorkerEnvironment,
} from "#lib/shared/3d/worker-renderer/domain/worker-renderer-handoff.js";

describe("worker renderer handoff", () => {
  it("does not expose the first world until its worker renders a frame", () => {
    const initial = createWorkerRendererHandoffState();
    const requested = requestWorkerEnvironment(initial, "rainbow");
    expect(requested.type).toBe("stage");
    if (requested.type !== "stage") return;
    expect(requested.state.active).toBeNull();
    expect(requested.slot.status).toBe("booting");

    const rendered = acceptWorkerFirstFrame(
      requested.state,
      requested.slot.requestId
    );
    expect(rendered.type).toBe("swap");
    if (rendered.type !== "swap") return;
    expect(rendered.state.active?.environment).toBe("rainbow");
    expect(rendered.state.active?.status).toBe("active");
    expect(rendered.state.staging).toBeNull();
  });

  it("keeps the active world while the replacement boots", () => {
    const first = requestWorkerEnvironment(
      createWorkerRendererHandoffState(),
      "rainbow"
    );
    if (first.type !== "stage") throw new Error("Expected first stage");
    const active = acceptWorkerFirstFrame(first.state, first.slot.requestId);
    if (active.type !== "swap") throw new Error("Expected first swap");

    const replacement = requestWorkerEnvironment(active.state, "ocean");
    expect(replacement.type).toBe("stage");
    if (replacement.type !== "stage") return;
    expect(replacement.state.active?.environment).toBe("rainbow");
    expect(replacement.state.staging?.environment).toBe("ocean");
    expect(replacement.slot.id).not.toBe(replacement.state.active?.id);
  });

  it("ignores a stale first frame after a newer request supersedes it", () => {
    const first = requestWorkerEnvironment(
      createWorkerRendererHandoffState(),
      "rainbow"
    );
    if (first.type !== "stage") throw new Error("Expected first stage");
    const second = requestWorkerEnvironment(first.state, "ocean");
    if (second.type !== "stage") throw new Error("Expected second stage");

    const stale = acceptWorkerFirstFrame(second.state, first.slot.requestId);
    expect(stale.type).toBe("ignored");
    expect(stale.state.staging?.environment).toBe("ocean");
  });

  it("cancels staging when the user returns to the visible world", () => {
    const first = requestWorkerEnvironment(
      createWorkerRendererHandoffState(),
      "rainbow"
    );
    if (first.type !== "stage") throw new Error("Expected first stage");
    const active = acceptWorkerFirstFrame(first.state, first.slot.requestId);
    if (active.type !== "swap") throw new Error("Expected first swap");
    const ocean = requestWorkerEnvironment(active.state, "ocean");
    if (ocean.type !== "stage") throw new Error("Expected Ocean stage");

    const returned = requestWorkerEnvironment(ocean.state, "rainbow");
    expect(returned.type).toBe("cancel");
    if (returned.type !== "cancel") return;
    expect(returned.dispose.environment).toBe("ocean");
    expect(returned.state.active?.environment).toBe("rainbow");
    expect(returned.state.staging).toBeNull();
  });

  it("leaves the active world visible when staging fails", () => {
    const first = requestWorkerEnvironment(
      createWorkerRendererHandoffState(),
      "rainbow"
    );
    if (first.type !== "stage") throw new Error("Expected first stage");
    const active = acceptWorkerFirstFrame(first.state, first.slot.requestId);
    if (active.type !== "swap") throw new Error("Expected first swap");
    const ocean = requestWorkerEnvironment(active.state, "ocean");
    if (ocean.type !== "stage") throw new Error("Expected Ocean stage");

    const failed = rejectWorkerEnvironment(ocean.state, ocean.slot.requestId);
    expect(failed.type).toBe("failed");
    if (failed.type !== "failed") return;
    expect(failed.role).toBe("staging");
    expect(failed.state.active?.environment).toBe("rainbow");
    expect(failed.state.staging).toBeNull();
  });

  it("removes a failed active world without cancelling its replacement", () => {
    const first = requestWorkerEnvironment(
      createWorkerRendererHandoffState(),
      "rainbow"
    );
    if (first.type !== "stage") throw new Error("Expected first stage");
    const active = acceptWorkerFirstFrame(first.state, first.slot.requestId);
    if (active.type !== "swap") throw new Error("Expected first swap");
    const ocean = requestWorkerEnvironment(active.state, "ocean");
    if (ocean.type !== "stage") throw new Error("Expected Ocean stage");

    const failed = rejectWorkerEnvironment(
      ocean.state,
      active.incoming.requestId
    );
    expect(failed.type).toBe("failed");
    if (failed.type !== "failed") return;
    expect(failed.role).toBe("active");
    expect(failed.state.active).toBeNull();
    expect(failed.state.staging?.environment).toBe("ocean");
  });

  it("ignores a failure from a slot that is no longer owned", () => {
    const state = createWorkerRendererHandoffState();
    const failed = rejectWorkerEnvironment(state, 404);
    expect(failed).toEqual({ type: "ignored", state });
  });
});

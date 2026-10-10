import { describe, expect, it, vi } from "vitest";
import {
  PendingActionQueue,
  PENDING_ACTION_TTL_MS,
} from "#lib/shared/sequence-viewer/services/pending-action-queue.js";

describe("PendingActionQueue", () => {
  it("restores a gated download from a QR browser-handoff URL", () => {
    const queue = new PendingActionQueue();

    queue.bootstrapFromUrl(
      new URL("https://tkaflowarts.com/q/AB12?pending=download")
    );

    expect(queue.peek()).toMatchObject({
      type: "download",
      sequenceId: "AB12",
    });
    expect(queue.serializeToUrlParam()).toBe("download");
  });

  it("expires a queued action before replay", () => {
    const queue = new PendingActionQueue();
    let now = 1_000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);

    try {
      queue.enqueue({ type: "download", sequenceId: "AB12" });
      now += PENDING_ACTION_TTL_MS + 1;

      expect(queue.drain()).toBeNull();
    } finally {
      nowSpy.mockRestore();
    }
  });
});

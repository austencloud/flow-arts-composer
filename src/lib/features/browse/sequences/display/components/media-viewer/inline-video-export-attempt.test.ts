import { describe, expect, it, vi } from "vitest";
import { createInlineVideoExportAttempt } from "./inline-video-export-attempt";

describe("inline video export cancellation", () => {
  it("does not start an export after Cancel arrives during lazy loading", () => {
    const attempt = createInlineVideoExportAttempt();
    const stop = vi.fn();

    attempt.cancel();

    expect(attempt.cancelled).toBe(true);
    expect(attempt.attach(stop)).toBe(false);
    expect(stop).not.toHaveBeenCalled();
  });

  it("stops an active export once, including repeated Cancel or Escape", () => {
    const attempt = createInlineVideoExportAttempt();
    const stop = vi.fn();

    expect(attempt.attach(stop)).toBe(true);
    attempt.cancel();
    attempt.cancel();

    expect(attempt.cancelled).toBe(true);
    expect(stop).toHaveBeenCalledOnce();
  });
});

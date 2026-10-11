import { beforeEach, describe, expect, it, vi } from "vitest";
import { frameStatsRecorder } from "#lib/shared/animation-engine/services/frame-stats-recorder.js";

describe("FrameStatsRecorder console behavior", () => {
  beforeEach(() => {
    localStorage.removeItem("tka-frame-stats-live");
    vi.spyOn(console, "info").mockImplementation(() => {});
    frameStatsRecorder.reset();
  });

  it("keeps automatic five-second reports opt-in", () => {
    const info = vi.mocked(console.info);
    info.mockClear();
    const now = vi
      .spyOn(performance, "now")
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(6_002);

    frameStatsRecorder.record(16, 0.2);
    frameStatsRecorder.record(16, 0.2);

    expect(info).not.toHaveBeenCalled();
    now.mockRestore();
  });
});

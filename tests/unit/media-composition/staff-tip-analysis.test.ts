import { describe, expect, it, vi } from "vitest";
import {
  createStaffTipAnalysis,
  type StaffTipAnalysisDeps,
} from "$lib/shared/media-composition/state/staff-tip-analysis.svelte";
import type { StaffTipTrack } from "$lib/shared/media-composition/domain/staff-tip-track";

const TRACK = { version: 1, sampleCount: 0 } as unknown as StaffTipTrack;
const NEWER = { version: 1, sampleCount: 1 } as unknown as StaffTipTrack;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function deps(overrides: Partial<StaffTipAnalysisDeps> = {}): StaffTipAnalysisDeps {
  return {
    load: vi.fn(async () => null),
    save: vi.fn(async () => undefined),
    fetchVideo: vi.fn(async () => new Blob()),
    analyze: vi.fn(async () => TRACK),
    ...overrides,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("staff tip analysis", () => {
  it("reads a take's saved ends once", async () => {
    const load = vi.fn(async () => TRACK);
    const analysis = createStaffTipAnalysis(deps({ load }));
    analysis.ensure("take-a");
    analysis.ensure("take-a");
    expect(analysis.status("take-a")).toBe("loading");
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
    expect(analysis.status("take-a")).toBe("ready");
    expect(analysis.track("take-a")).toBe(TRACK);
  });

  it("finds, reports progress, uses the ends at once and saves them", async () => {
    const running = deferred<StaffTipTrack>();
    let report: ((fraction: number) => void) | undefined;
    const save = vi.fn(async () => undefined);
    const analysis = createStaffTipAnalysis(
      deps({
        save,
        analyze: vi.fn((_video, options) => {
          report = options.onProgress;
          return running.promise;
        }),
      })
    );
    const done = analysis.find("take-a", "blob:video");
    await settle();
    expect(analysis.status("take-a")).toBe("finding");
    report!(0.004);
    expect(analysis.progress("take-a")).toBe(0);
    report!(0.4);
    expect(analysis.progress("take-a")).toBe(0.4);
    running.resolve(TRACK);
    await done;
    expect(analysis.status("take-a")).toBe("ready");
    expect(analysis.track("take-a")).toBe(TRACK);
    expect(save).toHaveBeenCalledWith("take-a", TRACK);
  });

  it("keeps the old ends in use while finding again, and after a stop", async () => {
    const running = deferred<StaffTipTrack>();
    const analysis = createStaffTipAnalysis(
      deps({
        load: vi.fn(async () => TRACK),
        analyze: vi.fn((_video, options) => {
          options.signal?.addEventListener("abort", () =>
            running.reject(new DOMException("stopped", "AbortError"))
          );
          return running.promise;
        }),
      })
    );
    analysis.ensure("take-a");
    await settle();
    const done = analysis.find("take-a", "blob:video");
    await settle();
    expect(analysis.track("take-a")).toBe(TRACK);
    analysis.cancel("take-a");
    await done;
    expect(analysis.status("take-a")).toBe("ready");
    expect(analysis.track("take-a")).toBe(TRACK);
  });

  it("says when a search fails and a fresh search replaces the ends", async () => {
    const analyze = vi
      .fn<StaffTipAnalysisDeps["analyze"]>()
      .mockRejectedValueOnce(new Error("no staffs"))
      .mockResolvedValueOnce(NEWER);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const analysis = createStaffTipAnalysis(deps({ analyze }));
    await analysis.find("take-a", "blob:video");
    expect(analysis.status("take-a")).toBe("failed");
    expect(analysis.track("take-a")).toBeNull();
    await analysis.find("take-a", "blob:video");
    expect(analysis.status("take-a")).toBe("ready");
    expect(analysis.track("take-a")).toBe(NEWER);
    error.mockRestore();
  });
});

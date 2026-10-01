import { describe, expect, it } from "vitest";
import {
  previewClockStep,
  type PreviewClockMedia,
} from "$lib/shared/media-composition/services/post-preview-clock";

const footage: PreviewClockMedia = {
  currentTime: 8.04,
  targetTime: 8,
  playbackRate: 1,
  ready: true,
  ended: false,
};

describe("post preview media clock", () => {
  it("follows decoded playback rather than accumulating wall clock drift", () => {
    expect(previewClockStep(3, 0.2, [footage]).deltaSeconds).toBeCloseTo(0.04);
    expect(
      previewClockStep(3, 1, [{ ...footage, currentTime: 8 }]).deltaSeconds
    ).toBe(0);
  });

  it("freezes all composition layers when any crossfade video buffers", () => {
    expect(
      previewClockStep(3, 0.2, [footage, { ...footage, ready: false }])
    ).toEqual({
      deltaSeconds: 0,
      waiting: true,
    });
  });

  it("resumes from media progress without charging buffered wall time", () => {
    const held = previewClockStep(3, 10, [{ ...footage, ready: false }]);
    const resumed = previewClockStep(3, 10, [footage]);
    expect(held.deltaSeconds).toBe(0);
    expect(resumed.waiting).toBe(false);
    expect(resumed.deltaSeconds).toBeCloseTo(0.04);
  });

  it("maps native source time through trim and authored slow or fast speed", () => {
    expect(
      previewClockStep(3, 0.016, [{ ...footage, playbackRate: 0.5 }])
        .deltaSeconds
    ).toBeCloseTo(0.08);
    expect(
      previewClockStep(3, 0.016, [{ ...footage, playbackRate: 2 }]).deltaSeconds
    ).toBeCloseTo(0.02);
    const scrubbed = { ...footage, currentTime: 20.04, targetTime: 20 };
    expect(previewClockStep(10, 0.016, [scrubbed]).deltaSeconds).toBeCloseTo(
      0.04
    );
  });

  it("uses a stable master and never moves the timeline backward", () => {
    const ahead = { ...footage, currentTime: 9 };
    expect(
      previewClockStep(3, 0.016, [footage, ahead]).deltaSeconds
    ).toBeCloseTo(0.04);
    expect(
      previewClockStep(3, 0.016, [{ ...footage, currentTime: 7.98 }])
        .deltaSeconds
    ).toBe(0);
  });

  it("crosses only the next cut so incoming media gets its readiness gate", () => {
    const step = previewClockStep(3, 1, [{ ...footage, currentTime: 9 }], 3.1);
    expect(step.deltaSeconds).toBeCloseTo(0.100001);
    expect(
      previewClockStep(3.100001, 0.016, [{ ...footage, ready: false }]).waiting
    ).toBe(true);
  });

  it("advances still sections and leaves final native frames without deadlock", () => {
    expect(previewClockStep(3, 0.016, []).deltaSeconds).toBe(0.016);
    expect(
      previewClockStep(3, 0.016, [{ ...footage, ended: true }]).deltaSeconds
    ).toBe(0.016);
  });
});

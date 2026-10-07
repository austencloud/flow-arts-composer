import { describe, expect, it } from "vitest";
import {
  previewClockLeads,
  previewClockStep,
  type PreviewClockMedia,
} from "$lib/shared/media-composition/services/post-preview-clock";
import {
  previewPlaybackRate,
  rememberFollowLead,
  type FollowLead,
} from "$lib/shared/media-composition/services/video-preview-seek";

const footage: PreviewClockMedia = {
  currentTime: 8.04,
  targetTime: 8,
  playbackRate: 1,
  ready: true,
  ended: false,
};

const music: PreviewClockMedia = {
  currentTime: 20.05,
  targetTime: 20,
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

  it("reports how far each clip runs ahead of the master", () => {
    const leads = previewClockLeads([
      music,
      footage,
      { ...footage, currentTime: 16.06, targetTime: 16, playbackRate: 2 },
      { ...footage, currentTime: 8.07 },
    ]);
    expect(leads[0]).toBeNull();
    expect(leads[1]).toBeCloseTo(-0.01, 6);
    expect(leads[2]).toBeCloseTo(-0.02, 6);
    expect(leads[3]).toBeCloseTo(0.02, 6);
  });

  it("reports no lead for clips that cannot follow", () => {
    expect(
      previewClockLeads([
        music,
        { ...footage, ready: false },
        { ...footage, ended: true },
      ])
    ).toEqual([null, null, null]);
    expect(previewClockLeads([{ ...music, ended: true }, footage])).toEqual([
      null,
      null,
    ]);
    expect(previewClockLeads([{ ...music, ready: false }, footage])).toEqual([
      null,
      null,
    ]);
    expect(previewClockLeads([])).toEqual([]);
  });

  it("keeps muted footage within a frame of sounding music through the clock", () => {
    let clock = 0;
    let musicTime = 20;
    let footageTime = 8;
    let rate = 1;
    let worst = 0;
    let recent: FollowLead[] = [];
    for (let frame = 1; frame <= 1800; frame += 1) {
      musicTime += 1 / 60;
      footageTime += rate / 60;
      // The muted footage's clock loses a 20 ms step every half second.
      if (frame % 30 === 0) footageTime -= 0.02;
      const media = [
        { ...music, currentTime: musicTime, targetTime: 20 + clock },
        { ...footage, currentTime: footageTime, targetTime: 8 + clock },
      ];
      const lead = previewClockLeads(media)[1];
      if (typeof lead === "number")
        recent = rememberFollowLead(recent, {
          atMs: (frame * 1000) / 60,
          seconds: lead,
        });
      rate = previewPlaybackRate(
        1,
        recent.map((entry) => entry.seconds),
        rate !== 1
      );
      clock += previewClockStep(clock, 1 / 60, media).deltaSeconds;
      worst = Math.max(worst, Math.abs(footageTime - (8 + clock)));
    }
    expect(worst).toBeLessThan(1 / 30);
  });
});

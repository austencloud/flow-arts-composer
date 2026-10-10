import { describe, expect, it } from "vitest";
import {
  mixPostAudio,
  musicAudioKey,
  planMusicAudio,
  segmentGainAt,
} from "#lib/shared/media-composition/domain/post-audio-plan.js";
import type { PostMusic } from "#lib/shared/media-composition/domain/post-music.js";

function music(fields: Partial<PostMusic> = {}): PostMusic {
  return {
    id: "music-1",
    url: "/api/dev/feature-videos/promo/media/music/derail.wav",
    label: "Derail",
    startSeconds: 0,
    sourceInSeconds: 0,
    sourceOutSeconds: 120,
    durationSeconds: 120,
    gain: 1,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    ...fields,
  };
}

describe("planMusicAudio", () => {
  const placed = music({
    startSeconds: 2,
    sourceInSeconds: 5,
    sourceOutSeconds: 35,
    gain: 0.8,
    fadeInSeconds: 1,
    fadeOutSeconds: 2,
  });

  it("plans one segment with the music's level and fades", () => {
    expect(planMusicAudio(placed, 60)).toEqual([
      {
        takeId: "music:music-1",
        postStartSeconds: 2,
        sourceInSeconds: 5,
        durationSeconds: 30,
        gain: 0.8,
        crossfadeInSeconds: 1,
        crossfadeOutSeconds: 2,
      },
    ]);
  });

  it("cuts the music where the post ends", () => {
    const [segment] = planMusicAudio(placed, 20);
    expect(segment!.durationSeconds).toBe(18);
    expect(segment!.crossfadeOutSeconds).toBe(2);
  });

  it("leaves out fades it does not have", () => {
    const [segment] = planMusicAudio(music(), 60);
    expect(segment).not.toHaveProperty("crossfadeInSeconds");
    expect(segment).not.toHaveProperty("crossfadeOutSeconds");
  });

  it("plans nothing for no music, muted music, or music after the end", () => {
    expect(planMusicAudio(undefined, 60)).toEqual([]);
    expect(planMusicAudio(music({ gain: 0 }), 60)).toEqual([]);
    expect(planMusicAudio(music({ startSeconds: 60 }), 60)).toEqual([]);
  });

  it("keys the music apart from every take", () => {
    expect(musicAudioKey({ id: "music-1" })).toBe("music:music-1");
  });
});

describe("segmentGainAt", () => {
  const segment = {
    takeId: "a",
    postStartSeconds: 0,
    sourceInSeconds: 0,
    durationSeconds: 10,
    gain: 0.5,
    crossfadeInSeconds: 2,
  };

  it("follows the fade in and the short edge fade out", () => {
    expect(segmentGainAt(segment, 1)).toBeCloseTo(0.25, 9);
    expect(segmentGainAt(segment, 5)).toBeCloseTo(0.5, 9);
    expect(segmentGainAt(segment, 9.996)).toBeCloseTo(0.25, 6);
  });

  it("is silent outside the segment", () => {
    expect(segmentGainAt(segment, -0.1)).toBe(0);
    expect(segmentGainAt(segment, 10)).toBe(0);
  });
});

describe("mixing the music", () => {
  it("writes the level and fades the plan asks for", () => {
    const channel = new Float32Array(1000).fill(0.5);
    const [left] = mixPostAudio({
      segments: [
        {
          takeId: "m",
          postStartSeconds: 0,
          sourceInSeconds: 0,
          durationSeconds: 1,
          gain: 0.8,
          crossfadeInSeconds: 0.1,
          crossfadeOutSeconds: 0.2,
        },
      ],
      sources: new Map([["m", { sampleRate: 1000, channels: [channel] }]]),
      sampleRate: 1000,
      durationSeconds: 1,
    });
    const at = (i: number) => left![i]!;
    expect(at(0)).toBe(0);
    expect(at(50)).toBeCloseTo(0.2, 6);
    expect(at(100)).toBeCloseTo(0.4, 6);
    expect(at(500)).toBeCloseTo(0.4, 6);
    expect(at(800)).toBeCloseTo(0.4, 6);
    expect(at(900)).toBeCloseTo(0.2, 6);
    expect(at(999)).toBeCloseTo(0.002, 6);
  });

  it("copies a full-speed source sample for sample at the bed's rate", () => {
    // A source that flips between 1 and -1 every sample: read between its
    // samples, every one would average to 0.
    const channel = Float32Array.from({ length: 1024 }, (_, i) =>
      i % 2 ? -1 : 1
    );
    const [left] = mixPostAudio({
      segments: [
        {
          takeId: "a",
          postStartSeconds: 0,
          sourceInSeconds: 0.5 / 1024,
          durationSeconds: 0.25,
        },
      ],
      sources: new Map([["a", { sampleRate: 1024, channels: [channel] }]]),
      sampleRate: 1024,
      durationSeconds: 0.25,
      fadeSeconds: 0,
    });
    expect(Array.from(left!, Math.abs)).toEqual(new Array(256).fill(1));
  });
});

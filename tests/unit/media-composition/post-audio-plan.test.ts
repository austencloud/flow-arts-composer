import { describe, expect, it } from "vitest";
import {
  encodeWav,
  mixPostAudio,
  planPostAudio,
  type PostAudioSource,
} from "$lib/shared/media-composition/domain/post-audio-plan";
import type { CompiledAct } from "$lib/shared/media-composition/domain/post-plan-compiler";

function act(overrides: Partial<CompiledAct>): CompiledAct {
  return {
    actId: "act",
    kind: "performance",
    label: "Act",
    startSeconds: 0,
    endSeconds: 1,
    takeId: null,
    speed: 1,
    sourceIn: 0,
    sourceOut: 1,
    layout: null,
    ...overrides,
  };
}

describe("planPostAudio", () => {
  // Austen's template: full-speed split act, a half-speed breakdown reusing
  // the same take, then a card with no take at all.
  const threeActPost = {
    acts: [
      act({
        actId: "full-speed",
        startSeconds: 0,
        endSeconds: 20,
        takeId: "take-a",
        speed: 1,
        sourceIn: 0,
        sourceOut: 20,
        layout: "split",
      }),
      act({
        actId: "breakdown",
        startSeconds: 20,
        endSeconds: 60,
        takeId: "take-a",
        speed: 0.5,
        sourceIn: 0,
        sourceOut: 20,
        layout: "full",
      }),
      act({
        actId: "card",
        kind: "card",
        startSeconds: 60,
        endSeconds: 65,
        takeId: null,
        speed: 1,
        sourceIn: 0,
        sourceOut: 5,
        layout: null,
      }),
    ] satisfies CompiledAct[],
  };

  it("plans exactly one segment: the full-speed act's own take span at its own start", () => {
    expect(planPostAudio(threeActPost, "takes")).toEqual([
      {
        takeId: "take-a",
        postStartSeconds: 0,
        sourceInSeconds: 0,
        durationSeconds: 20,
      },
    ]);
  });

  it("leaves the slowed act and the card silent", () => {
    const segments = planPostAudio(threeActPost, "takes");
    expect(segments.some((segment) => segment.postStartSeconds === 20)).toBe(
      false
    );
    expect(segments.some((segment) => segment.postStartSeconds === 60)).toBe(
      false
    );
  });

  it("plans nothing at all when the post is silent", () => {
    expect(planPostAudio(threeActPost, "silent")).toEqual([]);
  });

  it("skips a performance act with no take and a zero-length source span", () => {
    const post = {
      acts: [
        act({ actId: "no-take", takeId: null, startSeconds: 0, endSeconds: 5 }),
        act({
          actId: "empty-span",
          takeId: "take-b",
          startSeconds: 5,
          endSeconds: 5,
          sourceIn: 3,
          sourceOut: 3,
        }),
      ] satisfies CompiledAct[],
    };
    expect(planPostAudio(post, "takes")).toEqual([]);
  });
});

describe("mixPostAudio", () => {
  it("places a constant source with a triangular fade at the edges and silence elsewhere", () => {
    const sampleRate = 1000;
    const constant = 0.8;
    const source: PostAudioSource = {
      sampleRate,
      channels: [new Float32Array(200).fill(constant)],
    };

    const [left, right] = mixPostAudio({
      segments: [
        {
          takeId: "x",
          postStartSeconds: 0.05,
          sourceInSeconds: 0,
          durationSeconds: 0.1,
        },
      ],
      sources: new Map([["x", source]]),
      sampleRate,
      durationSeconds: 0.3,
      fadeSeconds: 0.01, // 10 samples at this rate
    });

    expect(left.length).toBe(300);

    // Before the segment (samples 0..49): untouched silence.
    expect(left[0]).toBe(0);
    expect(left[49]).toBe(0);

    // Fade-in ramp: segment sample i=0..9 carries gain i/10.
    expect(left[50]).toBeCloseTo(0, 6); // i=0, gain 0
    expect(left[54]).toBeCloseTo(constant * 0.4, 6); // i=4, gain 0.4
    expect(left[59]).toBeCloseTo(constant * 0.9, 6); // i=9, gain 0.9

    // Full gain through the stable middle (i=10..89).
    expect(left[60]).toBeCloseTo(constant, 6);
    expect(left[100]).toBeCloseTo(constant, 6);
    expect(left[139]).toBeCloseTo(constant, 6);

    // Fade-out ramp: segment sample i=90..99 carries gain (99-i)/10.
    expect(left[140]).toBeCloseTo(constant * 0.9, 6); // i=90
    expect(left[145]).toBeCloseTo(constant * 0.4, 6); // i=95
    expect(left[149]).toBeCloseTo(0, 6); // i=99, gain 0

    // After the segment (sample 150 is outStart(50)+outCount(100)): silence.
    expect(left[150]).toBe(0);
    expect(left[299]).toBe(0);

    // Mono source duplicated equally to both channels.
    expect(right[100]).toBeCloseTo(left[100]!, 6);
  });

  it("skips a segment whose take never decoded, leaving that span silent", () => {
    const [left] = mixPostAudio({
      segments: [
        {
          takeId: "missing",
          postStartSeconds: 0,
          sourceInSeconds: 0,
          durationSeconds: 0.1,
        },
      ],
      sources: new Map(),
      sampleRate: 1000,
      durationSeconds: 0.1,
    });
    expect(Array.from(left)).toEqual(new Array(100).fill(0));
  });

  it("resamples a source at a different rate while keeping the segment's post-time duration", () => {
    const outSampleRate = 48_000;
    const sourceSampleRate = 44_100;
    const segmentDurationSeconds = 0.2;
    const constant = 0.5;
    // Long enough to cover the segment's span at the SOURCE's own rate.
    const sourceLength =
      Math.ceil(segmentDurationSeconds * sourceSampleRate) + 10;
    const source: PostAudioSource = {
      sampleRate: sourceSampleRate,
      channels: [
        new Float32Array(sourceLength).fill(constant),
        new Float32Array(sourceLength).fill(constant),
      ],
    };
    const totalDurationSeconds = 0.5;

    const [left] = mixPostAudio({
      segments: [
        {
          takeId: "y",
          postStartSeconds: 0,
          sourceInSeconds: 0,
          durationSeconds: segmentDurationSeconds,
        },
      ],
      sources: new Map([["y", source]]),
      sampleRate: outSampleRate,
      durationSeconds: totalDurationSeconds,
      fadeSeconds: 0, // isolate resampling from the fade envelope
    });

    // The mixed bed is sized off the POST duration at the OUTPUT rate.
    expect(left.length).toBe(Math.round(totalDurationSeconds * outSampleRate));

    // The segment itself still spans exactly its own post-time duration at
    // the output rate, even though its source decoded at a different rate.
    const expectedSegmentSamples = Math.round(
      segmentDurationSeconds * outSampleRate
    );
    for (let i = 0; i < expectedSegmentSamples; i += 97) {
      expect(left[i]).toBeCloseTo(constant, 5);
    }
    expect(left[expectedSegmentSamples - 1]).toBeCloseTo(constant, 5);
    // Nothing past the segment's own span.
    expect(left[expectedSegmentSamples]).toBe(0);
  });
});

describe("encodeWav", () => {
  it("writes RIFF/WAVE header fields that describe the stereo 16-bit data that follows", async () => {
    const sampleRate = 8_000;
    const left = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const right = new Float32Array([0, 0.25, -0.25, 0.5, -0.5]);
    const blob = encodeWav([left, right], sampleRate);
    expect(blob.type).toBe("audio/wav");

    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const readAscii = (offset: number, length: number) =>
      String.fromCharCode(...bytes.subarray(offset, offset + length));

    expect(readAscii(0, 4)).toBe("RIFF");
    expect(readAscii(8, 4)).toBe("WAVE");
    expect(readAscii(12, 4)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(2); // stereo
    expect(view.getUint32(24, true)).toBe(sampleRate);
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(readAscii(36, 4)).toBe("data");

    const expectedDataSize =
      left.length * 2 /* channels */ * 2; /* bytes/sample */
    expect(view.getUint32(40, true)).toBe(expectedDataSize);
    expect(view.getUint32(4, true)).toBe(36 + expectedDataSize); // RIFF chunk size
    expect(buffer.byteLength).toBe(44 + expectedDataSize);

    // First frame (both channels silent) decodes back to exactly zero.
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(0);
    // Second frame's left channel (0.5) round-trips within 16-bit precision.
    expect(view.getInt16(48, true) / 0x7fff).toBeCloseTo(0.5, 3);
    // Frame 3's left channel (value 1) clamps to the format's positive max.
    expect(view.getInt16(56, true)).toBe(0x7fff);
    // Frame 4's left channel (value -1) clamps to the format's negative max.
    expect(view.getInt16(60, true)).toBe(-0x8000);
  });
});

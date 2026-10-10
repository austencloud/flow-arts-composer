import { describe, expect, it } from "vitest";

import { segmentWordByEnergy } from "#lib/features/lab/pronunciation-recorder/domain/voice-activity-trimmer.js";

const SAMPLE_RATE = 48_000;

/**
 * Build speech-like audio: `count` tone bursts separated by silence. The gap
 * exceeds the trimmer's 200 ms merge window so the bursts stay distinct —
 * gaps quantize to whole 0.01s frames and the merge comparison is `<=`, so
 * 0.201s would still merge; the fixture's 0.25s default clears that with
 * room to spare. Each burst clears its 80 ms minimum-speech floor.
 *
 * `noiseAmplitude` fills the gaps with low-level room tone instead of digital
 * silence, so tests can exercise the noise-floor term of the detector's
 * threshold instead of leaving it permanently at zero.
 */
function burstAudio(
  count: number,
  burstSeconds = 0.3,
  gapSeconds = 0.25,
  noiseAmplitude = 0
): Float32Array {
  const burstLength = Math.round(SAMPLE_RATE * burstSeconds);
  const gapLength = Math.round(SAMPLE_RATE * gapSeconds);
  const total = count * burstLength + (count - 1) * gapLength;
  const samples = new Float32Array(total);

  if (noiseAmplitude > 0) {
    for (let index = 0; index < total; index++) {
      samples[index] = noiseAmplitude * (Math.sin(index * 12.9898) % 1);
    }
  }

  let cursor = 0;
  for (let burst = 0; burst < count; burst++) {
    for (let index = 0; index < burstLength; index++) {
      samples[cursor + index] =
        0.5 * Math.sin((2 * Math.PI * 200 * index) / SAMPLE_RATE);
    }
    cursor += burstLength + gapLength;
  }
  return samples;
}

describe("segmentWordByEnergy", () => {
  it("returns one range per spoken letter", () => {
    const result = segmentWordByEnergy(burstAudio(4), SAMPLE_RATE);

    expect(result).toHaveLength(4);
  });

  it("orders ranges by time, pads inward from the true onset/offset, and keeps them inside the buffer", () => {
    const samples = burstAudio(3);
    const result = segmentWordByEnergy(samples, SAMPLE_RATE);

    expect(result).toHaveLength(3);
    const [first, second, third] = result;

    expect(first!.startSeconds).toBeGreaterThanOrEqual(0);
    expect(first!.startSeconds).toBeLessThan(second!.startSeconds);
    expect(second!.startSeconds).toBeLessThan(third!.startSeconds);
    expect(third!.endSeconds).toBeLessThanOrEqual(
      samples.length / SAMPLE_RATE
    );

    // Interior boundary (not clamped by the buffer edges like the outer two
    // are), pinned to an exact value: the second burst's true onset/offset
    // sits at 0.55s/0.85s (burst 1 = 0.3s audio + 0.25s gap = 0.55s in), and
    // the detector should pad it by exactly EDGE_PADDING_SECONDS (0.035s) a
    // side. Every frame of a burst has identical RMS and the bursts begin
    // and end on frame boundaries, so this is exact, not approximate.
    expect(second!.startSeconds).toBeCloseTo(0.55 - 0.035, 5);
    expect(second!.endSeconds).toBeCloseTo(0.85 + 0.035, 5);
  });

  it("returns fewer islands than bursts when they run inside the merge window", () => {
    // Letters read at a natural pace can land closer together than the 200ms
    // merge window and collapse into one island. This is documented, not a
    // bug: it's exactly the risk the upcoming real-recording measurement
    // phase exists to quantify.
    const result = segmentWordByEnergy(burstAudio(4, 0.3, 0.1), SAMPLE_RATE);

    expect(result.length).toBeLessThan(4);
  });

  it("still finds every island over room-tone noise instead of digital silence", () => {
    // Digital silence between bursts means percentile(energies, 0.2) is 0 in
    // every other fixture in this file, so the noiseFloor * 3.2 term of the
    // threshold is never exercised. Real recordings have room tone. ~0.003
    // amplitude is roughly -50 dBFS, comfortably below the tone bursts'
    // energy but well above literal zero.
    const result = segmentWordByEnergy(
      burstAudio(3, 0.3, 0.25, 0.003),
      SAMPLE_RATE
    );

    expect(result).toHaveLength(3);
  });

  it("returns no ranges for silence", () => {
    const result = segmentWordByEnergy(new Float32Array(SAMPLE_RATE), SAMPLE_RATE);

    expect(result).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  captureWarmupTimes,
  normalizeCaptureSequence,
  scoreAtCaptureTime,
} from "../../../src/routes/test/flow-fest-native-export/capture-score-time";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  getStartPlacementConfigs,
  sequenceToMotionConfigs,
} from "#lib/shared/3d/services/sequence-converter.js";
import {
  runtimeMotionTiming,
  runtimeMotionSampleTime,
} from "../../../unreal/Shared/Tools/runtime-motion-bundle.mjs";

const fixture = JSON.parse(
  readFileSync("tests/fixtures/3d/family-stick-A.sequence.json", "utf8")
) as SequenceData;

describe("native capture score clock", () => {
  it("primes a loop with one complete preceding cycle but starts a one-shot cold", () => {
    const steps = [{ duration: 0.5 }, { duration: 1.01 }, { duration: 0.5 }];
    const { durationSeconds, frameCount } = runtimeMotionTiming({ steps });
    const times = captureWarmupTimes(true, durationSeconds, frameCount);
    expect(times).toHaveLength(frameCount);
    expect(times[0]).toBe(0);
    expect(times.at(-1)).toBeLessThan(durationSeconds);
    expect(scoreAtCaptureTime(steps as never, times.at(-1)!)).toBeLessThan(steps.length);
    expect(scoreAtCaptureTime(steps as never, 0)).toBe(0);
    expect(captureWarmupTimes(false, durationSeconds, frameCount)).toEqual([]);
  });

  it("maps elapsed seconds through unequal authored step durations", () => {
    const steps = [{ duration: 0.5 }, { duration: 2 }, { duration: 1.5 }];
    expect(scoreAtCaptureTime(steps as never, 0)).toBe(0);
    expect(scoreAtCaptureTime(steps as never, 0.25)).toBe(0.5);
    expect(scoreAtCaptureTime(steps as never, 1.5)).toBe(1.5);
    expect(scoreAtCaptureTime(steps as never, 3.25)).toBe(2.5);
    expect(scoreAtCaptureTime(steps as never, 4)).toBe(3);
  });

  it("rejects invalid duration or a capture past the score", () => {
    expect(() => scoreAtCaptureTime([{ duration: 0 }] as never, 0)).toThrow();
    expect(() => scoreAtCaptureTime([{ duration: 1 }] as never, 1.1)).toThrow();
  });

  it.each([0, 1])(
    "exports embedded start duration %s exactly like a modern score",
    (startDuration) => {
      const modern = {
        ...fixture,
        steps: fixture.steps.slice(0, 3).map((step, index) => ({
          ...step,
          duration: [0.25, 1.01, 0.5][index]!,
        })),
      };
      const legacy = {
        ...modern,
        startPlacement: undefined,
        steps: [
          { ...modern.startPlacement!, stepNumber: 0, duration: startDuration },
          ...modern.steps,
        ],
      } as SequenceData;
      const original = JSON.stringify(legacy);
      const normalized = normalizeCaptureSequence(legacy);

      expect(normalized.steps).toEqual(modern.steps);
      expect(normalized.startPlacement).not.toHaveProperty("duration");
      expect(normalized.startPlacement).not.toHaveProperty("stepNumber");
      expect(getStartPlacementConfigs(normalized)).toEqual(
        getStartPlacementConfigs(legacy)
      );
      expect(getStartPlacementConfigs(normalized)).toEqual(
        getStartPlacementConfigs(modern)
      );
      expect(sequenceToMotionConfigs(normalized)).toEqual(
        sequenceToMotionConfigs(modern)
      );
      expect(runtimeMotionTiming(normalized)).toEqual(
        runtimeMotionTiming(modern)
      );
      const { durationSeconds, frameCount } = runtimeMotionTiming(normalized);
      expect(durationSeconds).toBe(1.76);
      expect(frameCount).toBe(53);
      for (let index = 0; index < frameCount; index += 1) {
        const seconds = runtimeMotionSampleTime(
          index,
          durationSeconds,
          frameCount
        );
        expect(scoreAtCaptureTime(normalized.steps, seconds)).toBe(
          scoreAtCaptureTime(modern.steps, seconds)
        );
      }
      expect(scoreAtCaptureTime(normalized.steps, 0.25)).toBe(1);
      expect(scoreAtCaptureTime(normalized.steps, durationSeconds)).toBe(3);
      expect(normalizeCaptureSequence(normalized)).toEqual(normalized);
      expect(JSON.stringify(legacy)).toBe(original);
      // The portable bundle serializes this same normalized source for reopening.
      const reopened = JSON.parse(JSON.stringify(normalized));
      expect(runtimeMotionTiming(reopened)).toEqual(
        runtimeMotionTiming(modern)
      );
      expect(getStartPlacementConfigs(reopened)).toEqual(
        getStartPlacementConfigs(modern)
      );
    }
  );

  it("keeps playback placement precedence when legacy and modern fields coexist", () => {
    const embedded = { ...fixture.steps[1]!, stepNumber: 0, duration: 0 };
    const mixed = { ...fixture, steps: [embedded, ...fixture.steps] };
    const normalized = normalizeCaptureSequence(mixed);
    expect(normalized.steps).toEqual(fixture.steps);
    expect(normalized.startPlacement).toEqual(fixture.startPlacement);
    expect(getStartPlacementConfigs(normalized)).toEqual(
      getStartPlacementConfigs(mixed)
    );

    const legacy = {
      ...mixed,
      startPlacement: undefined,
      startingPlacement: fixture.startPlacement,
    };
    expect(getStartPlacementConfigs(normalizeCaptureSequence(legacy))).toEqual(
      getStartPlacementConfigs(legacy)
    );
  });

  it("does not turn a start-only score or a zero-duration actual step into playback", () => {
    const start = { ...fixture.steps[0]!, stepNumber: 0, duration: 0 };
    expect(() =>
      runtimeMotionTiming(
        normalizeCaptureSequence({ ...fixture, steps: [start] })
      )
    ).toThrow();
    expect(() =>
      runtimeMotionTiming(
        normalizeCaptureSequence({
          ...fixture,
          steps: [start, { ...fixture.steps[0]!, duration: 0 }],
        })
      )
    ).toThrow();
  });
});

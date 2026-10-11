import { describe, expect, it } from "vitest";

import {
  getActiveStageSequenceClip,
  getPerformerSequenceEndBeat,
  samplePerformerSequenceAtBeat,
  sortStageSequenceClips,
} from "#lib/features/stage/domain/stage-sequence-timeline.js";
import type {
  Performer,
  StageSequenceClip,
} from "#lib/features/stage/domain/stage-types.js";

function clip(
  id: string,
  startBeat: number,
  durationBeats: number,
  sourceBeatCount = durationBeats
): StageSequenceClip {
  return {
    id,
    sequenceId: `sequence-${id}`,
    label: id,
    startBeat,
    durationBeats,
    sourceBeatCount,
    loop: false,
  };
}

function performer(sequenceClips: StageSequenceClip[]): Performer {
  return {
    id: "performer-a",
    index: 0,
    label: "A",
    color: "#fff",
    sequenceClips,
  };
}

describe("stage sequence timeline", () => {
  it("sorts clips deterministically without mutating the authored lane", () => {
    const second = clip("second", 8, 8);
    const first = clip("first", 0, 8);
    const authored = [second, first];

    expect(sortStageSequenceClips(authored).map((item) => item.id)).toEqual([
      "first",
      "second",
    ]);
    expect(authored).toEqual([second, first]);
  });

  it("hands an adjacent boundary to the clip that starts on that beat", () => {
    const lane = performer([clip("first", 0, 8), clip("second", 8, 8)]);

    expect(getActiveStageSequenceClip(lane, 7.999)?.id).toBe("first");
    expect(getActiveStageSequenceClip(lane, 8)?.id).toBe("second");
  });

  it("returns no clip in an authored gap", () => {
    const lane = performer([clip("first", 0, 4), clip("second", 8, 4)]);

    expect(getActiveStageSequenceClip(lane, 6)).toBeNull();
  });

  it("maps a stretched timeline clip onto its source sequence", () => {
    const lane = performer([clip("slow", 4, 8, 4)]);

    const sample = samplePerformerSequenceAtBeat(lane, 8);
    expect(sample?.sourceBeat).toBe(2);
    expect(sample?.stepIndex).toBe(3);
    expect(sample?.progress).toBe(0);
  });

  it("includes every clip when deriving the performer lane duration", () => {
    const lane = performer([clip("first", 0, 4), clip("last", 12, 6)]);
    expect(getPerformerSequenceEndBeat(lane)).toBe(18);
  });
});

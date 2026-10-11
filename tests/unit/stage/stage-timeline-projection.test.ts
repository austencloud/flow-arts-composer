import { describe, expect, it } from "vitest";

import {
  floorSpeedPath,
  projectPerformerFloorTravel,
  samplePerformerFloorSpeed,
  stageSequenceDisplayName,
} from "#lib/features/stage/domain/stage-timeline-projection.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StageChoreography } from "#lib/features/stage/domain/stage-types.js";

const choreography: StageChoreography = {
  id: "stage",
  name: "Stage",
  bpm: 120,
  stageWidth: 10,
  stageDepth: 8,
  environmentId: "void",
  performers: [
    { id: "a", index: 0, label: "A", color: "#f66", sequenceClips: [] },
  ],
  formations: [
    {
      id: "one",
      label: "Opening",
      atBeat: 0,
      transitionBeats: 0,
      spots: {
        a: { x: 1, z: 1, walkStyle: "direct", easing: "linear" },
      },
    },
    {
      id: "two",
      label: "Wide line",
      atBeat: 8,
      transitionBeats: 4,
      spots: {
        a: { x: 4, z: 5, walkStyle: "direct", easing: "linear" },
      },
    },
  ],
  sharedSequenceId: null,
};

describe("stage timeline projection", () => {
  it("keeps the full authored sequence name instead of collapsing repeated words", () => {
    const sequence = {
      displayName: "",
      intendedWord: undefined,
      word: "MPMP",
      name: "MPMP",
    } as SequenceData;

    expect(stageSequenceDisplayName(sequence)).toBe("MPMP");
  });

  it("projects the authored travel window and physical distance", () => {
    expect(projectPerformerFloorTravel(choreography, "a")).toEqual([
      {
        id: "a:two",
        formationId: "two",
        performerId: "a",
        setIndex: 1,
        label: "Wide line",
        startBeat: 4,
        endBeat: 8,
        minimumStartBeat: 0,
        maximumEndBeat: 8,
        distanceMeters: 5,
        requestedStepCount: null,
        resolvedStepCount: null,
        supportedStepRange: null,
        exact: false,
      },
    ]);
  });

  it("samples a speed curve that is still at rest before and after travel", () => {
    const samples = samplePerformerFloorSpeed(choreography, "a", 10, 2);
    expect(samples[0]?.metersPerSecond).toBe(0);
    expect(samples.find((sample) => sample.beat === 6)?.metersPerSecond).toBe(
      2.5
    );
    expect(samples.at(-1)?.metersPerSecond).toBe(0);
  });

  it("builds a bounded SVG path from sampled speed", () => {
    expect(
      floorSpeedPath(
        [
          { beat: 0, metersPerSecond: 0 },
          { beat: 1, metersPerSecond: 2 },
        ],
        1,
        2
      )
    ).toBe("M 0.000 100.000 L 1.000 0.000");
  });
});

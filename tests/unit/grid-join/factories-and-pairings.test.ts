/**
 * A step's, a start cell's and a whole sequence's grid join must survive every
 * rebuild the save and load paths run: the step and start-placement factories,
 * the persisted step pairings, and the hydrate that re-derives steps on read.
 */
import { describe, expect, it } from "vitest";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { createStartPlacementData } from "$lib/shared/foundation/domain/factories/create-start-placement-data";
import { createStartPlacementData as createStartPlacementDataFromCreate } from "$lib/shared/create/factories/create-start-placement-data";
import {
  ensureComposition,
  hydrate,
} from "$lib/shared/foundation/services/sequence-hydrator";
import { extractStepPairings } from "$lib/shared/foundation/services/sequence-decomposer";
import { deriveSteps } from "$lib/shared/foundation/services/step-deriver";
import {
  buildJoinFixture,
  joinsOf,
  JOIN_EAST_ONE,
  JOIN_NORTHEAST_TWO,
  JOIN_SOUTH_TWO,
} from "./grid-join-fixtures";

describe("createStepData", () => {
  it("keeps a step's own join", () => {
    const step = createStepData({ conjoined: JOIN_EAST_ONE });
    expect(step.conjoined).toEqual(JOIN_EAST_ONE);
  });

  it("keeps null, the step that stays on one grid", () => {
    const step = createStepData({ conjoined: null });
    expect(step.conjoined).toBeNull();
  });

  it("leaves the key off when the step follows the sequence", () => {
    const step = createStepData({});
    expect("conjoined" in step).toBe(false);
  });
});

describe.each([
  ["foundation", createStartPlacementData],
  ["create", createStartPlacementDataFromCreate],
])("createStartPlacementData (%s factory)", (_name, create) => {
  it("keeps the start cell's own join", () => {
    expect(create({ conjoined: JOIN_NORTHEAST_TWO }).conjoined).toEqual(
      JOIN_NORTHEAST_TWO
    );
  });

  it("keeps null", () => {
    expect(create({ conjoined: null }).conjoined).toBeNull();
  });

  it("leaves the key off when the start follows the sequence", () => {
    expect("conjoined" in create({})).toBe(false);
  });
});

describe("step pairings", () => {
  const joined = buildJoinFixture({
    sequenceJoin: JOIN_EAST_ONE,
    stepJoins: [undefined, null, JOIN_SOUTH_TWO],
  });

  it("carry each step's own join and nothing for a step that follows", () => {
    const pairings = extractStepPairings(joined);
    expect("conjoined" in pairings[0]!).toBe(false);
    expect(pairings[1]!.conjoined).toBeNull();
    expect(pairings[2]!.conjoined).toEqual(JOIN_SOUTH_TWO);
  });

  it("give the same per-step joins back when steps are derived", () => {
    const composed = ensureComposition(joined);
    const steps = deriveSteps(
      composed.leftSoloProp!,
      composed.rightSoloProp!,
      composed.stepPairings!
    );
    expect(steps.map((step) => step.conjoined)).toEqual([
      undefined,
      null,
      JOIN_SOUTH_TWO,
    ]);
    expect("conjoined" in steps[0]!).toBe(false);
  });

  it("leave a sequence without joins with pairings that have no join key", () => {
    const pairings = extractStepPairings(buildJoinFixture());
    expect(pairings.some((pairing) => "conjoined" in pairing)).toBe(false);
  });
});

describe("save then load", () => {
  /** What the repository writes: composition fields in, derived steps out. */
  function persisted(sequence: ReturnType<typeof buildJoinFixture>) {
    return { ...ensureComposition(sequence), steps: [] };
  }

  it("keeps the sequence, start-cell and per-step joins through hydrate", () => {
    const original = buildJoinFixture({
      sequenceJoin: JOIN_EAST_ONE,
      startJoin: JOIN_NORTHEAST_TWO,
      stepJoins: [JOIN_SOUTH_TWO, undefined, null],
    });
    const stored = JSON.parse(JSON.stringify(persisted(original)));
    const loaded = hydrate(stored);

    expect(joinsOf(loaded)).toEqual(joinsOf(original));
  });

  it("keeps a start cell that stays on one grid", () => {
    const original = buildJoinFixture({
      sequenceJoin: JOIN_EAST_ONE,
      startJoin: null,
    });
    const loaded = hydrate(JSON.parse(JSON.stringify(persisted(original))));

    expect(joinsOf(loaded).start).toBeNull();
    expect(joinsOf(loaded).sequence).toEqual(JOIN_EAST_ONE);
  });

  it("adds no join to a sequence that had none", () => {
    const loaded = hydrate(
      JSON.parse(JSON.stringify(persisted(buildJoinFixture())))
    );

    expect(joinsOf(loaded)).toEqual({
      sequence: undefined,
      start: undefined,
      steps: [undefined, undefined, undefined],
    });
    expect(loaded.steps.some((step) => "conjoined" in step)).toBe(false);
  });
});

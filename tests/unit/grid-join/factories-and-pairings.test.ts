/**
 * A sequence's one grid join must survive every rebuild the save and load
 * paths run: the persisted step pairings and the hydrate that re-derives steps
 * on read. Steps and the start cell carry no join of their own.
 */
import { describe, expect, it } from "vitest";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import { createStartPlacementData } from "#lib/shared/foundation/domain/factories/create-start-placement-data.js";
import { createStartPlacementData as createStartPlacementDataFromCreate } from "#lib/shared/create/factories/create-start-placement-data.js";
import {
  ensureComposition,
  hydrate,
} from "#lib/shared/foundation/services/sequence-hydrator.js";
import { extractStepPairings } from "#lib/shared/foundation/services/sequence-decomposer.js";
import { deriveSteps } from "#lib/shared/foundation/services/step-deriver.js";
import { buildJoinFixture, joinOf, JOIN_EAST_ONE } from "./grid-join-fixtures";

describe("cell factories", () => {
  it("build a step with no join key, even from input that carries one", () => {
    const stray = { conjoined: JOIN_EAST_ONE } as never;
    expect("conjoined" in createStepData(stray)).toBe(false);
  });

  it.each([
    ["foundation", createStartPlacementData],
    ["create", createStartPlacementDataFromCreate],
  ])("build a start cell with no join key (%s factory)", (_name, create) => {
    const stray = { conjoined: JOIN_EAST_ONE } as never;
    expect("conjoined" in create(stray)).toBe(false);
  });
});

describe("step pairings", () => {
  const joined = buildJoinFixture({ sequenceJoin: JOIN_EAST_ONE });

  it("carry no join: the sequence's one join covers every step", () => {
    const pairings = extractStepPairings(joined);
    expect(pairings.some((pairing) => "conjoined" in pairing)).toBe(false);
  });

  it("derive steps with no join, even from a stored pairing that has one", () => {
    const composed = ensureComposition(joined);
    const legacyPairings = composed.stepPairings!.map((pairing) => ({
      ...pairing,
      conjoined: JOIN_EAST_ONE,
    }));
    const steps = deriveSteps(
      composed.leftSoloProp!,
      composed.rightSoloProp!,
      legacyPairings
    );
    expect(steps.some((step) => "conjoined" in step)).toBe(false);
  });
});

describe("save then load", () => {
  /** What the repository writes: composition fields in, derived steps out. */
  function persisted(sequence: ReturnType<typeof buildJoinFixture>) {
    return { ...ensureComposition(sequence), steps: [] };
  }

  it("keeps the sequence's join through hydrate, and no cell gains one", () => {
    const original = buildJoinFixture({ sequenceJoin: JOIN_EAST_ONE });
    const loaded = hydrate(JSON.parse(JSON.stringify(persisted(original))));

    expect(joinOf(loaded)).toEqual(JOIN_EAST_ONE);
    expect(loaded.steps.some((step) => "conjoined" in step)).toBe(false);
    expect(
      "conjoined" in (loaded.startPlacement ?? loaded.startingPlacement ?? {})
    ).toBe(false);
  });

  it("adds no join to a sequence that had none", () => {
    const loaded = hydrate(
      JSON.parse(JSON.stringify(persisted(buildJoinFixture())))
    );

    expect(joinOf(loaded)).toBeUndefined();
    expect(loaded.steps.some((step) => "conjoined" in step)).toBe(false);
  });
});

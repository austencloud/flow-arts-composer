import { describe, expect, it } from "vitest";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import { hydrate } from "$lib/shared/foundation/services/sequence-hydrator";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  buildPublicSequenceProjection,
  type ProjectionSourceSequence,
  type PublicProjectionContext,
} from "$lib/shared/library/services/public-sequence-projection";
import { normalizeSequenceForPersistence } from "$lib/shared/library/services/sequence-persistence-normalizer";
import {
  parsePublicSequenceWireDocument,
  toPublicSequenceProjection,
} from "$lib/shared/foundation/domain/models/public-sequence-wire-schema";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

const BASE = {
  id: "seq-null-presentation",
  name: "AB",
  word: "AB",
  steps: [],
  thumbnails: [],
  isFavorite: false,
  isCircular: false,
  tags: [],
  metadata: {},
} as unknown as SequenceData;

describe("creatorIntent.presentation null preservation", () => {
  it("createSequenceData keeps an explicit null presentation", () => {
    const out = createSequenceData({
      ...BASE,
      creatorIntent: { presentation: null },
    });
    expect(out.creatorIntent).toEqual({ presentation: null });
    expect(out.creatorIntent).toHaveProperty("presentation");
  });

  it("hydrate keeps an explicit null presentation", () => {
    const out = hydrate({
      ...BASE,
      intendedProp: {
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
        catDogMode: false,
      },
      creatorIntent: { presentation: null },
    } as unknown as SequenceData);
    expect(out.creatorIntent?.presentation).toBeNull();
    expect(out.creatorIntent).toHaveProperty("presentation");
  });

  it("hydrate does not invent a presentation for a legacy intent", () => {
    const out = hydrate({
      ...BASE,
      intendedProp: {
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
        catDogMode: false,
      },
    });
    expect(out.creatorIntent?.propConfig).toEqual({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
      catDogMode: false,
    });
    expect(out.creatorIntent).not.toHaveProperty("presentation");
  });
});

// ---------------------------------------------------------------------------
// Public projection + wire round trip
//
// The block above only exercises createSequenceData and hydrate — it never
// proves the field survives the actual publish path: buildPublicSequenceProjection
// (the sole writer of publicSequences/{id}) and the wire schema's
// parse -> toPublicSequenceProjection round trip (the sole reader). This block
// closes that gap for all three creatorIntent.presentation states.
// ---------------------------------------------------------------------------

const RECORDED_PRESENTATION = {
  primaryPropColors: { left: "#111111", right: "#222222" },
  trail: { mode: "persistent" },
  effects: { version: 1, tipEffectMap: { "*": { effect: "fire" } } },
} as const;

function motionAt(from: GridLocation, to: GridLocation, hand: HandSide) {
  return createMotionData({
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: from,
    endLocation: to,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    turns: 0,
    propType: PropType.STAFF,
    hand,
  });
}

/** A minimal single-beat sequence, just enough to normalize and project. */
function buildSourceSequence(
  creatorIntent: SequenceData["creatorIntent"]
): ProjectionSourceSequence {
  const base = createSequenceData({
    id: "seq-presentation-round-trip",
    name: "A",
    word: "",
    steps: [
      {
        id: "step-1",
        stepNumber: 1,
        duration: 1,
        leftReversal: false,
        rightReversal: false,
        isBlank: false,
        letter: "A" as StepData["letter"],
        startPlacement: null,
        endPlacement: null,
        motions: {
          left: motionAt(GridLocation.NORTH, GridLocation.EAST, HandSide.LEFT),
          right: motionAt(
            GridLocation.SOUTH,
            GridLocation.WEST,
            HandSide.RIGHT
          ),
        },
      },
    ],
    thumbnails: [],
    creatorIntent,
  });
  return { ...base, source: "created" } as ProjectionSourceSequence;
}

function buildContext(): PublicProjectionContext {
  return {
    ownerId: "owner-1",
    ownerDisplayName: "Austen",
    tagNames: [],
    encoderHash: "encoder-hash-abc",
    loop: { isCircular: false, loopType: null },
    now: new Date("2026-09-22T12:00:00Z"),
  };
}

/**
 * Runs a sequence through the real publish path (normalize -> project) and
 * then through the real read path (wire-parse -> toPublicSequenceProjection),
 * exactly as a live document round-trips through Firestore.
 */
async function roundTripPresentation(
  creatorIntent: SequenceData["creatorIntent"]
) {
  const source = buildSourceSequence(creatorIntent);
  const normalized = await normalizeSequenceForPersistence(source);
  const written = await buildPublicSequenceProjection(
    normalized,
    buildContext(),
    1,
    { kind: "first-publication" }
  );

  const parsed = parsePublicSequenceWireDocument(written, written.id);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.issues.join(", "));

  const read = toPublicSequenceProjection(parsed.document);
  return { written, read };
}

describe("creatorIntent.presentation survives the public projection + wire round trip", () => {
  it("keeps an explicit null presentation — not dropped, not turned into undefined", async () => {
    const { written, read } = await roundTripPresentation({
      presentation: null,
    });

    expect(written.creatorIntent).toHaveProperty("presentation");
    expect(written.creatorIntent?.presentation).toBeNull();

    expect(read.creatorIntent).toHaveProperty("presentation");
    expect(
      (read.creatorIntent as { presentation: unknown } | undefined)
        ?.presentation
    ).toBeNull();
  });

  it("carries a recorded presentation object through with equal contents", async () => {
    const { written, read } = await roundTripPresentation({
      presentation: RECORDED_PRESENTATION,
    });

    expect(written.creatorIntent?.presentation).toEqual(RECORDED_PRESENTATION);
    expect(
      (
        read.creatorIntent as
          | { presentation: typeof RECORDED_PRESENTATION }
          | undefined
      )?.presentation
    ).toEqual(RECORDED_PRESENTATION);
  });

  it("leaves an absent presentation absent — never invents a key", async () => {
    const { written, read } = await roundTripPresentation({
      propConfig: {
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
        catDogMode: false,
      },
    });

    expect(written.creatorIntent).not.toHaveProperty("presentation");
    expect(read.creatorIntent).not.toHaveProperty("presentation");
  });
});

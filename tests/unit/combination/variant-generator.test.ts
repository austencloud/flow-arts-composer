import { beforeAll, describe, expect, it } from "vitest";

import type { WalkSource } from "$lib/shared/combination/domain/types";
import {
  buildRotationFaithfulTwin,
  buildTwinSource,
  buildVariants,
  type VariantLiberties,
} from "$lib/shared/combination/services/variant-generator";
import {
  mirrorSequence,
  rotateSequence,
  swapHands,
} from "$lib/shared/create/services/sequence-transformer";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  MotionType,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";

import { getAllLetterVariants } from "../../helpers/real-pictograph-loader";
import { FALG, GGGG_CW, HHHH_CW, PHI_PSI_LOOP } from "./fixtures";
import { loadPictographDatasetForTests } from "./pictograph-dataset";

const HANDS = [HandSide.LEFT, HandSide.RIGHT] as const;

const ALL: VariantLiberties = {
  allowMirror: true,
  allowRotation: true,
  allowHandSwap: true,
  exploreRotationFaithful: true,
};

const NONE: VariantLiberties = {
  allowMirror: false,
  allowRotation: false,
  allowHandSwap: false,
  exploreRotationFaithful: false,
};

/**
 * A step's SPATIAL content — placement labels, per-hand locations, rotation
 * direction, motion type. Orientations are deliberately EXCLUDED: see the
 * ground-truth test for why the twin's orientations are provisional.
 */
function spatialKey(step: StepData): string {
  return [
    step.startPlacement,
    ">",
    step.endPlacement,
    ...HANDS.map((hand) => {
      const m = step.motions[hand];
      return `${hand}:${m.motionType}/${m.rotationDirection}/${m.startLocation}>${m.endLocation}`;
    }),
  ].join(" ");
}

function spatialKeys(seq: SequenceData): string[] {
  return seq.steps.map(spatialKey);
}

/**
 * The cyclic offset k for which `rotate(actual, k)` equals `expected`, or null
 * when no rotation aligns them. A twin starts at its source's LAST end
 * placement, so a loop comparison has to allow for the phase shift.
 */
function cyclicOffset(actual: string[], expected: string[]): number | null {
  if (actual.length !== expected.length) return null;
  const n = actual.length;
  for (let k = 0; k < n; k++) {
    let matches = true;
    for (let i = 0; i < n; i++) {
      if (actual[(i + k) % n] !== expected[i]) {
        matches = false;
        break;
      }
    }
    if (matches) return k;
  }
  return null;
}

type CardSource = Extract<WalkSource, { kind: "cardA" | "cardB" }>;

/** Assert the generator emitted only card sources of `kind`, and narrow the union. */
function cardSources(
  sources: readonly WalkSource[],
  kind: "cardA" | "cardB" = "cardB"
): CardSource[] {
  expect(sources.map((s) => s.kind)).toEqual(sources.map(() => kind));
  return sources.filter((s): s is CardSource => s.kind !== "ambient");
}

/** Membership test against the real diamond dataframe, letters included. */
async function assertRealDataframeRows(
  seq: SequenceData,
  label: string
): Promise<void> {
  const rowKey = (
    letter: string | null,
    startPlacement: string | null,
    endPlacement: string | null,
    left: MotionData,
    right: MotionData
  ): string => {
    const hand = (m: MotionData) =>
      [m.motionType, m.rotationDirection, m.startLocation, m.endLocation].join(
        "/"
      );
    return [letter, startPlacement, endPlacement, hand(left), hand(right)].join(
      " | "
    );
  };

  for (const step of seq.steps) {
    const variants = await getAllLetterVariants(
      step.letter as Letter,
      GridMode.DIAMOND
    );
    const rows = new Set(
      variants.map((v) =>
        rowKey(
          v.letter ?? null,
          v.startPlacement ?? null,
          v.endPlacement ?? null,
          v.motions.left!,
          v.motions.right!
        )
      )
    );
    const key = rowKey(
      step.letter,
      step.startPlacement,
      step.endPlacement,
      step.motions.left,
      step.motions.right
    );
    expect(
      rows.has(key) ? key : `${key}\n  NOT A DIAMOND DATAFRAME ROW`,
      `${label} step ${step.stepNumber}`
    ).toBe(key);
  }
}

describe("variant generator — enumeration and collapse", () => {
  beforeAll(async () => {
    await loadPictographDatasetForTests();
  });

  it("collapses GGGG_CW's 32 candidates to 4 distinct sources", async () => {
    // GGGG is maximally symmetric: its four rotations are ONE loop entered at
    // four different steps, and its two hands are identical so the colour swap
    // is a no-op. What survives is {identity, mirror} x {plain, twin}.
    const variants = cardSources(await buildVariants(GGGG_CW, ALL));
    expect(variants.map((v) => v.id)).toEqual([
      "B id",
      "B twin",
      "B mirror",
      "B mirror+twin",
    ]);
  });

  it("keeps the simplest descriptor as each class's survivor", async () => {
    const variants = cardSources(await buildVariants(GGGG_CW, ALL));
    // The identity class contains r2/r4/r6 and every colour-swapped copy; the
    // enumeration order (rotation asc, then no-mirror, no-swap, no-twin) is the
    // preference order, so the survivor is the plainest descriptor.
    expect(variants[0]!.variant).toEqual({
      rotation: 0,
      mirrored: false,
      handsSwapped: false,
      rotationFaithful: false,
    });
    for (const variant of variants) {
      expect(variant.variant.handsSwapped).toBe(false);
      expect(variant.variant.rotation).toBe(0);
    }
  });

  it("collapses FALG's 32 candidates to 16 distinct sources", async () => {
    // FALG is asymmetric — its rotations are genuinely different loops — but
    // its two halves are colour-mirrors of each other, which halves the space.
    const variants = cardSources(await buildVariants(FALG, ALL));
    expect(variants).toHaveLength(16);
  });

  it("emits 2 sources with every liberty off except the twin", async () => {
    const variants = cardSources(
      await buildVariants(GGGG_CW, { ...NONE, exploreRotationFaithful: true })
    );
    expect(variants.map((v) => v.id)).toEqual(["B id", "B twin"]);
  });

  it("emits exactly one source with no liberties at all", async () => {
    const variants = cardSources(await buildVariants(GGGG_CW, NONE));
    expect(variants).toHaveLength(1);
    expect(variants[0]!.id).toBe("B id");
    expect(variants[0]!.variant.rotationFaithful).toBe(false);
  });

  it("never shrinks the source set when a liberty is added", async () => {
    // Dedup makes the raw 4x2x2x2 arithmetic unobservable, but monotonicity
    // still has to hold: a superset of liberties can only add material.
    for (const card of [GGGG_CW, FALG]) {
      const base = (await buildVariants(card, NONE)).length;
      const full = (await buildVariants(card, ALL)).length;
      for (const key of [
        "allowRotation",
        "allowMirror",
        "allowHandSwap",
        "exploreRotationFaithful",
      ] as const) {
        const widened = (await buildVariants(card, { ...NONE, [key]: true }))
          .length;
        expect(widened, `${card.word} + ${key}`).toBeGreaterThanOrEqual(base);
        expect(full, `${card.word} full vs ${key}`).toBeGreaterThanOrEqual(
          widened
        );
      }
    }
  });

  it("gives every source and every source sequence a unique id", async () => {
    const variants = cardSources(await buildVariants(FALG, ALL));
    expect(new Set(variants.map((v) => v.id)).size).toBe(variants.length);
    expect(new Set(variants.map((v) => v.sequence.id)).size).toBe(
      variants.length
    );
    for (const variant of variants) {
      const label = variant.id.replace(/^B /, "");
      expect(variant.sequence.id).toBe(`${FALG.id}~${label}`);
      // The name is the variant's own word plus its label — never a bare
      // "id"/"twin", which names nothing.
      expect(variant.sequence.name).toBe(
        `${variant.sequence.word} ${label}`.trim()
      );
      expect(variant.sequence.name).not.toBe(label);
      // getSequenceDisplayName prefers these over `word` — a carried-over value
      // would render every variant as "FALG".
      expect(variant.sequence.displayName).toBeUndefined();
      expect(variant.sequence.intendedWord).toBeUndefined();
    }

    const again = cardSources(await buildVariants(FALG, ALL));
    expect(again.map((v) => v.id)).toEqual(variants.map((v) => v.id));
  });

  it("normalizes word to the expanded letter string on every source", async () => {
    // Data layer: `word` is what is actually performed. Display-layer
    // shortening ("GGGG" -> "G") belongs to word-simplifier, not here.
    const labelled: SequenceData = {
      ...GGGG_CW,
      word: "stale label",
      name: "stale label",
      displayName: "Austen's card",
      intendedWord: "GGGG",
    };
    const variants = cardSources(await buildVariants(labelled, ALL));
    const identity = variants.find((v) => v.id === "B id")!;
    expect(identity.sequence.word).toBe("GGGG");
    for (const variant of variants) {
      expect(variant.sequence.word, variant.id).toBe(
        variant.sequence.steps.map((s) => s.letter).join("")
      );
      expect(variant.sequence.displayName, variant.id).toBeUndefined();
      expect(variant.sequence.intendedWord, variant.id).toBeUndefined();
    }
  });

  it("preserves grid mode on every source (even rotations only)", async () => {
    for (const card of [GGGG_CW, FALG]) {
      const variants = cardSources(await buildVariants(card, ALL));
      for (const variant of variants) {
        expect(variant.sequence.gridMode, variant.id).toBe(card.gridMode);
        expect([0, 2, 4, 6]).toContain(variant.variant.rotation);
      }
    }
  });

  it("applies the twin AFTER the spatial and colour transforms", async () => {
    const variants = cardSources(await buildVariants(FALG, ALL));
    const compound = variants.find(
      (v) =>
        v.variant.rotationFaithful &&
        (v.variant.rotation !== 0 ||
          v.variant.mirrored ||
          v.variant.handsSwapped)
    );
    expect(
      compound,
      "expected a compound twin source to survive dedup"
    ).toBeDefined();

    const { rotation, mirrored, handsSwapped } = compound!.variant;
    let spatial: SequenceData = FALG;
    if (rotation) spatial = await rotateSequence(spatial, rotation);
    if (mirrored) spatial = await mirrorSequence(spatial);
    if (handsSwapped) spatial = swapHands(spatial);

    const expected = await buildRotationFaithfulTwin(spatial);
    expect(spatialKeys(compound!.sequence)).toEqual(spatialKeys(expected));
  });

  it("labels card A's twin through the shared source builder", async () => {
    const source = await buildTwinSource(FALG);
    expect(source.kind).toBe("cardA");
    expect(source.id).toBe("A twin");
    if (source.kind === "ambient") throw new Error("unreachable");
    expect(source.variant.rotationFaithful).toBe(true);
    expect(source.sequence.id).toBe(`${FALG.id}~twin`);
    expect(spatialKeys(source.sequence)).toEqual(
      spatialKeys(await buildRotationFaithfulTwin(FALG))
    );
  });
});

describe("rotation-faithful twin — ground truth", () => {
  beforeAll(async () => {
    await loadPictographDatasetForTests();
  });

  it("turns GGGG_CW into the HHHH_CW fixture", async () => {
    // Austen's FLGGFLHH mutation: the prop keeps rotating clockwise while the
    // hand path reverses, and pro->anti falls out. HHHH_CW is the transcribed,
    // dataframe-verified partner of GGGG_CW, so it is the ground truth here.
    const twin = await buildRotationFaithfulTwin(GGGG_CW);

    const offset = cyclicOffset(spatialKeys(twin), spatialKeys(HHHH_CW));
    expect(
      offset === null
        ? `no rotation aligns\n  twin: ${spatialKeys(twin).join("\n        ")}\n  HHHH_CW: ${spatialKeys(HHHH_CW).join("\n        ")}`
        : offset,
      "twin(GGGG_CW) must equal HHHH_CW up to cyclic rotation"
    ).not.toBeNull();
    // GGGG_CW closes on beta1, so the twin starts where HHHH_CW starts.
    expect(offset).toBe(0);

    for (const step of twin.steps) {
      expect(step.letter).toBe("H");
      for (const hand of HANDS) {
        expect(step.motions[hand].rotationDirection).toBe("cw");
        expect(step.motions[hand].motionType).toBe("anti");
      }
    }
    expect(twin.word).toBe("HHHH");

    // ORIENTATIONS ARE DELIBERATELY NOT COMPARED. The twin swaps each motion's
    // start/end orientation, which is a provisional value: the real chain is
    // re-derived downstream by the splice-builder (letter-true rule). HHHH_CW
    // carries the canon anti chain (in>out, out>in, ...), which a raw swap of
    // GGGG_CW's all-IN chain cannot reproduce. Asserting equality here would
    // pin the wrong layer.
    expect(twin.steps.map((s) => s.motions.left.startOrientation)).not.toEqual(
      HHHH_CW.steps.map((s) => s.motions.left.startOrientation)
    );
  });

  it("keeps rotation direction and reverses the traversal", async () => {
    const twin = await buildRotationFaithfulTwin(GGGG_CW);
    const source = [...GGGG_CW.steps].reverse();
    twin.steps.forEach((step, i) => {
      const origin = source[i]!;
      expect(step.stepNumber).toBe(i + 1);
      expect(step.startPlacement).toBe(origin.endPlacement);
      expect(step.endPlacement).toBe(origin.startPlacement);
      for (const hand of HANDS) {
        expect(step.motions[hand].startLocation).toBe(
          origin.motions[hand].endLocation
        );
        expect(step.motions[hand].endLocation).toBe(
          origin.motions[hand].startLocation
        );
        expect(step.motions[hand].rotationDirection).toBe(
          origin.motions[hand].rotationDirection
        );
      }
    });
  });

  it("holds the twin's start placement at its own first step", async () => {
    const twin = await buildRotationFaithfulTwin(GGGG_CW);
    const first = twin.steps[0]!;
    expect(twin.startPlacement?.startPlacement).toBe(first.startPlacement);
    expect(twin.startPlacement?.gridPlacement).toBe(first.startPlacement);
    for (const hand of HANDS) {
      const hold = twin.startPlacement!.motions[hand]!;
      expect(hold.motionType).toBe("static");
      expect(hold.startLocation).toBe(first.motions[hand].startLocation);
      expect(hold.endLocation).toBe(first.motions[hand].startLocation);
    }
  });

  it("re-derives every letter of the asymmetric FALG card", async () => {
    const twin = await buildRotationFaithfulTwin(FALG);
    expect(twin.steps).toHaveLength(8);
    // A null letter would mean the reversed configuration is not a dataframe
    // row. Letters are BLANKED before derivation inside the builder, so nothing
    // here can be an inherited FALG letter.
    for (const step of twin.steps) {
      expect(step.letter, `step ${step.stepNumber}`).not.toBeNull();
    }
    // Empirically derived (2026-08-04) through the real diamond dataframe, then
    // pinned. Not hand-authored: every letter came out of
    // motionQueryHandler.findLetterByMotionConfiguration on the reversed
    // motions. Change it only when the twin definition itself changes.
    //
    // FALG reads G L A F G L A F backwards, and the twin maps each letter to
    // its pro<->anti partner: G->H, L->F, A->B, F->L.
    expect(twin.steps.map((s) => s.letter).join("")).toBe("HFBLHFBL");
    expect(twin.word).toBe("HFBLHFBL");
  });

  it("produces real dataframe rows, not just plausible ones", async () => {
    // The canon check: a letter lookup can only succeed on a configuration the
    // dataframe actually contains, but the PLACEMENT labels are computed
    // separately — this asserts the whole (letter, placements, both motions) row
    // exists, the same membership test the fixtures are held to.
    for (const card of [GGGG_CW, FALG]) {
      const twin = await buildRotationFaithfulTwin(card);
      await assertRealDataframeRows(twin, `twin(${card.word})`);
    }
  });

  it("is an involution on placements, locations and rotations", async () => {
    for (const card of [GGGG_CW, FALG, PHI_PSI_LOOP]) {
      const roundTrip = await buildRotationFaithfulTwin(
        await buildRotationFaithfulTwin(card)
      );
      expect(spatialKeys(roundTrip), card.word).toEqual(spatialKeys(card));
      expect(roundTrip.steps.map((s) => s.stepNumber)).toEqual(
        card.steps.map((_, i) => i + 1)
      );
      expect(roundTrip.steps.map((s) => s.letter).join(""), card.word).toBe(
        card.steps.map((s) => s.letter).join("")
      );
    }
  });
});

describe("rotation-faithful twin — dash and static material", () => {
  beforeAll(async () => {
    await loadPictographDatasetForTests();
  });

  it("self-twins the ΦΨ bridge loop", async () => {
    // Φ and Ψ are dash/static pairs. A dash has no orbital direction, so
    // deriveMotionType leaves it a DASH (and a static a STATIC) no matter what
    // the prop rotation does — the WORD comes back unchanged. This is the case
    // that would break if the twin flipped PRO<->ANTI by table lookup instead
    // of re-deriving from the hand path.
    //
    // Measured, not assumed: the word is preserved but the loop is NOT the same
    // material — it visits different placement instances (it opens beta5>alpha1,
    // where the source opens beta5>alpha5), so this is a genuine second bridge
    // card, not a no-op.
    const twin = await buildRotationFaithfulTwin(PHI_PSI_LOOP);
    expect(twin.steps.map((s) => s.letter).join("")).toBe("ΦΨΦΨ");
    expect(twin.word).toBe("ΦΨΦΨ");
    expect(spatialKeys(twin)).not.toEqual(spatialKeys(PHI_PSI_LOOP));

    for (const step of twin.steps) {
      const types = HANDS.map((hand) => step.motions[hand].motionType).sort();
      expect(types, `step ${step.stepNumber}`).toEqual([
        MotionType.DASH,
        MotionType.STATIC,
      ]);
    }
    await assertRealDataframeRows(twin, "twin(ΦΨΦΨ)");
  });

  it("relocates dash arrows to match the reversed hand path", async () => {
    // The only nontrivial withArrowLocations case: a dash's arrow location is
    // NOT its start location, it comes from the (start,end) pair — so reversing
    // s->n into n->s must move the arrow from w to e. Recomputation also has to
    // run AFTER letter derivation, because the calculator branches on the
    // step's letter type.
    const DASH_ARROW: Record<string, string> = {
      "s>n": "w",
      "n>s": "e",
      "w>e": "n",
      "e>w": "s",
    };

    const twin = await buildRotationFaithfulTwin(PHI_PSI_LOOP);
    let dashesChecked = 0;
    for (const step of twin.steps) {
      for (const hand of HANDS) {
        const m = step.motions[hand];
        if (m.motionType === MotionType.DASH) {
          expect(
            m.arrowLocation,
            `twin step ${step.stepNumber} ${hand} dash ${m.startLocation}>${m.endLocation}`
          ).toBe(DASH_ARROW[`${m.startLocation}>${m.endLocation}`]);
          dashesChecked++;
        } else {
          // A static's arrow sits on the hand itself.
          expect(m.arrowLocation).toBe(m.startLocation);
        }
      }
    }
    expect(dashesChecked).toBe(4);

    // And each arrow genuinely moved relative to the step it came FROM: twin
    // step i is built from source step n-1-i, and reversing that dash flips its
    // arrow to the opposite side of the grid.
    const source = [...PHI_PSI_LOOP.steps].reverse();
    twin.steps.forEach((step, i) => {
      const origin = source[i]!;
      for (const hand of HANDS) {
        if (step.motions[hand].motionType !== MotionType.DASH) continue;
        expect(
          step.motions[hand].arrowLocation,
          `twin step ${step.stepNumber} ${hand} vs origin step ${origin.stepNumber}`
        ).not.toBe(origin.motions[hand].arrowLocation);
      }
    });
  });
});

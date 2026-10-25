import { describe, expect, it } from "vitest";
import {
  createSequenceData,
  type SequenceData,
} from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  createDerivedTunnelPerformer,
  createIndependentTunnelPerformer,
  createTunnelComposition,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-composition.js";
import type { TunnelConfig } from "#lib/shared/sequence-viewer/tunnel/tunnel-config.js";
import { buildTunnelCompositionLayers } from "#lib/shared/sequence-viewer/tunnel/tunnel-layer-builder.js";
import { tunnelStepIndexAt } from "#lib/shared/sequence-viewer/tunnel/tunnel-prop-sampling.js";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import {
  resolveTunnelPerformerDisplays,
  tunnelCardStepIndex,
} from "#lib/features/create/tunnel/domain/tunnel-performer-displays.js";

// Austen's report 6F6bvH1cFmAK6BmFTGl5: Performer 2 and later must show their
// rotated, staggered or mirrored variation on their choreo card, not a copy of
// Performer 1's pictographs.

const RING = [
  GridLocation.NORTH,
  GridLocation.EAST,
  GridLocation.SOUTH,
  GridLocation.WEST,
];
const LETTERS = [Letter.A, Letter.B, Letter.C, Letter.D];

/** Four steps walking both hands a quarter turn around the diamond. Each step
 *  has its own letter so step order is visible in the word. */
function walkingSequence(id: string): SequenceData {
  return createSequenceData({
    id,
    name: id,
    word: LETTERS.join(""),
    gridMode: GridMode.DIAMOND,
    isCircular: true,
    steps: RING.map((from, index) => {
      const to = RING[(index + 1) % RING.length]!;
      const opposite = (location: GridLocation) =>
        RING[(RING.indexOf(location) + 2) % RING.length]!;
      return createStepData({
        id: `${id}-${index + 1}`,
        stepNumber: index + 1,
        letter: LETTERS[index]!,
        motions: {
          [HandSide.LEFT]: createMotionData({
            hand: HandSide.LEFT,
            startLocation: from,
            endLocation: to,
            arrowLocation: from,
            gridMode: GridMode.DIAMOND,
          }),
          [HandSide.RIGHT]: createMotionData({
            hand: HandSide.RIGHT,
            startLocation: opposite(from),
            endLocation: opposite(to),
            arrowLocation: opposite(from),
            gridMode: GridMode.DIAMOND,
          }),
        },
      });
    }),
  });
}

const FORMATION: TunnelConfig = {
  fold: 4,
  mirror: false,
  flip: false,
  invert: false,
  echo: false,
  staggerSteps: 0,
  speedOverrides: {},
};

function handLocations(sequence: SequenceData | null | undefined) {
  return (sequence?.steps ?? []).map((step) => [
    step.motions[HandSide.LEFT]?.startLocation,
    step.motions[HandSide.RIGHT]?.startLocation,
  ]);
}

async function castWith(
  partner: ReturnType<typeof createDerivedTunnelPerformer>,
  lead: ReturnType<typeof createIndependentTunnelPerformer>
) {
  const layers = await buildTunnelCompositionLayers(
    createTunnelComposition([lead, partner]),
    FORMATION
  );
  const displays = resolveTunnelPerformerDisplays(layers);
  const layerFor = (id: string) =>
    layers.find((layer) => layer.performerId === id)!;
  return { layers, displays, layerFor };
}

describe("tunnel performer cards show each performer's own variation", () => {
  it("draws a rotated partner's card with the rotated pictographs", async () => {
    const lead = createIndependentTunnelPerformer(walkingSequence("lead"), 0);
    const partner = createDerivedTunnelPerformer(lead.id, 1, [
      { kind: "rotate", amount: 2 },
    ]);
    const { displays, layerFor } = await castWith(partner, lead);

    const leadCard = displays[lead.id]!.sequence;
    const partnerCard = displays[partner.id]!.sequence;
    expect(handLocations(partnerCard)).toEqual(
      handLocations(layerFor(partner.id).sequence)
    );
    expect(handLocations(partnerCard)).not.toEqual(handLocations(leadCard));
    expect(partnerCard?.steps.map((step) => step.letter)).toEqual(LETTERS);
  });

  it("draws a mirrored partner's card with the mirrored pictographs", async () => {
    const lead = createIndependentTunnelPerformer(walkingSequence("lead"), 0);
    const partner = createDerivedTunnelPerformer(lead.id, 1, [
      { kind: "mirror" },
    ]);
    const { displays, layerFor } = await castWith(partner, lead);

    const partnerCard = displays[partner.id]!.sequence;
    expect(handLocations(partnerCard)).toEqual(
      handLocations(layerFor(partner.id).sequence)
    );
    expect(handLocations(partnerCard)).not.toEqual(
      handLocations(displays[lead.id]!.sequence)
    );
  });

  it("starts a staggered partner's card on the step they dance first", async () => {
    const lead = createIndependentTunnelPerformer(walkingSequence("lead"), 0);
    const partner = createDerivedTunnelPerformer(lead.id, 1, []);
    partner.timing = { stepOffset: 1, speed: 1 };
    const { displays, layerFor } = await castWith(partner, lead);

    const stage = layerFor(partner.id).sequence;
    const card = displays[partner.id]!;
    // At the first beat the stage samples this performer one step in.
    const firstDanced = tunnelStepIndexAt(stage.steps.length, 1, 1, 1)!;
    expect(firstDanced).toBe(1);

    expect(handLocations(card.sequence)).toEqual([
      ...handLocations(stage).slice(1),
      ...handLocations(stage).slice(0, 1),
    ]);
    expect(card.sequence?.steps.map((step) => step.stepNumber)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(card.sequence?.word).toBe("BCDA");
    // The start pose is where step 1 of the card begins: the end of stage step 1.
    expect(
      card.sequence?.startPlacement?.motions[HandSide.LEFT]?.endLocation
    ).toBe(stage.steps[0]!.motions[HandSide.LEFT]!.endLocation);
    // The playhead's border lands on the card's first cell.
    expect(tunnelCardStepIndex(firstDanced, card)).toBe(0);
    expect(tunnelCardStepIndex(0, card)).toBe(3);
    // Performer 1 is untouched.
    expect(displays[lead.id]!.sequence).toBe(layerFor(lead.id).sequence);
    expect(displays[lead.id]!.cardStepOffset).toBe(0);
  });

  it("follows the formation stagger the stage samples with", async () => {
    const lead = createIndependentTunnelPerformer(walkingSequence("lead"), 0);
    const partner = createDerivedTunnelPerformer(lead.id, 1, []);
    const { layers, layerFor } = await castWith(partner, lead);

    const displays = resolveTunnelPerformerDisplays(layers, (layer) =>
      layer.arm === 0 ? 0 : 2
    );
    expect(displays[partner.id]!.cardStepOffset).toBe(2);
    expect(displays[partner.id]!.sequence?.word).toBe("CDAB");
    expect(handLocations(displays[partner.id]!.sequence)[0]).toEqual(
      handLocations(layerFor(partner.id).sequence)[2]
    );
  });
});

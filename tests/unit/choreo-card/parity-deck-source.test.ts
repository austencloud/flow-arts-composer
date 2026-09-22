import { describe, expect, it } from "vitest";
import { HAND_PATH_REFERENCE_CARDS } from "$lib/features/choreo-card/domain/hand-path-reference-cards";
import type { DeckRelease } from "$lib/features/choreo-card/domain/models/DeckRelease";
import { getParityCardPresentation } from "$lib/features/choreo-card/services/parity-deck-source";
import { buildFrontComposeOptions } from "$lib/features/choreo-card/services/build-front-compose-options";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

const HAND_PATH_RELEASE = {
  deckNumber: 10,
  createdAt: "2026-09-04T00:00:00.000Z",
  theme: "cosmic",
  cardCount: 6,
  notes: "Hand Path Reference Deck · Version 1",
  sequences: [],
  stepCountDistribution: { 4: 6 },
  handPathCards: {
    version: 1,
    cardIds: ["ss", "ts", "so", "to", "qo", "qs"],
  },
} as const satisfies DeckRelease;

describe("getParityCardPresentation", () => {
  it.each(HAND_PATH_REFERENCE_CARDS)(
    "keeps released %s cards on the production hands-only profile",
    (reference) => {
      const presentation = getParityCardPresentation(
        HAND_PATH_RELEASE,
        reference.sequence.id,
        {}
      );
      const { composeOptions } = buildFrontComposeOptions(reference.sequence, {
        includeStartPlacement: true,
        startPlacementLayout: "row",
        ...presentation,
      });

      expect(presentation).toEqual({
        cardProfile: "hand-path",
        customName: reference.cardTitle,
        tndElement: reference.element,
      });
      expect(composeOptions.leftPropTypeOverride).toBe(PropType.HAND);
      expect(composeOptions.rightPropTypeOverride).toBe(PropType.HAND);
      expect(composeOptions.visibilityOverrides).toMatchObject({
        handPathMode: true,
        showTKA: false,
      });
    }
  );

  it("leaves ordinary release cards on the sequence profile", () => {
    const element = HAND_PATH_REFERENCE_CARDS[0]!.element;
    expect(
      getParityCardPresentation(
        { ...HAND_PATH_RELEASE, handPathCards: undefined },
        "ordinary-card",
        { iconPath: element.iconPath }
      )
    ).toEqual({
      cardProfile: "sequence",
      customName: undefined,
      tndElement: element,
    });
  });
});

import { describe, expect, it } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { resolveShowcasePropPair } from "$lib/shared/sequence-preview/services/showcase-prop-pair";

const viewerFans = {
  leftPropType: PropType.FAN,
  rightPropType: PropType.FAN,
};

describe("resolveShowcasePropPair", () => {
  it("falls back to the viewer's Settings pair when nothing is recorded, matching the live player", () => {
    // The player's prop-type manager reads Settings when its overrides are
    // null. The card used to default to staff here instead, so a sequence
    // with no recorded prop animated the viewer's fans over a staff card.
    expect(
      resolveShowcasePropPair({
        leftPropType: null,
        rightPropType: null,
        recorded: null,
        viewer: viewerFans,
      })
    ).toEqual({
      leftPropType: PropType.FAN,
      rightPropType: PropType.FAN,
      catDogMode: false,
    });
  });

  it("uses the creator's recorded pair over the viewer's Settings", () => {
    expect(
      resolveShowcasePropPair({
        leftPropType: null,
        rightPropType: null,
        recorded: {
          leftPropType: PropType.BUUGENG,
          rightPropType: PropType.BUUGENG,
          catDogMode: false,
        },
        viewer: viewerFans,
      })
    ).toEqual({
      leftPropType: PropType.BUUGENG,
      rightPropType: PropType.BUUGENG,
      catDogMode: false,
    });
  });

  it("lets a caller-supplied prop win, per hand", () => {
    expect(
      resolveShowcasePropPair({
        leftPropType: PropType.HAND,
        rightPropType: null,
        recorded: {
          leftPropType: PropType.BUUGENG,
          rightPropType: PropType.BUUGENG,
          catDogMode: false,
        },
        viewer: viewerFans,
      })
    ).toEqual({
      leftPropType: PropType.HAND,
      rightPropType: PropType.BUUGENG,
      catDogMode: true,
    });
  });

  it("treats a mixed viewer pair as cat-dog so the card draws both props", () => {
    expect(
      resolveShowcasePropPair({
        leftPropType: null,
        rightPropType: null,
        recorded: null,
        viewer: { leftPropType: PropType.FAN, rightPropType: PropType.STAFF },
      })
    ).toEqual({
      leftPropType: PropType.FAN,
      rightPropType: PropType.STAFF,
      catDogMode: true,
    });
  });
});

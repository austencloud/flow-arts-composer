import { describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { museumPropPair } from "./museum-prop-pair";

const seq = (intendedProp: unknown) =>
  ({ intendedProp }) as unknown as SequenceData;

describe("museumPropPair", () => {
  it("uses the sequence's recorded pair over settings", () => {
    expect(
      museumPropPair(
        seq({ leftPropType: "staff", rightPropType: "fan" }),
        { leftPropType: PropType.CLUB, rightPropType: PropType.CLUB }
      )
    ).toEqual({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
      catDogMode: true,
    });
  });

  it("falls back to settings as a whole when the recording is half valid", () => {
    expect(
      museumPropPair(seq({ leftPropType: "fan" }), {
        leftPropType: PropType.CLUB,
        rightPropType: PropType.MINIHOOP,
      })
    ).toEqual({
      leftPropType: PropType.CLUB,
      rightPropType: PropType.MINIHOOP,
      catDogMode: true,
    });
  });

  it("falls back to staff with no sequence and no settings", () => {
    expect(museumPropPair(null, null)).toEqual({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
      catDogMode: false,
    });
  });
});

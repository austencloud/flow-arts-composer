import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  parsePropsFromURL,
  parsePropTypeFromURLValue,
} from "#lib/shared/navigation/services/sequence-encoder.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { resolveScanPropConfig } from "#lib/shared/qr/services/scan-prop-resolver.js";

describe("scan prop resolution", () => {
  it("accepts compact and full-value prop parameters from printed cards", () => {
    expect(parsePropsFromURL(new URLSearchParams("bp=P&rp=fan"))).toEqual({
      leftPropType: PropType.POI,
      rightPropType: PropType.FAN,
      catDogMode: true,
    });
    expect(parsePropTypeFromURLValue("not-a-prop")).toBeUndefined();
  });

  it("keeps the highest-priority per-scan values for each hand", () => {
    const sequence = {
      intendedProp: {
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
        catDogMode: false,
      },
    } as SequenceData;

    expect(
      resolveScanPropConfig(
        sequence,
        {
          leftPropType: "P",
          rightPropType: PropType.CLUB,
          catDogMode: true,
        },
        { leftPropType: PropType.FAN, rightPropType: PropType.FAN }
      )
    ).toEqual({
      leftPropType: PropType.POI,
      rightPropType: PropType.CLUB,
      catDogMode: true,
    });
  });

  it("recovers historical prop data from sequence motions", () => {
    const sequence = {
      steps: [
        {
          motions: {
            left: { propType: PropType.TRIAD },
            right: { propType: PropType.BUUGENG },
          },
        },
      ],
    } as SequenceData;

    expect(resolveScanPropConfig(sequence)).toEqual({
      leftPropType: PropType.TRIAD,
      rightPropType: PropType.BUUGENG,
      catDogMode: true,
    });
  });
});

import { describe, expect, it } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { ShortCodeData } from "$lib/shared/qr/services/types";
import { prepareScanViewerPayload } from "$lib/server/scan/scan-viewer-payload-preparer";

const ENCODED_B2ZM =
  "s~r1:sm:f2938653:q1:HYPQN1Z0M/2Q 5Q:66VH93T9PYLH504WU/L92IGQSUG54HJCJQILD2JEQS+MO:9YE1U33FNO5*Q$ZMWDNXZ9PI5B32+80QLL8PR";
const WORD = "Λ-γYΘγΛ-γYΘγ";

function record(overrides: Partial<ShortCodeData> = {}): ShortCodeData {
  return {
    sequence: WORD,
    payloadWord: WORD,
    encoded: ENCODED_B2ZM,
    createdAt: "2026-07-30T00:00:00.000Z",
    createdBy: "test",
    scanCount: 0,
    leftPropType: PropType.STAFF,
    rightPropType: PropType.STAFF,
    ...overrides,
  };
}

describe("prepareScanViewerPayload", () => {
  it("hydrates the viewer data without preparing temporary card artwork", async () => {
    const prepared = await prepareScanViewerPayload("B2ZM", record());

    expect(prepared).not.toBeNull();
    expect(Object.keys(prepared ?? {}).sort()).toEqual([
      "propConfig",
      "sequence",
    ]);
    expect(prepared?.sequence.id).toBe("B2ZM");
    expect(prepared?.sequence.steps).toHaveLength(10);
    expect(prepared?.sequence.startPlacement).toBeTruthy();
    expect(prepared?.propConfig).toEqual({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
      catDogMode: false,
    });
  });

  it("lets URL prop intent override the shortcode record", async () => {
    const prepared = await prepareScanViewerPayload("B2ZM", record(), {
      leftPropType: PropType.POI,
      rightPropType: PropType.FAN,
      catDogMode: true,
    });

    expect(prepared?.propConfig).toEqual({
      leftPropType: PropType.POI,
      rightPropType: PropType.FAN,
      catDogMode: true,
    });
  });

  it("returns null when a legacy record has no self-contained payload", async () => {
    await expect(
      prepareScanViewerPayload("OLD1", record({ encoded: undefined }))
    ).resolves.toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PrintRenderOptions } from "../types";
import { getSerializedQrPlacement } from "../serialized-card-front";

const FOUR_BEATS = {
  id: "four-beats",
  word: "ABCD",
  steps: [{}, {}, {}, {}],
} as unknown as SequenceData;

const OPTIONS: PrintRenderOptions = {
  includeStartPlacement: true,
  startPlacementLayout: "row",
  bleedPx: 36,
};

describe("serialized card QR placement", () => {
  it("maps the canonical inner QR cell into the framed print canvas", () => {
    expect(getSerializedQrPlacement(FOUR_BEATS, OPTIONS)).toEqual({
      x: 446,
      y: 178,
      size: 264,
    });
  });

  it("honors cards that explicitly suppress their QR", () => {
    expect(
      getSerializedQrPlacement(FOUR_BEATS, {
        ...OPTIONS,
        showQRCode: false,
      })
    ).toBeNull();
  });

  it("does not invent a QR cell for a one-count card", () => {
    const oneBeat = {
      ...FOUR_BEATS,
      steps: [{}],
    } as unknown as SequenceData;

    expect(getSerializedQrPlacement(oneBeat, OPTIONS)).toBeNull();
  });
});

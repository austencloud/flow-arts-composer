import { describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { calculatePhysicalCardLayout } from "$lib/features/choreo-card/services/physical-card-layout-calculator";

function sequence(stepCount: number): SequenceData {
  return {
    id: `physical-card-${stepCount}`,
    word: "TEST",
    steps: Array.from({ length: stepCount }, () => ({ duration: 1 })),
  } as unknown as SequenceData;
}

describe("calculatePhysicalCardLayout", () => {
  it("uses the portrait 3x4 grid for an eight-count poker card", () => {
    expect(
      calculatePhysicalCardLayout({
        sequence: sequence(8),
        canvasWidth: 822,
        canvasHeight: 1122,
        bleedPx: 36,
        includeStartPlacement: true,
        showHeader: true,
        showFooter: true,
        showQRCode: true,
      })
    ).toEqual({
      startPlacementLayout: "column",
      totalGridColumns: 3,
    });
  });

  it("reserves a valid QR slot when the footer is absent", () => {
    const layout = calculatePhysicalCardLayout({
      sequence: sequence(4),
      canvasWidth: 822,
      canvasHeight: 1122,
      bleedPx: 36,
      includeStartPlacement: true,
      showHeader: true,
      showFooter: false,
      showQRCode: true,
    });

    expect(layout.startPlacementLayout).toBe("row");
    expect(layout.totalGridColumns).toBe(2);
  });
});

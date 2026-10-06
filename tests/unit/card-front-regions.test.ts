import { describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { calculatePhysicalCardLayout } from "$lib/features/choreo-card/services/physical-card-layout-calculator";
import { computeFrontQrCellRect } from "$lib/features/store/services/card-front-regions";

describe("physical shop hero QR region", () => {
  it("covers the bottom-left QR cell on an eight-step portrait card", () => {
    const sequence = {
      id: "hero-qr-region",
      word: "MW-Θ-QNX-Ω-P",
      steps: Array.from({ length: 8 }, () => ({ duration: 1 })),
    } as unknown as SequenceData;
    const layout = calculatePhysicalCardLayout({
      sequence,
      canvasWidth: 822,
      canvasHeight: 1122,
      bleedPx: 36,
      includeStartPlacement: true,
      showHeader: true,
      showFooter: true,
      showQRCode: true,
    });

    expect(layout).toEqual({ startPlacementLayout: "column", totalGridColumns: 3 });
    const rect = computeFrontQrCellRect(sequence, layout);
    expect(rect).not.toBeNull();
    expect(rect!.x).toBeCloseTo(8, 0);
    expect(rect!.y).toBeCloseTo(72, 0);
    expect(rect!.w).toBeCloseTo(28, 0);
    expect(rect!.h).toBeCloseTo(20, 0);
  });
});

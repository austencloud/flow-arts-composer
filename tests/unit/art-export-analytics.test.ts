import { describe, expect, it } from "vitest";
import {
  exportDeliveryStage,
  mandalaStageForPhase,
  tunnelStagesForState,
} from "#lib/shared/sequence-viewer/domain/art-export-analytics.js";
import { resolveMandalaExportDelivery } from "#lib/shared/sequence-viewer/services/mandala-export-delivery.js";

describe("art export analytics lifecycle", () => {
  it("maps only meaningful mandala phase transitions", () => {
    expect(mandalaStageForPhase("idle", "capturing")).toBe("started");
    expect(mandalaStageForPhase("capturing", "encoding")).toBeNull();
    expect(mandalaStageForPhase("encoding", "complete")).toBe("completed");
    expect(mandalaStageForPhase("capturing", "error")).toBe("failed");
    expect(mandalaStageForPhase("complete", "complete")).toBeNull();
  });

  it("deduplicates tunnel start and error observations", () => {
    expect(
      tunnelStagesForState({
        previousExporting: false,
        exporting: true,
        error: null,
        reportedError: null,
      })
    ).toEqual({ stages: ["started"], reportedError: null });

    expect(
      tunnelStagesForState({
        previousExporting: false,
        exporting: false,
        error: "boom",
        reportedError: "boom",
      })
    ).toEqual({ stages: [], reportedError: "boom" });
  });

  it("does not call an encoded preview complete until delivery succeeds", () => {
    expect(exportDeliveryStage({ success: true })).toBe("completed");
    expect(exportDeliveryStage({ success: false })).toBe("failed");
    expect(exportDeliveryStage({ success: true, canceled: true })).toBe(
      "canceled"
    );
  });

  it("classifies Mandala delivery only after the file handoff settles", () => {
    expect(
      resolveMandalaExportDelivery({
        success: true,
        method: "download",
      })
    ).toEqual({ outcome: "completed", method: "download" });
    expect(
      resolveMandalaExportDelivery({
        success: true,
        canceled: true,
        method: "share",
      })
    ).toEqual({ outcome: "canceled", method: "share" });
    expect(
      resolveMandalaExportDelivery({
        success: false,
        method: "download",
      })
    ).toEqual({ outcome: "failed", method: "download" });
  });
});

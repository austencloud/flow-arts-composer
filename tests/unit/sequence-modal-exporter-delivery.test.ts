import { describe, expect, it, vi } from "vitest";
import {
  reportImageExportDelivery,
  type ImageExportDeliveryCallbacks,
} from "#lib/shared/sequence-viewer/services/image-export-delivery.js";

function callbacks(): ImageExportDeliveryCallbacks & {
  onSuccess: ReturnType<typeof vi.fn>;
  onCanceled: ReturnType<typeof vi.fn>;
  onHaptic: ReturnType<typeof vi.fn>;
} {
  return {
    onSuccess: vi.fn(),
    onError: vi.fn(),
    onCanceled: vi.fn(),
    onHaptic: vi.fn(),
  };
}

describe("image export delivery outcome", () => {
  it("reports native-share dismissal as canceled, never successful", () => {
    const events = callbacks();

    reportImageExportDelivery(events, true, true);

    expect(events.onCanceled).toHaveBeenCalledOnce();
    expect(events.onSuccess).not.toHaveBeenCalled();
    expect(events.onHaptic).not.toHaveBeenCalled();
  });

  it("retains the completed callback for delivered images", () => {
    const events = callbacks();

    reportImageExportDelivery(events, true, false);

    expect(events.onCanceled).not.toHaveBeenCalled();
    expect(events.onHaptic).toHaveBeenCalledWith("success");
    expect(events.onSuccess).toHaveBeenCalledWith("Card shared!");
  });
});

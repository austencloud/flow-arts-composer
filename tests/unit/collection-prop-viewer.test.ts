import { describe, expect, it, vi } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

vi.mock("$lib/shared/qr/get-short-code-manager", () => ({
  getShortCodeManager: () => null,
}));
vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  authState: { isAuthenticated: false },
}));
vi.mock("$lib/shared/application/get-error-handler", () => ({
  getErrorHandler: vi.fn(),
}));
vi.mock("$lib/shared/navigation/services/url-state", () => ({
  mutateCurrentUrl: vi.fn(),
  removeCurrentUrlParams: vi.fn(),
  writeUrl: vi.fn(),
}));

import {
  openSequenceOverlay,
  closeSequenceOverlay,
  switchVariation,
  getSequenceOverlayState,
} from "$lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte";

describe("collection viewer context", () => {
  it("keeps the collection prop across variations and discards it on the next ordinary open", () => {
    const first = createSequenceData({ id: "first", name: "First" });
    const second = createSequenceData({ id: "second", name: "Second" });
    const options = {
      analyticsSource: "browse_collection" as const,
      fromUrl: true,
      skipHistoryPush: true,
    };
    openSequenceOverlay(first, {
      ...options,
      collectionPropType: PropType.FAN,
      variations: [first, second],
    });
    const viewer = getSequenceOverlayState();
    expect(viewer.collectionPropType).toBe(PropType.FAN);
    switchVariation(1);
    expect(viewer.sequence?.id).toBe("second");
    expect(viewer.collectionPropType).toBe(PropType.FAN);
    expect(first.intendedProp).toBeUndefined();
    expect(second.intendedProp).toBeUndefined();
    closeSequenceOverlay();
    expect(viewer.collectionPropType).toBeNull();
    openSequenceOverlay(first, options);
    expect(viewer.collectionPropType).toBeNull();
    closeSequenceOverlay();
  });
});

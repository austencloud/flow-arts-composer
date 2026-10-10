import { describe, it, expect, beforeEach, vi } from "vitest";

// The real manager pulls in Firebase/Firestore (protobuf) through its singleton
// imports, which crash at module load in the node test env. The methods under
// test never touch any of them (the constructor's Firebase/visibility calls are
// gated behind `browser`, false here; saveToStorage no-ops too). Stub the three
// browser-only dependency modules so the manager imports cleanly.
vi.mock("#lib/shared/auth/firebase.js", () => ({
  getAuthSync: () => ({ currentUser: null }),
}));
vi.mock("#lib/shared/settings/state/settings-state.svelte.js", () => ({
  settingsService: { currentSettings: {}, updateSetting: () => {} },
}));
vi.mock("#lib/shared/animation-engine/state/animation-visibility-state.svelte.js", () => ({
  getAnimationVisibilityManager: () => ({ isDarkMode: () => false, registerObserver: () => {} }),
}));

import { getImageCompositionManager } from "#lib/shared/share/state/image-composition-state.svelte.js";

describe("info-cell choice per-length override", () => {
  let ic: ReturnType<typeof getImageCompositionManager>;

  beforeEach(() => {
    ic = getImageCompositionManager();
    ic.setShowQRCode(true);
    ic.setShowMandala(true);
    ic.clearInfoCellChoiceOverride(4);
    ic.clearInfoCellChoiceOverride(12);
  });

  it("defaults to qr when both globals are on", () => {
    expect(ic.getInfoCellChoiceForStepCount(4)).toBe("qr");
  });

  it("defaults to mandala when QR is globally off", () => {
    ic.setShowQRCode(false);
    expect(ic.getInfoCellChoiceForStepCount(4)).toBe("mandala");
  });

  it("defaults to none when both globals are off", () => {
    ic.setShowQRCode(false);
    ic.setShowMandala(false);
    expect(ic.getInfoCellChoiceForStepCount(4)).toBe("none");
  });

  it("stores an explicit non-default choice", () => {
    ic.setInfoCellChoiceForStepCount(4, "mandala");
    expect(ic.hasInfoCellChoiceOverride(4)).toBe(true);
    expect(ic.getInfoCellChoiceForStepCount(4)).toBe("mandala");
  });

  it("deletes the override when the pick equals the derived default", () => {
    ic.setInfoCellChoiceForStepCount(4, "mandala");
    ic.setInfoCellChoiceForStepCount(4, "qr"); // qr == derived default (both on)
    expect(ic.hasInfoCellChoiceOverride(4)).toBe(false);
  });

  it("does not couple lengths: 4-count override leaves 12-count default", () => {
    ic.setInfoCellChoiceForStepCount(4, "mandala");
    expect(ic.getInfoCellChoiceForStepCount(12)).toBe("qr");
  });
});

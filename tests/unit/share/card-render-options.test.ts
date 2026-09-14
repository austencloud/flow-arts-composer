import { describe, it, expect, vi, beforeEach } from "vitest";

// Controlled stand-ins for the two singleton managers the builder reads.
const ic = {
  includeStartPosition: true,
  addStepNumbers: true,
  addWord: true,
  addDifficultyLevel: true,
  showLoopGlyph: true,
  showNotes: false,
  customNotesText: "Created using Flow Arts Composer",
  showQRCode: true,
  showMandala: true,
  _cols: 4 as number | null,
  _layout: "row" as "row" | "column",
  _choice: "qr" as "qr" | "mandala" | "none",
  getColumnCountForStepCount: () => ic._cols,
  getStartPositionLayoutForStepCount: () => ic._layout,
  getInfoCellChoiceForStepCount: () => ic._choice,
};
const vm = { getGridVisibility: () => true };
const appSettings = { primaryPropColors: { left: "#00ff88", right: "#ff8800" } };
vi.mock("$lib/shared/application/state/app-state.svelte", () => ({ getSettings: () => appSettings }));

vi.mock("$lib/shared/share/state/image-composition-state.svelte", () => ({
  getImageCompositionManager: () => ic,
}));
vi.mock("$lib/shared/pictograph/shared/state/visibility-state.svelte", () => ({
  getVisibilityStateManager: () => vm,
}));
// The resolver reads auth to gate the guest QR degrade; stub a signed-in user.
vi.mock("$lib/shared/auth/firebase", () => ({
  getAuthSync: () => ({ currentUser: { uid: "u" } }),
}));

import { buildCardRenderOptions } from "$lib/shared/share/services/card-render-options";

const seq = { steps: [{ letter: "A" }, { letter: "B" }, { letter: "C" }] } as any;

describe("buildCardRenderOptions", () => {
  it("snapshots the primary hand colors into the worker export options", () => {
    expect(buildCardRenderOptions(seq, { darkMode: false }).visibilityOverrides?.primaryPropColors)
      .toEqual({ left: "#00ff88", right: "#ff8800" });
  });
  it("exports the selected presentation instead of the account props", () => {
    const options = buildCardRenderOptions(seq, {
      darkMode: false,
      propConfig: { leftPropType: "fan", rightPropType: "buugeng", catDogMode: true } as never,
    });
    expect(options.leftPropTypeOverride).toBe("fan");
    expect(options.rightPropTypeOverride).toBe("buugeng");
  });
  beforeEach(() => {
    ic._cols = 4;
    ic._layout = "row";
    ic._choice = "qr";
    ic.showQRCode = true;
    ic.showMandala = true;
    ic.includeStartPosition = true;
    ic.addDifficultyLevel = true;
    ic.showLoopGlyph = true;
    ic.showNotes = false;
    ic.customNotesText = "Created using Flow Arts Composer";
  });

  it("threads every panel toggle into the render options (no hand-path)", () => {
    const o = buildCardRenderOptions(seq, { darkMode: false });
    expect(o.showLoopGlyph).toBe(true);
    expect(o.addDifficultyLevel).toBe(true);
    expect(o.addReversalSymbols).toBe(true);
    expect(o.visibilityOverrides?.showMandala).toBe(true);
    expect(o.visibilityOverrides?.showQRCode).toBe(true);
    expect(o.visibilityOverrides?.showGrid).toBe(true);
    expect(o.visibilityOverrides?.handPathMode).toBe(false);
    // Normal cards leave TKA/reversal visibility to the global vm fallback.
    expect(o.visibilityOverrides?.showTKA).toBeUndefined();
  });

  it("does not emit personal names or record dates", () => {
    const o = buildCardRenderOptions(
      {
        ...seq,
        ownerId: "christof-id",
        ownerDisplayName: "Christofborkott",
      },
      { darkMode: false }
    );

    expect(o).not.toHaveProperty("userName");
    expect(o).not.toHaveProperty("showCreatorName");
    expect(o).not.toHaveProperty("showBirthday");
    expect(o).not.toHaveProperty("birthday");
    expect(o.addUserInfo).toBe(false);
  });

  it("renders an explicit card footer without reading private sequence notes", () => {
    const sequence = {
      ...seq,
      notes: "private choreography note",
      cardPresentation: {
        schemaVersion: 1,
        footer: { mode: "custom", text: "Shared from First Fire" },
      },
    } as any;

    const options = buildCardRenderOptions(sequence, { darkMode: false });

    expect(options.showNotes).toBe(true);
    expect(options.addUserInfo).toBe(true);
    expect(options.customNotesText).toBe("Shared from First Fire");
    expect(options.notes).toBe("Shared from First Fire");
    expect(JSON.stringify(options)).not.toContain("private choreography note");
  });

  it("lets a one-share footer override the saved card presentation", () => {
    const sequence = {
      ...seq,
      cardPresentation: {
        schemaVersion: 1,
        footer: { mode: "credit" },
      },
    } as any;

    const options = buildCardRenderOptions(sequence, {
      darkMode: false,
      cardPresentation: {
        schemaVersion: 1,
        footer: { mode: "custom", text: "Only for this post" },
      },
    });

    expect(options.customNotesText).toBe("Only for this post");
  });

  it("converts manual STEP columns according to the chosen start placement", () => {
    ic._cols = 4;
    ic.includeStartPosition = true;
    ic._layout = "row";
    expect(buildCardRenderOptions(seq, { darkMode: false }).columnCount).toBe(4);
    ic._layout = "column";
    expect(buildCardRenderOptions(seq, { darkMode: false }).columnCount).toBe(5);
    ic.includeStartPosition = false;
    expect(buildCardRenderOptions(seq, { darkMode: false }).columnCount).toBe(4);
  });

  it("reuses the live preview's Auto columns and start placement", () => {
    ic._cols = null;
    ic._layout = "column";
    const sequence = {
      steps: Array.from({ length: 8 }, () => ({ letter: "A" })),
    } as any;
    const options = buildCardRenderOptions(sequence, {
      darkMode: false,
      resolvedAutoLayout: {
        stepCount: 8,
        cols: 2,
        rows: 5,
        startPlacement: "row",
      },
    });
    expect(options.columnCount).toBe(2);
    expect(options.startPositionLayout).toBe("row");
  });

  it("ignores a stale Auto result from a different sequence length", () => {
    ic._cols = null;
    ic._layout = "row";
    const sequence = {
      steps: Array.from({ length: 8 }, () => ({ letter: "A" })),
    } as any;
    const options = buildCardRenderOptions(sequence, {
      darkMode: false,
      resolvedAutoLayout: {
        stepCount: 12,
        cols: 4,
        rows: 4,
        startPlacement: "column",
      },
    });
    expect(options.columnCount).toBeUndefined();
    expect(options.startPositionLayout).toBe("row");
  });

  it("reuses the measured Auto shape for mixed-duration cards", () => {
    ic._cols = null;
    ic._layout = "row";
    const mixed = {
      steps: Array.from({ length: 12 }, (_, index) => ({
        letter: "A",
        duration: index === 0 ? 2 : 1,
      })),
    } as any;
    const options = buildCardRenderOptions(mixed, {
      darkMode: false,
      resolvedAutoLayout: {
        stepCount: 12,
        cols: 4,
        rows: 4,
        startPlacement: "column",
      },
    });
    expect(options.columnCount).toBe(4);
    expect(options.startPositionLayout).toBe("column");
  });

  it("forces QR off for a one-count card even when the global QR toggle is on", () => {
    // showQRCode is on globally, but a single beat + start has no spare cell —
    // a QR would land on the start position. One-count cards never carry a QR.
    const oneStep = { steps: [{ letter: "A" }] } as any;
    expect(ic.showQRCode).toBe(true);
    const o = buildCardRenderOptions(oneStep, { darkMode: false });
    expect(o.visibilityOverrides?.showQRCode).toBe(false);
    // Multi-count cards are unaffected.
    expect(buildCardRenderOptions(seq, { darkMode: false }).visibilityOverrides?.showQRCode).toBe(true);
  });

  it("one-spot 4-count + both on + choice 'mandala' resolves to mandala only", () => {
    // The fallback Auto table gives 4 steps one info cell before the preview reports.
    const fourStep = { steps: [{ letter: "A" }, { letter: "B" }, { letter: "C" }, { letter: "D" }] } as any;
    ic._cols = null; // auto layout table, not a 4-column override
    ic._layout = "row";
    ic._choice = "mandala";
    const o = buildCardRenderOptions(fourStep, { darkMode: false });
    expect(o.visibilityOverrides?.showQRCode).toBe(false);
    expect(o.visibilityOverrides?.showMandala).toBe(true);
  });

  it("one-spot 4-count + both on + choice 'qr' keeps QR only", () => {
    const fourStep = { steps: [{ letter: "A" }, { letter: "B" }, { letter: "C" }, { letter: "D" }] } as any;
    ic._cols = null;
    ic._layout = "row";
    ic._choice = "qr";
    const o = buildCardRenderOptions(fourStep, { darkMode: false });
    expect(o.visibilityOverrides?.showQRCode).toBe(true);
    expect(o.visibilityOverrides?.showMandala).toBe(false);
  });

  it("suppresses difficulty, LOOP glyph, reversals and TKA in hand-path mode", () => {
    const o = buildCardRenderOptions(seq, { darkMode: false, isHandPath: true });
    expect(o.addDifficultyLevel).toBe(false);
    expect(o.showLoopGlyph).toBe(false);
    expect(o.addReversalSymbols).toBe(false);
    expect(o.visibilityOverrides?.handPathMode).toBe(true);
    expect(o.visibilityOverrides?.showTKA).toBe(false);
    expect(o.visibilityOverrides?.showReversals).toBe(false);
    // Mandala is NOT hand-path suppressed (matches the preview).
    expect(o.visibilityOverrides?.showMandala).toBe(true);
  });
});

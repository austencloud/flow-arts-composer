import { describe, it, expect } from "vitest";
import { buildFrontComposeOptions } from "../build-front-compose-options";
import type { PrintRenderOptions } from "../types";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

const SEQ: SequenceData = {
  id: "seq-1",
  word: "ABC",
  author: "Tester",
  steps: [],
} as unknown as SequenceData;

const BASE_OPTS: PrintRenderOptions = {
  includeStartPlacement: true,
  startPlacementLayout: "row",
};

describe("buildFrontComposeOptions", () => {
  it("computes deckCard content size = canvas - 2*round(bleed*2.0)", () => {
    const { composeOptions } = buildFrontComposeOptions(SEQ, BASE_OPTS);
    // Defaults: 822x1122, bleed 36 → border = round(72) = 72 → content 678x978.
    expect(composeOptions.deckCard).toEqual({
      contentWidth: 678,
      contentHeight: 978,
    });
  });

  it("honors explicit canvas/bleed dims", () => {
    const { composeOptions, frame } = buildFrontComposeOptions(SEQ, {
      ...BASE_OPTS,
      canvasWidth: 1644,
      canvasHeight: 2244,
      bleedPx: 72,
    });
    // border = round(72*2) = 144 → content 1356x1956.
    expect(composeOptions.deckCard).toEqual({
      contentWidth: 1356,
      contentHeight: 1956,
    });
    expect(frame).toEqual({
      canvasWidth: 1644,
      canvasHeight: 2244,
      bleedPx: 72,
      accent: "#999999",
      dark: "#444444",
    });
  });

  it("does not thread personal attribution or record dates into card composition", () => {
    const { composeOptions } = buildFrontComposeOptions(SEQ, BASE_OPTS);
    for (const retiredKey of [
      "userName",
      "showCreatorName",
      "birthday",
      "showBirthday",
      "exportDate",
    ]) {
      expect(composeOptions).not.toHaveProperty(retiredKey);
    }
  });

  it("derives accent/dark from tndElement when present", () => {
    const tndElement = {
      familyId: "split-same",
      name: "Water",
      element: "water",
      accentColor: "#3568a0",
      darkComplement: "#13284a",
      iconPath: "/images/elements/water-v2.png",
      cardTintOpacity: 0.12,
    } as unknown as PrintRenderOptions["tndElement"];
    const { composeOptions, frame } = buildFrontComposeOptions(SEQ, {
      ...BASE_OPTS,
      tndElement,
      iconPath: "/images/elements/water-v2.png",
      leftLabel: "Water",
    });
    expect(frame.accent).toBe("#3568a0");
    expect(frame.dark).toBe("#13284a");
    expect(composeOptions.accentColor).toBe("#3568a0");
    expect(composeOptions.accentTintOpacity).toBe(0.12);
    expect(composeOptions.iconPath).toBe("/images/elements/water-v2.png");
    expect(composeOptions.gridCentering).toBe("geometric");
    // Printed-deck labels and iconography still earn the footer.
    expect(composeOptions.showNotes).toBe(true);
  });

  it("threads a resolved total-grid column count into the composer", () => {
    const { composeOptions } = buildFrontComposeOptions(SEQ, {
      ...BASE_OPTS,
      startPlacementLayout: "column",
      totalGridColumns: 3,
    });

    expect(composeOptions.startPlacementLayout).toBe("column");
    expect(composeOptions.columnCount).toBe(3);
  });

  it("uses an explicit print-job frame palette without tinting the content", () => {
    const palette = ["#3568a0", "#ffde17"];
    const { composeOptions, frame } = buildFrontComposeOptions(SEQ, {
      ...BASE_OPTS,
      frontFrameColors: {
        accent: palette[0]!,
        dark: palette[1]!,
        palette,
      },
    });

    expect(frame.accent).toBe("#3568a0");
    expect(frame.dark).toBe("#ffde17");
    expect(frame.palette).toEqual(palette);
    expect(composeOptions.accentColor).toBeUndefined();
    expect(composeOptions.gridCentering).toBeUndefined();
  });

  it("emits prop-type overrides only when provided", () => {
    const none = buildFrontComposeOptions(SEQ, BASE_OPTS).composeOptions;
    expect(none.leftPropTypeOverride).toBeUndefined();
    expect(none.rightPropTypeOverride).toBeUndefined();
  });

  it("includes difficulty and LOOP indicators on the card front", () => {
    const { composeOptions } = buildFrontComposeOptions(SEQ, BASE_OPTS);

    expect(composeOptions.addDifficultyLevel).toBe(true);
    expect(composeOptions.showLoopGlyph).toBe(true);
  });

  it("uses the hands-only reference-card profile with a QR and without prop difficulty", () => {
    const { composeOptions } = buildFrontComposeOptions(SEQ, {
      ...BASE_OPTS,
      cardProfile: "hand-path",
      customName: "Tog-Opp",
      showMandala: true,
      showQRCode: true,
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
    });

    expect(composeOptions.addWord).toBe(true);
    expect(composeOptions.customName).toBe("Tog-Opp");
    expect(composeOptions.renderWordAsText).toBe(true);
    expect(composeOptions.addDifficultyLevel).toBe(false);
    expect(composeOptions.addReversalSymbols).toBe(false);
    expect(composeOptions.showLoopGlyph).toBe(false);
    expect(composeOptions.leftPropTypeOverride).toBe(PropType.HAND);
    expect(composeOptions.rightPropTypeOverride).toBe(PropType.HAND);
    expect(composeOptions.visibilityOverrides).toMatchObject({
      handPathMode: true,
      showTKA: false,
      showReversals: false,
      showQRCode: true,
      showMandala: false,
    });
  });
});

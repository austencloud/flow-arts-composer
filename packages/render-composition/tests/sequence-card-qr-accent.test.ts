import { describe, expect, it } from "vitest";
import {
  COMPOSER_CARD_EXPORT_PROFILE_V1,
  accentAlphaHex,
  calculateSequenceCardLayout,
  calculateSequenceCardMandalaPlacements,
  calculateSequenceCardQRCell,
  composeSequenceCard,
} from "../src/sequence-card-pipeline.js";
import { formatDurationBadge, stepHasDurationBadge } from "../src/duration-badge.js";
import {
  MODERN_QR_STYLE,
  applyDarkQrStyle,
  calculateQrCellGeometry,
  createStyledQrOptions,
} from "../src/qr-code-style.js";

const rowOptions = { layout: "grid", startPlacementLayout: "row" } as const;
const columnOptions = { layout: "grid", startPlacementLayout: "column" } as const;

describe("QR slot", () => {
  it("takes the last cell of the start row in row mode", () => {
    expect(
      calculateSequenceCardQRCell({ columns: 4, rows: 2 }, rowOptions, 4, new Set(["0,0"]))
    ).toEqual({ col: 3, row: 0 });
  });

  it("takes the first free cell from the bottom row in column mode", () => {
    const occupied = new Set(["0,0", "1,0", "2,0", "1,1", "2,1"]);
    expect(
      calculateSequenceCardQRCell({ columns: 3, rows: 2 }, columnOptions, 4, occupied)
    ).toEqual({ col: 0, row: 1 });
  });

  it("never paints over the start position of a one-count card", () => {
    expect(
      calculateSequenceCardQRCell({ columns: 1, rows: 2 }, rowOptions, 1, new Set(["0,0"]))
    ).toBeNull();
  });

  it("keeps the mandala out of the QR cell", () => {
    const layout = calculateSequenceCardLayout(5, {
      ...COMPOSER_CARD_EXPORT_PROFILE_V1,
      columnCount: 4,
    });
    const reserved = new Set(["0,0", "3,0"]);
    const placements = calculateSequenceCardMandalaPlacements(
      layout,
      { ...COMPOSER_CARD_EXPORT_PROFILE_V1, columnCount: 4 },
      reserved,
      4
    );
    expect(placements.map((p) => [p.col, p.variant])).toEqual([
      [1, "left"],
      [2, "right"],
    ]);
  });

  it("leaves info cells empty below four steps, like the viewer", () => {
    const layout = calculateSequenceCardLayout(4, COMPOSER_CARD_EXPORT_PROFILE_V1);
    expect(
      calculateSequenceCardMandalaPlacements(
        layout,
        COMPOSER_CARD_EXPORT_PROFILE_V1,
        new Set(["0,0"]),
        3
      )
    ).toEqual([]);
  });

  it("renders the QR before the mandala and excludes its cell from borders", async () => {
    const calls: string[] = [];
    const occupiedAtBorders: string[] = [];
    const strokes: string[] = [];
    await composeSequenceCard({
      steps: [0, 1, 2, 3, 4].map((stepNumber) => ({ stepNumber })),
      word: "ABCD",
      options: {
        ...COMPOSER_CARD_EXPORT_PROFILE_V1,
        columnCount: 4,
        showQRCode: true,
      },
      createCanvas: () => ({}),
      getContext: () =>
        ({
          fillRect() {},
          save() {},
          restore() {},
          translate() {},
          beginPath() {},
          moveTo() {},
          lineTo() {},
          stroke() {
            strokes.push("stroke");
          },
          fillText() {},
          measureText: () => ({ width: 0 }),
          arc() {},
          fill() {},
        }) as unknown as CanvasRenderingContext2D,
      toPng: () => Buffer.from("png"),
      getStepNumber: (step) => step.stepNumber,
      calculateDifficultyLevel: () => 1,
      renderPictograph: async () => {},
      renderQRCode: (_ctx, cell) => {
        calls.push(`qr:${cell.x},${cell.y}`);
      },
      renderMandala: (_ctx, _steps, placements) => {
        calls.push(`mandala:${placements.map((p) => p.col).join("|")}`);
        occupiedAtBorders.push(...placements.map((p) => `${p.col},${p.row}`));
      },
      buildHeader: () => ({ word: "ABCD" }),
    });
    expect(calls).toEqual(["qr:900,100", "mandala:1|2"]);
    expect(occupiedAtBorders).not.toContain("3,0");
    expect(strokes.length).toBeGreaterThan(0);
  });
});

describe("accent tint", () => {
  it("uses the Composer default alpha when no opacity is given", () => {
    expect(accentAlphaHex(undefined)).toBe("18");
    expect(accentAlphaHex(0)).toBe("18");
    expect(accentAlphaHex(0.12)).toBe("1f");
    expect(accentAlphaHex(1)).toBe("ff");
  });
});

describe("duration badge", () => {
  it("formats counts the way the Composer export does", () => {
    expect(formatDurationBadge(2)).toBe("2×");
    expect(formatDurationBadge(1.5)).toBe("1.5×");
    expect(formatDurationBadge(2.25)).toBe("2.25×");
    expect(formatDurationBadge(0.5)).toBe("0.5×");
  });

  it("only badges steps whose duration is not one count", () => {
    expect(stepHasDurationBadge(1)).toBe(false);
    expect(stepHasDurationBadge(1.0004)).toBe(false);
    expect(stepHasDurationBadge(2)).toBe(true);
    expect(stepHasDurationBadge(undefined)).toBe(false);
  });
});

describe("QR style owner", () => {
  it("embeds the play badge and forces H recovery for player links", () => {
    const options = createStyledQrOptions("https://tka.run/X", 266, 1, MODERN_QR_STYLE, "play");
    expect(options.qrOptions.errorCorrectionLevel).toBe("H");
    expect(options.image?.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(options.imageOptions?.hideBackgroundDots).toBe(true);
    expect(options.dotsOptions).toEqual({ color: "#1a1a2e", type: "rounded" });
    expect(options.backgroundOptions.color).toBe("#ffffff");
  });

  it("keeps the preset recovery level when no icon is embedded", () => {
    const options = createStyledQrOptions("https://tka.run/X", 200, 1, MODERN_QR_STYLE, "none");
    expect(options.qrOptions.errorCorrectionLevel).toBe("M");
    expect(options.image).toBeUndefined();
  });

  it("switches dark cards to white modules on a transparent ground", () => {
    expect(applyDarkQrStyle(MODERN_QR_STYLE)).toMatchObject({
      color: "#ffffff",
      backgroundColor: "#00000000",
      dotsType: "rounded",
    });
  });

  it("centers the largest square after a 5.5% side margin", () => {
    expect(calculateQrCellGeometry(300)).toEqual({ sideMargin: 17, qrSize: 266, offset: 17 });
  });
});

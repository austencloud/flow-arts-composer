/**
 * Contract: every serialized card layout prints its QR with modules of at
 * least MIN_PRINTED_QR_MODULE_MM on both print paths, or is listed below as a
 * known gap with its measured size.
 *
 * It runs the real layout picker, the real QR placement and the real URL
 * builder with the longest code and card ID the builder accepts, across every
 * card size, with and without a footer, for every step count a sequence can
 * have. A gap entry fails as stale once its layout reaches the threshold, and
 * fails as changed when its measured size moves.
 *
 * Not covered: sequences with mixed step durations, which can pick other
 * grids. The print run's preflight (assertPlannedQrFits) still refuses those
 * before any card is issued.
 */
import { describe, expect, it } from "vitest";
import { getMaxSteps } from "#lib/shared/auth/domain/access-tier.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  PHYSICAL_CARD_ID_LENGTH,
  buildSerializedCardUrl,
  isShortCode,
} from "#lib/shared/qr/domain/physical-card.js";
import { CARD_SIZES, type CardSizeId } from "../../domain/card-sizes";
import { TND_ELEMENTS } from "../../domain/tnd-element";
import { calculatePhysicalCardLayout } from "../physical-card-layout-calculator";
import {
  MIN_PRINTED_QR_MODULE_MM,
  PRINT_SERVICE_PIXELS_PER_INCH,
  homePrintPixelsPerInch,
  plannedQrModuleMm,
} from "../print-qr-guard";
import { getSerializedQrPlacement } from "../serialized-card-front";
import type { PrintRenderOptions } from "../types";

/** Deck releaser render constants for serialized fronts. */
const BLEED_PX = 36;
const LONGEST_SEQUENCE = Math.max(getMaxSteps("user"), getMaxSteps("premium"));

/**
 * Layouts measured below MIN_PRINTED_QR_MODULE_MM, as
 * [print service mm, home print mm]; null where that path passes.
 */
const KNOWN_GAPS: Readonly<
  Record<
    string,
    readonly [printService: number | null, homePrint: number | null]
  >
> = {
  "poker footer 10-step best-fit column 3 cols": [null, 0.309],
  "poker footer 11-step best-fit row 3 cols": [null, 0.309],
  "poker footer 12-step best-fit row 3 cols": [null, 0.309],
  "poker footer 13-step best-fit column 4 cols": [null, 0.309],
  "poker footer 14-step best-fit column 4 cols": [null, 0.309],
  "poker footer 15-step best-fit column 4 cols": [null, 0.309],
  "poker footer 16-step best-fit row 4 cols": [null, 0.309],
  "poker footer 17-step best-fit column 4 cols": [0.28, 0.255],
  "poker footer 18-step best-fit column 4 cols": [0.28, 0.255],
  "poker footer 19-step best-fit row 4 cols": [0.28, 0.255],
  "poker footer 20-step best-fit row 4 cols": [0.28, 0.255],
  "poker footer 21-step best-fit column 4 cols": [0.239, 0.218],
  "poker footer 22-step best-fit column 5 cols": [0.273, 0.249],
  "poker footer 23-step best-fit column 5 cols": [0.273, 0.249],
  "poker footer 24-step best-fit column 5 cols": [0.273, 0.249],
  "poker footer 25-step best-fit row 5 cols": [0.273, 0.249],
  "poker footer 26-step best-fit column 5 cols": [0.239, 0.218],
  "poker footer 27-step best-fit column 5 cols": [0.239, 0.218],
  "poker footer 28-step best-fit column 5 cols": [0.239, 0.218],
  "poker footer 29-step best-fit row 5 cols": [0.239, 0.218],
  "poker footer 30-step best-fit row 5 cols": [0.239, 0.218],
  "poker footer 31-step best-fit column 5 cols": [0.21, 0.192],
  "poker footer 32-step best-fit column 5 cols": [0.21, 0.192],
  "poker footer 33-step best-fit row 5 cols": [0.21, 0.192],
  "poker footer 34-step best-fit row 5 cols": [0.21, 0.192],
  "poker footer 35-step best-fit row 5 cols": [0.21, 0.192],
  "poker footer 36-step best-fit row 6 cols": [0.228, 0.208],
  "poker footer 37-step best-fit column 6 cols": [0.21, 0.192],
  "poker footer 38-step best-fit column 6 cols": [0.21, 0.192],
  "poker footer 39-step best-fit column 6 cols": [0.21, 0.192],
  "poker footer 40-step best-fit column 6 cols": [0.21, 0.192],
  "poker footer 41-step best-fit row 6 cols": [0.21, 0.192],
  "poker footer 42-step best-fit row 6 cols": [0.21, 0.192],
  "poker footer 43-step best-fit column 6 cols": [0.187, 0.171],
  "poker footer 44-step best-fit column 6 cols": [0.187, 0.171],
  "poker footer 45-step best-fit column 6 cols": [0.187, 0.171],
  "poker footer 46-step best-fit row 6 cols": [0.187, 0.171],
  "poker footer 47-step best-fit row 6 cols": [0.187, 0.171],
  "poker footer 48-step best-fit row 6 cols": [0.187, 0.171],
  "poker footer 49-step best-fit row 7 cols": [0.194, 0.177],
  "poker footer 50-step best-fit column 6 cols": [0.167, 0.152],
  "poker footer 51-step best-fit column 7 cols": [0.187, 0.171],
  "poker footer 52-step best-fit column 7 cols": [0.187, 0.171],
  "poker footer 53-step best-fit column 7 cols": [0.187, 0.171],
  "poker footer 54-step best-fit column 7 cols": [0.187, 0.171],
  "poker footer 55-step best-fit column 6 cols": [0.154, 0.14],
  "poker footer 56-step best-fit row 7 cols": [0.187, 0.171],
  "poker footer 57-step best-fit column 7 cols": [0.167, 0.152],
  "poker footer 58-step best-fit column 7 cols": [0.167, 0.152],
  "poker footer 59-step best-fit column 7 cols": [0.167, 0.152],
  "poker footer 60-step best-fit column 7 cols": [0.167, 0.152],
  "poker footer 61-step best-fit row 7 cols": [0.167, 0.152],
  "poker footer 62-step best-fit row 7 cols": [0.167, 0.152],
  "poker footer 63-step best-fit row 7 cols": [0.167, 0.152],
  "poker footer 64-step best-fit row 8 cols": [0.167, 0.152],
  "poker no footer 10-step best-fit column 3 cols": [null, 0.323],
  "poker no footer 11-step best-fit row 3 cols": [null, 0.323],
  "poker no footer 12-step best-fit row 3 cols": [null, 0.323],
  "poker no footer 13-step best-fit column 4 cols": [null, 0.311],
  "poker no footer 14-step best-fit column 4 cols": [null, 0.311],
  "poker no footer 15-step best-fit column 4 cols": [null, 0.311],
  "poker no footer 16-step best-fit row 4 cols": [null, 0.311],
  "poker no footer 17-step best-fit column 4 cols": [0.298, 0.272],
  "poker no footer 18-step best-fit column 4 cols": [0.298, 0.272],
  "poker no footer 19-step best-fit row 4 cols": [0.298, 0.272],
  "poker no footer 20-step best-fit row 4 cols": [0.298, 0.272],
  "poker no footer 21-step best-fit column 4 cols": [0.253, 0.231],
  "poker no footer 22-step best-fit column 5 cols": [0.273, 0.249],
  "poker no footer 23-step best-fit column 5 cols": [0.273, 0.249],
  "poker no footer 24-step best-fit column 5 cols": [0.273, 0.249],
  "poker no footer 25-step best-fit row 5 cols": [0.273, 0.249],
  "poker no footer 26-step best-fit column 5 cols": [0.253, 0.231],
  "poker no footer 27-step best-fit column 5 cols": [0.253, 0.231],
  "poker no footer 28-step best-fit column 5 cols": [0.253, 0.231],
  "poker no footer 29-step best-fit row 5 cols": [0.253, 0.231],
  "poker no footer 30-step best-fit row 5 cols": [0.253, 0.231],
  "poker no footer 31-step best-fit column 5 cols": [0.224, 0.204],
  "poker no footer 32-step best-fit column 5 cols": [0.224, 0.204],
  "poker no footer 33-step best-fit row 5 cols": [0.224, 0.204],
  "poker no footer 34-step best-fit row 5 cols": [0.224, 0.204],
  "poker no footer 35-step best-fit row 5 cols": [0.224, 0.204],
  "poker no footer 36-step best-fit row 6 cols": [0.228, 0.208],
  "poker no footer 37-step best-fit column 6 cols": [0.224, 0.204],
  "poker no footer 38-step best-fit column 6 cols": [0.224, 0.204],
  "poker no footer 39-step best-fit column 6 cols": [0.224, 0.204],
  "poker no footer 40-step best-fit column 6 cols": [0.224, 0.204],
  "poker no footer 41-step best-fit row 6 cols": [0.224, 0.204],
  "poker no footer 42-step best-fit row 6 cols": [0.224, 0.204],
  "poker no footer 43-step best-fit column 6 cols": [0.199, 0.181],
  "poker no footer 44-step best-fit column 6 cols": [0.199, 0.181],
  "poker no footer 45-step best-fit column 6 cols": [0.199, 0.181],
  "poker no footer 46-step best-fit row 6 cols": [0.199, 0.181],
  "poker no footer 47-step best-fit row 6 cols": [0.199, 0.181],
  "poker no footer 48-step best-fit row 6 cols": [0.199, 0.181],
  "poker no footer 49-step best-fit row 7 cols": [0.194, 0.177],
  "poker no footer 50-step best-fit column 6 cols": [0.176, 0.161],
  "poker no footer 51-step best-fit column 7 cols": [0.194, 0.177],
  "poker no footer 52-step best-fit column 7 cols": [0.194, 0.177],
  "poker no footer 53-step best-fit column 7 cols": [0.194, 0.177],
  "poker no footer 54-step best-fit column 7 cols": [0.194, 0.177],
  "poker no footer 55-step best-fit column 6 cols": [0.163, 0.148],
  "poker no footer 56-step best-fit row 7 cols": [0.194, 0.177],
  "poker no footer 57-step best-fit column 7 cols": [0.176, 0.161],
  "poker no footer 58-step best-fit column 7 cols": [0.176, 0.161],
  "poker no footer 59-step best-fit column 7 cols": [0.176, 0.161],
  "poker no footer 60-step best-fit column 7 cols": [0.176, 0.161],
  "poker no footer 61-step best-fit row 7 cols": [0.176, 0.161],
  "poker no footer 62-step best-fit row 7 cols": [0.176, 0.161],
  "poker no footer 63-step best-fit row 7 cols": [0.176, 0.161],
  "poker no footer 64-step best-fit row 8 cols": [0.167, 0.152],
  "tarot footer 21-step best-fit column 4 cols": [null, 0.318],
  "tarot footer 22-step best-fit row 4 cols": [null, 0.318],
  "tarot footer 23-step best-fit row 4 cols": [null, 0.318],
  "tarot footer 24-step best-fit row 4 cols": [null, 0.318],
  "tarot footer 25-step best-fit row 5 cols": [0.303, 0.278],
  "tarot footer 26-step best-fit row 4 cols": [0.303, 0.278],
  "tarot footer 27-step best-fit row 4 cols": [0.303, 0.278],
  "tarot footer 28-step best-fit row 4 cols": [0.303, 0.278],
  "tarot footer 29-step best-fit row 5 cols": [0.303, 0.278],
  "tarot footer 30-step best-fit row 5 cols": [0.303, 0.278],
  "tarot footer 31-step best-fit column 5 cols": [0.303, 0.278],
  "tarot footer 32-step best-fit column 5 cols": [0.303, 0.278],
  "tarot footer 33-step best-fit row 5 cols": [0.303, 0.278],
  "tarot footer 34-step best-fit row 5 cols": [0.303, 0.278],
  "tarot footer 35-step best-fit row 5 cols": [0.303, 0.278],
  "tarot footer 36-step best-fit column 5 cols": [0.269, 0.247],
  "tarot footer 37-step best-fit row 5 cols": [0.269, 0.247],
  "tarot footer 38-step best-fit row 5 cols": [0.269, 0.247],
  "tarot footer 39-step best-fit row 5 cols": [0.269, 0.247],
  "tarot footer 40-step best-fit row 5 cols": [0.269, 0.247],
  "tarot footer 41-step best-fit row 5 cols": [0.239, 0.22],
  "tarot footer 42-step best-fit row 6 cols": [0.251, 0.23],
  "tarot footer 43-step best-fit row 5 cols": [0.239, 0.22],
  "tarot footer 44-step best-fit row 5 cols": [0.239, 0.22],
  "tarot footer 45-step best-fit row 5 cols": [0.239, 0.22],
  "tarot footer 46-step best-fit row 6 cols": [0.251, 0.23],
  "tarot footer 47-step best-fit row 6 cols": [0.251, 0.23],
  "tarot footer 48-step best-fit row 6 cols": [0.251, 0.23],
  "tarot footer 49-step best-fit row 7 cols": [0.214, 0.197],
  "tarot footer 50-step best-fit column 6 cols": [0.239, 0.22],
  "tarot footer 51-step best-fit row 6 cols": [0.239, 0.22],
  "tarot footer 52-step best-fit row 6 cols": [0.239, 0.22],
  "tarot footer 53-step best-fit row 6 cols": [0.239, 0.22],
  "tarot footer 54-step best-fit row 6 cols": [0.239, 0.22],
  "tarot footer 55-step best-fit column 6 cols": [0.219, 0.201],
  "tarot footer 56-step best-fit row 7 cols": [0.214, 0.197],
  "tarot footer 57-step best-fit row 6 cols": [0.219, 0.201],
  "tarot footer 58-step best-fit row 6 cols": [0.219, 0.201],
  "tarot footer 59-step best-fit row 6 cols": [0.219, 0.201],
  "tarot footer 60-step best-fit row 6 cols": [0.219, 0.201],
  "tarot footer 61-step best-fit row 6 cols": [0.199, 0.183],
  "tarot footer 62-step best-fit row 6 cols": [0.199, 0.183],
  "tarot footer 63-step best-fit row 7 cols": [0.214, 0.197],
  "tarot footer 64-step best-fit row 8 cols": [0.19, 0.174],
  "tarot no footer 25-step best-fit row 5 cols": [0.303, 0.278],
  "tarot no footer 26-step best-fit row 4 cols": [0.312, 0.287],
  "tarot no footer 27-step best-fit row 4 cols": [0.312, 0.287],
  "tarot no footer 28-step best-fit row 4 cols": [0.312, 0.287],
  "tarot no footer 29-step best-fit row 5 cols": [0.303, 0.278],
  "tarot no footer 30-step best-fit row 5 cols": [0.303, 0.278],
  "tarot no footer 31-step best-fit column 5 cols": [0.303, 0.278],
  "tarot no footer 32-step best-fit column 5 cols": [0.303, 0.278],
  "tarot no footer 33-step best-fit row 5 cols": [0.303, 0.278],
  "tarot no footer 34-step best-fit row 5 cols": [0.303, 0.278],
  "tarot no footer 35-step best-fit row 5 cols": [0.303, 0.278],
  "tarot no footer 36-step best-fit column 5 cols": [0.278, 0.255],
  "tarot no footer 37-step best-fit row 5 cols": [0.278, 0.255],
  "tarot no footer 38-step best-fit row 5 cols": [0.278, 0.255],
  "tarot no footer 39-step best-fit row 5 cols": [0.278, 0.255],
  "tarot no footer 40-step best-fit row 5 cols": [0.278, 0.255],
  "tarot no footer 41-step best-fit row 5 cols": [0.251, 0.23],
  "tarot no footer 42-step best-fit row 6 cols": [0.251, 0.23],
  "tarot no footer 43-step best-fit row 5 cols": [0.251, 0.23],
  "tarot no footer 44-step best-fit row 5 cols": [0.251, 0.23],
  "tarot no footer 45-step best-fit row 5 cols": [0.251, 0.23],
  "tarot no footer 46-step best-fit row 6 cols": [0.251, 0.23],
  "tarot no footer 47-step best-fit row 6 cols": [0.251, 0.23],
  "tarot no footer 48-step best-fit row 6 cols": [0.251, 0.23],
  "tarot no footer 49-step best-fit row 7 cols": [0.214, 0.197],
  "tarot no footer 50-step best-fit column 6 cols": [0.251, 0.23],
  "tarot no footer 51-step best-fit row 6 cols": [0.251, 0.23],
  "tarot no footer 52-step best-fit row 6 cols": [0.251, 0.23],
  "tarot no footer 53-step best-fit row 6 cols": [0.251, 0.23],
  "tarot no footer 54-step best-fit row 6 cols": [0.251, 0.23],
  "tarot no footer 55-step best-fit column 6 cols": [0.228, 0.21],
  "tarot no footer 56-step best-fit row 7 cols": [0.214, 0.197],
  "tarot no footer 57-step best-fit row 6 cols": [0.228, 0.21],
  "tarot no footer 58-step best-fit row 6 cols": [0.228, 0.21],
  "tarot no footer 59-step best-fit row 6 cols": [0.228, 0.21],
  "tarot no footer 60-step best-fit row 6 cols": [0.228, 0.21],
  "tarot no footer 61-step best-fit row 6 cols": [0.208, 0.191],
  "tarot no footer 62-step best-fit row 6 cols": [0.208, 0.191],
  "tarot no footer 63-step best-fit row 7 cols": [0.214, 0.197],
  "tarot no footer 64-step best-fit row 8 cols": [0.19, 0.174],
};

/** One-count cards have no QR cell; the print run refuses them outright. */
const NO_QR_CELL = [
  "poker footer 1-step catalog row",
  "poker no footer 1-step catalog row",
  "tarot footer 1-step catalog row",
  "tarot no footer 1-step catalog row",
];

/** The longest run of "Z" a validator accepts, searching up to 32 chars. */
function longestAccepted(accepts: (value: string) => boolean): string {
  const lengths = Array.from({ length: 32 }, (_, index) => index + 1);
  const longest = Math.max(
    ...lengths.filter((length) => accepts("Z".repeat(length)))
  );
  return "Z".repeat(longest);
}

const LONGEST_CODE = longestAccepted(isShortCode);
const LONGEST_URL = buildSerializedCardUrl(
  LONGEST_CODE,
  "Z".repeat(PHYSICAL_CARD_ID_LENGTH)
);

const element = TND_ELEMENTS[0]!;

function sequence(stepCount: number): SequenceData {
  return {
    id: `contract-${stepCount}`,
    word: "ABCDEFGH".slice(0, Math.min(8, stepCount)),
    steps: Array.from({ length: stepCount }, () => ({})),
  } as unknown as SequenceData;
}

interface LayoutCase {
  label: string;
  placementSize: number | null;
  printService: number;
  homePrint: number;
}

function layoutCases(): LayoutCase[] {
  const cases: LayoutCase[] = [];
  for (const cardSize of Object.keys(CARD_SIZES) as CardSizeId[]) {
    const { canvasWidth, canvasHeight } = CARD_SIZES[cardSize];
    const homePpi = homePrintPixelsPerInch(
      { width: canvasWidth, height: canvasHeight },
      cardSize
    );
    for (const footer of [true, false]) {
      for (let stepCount = 1; stepCount <= LONGEST_SEQUENCE; stepCount++) {
        const cardSequence = sequence(stepCount);
        const layout = calculatePhysicalCardLayout({
          sequence: cardSequence,
          canvasWidth,
          canvasHeight,
          bleedPx: BLEED_PX,
          includeStartPlacement: true,
          showHeader: true,
          showFooter: footer,
          showQRCode: true,
        });
        const options: PrintRenderOptions = {
          canvasWidth,
          canvasHeight,
          bleedPx: BLEED_PX,
          includeStartPlacement: true,
          showMandala: true,
          tndElement: element,
          ...(footer && {
            leftLabel: element.element,
            rightLabel: "1 turn",
            notes: "Deck 001",
            iconPath: element.iconPath,
          }),
          startPlacementLayout: layout.startPlacementLayout,
          ...(layout.totalGridColumns !== undefined && {
            totalGridColumns: layout.totalGridColumns,
          }),
        };
        const variant =
          layout.totalGridColumns !== undefined
            ? `best-fit ${layout.startPlacementLayout} ${layout.totalGridColumns} cols`
            : `catalog ${layout.startPlacementLayout}`;
        const placement = getSerializedQrPlacement(cardSequence, options);
        const moduleMm = (pixelsPerInch: number) =>
          placement
            ? plannedQrModuleMm(LONGEST_URL, placement.size, pixelsPerInch)
            : Number.NaN;
        cases.push({
          label: `${cardSize} ${footer ? "footer" : "no footer"} ${stepCount}-step ${variant}`,
          placementSize: placement?.size ?? null,
          printService: moduleMm(PRINT_SERVICE_PIXELS_PER_INCH),
          homePrint: moduleMm(homePpi),
        });
      }
    }
  }
  return cases;
}

const CASES = layoutCases();
const QR_CASES = CASES.filter((layoutCase) => layoutCase.placementSize);

describe("serialized QR module contract", () => {
  it("measures the longest URL the serialized card builder accepts", () => {
    expect(LONGEST_URL).toBe(
      `HTTPS://TKA.RUN/${LONGEST_CODE}?pid=${"Z".repeat(PHYSICAL_CARD_ID_LENGTH)}`
    );
    expect(() =>
      buildSerializedCardUrl(
        `${LONGEST_CODE}Z`,
        "Z".repeat(PHYSICAL_CARD_ID_LENGTH)
      )
    ).toThrow("Invalid short code");
    expect(() =>
      buildSerializedCardUrl(
        LONGEST_CODE,
        "Z".repeat(PHYSICAL_CARD_ID_LENGTH + 1)
      )
    ).toThrow("Invalid physical card ID");
  });

  it("lists exactly the layouts without a QR cell", () => {
    expect(
      CASES.filter((layoutCase) => !layoutCase.placementSize).map(
        (layoutCase) => layoutCase.label
      )
    ).toEqual(NO_QR_CELL);
  });

  it("keeps every known gap tied to a layout that still exists", () => {
    const labels = new Set(QR_CASES.map((layoutCase) => layoutCase.label));
    expect(
      Object.keys(KNOWN_GAPS).filter((label) => !labels.has(label))
    ).toEqual([]);
  });

  describe.each([
    { path: "print service", key: "printService", index: 0 },
    { path: "home print", key: "homePrint", index: 1 },
  ] as const)("$path", ({ key, index }) => {
    it.each(QR_CASES)("$label", (layoutCase) => {
      const moduleMm = layoutCase[key];
      const knownGap = KNOWN_GAPS[layoutCase.label]?.[index] ?? null;
      if (knownGap === null) {
        expect(
          moduleMm,
          `${moduleMm.toFixed(3)} mm is below the printable minimum; fix the slot or list it in KNOWN_GAPS`
        ).toBeGreaterThanOrEqual(MIN_PRINTED_QR_MODULE_MM);
        return;
      }
      expect(
        moduleMm,
        `now ${moduleMm.toFixed(3)} mm: remove it from KNOWN_GAPS`
      ).toBeLessThan(MIN_PRINTED_QR_MODULE_MM);
      expect(
        moduleMm,
        `now ${moduleMm.toFixed(3)} mm: update KNOWN_GAPS`
      ).toBeCloseTo(knownGap, 3);
    });
  });
});

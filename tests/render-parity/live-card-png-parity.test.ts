import { render } from "vitest-browser-svelte";
import { describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
import type { ResolvedAutoLayout } from "$lib/shared/render/services/container-aware-layout";
import { cardParityCases, type CardParityCase } from "./card-parity-cases";
import {
  assertCardParity,
  cardParityMetrics,
  type ParityImage,
} from "./card-parity-metrics";
import {
  cardParityExportOptions,
  cardParitySequence,
  renderComposerCard,
} from "./render-composer-card";
import LiveCardParityHarness from "./LiveCardParityHarness.svelte";

interface LiveCase {
  name: string;
  testCase: CardParityCase;
  /** Auto deliberately resolves from the mounted DOM, then the export receives it. */
  auto?: boolean;
}

function fixture(name: string): CardParityCase {
  const value = cardParityCases().find((entry) => entry.name === name);
  if (!value) throw new Error(`Missing card parity fixture: ${name}`);
  return value;
}

// This is intentionally a compact representative matrix. The wider browser ⇄
// MCP suite keeps every compositor-only case; these cover the ways a real live
// ChoreoCard can drift from the downloaded PNG.
const LIVE_CASES: LiveCase[] = [
  { name: "light-row", testCase: fixture("composer-light") },
  { name: "dark-row", testCase: fixture("composer-dark") },
  { name: "footer-row", testCase: fixture("footer") },
  {
    name: "metadata-footer-off-row",
    testCase: {
      ...fixture("composer-light"),
      name: "live-metadata-footer-off",
      sequence: {
        ...fixture("composer-light").sequence,
        metadata: {
          ...fixture("composer-light").sequence.metadata,
          pathShape: "linear",
        },
      } as CardParityCase["sequence"],
      options: { showFooter: false },
    },
  },
  { name: "duration-row", testCase: fixture("duration-badges") },
  {
    name: "custom-title-row",
    testCase: {
      ...fixture("composer-light"),
      name: "live-custom-title",
      options: {
        showDifficulty: true,
        showMandala: true,
        customName: "Export card title",
      } as CardParityCase["options"],
    },
  },
  { name: "custom-props-row", testCase: fixture("custom-colors") },
  { name: "mixed-props-row", testCase: fixture("mixed-fan-staff") },
  { name: "qr-mandala-row", testCase: fixture("qr-code-row") },
  {
    name: "visibility-header-off",
    testCase: {
      ...fixture("footer"),
      name: "live-visibility-header-off",
      options: {
        showFooter: true,
        notes: "Only the footer remains",
        addWord: false,
        addStepNumbers: false,
        addDifficultyLevel: false,
        visibilityOverrides: {
          showGrid: false,
          showTKA: false,
          showReversals: false,
          showHandColorKey: false,
          showMandala: false,
          showQRCode: false,
        },
      } as CardParityCase["options"],
    },
  },
  {
    name: "column",
    testCase: {
      ...fixture("print-footer"),
      name: "live-column",
      // This is a live export card, not a framed print deck. It retains the
      // actual eight-step fixture and pins the column geometry the download
      // card offers.
      options: {
        showFooter: true,
        notes: "Accent footer",
        columnCount: 3,
        startPlacementLayout: "column",
        showMandala: true,
      },
    },
  },
  {
    name: "auto",
    testCase: {
      ...fixture("composer-light"),
      name: "live-auto",
      options: {
        showDifficulty: true,
        showMandala: true,
      },
    },
    auto: true,
  },
];

async function imageDataFromBase64(base64: string): Promise<ParityImage> {
  const image = new Image();
  image.src = `data:image/png;base64,${base64}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

async function captureLiveElement(element: Element): Promise<ParityImage> {
  const shot = await page.screenshot({ element, base64: true });
  return imageDataFromBase64(shot.base64);
}

async function settleVisibleCard(host: Element): Promise<void> {
  await Promise.allSettled(
    [...host.querySelectorAll("img")].map((image) => image.decode())
  );
  for (let frame = 0; frame < 6; frame++) {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );
  }
}

async function exportImage(testCase: CardParityCase): Promise<ParityImage> {
  const canvas = await renderComposerCard(testCase, { printMode: false });
  const context = canvas.getContext("2d")!;
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function imageBase64(image: ParityImage): string {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas
    .getContext("2d")!
    .putImageData(
      new ImageData(new Uint8ClampedArray(image.data), image.width),
      0,
      0
    );
  return canvas.toDataURL("image/png").split(",")[1]!;
}

async function screenshotLiveCard(
  testCase: CardParityCase,
  expected: ParityImage,
  auto: boolean,
  autoLayoutOverride: ResolvedAutoLayout | null = null
): Promise<{
  image: ParityImage;
  screen: Awaited<ReturnType<typeof render>>;
  resolvedAutoLayout: ResolvedAutoLayout | null;
}> {
  await page.viewport(1600, 1800);
  let ready!: () => void;
  const settled = new Promise<void>((resolve) => (ready = resolve));
  let resolvedAutoLayout: ResolvedAutoLayout | null = null;
  const screen = await render(LiveCardParityHarness, {
    sequence: cardParitySequence(testCase),
    options: cardParityExportOptions(testCase, {
      printMode: false,
    }) as Partial<SequenceExportOptions>,
    width: expected.width,
    height: expected.height,
    automaticLayout: auto,
    autoLayoutOverride,
    qrUrl: cardParityExportOptions(testCase, { printMode: false }).qrUrl,
    onReady: ready,
    onAutoLayoutResolved: (layout) => {
      resolvedAutoLayout = layout;
    },
  });
  await settled;
  const host = screen.getByTestId("live-export-card").element();
  await settleVisibleCard(host);

  // The PNG exporter cannot measure a DOM container. The live winner is its
  // input under Auto, so make a second exact export with that geometry.
  if (auto) {
    expect(resolvedAutoLayout).not.toBeNull();
  }
  const image = await captureLiveElement(
    screen.getByTestId("live-export-card").element()
  );
  return { image, screen, resolvedAutoLayout };
}

describe("actual LiveExportCard ⇄ downloaded PNG parity", () => {
  for (const liveCase of LIVE_CASES) {
    it(`${liveCase.name}: mounted ChoreoCard matches its PNG export by region`, async () => {
      let testCase = liveCase.testCase;
      let expected = await exportImage(testCase);
      let first = await screenshotLiveCard(
        testCase,
        expected,
        liveCase.auto === true
      );

      if (liveCase.auto) {
        expect(first.resolvedAutoLayout).not.toBeNull();
        testCase = {
          ...testCase,
          options: {
            ...testCase.options,
            columnCount: first.resolvedAutoLayout!.cols,
            startPlacementLayout:
              first.resolvedAutoLayout!.startPlacement === "none"
                ? "row"
                : first.resolvedAutoLayout!.startPlacement,
          },
        };
        expected = await exportImage(testCase);
        const initialRoot = first.screen
          .getByTestId("live-export-card")
          .element();
        const initialCard = initialRoot.querySelector(".choreo-card-root")!;
        expect(Number(initialCard.getAttribute("data-layout-columns"))).toBe(
          first.resolvedAutoLayout!.cols
        );
        await first.screen.unmount();
        // CSS Auto chooses for its container; the PNG uses a fixed native cell
        // size. Freeze that proven winner in a new live card at PNG dimensions
        // before comparing regional pixels.
        first = await screenshotLiveCard(
          testCase,
          expected,
          false,
          first.resolvedAutoLayout
        );
        const root = first.screen.getByTestId("live-export-card").element();
        const liveRoot = root.querySelector(".choreo-card-root")!;
        expect(Number(liveRoot.getAttribute("data-layout-columns"))).toBe(
          first.resolvedAutoLayout?.cols ?? testCase.options.columnCount ?? 0
        );
        // The wrapper passes the exact callback to production export. The DOM
        // data attribute is only a contract guard that the screenshot is a
        // mounted live card, not a cached image stand-in.
        expect(
          liveRoot.querySelectorAll(".live-pictograph svg[role='img']").length
        ).toBeGreaterThan(0);
      }

      expect(first.image.width).toBe(expected.width);
      expect(first.image.height).toBe(expected.height);
      await commands.writeCardParityArtifacts(
        liveCase.name,
        imageBase64(first.image),
        imageBase64(expected)
      );
      const report = cardParityMetrics(first.image, expected, testCase);
      assertCardParity(report, `live/${liveCase.name}`);
      await first.screen.unmount();
    });
  }

  it("negative controls: a missing word glyph and a shifted live card fail region checks", async () => {
    const testCase = fixture("composer-light");
    const expected = await exportImage(testCase);
    const { image: live, screen } = await screenshotLiveCard(
      testCase,
      expected,
      false
    );
    const host = screen.getByTestId("live-export-card").element();
    await screen.rerender({
      options: {
        ...cardParityExportOptions(testCase, { printMode: false }),
        addWord: false,
      },
    });
    await settleVisibleCard(host);
    const withoutGlyph = await captureLiveElement(host);
    expect(() =>
      assertCardParity(
        cardParityMetrics(live, withoutGlyph, testCase),
        "negative missing word glyph"
      )
    ).toThrow("header");

    await screen.rerender({
      options: cardParityExportOptions(testCase, { printMode: false }),
    });
    await settleVisibleCard(host);
    (host.querySelector(".preview-stack") as HTMLElement).style.transform =
      "translateX(24px)";
    const shifted = await captureLiveElement(host);
    expect(() =>
      assertCardParity(
        cardParityMetrics(live, shifted, testCase),
        "negative shifted live card"
      )
    ).toThrow();
    await screen.unmount();
  });
});

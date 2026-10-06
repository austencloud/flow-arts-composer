import { commands } from "vitest/browser";
import { describe, expect, it } from "vitest";
import { cardParityCases } from "./card-parity-cases";
import {
  cardParityMetrics,
  assertCardParity,
  CARD_PARITY_LIMITS,
  startHandPointPixels,
} from "./card-parity-metrics";
import { renderComposerCard } from "./render-composer-card";

declare const __MCP_PACKED_ROOT__: boolean;

const adapters = [
  "source",
  "packaged",
  ...(__MCP_PACKED_ROOT__ ? ["installed"] : []),
] as const;

async function decodePng(base64: string): Promise<ImageData> {
  const image = new Image();
  image.src = `data:image/png;base64,${base64}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d")!.drawImage(image, 0, 0);
  return canvas
    .getContext("2d")!
    .getImageData(0, 0, canvas.width, canvas.height);
}

async function canvasImage(
  canvas: HTMLCanvasElement | OffscreenCanvas
): Promise<ImageData> {
  if (canvas instanceof HTMLCanvasElement) {
    return canvas
      .getContext("2d")!
      .getImageData(0, 0, canvas.width, canvas.height);
  }
  return (canvas as OffscreenCanvas)
    .getContext("2d")!
    .getImageData(0, 0, canvas.width, canvas.height);
}

describe("Composer ⇄ MCP card PNG parity", () => {
  it.each(["composer-light", "print-footer"])(
    "negative control: removing the hand-color key fails its own region (%s)",
    async (name) => {
      const testCase = cardParityCases().find((entry) => entry.name === name)!;
      const withKey = await canvasImage(await renderComposerCard(testCase));
      const withoutKey = await canvasImage(
        await renderComposerCard(testCase, { hideHandColorKey: true })
      );
      const key = cardParityMetrics(withKey, withoutKey, testCase).find(
        (region) => region.name === "handColorKey"
      )!;
      expect(key.percent).toBeGreaterThan(CARD_PARITY_LIMITS.handColorKey!);
      expect(() => assertCardParity([key], "missing hand-color key")).toThrow(
        "handColorKey"
      );
    }
  );
  it.each(["composer-light", "print-footer", "joined-grids-dark"])(
    "negative control: a grid dot over the Start-cell staffs fails the hand-point regions (%s)",
    async (name) => {
      const testCase = cardParityCases().find((entry) => entry.name === name)!;
      const canvas = await renderComposerCard(testCase);
      const clean = await canvasImage(canvas);
      // Paint the dot the layer compositor once drew over each staff.
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
      ctx.fillStyle = testCase.options.darkMode ? "#ffffff" : "#000000";
      ctx.globalAlpha = testCase.options.darkMode ? 0.85 : 1;
      for (const point of startHandPointPixels(testCase)) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      const dotted = await canvasImage(canvas);
      const regions = cardParityMetrics(dotted, clean, testCase, {
        startHandPoints: true,
      }).filter((region) => region.name.endsWith("HandPoint"));
      expect(regions.map((region) => region.name)).toEqual([
        "leftHandPoint",
        "rightHandPoint",
      ]);
      for (const region of regions)
        expect(region.percent).toBeGreaterThan(
          CARD_PARITY_LIMITS[region.name]!
        );
    }
  );
  for (const testCase of cardParityCases()) {
    it(`${testCase.name}: reports strict per-region parity for both adapters`, async () => {
      const composer = await canvasImage(await renderComposerCard(testCase));
      for (const adapter of adapters) {
        const base64 = await commands.renderMcpCard(
          adapter,
          testCase.sequence,
          testCase.options
        );
        const report = cardParityMetrics(
          composer,
          await decodePng(base64),
          testCase,
          { startHandPoints: true }
        );
        console.info(`${testCase.name}/${adapter}`, report);
        assertCardParity(report, `${testCase.name}/${adapter}`);
      }
    });
  }

  it("negative control: drawing a joined card on one grid fails the body metric", async () => {
    const testCase = cardParityCases().find(
      (entry) => entry.name === "joined-grids"
    )!;
    const joined = await canvasImage(await renderComposerCard(testCase));
    const oneGrid = await canvasImage(
      await renderComposerCard({
        ...testCase,
        options: { ...testCase.options, conjoined: null },
      })
    );
    const body = cardParityMetrics(joined, oneGrid, testCase).find(
      (region) => region.name === "body"
    )!;
    expect(body.percent).toBeGreaterThan(CARD_PARITY_LIMITS.body!);
  });

  it("negative control: removing the badge is visible in the header metric", async () => {
    const testCase = cardParityCases().find(
      (entry) => entry.name === "composer-light"
    )!;
    const withBadge = await canvasImage(await renderComposerCard(testCase));
    const withoutBadge = await canvasImage(
      await renderComposerCard(testCase, { hideBadge: true })
    );
    const header = cardParityMetrics(withBadge, withoutBadge, testCase).find(
      (region) => region.name === "header"
    )!;
    expect(header.percent).toBeGreaterThan(CARD_PARITY_LIMITS.header!);
  });
});

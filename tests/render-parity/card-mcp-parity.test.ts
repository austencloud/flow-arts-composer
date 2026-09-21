import { commands } from "vitest/browser";
import { describe, expect, it } from "vitest";
import { cardParityCases } from "./card-parity-cases";
import {
  cardParityMetrics,
  assertCardParity,
  CARD_PARITY_LIMITS,
} from "./card-parity-metrics";
import { renderComposerCard } from "./render-composer-card";

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
  for (const testCase of cardParityCases()) {
    it(`${testCase.name}: reports strict per-region parity for both adapters`, async () => {
      const composer = await canvasImage(await renderComposerCard(testCase));
      for (const adapter of ["source", "packaged"] as const) {
        const base64 = await commands.renderMcpCard(
          adapter,
          testCase.sequence,
          testCase.options
        );
        const report = cardParityMetrics(
          composer,
          await decodePng(base64),
          testCase
        );
        console.info(`${testCase.name}/${adapter}`, report);
        assertCardParity(report, `${testCase.name}/${adapter}`);
      }
    });
  }

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

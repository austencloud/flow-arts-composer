import { afterEach, describe, expect, it, vi } from "vitest";
import { describeImageSource } from "./describe-image-source";
import { svgStringToImage } from "../services/image-format-converter";
import { SvgImageConverter } from "#lib/shared/foundation/services/svg-image-converter.js";

describe("describeImageSource", () => {
  it("keeps a short URL and truncates a long one", () => {
    expect(describeImageSource("/images/grid/diamond_grid.svg")).toBe(
      "/images/grid/diamond_grid.svg"
    );
    const long = describeImageSource("/x/" + "a".repeat(500));
    expect(long.length).toBeLessThan(130);
    expect(long.endsWith("...")).toBe(true);
  });

  it("never echoes a data: URI body", () => {
    const body = "A".repeat(5000);
    const out = describeImageSource(`data:image/svg+xml;base64,${body}`);
    expect(out).toContain("data:image/svg+xml;base64");
    expect(out).not.toContain(body);
  });

  it("summarises inline SVG markup", () => {
    const out = describeImageSource(
      `<svg viewBox="0 0 9 9">${"<g/>".repeat(900)}</svg>`
    );
    expect(out).toContain("<svg viewBox");
    expect(out.length).toBeLessThan(200);
  });
});

describe("SVG loader rejection messages name the source", () => {
  const OriginalImage = globalThis.Image;

  afterEach(() => {
    globalThis.Image = OriginalImage;
    vi.restoreAllMocks();
  });

  function failingImage() {
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: ((e?: unknown) => void) | null = null;
      width = 0;
      height = 0;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.("boom"));
      }
    }
    globalThis.Image = FailingImage as unknown as typeof Image;
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
  }

  it("svgStringToImage rejects with the markup summary", async () => {
    failingImage();
    await expect(
      svgStringToImage('<svg id="needle-glyph" viewBox="0 0 1 1"></svg>')
    ).rejects.toThrow(/needle-glyph/);
  });

  it("SvgImageConverter rejects with the markup summary and no console.error", async () => {
    failingImage();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      new SvgImageConverter().convertSvgStringToImage(
        '<svg id="needle-converter" viewBox="0 0 1 1"></svg>',
        10,
        10
      )
    ).rejects.toThrow(/needle-converter/);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

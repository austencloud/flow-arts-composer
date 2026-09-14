import { describe, it, expect, vi } from "vitest";
import {
  captureTunnelPoster,
  capturePosterFromContainer,
  compositeContainerLayers,
  POSTER_SIZE,
} from "../tunnel-poster";

function fakeSource(w: number, h: number): HTMLCanvasElement {
  return { width: w, height: h } as HTMLCanvasElement;
}

describe("captureTunnelPoster", () => {
  it("draws the source into a POSTER_SIZE square and returns a webp data URL", () => {
    const drawImage = vi.fn();
    const toDataURL = vi.fn(() => "data:image/webp;base64,AAAA");
    const ctx = {
      drawImage,
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const target = {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toDataURL,
    } as unknown as HTMLCanvasElement;
    const makeCanvas = () => target;

    const url = captureTunnelPoster(fakeSource(800, 800), makeCanvas);

    expect(target.width).toBe(POSTER_SIZE);
    expect(target.height).toBe(POSTER_SIZE);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(toDataURL).toHaveBeenCalledWith("image/webp", expect.any(Number));
    expect(url).toBe("data:image/webp;base64,AAAA");
  });

  it("returns empty string when the source has no dimensions", () => {
    expect(
      captureTunnelPoster(fakeSource(0, 0), () => ({}) as HTMLCanvasElement)
    ).toBe("");
  });
});

function fakeContainer(canvases: HTMLCanvasElement[]): HTMLElement {
  return { querySelectorAll: () => canvases } as unknown as HTMLElement;
}

describe("capturePosterFromContainer", () => {
  it("captures visible viewer layers in paint order while keeping legacy poster order", () => {
    const layers = [0, 3, 1, 4].map((z) => {
      return {
        width: 800,
        height: 800,
        style: { zIndex: String(z), display: "block", visibility: "visible" },
      } as HTMLCanvasElement;
    });
    const container = fakeContainer(layers);
    const computedStyle = vi
      .spyOn(window, "getComputedStyle")
      .mockImplementation((element) => (element as HTMLElement).style);
    layers[3]!.style.display = "none";
    const drawImage = vi.fn();
    const target = {
      getContext: () => ({ drawImage, clearRect: vi.fn() }),
    } as unknown as HTMLCanvasElement;
    compositeContainerLayers(container, 960, () => target, true);
    expect(drawImage.mock.calls.map((call) => call[0])).toEqual([
      layers[0],
      layers[2],
      layers[1],
    ]);
    drawImage.mockClear();
    compositeContainerLayers(container, 200, () => target);
    expect(drawImage.mock.calls.map((call) => call[0])).toEqual(layers);
    computedStyle.mockRestore();
  });
  it("composites every drawable layer into one poster (all layers drawn once)", () => {
    const drawImage = vi.fn();
    const toDataURL = vi.fn(() => "data:image/webp;base64,ZZZZ");
    const ctx = {
      drawImage,
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const target = {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toDataURL,
    } as unknown as HTMLCanvasElement;
    // Props layer + trail layer + a zero-size layer that must be skipped.
    const container = fakeContainer([
      fakeSource(800, 800),
      fakeSource(800, 800),
      fakeSource(0, 0),
    ]);

    const url = capturePosterFromContainer(container, {
      makeCanvas: () => target,
    });

    expect(target.width).toBe(POSTER_SIZE);
    expect(drawImage).toHaveBeenCalledTimes(2); // two drawable layers, the 0×0 skipped
    expect(toDataURL).toHaveBeenCalledWith("image/webp", expect.any(Number));
    expect(url).toBe("data:image/webp;base64,ZZZZ");
  });

  it("returns empty string for a null container or one with no drawable canvas", () => {
    expect(capturePosterFromContainer(null)).toBe("");
    expect(capturePosterFromContainer(fakeContainer([fakeSource(0, 0)]))).toBe(
      ""
    );
  });
});

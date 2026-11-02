// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import {
  refreshInteractiveCanvasFrame,
  registerInteractiveCanvasFrameProvider,
} from "./interactive-canvas-frame";

describe("interactive canvas frame provider", () => {
  it("renders the latest final-frame owner immediately before capture", () => {
    const canvas = {} as HTMLCanvasElement;
    const fallback = vi.fn();
    const composed = vi.fn();
    const disposeFallback = registerInteractiveCanvasFrameProvider(
      canvas,
      fallback
    );
    const disposeComposed = registerInteractiveCanvasFrameProvider(
      canvas,
      composed
    );

    expect(refreshInteractiveCanvasFrame(canvas)).toBe(true);
    expect(composed).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();

    disposeComposed();
    expect(refreshInteractiveCanvasFrame(canvas)).toBe(true);
    expect(fallback).toHaveBeenCalledOnce();

    disposeFallback();
    expect(refreshInteractiveCanvasFrame(canvas)).toBe(false);
  });
});

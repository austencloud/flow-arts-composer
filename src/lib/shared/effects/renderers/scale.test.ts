import { describe, it, expect } from "vitest";
import { computeEffectScale } from "./scale";
import { DEFAULT_CANVAS_SIZE } from "#lib/shared/animation-engine/services/canvas-resizer.svelte.js";

describe("computeEffectScale", () => {
  it("returns 1.0 at the reference dimension (square)", () => {
    expect(computeEffectScale(DEFAULT_CANVAS_SIZE, DEFAULT_CANVAS_SIZE)).toBe(1);
  });

  it("scales by min dimension on landscape canvases", () => {
    expect(computeEffectScale(1000, 500)).toBe(1);
  });

  it("scales by min dimension on portrait canvases", () => {
    expect(computeEffectScale(300, 900)).toBeCloseTo(300 / DEFAULT_CANVAS_SIZE, 5);
  });

  it("returns 0.5 at half the reference dimension", () => {
    expect(computeEffectScale(250, 250)).toBe(0.5);
  });

  it("returns 2.0 at double the reference dimension", () => {
    expect(computeEffectScale(1000, 1000)).toBe(2);
  });

  it("returns 0 for zero dimensions (guards against div-by-zero downstream)", () => {
    expect(computeEffectScale(0, 500)).toBe(0);
    expect(computeEffectScale(500, 0)).toBe(0);
  });
});

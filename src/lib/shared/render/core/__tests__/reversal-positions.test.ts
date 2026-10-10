import { describe, it, expect } from "vitest";
import {
  calculateReversalPositions,
  getReversalColors,
} from "#lib/shared/render/core/calculations/reversal-positions.js";

/**
 * Reversal dots flag which prop reverses direction. The positioning rules:
 * a single reversal sits at the vertical center; when both reverse, RED stacks
 * above BLUE, symmetric about center. These are easy to get subtly wrong
 * (swapped colors, asymmetric spacing) in a way that looks fine at a glance.
 */

const CENTER_Y = 475;

describe("calculateReversalPositions", () => {
  it("returns no dots when neither prop reverses", () => {
    expect(calculateReversalPositions(false, false, false).dots).toEqual([]);
  });

  it("places a single blue reversal at the vertical center", () => {
    const { dots } = calculateReversalPositions(true, false, false);
    expect(dots).toHaveLength(1);
    expect(dots[0]!.cy).toBe(CENTER_Y);
  });

  it("places a single red reversal at the vertical center", () => {
    const { dots } = calculateReversalPositions(false, true, false);
    expect(dots).toHaveLength(1);
    expect(dots[0]!.cy).toBe(CENTER_Y);
  });

  it("uses different colors for blue vs red single reversals", () => {
    const left = calculateReversalPositions(true, false, false).dots[0]!;
    const right = calculateReversalPositions(false, true, false).dots[0]!;
    expect(left.color).not.toBe(right.color);
  });

  describe("both reversals", () => {
    it("stacks two dots symmetric about the vertical center", () => {
      const { dots } = calculateReversalPositions(true, true, false);
      expect(dots).toHaveLength(2);
      const [first, second] = dots;
      // Symmetric about center: the two cy values average to the center.
      expect((first!.cy + second!.cy) / 2).toBeCloseTo(CENTER_Y, 6);
    });

    it("puts RED on top (smaller cy) and BLUE on the bottom", () => {
      const { dots } = calculateReversalPositions(true, true, false);
      const rightSingle = calculateReversalPositions(false, true, false).dots[0]!;
      const leftSingle = calculateReversalPositions(true, false, false).dots[0]!;

      const rightDot = dots.find((d) => d.color === rightSingle.color)!;
      const leftDot = dots.find((d) => d.color === leftSingle.color)!;
      expect(rightDot).toBeDefined();
      expect(leftDot).toBeDefined();
      expect(rightDot.cy).toBeLessThan(leftDot.cy);
    });

    it("shares one X position and one radius across both dots", () => {
      const { dots } = calculateReversalPositions(true, true, false);
      expect(dots[0]!.cx).toBe(dots[1]!.cx);
      expect(dots[0]!.r).toBe(dots[1]!.r);
    });
  });

  it("switches palette between light and dark mode", () => {
    const light = calculateReversalPositions(true, true, false).dots;
    const dark = calculateReversalPositions(true, true, true).dots;
    // Same geometry, different colors.
    expect(light[0]!.cy).toBe(dark[0]!.cy);
    expect(light[0]!.color).not.toBe(dark[0]!.color);
  });
});

describe("getReversalColors", () => {
  it("matches the colors used by the dots", () => {
    const colors = getReversalColors(false);
    const leftDot = calculateReversalPositions(true, false, false).dots[0]!;
    const rightDot = calculateReversalPositions(false, true, false).dots[0]!;
    expect(colors.left).toBe(leftDot.color);
    expect(colors.right).toBe(rightDot.color);
  });

  it("returns different palettes for light and dark", () => {
    expect(getReversalColors(true).left).not.toBe(getReversalColors(false).left);
    expect(getReversalColors(true).right).not.toBe(getReversalColors(false).right);
  });
});

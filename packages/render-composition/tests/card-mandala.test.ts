import { describe, expect, it } from "vitest";
import {
  calculateCardMandalaPaths,
  renderCardMandala,
  type CardMandalaStep,
} from "../src/card-mandala.js";

const STEPS: CardMandalaStep[] = [
  {
    stepNumber: 0,
    leftMotion: {
      motionType: "static",
      rotationDirection: "no_rotation",
      startLocation: "n",
      endLocation: "n",
    },
    rightMotion: {
      motionType: "static",
      rotationDirection: "no_rotation",
      startLocation: "s",
      endLocation: "s",
    },
  },
  {
    stepNumber: 1,
    leftMotion: {
      motionType: "pro",
      rotationDirection: "cw",
      startLocation: "n",
      endLocation: "e",
      startOrientation: "in",
      endOrientation: "in",
    },
    rightMotion: {
      motionType: "anti",
      rotationDirection: "ccw",
      startLocation: "s",
      endLocation: "w",
      startOrientation: "out",
      endOrientation: "out",
    },
  },
];

describe("card mandala geometry", () => {
  it("traces both staff tips for both hands", () => {
    const paths = calculateCardMandalaPaths(STEPS, {
      left: [1],
      right: [1],
    });

    expect(paths.left).toHaveLength(2);
    expect(paths.right).toHaveLength(2);
    for (const path of [...paths.left, ...paths.right]) {
      expect(path).toMatch(/^M -?\d+\.\d{2} -?\d+\.\d{2} C /);
    }
  });

  it("uses the allocated turns that produced the rendered pictographs", () => {
    const halfTurn = calculateCardMandalaPaths(STEPS, {
      left: [0.5],
      right: [0.5],
    });
    const fullTurn = calculateCardMandalaPaths(STEPS, {
      left: [1],
      right: [1],
    });

    expect(halfTurn).not.toEqual(fullTurn);
  });

  it("keeps its local stroke width so canvas scaling matches ImageComposer", () => {
    const widths: number[] = [];
    const context = {
      save: () => undefined,
      restore: () => undefined,
      translate: () => undefined,
      scale: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      bezierCurveTo: () => undefined,
      stroke: () => undefined,
      set lineWidth(value: number) {
        widths.push(value);
      },
      set lineCap(_value: CanvasLineCap) {},
      set globalAlpha(_value: number) {},
      set strokeStyle(_value: string | CanvasGradient | CanvasPattern) {},
    } as unknown as CanvasRenderingContext2D;

    renderCardMandala(
      context,
      calculateCardMandalaPaths(STEPS, { left: [1], right: [1] }),
      { col: 1, row: 1, x: 0, y: 0, cellSize: 120, variant: "full" },
      false
    );

    expect(widths).toContain(3);
    expect(widths).not.toContain(3 / 0.5);
  });
});

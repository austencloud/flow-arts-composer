import { describe, expect, it } from "vitest";
import { buildCapSequence } from "../../src/routes/(public)/notation/caps/_components/yuta-cap-sequence";
import {
  capTraceBox,
  capTraceFit,
  FILL,
} from "../../src/routes/(public)/notation/caps/_components/cap-trace-fit";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  MotionType,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

// The CAPs page plays three settings side by side. A wrong leg would still
// draw a pretty curve, just not the CAP the caption names, so the shape of
// each sequence is pinned here.
describe("buildCapSequence", () => {
  for (const quarters of [1, 2, 3] as const) {
    describe(`reversing after ${quarters} quarter(s)`, () => {
      const seq = buildCapSequence(quarters);
      const red = seq.steps.map((s) => s.motions.right!);

      it("has two steps per quarter", () => {
        expect(seq.steps).toHaveLength(2 * quarters);
      });

      it("keeps the visible club out at every step and hides blue", () => {
        for (const m of red) {
          expect(m.isVisible).toBe(true);
          expect(m.startOrientation).toBe(Orientation.OUT);
          expect(m.endOrientation).toBe(Orientation.OUT);
        }
        for (const s of seq.steps)
          expect(s.motions.left!.isVisible).toBe(false);
      });

      it("starts and ends at East", () => {
        expect(red[0]!.startLocation).toBe(GridLocation.EAST);
        expect(red.at(-1)!.endLocation).toBe(GridLocation.EAST);
      });

      it("goes out as pro 0 turns and comes back as anti 1 turn", () => {
        const out = red.slice(0, quarters);
        const back = red.slice(quarters);
        for (const m of out) {
          expect(m.motionType).toBe(MotionType.PRO);
          expect(m.turns).toBe(0);
        }
        for (const m of back) {
          expect(m.motionType).toBe(MotionType.ANTI);
          expect(m.turns).toBe(1);
        }
        // The return retraces the outward points in reverse.
        expect(back.map((m) => m.startLocation)).toEqual(
          out.map((m) => m.endLocation).reverse()
        );
      });
    });
  }
});

// Each trace is fitted to its frame so the shape, not the hand circle, sits
// in the middle. A wrong box would push a club off the frame edge or leave an
// empty half, and both still render without an error.
describe("capTraceFit", () => {
  // The hand circle's centre sits at the middle of the stage.
  const STAGE = 0.5;
  for (const quarters of [1, 2, 3] as const) {
    it(`centres the ${quarters}-quarter shape and fills the frame`, () => {
      const seq = buildCapSequence(quarters);
      const fit = capTraceFit(seq);
      const box = capTraceBox(seq);
      const unit = 150 / 80 / 950;
      const cx = STAGE + ((box.minX + box.maxX) / 2) * unit;
      const cy = STAGE + ((box.minY + box.maxY) / 2) * unit;
      expect(fit.translateX + fit.scale * cx).toBeCloseTo(0.5, 6);
      expect(fit.translateY + fit.scale * cy).toBeCloseTo(0.5, 6);
      // Every shape is smaller than the unfitted stage shows it, so the
      // stage only ever grows, and never past what keeps a club readable.
      expect(fit.scale).toBeGreaterThan(1);
      expect(fit.scale).toBeLessThan(2.5);
      // The padded box never spills past the frame.
      const side =
        Math.max(box.maxX - box.minX, box.maxY - box.minY) * unit * fit.scale;
      expect(side).toBeLessThanOrEqual(FILL + 1e-9);
    });
  }

  it("scales the quarter up more than the three-quarter", () => {
    expect(capTraceFit(buildCapSequence(1)).scale).toBeGreaterThan(
      capTraceFit(buildCapSequence(3)).scale
    );
  });
});

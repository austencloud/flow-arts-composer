import { describe, expect, it } from "vitest";
import {
  CREDIT_GAP_PX,
  creditGradientLine,
  creditLayout,
  creditOverlaySpec,
} from "./credit.js";

// The credit draws on a canvas, so a wrong fit or a gradient that never
// reaches its second colour shows only as a subtly off end screen.
describe("credit layout", () => {
  const wordmark = { width: 600, ascent: 45, descent: 15 };
  const lead = { width: 150, ascent: 24, descent: 8 };

  it("keeps the old screen's sizes when the box is the old screen's stack", () => {
    const height = 24 + 8 + CREDIT_GAP_PX + 45 + 15;
    const layout = creditLayout(
      { x: 0, y: 0, width: 600, height },
      wordmark,
      lead
    );
    expect(layout.scale).toBeCloseTo(1);
    expect(layout.leadBaseline).toBeCloseTo(24);
    expect(layout.wordmarkBaseline).toBeCloseTo(24 + 8 + CREDIT_GAP_PX + 45);
  });

  it("fits the tighter side and centres the stack both ways", () => {
    const layout = creditLayout(
      { x: 100, y: 200, width: 300, height: 1000 },
      wordmark,
      lead
    );
    expect(layout.scale).toBeCloseTo(0.5);
    expect(layout.wordmarkLeft).toBeCloseTo(100);
    expect(layout.centerX).toBeCloseTo(250);
    const stack = (24 + 8 + CREDIT_GAP_PX + 45 + 15) * 0.5;
    expect(layout.wordmarkTop - (24 + 8 + CREDIT_GAP_PX) * 0.5).toBeCloseTo(
      200 + (1000 - stack) / 2
    );
  });

  it("drops the small line's room when there is none", () => {
    const layout = creditLayout(
      { x: 0, y: 0, width: 600, height: 60 },
      wordmark,
      null
    );
    expect(layout.leadBaseline).toBeNull();
    expect(layout.scale).toBeCloseTo(1);
    expect(layout.wordmarkTop).toBeCloseTo(0);
  });

  it("runs the gradient corner to corner at 135 degrees", () => {
    const layout = creditLayout(
      { x: 0, y: 0, width: 600, height: 60 },
      wordmark,
      null
    );
    const line = creditGradientLine(layout);
    expect(line.x1 - line.x0).toBeCloseTo(line.y1 - line.y0);
    // The far corner projects onto the line's end: share 1 there.
    const dx = line.x1 - line.x0;
    const share = (600 * dx + 60 * dx) / (2 * dx * dx);
    expect(share).toBeCloseTo(1);
  });

  it("caps the small line from the Add menu and the CLI", () => {
    expect(creditOverlaySpec({ lead: "x".repeat(80) }).lead).toHaveLength(40);
    expect(creditOverlaySpec().lead).toBe("made with");
  });
});

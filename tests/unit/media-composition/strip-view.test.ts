import { describe, expect, it } from "vitest";
import { sequenceFrameAt } from "$lib/shared/media-composition/domain/sequence-frame";
import {
  mandalaPrefixFraction,
  resolveStripView,
} from "$lib/shared/media-composition/domain/strip-view";

// Same move-duration shape as sequence-frame.test.ts's DCK: 8 moves, move 3
// takes two beats. Reused here so a frame built from it is known-good.
const DCK = [1, 1, 2, 1, 1, 1, 1, 1];

describe("resolveStripView", () => {
  it("shows arrows for the opening pose under alternate, which has no pass yet to pick a side of", () => {
    const opening = sequenceFrameAt(0, DCK);
    expect(resolveStripView("arrows", opening)).toBe("arrows");
    expect(resolveStripView("alternate", opening)).toBe("arrows");
    // A fixed mode has no pass-parity decision to make, so it stays fixed -
    // a mandala-only strip draws its (empty) traced path from the first frame.
    expect(resolveStripView("mandala", opening)).toBe("mandala");
  });

  it("keeps a fixed mode fixed across passes", () => {
    const pass0 = sequenceFrameAt(2.5, DCK);
    const pass1 = sequenceFrameAt(9.5, DCK);
    expect(resolveStripView("arrows", pass0)).toBe("arrows");
    expect(resolveStripView("arrows", pass1)).toBe("arrows");
    expect(resolveStripView("mandala", pass0)).toBe("mandala");
    expect(resolveStripView("mandala", pass1)).toBe("mandala");
  });

  it("alternates arrows/mandala by pass, arrows first", () => {
    // arrival 2.5 -> absoluteMove 3, pass 0 (0..7 land in pass 0).
    const pass0 = sequenceFrameAt(2.5, DCK);
    expect(pass0.pass).toBe(0);
    expect(resolveStripView("alternate", pass0)).toBe("arrows");

    // arrival 9.5 -> absoluteMove 10, pass 1 (8..15 land in pass 1).
    const pass1 = sequenceFrameAt(9.5, DCK);
    expect(pass1.pass).toBe(1);
    expect(resolveStripView("alternate", pass1)).toBe("mandala");

    // arrival 17.5 -> absoluteMove 18, pass 2, back to arrows.
    const pass2 = sequenceFrameAt(17.5, DCK);
    expect(pass2.pass).toBe(2);
    expect(resolveStripView("alternate", pass2)).toBe("arrows");
  });
});

describe("mandalaPrefixFraction", () => {
  // Move 3 carries double weight, mirroring how a two-turn move samples twice
  // as densely as a one-turn move in the real geometry.
  const sampleCounts = [64, 64, 128, 64, 64, 64, 64, 64];
  const total = sampleCounts.reduce((sum, count) => sum + count, 0);

  it("shows nothing before the performer has moved", () => {
    expect(mandalaPrefixFraction(sampleCounts, sequenceFrameAt(0, DCK))).toBe(
      0
    );
  });

  it("holds the path walked so far once the performer holds the last pose", () => {
    const holding = sequenceFrameAt(1, DCK, { endArrival: 1 });
    expect(holding.phase).toBe("holding");
    // A take that stops after move 1 has walked move 1's share, not the pass.
    expect(mandalaPrefixFraction(sampleCounts, holding)).toBeCloseTo(
      64 / total,
      10
    );
  });

  it("holds a partial last pass at the move it stopped on", () => {
    // Twelve moves of an eight-move sequence: the hold is move 4 of pass 2.
    const holding = sequenceFrameAt(12, DCK, { endArrival: 12 });
    expect(holding).toMatchObject({ phase: "holding", move: 4 });
    expect(mandalaPrefixFraction(sampleCounts, holding)).toBeCloseTo(
      (64 + 64 + 128 + 64) / total,
      10
    );
  });

  it("lands on the whole pass exactly at the last move's landing", () => {
    const landing = sequenceFrameAt(8, DCK);
    expect(landing).toMatchObject({ move: 8, moveProgress: 1 });
    expect(mandalaPrefixFraction(sampleCounts, landing)).toBeCloseTo(1, 10);
  });

  it("cuts inside move 3's own sample range mid-move, weighted by its samples", () => {
    const before = mandalaPrefixFraction(sampleCounts, {
      phase: "moving",
      move: 3,
      moveProgress: 0,
    });
    const mid = mandalaPrefixFraction(sampleCounts, {
      phase: "moving",
      move: 3,
      moveProgress: 0.5,
    });
    const after = mandalaPrefixFraction(sampleCounts, {
      phase: "moving",
      move: 3,
      moveProgress: 1,
    });
    // before = (64+64)/total, after = (64+64+128)/total.
    expect(before).toBeCloseTo(128 / total, 10);
    expect(after).toBeCloseTo(256 / total, 10);
    expect(mid).toBeGreaterThan(before);
    expect(mid).toBeLessThan(after);
    expect(mid).toBeCloseTo((128 + 64) / total, 10);

    // The point of weighting by sample count rather than by move count: move
    // 3 samples twice as densely, so at its midpoint the prefix should read
    // higher than the naive "2.5 of 8 moves done" linear fraction would.
    const linearFraction = (2 + 0.5) / 8;
    expect(mid).toBeGreaterThan(linearFraction);
  });

  it("treats a hand with no sampled motion at a move as contributing nothing", () => {
    const noContribution = [64, 64, 0, 64, 64, 64, 64, 64];
    const total2 = noContribution.reduce((sum, count) => sum + count, 0);
    const atZeroMove = mandalaPrefixFraction(noContribution, {
      phase: "moving",
      move: 3,
      moveProgress: 0.5,
    });
    // Move 3 contributes nothing however far through it progress reads, so
    // the prefix sits flat at the sum of the earlier moves.
    expect(atZeroMove).toBeCloseTo(128 / total2, 10);
  });
});

import { describe, expect, it } from "vitest";
// The corpus is served from `static/` rather than bundled — see curated-seeds.ts.
// The setup file's fetch shim resolves this same path off disk at runtime.
import curatedSeedsJson from "../../../../../../static/data/loop-explorer/curated-seeds.json";
import teaserSeedJson from "../notation-loop-teaser-seed.json";
import { getCuratedSeed } from "../curated-seeds";
import { NOTATION_LOOP_TEASER_SEQUENCE } from "../notation-loop-teaser";
import { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import { FrameBuilder } from "$lib/shared/animation-engine/services/frame-builder";
import type { LoopSlice } from "../legality";

const sequences = await Promise.all(
  Object.entries(curatedSeedsJson)
    .flatMap(([loopType, bySlice]) =>
      Object.entries(bySlice).map(([slice, pool]) =>
        (pool as unknown[]).map((_entry: unknown, index: number) =>
          getCuratedSeed(loopType as LOOPType, slice as LoopSlice, index)
        )
      )
    )
    .flat(2)
);

describe("curated LOOP seed hydration", () => {
  it("hydrates the complete wire corpus into canonical motion-bearing sequences", () => {
    expect(sequences.every(Boolean)).toBe(true);
    const hydrated = sequences.filter((sequence) => sequence !== null);
    expect(new Set(hydrated.map((sequence) => sequence.id)).size).toBe(
      hydrated.length
    );

    for (const sequence of hydrated) {
      expect(sequence.startPlacement).toEqual(
        expect.objectContaining({
          isStartPlacement: true,
          motions: expect.objectContaining({
            left: expect.any(Object),
            right: expect.any(Object),
          }),
        })
      );
      expect(sequence.steps.length).toBeGreaterThan(0);

      for (const step of sequence.steps) {
        expect(step.startPlacement).not.toBeNull();
        expect(step.endPlacement).not.toBeNull();
        expect(step.motions.left.hand).toBe("left");
        expect(step.motions.right.hand).toBe("right");
        expect(step.motions.left.isVisible).toBe(true);
        expect(step.motions.right.isVisible).toBe(true);
      }
    }
  });

  it("returns one stable editorial seed without hydrating it as a string start pose", async () => {
    const first = await getCuratedSeed(LOOPType.ROTATED, "quartered");
    const again = await getCuratedSeed(LOOPType.ROTATED, "quartered");

    expect(first).toBe(again);
    expect(first?.startPlacement).not.toBe("gamma3");
    expect(typeof first?.startPlacement).toBe("object");
    expect(first?.steps[0]?.motions.left).toEqual(
      expect.objectContaining({ motionType: expect.any(String) })
    );
  });

  it("keeps the lightweight notation fixture locked to the verified corpus", async () => {
    expect(teaserSeedJson).toEqual(curatedSeedsJson.rotated.quartered[0]);
    expect(NOTATION_LOOP_TEASER_SEQUENCE).toEqual(
      await getCuratedSeed(LOOPType.ROTATED, "quartered")
    );
  });
});

describe("FrameBuilder runtime boundary", () => {
  it("falls back safely when untrusted data supplies a string step pose", () => {
    const builder = new FrameBuilder();

    expect(builder.calculateTurnsTuple("gamma3" as never, null)).toBe(
      "(s, 0, 0)"
    );
  });
});

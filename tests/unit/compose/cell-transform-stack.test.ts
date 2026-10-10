/**
 * CellTransformStack Tests
 *
 * Verifies that the transform stack correctly replays transforms in order,
 * returns the original sequence when the stack is empty, and that push/pop
 * operations work as expected.
 */

import { describe, it, expect, vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { AppliedTransform } from "#lib/features/compose/compose/domain/types";

vi.mock(
  "#lib/features/compose/tabs/arrange/services/arrange-layer-transformer.js",
  () => ({
    applyTransform: vi.fn(async (seq: SequenceData, type: string) => ({
      success: true,
      transformed: { ...seq, name: `${seq.name}+${type}` } as SequenceData,
    })),
  })
);

import {
  computeEffective,
  push,
  pop,
  clear,
} from "#lib/features/compose/tabs/arrange/services/cell-transform-stack.js";
import { applyTransform } from "#lib/features/compose/tabs/arrange/services/arrange-layer-transformer.js";

const mockedApplyTransform = vi.mocked(applyTransform);

function makeSequence(name: string): SequenceData {
  return {
    id: `seq-${name}`,
    name,
    word: name,
    steps: [],
    thumbnails: [],
  } as unknown as SequenceData;
}

describe("CellTransformStack", () => {
  describe("computeEffective", () => {
    it("returns original sequence when stack is empty", async () => {
      const original = makeSequence("ABC");

      const result = await computeEffective(original, []);

      expect(result).toBe(original);
      expect(mockedApplyTransform).not.toHaveBeenCalled();
    });

    it("replays a single transform", async () => {
      mockedApplyTransform.mockClear();
      const original = makeSequence("ABC");
      const transforms: AppliedTransform[] = [
        { type: "rotate90", hand: "both", timestamp: 1 },
      ];

      const result = await computeEffective(original, transforms);

      expect(result.name).toBe("ABC+rotate90");
      expect(mockedApplyTransform).toHaveBeenCalledTimes(1);
    });

    it("replays transforms in order", async () => {
      mockedApplyTransform.mockClear();
      const original = makeSequence("ABC");
      const transforms: AppliedTransform[] = [
        { type: "rotate90", hand: "both", timestamp: 1 },
        { type: "mirror", hand: "both", timestamp: 2 },
        { type: "swapHands", hand: "both", timestamp: 3 },
      ];

      const result = await computeEffective(original, transforms);

      // Each transform appends "+type" to the name, so the final name
      // shows the full chain: ABC -> ABC+rotate90 -> ABC+rotate90+mirror -> ...
      expect(result.name).toBe("ABC+rotate90+mirror+swapHands");
      expect(mockedApplyTransform).toHaveBeenCalledTimes(3);
    });

    it("skips failed transforms and continues with the last good state", async () => {
      mockedApplyTransform
        .mockClear()
        .mockResolvedValueOnce({
          success: true,
          transformed: { ...makeSequence("ABC"), name: "ABC+rotate90" },
        })
        .mockResolvedValueOnce({ success: false, error: "failed" } as any)
        .mockResolvedValueOnce({
          success: true,
          transformed: {
            ...makeSequence("ABC"),
            name: "ABC+rotate90+swapHands",
          },
        });

      const original = makeSequence("ABC");
      const transforms: AppliedTransform[] = [
        { type: "rotate90", hand: "both", timestamp: 1 },
        { type: "mirror", hand: "both", timestamp: 2 },
        { type: "swapHands", hand: "both", timestamp: 3 },
      ];

      const result = await computeEffective(original, transforms);

      // Mirror failed, so swapHands was applied to the rotate90 result
      expect(result.name).toBe("ABC+rotate90+swapHands");
    });
  });

  describe("push", () => {
    it("adds a transform to an empty stack", () => {
      const result = push([], "rotate90", "both");

      expect(result).toHaveLength(1);
      expect(result[0]!.type).toBe("rotate90");
      expect(result[0]!.hand).toBe("both");
      expect(result[0]!.timestamp).toBeGreaterThan(0);
    });

    it("appends to existing stack without mutating it", () => {
      const existing: AppliedTransform[] = [
        { type: "mirror", hand: "both", timestamp: 1 },
      ];
      const result = push(existing, "rotate90", "left");

      expect(result).toHaveLength(2);
      expect(existing).toHaveLength(1); // original not mutated
      expect(result[1]!.type).toBe("rotate90");
      expect(result[1]!.hand).toBe("left");
    });
  });

  describe("pop", () => {
    it("removes the last transform", () => {
      const existing: AppliedTransform[] = [
        { type: "mirror", hand: "both", timestamp: 1 },
        { type: "rotate90", hand: "both", timestamp: 2 },
      ];
      const result = pop(existing);

      expect(result).toHaveLength(1);
      expect(result[0]!.type).toBe("mirror");
      expect(existing).toHaveLength(2); // original not mutated
    });

    it("returns empty array when popping from single-item stack", () => {
      const existing: AppliedTransform[] = [
        { type: "mirror", hand: "both", timestamp: 1 },
      ];
      const result = pop(existing);

      expect(result).toHaveLength(0);
    });

    it("returns empty array when popping from empty stack", () => {
      const result = pop([]);

      expect(result).toHaveLength(0);
    });
  });

  describe("clear", () => {
    it("returns an empty array", () => {
      const result = clear();

      expect(result).toEqual([]);
    });
  });
});

// A link to a mandala that only the full pool holds must not bounce to the
// wall while an early stage of the pool is showing. Only a value no final
// family holds goes back.
import { describe, expect, it } from "vitest";
import { resolveMandalaPlace } from "./mandala-place-resolve";
import type { MandalaClimbFamily } from "#lib/shared/browse/services/mandala-climb.svelte.js";
import type { MandalaGroup } from "#lib/shared/browse/services/mandala-index.svelte.js";

function group(key: string, count: number): MandalaGroup {
  return {
    key,
    sequences: Array.from({ length: count }, (_, i) => ({ id: `${key}-s${i}` })),
  } as unknown as MandalaGroup;
}

function family(key: string, count: number): MandalaClimbFamily {
  const g = group(key, count);
  return { id: key, value: `${key}~${key}-s0`, representative: g, members: [g], sequenceCount: count };
}

const early = [family("aaa", 2), family("bbb", 5)];
const full = [...early, family("late", 16)];
const lateValue = "late~late-s0";

function resolve(value: string | null, settled: boolean, families: MandalaClimbFamily[], groups: MandalaGroup[]) {
  return resolveMandalaPlace({
    value,
    settled,
    families,
    familyOf: (v) => families.find((f) => f.value === v),
    groupOf: (k) => groups.find((g) => g.key === k),
  });
}

describe("resolveMandalaPlace", () => {
  it("waits, without going back, while the early stage lacks the shape", () => {
    const view = resolve(lateValue, false, early, []);
    expect(view).toEqual({ family: null, familyIndex: -1, backToWall: false });
  });

  it("shows the shape at once from the index before families are final", () => {
    const view = resolve(lateValue, false, early, [group("late", 16)]);
    expect(view.backToWall).toBe(false);
    expect(view.familyIndex).toBe(-1);
    expect(view.family?.id).toBe("late");
    expect(view.family?.value).toBe(lateValue);
  });

  it("lands on the final family once the full pool has settled", () => {
    const view = resolve(lateValue, true, full, [group("late", 16)]);
    expect(view.backToWall).toBe(false);
    expect(view.familyIndex).toBe(2);
    expect(view.family).toBe(full[2]);
    expect(view.family?.sequenceCount).toBe(16);
  });

  it("goes back to the wall only when settled families do not hold the value", () => {
    expect(resolve("nope~nope", false, early, []).backToWall).toBe(false);
    expect(resolve("nope~nope", true, full, []).backToWall).toBe(true);
  });

  it("asks for nothing without a value", () => {
    expect(resolve(null, true, full, [])).toEqual({ family: null, familyIndex: -1, backToWall: false });
  });
});

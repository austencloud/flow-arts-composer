import { describe, expect, it } from "vitest";
import { createFuseRule } from "$lib/features/fuse/domain/fuse-rule";
import {
  resolveFuseRule,
  type FuseTnDSelection,
} from "$lib/features/fuse/domain/fuse-tnd-rule";

function selection(partial: Partial<FuseTnDSelection>): FuseTnDSelection {
  return {
    mode: "TS",
    quarterOffset: "cw",
    invert: false,
    rewind: false,
    ...partial,
  };
}

describe("resolveFuseRule", () => {
  it.each([
    ["TS", "cw", createFuseRule({ rotationSteps: 0, reflect: "none" })],
    ["SS", "cw", createFuseRule({ rotationSteps: 4, reflect: "none" })],
    ["QS", "cw", createFuseRule({ rotationSteps: 2, reflect: "none" })],
    ["QS", "ccw", createFuseRule({ rotationSteps: 6, reflect: "none" })],
    ["TO", "cw", createFuseRule({ rotationSteps: 0, reflect: "mirror" })],
    ["SO", "cw", createFuseRule({ rotationSteps: 4, reflect: "flip" })],
    ["QO", "cw", createFuseRule({ rotationSteps: 2, reflect: "mirror" })],
    ["QO", "ccw", createFuseRule({ rotationSteps: 6, reflect: "mirror" })],
  ] as const)("%s %s resolves to its rule", (mode, quarterOffset, expected) => {
    expect(resolveFuseRule(selection({ mode, quarterOffset }))).toEqual(expected);
  });

  it("ignores the offset on non-quarter modes", () => {
    expect(resolveFuseRule(selection({ mode: "SS", quarterOffset: "ccw" }))).toEqual(
      resolveFuseRule(selection({ mode: "SS", quarterOffset: "cw" }))
    );
  });

  it("passes invert and rewind through", () => {
    expect(
      resolveFuseRule(selection({ mode: "TO", invert: true, rewind: true }))
    ).toEqual(createFuseRule({ reflect: "mirror", invert: true, rewind: true }));
  });
});

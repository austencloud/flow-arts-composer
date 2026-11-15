import { afterEach, describe, expect, it } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { createViewerPropHandHarness } from "./viewer-prop-hand-harness.svelte";

const disposals: Array<() => void> = [];

function harness(
  overrides: Partial<{
    leftPropType: PropType;
    rightPropType: PropType;
    catDogMode: boolean;
  }> = {}
) {
  const h = createViewerPropHandHarness({
    leftPropType: PropType.STAFF,
    rightPropType: PropType.STAFF,
    catDogMode: false,
    ...overrides,
  });
  disposals.push(h.dispose);
  return h;
}

afterEach(() => {
  while (disposals.length) disposals.pop()!();
});

describe("viewer prop picking by hand", () => {
  it("a single-grid pick sets both hands and leaves cat/dog off", () => {
    const h = harness({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.CLUB,
      catDogMode: true,
    });
    h.state.handlePropTypeChange(PropType.FAN);
    h.flush();
    expect(h.settings).toMatchObject({
      leftPropType: PropType.FAN,
      rightPropType: PropType.FAN,
      catDogMode: false,
      propViewingMode: "my-props",
    });
    expect(h.urlParams).toEqual([
      ["bp", "enc:fan"],
      ["rp", "enc:fan"],
    ]);
  });

  it("opens on Both", () => {
    const h = harness();
    expect(h.state.propHand).toBe("both");
  });

  it("a left pick changes the left hand only and the flag follows", () => {
    const h = harness();
    h.state.setPropHand("left");
    h.state.handlePropTypeChange(PropType.FAN, "left");
    h.flush();
    expect(h.settings).toMatchObject({
      leftPropType: PropType.FAN,
      rightPropType: PropType.STAFF,
      catDogMode: true,
    });
    expect(h.state.propHand).toBe("left");
    expect(h.urlParams).toEqual([["bp", "enc:fan"]]);
    expect(h.animationPairs.at(-1)).toEqual([PropType.FAN, PropType.STAFF]);
  });

  it("a right pick keeps the left prop and stays on the right hand", () => {
    const h = harness({ leftPropType: PropType.FAN, catDogMode: true });
    h.state.setPropHand("right");
    h.state.handlePropTypeChange(PropType.CLUB, "right");
    h.flush();
    expect(h.settings).toMatchObject({
      leftPropType: PropType.FAN,
      rightPropType: PropType.CLUB,
      catDogMode: true,
    });
    expect(h.state.propHand).toBe("right");
    expect(h.urlParams).toEqual([["rp", "enc:club"]]);
  });

  it("a single-hand pick that makes the hands match turns the flag off", () => {
    const h = harness({
      leftPropType: PropType.FAN,
      rightPropType: PropType.CLUB,
      catDogMode: true,
    });
    h.state.setPropHand("right");
    h.state.handlePropTypeChange(PropType.FAN, "right");
    h.flush();
    expect(h.settings).toMatchObject({
      leftPropType: PropType.FAN,
      rightPropType: PropType.FAN,
      catDogMode: false,
    });
    expect(h.animationPairs.at(-1)).toEqual([PropType.FAN, PropType.FAN]);
  });
});

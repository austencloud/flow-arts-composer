import { afterEach, describe, expect, it } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
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

  it("a left pick keeps the right prop and moves on to the right hand", () => {
    const h = harness({ catDogMode: true });
    expect(h.state.propHand).toBe("left");
    h.state.handlePropTypeChange(PropType.FAN, "left");
    h.flush();
    expect(h.settings).toMatchObject({
      leftPropType: PropType.FAN,
      rightPropType: PropType.STAFF,
      catDogMode: true,
    });
    expect(h.state.propHand).toBe("right");
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

  it("turning cat/dog on keeps the pair and starts from the left hand", () => {
    const h = harness();
    h.state.setPropHand("right");
    h.state.handleCatDogToggle();
    h.flush();
    expect(h.settings).toMatchObject({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
      catDogMode: true,
      propViewingMode: "my-props",
    });
    expect(h.state.activeCatDog).toBe(true);
    expect(h.state.propHand).toBe("left");
    expect(h.urlParams).toEqual([]);
  });

  it("turning cat/dog off folds the right hand onto the left prop", () => {
    const h = harness({
      leftPropType: PropType.FAN,
      rightPropType: PropType.CLUB,
      catDogMode: true,
    });
    h.state.handleCatDogToggle();
    h.flush();
    expect(h.settings).toMatchObject({
      leftPropType: PropType.FAN,
      rightPropType: PropType.FAN,
      catDogMode: false,
    });
    expect(h.state.activeCatDog).toBe(false);
    expect(h.urlParams).toEqual([["rp", "enc:fan"]]);
    expect(h.animationPairs.at(-1)).toEqual([PropType.FAN, PropType.FAN]);
  });
});

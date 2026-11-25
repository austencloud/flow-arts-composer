import { describe, expect, it } from "vitest";
import { FUSE_RECIPE_GROUPS } from "#lib/features/fuse/domain/fuse-recipe-destination.js";
import {
  resolveFuseRecipeForm,
  resolveFuseRecipeTabs,
} from "#lib/features/fuse/services/fuse-recipe-form-fit.js";

// The room the panel gives the form, measured in the app at each size.
function whole(width: number, height: number, phone = false) {
  return resolveFuseRecipeForm({
    width,
    height,
    groups: FUSE_RECIPE_GROUPS,
    phone,
  });
}

describe("Fuse settings form fit", () => {
  it("lists every setting in the desktop column", () => {
    expect(whole(364, 614)).toMatchObject({
      arrangement: "beside",
      lengthAbove: true,
      sideBySide: false,
    });
    expect(whole(425, 783)).toMatchObject({
      arrangement: "beside",
      headings: true,
      lengthAbove: false,
    });
  });

  it("explains each choice where the rows are tall enough", () => {
    expect(whole(584, 1135)).toMatchObject({
      arrangement: "beside",
      hints: true,
    });
    expect(whole(584, 1783)).toMatchObject({
      arrangement: "above",
      hints: true,
    });
  });

  it("stands the settings side by side on the open Fold", () => {
    expect(whole(673, 459)).toMatchObject({
      arrangement: "above",
      headings: true,
      sideBySide: true,
    });
  });

  it("lists every setting on a tall phone and opens groups on a short one", () => {
    expect(whole(378, 580, true)).toMatchObject({
      arrangement: "beside",
      sideBySide: false,
    });
    expect(whole(341, 370, true)).toBeNull();
    expect(whole(326, 305, true)).toBeNull();
    expect(whole(447, 278, true)).toBeNull();
  });

  it("turns the groups into tabs in a short desktop column, never on a phone", () => {
    const short = { width: 364, height: 490, groups: FUSE_RECIPE_GROUPS };
    expect(whole(364, 490)).toBeNull();
    const tabs = resolveFuseRecipeTabs({ ...short, phone: false });
    expect(tabs && Object.keys(tabs)).toEqual([...FUSE_RECIPE_GROUPS]);
    expect(resolveFuseRecipeTabs({ ...short, phone: true })).toBeNull();
    expect(
      resolveFuseRecipeTabs({ ...short, height: 200, phone: false })
    ).toBeNull();
  });

  // Length's seven choices are the widest row. A layout that puts its name
  // beside them must leave each one its tap size.
  it("never squeezes Length below the tap size", () => {
    for (const phone of [false, true]) {
      const lengthWidth = 7 * (phone ? 36 : 44) + 6 * 2 + 8;
      for (let width = 300; width <= 900; width += 7) {
        for (let height = 100; height <= 1800; height += 41) {
          for (const groups of [FUSE_RECIPE_GROUPS, ["path"] as const]) {
            const layout = resolveFuseRecipeForm({
              width,
              height,
              groups,
              phone,
            });
            if (!layout) continue;
            const room = layout.sideBySide
              ? (width - 16) / 2
              : layout.lengthAbove || layout.arrangement === "above"
                ? width
                : width >= 576
                  ? 336
                  : width - 88;
            if (width >= lengthWidth) {
              expect(room).toBeGreaterThanOrEqual(lengthWidth);
            }
          }
        }
      }
    }
  });
});

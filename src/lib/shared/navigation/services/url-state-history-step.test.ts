import { describe, expect, it } from "vitest";
import { isInModuleHistoryStep } from "./url-state";

const end = (path: string, id = "/[...appPath]") => ({
  url: new URL(path, "https://tka.test"),
  route: { id },
});

// Browse moves its own screens on Back; a page-wide fade on top of that
// replayed the list a second time once the route settled.
describe("isInModuleHistoryStep", () => {
  it("Back from a collection to its list inside Browse is Browse's own step", () => {
    expect(
      isInModuleHistoryStep(
        {
          type: "popstate",
          from: end("/browse/explore/collections/owner-1/col-1"),
          to: end("/browse/explore/collections"),
        },
        ["browse"]
      )
    ).toBe(true);
  });

  it("leaves other modules, other routes and clicked links to the page motion", () => {
    expect(
      isInModuleHistoryStep(
        {
          type: "popstate",
          from: end("/browse/explore/collections"),
          to: end("/create/construct"),
        },
        ["browse"]
      )
    ).toBe(false);
    expect(
      isInModuleHistoryStep(
        {
          type: "popstate",
          from: end("/learn/grid"),
          to: end("/learn"),
        },
        ["browse"]
      )
    ).toBe(false);
    expect(
      isInModuleHistoryStep(
        {
          type: "popstate",
          from: end("/browse/explore/collections"),
          to: end("/browse", "/browse"),
        },
        ["browse"]
      )
    ).toBe(false);
    expect(
      isInModuleHistoryStep(
        {
          type: "link",
          from: end("/browse/explore/collections/owner-1/col-1"),
          to: end("/browse/explore/collections"),
        },
        ["browse"]
      )
    ).toBe(false);
  });
});

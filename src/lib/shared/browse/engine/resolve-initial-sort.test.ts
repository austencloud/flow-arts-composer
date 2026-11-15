import { describe, expect, it } from "vitest";
import { BrowseSortMethod as Sort } from "#lib/shared/browse/domain/enums/browse-enums.js";
import { resolveInitialSort } from "./resolve-initial-sort";

const host = { sort: Sort.TODAYS_MIX };

describe("resolveInitialSort", () => {
  it("opens a first-time visitor on the host's default", () => {
    expect(resolveInitialSort(null, host)).toEqual({
      method: Sort.TODAYS_MIX,
      direction: "asc",
      chosen: false,
    });
  });

  it("falls back to A to Z when the host names nothing", () => {
    expect(resolveInitialSort(null, {}).method).toBe(Sort.ALPHABETICAL);
  });

  it("keeps an order the visitor chose, even A to Z ascending", () => {
    const picked = resolveInitialSort(
      { sortMethod: Sort.ALPHABETICAL, sortDirection: "asc", sortChosen: true },
      host
    );
    expect(picked).toEqual({
      method: Sort.ALPHABETICAL,
      direction: "asc",
      chosen: true,
    });
  });

  it("treats an old saved A to Z ascending as never chosen", () => {
    expect(
      resolveInitialSort(
        { sortMethod: Sort.ALPHABETICAL, sortDirection: "asc" },
        host
      ).method
    ).toBe(Sort.TODAYS_MIX);
  });

  it("keeps any other old saved order", () => {
    const old = resolveInitialSort(
      { sortMethod: Sort.DATE_ADDED, sortDirection: "desc" },
      host
    );
    expect(old.method).toBe(Sort.DATE_ADDED);
    expect(old.direction).toBe("desc");
  });

  it("keeps the mix the engine itself saved without a choice", () => {
    expect(
      resolveInitialSort(
        { sortMethod: Sort.TODAYS_MIX, sortDirection: "asc", sortChosen: false },
        { sort: Sort.DATE_ADDED }
      ).method
    ).toBe(Sort.TODAYS_MIX);
  });
});

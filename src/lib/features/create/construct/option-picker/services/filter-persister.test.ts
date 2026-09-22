import { describe, expect, it, beforeEach } from "vitest";
import { FilterPersister } from "./filter-persister";

const STORAGE_KEY = "tka-option-picker-filters";

describe("FilterPersister legacy key compatibility", () => {
  let persister: FilterPersister;

  beforeEach(() => {
    localStorage.clear();
    persister = new FilterPersister();
  });

  it("honors the pre-rename endPositionFilter when endPlacementFilter is absent", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sortMethod: "type",
        typeFilter: "type1",
        endPositionFilter: { alpha: true },
        reversalFilter: { continuous: true },
      })
    );

    const loaded = persister.loadFilters();

    expect(loaded?.endPlacementFilter).toEqual({ alpha: true });
  });

  it("prefers endPlacementFilter when both spellings are present", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sortMethod: "type",
        typeFilter: "type1",
        endPositionFilter: { alpha: true },
        endPlacementFilter: { beta: true },
        reversalFilter: {},
      })
    );

    const loaded = persister.loadFilters();

    expect(loaded?.endPlacementFilter).toEqual({ beta: true });
  });

  it("defaults endPlacementFilter to {} when neither spelling is present", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sortMethod: "type",
        typeFilter: "type1",
        reversalFilter: {},
      })
    );

    const loaded = persister.loadFilters();

    expect(loaded?.endPlacementFilter).toEqual({});
  });

  it("migrates the pre-rename 'endPosition' sortMethod value to 'endPlacement'", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sortMethod: "endPosition",
        typeFilter: "type1",
        endPlacementFilter: {},
        reversalFilter: {},
      })
    );

    const loaded = persister.loadFilters();

    expect(loaded?.sortMethod).toBe("endPlacement");
  });

  it("leaves a current sortMethod value untouched", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sortMethod: "reversals",
        typeFilter: "type1",
        endPlacementFilter: {},
        reversalFilter: {},
      })
    );

    const loaded = persister.loadFilters();

    expect(loaded?.sortMethod).toBe("reversals");
  });

  it("never writes the legacy endPositionFilter key back to storage", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sortMethod: "type",
        typeFilter: "type1",
        endPositionFilter: { alpha: true },
        reversalFilter: {},
      })
    );
    const loaded = persister.loadFilters();
    persister.saveFilters(
      loaded!.sortMethod,
      loaded!.typeFilter,
      loaded!.endPlacementFilter,
      loaded!.reversalFilter,
      loaded!.isContinuousOnly
    );

    const written = JSON.parse(
      localStorage.getItem(STORAGE_KEY) as string
    ) as Record<string, unknown>;
    expect(written).not.toHaveProperty("endPositionFilter");
    expect(written.endPlacementFilter).toEqual({ alpha: true });
  });
});

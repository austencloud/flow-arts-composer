import { describe, expect, it } from "vitest";
import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
import {
  legacyAliasesFor,
  resolvePersistedFilterType,
} from "../legacy-filter-type-aliases";

describe("resolvePersistedFilterType", () => {
  it("resolves the pre-rename startPosition/endPosition strings to their current values", () => {
    expect(resolvePersistedFilterType("startPosition")).toBe(
      BrowseFilterType.STARTING_PLACEMENT
    );
    expect(resolvePersistedFilterType("endPosition")).toBe(
      BrowseFilterType.END_PLACEMENT
    );
  });

  it("passes a current type value through untouched", () => {
    expect(resolvePersistedFilterType(BrowseFilterType.DIFFICULTY)).toBe(
      BrowseFilterType.DIFFICULTY
    );
  });

  it("returns null for a type that no longer exists", () => {
    expect(resolvePersistedFilterType("retired_filter_type")).toBeNull();
  });
});

describe("legacyAliasesFor", () => {
  it("returns the old stored strings that resolve to a current type", () => {
    expect(legacyAliasesFor(BrowseFilterType.STARTING_PLACEMENT)).toEqual([
      "startPosition",
    ]);
    expect(legacyAliasesFor(BrowseFilterType.END_PLACEMENT)).toEqual([
      "endPosition",
    ]);
  });

  it("returns an empty list for a type with no legacy alias", () => {
    expect(legacyAliasesFor(BrowseFilterType.DIFFICULTY)).toEqual([]);
  });
});
